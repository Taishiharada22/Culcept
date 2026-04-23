// lib/stargazer/trackClient.ts
// Lightweight client-side Stargazer analytics tracker.
// Posts events to /api/stargazer/analytics via fire-and-forget fetch.
// Safe to call from any "use client" component — never throws.

type StargazerEvent =
  | "feature_view"
  | "feature_interact"
  | "prophecy_verify"
  | "alter_turn"
  | "whisper_shown"
  | "whisper_clicked"
  | "phase_advance"
  | "session_complete"
  // ── W3-PR-10 Transport Staircase canary (2026-04-24) ──
  | "transport_v2_edit_regression";

// ── Dedup guard: avoid duplicate feature_view within 2 seconds ──
const _recentViews = new Map<string, number>();
const DEDUP_MS = 2000;

function isDuplicateView(feature: string): boolean {
  const now = Date.now();
  const last = _recentViews.get(feature);
  if (last && now - last < DEDUP_MS) return true;
  _recentViews.set(feature, now);
  return false;
}

// ── Core send function ──

function send(
  event: StargazerEvent,
  feature?: string,
  metadata?: Record<string, unknown>,
): void {
  try {
    const body = JSON.stringify({
      event,
      feature: feature ?? null,
      metadata: metadata ?? {},
      timestamp: new Date().toISOString(),
    });

    // navigator.sendBeacon for minimal overhead + survives page unload
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/stargazer/analytics", blob);
      if (sent) return;
    }

    // Fallback: fire-and-forget fetch
    fetch("/api/stargazer/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {
      // Silently ignore — analytics must never break UX
    });
  } catch {
    // Never throw from tracker
  }
}

// ── Public API ──

/**
 * ユーザーが機能ページを開いたときに呼ぶ。
 * 同一 feature に対して 2 秒以内の重複呼び出しは自動的に無視される。
 */
export function trackFeatureView(feature: string): void {
  if (isDuplicateView(feature)) return;
  send("feature_view", feature);
}

/**
 * ユーザーが機能内でアクションを実行したときに呼ぶ。
 * action は metadata.action として送信される。
 */
export function trackInteraction(
  feature: string,
  action: string,
  metadata?: Record<string, unknown>,
): void {
  send("feature_interact", feature, { action, ...metadata });
}

/**
 * 予言検証イベント。
 */
export function trackProphecyVerify(
  prophecyId: string,
  status: string,
  score: number,
): void {
  send("prophecy_verify", "prophecy", { prophecyId, status, score });
}

/**
 * Alter 対話ターン完了。
 */
export function trackAlterTurn(
  sessionId: string,
  mode: string,
  turnCount: number,
): void {
  send("alter_turn", "alter", { sessionId, mode, turnCount });
}

/**
 * Shadow Whisper が表示された。
 */
export function trackWhisperShown(): void {
  send("whisper_shown", "alter");
}

/**
 * Shadow Whisper の「話す？」がクリックされた。
 */
export function trackWhisperClicked(): void {
  send("whisper_clicked", "alter");
}

/**
 * 深度フェーズが進んだ。
 */
export function trackPhaseAdvance(
  fromPhase: string,
  toPhase: string,
): void {
  send("phase_advance", undefined, { fromPhase, toPhase });
}

/**
 * デイリー観測セッション完了。
 */
export function trackSessionComplete(
  questionCount: number,
  metadata?: Record<string, unknown>,
): void {
  send("session_complete", undefined, { questionCount, ...metadata });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W3-PR-10 Transport Staircase canary — O4
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// 設計: docs/alter-morning-pr10-scope-a-canary-plan.md §3-B Event 3（Lock 2 適用）
//
// 使い方:
//   MorningPlanCard.tsx の 5 edit handler（reorder × 2, duration, time, place）が
//   regenerateTravelForPlan の直後に呼ぶ。canonical 経路 / 非 canonical 経路で
//   travel 数がどう変化したかを payload に詰める。
//
// 分析意図（Lock 2）:
//   - canonical_present=true で travel が消えた → G4 regression の兆候（要即 OFF）
//   - canonical_present=false で travel が消えた → 旧 Path B fallback の既知挙動
//   - SQL: `WHERE canonical_present = true AND travel_items_delta < 0` で濁りなく判定
//
// flag_source 推論:
//   canary Phase 1 は allowlist-only（global 常に OFF、§5-C D2 CEO確定）。
//   よって canonical_present=true ⟺ flag_source="allowlist"。
//   canonical_present=false は flag OFF（= flag_source 概念外）なので null。
//   global を ON にする段階では canary 観測自体の価値が薄れているため、
//   本推論の stale 化を許容する。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TransportV2EditTrigger =
  | "reorder"
  | "duration_edit"
  | "time_edit"
  | "place_change";

export interface TransportV2EditRegressionPayload {
  /** prev.transportSegments !== undefined と同値（canonical 経路識別子） */
  canonical_present: boolean;
  /** canonical_present=true のときの segments.length、false なら 0 */
  transport_segments_count: number;
  /** 編集前の kind="travel" 数 */
  travel_items_before: number;
  /** 編集後の kind="travel" 数 */
  travel_items_after: number;
  /** どの操作が引き金か（5 handler ↔ 4 enum、reorder は move_up/down 統合） */
  edit_trigger: TransportV2EditTrigger;
  /**
   * 観測窓 join key。既存 home_alter_judgment 空間と同じ alter session id。
   * null の場合は直接 join 不能だが plan_date + user_id で近似 join する。
   */
  session_id: string | null;
  /** "YYYY-MM-DD" の対象 plan 日付 */
  plan_date: string;
}

/**
 * W3-PR-10 canary — client 側 regenerate 直後の travel 増減 emit。
 *
 * 契約:
 *   - fire-and-forget（UI / state 更新を待たせない）
 *   - schema_version は "2026-04-24" に固定（caller から上書き不可）
 *   - flag_source は canonical_present から推論（上の設計コメント参照）
 *   - travel_items_delta は after - before を caller 任せず本関数で計算
 */
export function trackTransportV2EditRegression(
  payload: TransportV2EditRegressionPayload,
): void {
  const flag_source: "allowlist" | null = payload.canonical_present
    ? "allowlist"
    : null;
  send("transport_v2_edit_regression", "alter_morning", {
    // ── §3-A common metadata ──
    schema_version: "2026-04-24",
    flag_source,
    session_id: payload.session_id,
    plan_date: payload.plan_date,
    caller: "client_regenerate",
    // ── §3-B Event 3 specific metadata ──
    canonical_present: payload.canonical_present,
    transport_segments_count: payload.transport_segments_count,
    travel_items_before: payload.travel_items_before,
    travel_items_after: payload.travel_items_after,
    edit_trigger: payload.edit_trigger,
    // derived — SQL を楽にする目的で冗長保持
    travel_items_delta: payload.travel_items_after - payload.travel_items_before,
  });
}
