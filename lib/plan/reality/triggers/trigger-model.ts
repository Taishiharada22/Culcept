/**
 * Reality Control OS — R4-1 Trigger Model / Input Contract（**pure・no-DB/route/UI**・barrel 非 export）
 *
 * 設計: docs/r4-trigger-asset-audit-and-boundary.md（R4-0）/ docs/reality-secretary-os-unbuilt-roadmap.md（R4）
 *
 * 役割: 「いつ起動するか」の **trigger taxonomy** と評価入力 `TriggerContext`。WorldState（R3）signal のみで判断する
 *   pure 範囲を型で固定し、**位置ベース trigger は deferred**（live GPS 必須・現段階で評価しない）として分離する。
 *
 * 厳守: WorldState signal のみ・捏造発火しない・配送しない（評価のみ）・正本型を作らない・pure。
 */

import type { WorldState } from "../world-state/world-state";
import type { EmptyDayProposalSet } from "../empty-day/empty-day-generator";

/** **pure 評価可能**な trigger（WorldState signal のみ）。 */
export type TriggerKind = "preflight" | "empty_day" | "gap_opportunity" | "wind_down";

/** **deferred**（live GPS/native background 必須ゆえ現段階で評価しない）。捏造位置で発火させない。 */
export type DeferredTriggerKind = "departure" | "linger" | "off_route";

export const TRIGGER_KINDS: readonly TriggerKind[] = ["preflight", "empty_day", "gap_opportunity", "wind_down"];
export const DEFERRED_TRIGGER_KINDS: readonly DeferredTriggerKind[] = ["departure", "linger", "off_route"];

/** surface 優先度（gating で使用・preflight が最優先＝時間critical）。 */
export const TRIGGER_PRIORITY: Record<TriggerKind, number> = { preflight: 4, gap_opportunity: 3, empty_day: 2, wind_down: 1 };

/** trigger 評価の入力（WorldState + 任意の empty-day 提案）。 */
export interface TriggerContext {
  readonly worldState: WorldState;
  /** empty_day trigger の content 用（caller が R2/R3 で precompute・null=未計算）。 */
  readonly emptyDay: EmptyDayProposalSet | null;
}

/** leaveBy 用 placeholder buffer（**MAP routing でない**・粗い・readiness で flag）。 */
export const DEFAULT_TRAVEL_BUFFER_MIN = 30;
export const DEFAULT_PREP_BUFFER_MIN = 15;

/** 時間帯境界（分・bandFromHour と整合: 朝 5-11h / 昼 11-17h / 夜 17-23h）。 */
export const MORNING_START_MIN = 5 * 60; // 300
export const MORNING_END_MIN = 11 * 60; // 660
export const EVENING_START_MIN = 20 * 60; // 1200（wind_down は遅め夜）

/** 評価しきい値（R4-2/R4-4 で使用）。 */
export const GAP_IMMINENT_MIN = 15; // 窓開始まで ≤15 分＝間もなく
export const GAP_MIN_USABLE_MIN = 45; // 空き枠が ≥45 分で意味あり
export const PREFLIGHT_LEAD_MIN = 45; // leaveBy まで ≤45 分で preflight 候補

/** todaySchedule から「次の予定」（now より後で最も早い開始）。null=なし。 */
export function nextCommitment(ws: WorldState): WorldState["todaySchedule"][number] | null {
  if (ws.nowMinute == null) return null;
  const now = ws.nowMinute;
  let best: WorldState["todaySchedule"][number] | null = null;
  for (const c of ws.todaySchedule) {
    if (c.startMinute > now && (best === null || c.startMinute < best.startMinute)) best = c;
  }
  return best;
}
