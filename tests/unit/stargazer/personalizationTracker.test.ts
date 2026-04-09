import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));
import {
  predictNextDefensePattern,
  evaluateDefensePrediction,
  detectVoluntaryTopicExpansion,
  runPersonalizationTracking,
} from "@/lib/stargazer/personalizationTracker";
import { DEFAULT_HDM_PHASE_STATE } from "@/lib/stargazer/hdmPhase";
import type { HdmPhaseState } from "@/lib/stargazer/hdmPhase";
import type { PartsActivationState } from "@/lib/stargazer/partsLens";

// ── helpers ──

function makePartsState(overrides: Partial<PartsActivationState> = {}): PartsActivationState {
  return {
    protective: { activationLevel: 0, dominantMode: null, triggerSource: null },
    vulnerable: { activationLevel: 0, isApproaching: false, safetyLevel: "safe" },
    reactive: { activationLevel: 0, dominantMode: null },
    dominantPart: "balanced",
    signalCount: 0,
    signals: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<HdmPhaseState> = {}): HdmPhaseState {
  return { ...DEFAULT_HDM_PHASE_STATE, ...overrides };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// predictNextDefensePattern
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("predictNextDefensePattern", () => {
  it("null partsState → null", () => {
    expect(predictNextDefensePattern(null)).toBeNull();
  });

  it("balanced → null（予測しない）", () => {
    expect(predictNextDefensePattern(makePartsState({ dominantPart: "balanced" }))).toBeNull();
  });

  it("unclear → null（予測しない）", () => {
    expect(predictNextDefensePattern(makePartsState({ dominantPart: "unclear" }))).toBeNull();
  });

  it("protective（activation 0.6）→ 'protective'", () => {
    const result = predictNextDefensePattern(makePartsState({
      dominantPart: "protective",
      protective: { activationLevel: 0.6, dominantMode: "deflect", triggerSource: null },
    }));
    expect(result).toBe("protective");
  });

  it("reactive（activation 0.5）→ 'reactive'", () => {
    const result = predictNextDefensePattern(makePartsState({
      dominantPart: "reactive",
      reactive: { activationLevel: 0.5, dominantMode: "fight" },
    }));
    expect(result).toBe("reactive");
  });

  it("vulnerable（activation 0.4）→ 'vulnerable'", () => {
    const result = predictNextDefensePattern(makePartsState({
      dominantPart: "vulnerable",
      vulnerable: { activationLevel: 0.4, isApproaching: true, safetyLevel: "caution" },
    }));
    expect(result).toBe("vulnerable");
  });

  it("activation < 0.3 → null（弱すぎ）", () => {
    const result = predictNextDefensePattern(makePartsState({
      dominantPart: "protective",
      protective: { activationLevel: 0.2, dominantMode: "deflect", triggerSource: null },
    }));
    expect(result).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluateDefensePrediction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluateDefensePrediction", () => {
  it("予測なし → streak 変更なし", () => {
    const result = evaluateDefensePrediction(
      makeState({ lastDefensePrediction: null, defensePredictionStreak: 2 }),
      makePartsState({ dominantPart: "protective" }),
    );
    expect(result.defensePredictionStreak).toBe(2);
  });

  it("予測 'protective'、実測 'protective' → streak +1", () => {
    const result = evaluateDefensePrediction(
      makeState({ lastDefensePrediction: "protective", defensePredictionStreak: 1 }),
      makePartsState({ dominantPart: "protective" }),
    );
    expect(result.defensePredictionStreak).toBe(2);
  });

  it("予測 'protective'、実測 'reactive' → streak リセット", () => {
    const result = evaluateDefensePrediction(
      makeState({ lastDefensePrediction: "protective", defensePredictionStreak: 3 }),
      makePartsState({ dominantPart: "reactive" }),
    );
    expect(result.defensePredictionStreak).toBe(0);
  });

  it("予測あり、実測 null → streak 変更なし（判定不能）", () => {
    const result = evaluateDefensePrediction(
      makeState({ lastDefensePrediction: "protective", defensePredictionStreak: 2 }),
      null,
    );
    expect(result.defensePredictionStreak).toBe(2);
  });

  it("予測あり、実測 unclear → streak 変更なし", () => {
    const result = evaluateDefensePrediction(
      makeState({ lastDefensePrediction: "protective", defensePredictionStreak: 2 }),
      makePartsState({ dominantPart: "unclear" }),
    );
    expect(result.defensePredictionStreak).toBe(2);
  });

  it("予測 'protective'、実測 'balanced' → streak リセット", () => {
    const result = evaluateDefensePrediction(
      makeState({ lastDefensePrediction: "protective", defensePredictionStreak: 1 }),
      makePartsState({ dominantPart: "balanced" }),
    );
    expect(result.defensePredictionStreak).toBe(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// detectVoluntaryTopicExpansion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("detectVoluntaryTopicExpansion", () => {
  it("active_domains 空 → 検出なし", () => {
    const result = detectVoluntaryTopicExpansion([], ["career"]);
    expect(result.expanded).toBe(false);
    expect(result.newDomains).toEqual([]);
  });

  it("probe と同じドメイン → 自発展開なし", () => {
    const result = detectVoluntaryTopicExpansion(["career"], ["career"]);
    expect(result.expanded).toBe(false);
  });

  it("probe と異なるドメイン → 自発展開あり", () => {
    const result = detectVoluntaryTopicExpansion(["relationship", "career"], ["career"]);
    expect(result.expanded).toBe(true);
    expect(result.newDomains).toEqual(["relationship"]);
  });

  it("probe なし + ドメインあり → 全て自発", () => {
    const result = detectVoluntaryTopicExpansion(["identity"], []);
    expect(result.expanded).toBe(true);
    expect(result.newDomains).toEqual(["identity"]);
  });

  it("複数の新ドメイン → 全て検出", () => {
    const result = detectVoluntaryTopicExpansion(
      ["relationship", "health", "career"],
      ["career"],
    );
    expect(result.expanded).toBe(true);
    expect(result.newDomains).toEqual(["relationship", "health"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// runPersonalizationTracking（統合）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("runPersonalizationTracking", () => {
  it("初回ターン（予測なし、ドメインなし）→ streak 0、expansion 0", () => {
    const result = runPersonalizationTracking(
      makeState(),
      null,
      [],
      [],
    );
    expect(result.stateUpdates.defensePredictionStreak).toBe(0);
    expect(result.stateUpdates.voluntaryTopicExpansionCount).toBe(0);
    expect(result.stateUpdates.lastDefensePrediction).toBeNull();
    expect(result.analytics.defense_prediction_hit).toBeNull();
  });

  it("予測的中 + 自発展開 → streak +1、expansion +1", () => {
    const state = makeState({
      lastDefensePrediction: "protective",
      defensePredictionStreak: 1,
      lastProbedDomains: ["career"],
      voluntaryTopicExpansionCount: 0,
    });
    const parts = makePartsState({
      dominantPart: "protective",
      protective: { activationLevel: 0.6, dominantMode: "deflect", triggerSource: null },
    });

    const result = runPersonalizationTracking(state, parts, ["identity"], ["identity"]);

    expect(result.stateUpdates.defensePredictionStreak).toBe(2);
    expect(result.stateUpdates.voluntaryTopicExpansionCount).toBe(1);
    expect(result.stateUpdates.lastDefensePrediction).toBe("protective"); // 次も同じ予測
    expect(result.analytics.defense_prediction_hit).toBe(true);
    expect(result.analytics.voluntary_expansion_detected).toBe(true);
  });

  it("予測不的中 → streak リセット", () => {
    const state = makeState({
      lastDefensePrediction: "protective",
      defensePredictionStreak: 2,
      lastProbedDomains: [],
    });
    const parts = makePartsState({ dominantPart: "reactive", reactive: { activationLevel: 0.5, dominantMode: "fight" } });

    const result = runPersonalizationTracking(state, parts, [], []);

    expect(result.stateUpdates.defensePredictionStreak).toBe(0);
    expect(result.analytics.defense_prediction_hit).toBe(false);
  });

  it("次ターンの予測が生成される", () => {
    const parts = makePartsState({
      dominantPart: "vulnerable",
      vulnerable: { activationLevel: 0.5, isApproaching: true, safetyLevel: "caution" },
    });

    const result = runPersonalizationTracking(makeState(), parts, [], []);

    expect(result.stateUpdates.lastDefensePrediction).toBe("vulnerable");
  });

  it("currentProbedDomains が lastProbedDomains として保存される", () => {
    const result = runPersonalizationTracking(
      makeState(),
      null,
      [],
      ["career", "identity"],
    );
    expect(result.stateUpdates.lastProbedDomains).toEqual(["career", "identity"]);
  });

  it("Phase 0→1 条件: expansion 2 回到達", () => {
    const state = makeState({
      voluntaryTopicExpansionCount: 1,
      lastProbedDomains: ["career"],
    });

    const result = runPersonalizationTracking(
      state,
      null,
      ["identity"], // career 以外 → 自発展開
      [],
    );

    expect(result.stateUpdates.voluntaryTopicExpansionCount).toBe(2);
    expect(result.analytics.voluntary_expansion_total).toBe(2);
  });

  it("Phase 1→2 条件: streak 3 到達", () => {
    const state = makeState({
      lastDefensePrediction: "reactive",
      defensePredictionStreak: 2,
      lastProbedDomains: [],
    });
    const parts = makePartsState({
      dominantPart: "reactive",
      reactive: { activationLevel: 0.6, dominantMode: "freeze" },
    });

    const result = runPersonalizationTracking(state, parts, [], []);

    expect(result.stateUpdates.defensePredictionStreak).toBe(3);
    expect(result.analytics.defense_prediction_streak).toBe(3);
  });
});
