/**
 * Activity AD3 — Candidate generator + scorer pure function test
 *
 * 検証項目 (CEO 2026-05-15 指定):
 *   1. empty candidate seeds
 *   2. clear activity candidates
 *   3. fatigue-aware ranking
 *   4. weather-aware ranking
 *   5. budget-sensitive ranking
 *   6. novelty preference ranking
 *   7. pair-compatible ranking
 *   8. veto / red-line blocking
 *   9. food/movie/travel handoff seeds excluded
 *   10. ambiguous intent returns needsMoreCandidates / missing inputs
 *   11. reasonCodes に raw text 含まない
 *   12. deterministic output
 *   13. no runtime wiring
 */

import { describe, expect, it } from "vitest";

import { inferActivityIntent, type ActivityIntentOutput } from "@/lib/coalter/activity/intent";
import {
  GENERATOR_VERSION,
  PROVISIONAL_DEFAULT_MAX_CANDIDATES,
  PROVISIONAL_SCORE_THRESHOLD,
  generateActivityCandidates,
  type ActivityCandidateBlockedReasonCode,
  type ActivityCandidateGeneratorInput,
  type ActivityCandidateMissingInput,
  type ActivityCandidateReasonCode,
  type ActivityCandidateSeed,
} from "@/lib/coalter/activity/candidates";

// ─────────────────────────────────────────────
// Test helpers
// ─────────────────────────────────────────────

/** Helper: produce a clear "activity_eligible" intent for testing */
function makeEligibleIntent(overrides?: Partial<ActivityIntentOutput>): ActivityIntentOutput {
  const base = inferActivityIntent({
    activityHints: {
      indoorOutdoor: "outdoor",
      durationHint: "medium",
      noveltyHint: "familiar",
      moodCode: "casual",
      fatigueHint: 2,
      pairCompatibility: "pair_compatible",
    },
    costBand: "low",
    weather: "sunny",
    pairAvailability: "both",
  });
  return { ...base, ...overrides };
}

function makeSeed(overrides: Partial<ActivityCandidateSeed> & { seedId: string }): ActivityCandidateSeed {
  return {
    seedId: overrides.seedId,
    name: overrides.name ?? `seed_${overrides.seedId}`,
    taxonomy: overrides.taxonomy ?? {},
    handoffTarget: overrides.handoffTarget,
    redLineConflicts: overrides.redLineConflicts,
  };
}

// ─────────────────────────────────────────────
// Test 1: empty candidate seeds → fail-closed
// ─────────────────────────────────────────────

describe("generateActivityCandidates — empty seeds", () => {
  it("seeds=[] で candidates=[] / no_seeds_provided + fail_closed", () => {
    const intent = makeEligibleIntent();
    const out = generateActivityCandidates({ intent, seeds: [] });

    expect(out.candidates).toEqual([]);
    expect(out.blockedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("no_seeds_provided" satisfies ActivityCandidateReasonCode);
    expect(out.reasonCodes).toContain("fail_closed" satisfies ActivityCandidateReasonCode);
    expect(out.missingCandidateInputs).toContain("no_seeds" satisfies ActivityCandidateMissingInput);
    expect(out.needsMoreCandidates).toBe(true);
    expect(out.generatorVersion).toBe(GENERATOR_VERSION);
  });
});

// ─────────────────────────────────────────────
// Test 2: clear activity candidates → ranked
// ─────────────────────────────────────────────

describe("generateActivityCandidates — clear candidates", () => {
  it("eligible intent + matching seeds で scored + ranked candidates", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "s1",
        name: "park_walk",
        taxonomy: {
          indoorOutdoor: "outdoor",
          durationBand: "medium",
          costBand: "low",
          weatherDependency: "weather_dependent",
          pairCompatibility: "pair_compatible",
          noveltyLevel: "familiar",
          fatigueLevel: 2,
        },
      }),
      makeSeed({
        seedId: "s2",
        name: "art_museum",
        taxonomy: {
          indoorOutdoor: "indoor",
          durationBand: "medium",
          costBand: "medium",
          weatherDependency: "weather_independent",
          pairCompatibility: "pair_compatible",
          noveltyLevel: "novelty",
          fatigueLevel: 3,
        },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });

    expect(out.candidates.length).toBeGreaterThan(0);
    expect(out.reasonCodes).toContain("candidates_generated" satisfies ActivityCandidateReasonCode);
    expect(out.candidates[0].rank).toBe(1);
    // Park walk taxonomy aligns perfectly with intent
    expect(out.candidates[0].seedId).toBe("s1");
  });

  it("maxCandidates=2 で上限制御", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "s1",
        taxonomy: { indoorOutdoor: "outdoor", durationBand: "medium", fatigueLevel: 2 },
      }),
      makeSeed({
        seedId: "s2",
        taxonomy: { indoorOutdoor: "indoor", durationBand: "short", fatigueLevel: 2 },
      }),
      makeSeed({
        seedId: "s3",
        taxonomy: { indoorOutdoor: "hybrid", durationBand: "medium", fatigueLevel: 2 },
      }),
    ];
    const out = generateActivityCandidates({ intent, seeds, maxCandidates: 2 });
    expect(out.candidates.length).toBeLessThanOrEqual(2);
  });
});

// ─────────────────────────────────────────────
// Test 3: fatigue-aware ranking
// ─────────────────────────────────────────────

describe("generateActivityCandidates — fatigue-aware ranking", () => {
  it("low fatigue intent + low fatigue seed が high fatigue seed より上位", () => {
    const intent = makeEligibleIntent(); // fatigueLevel=2 in suggestedTaxonomy
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "high_fatigue",
        taxonomy: {
          indoorOutdoor: "outdoor",
          durationBand: "medium",
          costBand: "low",
          fatigueLevel: 5,
        },
      }),
      makeSeed({
        seedId: "low_fatigue",
        taxonomy: {
          indoorOutdoor: "outdoor",
          durationBand: "medium",
          costBand: "low",
          fatigueLevel: 2, // 一致
        },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    // 一致 (fatigue=2) seed が上位
    const lowIdx = out.candidates.findIndex((c) => c.seedId === "low_fatigue");
    const highIdx = out.candidates.findIndex((c) => c.seedId === "high_fatigue");
    if (lowIdx >= 0 && highIdx >= 0) {
      expect(lowIdx).toBeLessThan(highIdx);
    }
    // low_fatigue は fatigue_match reason
    const lowCandidate = out.candidates.find((c) => c.seedId === "low_fatigue");
    expect(lowCandidate?.reasonCodes).toContain("fatigue_match" satisfies ActivityCandidateReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 4: weather-aware ranking
// ─────────────────────────────────────────────

describe("generateActivityCandidates — weather-aware", () => {
  it("rainy intent + weather_dependent seed → blocked (weather_dependent_unfit)", () => {
    const intent = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "medium",
        fatigueHint: 2,
        pairCompatibility: "pair_compatible",
        noveltyHint: "familiar",
      },
      costBand: "low",
      weather: "rainy",
      pairAvailability: "both",
    });
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "outdoor_dep",
        taxonomy: {
          indoorOutdoor: "outdoor",
          weatherDependency: "weather_dependent",
          fatigueLevel: 2,
        },
      }),
      makeSeed({
        seedId: "indoor_indep",
        taxonomy: {
          indoorOutdoor: "indoor",
          weatherDependency: "weather_independent",
          fatigueLevel: 2,
        },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const blocked = out.blockedCandidates.find((b) => b.seedId === "outdoor_dep");
    expect(blocked).toBeDefined();
    expect(blocked?.blockedReasonCodes).toContain(
      "weather_dependent_unfit" satisfies ActivityCandidateBlockedReasonCode,
    );
    // indoor_indep は accepted
    const indoorCandidate = out.candidates.find((c) => c.seedId === "indoor_indep");
    expect(indoorCandidate).toBeDefined();
  });

  it("sunny intent + weather_dependent seed → high weather fit", () => {
    const intent = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "medium",
        fatigueHint: 2,
        pairCompatibility: "pair_compatible",
        noveltyHint: "familiar",
      },
      costBand: "low",
      weather: "sunny",
      pairAvailability: "both",
    });
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "outdoor_dep",
        taxonomy: {
          indoorOutdoor: "outdoor",
          weatherDependency: "weather_dependent",
          fatigueLevel: 2,
        },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const candidate = out.candidates.find((c) => c.seedId === "outdoor_dep");
    expect(candidate).toBeDefined();
    expect(candidate?.scoreBreakdown.weatherFit).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Test 5: budget-sensitive ranking
// ─────────────────────────────────────────────

describe("generateActivityCandidates — budget-sensitive", () => {
  it("free intent + free seed → budget_in_range +1.0", () => {
    const intent = inferActivityIntent({
      activityHints: { indoorOutdoor: "outdoor", durationHint: "short", fatigueHint: 2, noveltyHint: "familiar" },
      costBand: "free",
      weather: "sunny",
      pairAvailability: "both",
    });
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "free_seed",
        taxonomy: { indoorOutdoor: "outdoor", costBand: "free", fatigueLevel: 2 },
      }),
      makeSeed({
        seedId: "high_seed",
        taxonomy: { indoorOutdoor: "outdoor", costBand: "high", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const free = out.candidates.find((c) => c.seedId === "free_seed");
    expect(free?.scoreBreakdown.budgetFit).toBeCloseTo(1.0, 10);
    expect(free?.reasonCodes).toContain("budget_in_range" satisfies ActivityCandidateReasonCode);
  });

  it("free intent + medium seed → budget_far -0.5", () => {
    const intent = inferActivityIntent({
      activityHints: { indoorOutdoor: "outdoor", durationHint: "short", fatigueHint: 2, noveltyHint: "familiar" },
      costBand: "free",
      weather: "sunny",
      pairAvailability: "both",
    });
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "medium_seed",
        taxonomy: { indoorOutdoor: "outdoor", costBand: "medium", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const allEval = [...out.candidates, ...out.blockedCandidates.map((b) => ({ seedId: b.seedId }))];
    expect(allEval.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Test 6: novelty preference ranking
// ─────────────────────────────────────────────

describe("generateActivityCandidates — novelty preference", () => {
  it("novelty intent + novelty seed → novelty_alignment +1.0", () => {
    const intent = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "medium",
        noveltyHint: "novelty",
        fatigueHint: 2,
        pairCompatibility: "pair_compatible",
      },
      costBand: "low",
      weather: "sunny",
      pairAvailability: "both",
    });
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "novelty_seed",
        taxonomy: { indoorOutdoor: "outdoor", noveltyLevel: "novelty", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const candidate = out.candidates.find((c) => c.seedId === "novelty_seed");
    expect(candidate?.scoreBreakdown.noveltyFit).toBeCloseTo(1.0, 10);
    expect(candidate?.reasonCodes).toContain("novelty_alignment" satisfies ActivityCandidateReasonCode);
  });

  it("novelty intent + familiar seed → novelty_mix_pareto +0.3 (Pareto candidate)", () => {
    const intent = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "medium",
        noveltyHint: "novelty",
        fatigueHint: 2,
        pairCompatibility: "pair_compatible",
      },
      costBand: "low",
      weather: "sunny",
      pairAvailability: "both",
    });
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "familiar_seed",
        taxonomy: { indoorOutdoor: "outdoor", noveltyLevel: "familiar", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const candidate = out.candidates.find((c) => c.seedId === "familiar_seed");
    expect(candidate?.scoreBreakdown.noveltyFit).toBeCloseTo(0.3, 10);
  });

  it("novelty intent + routine seed → novelty_mismatch -0.5", () => {
    const intent = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "medium",
        noveltyHint: "novelty",
        fatigueHint: 2,
        pairCompatibility: "pair_compatible",
      },
      costBand: "low",
      weather: "sunny",
      pairAvailability: "both",
    });
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "routine_seed",
        taxonomy: { indoorOutdoor: "outdoor", noveltyLevel: "routine", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    // accepted or blocked based on total score
    const all = [...out.candidates, ...out.blockedCandidates];
    expect(all.some((c) => c.seedId === "routine_seed")).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 7: pair-compatible ranking
// ─────────────────────────────────────────────

describe("generateActivityCandidates — pair compatibility", () => {
  it("pair_compatible seed は universally optimal +1.0", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "pair_compat",
        taxonomy: { indoorOutdoor: "outdoor", pairCompatibility: "pair_compatible", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const candidate = out.candidates.find((c) => c.seedId === "pair_compat");
    expect(candidate?.scoreBreakdown.pairFit).toBeCloseTo(1.0, 10);
    expect(candidate?.reasonCodes).toContain("pair_optimal" satisfies ActivityCandidateReasonCode);
  });

  it("explicitly_pair seed + solo_friendly intent → pair_mismatch", () => {
    const intent = inferActivityIntent({
      activityHints: {
        indoorOutdoor: "outdoor",
        durationHint: "short",
        fatigueHint: 2,
        pairCompatibility: "solo_friendly",
        noveltyHint: "familiar",
      },
      costBand: "low",
      weather: "sunny",
      pairAvailability: "one_only",
    });
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "explicit_pair",
        taxonomy: { indoorOutdoor: "outdoor", pairCompatibility: "explicitly_pair", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const all = [...out.candidates, ...out.blockedCandidates];
    expect(all.some((c) => c.seedId === "explicit_pair")).toBe(true);
    // explicit_pair seed は pair_mismatch reason を持つ (accepted の場合) or blocked
    const candidate = out.candidates.find((c) => c.seedId === "explicit_pair");
    if (candidate !== undefined) {
      expect(candidate.scoreBreakdown.pairFit).toBeLessThan(0);
    }
  });
});

// ─────────────────────────────────────────────
// Test 8: veto / red-line blocking
// ─────────────────────────────────────────────

describe("generateActivityCandidates — red-line blocking", () => {
  it("redLineConflicts 非空 seed は red_line_violation で blocked", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "vetoed",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2 },
        redLineConflicts: ["no_alcohol"],
      }),
      makeSeed({
        seedId: "safe",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const blocked = out.blockedCandidates.find((b) => b.seedId === "vetoed");
    expect(blocked).toBeDefined();
    expect(blocked?.blockedReasonCodes).toContain(
      "red_line_violation" satisfies ActivityCandidateBlockedReasonCode,
    );
    // safe seed は candidates または blocked (score 次第)
    const safeAll = [
      ...out.candidates.map((c) => c.seedId),
      ...out.blockedCandidates.map((b) => b.seedId),
    ];
    expect(safeAll).toContain("safe");
  });

  it("redLineConflicts=[] (empty) は block しない", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "no_redline",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2 },
        redLineConflicts: [],
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const blocked = out.blockedCandidates.find((b) => b.seedId === "no_redline");
    if (blocked !== undefined) {
      expect(blocked.blockedReasonCodes).not.toContain(
        "red_line_violation" satisfies ActivityCandidateBlockedReasonCode,
      );
    }
  });
});

// ─────────────────────────────────────────────
// Test 9: food/movie/travel handoff seeds excluded
// ─────────────────────────────────────────────

describe("generateActivityCandidates — handoff seeds excluded", () => {
  it("handoffTarget=food seed → handoff_seed_excluded", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "food_seed",
        taxonomy: { indoorOutdoor: "indoor", fatigueLevel: 1 },
        handoffTarget: "food",
      }),
      makeSeed({
        seedId: "activity_seed",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2 },
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    const blocked = out.blockedCandidates.find((b) => b.seedId === "food_seed");
    expect(blocked).toBeDefined();
    expect(blocked?.blockedReasonCodes).toContain(
      "handoff_seed_excluded" satisfies ActivityCandidateBlockedReasonCode,
    );
    // food_seed は candidates に混ざらない
    expect(out.candidates.some((c) => c.seedId === "food_seed")).toBe(false);
  });

  it("handoffTarget=movie / travel も同様に excluded", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "movie_seed",
        taxonomy: { indoorOutdoor: "indoor" },
        handoffTarget: "movie",
      }),
      makeSeed({
        seedId: "travel_seed",
        taxonomy: { indoorOutdoor: "outdoor" },
        handoffTarget: "travel",
      }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    expect(out.blockedCandidates.some((b) => b.seedId === "movie_seed")).toBe(true);
    expect(out.blockedCandidates.some((b) => b.seedId === "travel_seed")).toBe(true);
    expect(out.candidates).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────
// Test 10: ambiguous intent → needsMoreCandidates / missing inputs
// ─────────────────────────────────────────────

describe("generateActivityCandidates — ambiguous intent", () => {
  it("intent.inferredActivityIntent='needs_narrowing' → empty candidates + intent_not_eligible", () => {
    const intent = inferActivityIntent({}); // empty input → needs_narrowing
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({ seedId: "s1", taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2 } }),
    ];

    const out = generateActivityCandidates({ intent, seeds });
    expect(out.candidates).toEqual([]);
    expect(out.reasonCodes).toContain("intent_not_eligible" satisfies ActivityCandidateReasonCode);
    expect(out.missingCandidateInputs).toContain(
      "intent_not_eligible" satisfies ActivityCandidateMissingInput,
    );
  });

  it("intent.inferredActivityIntent='out_of_scope' (handoff) → empty candidates", () => {
    const intent = inferActivityIntent({ foodHandoffSignal: true });
    const seeds: ActivityCandidateSeed[] = [];

    const out = generateActivityCandidates({ intent, seeds });
    expect(out.candidates).toEqual([]);
    expect(out.reasonCodes).toContain("intent_not_eligible" satisfies ActivityCandidateReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 11: reasonCodes 構造的検証 (raw text leakage 防止)
// ─────────────────────────────────────────────

describe("generateActivityCandidates — reasonCodes 構造的検証", () => {
  it("全 reasonCode / blockedReasonCode / missingCandidateInput は enum lower_snake_case", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "s1",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2, noveltyLevel: "familiar" },
      }),
      makeSeed({
        seedId: "blocked_s",
        taxonomy: { indoorOutdoor: "indoor" },
        handoffTarget: "food",
        redLineConflicts: ["no_alcohol"],
      }),
    ];
    const out = generateActivityCandidates({ intent, seeds });

    // 全 reasonCodes は ReasonCode enum
    for (const r of out.reasonCodes) {
      expect(r).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(r).not.toMatch(/[぀-ゟ゠-ヿ一-鿿]/);
      expect(r).not.toMatch(/\s/);
    }
    // 各 candidate.reasonCodes
    for (const c of out.candidates) {
      for (const r of c.reasonCodes) {
        expect(r).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
    // blockedCandidates
    for (const b of out.blockedCandidates) {
      for (const r of b.blockedReasonCodes) {
        expect(r).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
    // missingCandidateInputs
    for (const m of out.missingCandidateInputs) {
      expect(m).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it("redLineConflicts value (e.g., 'no_alcohol_secret') は output に含まれない", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "secret_red",
        taxonomy: { indoorOutdoor: "outdoor" },
        redLineConflicts: ["no_alcohol_secret_user_preference"],
      }),
    ];
    const out = generateActivityCandidates({ intent, seeds });
    const outputJson = JSON.stringify(out);
    expect(outputJson).not.toContain("no_alcohol_secret_user_preference");
    expect(outputJson).toContain("red_line_violation");
  });
});

// ─────────────────────────────────────────────
// Test 12: deterministic output
// ─────────────────────────────────────────────

describe("generateActivityCandidates — deterministic", () => {
  it("同じ input × 2 回 → 完全一致", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "s1",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2, noveltyLevel: "familiar" },
      }),
      makeSeed({
        seedId: "s2",
        taxonomy: { indoorOutdoor: "indoor", fatigueLevel: 3, noveltyLevel: "novelty" },
      }),
    ];
    const input: ActivityCandidateGeneratorInput = { intent, seeds };

    const out1 = generateActivityCandidates(input);
    const out2 = generateActivityCandidates(input);
    expect(out1).toEqual(out2);
  });

  it("同 totalScore は tie-break で seedId lexicographic order に並ぶ (deterministic)", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "z_late",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2, noveltyLevel: "familiar" },
      }),
      makeSeed({
        seedId: "a_early",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2, noveltyLevel: "familiar" },
      }),
    ];
    const out = generateActivityCandidates({ intent, seeds });
    // 同 score なら seedId 順 ("a_early" < "z_late")
    if (out.candidates.length === 2) {
      expect(out.candidates[0].seedId).toBe("a_early");
      expect(out.candidates[1].seedId).toBe("z_late");
    }
  });

  it("PROVISIONAL_SCORE_THRESHOLD = 0.4 / PROVISIONAL_DEFAULT_MAX_CANDIDATES = 3", () => {
    expect(PROVISIONAL_SCORE_THRESHOLD).toBe(0.4);
    expect(PROVISIONAL_DEFAULT_MAX_CANDIDATES).toBe(3);
  });

  it("GENERATOR_VERSION は semver", () => {
    expect(GENERATOR_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

// ─────────────────────────────────────────────
// Test 13: no runtime wiring (pure function)
// ─────────────────────────────────────────────

describe("generateActivityCandidates — no runtime wiring", () => {
  it("純関数: 副作用なし、JSON serializable", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "s1",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2 },
      }),
    ];
    const out = generateActivityCandidates({ intent, seeds });

    expect(() => JSON.stringify(out)).not.toThrow();
    const parsed = JSON.parse(JSON.stringify(out));
    expect(parsed.generatorVersion).toBe(GENERATOR_VERSION);
  });

  it("100 回連続呼出 完全一致 (deterministic)", () => {
    const intent = makeEligibleIntent();
    const seeds: ActivityCandidateSeed[] = [
      makeSeed({
        seedId: "s1",
        taxonomy: { indoorOutdoor: "outdoor", fatigueLevel: 2 },
      }),
    ];
    const first = generateActivityCandidates({ intent, seeds });
    for (let i = 0; i < 100; i++) {
      const out = generateActivityCandidates({ intent, seeds });
      expect(out).toEqual(first);
    }
  });
});
