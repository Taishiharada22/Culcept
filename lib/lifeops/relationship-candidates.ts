/**
 * Life Ops A-6 — Relationship Candidate Generator（**pure・no-DB・no-UI・no-通知・no-送信**・barrel 非 export）
 *
 * 設計: docs/life-ops-relationship-candidates-mini-design.md / relationship-model / gift-intelligence / recurrence-model / cadence-model
 *
 * 役割: `RelationshipObservation`（注入・opaque personRef のみ）→ 既存時間構造（annual recurring / cadence / followup deadline /
 *   before-event / **post-event 小拡張**）で touchpoint を候補化し、gift touchpoint のみ `GiftRecommendation` 最大 3 件を
 *   optional metadata として添える（**gift がなくても touchpoint candidate は成立**）。
 *
 * 厳守:
 *   - 実名/email/電話/raw message/free text を持たない（opaque personRef・closed vocabulary・fail-closed）。
 *   - suppression（手動）尊重・calendar title 推定/実データ接続なし・pure・deterministic（now 注入）・横エンジン非 import。
 *   - permission 正本は assessRelationshipPermission（suggest・確認必須・自動送信/購入等 blocked）。
 */

import { getCategorySpec } from "./category-model";
import { daysBetween } from "./cadence-model";
import { computeRecurringStatus } from "./recurrence-model";
import {
  evaluateSuppression,
  getTouchpointSpec,
  isOpaquePersonRef,
  type RelationKind,
  type RelationshipSuppression,
  type RelationshipTouchpointId,
} from "./relationship-model";
import { defaultBudgetBand, recommendGifts, type DesireSignal, type GiftOccasionFrame, type GiftRecommendation } from "./gift-intelligence";
import type { LifeOpsCandidate, RelationshipDueReason } from "./candidate-types";

/** 注入 DTO（CEO 準拠・識別子は opaque personRef のみ）。 */
export interface RelationshipObservation {
  readonly personRef: string;
  readonly relationKind: RelationKind;
  readonly touchpointId: RelationshipTouchpointId;
  readonly dateISO?: string; // annual の記念日 / pre/post event の当日
  readonly daysSinceLastContact?: number;
  readonly followupDueISO?: string; // お礼/お返し/返却の期限
  readonly occasionFrame?: GiftOccasionFrame;
  readonly desireSignals?: readonly DesireSignal[];
  readonly suppression?: RelationshipSuppression;
}

/** annual touchpoint の準備リード（日）。 */
const ANNUAL_LEAD_DAYS = 7;
/** followup の「近い」リード（日）。 */
const FOLLOWUP_LEAD_DAYS = 3;

/** 久々連絡の関係別閾値（日）。 */
const CONTACT_THRESHOLD: Record<RelationKind, number> = {
  family: 45,
  partner: 21,
  close_friend: 60,
  friend: 90,
  colleague: 120,
  mentor: 90,
  acquaintance: 180,
};
const VISIT_FAMILY_THRESHOLD = 60;

const ANNUAL_TOUCHPOINTS = new Set<RelationshipTouchpointId>(["birthday", "anniversary", "seasonal_gift"]);
const FOLLOWUP_TOUCHPOINTS = new Set<RelationshipTouchpointId>([
  "thank_you_followup", "return_gift", "borrowed_item_return", "introduction_thanks", "hosted_meal_thanks", "support_thanks",
]);

/** post-event 窓（小さな pure 拡張・日付は注入＝calendar 推定なし）: 終了後 [min,max] 日。 */
export function isWithinPostEventWindow(eventISO: string, nowISO: string, minDays: number, maxDays: number): boolean {
  const since = daysBetween(eventISO, nowISO);
  return since !== null && since >= minDays && since <= maxDays;
}

interface Timing {
  readonly due: boolean;
  readonly daysUntil: number | null;
  readonly daysSince: number | null;
  readonly overdue: boolean;
}

const NOT_DUE: Timing = { due: false, daysUntil: null, daysSince: null, overdue: false };

/** touchpoint ごとの時間判定（既存 engine 流用）。 */
function evaluateTiming(obs: RelationshipObservation, nowISO: string): Timing {
  const tp = obs.touchpointId;
  if (ANNUAL_TOUCHPOINTS.has(tp)) {
    if (!obs.dateISO) return NOT_DUE;
    const t = Date.parse(obs.dateISO);
    if (Number.isNaN(t)) return NOT_DUE;
    const d = new Date(t);
    const status = computeRecurringStatus(ANNUAL_LEAD_DAYS, { kind: "annual", month: d.getUTCMonth() + 1, day: d.getUTCDate() }, nowISO);
    return status.phase === "within_lead" && status.daysUntilNext !== null
      ? { due: true, daysUntil: status.daysUntilNext, daysSince: null, overdue: false }
      : NOT_DUE;
  }
  if (FOLLOWUP_TOUCHPOINTS.has(tp)) {
    if (!obs.followupDueISO) return NOT_DUE;
    const daysUntil = daysBetween(nowISO, obs.followupDueISO);
    if (daysUntil === null) return NOT_DUE;
    return daysUntil <= FOLLOWUP_LEAD_DAYS
      ? { due: true, daysUntil, daysSince: null, overdue: daysUntil < 0 }
      : NOT_DUE;
  }
  if (tp === "long_time_no_contact" || tp === "visit_family") {
    const since = obs.daysSinceLastContact;
    if (since === undefined || since < 0) return NOT_DUE;
    const threshold = tp === "visit_family" ? VISIT_FAMILY_THRESHOLD : CONTACT_THRESHOLD[obs.relationKind];
    return since >= threshold ? { due: true, daysUntil: null, daysSince: since, overdue: false } : NOT_DUE;
  }
  if (tp === "pre_event_encouragement") {
    if (!obs.dateISO) return NOT_DUE;
    const daysUntil = daysBetween(nowISO, obs.dateISO);
    return daysUntil !== null && daysUntil >= 0 && daysUntil <= 2
      ? { due: true, daysUntil, daysSince: null, overdue: false }
      : NOT_DUE;
  }
  if (tp === "post_event_result_check" || tp === "post_meeting_followup") {
    if (!obs.dateISO) return NOT_DUE;
    const [min, max] = tp === "post_event_result_check" ? [1, 5] : [0, 3];
    if (!isWithinPostEventWindow(obs.dateISO, nowISO, min, max)) return NOT_DUE;
    return { due: true, daysUntil: null, daysSince: daysBetween(obs.dateISO, nowISO), overdue: false };
  }
  return NOT_DUE; // casual_checkin / shared_plan_followup 等は本 slice 対象外
}

/** gift optional metadata（giftRelevant ∧ 有意 signal あり ∧ 全 low-confidence でない時のみ・最大 3）。 */
function optionalGifts(obs: RelationshipObservation, nowISO: string): readonly GiftRecommendation[] | undefined {
  void nowISO;
  const spec = getTouchpointSpec(obs.touchpointId);
  if (!spec?.giftRelevant) return undefined;
  if (!obs.desireSignals || obs.desireSignals.length === 0) return undefined; // 根拠なしで商品を出さない
  const frame: GiftOccasionFrame = obs.occasionFrame ?? {
    touchpointId: obs.touchpointId,
    relationKind: obs.relationKind,
    budgetBand: defaultBudgetBand(obs.relationKind, obs.touchpointId),
    formality: "standard",
  };
  const recs = recommendGifts(
    { personRef: obs.personRef, frame, signals: obs.desireSignals, suppression: obs.suppression },
    3
  );
  if (recs.length === 0) return undefined;
  // stale/low confidence のみ＝リスク高 → 添付しない（easy/experience の汎用枠でなく**根拠由来**の rec で判定）
  const signalDerived = recs.filter((r) => r.strategy === "safe" || r.strategy === "surprise" || r.strategy === "premium");
  if (signalDerived.length === 0 || signalDerived.every((r) => r.confidence === "low")) return undefined;
  return recs;
}

/**
 * A-6: RelationshipObservation[] → LifeOpsCandidate[]（pure・nowISO 注入・入力順安定）。
 *   invalid personRef / suppression / 時間条件未達 は skip（fail-closed）。gift は optional metadata。
 */
export function generateRelationshipCandidates(
  observations: readonly RelationshipObservation[],
  nowISO: string
): readonly LifeOpsCandidate[] {
  const cat = getCategorySpec("relationship_care");
  if (!cat) return [];
  const out: LifeOpsCandidate[] = [];
  for (const obs of observations) {
    if (!isOpaquePersonRef(obs.personRef)) continue; // 実名/連絡先風は構造的に弾く
    if (!getTouchpointSpec(obs.touchpointId)) continue;
    if (obs.suppression && !evaluateSuppression(obs.touchpointId, obs.suppression).allowed) continue;
    const timing = evaluateTiming(obs, nowISO);
    if (!timing.due) continue;
    const gifts = optionalGifts(obs, nowISO);
    const dueReason: RelationshipDueReason = {
      kind: "relationship",
      touchpointId: obs.touchpointId,
      relationKind: obs.relationKind,
      personRef: obs.personRef,
      daysUntil: timing.daysUntil,
      daysSince: timing.daysSince,
      overdue: timing.overdue,
      ...(gifts ? { giftRecommendations: gifts } : {}),
    };
    out.push({
      category: cat.id,
      menu: null,
      dueReason,
      suggestedWindow: null,
      placeQuery: null,
      permissionLevelHint: cat.defaultMaxLevelHint, // L2=suggest（正本は assessRelationshipPermission）
      riskFlags: cat.typicalRiskFlags,
    });
  }
  return out;
}
