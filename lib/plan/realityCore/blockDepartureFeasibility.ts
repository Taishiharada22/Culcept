/**
 * blockDepartureFeasibility — RO-2 D6（2026-06-20）: RO-1 ScheduledWorkBlock × 出発線の read-only 接続口（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro2-mobility-control-tower-design.md（RO-2 D6・v0.2）
 * 思想: 移動・出発線の正本は ern/MovementReality 側。RO-1 の TaskRealityNode/ScheduledWorkBlock の**型を一切変更しない**。
 *   唯一の additive は TaskPlacementRiskFactor への `needs_departure_before_window` 1 値追加（taskPlacementFeasibility.ts）。
 *   block が anchored（場所を持つ配置）になった時に初めて出発線が要り、anchorId が指す ern の二段 leaveBy を **read-only** で読む。
 *
 * 不変条件:
 *   - **block を mutate しない**（read-only 比較）。
 *   - anchored（anchorId≠null）かつ hard 解決時のみ評価（ern 不在の偽判定を防ぐ＝RO-1 を侵食しない）。
 *   - IO / RNG / now / Date / DB / write を持たない。
 */
import type { ScheduledWorkBlockV0 } from "./scheduledWorkBlock";
import type { LeaveByLinesV0 } from "./leaveByLines";
import type { TaskPlacementRiskFactor } from "./taskPlacementFeasibility";

export const BLOCK_DEPARTURE_FEASIBILITY_VERSION = 0;

export interface BlockDepartureFeasibilityV0 {
  /** anchored ∧ hard 解決のときのみ true（評価可能）。 */
  readonly evaluable: boolean;
  /** hard 出発線が block.plannedWindow.endHHMM 以前 ＝ 作業窓の前/最中に出発が要る。 */
  readonly needsDepartureBeforeWindow: boolean;
  /** needsDepartureBeforeWindow=true のとき供給する RO-1 risk factor（additive union）。 */
  readonly riskFactor: TaskPlacementRiskFactor | null;
}

const HHMM_FROM_ISO = (iso: string): string | null => {
  // canonical "YYYY-MM-DDTHH:MM:SS+09:00" → chars 11-15 = "HH:MM"
  if (iso.length < 16 || iso[10] !== "T") return null;
  const hh = iso.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(hh) ? hh : null;
};

/**
 * blockDepartureFeasibility — read-only。anchored block と ern の二段 leaveBy（hard）を比較し、
 *   出発線が作業窓の前/最中に来るかを返す（block を mutate しない）。
 */
export function blockDepartureFeasibility(
  block: ScheduledWorkBlockV0,
  leaveByLines: LeaveByLinesV0,
): BlockDepartureFeasibilityV0 {
  // anchored 化前 / hard 未解決 → 評価しない（偽判定を防ぐ）
  if (block.placementKind !== "anchored" || leaveByLines.hard.value === null) {
    return { evaluable: false, needsDepartureBeforeWindow: false, riskFactor: null };
  }
  const hardHHMM = HHMM_FROM_ISO(leaveByLines.hard.value);
  if (hardHHMM === null) {
    return { evaluable: false, needsDepartureBeforeWindow: false, riskFactor: null };
  }
  // hard 出発線 ≤ block 窓 end ＝ 作業窓の前/最中に出発が要る（read-only HH:MM 文字列比較）
  const needs = hardHHMM <= block.plannedWindow.endHHMM;
  return {
    evaluable: true,
    needsDepartureBeforeWindow: needs,
    riskFactor: needs ? "needs_departure_before_window" : null,
  };
}
