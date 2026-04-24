/**
 * W3-PR-13 M4: Visual Flow analytics types + client-side emission wrapper.
 *
 * 本 module は **client-safe**（server-only 依存を含まない）。
 * server 側から呼ぶ場合は `analyticsServer.ts` を使用。
 *
 * CEO 承認 (2026-04-24) の 4 event:
 *   server: visual_flow_flag_evaluated  — visualFlowEnabled=true のみ emit
 *   client: visual_flow_gate_rejected    — MorningMapView 早期 null return
 *   client: visual_flow_script_loaded    — Google Maps JS API 読み込み結果
 *   client: visual_flow_map_mounted      — fitBounds 完了後
 *
 * dead-code 方針: flag OFF default / browser key 未投入 / allowlist 空 → 実発火ゼロ。
 *
 * 設計書: docs/alter-morning-pr13-visual-flow-rollout-plan.md
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event name constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const VISUAL_FLOW_FEATURE = "alter_morning_visual_flow" as const;

export const VISUAL_FLOW_SERVER_EVENT_NAMES = [
  "visual_flow_flag_evaluated",
] as const;

export const VISUAL_FLOW_CLIENT_EVENT_NAMES = [
  "visual_flow_gate_rejected",
  "visual_flow_script_loaded",
  "visual_flow_map_mounted",
] as const;

export type VisualFlowServerEventName =
  (typeof VISUAL_FLOW_SERVER_EVENT_NAMES)[number];

export type VisualFlowClientEventName =
  (typeof VISUAL_FLOW_CLIENT_EVENT_NAMES)[number];

export type VisualFlowAnyEventName =
  | VisualFlowServerEventName
  | VisualFlowClientEventName;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Metadata unions (per-event strict shapes)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * server: visual_flow_flag_evaluated
 * enabled=true のみ emit（CEO decision #3）ので enabled field は metadata に含めない。
 * flag の解決経路（allowlist / global）が将来必要になったら flag_source を追加する。
 */
export interface VisualFlowFlagEvaluatedMetadata {
  /** flag 解決経路。"allowlist" or "global"。 */
  flag_source: "allowlist" | "global";
}

/**
 * client: visual_flow_gate_rejected
 * MorningMapView の早期 null return が発生した時の理由。
 */
export type VisualFlowGateRejectedReason =
  | "no_browser_key" // NEXT_PUBLIC_ALTER_MORNING_MAPS_BROWSER_KEY 未設定
  | "insufficient_pins"; // pins.length < 2

export interface VisualFlowGateRejectedMetadata {
  reason: VisualFlowGateRejectedReason;
  /** insufficient_pins の時のみ 0..N、no_browser_key では省略可。 */
  pin_count?: number;
}

/**
 * client: visual_flow_script_loaded
 * Google Maps JS API の <script> 読み込み結果。
 */
export interface VisualFlowScriptLoadedMetadata {
  status: "succeeded" | "failed";
  /** script tag 挿入〜 onload までの ms。失敗時は省略可。 */
  duration_ms?: number;
}

/**
 * client: visual_flow_map_mounted
 * fitBounds 完了後（または same-point fallback 完了後）。
 */
export interface VisualFlowMapMountedMetadata {
  pin_count: number;
  /** map mode。"bounds" = 2点以上で fitBounds / "single_fallback" = 全点同一座標. */
  fit_bounds_mode: "bounds" | "single_fallback";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Discriminated union (for API route whitelist validation)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type VisualFlowClientEventPayload =
  | {
      event: "visual_flow_gate_rejected";
      metadata: VisualFlowGateRejectedMetadata;
    }
  | {
      event: "visual_flow_script_loaded";
      metadata: VisualFlowScriptLoadedMetadata;
    }
  | {
      event: "visual_flow_map_mounted";
      metadata: VisualFlowMapMountedMetadata;
    };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Manual validators (zod 非依存 — 新規 dep 追加ゼロ方針)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * body (unknown) → 型安全な payload に narrow。
 * API route の whitelist validation でも、client wrapper 内の assert でも使える。
 *
 * 失敗理由を reason 文字列で返すことで route 側が 400 で返す際の debug に使える。
 * ただし `reason` は client に返さない（生の PII / internal shape を露出しない）。
 */
export function validateVisualFlowClientPayload(
  raw: unknown,
):
  | { ok: true; payload: VisualFlowClientEventPayload }
  | { ok: false; reason: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, reason: "body_not_object" };
  }
  const obj = raw as Record<string, unknown>;
  const event = obj.event;
  const metadata = obj.metadata;

  if (typeof event !== "string") {
    return { ok: false, reason: "event_missing" };
  }
  if (
    !VISUAL_FLOW_CLIENT_EVENT_NAMES.includes(event as VisualFlowClientEventName)
  ) {
    return { ok: false, reason: "event_not_whitelisted" };
  }
  if (!metadata || typeof metadata !== "object") {
    return { ok: false, reason: "metadata_not_object" };
  }
  const m = metadata as Record<string, unknown>;

  if (event === "visual_flow_gate_rejected") {
    const reason = m.reason;
    if (reason !== "no_browser_key" && reason !== "insufficient_pins") {
      return { ok: false, reason: "gate_reason_invalid" };
    }
    const pin_count = m.pin_count;
    if (
      pin_count !== undefined &&
      (typeof pin_count !== "number" ||
        !Number.isFinite(pin_count) ||
        pin_count < 0 ||
        !Number.isInteger(pin_count))
    ) {
      return { ok: false, reason: "gate_pin_count_invalid" };
    }
    const result: VisualFlowGateRejectedMetadata = { reason };
    if (typeof pin_count === "number") result.pin_count = pin_count;
    return {
      ok: true,
      payload: { event: "visual_flow_gate_rejected", metadata: result },
    };
  }

  if (event === "visual_flow_script_loaded") {
    const status = m.status;
    if (status !== "succeeded" && status !== "failed") {
      return { ok: false, reason: "script_status_invalid" };
    }
    const duration_ms = m.duration_ms;
    if (
      duration_ms !== undefined &&
      (typeof duration_ms !== "number" ||
        !Number.isFinite(duration_ms) ||
        duration_ms < 0 ||
        !Number.isInteger(duration_ms))
    ) {
      return { ok: false, reason: "script_duration_invalid" };
    }
    const result: VisualFlowScriptLoadedMetadata = { status };
    if (typeof duration_ms === "number") result.duration_ms = duration_ms;
    return {
      ok: true,
      payload: { event: "visual_flow_script_loaded", metadata: result },
    };
  }

  if (event === "visual_flow_map_mounted") {
    const pin_count = m.pin_count;
    if (
      typeof pin_count !== "number" ||
      !Number.isFinite(pin_count) ||
      pin_count < 0 ||
      !Number.isInteger(pin_count)
    ) {
      return { ok: false, reason: "map_pin_count_invalid" };
    }
    const fit_bounds_mode = m.fit_bounds_mode;
    if (fit_bounds_mode !== "bounds" && fit_bounds_mode !== "single_fallback") {
      return { ok: false, reason: "map_fit_bounds_mode_invalid" };
    }
    return {
      ok: true,
      payload: {
        event: "visual_flow_map_mounted",
        metadata: { pin_count, fit_bounds_mode },
      },
    };
  }

  // Unreachable via includes() guard above, but defensive:
  return { ok: false, reason: "event_unhandled" };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Client-side wrapper — fetch to telemetry route
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const VISUAL_FLOW_TELEMETRY_ENDPOINT =
  "/api/alter-morning/visual-flow/telemetry";

/**
 * client → server relay。
 * fire-and-forget: network 失敗しても UI 影響なし、throw しない。
 * keepalive: navigation 間の event（ページ遷移直前の pin click 等）を落とさない。
 *
 * 本関数は「呼び側が flag ON を確認した上で呼ぶ」前提。
 * MorningMapView 自体が visualFlowEnabled=true の時のみ render されるため、
 * この関数から emit された event は必ず canary 対象ユーザーのもの。
 */
export async function emitVisualFlowClientEvent(
  payload: VisualFlowClientEventPayload,
): Promise<void> {
  if (typeof window === "undefined") return; // SSR guard
  try {
    await fetch(VISUAL_FLOW_TELEMETRY_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // fire-and-forget: 全 error を swallow。UI 影響ゼロを保証。
  }
}
