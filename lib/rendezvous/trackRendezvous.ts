// lib/rendezvous/trackRendezvous.ts
// Lightweight client-side Rendezvous analytics tracker.
// Fire-and-forget — never throws, never blocks UX.
// All events include lane (romance/connection/partner) for cross-tier comparison.

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type RendezvousLane = "romance" | "connection" | "partner";
export type ConnectionSubMode = "friendship" | "community" | "business";

export type RendezvousAnalyticsEvent =
  // Hub
  | "rendezvous_hub_view"
  | "rendezvous_lane_click"
  // List / Detail
  | "rendezvous_list_view"
  | "rendezvous_candidate_open"
  // Actions
  | "rendezvous_candidate_like"
  | "rendezvous_candidate_pass"
  | "rendezvous_mutual"
  | "rendezvous_chat_start"
  // Romance
  | "romance_gate_view"
  | "romance_gate_pass"
  | "romance_swipe"
  // Connection
  | "connection_submode_switch"
  // Partner
  | "partner_onboarding_start"
  | "partner_lifeplan_save"
  | "partner_verification_gate_block"
  // Dropout
  | "rendezvous_dropout";

export type RendezvousEventPayload = {
  event: RendezvousAnalyticsEvent;
  lane?: RendezvousLane;
  submode?: ConnectionSubMode;
  metadata?: Record<string, unknown>;
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dedup guard (2s window for view events)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const _recent = new Map<string, number>();
const DEDUP_MS = 2000;

function shouldDedup(event: string, key: string): boolean {
  if (!event.endsWith("_view")) return false;
  const now = Date.now();
  const fullKey = `${event}:${key}`;
  const last = _recent.get(fullKey);
  if (last && now - last < DEDUP_MS) return true;
  _recent.set(fullKey, now);
  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Core send
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function send(payload: RendezvousEventPayload): void {
  try {
    const body = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString(),
    });

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      const sent = navigator.sendBeacon("/api/rendezvous/analytics", blob);
      if (sent) return;
    }

    fetch("/api/rendezvous/analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Never throw
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** ハブ表示 */
export function trackHubView(): void {
  if (shouldDedup("rendezvous_hub_view", "hub")) return;
  send({ event: "rendezvous_hub_view" });
}

/** 枠カードクリック */
export function trackLaneClick(lane: RendezvousLane): void {
  send({ event: "rendezvous_lane_click", lane });
}

/** 枠トップページ（一覧）表示 */
export function trackListView(lane: RendezvousLane, submode?: ConnectionSubMode): void {
  const key = submode ? `${lane}:${submode}` : lane;
  if (shouldDedup("rendezvous_list_view", key)) return;
  send({ event: "rendezvous_list_view", lane, submode });
}

/** 候補詳細オープン */
export function trackCandidateOpen(lane: RendezvousLane, candidateId: string, submode?: ConnectionSubMode): void {
  send({ event: "rendezvous_candidate_open", lane, submode, metadata: { candidateId } });
}

/** Like */
export function trackCandidateLike(lane: RendezvousLane, candidateId: string, submode?: ConnectionSubMode): void {
  send({ event: "rendezvous_candidate_like", lane, submode, metadata: { candidateId } });
}

/** Pass */
export function trackCandidatePass(lane: RendezvousLane, candidateId: string, submode?: ConnectionSubMode): void {
  send({ event: "rendezvous_candidate_pass", lane, submode, metadata: { candidateId } });
}

/** Mutual match（サーバーから呼ぶ場合はserver版を使用） */
export function trackMutual(lane: RendezvousLane, candidateId: string): void {
  send({ event: "rendezvous_mutual", lane, metadata: { candidateId } });
}

/** チャット開始 */
export function trackChatStart(lane: RendezvousLane, candidateId: string): void {
  send({ event: "rendezvous_chat_start", lane, metadata: { candidateId } });
}

/** Romance: L2ゲート表示 */
export function trackRomanceGateView(): void {
  if (shouldDedup("romance_gate_view", "gate")) return;
  send({ event: "romance_gate_view", lane: "romance" });
}

/** Romance: ゲート通過 */
export function trackRomanceGatePass(): void {
  send({ event: "romance_gate_pass", lane: "romance" });
}

/** Romance: スワイプ実行 */
export function trackRomanceSwipe(direction: "right" | "left" | "up", candidateId: string): void {
  send({ event: "romance_swipe", lane: "romance", metadata: { direction, candidateId } });
}

/** Connection: サブモード切替 */
export function trackSubModeSwitch(submode: ConnectionSubMode): void {
  send({ event: "connection_submode_switch", lane: "connection", submode });
}

/** Partner: オンボーディング開始 */
export function trackPartnerOnboardingStart(): void {
  send({ event: "partner_onboarding_start", lane: "partner" });
}

/** Partner: Life Plan保存 */
export function trackPartnerLifePlanSave(questionCount: number): void {
  send({ event: "partner_lifeplan_save", lane: "partner", metadata: { questionCount } });
}

/** Partner: 確認ゲートでブロック */
export function trackPartnerGateBlock(currentLevel: number, requiredLevel: number): void {
  send({ event: "partner_verification_gate_block", lane: "partner", metadata: { currentLevel, requiredLevel } });
}

/** 離脱（ページ離脱時に呼ぶ） */
export function trackDropout(
  lane: RendezvousLane,
  stage: "hub" | "list" | "detail" | "gate",
  submode?: ConnectionSubMode,
): void {
  send({ event: "rendezvous_dropout", lane, submode, metadata: { stage } });
}
