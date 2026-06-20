/**
 * gradeNightCheck — Night Check 回答による採点（Prediction Ledger v0 入口）pure 関数
 *
 * 正本: docs/day-state-alter-tab-v0-design.md §4-5（v0.3）
 * 規律（HIGH-1 の再発防止 — 本書全体で唯一の方向定義）:
 *   over  = 凍結見立てが実際より高かった（過大）→ 翌日の同条件 prior を 1 段下げる
 *   under = 凍結見立てが実際より低かった（過小）→ 1 段上げる
 *   採点は必ず estimatesFrozen に対して行う（補正後の現在値は採点しない）。
 *   採点対象は energyLevel / recoveryNeed（主問）+ dayFeasibility（followup）の 3 つのみ。
 *   人体 3 系統（focusReserve / emotionalReserve / energyLevel）とは別の 3 — 重なるのは energyLevel だけ。
 *   match の confidence +0.1 は verdicts から消費側が導出する（adjustments は方向シフトのみ）。
 *   nextDayPriorAdjustments / carryOverOut の「翌日の見立て」への消費は Stage 3（B1 gate）。
 */

import type {
  CarryOverOut,
  DayFelt,
  DayStateRecordV0,
  EnergyLevelValue,
  GradeVerdict,
  NextDayPriorAdjustment,
  NightCheckDriftSelection,
  NightCheckGradeV0,
  PlanVerdict,
  RecoveryNeedLevel,
  DayFeasibilityLevel,
  FrozenKind,
  ConfidentValue,
} from "./dayStateTypes";
import { toTimeBucket } from "./timeOfDay";

export interface NightCheckAnswerInput {
  dayFelt: DayFelt;
  planVerdict?: PlanVerdict;
  driftSelections?: NightCheckDriftSelection[];
  answeredAt: string; // "HH:MM"
}

// ── dayFelt → actual 換算（設計書 §4.3） ──
// energyLevel: 5→high / 4→high〜medium / 3→medium / 2→low / 1→depleted
// recoveryNeed: 1-2→high / 3→medium / 4-5→low

const ENERGY_ORDER: readonly Exclude<EnergyLevelValue, "unknown">[] = ["depleted", "low", "medium", "high"];

/**
 * energyLevel の判定（§4.3 dayFelt↔帯 対応表をそのまま実装）。
 * ±1 帯は match に吸収する（felt4 のみ actual が high〜medium の範囲値のため別表）。
 */
export function gradeEnergyLevel(frozen: EnergyLevelValue, felt: DayFelt): GradeVerdict | null {
  if (frozen === "unknown") return null; // 採点対象外（記録のみ）
  const fIdx = ENERGY_ORDER.indexOf(frozen as Exclude<EnergyLevelValue, "unknown">);
  switch (felt) {
    case 5: // actual = high
      return fIdx >= 2 ? "match" : "under"; // medium は ±1 内 / low・depleted は under
    case 4: // actual = high〜medium
      return fIdx >= 2 ? "match" : "under";
    case 3: // actual = medium
      if (frozen === "depleted") return "under";
      return "match"; // high / medium / low は ±1 内
    case 2: // actual = low
      if (frozen === "high") return "over";
      if (frozen === "depleted") return "under";
      return "match";
    case 1: // actual = depleted
      return fIdx >= 2 ? "over" : "match"; // medium・high → over / low は ±1 内
  }
}

const RECOVERY_ORDER: readonly Exclude<RecoveryNeedLevel, "unknown">[] = ["low", "medium", "high"];

export function gradeRecoveryNeed(frozen: RecoveryNeedLevel, felt: DayFelt): GradeVerdict | null {
  if (frozen === "unknown") return null;
  const actual: Exclude<RecoveryNeedLevel, "unknown"> = felt <= 2 ? "high" : felt === 3 ? "medium" : "low";
  const dist =
    RECOVERY_ORDER.indexOf(frozen as Exclude<RecoveryNeedLevel, "unknown">) - RECOVERY_ORDER.indexOf(actual);
  // 契約裁定（v0.3 監査 MED-1）: ±1 吸収は 4 値の energyLevel のみ。
  // 3 値スケールに吸収を入れると凍結 medium の日が永遠に match となり学習信号が消えるため、
  // §5.2 の明示セル（felt=2 × 凍結 low/medium → under）を正とし、1 段差も over/under とする。
  if (dist > 0) return "over";
  if (dist < 0) return "under";
  return "match";
}

// dayFeasibility の 9 ケース行列（handoff-A 必須テスト対象。順序 likely_steady > mixed > likely_fragile）
const FEASIBILITY_ORDER: readonly Exclude<DayFeasibilityLevel, "unknown">[] = [
  "likely_fragile",
  "mixed",
  "likely_steady",
];

export function gradeDayFeasibility(frozen: DayFeasibilityLevel, verdict: PlanVerdict): GradeVerdict | null {
  if (frozen === "unknown") return null;
  const actual: Exclude<DayFeasibilityLevel, "unknown"> =
    verdict === "as_seen" ? "likely_steady" : verdict === "partial_drift" ? "mixed" : "likely_fragile";
  const dist =
    FEASIBILITY_ORDER.indexOf(frozen as Exclude<DayFeasibilityLevel, "unknown">) -
    FEASIBILITY_ORDER.indexOf(actual);
  if (dist > 0) return "over"; // 堅く見すぎ（実際は崩れた）
  if (dist < 0) return "under"; // 脆く見すぎ（実際は保った）
  return "match";
}

function shiftTag(record: DayStateRecordV0): string {
  const s = record.facts.shift;
  if (s.isNightShift === true) return "shift_night";
  if (s.kind === "work") return "shift_work";
  if (s.kind === "off" || s.kind === "off_request") return "day_off";
  return "none";
}

/**
 * ヘッドライン match 率への算入可否（§3.2 / §10.2 の二重層別）。
 * 集計側（Stage 2+）が使う規律を pure 関数として固定する。
 */
export function isHeadlineEligible(frozenValue: ConfidentValue<unknown>, frozenKind: FrozenKind): boolean {
  return (
    frozenKind === "morning_baseline" &&
    (frozenValue.source === "inferred" || frozenValue.source === "derived")
  );
}

export function gradeNightCheck(record: DayStateRecordV0, answer: NightCheckAnswerInput): NightCheckGradeV0 {
  const frozen = record.estimatesFrozen.values;
  const verdicts: NightCheckGradeV0["verdicts"] = {};

  const energyVerdict = gradeEnergyLevel(frozen.energyLevel.value, answer.dayFelt);
  if (energyVerdict !== null) verdicts.energyLevel = energyVerdict;

  const recoveryVerdict = gradeRecoveryNeed(frozen.recoveryNeed.value, answer.dayFelt);
  if (recoveryVerdict !== null) verdicts.recoveryNeed = recoveryVerdict;

  if (answer.planVerdict !== undefined) {
    const feasibilityVerdict = gradeDayFeasibility(frozen.dayFeasibility.value, answer.planVerdict);
    if (feasibilityVerdict !== null) verdicts.dayFeasibility = feasibilityVerdict;
  }

  const carryOverOut: CarryOverOut = {
    recoveryDebt: answer.dayFelt === 1 ? "high" : answer.dayFelt === 2 ? "some" : "none",
    unfinishedAnchor: answer.driftSelections?.some((d) => d.driftType === "skipped") ?? false,
    lateNightEnd: toTimeBucket(answer.answeredAt) === "late_night",
  };

  const contextKey = `${shiftTag(record)}|${record.facts.density}`;
  const nextDayPriorAdjustments: NextDayPriorAdjustment[] = [];
  for (const field of ["energyLevel", "recoveryNeed", "dayFeasibility"] as const) {
    const v = verdicts[field];
    if (v === "over") nextDayPriorAdjustments.push({ field, contextKey, direction: "lower", confidenceDelta: 0 });
    if (v === "under") nextDayPriorAdjustments.push({ field, contextKey, direction: "raise", confidenceDelta: 0 });
  }

  return { verdicts, carryOverOut, nextDayPriorAdjustments };
}
