/**
 * dayStateHints（W3b）— frame 合成・confidence 規約・walkLevel 防御抽出の fixture
 * 正本: docs/day-state-w3-execution-plan.md §3 / 設計書 §3.3（契約 C-2）
 */
import {
  addDaysIso,
  extractWalkLevel,
  PERSONALITY_PRIOR_CONFIDENCE,
  resolveHintConfidence,
  synthesizeGuidanceFrame,
} from "@/lib/plan/alterTab/dayStateHints";
import type { MorningPlan } from "@/lib/alter-morning/types";

describe("synthesizeGuidanceFrame — energy のみ合成・他は unknown 正直", () => {
  it("moodCode energetic → high 0.7 user_confirmed（最優先）", () => {
    const f = synthesizeGuidanceFrame({ moodCode: "energetic", sleepQuality: "short", isNightShift: true });
    expect(f.energy_level).toEqual({ value: "high", confidence: 0.7, source: "user_confirmed" });
  });
  it("moodCode tired → low 0.7", () => {
    expect(synthesizeGuidanceFrame({ moodCode: "tired" }).energy_level.value).toBe("low");
  });
  it("mood なし × sleep short/shallow → low 0.5 / good → medium 0.4（高エネ断定しない）", () => {
    expect(synthesizeGuidanceFrame({ sleepQuality: "short" }).energy_level).toEqual({
      value: "low", confidence: 0.5, source: "user_confirmed",
    });
    expect(synthesizeGuidanceFrame({ sleepQuality: "good" }).energy_level).toEqual({
      value: "medium", confidence: 0.4, source: "user_confirmed",
    });
  });
  it("夜勤のみ → low 0.5 inferred（buildDayStateRecord の shift_night 規約と整合）", () => {
    expect(synthesizeGuidanceFrame({ isNightShift: true }).energy_level).toEqual({
      value: "low", confidence: 0.5, source: "inferred",
    });
  });
  it("信号ゼロ → energy unknown（confidence 0）・desire 等も unknown", () => {
    const f = synthesizeGuidanceFrame({});
    expect(f.energy_level.value).toBe("unknown");
    expect(f.energy_level.confidence).toBe(0);
    expect(f.desire_direction.value).toBe("unknown");
    expect(f.time_budget.value).toBe("unknown");
    expect(f.hard_constraints.value).toEqual([]);
  });
  it("relaxed / curious / casual はエネルギー信号にしない（曖昧語からの捏造禁止）", () => {
    expect(synthesizeGuidanceFrame({ moodCode: "relaxed" }).energy_level.value).toBe("unknown");
    expect(synthesizeGuidanceFrame({ moodCode: "curious" }).energy_level.value).toBe("unknown");
  });
});

describe("resolveHintConfidence — 契約 C-2（消費フィールドの min / personality prior / null）", () => {
  it("energy 信号あり → その confidence（min 規約）", () => {
    expect(resolveHintConfidence(synthesizeGuidanceFrame({ moodCode: "tired" }), true)).toBe(0.7);
    expect(resolveHintConfidence(synthesizeGuidanceFrame({ sleepQuality: "good" }), false)).toBe(0.4);
  });
  it("信号ゼロ ∧ 軸スコア証拠あり → personality prior（0.2 = 型からの見立ての下限明示）", () => {
    expect(resolveHintConfidence(synthesizeGuidanceFrame({}), true)).toBe(PERSONALITY_PRIOR_CONFIDENCE);
  });
  it("信号ゼロ ∧ 証拠なし → null（hint を出さない = W2 fallback へ）", () => {
    expect(resolveHintConfidence(synthesizeGuidanceFrame({}), false)).toBeNull();
  });
});

describe("extractWalkLevel — JSONB 防御抽出（union 外・欠落は null）", () => {
  function planWith(walk: unknown): MorningPlan {
    return {
      date: "2026-06-12",
      items: [],
      dayConditions: { estimatedWalkLevel: walk as "low" },
      createdAt: "2026-06-12T07:00:00.000Z",
      confirmed: true,
    } as MorningPlan;
  }
  it("low/medium/high は通す", () => {
    expect(extractWalkLevel(planWith("high"))).toBe("high");
    expect(extractWalkLevel(planWith("low"))).toBe("low");
  });
  it("union 外・欠落・plan null は null", () => {
    expect(extractWalkLevel(planWith("tons"))).toBeNull();
    expect(extractWalkLevel(planWith(undefined))).toBeNull();
    expect(extractWalkLevel(null)).toBeNull();
  });
});

describe("addDaysIso — fetchPreviousDayPlan(date+1) → plan_date=date の逆算", () => {
  it("+1 日・月末・年末", () => {
    expect(addDaysIso("2026-06-12", 1)).toBe("2026-06-13");
    expect(addDaysIso("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
  });
});
