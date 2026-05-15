/**
 * Activity AD4 — Multi-axis ranking pure function test
 *
 * 検証項目 (CEO 2026-05-15 指定):
 *   1. empty input fail-closed
 *   2. clear top candidate
 *   3. fatigue-aware reranking
 *   4. weather-aware reranking
 *   5. budget-sensitive reranking
 *   6. novelty vs comfort balance
 *   7. pair fairness reranking
 *   8. cognitive load ceiling
 *   9. red-line blocking
 *   10. repeated / saturated activity penalty
 *   11. handoff candidate excluded
 *   12. tie-break deterministic
 *   13. reasonCodes に raw text 含まない
 *   14. deterministic output
 *   15. no runtime wiring
 */

import { describe, expect, it } from "vitest";

import type {
  ActivityCandidateGeneratorOutput,
  ActivityScoredCandidate,
} from "@/lib/coalter/activity/candidates";
import {
  PROVISIONAL_COGNITIVE_LOAD_CEILING,
  PROVISIONAL_FAIRNESS_BALANCE_BAND,
  PROVISIONAL_MAX_RANKED_COUNT,
  RANKING_VERSION,
  rankActivityCandidates,
  type ActivityFairnessReasonCode,
  type ActivityRankingBlockedReasonCode,
  type ActivityRankingExplanationCode,
  type ActivityRankingInput,
  type ActivityRankingReasonCode,
} from "@/lib/coalter/activity/ranking";

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

function makeScoredCandidate(
  seedId: string,
  overrides?: Partial<ActivityScoredCandidate>,
): ActivityScoredCandidate {
  return {
    seedId,
    name: overrides?.name ?? `cand_${seedId}`,
    taxonomy: overrides?.taxonomy ?? {
      indoorOutdoor: "outdoor",
      durationBand: "medium",
      costBand: "low",
      pairCompatibility: "pair_compatible",
      noveltyLevel: "familiar",
      fatigueLevel: 2,
    },
    scoreBreakdown: overrides?.scoreBreakdown ?? {
      fatigueFit: 1.0,
      weatherFit: 0.5,
      budgetFit: 1.0,
      noveltyFit: 1.0,
      pairFit: 1.0,
      taxonomyAlignment: 0.8,
      totalScore: 0.85,
    },
    rank: overrides?.rank ?? 1,
    reasonCodes: overrides?.reasonCodes ?? [],
  };
}

function makeGenOutput(
  candidates: ActivityScoredCandidate[],
): ActivityCandidateGeneratorOutput {
  return {
    candidates,
    blockedCandidates: [],
    missingCandidateInputs: [],
    reasonCodes: [],
    needsMoreCandidates: false,
    generatorVersion: "0.1.0",
  };
}

function makeInput(
  candidates: ActivityScoredCandidate[],
  overrides?: Partial<ActivityRankingInput>,
): ActivityRankingInput {
  return {
    generatorOutput: makeGenOutput(candidates),
    daily: overrides?.daily ?? { weather: "sunny", pairAvailability: "both", energyBudget: 3 },
    fairness: overrides?.fairness,
    recentHistory: overrides?.recentHistory,
    cognitiveLoadLevel: overrides?.cognitiveLoadLevel,
    maxRankedCount: overrides?.maxRankedCount,
    cognitiveLoadCeiling: overrides?.cognitiveLoadCeiling,
  };
}

// ─────────────────────────────────────────────
// Test 1: empty input → fail-closed
// ─────────────────────────────────────────────

describe("rankActivityCandidates — empty input", () => {
  it("empty candidates → rankedCandidates=[] + fail_closed", () => {
    const out = rankActivityCandidates(makeInput([]));

    expect(out.rankedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("empty_input" satisfies ActivityRankingReasonCode);
    expect(out.reasonCodes).toContain("no_candidates_provided" satisfies ActivityRankingReasonCode);
    expect(out.reasonCodes).toContain("fail_closed" satisfies ActivityRankingReasonCode);
    expect(out.rankingVersion).toBe(RANKING_VERSION);
  });
});

// ─────────────────────────────────────────────
// Test 2: clear top candidate
// ─────────────────────────────────────────────

describe("rankActivityCandidates — clear top candidate", () => {
  it("単一 candidate → rank 1、Pareto front 1", () => {
    const out = rankActivityCandidates(makeInput([makeScoredCandidate("s1")]));

    expect(out.rankedCandidates).toHaveLength(1);
    expect(out.rankedCandidates[0].rank).toBe(1);
    expect(out.rankedCandidates[0].scoreBreakdown.paretoFront).toBe(1);
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "top_pareto_front" satisfies ActivityRankingExplanationCode,
    );
    expect(out.reasonCodes).toContain("single_candidate_only" satisfies ActivityRankingReasonCode);
  });

  it("複数 candidate → Pareto rank で top 候補が rank 1", () => {
    const top = makeScoredCandidate("top", {
      scoreBreakdown: {
        fatigueFit: 1.0,
        weatherFit: 1.0,
        budgetFit: 1.0,
        noveltyFit: 1.0,
        pairFit: 1.0,
        taxonomyAlignment: 1.0,
        totalScore: 1.0,
      },
    });
    const low = makeScoredCandidate("low", {
      scoreBreakdown: {
        fatigueFit: 0.0,
        weatherFit: 0.0,
        budgetFit: 0.0,
        noveltyFit: 0.0,
        pairFit: 0.0,
        taxonomyAlignment: 0.0,
        totalScore: 0.5,
      },
    });

    const out = rankActivityCandidates(makeInput([low, top]));

    expect(out.rankedCandidates[0].seedId).toBe("top");
    expect(out.rankedCandidates[0].rank).toBe(1);
  });
});

// ─────────────────────────────────────────────
// Test 3: fatigue-aware reranking
// ─────────────────────────────────────────────

describe("rankActivityCandidates — fatigue-aware", () => {
  it("低 fatigueFit より高 fatigueFit が上位", () => {
    const high = makeScoredCandidate("high_fat", {
      scoreBreakdown: { ...defaultBreakdown(), fatigueFit: 1.0 },
    });
    const low = makeScoredCandidate("low_fat", {
      scoreBreakdown: { ...defaultBreakdown(), fatigueFit: -0.5 },
    });

    const out = rankActivityCandidates(makeInput([low, high]));
    const highIdx = out.rankedCandidates.findIndex((c) => c.seedId === "high_fat");
    const lowIdx = out.rankedCandidates.findIndex((c) => c.seedId === "low_fat");
    if (highIdx >= 0 && lowIdx >= 0) {
      expect(highIdx).toBeLessThan(lowIdx);
    }
    const highCand = out.rankedCandidates.find((c) => c.seedId === "high_fat");
    expect(highCand?.explanationReasonCodes).toContain(
      "fatigue_friendly" satisfies ActivityRankingExplanationCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 4: weather-aware reranking
// ─────────────────────────────────────────────

describe("rankActivityCandidates — weather-aware", () => {
  it("weather safe (高 weatherFit) → weather_safe reason", () => {
    const safe = makeScoredCandidate("safe", {
      scoreBreakdown: { ...defaultBreakdown(), weatherFit: 1.0 },
    });
    const out = rankActivityCandidates(makeInput([safe]));
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "weather_safe" satisfies ActivityRankingExplanationCode,
    );
  });

  it("weather unknown → uncertainty raise (高 totalScore でも mid_confidence 以下)", () => {
    const cand = makeScoredCandidate("u1", {
      scoreBreakdown: { ...defaultBreakdown(), totalScore: 0.9 },
    });
    const out = rankActivityCandidates(
      makeInput([cand], { daily: { weather: "unknown", pairAvailability: "both" } }),
    );
    expect(out.rankedCandidates[0].uncertaintyLabel).not.toBe("high_confidence");
  });
});

// ─────────────────────────────────────────────
// Test 5: budget-sensitive reranking
// ─────────────────────────────────────────────

describe("rankActivityCandidates — budget-sensitive", () => {
  it("高 budgetFit → budget_match reason", () => {
    const cand = makeScoredCandidate("b1", {
      scoreBreakdown: { ...defaultBreakdown(), budgetFit: 1.0 },
    });
    const out = rankActivityCandidates(makeInput([cand]));
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "budget_match" satisfies ActivityRankingExplanationCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 6: novelty vs comfort balance
// ─────────────────────────────────────────────

describe("rankActivityCandidates — novelty / comfort balance", () => {
  it("noveltyFit=0.3 (Pareto mix) → novelty_comfort_mix reason + +0.5 score", () => {
    const cand = makeScoredCandidate("mix", {
      scoreBreakdown: { ...defaultBreakdown(), noveltyFit: 0.3 },
    });
    const out = rankActivityCandidates(makeInput([cand]));
    expect(out.rankedCandidates[0].scoreBreakdown.noveltyComfortBalance).toBeCloseTo(0.5, 10);
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "novelty_comfort_mix" satisfies ActivityRankingExplanationCode,
    );
  });

  it("noveltyFit=1.0 (alignment) → novelty_seeker_match reason", () => {
    const cand = makeScoredCandidate("seeker", {
      scoreBreakdown: { ...defaultBreakdown(), noveltyFit: 1.0 },
    });
    const out = rankActivityCandidates(makeInput([cand]));
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "novelty_seeker_match" satisfies ActivityRankingExplanationCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 7: pair fairness reranking
// ─────────────────────────────────────────────

describe("rankActivityCandidates — pair fairness", () => {
  it("fairness.recentBias > BALANCE_BAND → fairness_lean_to_a explanation", () => {
    const cand = makeScoredCandidate("s1");
    const out = rankActivityCandidates(
      makeInput([cand], { fairness: { recentBias: 0.5, cooldownActivities: [] } }),
    );
    expect(out.rankedCandidates[0].scoreBreakdown.pairFairness).toBeCloseTo(0.1, 10);
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "fairness_lean_to_a" satisfies ActivityRankingExplanationCode,
    );
    expect(out.fairnessNotes.some((n) => n.reasonCode === ("fairness_bias_a_favored_history" satisfies ActivityFairnessReasonCode))).toBe(true);
    expect(out.reasonCodes).toContain("fairness_adjustment_applied" satisfies ActivityRankingReasonCode);
  });

  it("fairness.recentBias < -BALANCE_BAND → fairness_lean_to_b explanation", () => {
    const cand = makeScoredCandidate("s1");
    const out = rankActivityCandidates(
      makeInput([cand], { fairness: { recentBias: -0.5, cooldownActivities: [] } }),
    );
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "fairness_lean_to_b" satisfies ActivityRankingExplanationCode,
    );
  });

  it("|bias| < BALANCE_BAND → fairness_balanced", () => {
    const cand = makeScoredCandidate("s1");
    const out = rankActivityCandidates(
      makeInput([cand], { fairness: { recentBias: 0.1, cooldownActivities: [] } }),
    );
    expect(out.rankedCandidates[0].scoreBreakdown.pairFairness).toBe(0);
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "fairness_balanced" satisfies ActivityRankingExplanationCode,
    );
  });

  it("fairness 未指定 → unknown_neutral (score=0)", () => {
    const cand = makeScoredCandidate("s1");
    const out = rankActivityCandidates(makeInput([cand]));
    expect(out.rankedCandidates[0].scoreBreakdown.pairFairness).toBe(0);
    expect(out.fairnessNotes.some((n) => n.reasonCode === ("fairness_bias_unknown_neutral" satisfies ActivityFairnessReasonCode))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 8: cognitive load ceiling
// ─────────────────────────────────────────────

describe("rankActivityCandidates — cognitive load ceiling", () => {
  it("currentLoad=3 + candidate novelty+high fatigue → cognitive_load_ceiling_exceeded blocked", () => {
    const heavy = makeScoredCandidate("heavy", {
      taxonomy: { noveltyLevel: "novelty", fatigueLevel: 5, indoorOutdoor: "outdoor" },
    });
    const out = rankActivityCandidates(
      makeInput([heavy], { cognitiveLoadLevel: 3, cognitiveLoadCeiling: 3 }),
    );
    expect(out.blockedCandidates.some((b) => b.blockedReasonCode === ("cognitive_load_ceiling_exceeded" satisfies ActivityRankingBlockedReasonCode))).toBe(true);
  });

  it("currentLoad=1 + light candidate → 通常 rank", () => {
    const light = makeScoredCandidate("light", {
      taxonomy: { noveltyLevel: "routine", fatigueLevel: 1, indoorOutdoor: "indoor" },
    });
    const out = rankActivityCandidates(
      makeInput([light], { cognitiveLoadLevel: 1, cognitiveLoadCeiling: 3 }),
    );
    expect(out.rankedCandidates).toHaveLength(1);
    expect(out.rankedCandidates[0].seedId).toBe("light");
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "low_cognitive_load_match" satisfies ActivityRankingExplanationCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 9: red-line blocking (AD3 で blocked 済の前提、AD4 input 候補は accepted のみ)
// ─────────────────────────────────────────────

describe("rankActivityCandidates — red-line safety (AD3 で blocked 済の前提)", () => {
  it("AD3 input 候補は accepted のみ、redLineSafety = 0 (neutral)", () => {
    const cand = makeScoredCandidate("safe");
    const out = rankActivityCandidates(makeInput([cand]));
    expect(out.rankedCandidates[0].scoreBreakdown.redLineSafety).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 10: repeated / saturated activity penalty
// ─────────────────────────────────────────────

describe("rankActivityCandidates — anti-repetition", () => {
  it("recentHistory daysAgo<3 → recent_high penalty (-0.5)", () => {
    const cand = makeScoredCandidate("s1", { name: "park_walk" });
    const out = rankActivityCandidates(
      makeInput([cand], { recentHistory: [{ activityName: "park_walk", daysAgo: 1 }] }),
    );
    expect(out.rankedCandidates[0].scoreBreakdown.antiRepetition).toBeCloseTo(-0.5, 10);
    expect(out.fairnessNotes.some((n) => n.reasonCode === ("anti_repetition_recent_high" satisfies ActivityFairnessReasonCode))).toBe(true);
    expect(out.reasonCodes).toContain("anti_repetition_applied" satisfies ActivityRankingReasonCode);
  });

  it("daysAgo<7 → recent_mid penalty (-0.3)", () => {
    const cand = makeScoredCandidate("s1", { name: "park_walk" });
    const out = rankActivityCandidates(
      makeInput([cand], { recentHistory: [{ activityName: "park_walk", daysAgo: 5 }] }),
    );
    expect(out.rankedCandidates[0].scoreBreakdown.antiRepetition).toBeCloseTo(-0.3, 10);
  });

  it("daysAgo>=14 → 0 (no penalty) + no_recent_repetition explanation", () => {
    const cand = makeScoredCandidate("s1", { name: "park_walk" });
    const out = rankActivityCandidates(
      makeInput([cand], { recentHistory: [{ activityName: "park_walk", daysAgo: 30 }] }),
    );
    expect(out.rankedCandidates[0].scoreBreakdown.antiRepetition).toBe(0);
    expect(out.rankedCandidates[0].explanationReasonCodes).toContain(
      "no_recent_repetition" satisfies ActivityRankingExplanationCode,
    );
  });

  it("saturation cooldown name に該当 → above_max_rank_count blocked + saturation_cooldown_active fairness note", () => {
    const cand = makeScoredCandidate("s1", { name: "park_walk" });
    const out = rankActivityCandidates(
      makeInput([cand], {
        fairness: { recentBias: 0, cooldownActivities: ["park_walk"] },
      }),
    );
    expect(out.blockedCandidates.some((b) => b.seedId === "s1")).toBe(true);
    expect(out.fairnessNotes.some((n) => n.reasonCode === ("saturation_cooldown_active" satisfies ActivityFairnessReasonCode))).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 11: handoff candidate excluded (AD3 で blocked 済の前提)
// ─────────────────────────────────────────────

describe("rankActivityCandidates — handoff candidate (AD3 で 除外済の前提)", () => {
  it("AD3 input candidates は activity scope のみ (handoff は AD3 blocked list、本 PR 範囲外)", () => {
    const cand = makeScoredCandidate("activity_only");
    const out = rankActivityCandidates(makeInput([cand]));
    expect(out.rankedCandidates[0].seedId).toBe("activity_only");
  });
});

// ─────────────────────────────────────────────
// Test 12: tie-break deterministic
// ─────────────────────────────────────────────

describe("rankActivityCandidates — tie-break", () => {
  it("同 Pareto front + 同 rankedScore → seedId lexicographic で deterministic", () => {
    const a = makeScoredCandidate("a_seed", {
      scoreBreakdown: { ...defaultBreakdown(), fatigueFit: 0.5, totalScore: 0.5 },
    });
    const z = makeScoredCandidate("z_seed", {
      scoreBreakdown: { ...defaultBreakdown(), fatigueFit: 0.5, totalScore: 0.5 },
    });
    const out = rankActivityCandidates(makeInput([z, a]));

    expect(out.rankedCandidates[0].seedId).toBe("a_seed");
    expect(out.rankedCandidates[1].seedId).toBe("z_seed");
  });
});

// ─────────────────────────────────────────────
// Test 13: reasonCodes 構造的検証
// ─────────────────────────────────────────────

describe("rankActivityCandidates — reasonCodes 構造的検証 (raw text leakage 防止)", () => {
  it("全 reasonCodes / explanationReasonCodes / blockedReasonCodes / fairnessReasonCodes は enum lower_snake_case", () => {
    const cand = makeScoredCandidate("s1", { name: "park_walk" });
    const out = rankActivityCandidates(
      makeInput([cand], {
        fairness: { recentBias: 0.5, cooldownActivities: [] },
        recentHistory: [{ activityName: "park_walk", daysAgo: 5 }],
      }),
    );

    for (const r of out.reasonCodes) {
      expect(r).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(r).not.toMatch(/[぀-ゟ゠-ヿ一-鿿]/);
      expect(r).not.toMatch(/\s/);
    }
    for (const c of out.rankedCandidates) {
      for (const r of c.explanationReasonCodes) {
        expect(r).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
    for (const f of out.fairnessNotes) {
      expect(f.reasonCode).toMatch(/^[a-z][a-z0-9_]*$/);
    }
    for (const b of out.blockedCandidates) {
      expect(b.blockedReasonCode).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("recentHistory.activityName value (e.g., 'secret_user_activity') は output に含まれない", () => {
    const cand = makeScoredCandidate("s1", { name: "different_normalized_name" });
    const out = rankActivityCandidates(
      makeInput([cand], {
        recentHistory: [{ activityName: "secret_user_activity", daysAgo: 1 }],
      }),
    );
    const outputJson = JSON.stringify(out);
    expect(outputJson).not.toContain("secret_user_activity");
  });
});

// ─────────────────────────────────────────────
// Test 14: deterministic output
// ─────────────────────────────────────────────

describe("rankActivityCandidates — deterministic", () => {
  it("同じ input × 2 回 → 完全一致", () => {
    const cand = makeScoredCandidate("s1");
    const input = makeInput([cand]);
    const out1 = rankActivityCandidates(input);
    const out2 = rankActivityCandidates(input);
    expect(out1).toEqual(out2);
  });

  it("100 回連続呼出 完全一致", () => {
    const cand = makeScoredCandidate("s1");
    const input = makeInput([cand]);
    const first = rankActivityCandidates(input);
    for (let i = 0; i < 100; i++) {
      const out = rankActivityCandidates(input);
      expect(out).toEqual(first);
    }
  });

  it("const values", () => {
    expect(PROVISIONAL_MAX_RANKED_COUNT).toBe(3);
    expect(PROVISIONAL_COGNITIVE_LOAD_CEILING).toBe(3);
    expect(PROVISIONAL_FAIRNESS_BALANCE_BAND).toBe(0.2);
    expect(RANKING_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─────────────────────────────────────────────
// Test 15: no runtime wiring
// ─────────────────────────────────────────────

describe("rankActivityCandidates — no runtime wiring", () => {
  it("純関数: 副作用なし、JSON serializable", () => {
    const cand = makeScoredCandidate("s1");
    const out = rankActivityCandidates(makeInput([cand]));
    expect(() => JSON.stringify(out)).not.toThrow();
  });

  it("maxRankedCount 制限 + max_count_reached reason", () => {
    const cs = ["s1", "s2", "s3", "s4", "s5"].map((id) => makeScoredCandidate(id));
    const out = rankActivityCandidates(makeInput(cs, { maxRankedCount: 2 }));
    expect(out.rankedCandidates).toHaveLength(2);
    expect(out.reasonCodes).toContain("max_count_reached" satisfies ActivityRankingReasonCode);
    expect(out.blockedCandidates.filter((b) => b.blockedReasonCode === "above_max_rank_count")).toHaveLength(3);
  });
});

// ─────────────────────────────────────────────
// Helpers (test scope)
// ─────────────────────────────────────────────

function defaultBreakdown(): ActivityScoredCandidate["scoreBreakdown"] {
  return {
    fatigueFit: 0.0,
    weatherFit: 0.0,
    budgetFit: 0.0,
    noveltyFit: 0.0,
    pairFit: 0.0,
    taxonomyAlignment: 0.0,
    totalScore: 0.5,
  };
}
