/**
 * taskPlacementFeasibility — RO-1 D3（2026-06-20）: task × candidateWindow の成立性評価の入口（pure・no-IO）
 *
 * 正本設計: docs/reality-os-ro1-task-work-foundation-design.md（RO-1 D3・v0.1）
 * 思想: **Energy 部署がここで参加する**。既存 DayStateEstimates（推定層・③）を**読み**、task×window の成立性を
 *   FitLevel で返す。Energy の「測れるが判断できない」を「判断できる」に変える入口。
 *   CEO v0.1: emotionalReserve（心バッテリー）を入れ、対人/連絡作業の成立性（emotionalFit）を判断可能にする。
 *
 * 不変条件（honest heuristic）:
 *   - 出力は全て RealityAttribute・**heuristic（confidence ≤0.35・debugOnly）**。hard line に使わない
 *   - 入力推定が unknown の fit は unknownAttribute（捏造しない）
 *   - **新規 energy 観測はしない**（既存 estimates を消費するだけ）
 *   - riskFactors は**閉じた union**（自由文禁止・型で保証）
 *   - IO / RNG / now / DB / write を持たない
 */
import {
  unknownAttribute,
  heuristicAttribute,
  type RealityAttribute,
} from "./realityAttribute";
import type { TaskRealityNodeV0 } from "./taskRealityNode";
import { hhmmToMin } from "./scheduledWorkBlock";
import type {
  EnergyLevelValue,
  ReserveLevel,
  RecoveryNeedLevel,
  MomentStateV0,
} from "@/lib/plan/dayState/dayStateTypes";
import type { ConfidentValue } from "@/lib/stargazer/alterHomeAdapter";
import type { TimeBucket } from "@/lib/plan/dayGraph/dayGraphTypes";

export const TASK_PLACEMENT_FEASIBILITY_VERSION = 0;

export type FitLevel = "low" | "medium" | "high" | "unknown";

/** CEO v0.1: string でなく最初から閉じた union（実装時の自由文混入を型で防ぐ・leak guard 整合）。 */
export type TaskPlacementRiskFactor =
  | "evening_high_load"
  | "low_focus_reserve"
  | "low_emotional_reserve"
  | "deadline_tight"
  | "window_too_short"
  | "cannot_split"
  | "high_cognitive_load"
  | "recovery_need_high"
  | "missing_duration"
  | "missing_deadline"
  | "needs_departure_before_window"; // RO-2 D6 additive: anchored block の前に出発線が来る（既存値不変・後方互換）

export interface TaskPlacementFeasibilityInputV0 {
  readonly task: TaskRealityNodeV0;
  readonly candidateWindow: { readonly startHHMM: string; readonly endHHMM: string; readonly timeBucket: TimeBucket | "unknown" };
  /** DayStateEstimates から注入（dayStateTypes.ts:79）。観測はしない。 */
  readonly energy: {
    readonly energyLevel: ConfidentValue<EnergyLevelValue>; // 体バッテリー
    readonly focusReserve: ConfidentValue<ReserveLevel>; // 脳バッテリー
    readonly emotionalReserve: ConfidentValue<ReserveLevel>; // 心バッテリー（CEO v0.1）
    readonly recoveryNeed: ConfidentValue<RecoveryNeedLevel>;
  };
  readonly momentState: MomentStateV0;
}

export interface TaskPlacementFeasibilityV0 {
  readonly energyFit: RealityAttribute<FitLevel>;
  readonly cognitiveLoadFit: RealityAttribute<FitLevel>;
  readonly emotionalFit: RealityAttribute<FitLevel>; // CEO v0.1
  readonly deadlineFit: RealityAttribute<FitLevel>;
  readonly splitFit: RealityAttribute<FitLevel>;
  readonly riskFactors: ReadonlyArray<TaskPlacementRiskFactor>;
}

const EVENINGISH: ReadonlyArray<TimeBucket> = ["evening", "night", "late_night"];
const HEUR_CONF = 0.3; // heuristic 上限（≤0.35）

/** ConfidentValue の source/値で「読めているか」を判定（unknown は読めていない）。 */
function readable<T>(cv: ConfidentValue<T>): boolean {
  return cv.source !== "unknown" && cv.value !== null && cv.value !== undefined;
}

function fitAttr(value: FitLevel, conf: number, evidence: ReadonlyArray<string>): RealityAttribute<FitLevel> {
  return heuristicAttribute<FitLevel>(value, Math.min(conf, HEUR_CONF), evidence, { displayPolicy: "debugOnly" });
}

/** ReserveLevel/EnergyLevelValue を fit に写像（high→high・low/depleted→low）。high cognitiveLoad で 1 段下げる。 */
function reserveToFit(level: string | null, lowerByLoad: boolean): FitLevel {
  if (level === null) return "unknown";
  const base: FitLevel =
    level === "high" ? "high" : level === "medium" ? "medium" : level === "low" || level === "depleted" ? "low" : "unknown";
  if (!lowerByLoad || base === "unknown") return base;
  return base === "high" ? "medium" : base === "medium" ? "low" : "low";
}

/**
 * evaluateTaskPlacementFeasibility — pure heuristic 評価器（v0・seam）。
 *   推定値を読み 5 fit + 閉じた riskFactors を返す。学術的最適化はしない（RO-1 は入口）。
 */
export function evaluateTaskPlacementFeasibility(
  input: TaskPlacementFeasibilityInputV0,
): TaskPlacementFeasibilityV0 {
  const { task, candidateWindow, energy, momentState } = input;
  const risk = new Set<TaskPlacementRiskFactor>();

  const cogLoad = task.cognitiveLoad.value; // 0-1 or null
  const highCogLoad = cogLoad !== null && cogLoad >= 0.66;
  const eveningish = candidateWindow.timeBucket !== "unknown" && EVENINGISH.includes(candidateWindow.timeBucket);
  if (highCogLoad) risk.add("high_cognitive_load");
  if (eveningish && highCogLoad) risk.add("evening_high_load");

  // ── energyFit: 体バッテリー × cognitiveLoad ──
  let energyFit: RealityAttribute<FitLevel>;
  if (!readable(energy.energyLevel)) {
    energyFit = unknownAttribute<FitLevel>({ displayPolicy: "debugOnly", evidenceRefs: ["energy_level_unknown"] });
  } else {
    energyFit = fitAttr(reserveToFit(energy.energyLevel.value, highCogLoad), energy.energyLevel.confidence, ["energy_level", ...(highCogLoad ? ["high_cognitive_load"] : [])]);
  }

  // ── cognitiveLoadFit: 時間帯 × 認知負荷（夜の高負荷は fit 低） ──
  let cognitiveLoadFit: RealityAttribute<FitLevel>;
  if (cogLoad === null) {
    cognitiveLoadFit = unknownAttribute<FitLevel>({ displayPolicy: "debugOnly", evidenceRefs: ["cognitive_load_unknown"] });
  } else {
    const v: FitLevel = eveningish && highCogLoad ? "low" : highCogLoad ? "medium" : "high";
    cognitiveLoadFit = fitAttr(v, task.cognitiveLoad.confidence, ["cognitive_load", "time_bucket"]);
  }

  // ── emotionalFit: 心バッテリー（対人/連絡作業の余力）──
  let emotionalFit: RealityAttribute<FitLevel>;
  if (!readable(energy.emotionalReserve)) {
    emotionalFit = unknownAttribute<FitLevel>({ displayPolicy: "debugOnly", evidenceRefs: ["emotional_reserve_unknown"] });
  } else {
    emotionalFit = fitAttr(reserveToFit(energy.emotionalReserve.value, false), energy.emotionalReserve.confidence, ["emotional_reserve"]);
  }
  if (readable(energy.emotionalReserve) && energy.emotionalReserve.value === "low") risk.add("low_emotional_reserve");
  if (readable(energy.focusReserve) && energy.focusReserve.value === "low") risk.add("low_focus_reserve");
  if (readable(energy.recoveryNeed) && energy.recoveryNeed.value === "high") risk.add("recovery_need_high");

  // ── deadlineFit: window が deadline に間に合うか ──
  let deadlineFit: RealityAttribute<FitLevel>;
  if (task.deadline.value === null) {
    deadlineFit = unknownAttribute<FitLevel>({ displayPolicy: "debugOnly", evidenceRefs: ["deadline_unknown"] });
    risk.add("missing_deadline");
  } else {
    const windowEndIso = `${task.deadline.value.slice(0, 10)}T${candidateWindow.endHHMM}:00`;
    const tight = momentState.timePressure === "high";
    // 文字列 ISO 比較（同日前提・honest な粗さ）。window end ≤ deadline なら間に合う。
    const inTime = windowEndIso <= task.deadline.value;
    const v: FitLevel = !inTime ? "low" : tight ? "medium" : "high";
    if (v !== "high") risk.add("deadline_tight");
    deadlineFit = fitAttr(v, task.deadline.confidence, ["deadline", "candidate_window"]);
  }

  // ── splitFit: canSplit × window 長 vs estimatedDuration × 最小前進 ──
  let splitFit: RealityAttribute<FitLevel>;
  const est = task.estimatedDuration.value;
  const ws = hhmmToMin(candidateWindow.startHHMM);
  const we = hhmmToMin(candidateWindow.endHHMM);
  const windowLen = ws !== null && we !== null && we > ws ? we - ws : null;
  if (est === null) {
    splitFit = unknownAttribute<FitLevel>({ displayPolicy: "debugOnly", evidenceRefs: ["estimated_duration_unknown"] });
    risk.add("missing_duration");
  } else if (windowLen === null) {
    splitFit = unknownAttribute<FitLevel>({ displayPolicy: "debugOnly", evidenceRefs: ["candidate_window_unknown"] });
  } else {
    const fits = windowLen >= est;
    const canSplit = task.canSplit.value === true;
    const hasMinimal = task.minimalProgress !== null && task.minimalProgress.value !== null;
    let v: FitLevel;
    if (fits) v = "high";
    else if (canSplit && hasMinimal) v = "medium"; // 分割で最低限の前進が置ける
    else v = "low";
    if (windowLen < est) {
      risk.add("window_too_short");
      if (!canSplit) risk.add("cannot_split");
    }
    splitFit = fitAttr(v, task.estimatedDuration.confidence, ["estimated_duration", "candidate_window", "can_split"]);
  }

  return {
    energyFit,
    cognitiveLoadFit,
    emotionalFit,
    deadlineFit,
    splitFit,
    riskFactors: [...risk],
  };
}
