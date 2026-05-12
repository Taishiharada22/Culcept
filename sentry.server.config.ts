import * as Sentry from "@sentry/nextjs";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OP-5.5 prereq-4 v4: Production canary 安全運用のための server-side Sentry 強化
// (CEO 2026-05-12 設計判断 + GPT 5 補正 + CEO 3 補正)
//
// 設計の核:
//   - Option D: server-only DSN 分離 (= SENTRY_DSN 優先 + NEXT_PUBLIC_SENTRY_DSN
//     fallback、 既存 Preview 後方互換)
//   - SERVER_EVENT_SCOPE env gate: production canary では OP-5 event 限定送信、
//     非 OP-5 event は drop (= 既存 production で server-side Sentry 全体を
//     新規有効化しない)
//   - beforeBreadcrumb: console / coalter.* / external sensitive host を drop、
//     fetch/http/xhr の query を redact
//   - beforeSend OP-5 event allowlist strip: breadcrumbs / extra / user / exception
//     全削除、 request は pathname + method のみ、 contexts は system のみ、
//     tags は op5_* + release + environment のみ
//
// 規律:
//   - client config (= instrumentation-client.ts) は不変
//   - edge config (= sentry.edge.config.ts) は不変
//   - 既存 OP-5 集計 tag は壊さない
//   - 既存 error tracking は production canary 中は drop、 server error tracking
//     を有効化する場合は SENTRY_SERVER_EVENT_SCOPE=all で別 phase / 別 PR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ─── Sensitive lists ───
const SENSITIVE_HOSTS_DROP: readonly string[] = [
  "maps.googleapis.com",
  "places.googleapis.com",
  "generativelanguage.googleapis.com",
  "api.anthropic.com",
  "api.openai.com",
];
const SENSITIVE_QUERY_KEYS: readonly string[] = [
  "key",
  "token",
  "apiKey",
  "api_key",
  "q",
  "query",
  "input",
  "location",
  "lat",
  "lng",
  "latitude",
  "longitude",
  "address",
  "place",
];
const SENSITIVE_HEADER_KEYS: readonly string[] = [
  "authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
  "x-supabase-auth",
];

// ─── Breadcrumb category drop (= 戦略 B+) ───
// console: 全 console.log 由来の breadcrumb を drop
// coalter.*: production で NEXT_PUBLIC_COALTER_PRESENCE_EXECUTOR が有効、
//            Sentry.addBreadcrumb の coalter.* category breadcrumb を防御的に drop
const DROP_BREADCRUMB_CATEGORIES: readonly string[] = ["console"];
const DROP_BREADCRUMB_CATEGORY_PREFIXES: readonly string[] = ["coalter."];

// ─── OP-5 event allowlist (= GPT 補正 1: prefix と exact 分離) ───
const OP5_ALLOWED_TAG_PREFIXES = ["op5_"] as const;
const OP5_ALLOWED_TAG_EXACT = ["release", "environment"] as const;

// ─── OP-5 event contexts allowlist (= GPT 補正 3: trace 除外) ───
const OP5_ALLOWED_CONTEXT_KEYS = ["runtime", "os", "device"] as const;

// ─── Server event scope env gate (= CEO 補正 1) ───
// "op5_only" (default): production canary 中は OP-5 event 限定送信、
//                       非 OP-5 event は beforeSend で drop
// "all": 全 server event 送信 (= OP-5 + 通常 error tracking)、 将来別 phase で
//        CEO 承認後に env で切り替え可能
const SERVER_EVENT_SCOPE: "op5_only" | "all" =
  process.env.SENTRY_SERVER_EVENT_SCOPE === "all" ? "all" : "op5_only";

// ─── Host matching (= CEO 補正 3: exact + subdomain で偽装防御) ───
function matchesHostOrSubdomain(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

// ─── OP-5 event 判定 (= GPT 補正 2: message + transaction の両方を判定) ───
function isOp5Event(event: Sentry.Event): boolean {
  const message =
    typeof event.message === "string"
      ? event.message
      : typeof event.transaction === "string"
        ? event.transaction
        : "";
  return (
    message.startsWith("op5.shadow.observation.") ||
    message.startsWith("op5.shadow.error.")
  );
}

// ─── Sentry init ───
Sentry.init({
  // Option D: server-only DSN 優先、 既存 NEXT_PUBLIC_* fallback で後方互換
  dsn: process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  enabled: !!(process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN),

  // v5 minimum (= GPT 監査 + CEO 確定 2026-05-12):
  //   SDK 側で IP / cookies / 一部 PII を payload に含めない。
  //   Sentry server 側 IP 由来 geo enrichment の input を削減し、
  //   user.geo (= country_code / city / subdivision / region) の自動付与を抑制する。
  //   Sentry server-side scrubbing rules ($user.geo.** 等) との組合せで final
  //   payload から geo を取り除く path を確立する。
  sendDefaultPii: false,

  beforeBreadcrumb(breadcrumb, _hint) {
    const category = breadcrumb.category ?? "";

    // (1) category drop (= console + coalter.*)
    if (DROP_BREADCRUMB_CATEGORIES.includes(category)) return null;
    if (DROP_BREADCRUMB_CATEGORY_PREFIXES.some((p) => category.startsWith(p))) {
      return null;
    }

    // (2) fetch / http / xhr: external host drop + query redact
    if (["fetch", "xhr", "http"].includes(category)) {
      const url = breadcrumb.data?.url;
      if (typeof url === "string") {
        try {
          const parsed = new URL(url);
          // CEO 補正 3: exact / subdomain match で偽装防御
          if (
            SENSITIVE_HOSTS_DROP.some((h) =>
              matchesHostOrSubdomain(parsed.hostname, h),
            )
          ) {
            return null;
          }
          if (parsed.search) {
            parsed.search = "?[REDACTED]";
            if (breadcrumb.data) breadcrumb.data.url = parsed.toString();
          }
        } catch {
          return null;
        }
      }
      if (breadcrumb.data && typeof breadcrumb.data === "object") {
        for (const k of SENSITIVE_QUERY_KEYS) {
          if (k in breadcrumb.data) {
            (breadcrumb.data as Record<string, unknown>)[k] = "[REDACTED]";
          }
        }
      }
    }

    return breadcrumb;
  },

  beforeSend(event, _hint) {
    if (isOp5Event(event)) {
      // ━━━━ OP-5 event: allowlist strip (= 必要 field のみ残す) ━━━━

      // (a) breadcrumbs 全削除
      event.breadcrumbs = [];

      // (b) request: pathname + method のみ (= GPT 補正 4)
      if (event.request) {
        const newRequest: { method?: string; url?: string } = {};
        if (event.request.url) {
          try {
            const u = new URL(event.request.url);
            newRequest.url = u.pathname;
          } catch {
            // URL parse 失敗 → url field 削除
          }
        }
        if (event.request.method) newRequest.method = event.request.method;
        event.request = newRequest;
      }

      // (c) extra 全削除
      event.extra = {};

      // (d) contexts: runtime / os / device のみ (= GPT 補正 3: trace 除外)
      if (event.contexts) {
        const cleanedContexts: Record<string, unknown> = {};
        for (const k of OP5_ALLOWED_CONTEXT_KEYS) {
          if (k in event.contexts) {
            cleanedContexts[k] = (event.contexts as Record<string, unknown>)[k];
          }
        }
        event.contexts = cleanedContexts as typeof event.contexts;
      }

      // (d-2) v5 minimum: contexts.trace の防御的二重削除。
      //   SDK auto-instrumentation (= @sentry/nextjs httpIntegration 等) が
      //   beforeSend の後段で trace context を再付与する可能性に対する防御。
      //   contexts allowlist の完全置き換えが何らかの理由で trace を残した場合の保険。
      if (event.contexts && "trace" in event.contexts) {
        delete (event.contexts as Record<string, unknown>).trace;
      }

      // (e) tags: prefix match + exact match (= GPT 補正 1)
      if (event.tags) {
        const cleanedTags: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(event.tags)) {
          const matchesExact = (OP5_ALLOWED_TAG_EXACT as readonly string[]).includes(k);
          const matchesPrefix = OP5_ALLOWED_TAG_PREFIXES.some((p) =>
            k.startsWith(p),
          );
          if (matchesExact || matchesPrefix) {
            cleanedTags[k] = v;
          }
        }
        event.tags = cleanedTags as typeof event.tags;
      }

      // (f) exception 削除 (= OP-5 event では発生想定外)
      delete event.exception;

      // (g) user 削除 (= CEO 補正 2、 防御的、 OP-5 event に user 情報不要)
      delete event.user;

      // (h) v5 minimum: _meta 削除。
      //   _meta.contexts.trace 等 SDK normalization metadata を payload から外す。
      //   preview smoke v1 で _meta.contexts.trace が残存していた事実から防御的に削除。
      delete (event as Sentry.Event & { _meta?: unknown })._meta;

      return event;
    }

    // ━━━━ 非 OP-5 event ━━━━
    // CEO 補正 1: production canary scope では非 OP-5 event を drop
    if (SERVER_EVENT_SCOPE === "op5_only") {
      return null;
    }

    // SERVER_EVENT_SCOPE === "all" の場合のみ既存 error tracking 経路
    // (= 将来別 phase / 別 PR で server error tracking 有効化時)
    if (event.request) {
      if (event.request.url) {
        try {
          const u = new URL(event.request.url);
          if (u.search) {
            u.search = "?[REDACTED]";
            event.request.url = u.toString();
          }
        } catch {
          // keep as-is
        }
      }
      if (event.request.query_string) {
        event.request.query_string = "[REDACTED]";
      }
      if (event.request.cookies) {
        event.request.cookies = { "[REDACTED]": "" };
      }
      if (
        event.request.headers &&
        typeof event.request.headers === "object"
      ) {
        for (const h of SENSITIVE_HEADER_KEYS) {
          const lh = h.toLowerCase();
          for (const key of Object.keys(event.request.headers)) {
            if (key.toLowerCase() === lh) {
              (event.request.headers as Record<string, string>)[key] =
                "[REDACTED]";
            }
          }
        }
      }
    }

    return event;
  },
});
