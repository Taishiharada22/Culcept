/**
 * Reality Control OS — R4-2 Trigger Condition Evaluator（**pure・no-DB/route/UI**・barrel 非 export）
 *
 * 設計: docs/r4-trigger-asset-audit-and-boundary.md（R4-0）/ trigger-model.ts（R4-1）
 *
 * 役割: WorldState から **どの trigger が発火するか**を pure 評価。時刻/予定/状態系のみ（位置系は deferred で評価しない）。
 *   nowMinute 不明なら時刻系は発火しない（**捏造しない**）。leaveBy は placeholder buffer で粗く（coarse flag）。
 *   発火「候補」を返すだけ（実際に surface するかは R4-4 gating が silence-by-default で決める）。
 *
 * 厳守: WorldState signal のみ・捏造発火しない・配送しない・pure・Date.now なし（nowMinute は WorldState 由来）。
 */

import { normalizeWorldState } from "../world-state/world-state";
import {
  nextCommitment,
  DEFAULT_TRAVEL_BUFFER_MIN,
  DEFAULT_PREP_BUFFER_MIN,
  MORNING_START_MIN,
  MORNING_END_MIN,
  EVENING_START_MIN,
  GAP_IMMINENT_MIN,
  GAP_MIN_USABLE_MIN,
  PREFLIGHT_LEAD_MIN,
  type TriggerContext,
  type TriggerKind,
} from "./trigger-model";

export interface FiredTrigger {
  readonly kind: TriggerKind;
  readonly fireScore: number; // 0..1
  readonly leadMinutes: number | null; // preflight: 次予定まで / gap: 窓開始まで
  readonly leaveByMinute: number | null; // preflight only（placeholder ゆえ粗い）
  readonly windowRef: { readonly startMinute: number; readonly endMinute: number } | null; // gap_opportunity
  readonly coarse: boolean; // placeholder（leaveBy 等）に依存＝粗い
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * R4-2: WorldState から発火候補を返す。nowMinute null → 時刻系は発火しない（捏造しない）。
 */
export function evaluateTriggers(ctx: TriggerContext): readonly FiredTrigger[] {
  const ws = normalizeWorldState(ctx.worldState);
  const now = ws.nowMinute;
  if (now == null) return []; // 時刻不明では発火しない
  const out: FiredTrigger[] = [];

  // ── preflight: 次予定の leaveBy が接近 ──
  const nc = nextCommitment(ws);
  if (nc) {
    const travelBuf = ws.mobility?.typicalTravelBufferMin ?? DEFAULT_TRAVEL_BUFFER_MIN;
    const leaveBy = nc.startMinute - (travelBuf + DEFAULT_PREP_BUFFER_MIN);
    const minToLeave = leaveBy - now;
    if (minToLeave <= PREFLIGHT_LEAD_MIN && minToLeave >= -PREFLIGHT_LEAD_MIN) {
      const fireScore = minToLeave < 0 ? 1 : clamp(1 - minToLeave / PREFLIGHT_LEAD_MIN, 0, 1); // leaveBy 超過は最優先
      out.push({ kind: "preflight", fireScore, leadMinutes: nc.startMinute - now, leaveByMinute: leaveBy, windowRef: null, coarse: true });
    }
  }

  // ── empty_day: 朝帯 ∧ 予定なし ∧ 空き窓あり ──
  if (now >= MORNING_START_MIN && now < MORNING_END_MIN && ws.todaySchedule.length === 0 && ws.availableWindows.length > 0) {
    out.push({ kind: "empty_day", fireScore: 0.6, leadMinutes: null, leaveByMinute: null, windowRef: null, coarse: false });
  }

  // ── gap_opportunity: 間もなく開始 or 進行中の十分な空き枠 ──
  const windows = [...ws.availableWindows].sort((a, b) => a.startMinute - b.startMinute);
  for (const w of windows) {
    const imminent = w.startMinute >= now && w.startMinute - now <= GAP_IMMINENT_MIN && w.endMinute - w.startMinute >= GAP_MIN_USABLE_MIN;
    const active = now >= w.startMinute && now < w.endMinute && w.endMinute - now >= GAP_MIN_USABLE_MIN;
    if (imminent || active) {
      out.push({ kind: "gap_opportunity", fireScore: 0.5, leadMinutes: Math.max(0, w.startMinute - now), leaveByMinute: null, windowRef: { startMinute: w.startMinute, endMinute: w.endMinute }, coarse: false });
      break; // 最も早い 1 件のみ
    }
  }

  // ── wind_down: 遅め夜帯 ∧ 今日予定あり ──
  if (now >= EVENING_START_MIN && ws.todaySchedule.length > 0) {
    out.push({ kind: "wind_down", fireScore: 0.4, leadMinutes: null, leaveByMinute: null, windowRef: null, coarse: false });
  }

  return out;
}
