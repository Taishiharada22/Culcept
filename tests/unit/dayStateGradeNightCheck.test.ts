/**
 * gradeNightCheck — 採点方向の必須 fixture（HARD-14）
 * over = 凍結見立てが実際より高かった → prior 下げ / under = 低かった → 上げ（設計書 §4.3 唯一定義）
 */
import {
  gradeNightCheck,
  gradeEnergyLevel,
  gradeRecoveryNeed,
  gradeDayFeasibility,
  isHeadlineEligible,
} from "@/lib/plan/dayState/gradeNightCheck";
import { buildDayStateRecord } from "@/lib/plan/dayState/buildDayStateRecord";
import type {
  DayFelt,
  DayFeasibilityLevel,
  DayStateBuildInput,
  EnergyLevelValue,
  GradeVerdict,
  PlanVerdict,
} from "@/lib/plan/dayState/dayStateTypes";

function baseInput(over: Partial<DayStateBuildInput> = {}): DayStateBuildInput {
  return {
    date: "2026-06-11",
    nowHHMM: "07:30",
    segments: [
      { kind: "event", startHHMM: "10:00", endHHMM: "11:00", durationMin: 60, timeBucket: "morning" },
      { kind: "gap", startHHMM: "20:00", endHHMM: "22:00", durationMin: 120, timeBucket: "night" },
    ],
    shift: { kind: "none" },
    weather: null,
    ...over,
  };
}

describe("gradeEnergyLevel — dayFelt × 凍結帯の全行（§4.3 対応表）", () => {
  // [frozen, felt, expected]
  const TABLE: Array<[EnergyLevelValue, DayFelt, GradeVerdict | null]> = [
    ["high", 5, "match"], ["medium", 5, "match"], ["low", 5, "under"], ["depleted", 5, "under"],
    ["high", 4, "match"], ["medium", 4, "match"], ["low", 4, "under"], ["depleted", 4, "under"],
    ["high", 3, "match"], ["medium", 3, "match"], ["low", 3, "match"], ["depleted", 3, "under"],
    ["high", 2, "over"], ["medium", 2, "match"], ["low", 2, "match"], ["depleted", 2, "under"],
    ["high", 1, "over"], ["medium", 1, "over"], ["low", 1, "match"], ["depleted", 1, "match"],
    ["unknown", 3, null],
  ];
  it.each(TABLE)("frozen=%s × felt=%s → %s", (frozen, felt, expected) => {
    expect(gradeEnergyLevel(frozen, felt)).toBe(expected);
  });
});

describe("gradeRecoveryNeed — 3 値スケールは ±1 吸収なし（§5.2 が正・契約裁定）", () => {
  it("凍結 high × felt5（actual low）→ over / felt4 → over", () => {
    expect(gradeRecoveryNeed("high", 5)).toBe("over");
    expect(gradeRecoveryNeed("high", 4)).toBe("over");
  });
  it("凍結 low/medium × felt2（actual high）→ under（§5.2 の明示セル）", () => {
    expect(gradeRecoveryNeed("low", 2)).toBe("under");
    expect(gradeRecoveryNeed("medium", 2)).toBe("under");
  });
  it("凍結 medium: felt3 → match / felt4-5（actual low）→ over", () => {
    expect(gradeRecoveryNeed("medium", 3)).toBe("match");
    expect(gradeRecoveryNeed("medium", 5)).toBe("over");
  });
  it("一致は match", () => {
    expect(gradeRecoveryNeed("high", 1)).toBe("match");
    expect(gradeRecoveryNeed("low", 5)).toBe("match");
  });
  it("凍結 unknown → null（記録のみ）", () => {
    expect(gradeRecoveryNeed("unknown", 3)).toBeNull();
  });
});

describe("gradeDayFeasibility — 9 ケース行列（handoff-A 必須）", () => {
  const MATRIX: Array<[DayFeasibilityLevel, PlanVerdict, GradeVerdict]> = [
    ["likely_steady", "as_seen", "match"],
    ["likely_steady", "partial_drift", "over"],
    ["likely_steady", "major_drift", "over"],
    ["mixed", "as_seen", "under"],
    ["mixed", "partial_drift", "match"],
    ["mixed", "major_drift", "over"],
    ["likely_fragile", "as_seen", "under"],
    ["likely_fragile", "partial_drift", "under"],
    ["likely_fragile", "major_drift", "match"],
  ];
  it.each(MATRIX)("frozen=%s × actual=%s → %s", (frozen, verdict, expected) => {
    expect(gradeDayFeasibility(frozen, verdict)).toBe(expected);
  });
  it("凍結 unknown → null", () => {
    expect(gradeDayFeasibility("unknown", "as_seen")).toBeNull();
  });
});

describe("gradeNightCheck — 方向と出力の統合", () => {
  it("over → direction lower / under → raise（方向逆走の再発防止）", () => {
    // 凍結 energy = high（energetic タップ）で felt=1 → over → lower
    const recordOver = buildDayStateRecord(baseInput({ moodCode: "energetic" }));
    const gradeOver = gradeNightCheck(recordOver, { dayFelt: 1, answeredAt: "21:00" });
    expect(gradeOver.verdicts.energyLevel).toBe("over");
    const adjOver = gradeOver.nextDayPriorAdjustments.find((a) => a.field === "energyLevel");
    expect(adjOver?.direction).toBe("lower");

    // 凍結 energy = low（tired タップ）で felt=5 → under → raise
    const recordUnder = buildDayStateRecord(baseInput({ moodCode: "tired" }));
    const gradeUnder = gradeNightCheck(recordUnder, { dayFelt: 5, answeredAt: "21:00" });
    expect(gradeUnder.verdicts.energyLevel).toBe("under");
    const adjUnder = gradeUnder.nextDayPriorAdjustments.find((a) => a.field === "energyLevel");
    expect(adjUnder?.direction).toBe("raise");
  });

  it("contextKey = shift 種別 × density 帯", () => {
    const record = buildDayStateRecord(
      baseInput({ moodCode: "energetic", shift: { kind: "work", startTime: "22:00", endTime: "06:00" } }),
    );
    const grade = gradeNightCheck(record, { dayFelt: 1, answeredAt: "21:00" });
    expect(grade.nextDayPriorAdjustments[0]?.contextKey).toBe("shift_night|sparse");
  });

  it("carryOverOut: felt1→high / felt2→some / felt3+→none、skipped で unfinishedAnchor", () => {
    const record = buildDayStateRecord(baseInput({ moodCode: "tired" }));
    expect(gradeNightCheck(record, { dayFelt: 1, answeredAt: "21:00" }).carryOverOut.recoveryDebt).toBe("high");
    expect(gradeNightCheck(record, { dayFelt: 2, answeredAt: "21:00" }).carryOverOut.recoveryDebt).toBe("some");
    expect(gradeNightCheck(record, { dayFelt: 4, answeredAt: "21:00" }).carryOverOut.recoveryDebt).toBe("none");
    const withDrift = gradeNightCheck(record, {
      dayFelt: 3,
      answeredAt: "21:00",
      planVerdict: "partial_drift",
      driftSelections: [{ anchorId: "a1", driftType: "skipped" }],
    });
    expect(withDrift.carryOverOut.unfinishedAnchor).toBe(true);
  });

  it("lateNightEnd: 02:00 回答（late_night）で true、21:00 で false", () => {
    const record = buildDayStateRecord(baseInput({ moodCode: "tired" }));
    expect(gradeNightCheck(record, { dayFelt: 3, answeredAt: "02:00" }).carryOverOut.lateNightEnd).toBe(true);
    expect(gradeNightCheck(record, { dayFelt: 3, answeredAt: "21:00" }).carryOverOut.lateNightEnd).toBe(false);
  });

  it("planVerdict なし → dayFeasibility は採点されない", () => {
    const record = buildDayStateRecord(baseInput({ moodCode: "tired" }));
    const grade = gradeNightCheck(record, { dayFelt: 3, answeredAt: "21:00" });
    expect(grade.verdicts.dayFeasibility).toBeUndefined();
  });
});

describe("isHeadlineEligible — user_confirmed 除外 + morning_baseline 限定（§3.2/§10.2 二重層別）", () => {
  it("inferred × morning_baseline → eligible", () => {
    expect(isHeadlineEligible({ value: "low", confidence: 0.5, source: "inferred" }, "morning_baseline")).toBe(true);
  });
  it("user_confirmed（本人申告の追認）は除外", () => {
    expect(isHeadlineEligible({ value: "low", confidence: 0.9, source: "user_confirmed" }, "morning_baseline")).toBe(
      false,
    );
  });
  it("first_open_snapshot / late_snapshot は除外（昼夜凍結日を朝の精度に混ぜない）", () => {
    expect(isHeadlineEligible({ value: "low", confidence: 0.5, source: "inferred" }, "first_open_snapshot")).toBe(false);
    expect(isHeadlineEligible({ value: "low", confidence: 0.5, source: "derived" }, "late_snapshot")).toBe(false);
  });
});
