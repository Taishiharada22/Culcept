/**
 * ICS URL Import (Track A) — SSRF-guarded fetch of an ICS subscription URL
 *
 * 設計書: docs/alter-plan-ics-url-import-readiness.md §3 (= SSRF)、 §4 A-1
 * decision-log: 2026-05-29 マルチ provider 取り込み A→B (= Track A 先行)
 *
 * 役割:
 *   - ユーザー入力 URL を **fail-closed** で検証してから .ics を取得
 *   - Outlook 公開 / Apple iCloud webcal / Google 秘密 iCal / Yahoo 等を横断
 *   - 取得後は既存 ICS pipeline (= icsParser → icsToAnchorMapper) に流す (= A-2 action)
 *
 * 不変原則 (= server-only、 node:dns / node:net 使用):
 *   1. pure 検証部 (= normalizeIcsUrl / isBlockedIp) は I/O なし、 単体 test 可能
 *   2. fetch 部 (= fetchIcsText) は lookup / fetchImpl を DI で受け、 network なし test 可能
 *   3. 検証を通らない URL は **fetch しない** (= fail-closed)
 *   4. private / loopback / link-local / metadata 到達を遮断 (= SSRF)
 *
 * SSRF 設計 (= readiness §3 の 12 項目):
 *   #1 https 限定 / #2 webcal→https / #3 userinfo 除去 / #4 private・link-local IP 遮断 /
 *   #5 redirect 各 hop 再検証 / #6 timeout / #7 size 上限 / #8 body 妥当性 /
 *   #9 auth gate (= 呼出側 action) / #10 log 衛生 / #11 非標準ポート拒否 / #12 認証付き取得禁止
 *
 * IP 表記回避の潰し込み (= ④⑥⑦):
 *   - 10進 (2130706433) / 16進 (0x7f000001) / 8進 (0177.0.0.1) は WHATWG `new URL()` が
 *     canonical dotted-decimal に正規化 → isBlockedIPv4 で捕捉
 *   - IPv4-mapped IPv6 (::ffff:127.0.0.1) は埋め込み IPv4 を抽出して再判定
 */

import { isIP } from "node:net";
import { lookup as dnsLookup } from "node:dns/promises";

import { parseIcsString } from "./icsParser";
import { mapIcsEventsToDrafts, type IcsAnchorDraft } from "./icsToAnchorMapper";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_REDIRECTS = 5;
/** https default port (= "") または明示 443 のみ許可 (= #11 非標準ポート拒否) */
const ALLOWED_PORTS: ReadonlySet<string> = new Set(["", "443"]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type IcsUrlFetchReason =
  | "invalid_url"
  | "scheme_not_https"
  | "userinfo_not_allowed"
  | "port_not_allowed"
  | "blocked_address"
  | "dns_resolution_failed"
  | "too_many_redirects"
  | "redirect_no_location"
  | "timeout"
  | "too_large"
  | "not_calendar_body"
  | "http_error"
  | "fetch_failed";

/** normalizeIcsUrl が返しうる URL 段階の reason */
export type NormalizeReason = Extract<
  IcsUrlFetchReason,
  "invalid_url" | "scheme_not_https" | "userinfo_not_allowed" | "port_not_allowed"
>;

export type NormalizeUrlResult =
  | { readonly ok: true; readonly url: URL }
  | { readonly ok: false; readonly reason: NormalizeReason };

export type IcsUrlFetchResult =
  | { readonly ok: true; readonly icsText: string; readonly finalHost: string }
  | { readonly ok: false; readonly reason: IcsUrlFetchReason; readonly detail?: string };

export type FetchIcsTextDeps = {
  /** hostname → 解決 IP 配列 (= test で mock、 default は node:dns) */
  readonly lookup?: (hostname: string) => Promise<string[]>;
  /** fetch 実装 (= test で mock、 default は global fetch) */
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
  readonly maxRedirects?: number;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// normalizeIcsUrl (= pure、 #1 #2 #3 #11)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * URL を正規化 + scheme / userinfo / port 検証 (= pure)。
 *
 * - webcal:// → https:// に rewrite (= string 置換、 URL.protocol setter は scheme 変更不可のため)
 * - https 以外 → scheme_not_https
 * - userinfo (user:pass@) → userinfo_not_allowed
 * - port が "" / "443" 以外 → port_not_allowed
 *
 * 注: `new URL()` は IPv4 を canonical 化する (= 10進/16進/8進表記を dotted-decimal へ)。
 *     これにより IP 表記回避が後段 isBlockedIp で捕捉される。
 */
export function normalizeIcsUrl(input: string): NormalizeUrlResult {
  if (typeof input !== "string" || input.trim().length === 0) {
    return { ok: false, reason: "invalid_url" };
  }
  let raw = input.trim();
  // #2 webcal:// → https:// (= 事実上 https 配信の別名)
  if (/^webcal:\/\//i.test(raw)) {
    raw = "https://" + raw.slice("webcal://".length);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "invalid_url" };
  }

  // #1 https 限定
  if (url.protocol !== "https:") {
    return { ok: false, reason: "scheme_not_https" };
  }
  // #3 userinfo 除去 (= 認証情報を載せない)
  if (url.username !== "" || url.password !== "") {
    return { ok: false, reason: "userinfo_not_allowed" };
  }
  // #11 非標準ポート拒否 (= https default "" or 明示 443 のみ)
  if (!ALLOWED_PORTS.has(url.port)) {
    return { ok: false, reason: "port_not_allowed" };
  }
  return { ok: true, url };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isBlockedIp (= pure、 #4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * IP (= v4 / v6) が遮断対象 (= private / loopback / link-local / 特殊) なら true。
 *
 * fail-closed: 不正な IP 文字列も true (= 遮断) を返す。
 */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isBlockedIPv4(ip);
  if (kind === 6) return isBlockedIPv6(ip);
  return true; // 非 IP → 遮断 (= 想定外、 fail-closed)
}

function isBlockedIPv4(ip: string): boolean {
  const parts = ip.split(".");
  if (parts.length !== 4) return true;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b, c] = nums as [number, number, number, number];

  if (a === 0) return true; // 0.0.0.0/8 (= unspecified / "this network")
  if (a === 10) return true; // 10.0.0.0/8 private
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (= metadata 169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 private
  if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 IETF
  if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 private
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 benchmark
  if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224/4 multicast + 240/4 reserved + 255.255.255.255

  return false;
}

function isBlockedIPv6(ip: string): boolean {
  const lower = ip.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");

  if (lower === "::" || lower === "::1") return true; // unspecified / loopback

  // 埋め込み IPv4 (= ::ffff:a.b.c.d mapped / ::a.b.c.d compat) → 抽出して再判定
  if (lower.includes(".")) {
    const v4 = lower.slice(lower.lastIndexOf(":") + 1);
    if (isIP(v4) === 4) return isBlockedIPv4(v4);
    return true; // 不正な埋め込み → 遮断
  }

  // 先頭 hextet で prefix 判定
  const head = lower.startsWith("::") ? "0" : (lower.split(":")[0] || "0");
  const h = parseInt(head, 16);
  if (Number.isNaN(h)) return true; // 不正 → 遮断
  if ((h & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((h & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((h & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// guardHost (= host/IP 検証、 #4 lookup 込み)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type GuardResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: IcsUrlFetchReason; readonly detail?: string };

async function guardHost(
  url: URL,
  lookup: (hostname: string) => Promise<string[]>,
): Promise<GuardResult> {
  const bare = url.hostname.replace(/^\[/, "").replace(/\]$/, "");

  // IP literal は直接判定 (= DNS 不要)
  if (isIP(bare) !== 0) {
    if (isBlockedIp(bare)) {
      return { ok: false, reason: "blocked_address", detail: "ip_literal" };
    }
    return { ok: true };
  }

  // hostname は DNS 解決 → 全 IP を判定
  let ips: string[];
  try {
    ips = await lookup(bare);
  } catch {
    return { ok: false, reason: "dns_resolution_failed" };
  }
  if (ips.length === 0) {
    return { ok: false, reason: "dns_resolution_failed" };
  }
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      return { ok: false, reason: "blocked_address", detail: "resolved" };
    }
  }
  return { ok: true };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// readBodyCapped (= #7 size 上限)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function readBodyCapped(
  res: Response,
  maxBytes: number,
): Promise<{ ok: true; text: string } | { ok: false; reason: "too_large" }> {
  const reader = res.body?.getReader();
  if (!reader) {
    // body stream 無し (= mock 等) → text() fallback + 長さ確認
    const t = await res.text();
    if (Buffer.byteLength(t, "utf8") > maxBytes) return { ok: false, reason: "too_large" };
    return { ok: true, text: t };
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(Buffer.from(value));
    }
  }
  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchIcsText (= main entry、 #5 redirect 再検証 + #6 timeout + #8 body + #12 認証なし)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function defaultLookup(hostname: string): Promise<string[]> {
  const results = await dnsLookup(hostname, { all: true });
  return results.map((r) => r.address);
}

/**
 * URL から .ics 本文を SSRF-guarded で取得。
 *
 * 各 hop で guardHost → fetch (= redirect manual) を繰り返し、 redirect 先も再検証。
 * 認証情報は一切付けない (= #12: credentials omit / Authorization なし)。
 */
export async function fetchIcsText(
  input: string,
  deps: FetchIcsTextDeps = {},
): Promise<IcsUrlFetchResult> {
  const lookup = deps.lookup ?? defaultLookup;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = deps.maxBytes ?? DEFAULT_MAX_BYTES;
  const maxRedirects = deps.maxRedirects ?? DEFAULT_MAX_REDIRECTS;

  const normalized = normalizeIcsUrl(input);
  if (!normalized.ok) {
    return { ok: false, reason: normalized.reason };
  }
  let url = normalized.url;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    // ── SSRF host/IP 検証 (= 各 hop) ──
    const guard = await guardHost(url, lookup);
    if (!guard.ok) {
      return { ok: false, reason: guard.reason, ...(guard.detail ? { detail: guard.detail } : {}) };
    }

    // ── fetch (= redirect manual、 認証なし、 timeout) ──
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(url.toString(), {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        credentials: "omit",
        headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.1" },
      });
    } catch (e) {
      clearTimeout(timer);
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        reason: aborted ? "timeout" : "fetch_failed",
      };
    }
    clearTimeout(timer);

    // ── redirect → Location を再検証して次 hop へ ──
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (loc === null || loc.length === 0) {
        return { ok: false, reason: "redirect_no_location" };
      }
      let nextRaw: string;
      try {
        nextRaw = new URL(loc, url).toString();
      } catch {
        return { ok: false, reason: "invalid_url" };
      }
      const next = normalizeIcsUrl(nextRaw);
      if (!next.ok) {
        return { ok: false, reason: next.reason };
      }
      url = next.url;
      continue; // 次 hop で再 guard + fetch
    }

    // ── 非 2xx ──
    if (!res.ok) {
      return { ok: false, reason: "http_error", detail: String(res.status) };
    }

    // ── size (= Content-Length 事前 + 実読み上限) ──
    const cl = res.headers.get("content-length");
    if (cl !== null && Number.isFinite(Number(cl)) && Number(cl) > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
    const body = await readBodyCapped(res, maxBytes);
    if (!body.ok) {
      return { ok: false, reason: body.reason };
    }

    // ── #8 body 妥当性 (= iCalendar か) ──
    if (!/BEGIN:VCALENDAR/i.test(body.text.slice(0, 1024))) {
      return { ok: false, reason: "not_calendar_body" };
    }

    return { ok: true, icsText: body.text, finalHost: url.hostname };
  }

  return { ok: false, reason: "too_many_redirects" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// importIcsFromUrl (= URL → drafts orchestration、 fetch + parse + map)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type IcsUrlImportResult =
  | {
      readonly ok: true;
      readonly drafts: IcsAnchorDraft[];
      readonly warnings: string[];
      readonly skipped: number;
      readonly host: string;
    }
  | { readonly ok: false; readonly reason: IcsUrlFetchReason; readonly detail?: string };

/**
 * URL から .ics を取得 → parse → map して IcsAnchorDraft[] を返す (= A-2 action の中核)。
 *
 * - fetch は SSRF-guarded (= fetchIcsText)
 * - parse / map は既存 pure module を再利用 (= file flow と同一経路)
 * - deps を透過して fetchIcsText に渡す (= network なし単体 test 可能)
 */
export async function importIcsFromUrl(
  url: string,
  deps: FetchIcsTextDeps = {},
): Promise<IcsUrlImportResult> {
  const fetched = await fetchIcsText(url, deps);
  if (!fetched.ok) {
    return {
      ok: false,
      reason: fetched.reason,
      ...(fetched.detail !== undefined ? { detail: fetched.detail } : {}),
    };
  }
  const parsed = parseIcsString(fetched.icsText);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "not_calendar_body",
      ...(parsed.error !== undefined ? { detail: parsed.error } : {}),
    };
  }
  const mapped = mapIcsEventsToDrafts(parsed.events);
  return {
    ok: true,
    drafts: [...mapped.drafts],
    warnings: [...parsed.warnings],
    skipped: mapped.skipped.length,
    host: fetched.finalHost,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// reasonToMessage (= reason → user 向け 1 行、 detail は出さない = log 衛生)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function reasonToMessage(reason: IcsUrlFetchReason): string {
  switch (reason) {
    case "invalid_url":
      return "URL の形式が正しくありません。";
    case "scheme_not_https":
      return "https:// または webcal:// の URL を指定してください。";
    case "userinfo_not_allowed":
      return "URL に認証情報（user:pass@）は含められません。";
    case "port_not_allowed":
      return "標準ポート以外の URL は取り込めません。";
    case "blocked_address":
      return "安全のため、このURL（内部/非公開アドレス）は取り込めません。";
    case "dns_resolution_failed":
      return "URL のホストが見つかりませんでした。";
    case "too_many_redirects":
      return "リダイレクトが多すぎます。";
    case "redirect_no_location":
      return "リダイレクト先が不正です。";
    case "timeout":
      return "取得がタイムアウトしました。時間をおいて再度お試しください。";
    case "too_large":
      return "カレンダーのデータが大きすぎます。";
    case "not_calendar_body":
      return "指定された URL は iCalendar 形式ではありませんでした。";
    case "http_error":
      return "取得に失敗しました（サーバー応答エラー）。";
    case "fetch_failed":
      return "取得に失敗しました。URL をご確認ください。";
    default:
      return "取り込みに失敗しました。";
  }
}
