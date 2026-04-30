/**
 * CoAlter Stage 4 L4-pre-2 — Sentry Telemetry Sink wrapper
 *
 * 正本: layout plan v0.3 §7.10 / CEO sink 決定 (Sentry 採用 2026-04-28)
 *
 * telemetry の `setTelemetrySink()` に注入する Sentry breadcrumb sink。
 *
 * 採用根拠 (CEO 判定 2026-04-28):
 *   1. 既存 @sentry/nextjs v10.46.0 を活用 (新 SDK install ゼロ)
 *   2. PostHog 不採用 (ベンダー追加なし、運用統合)
 *   3. breadcrumb は Sentry session 内で context として残り、error 発生時に
 *      自動付帯 → debugging 効率化
 *
 * 不可侵:
 *   - flag presenceExecutorEnabled OFF で telemetry.safeEmit() が早期 return
 *     (本 sink に到達しない、Sentry call ゼロ)
 *   - L4-l flip 時に CEO 別審議で setTelemetrySink(createSentryTelemetrySink())
 *
 * 8 event → Sentry breadcrumb category mapping:
 *   coalter.presence.state_transition → category: "coalter.presence" / level: info
 *   coalter.pattern.used               → category: "coalter.pattern"  / level: info
 *   coalter.consent.event              → category: "coalter.consent"  / level: info
 *   coalter.legacy.fallback            → category: "coalter.legacy"   / level: debug
 *   coalter.mode.transition            → category: "coalter.mode"     / level: info
 *   coalter.rejection.recorded         → category: "coalter.rejection"/ level: info
 *   coalter.urgent.triggered           → category: "coalter.urgent"   / level: warning
 *   coalter.ratelimit.blocked          → category: "coalter.ratelimit"/ level: warning
 */

import * as Sentry from "@sentry/nextjs";
import type { TelemetrySink } from "./telemetry";
import type { TelemetryEvent } from "./telemetryEvents";

// ─────────────────────────────────────────────
// Event → Sentry breadcrumb shape mapping
// ─────────────────────────────────────────────

type SentryBreadcrumbLevel = "debug" | "info" | "warning" | "error" | "fatal";

interface BreadcrumbMapping {
  category: string;
  level: SentryBreadcrumbLevel;
}

const EVENT_MAPPING: Readonly<Record<TelemetryEvent["type"], BreadcrumbMapping>> = {
  "coalter.presence.state_transition": {
    category: "coalter.presence",
    level: "info",
  },
  "coalter.pattern.used": { category: "coalter.pattern", level: "info" },
  "coalter.consent.event": { category: "coalter.consent", level: "info" },
  "coalter.legacy.fallback": { category: "coalter.legacy", level: "debug" },
  "coalter.mode.transition": { category: "coalter.mode", level: "info" },
  "coalter.rejection.recorded": {
    category: "coalter.rejection",
    level: "info",
  },
  "coalter.urgent.triggered": { category: "coalter.urgent", level: "warning" },
  "coalter.ratelimit.blocked": {
    category: "coalter.ratelimit",
    level: "warning",
  },
};

// ─────────────────────────────────────────────
// Sink factory
// ─────────────────────────────────────────────

/**
 * Sentry breadcrumb 経由で telemetry を送信する TelemetrySink を生成。
 *
 * 各 emit は Sentry.addBreadcrumb で session context に追記される (実 ingestion
 * は Sentry SDK が遅延 batch 送信)。
 *
 * fail-open: Sentry SDK 例外は telemetry.safeEmit() の try/catch で握り潰されるため、
 * 本 sink 自体は throw を無視せず素直に呼び出すだけで OK。
 */
export function createSentryTelemetrySink(): TelemetrySink {
  return (event: TelemetryEvent) => {
    const mapping = EVENT_MAPPING[event.type];
    // event の type / pairId / ts 以外を data として送る (payload schema 維持)
    const { type: _type, ...rest } = event;
    Sentry.addBreadcrumb({
      type: "default",
      category: mapping.category,
      level: mapping.level,
      message: event.type,
      data: rest as Record<string, unknown>,
      timestamp:
        typeof (rest as { ts?: number }).ts === "number"
          ? (rest as { ts: number }).ts / 1000 // Sentry expects seconds
          : Date.now() / 1000,
    });
  };
}

/**
 * Convenience: setup helper を 1 関数で完結 (L4-l flip 時に呼ぶ)。
 *
 * ```ts
 * import { wireSentryTelemetry } from "@/lib/coalter/presence/sentryTelemetry";
 * wireSentryTelemetry();
 * ```
 *
 * 注: telemetry.ts 側の `setTelemetrySink` を呼ぶだけ。flag 制御は telemetry.ts
 * 側で担保 (presenceExecutorEnabled OFF で emit 自体ゼロ)。
 */
export async function wireSentryTelemetry(): Promise<void> {
  const { setTelemetrySink } = await import("./telemetry");
  setTelemetrySink(createSentryTelemetrySink());
}

/**
 * test reset 用 (production logic では使わない)。
 */
export async function unwireSentryTelemetry(): Promise<void> {
  const { setTelemetrySink } = await import("./telemetry");
  setTelemetrySink(null);
}
