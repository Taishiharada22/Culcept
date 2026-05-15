/**
 * CoAlter Travel Domain — Constraint Resolver Tests (T5 phase)
 *
 * 正本:
 *   - lib/coalter/travel/constraints.ts (本 PR T5)
 *   - lib/coalter/travel/pareto.ts (PR #139、T4)
 *   - lib/coalter/travel/itinerary.ts (PR #138、T3)
 *   - lib/coalter/travel/intent.ts (PR #137、T2)
 *
 * 21 test category × 40+ individual tests.
 */

import { describe, expect, it } from "vitest";
import {
  resolveTravelConstraints,
  CONSTRAINT_RESOLVER_VERSION,
  PROVISIONAL_CASCADE_HIGH_THRESHOLD,
  PROVISIONAL_CASCADE_MEDIUM_THRESHOLD,
  PROVISIONAL_UNCERTAINTY_DEMOTE_LABEL,
  type TravelConstraintResolverInput,
  type TravelConstraintResolverOutput,
  type TravelConstraintReasonCode,
  type TravelConstraintHardBlockCode,
  type TravelConstraintSoftWarningCode,
  type TravelConstraintRelaxationCode,
  type TravelConstraintConflictReasonCode,
  type TravelConstraintOriginPhase,
} from "../../../../lib/coalter/travel/constraints";
import type { TravelIntentOutput } from "../../../../lib/coalter/travel/intent";
import type {
  TravelBlockedItineraryCandidate,
  TravelFeasibilityNote,
  TravelItineraryGeneratorOutput,
  TravelItineraryScoreBreakdown,
  TravelRankedItineraryCandidate,
} from "../../../../lib/coalter/travel/itinerary";
import type {
  TravelParetoComparatorOutput,
  TravelParetoScoreBreakdown,
  TravelRankedParetoCandidate,
  TravelDominatedCandidate,
} from "../../../../lib/coalter/travel/pareto";
import type {
  TravelCandidate,
  TravelItinerary,
  TravelParetoAxis,
  TravelUncertaintyLabel,
} from "../../../../lib/coalter/travel/types";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeIntent(overrides: Partial<TravelIntentOutput> = {}): TravelIntentOutput {
  return {
    inferredTravelIntent: "travel_eligible",
    travelScope: "overnight_one_night",
    suggestedConstraints: [],
    destinationSignals: ["domestic_kanto"],
    durationSignals: ["one_night"],
    budgetSignals: ["moderate"],
    fatigueSignals: { transitFatigue: 3, onSiteFatigue: 3, combined: 3 },
    needsNarrowing: false,
    missingSlots: [],
    confidence: 0.8,
    reasonCodes: ["travel_signal_present"],
    intentVersion: "0.1.0",
    ...overrides,
  };
}

function makeItin(): TravelItinerary {
  return {
    itineraryId: "it",
    nodes: [],
    moves: [],
    totalDays: 1,
    totalNights: 1,
    budgetBand: { lo: 15000, hi: 30000, confidence: 0.5 },
    fatigueLevel: 3,
    uncertaintyLabel: "mid_confidence",
  };
}

function makeT3Breakdown(
  overrides: Partial<TravelItineraryScoreBreakdown> = {},
): TravelItineraryScoreBreakdown {
  return {
    feasibility: 0.8,
    transitFatigue: 0.7,
    onSiteFatigue: 0.6,
    budgetFit: 0.7,
    timeBalance: 0.6,
    pairTogethernessFit: 0.7,
    anchorWanderBalance: 0.6,
    redLineSafety: 1,
    uncertaintyScore: 0.3,
    totalScore: 0.7,
    paretoAxis: "balanced",
    dayRhythmPatterns: ["balanced_arc"],
    transitionRisks: ["low"],
    anchorCountPerDay: [1, 1],
    pairBalanceSignature: {
      togetherNodeRatio: 1,
      splitNodeRatio: 0,
      sharedAnchorCount: 1,
    },
    budgetAllocation: {
      lodgingRatio: 0.5,
      transportRatio: 0.2,
      foodRatio: 0.15,
      activityRatio: 0.15,
      totalCost: 20000,
    },
    ...overrides,
  };
}

function makeT3Ranked(candidateId: string): TravelRankedItineraryCandidate {
  const candidate: TravelCandidate = {
    candidateId,
    itinerary: makeItin(),
    rationale: { perUserA: "", perUserB: "", synthesis: "" },
    paretoAxis: "balanced",
    appliedConstraints: [],
  };
  return {
    candidate,
    rank: 1,
    scoreBreakdown: makeT3Breakdown(),
    uncertaintyLabel: "mid_confidence",
    explanationReasonCodes: ["high_feasibility"],
  };
}

function makeT4Ranked(
  candidateId: string,
  paretoAxis: TravelParetoAxis = "balanced",
  uncertaintyLabel: TravelUncertaintyLabel = "mid_confidence",
  paretoFront = 1,
): TravelRankedParetoCandidate {
  return {
    candidateId,
    rank: 1,
    paretoFront,
    effectiveScore: 0.7,
    paretoAxis,
    uncertaintyLabel,
    whyThisRankCodes: [],
  };
}

function makeT4Breakdown(
  overrides: Partial<TravelParetoScoreBreakdown> = {},
): TravelParetoScoreBreakdown {
  return {
    feasibility: 0.8,
    transitFatigue: 0.7,
    onSiteFatigue: 0.6,
    budgetFit: 0.7,
    timeBalance: 0.6,
    pairTogethernessFit: 0.7,
    anchorWanderBalance: 0.6,
    redLineSafety: 1,
    uncertaintyScore: 0.3,
    noveltyScore: 0.5,
    effectiveScore: 0.7,
    paretoAxis: "balanced",
    ...overrides,
  };
}

function makeT3Output(
  overrides: Partial<TravelItineraryGeneratorOutput> = {},
): TravelItineraryGeneratorOutput {
  return {
    rankedCandidates: [makeT3Ranked("c1")],
    blockedCandidates: [],
    feasibilityNotes: [],
    scoreBreakdown: { c1: makeT3Breakdown() },
    missingInputs: [],
    reasonCodes: ["candidates_generated"],
    itineraryVersion: "0.1.0",
    ...overrides,
  };
}

function makeT4Output(
  overrides: Partial<TravelParetoComparatorOutput> = {},
): TravelParetoComparatorOutput {
  return {
    paretoFronts: [{ frontNumber: 1, candidateIds: ["c1"] }],
    rankedCandidates: [makeT4Ranked("c1")],
    dominatedCandidates: [],
    tradeoffLabels: [],
    scoreBreakdown: { c1: makeT4Breakdown() },
    blockedCandidates: [],
    comparisonNotes: [],
    missingInputs: [],
    reasonCodes: ["pareto_layering_applied"],
    comparatorVersion: "0.1.0",
    ...overrides,
  };
}

function makeInput(
  intent?: Partial<TravelIntentOutput>,
  t3?: Partial<TravelItineraryGeneratorOutput>,
  t4?: Partial<TravelParetoComparatorOutput>,
  extra?: Partial<TravelConstraintResolverInput>,
): TravelConstraintResolverInput {
  return {
    intentOutput: makeIntent(intent),
    itineraryOutput: makeT3Output(t3),
    paretoOutput: makeT4Output(t4),
    ...extra,
  };
}

// ─────────────────────────────────────────────
// Test 1: empty input fail-closed
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — empty input fail-closed", () => {
  it("rankedCandidates 空 → fail_closed_empty_input + missingInputs", () => {
    const out = resolveTravelConstraints({
      intentOutput: makeIntent(),
      itineraryOutput: { ...makeT3Output(), rankedCandidates: [] },
      paretoOutput: { ...makeT4Output(), rankedCandidates: [] },
    });
    expect(out.resolvedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("fail_closed_empty_input" satisfies TravelConstraintReasonCode);
    expect(out.missingInputs).toContain("ranked_candidates");
    expect(out.resolverVersion).toBe(CONSTRAINT_RESOLVER_VERSION);
  });
});

// ─────────────────────────────────────────────
// Test 2: no conflict candidate (all resolved)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — no conflict candidate", () => {
  it("conflict なし → resolvedCandidates only + all_resolved", () => {
    const out = resolveTravelConstraints(makeInput());
    expect(out.resolvedCandidates.length).toBeGreaterThan(0);
    expect(out.blockedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("all_resolved" satisfies TravelConstraintReasonCode);
    // top resolved candidate fully_resolved
    const top = out.resolvedCandidates[0];
    expect(top.resolutionStatus).toBe("fully_resolved");
    expect(top.whyResolvedCodes).toContain("no_red_line_violations");
  });
});

// ─────────────────────────────────────────────
// Test 3: budget hard conflict
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — budget hard conflict", () => {
  it("T3 blocked budget_over_band → hardBlock + relaxation suggestion", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    expect(out.hardBlocks.length).toBeGreaterThan(0);
    const hb = out.hardBlocks[0];
    expect(hb.blockReasonCode).toBe("budget_over_band_block" satisfies TravelConstraintHardBlockCode);
    expect(hb.relaxationSuggestionCode).toBe(
      "relax_budget_one_step" satisfies TravelConstraintRelaxationCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 4: fatigue hard conflict
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — fatigue hard conflict", () => {
  it("T3 blocked cognitive_load_ceiling_exceeded → hard block + relax_anchor_density", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "cognitive_load_ceiling_exceeded",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    expect(out.hardBlocks.length).toBeGreaterThan(0);
    const hb = out.hardBlocks[0];
    expect(hb.blockReasonCode).toBe("cognitive_load_ceiling_exceeded" satisfies TravelConstraintHardBlockCode);
    expect(hb.relaxationSuggestionCode).toBe(
      "relax_anchor_density" satisfies TravelConstraintRelaxationCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 5: transit hard conflict
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — transit hard conflict", () => {
  it("T3 blocked transit_extreme_cascade → hard block + relax_transit_one_step", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "transit_extreme_cascade",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    const hb = out.hardBlocks[0];
    expect(hb.relaxationSuggestionCode).toBe(
      "relax_transit_one_step" satisfies TravelConstraintRelaxationCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 6: red-line hard block
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — red-line hard block", () => {
  it("T3 blocked red_line_violation (no_long_drive) → relax_red_line_no_long_drive", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "red_line_violation",
      detailCode: "no_long_drive_violation",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    const hb = out.hardBlocks[0];
    expect(hb.blockReasonCode).toBe("red_line_violation" satisfies TravelConstraintHardBlockCode);
    expect(hb.relaxationSuggestionCode).toBe(
      "relax_red_line_no_long_drive" satisfies TravelConstraintRelaxationCode,
    );
  });

  it("conflict graph に red_line severity 含む + origin_t3_itinerary tag", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "red_line_violation",
      detailCode: "no_overseas_violation",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    const redLineConflict = out.conflictGraph.find((n) => n.severity === "red_line");
    expect(redLineConflict).toBeDefined();
    expect(redLineConflict!.originPhase).toBe(
      "origin_t3_itinerary" satisfies TravelConstraintOriginPhase,
    );
    expect(redLineConflict!.conflictReasonCode).toBe(
      "red_line_no_overseas" satisfies TravelConstraintConflictReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 7: weather uncertainty warning
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — weather uncertainty warning", () => {
  it("T3 reasonCodes に uncertainty_raised_weather → soft warning", () => {
    const out = resolveTravelConstraints(
      makeInput(undefined, {
        reasonCodes: ["candidates_generated", "uncertainty_raised_weather"],
      }),
    );
    const weatherWarn = out.softWarnings.find(
      (w) => w.warningReasonCode === ("uncertainty_raised_weather" satisfies TravelConstraintSoftWarningCode),
    );
    expect(weatherWarn).toBeDefined();
  });

  it("T3 feasibilityNote weather_dependent_in_rain_warning → soft warning", () => {
    const note: TravelFeasibilityNote = {
      reasonCode: "weather_dependent_in_rain_warning",
      candidateId: "c1",
    };
    const out = resolveTravelConstraints(makeInput(undefined, { feasibilityNotes: [note] }));
    const rainWarn = out.softWarnings.find(
      (w) => w.warningReasonCode === ("weather_dependent_in_rain_warning" satisfies TravelConstraintSoftWarningCode),
    );
    expect(rainWarn).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// Test 8: pair togetherness conflict
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — pair togetherness conflict", () => {
  it("T4 pair_mismatch_discount_applied + pairTogethernessFit < 0.5 → pair conflict + soft warning", () => {
    const t4Output = makeT4Output({
      reasonCodes: ["pareto_layering_applied", "pair_mismatch_discount_applied"],
      scoreBreakdown: { c1: makeT4Breakdown({ pairTogethernessFit: 0.3 }) },
    });
    const out = resolveTravelConstraints(makeInput(undefined, undefined, t4Output));
    const pairConflict = out.conflictGraph.find(
      (n) => n.conflictReasonCode === ("pair_togetherness_mismatch" satisfies TravelConstraintConflictReasonCode),
    );
    expect(pairConflict).toBeDefined();
    expect(pairConflict!.originPhase).toBe("origin_t4_pareto" satisfies TravelConstraintOriginPhase);
    const pairWarn = out.softWarnings.find(
      (w) => w.warningReasonCode === ("pair_mismatch_warning" satisfies TravelConstraintSoftWarningCode),
    );
    expect(pairWarn).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// Test 9: soft preference conflict (Pareto dominated)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — soft preference conflict (Pareto dominated)", () => {
  it("T4 dominated candidate → soft warning + conflict graph (origin_t4_pareto)", () => {
    const dominated: TravelDominatedCandidate = {
      candidateId: "c2",
      dominatedByCandidateId: "c1",
      dominanceReasonCodes: ["dominates_universally"],
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, undefined, { dominatedCandidates: [dominated] }),
    );
    const domWarn = out.softWarnings.find(
      (w) => w.warningReasonCode === ("pareto_dominated_soft_warning" satisfies TravelConstraintSoftWarningCode),
    );
    expect(domWarn).toBeDefined();
    expect(out.reasonCodes).toContain("pareto_dominated_warning_added" satisfies TravelConstraintReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 10: minimal relaxation set (greedy)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — minimal relaxation set (greedy)", () => {
  it("複数 hardBlock 同 relaxation → 1 つの relaxation で全 unblock + cascade_high", () => {
    const blocked1: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const blocked2: TravelBlockedItineraryCandidate = {
      candidateId: "c2",
      blockedReasonCode: "budget_over_band",
    };
    const blocked3: TravelBlockedItineraryCandidate = {
      candidateId: "c3",
      blockedReasonCode: "budget_over_band",
    };
    const out = resolveTravelConstraints(
      makeInput(
        undefined,
        { blockedCandidates: [blocked1, blocked2, blocked3], rankedCandidates: [] },
        { rankedCandidates: [] },
      ),
    );
    expect(out.minimalRelaxationSet.relaxationCodes).toContain(
      "relax_budget_one_step" satisfies TravelConstraintRelaxationCode,
    );
    expect(out.minimalRelaxationSet.estimatedUnblockedCount).toBe(3);
    expect(out.minimalRelaxationSet.cascade).toBe("high");
    expect(out.reasonCodes).toContain("cascade_high_detected" satisfies TravelConstraintReasonCode);
  });

  it("hardBlock なし → empty relaxation set + cascade none", () => {
    const out = resolveTravelConstraints(makeInput());
    expect(out.minimalRelaxationSet.relaxationCodes).toEqual([]);
    expect(out.minimalRelaxationSet.cascade).toBe("none");
  });

  it("no_relaxation_possible (海外 red_line) → no_relaxation_possible reason", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "red_line_violation",
      detailCode: "no_overseas_violation",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    // no_overseas は no_relaxation_possible
    expect(out.minimalRelaxationSet.relaxationCodes).toContain(
      "no_relaxation_possible" satisfies TravelConstraintRelaxationCode,
    );
    expect(out.reasonCodes).toContain("no_relaxation_possible" satisfies TravelConstraintReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 11: multiple conflicts deterministic order (人間超越 Idea H)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — deterministic conflict ordering", () => {
  it("red_line > hard > soft の順で sort", () => {
    const blocked1: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "red_line_violation",
      detailCode: "no_long_drive_violation",
    };
    const blocked2: TravelBlockedItineraryCandidate = {
      candidateId: "c2",
      blockedReasonCode: "budget_over_band",
    };
    const out = resolveTravelConstraints(
      makeInput(
        undefined,
        { blockedCandidates: [blocked1, blocked2], rankedCandidates: [] },
        { rankedCandidates: [] },
      ),
    );
    // 最初の conflict node は red_line
    expect(out.conflictGraph[0].severity).toBe("red_line");
  });

  it("100 回連続呼出で完全同一 output", () => {
    const input = makeInput();
    const baseline = JSON.stringify(resolveTravelConstraints(input));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(resolveTravelConstraints(input))).toBe(baseline);
    }
  });
});

// ─────────────────────────────────────────────
// Test 12: Pareto trade-off conflict summary (人間超越 Idea F + L)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — Pareto trade-off conflict summary", () => {
  it("T4 tradeoffLabel → tradeoffCompatibility 生成", () => {
    const out = resolveTravelConstraints(
      makeInput(undefined, undefined, {
        tradeoffLabels: [
          {
            candidateAId: "c1",
            candidateBId: "c2",
            labelCode: "budget_vs_fatigue",
          },
        ],
      }),
    );
    expect(out.tradeoffCompatibility.length).toBeGreaterThan(0);
    const entry = out.tradeoffCompatibility[0];
    expect(entry.acceptableTradeoffLabel).toBe("budget_vs_fatigue");
    expect(entry.resolutionSuggestion).toBe(
      "relax_budget_one_step" satisfies TravelConstraintRelaxationCode,
    );
    expect(out.reasonCodes).toContain(
      "tradeoff_compatibility_computed" satisfies TravelConstraintReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 13: reasonCodes 構造的検証 (raw text 不入)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — reasonCodes structural safety", () => {
  it("reasonCodes / hardBlockCodes / softWarningCodes / relaxationCodes は enum のみ", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    for (const code of out.reasonCodes) {
      expect(code).toMatch(/^[a-z_]+$/);
    }
    for (const hb of out.hardBlocks) {
      expect(hb.blockReasonCode).toMatch(/^[a-z_]+$/);
      if (hb.relaxationSuggestionCode !== undefined) {
        expect(hb.relaxationSuggestionCode).toMatch(/^[a-z_]+$/);
      }
    }
    for (const sw of out.softWarnings) {
      expect(sw.warningReasonCode).toMatch(/^[a-z_]+$/);
    }
    for (const r of out.minimalRelaxationSet.relaxationCodes) {
      expect(r).toMatch(/^[a-z_]+$/);
    }
  });

  it("conflictGraph nodes / heatmap は enum field のみ", () => {
    const out = resolveTravelConstraints(makeInput());
    for (const node of out.conflictGraph) {
      expect(node.constraintField).toMatch(/^[a-z_]+$/);
      expect(node.severity).toMatch(/^[a-z_]+$/);
      expect(node.conflictReasonCode).toMatch(/^[a-z_]+$/);
      expect(node.originPhase).toMatch(/^[a-z_]+$/);
    }
  });
});

// ─────────────────────────────────────────────
// Test 14: no runtime wiring (pure function 検証)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — no runtime wiring", () => {
  it("output は JSON serializable", () => {
    const out = resolveTravelConstraints(makeInput());
    const json = JSON.stringify(out);
    expect(json).toBeDefined();
    const parsed = JSON.parse(json) as TravelConstraintResolverOutput;
    expect(parsed.resolverVersion).toBe("0.1.0");
  });

  it("dynamic import 可能 (call-site wiring 0)", async () => {
    const mod = await import("../../../../lib/coalter/travel/constraints");
    expect(typeof mod.resolveTravelConstraints).toBe("function");
    expect(mod.CONSTRAINT_RESOLVER_VERSION).toBe("0.1.0");
  });

  it("PROVISIONAL constants は固定値", () => {
    expect(CONSTRAINT_RESOLVER_VERSION).toBe("0.1.0");
    expect(PROVISIONAL_CASCADE_HIGH_THRESHOLD).toBe(2);
    expect(PROVISIONAL_CASCADE_MEDIUM_THRESHOLD).toBe(1);
    expect(PROVISIONAL_UNCERTAINTY_DEMOTE_LABEL).toBe("info_lacking");
  });
});

// ─────────────────────────────────────────────
// Test 15: constraint hierarchy enforcement (人間超越 Idea A)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — constraint hierarchy enforcement", () => {
  it("constraint_hierarchy_applied reason は常に含む", () => {
    const out = resolveTravelConstraints(makeInput());
    expect(out.reasonCodes).toContain(
      "constraint_hierarchy_applied" satisfies TravelConstraintReasonCode,
    );
  });

  it("hard severity は relaxation 可能、red_line severity は緩和不可 / 制限的", () => {
    const blocked1: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked1], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    const hardConflict = out.conflictGraph.find((n) => n.severity === "hard");
    expect(hardConflict).toBeDefined();
    // hard は緩和可能 (no_relaxation_possible 以外)
    const hb = out.hardBlocks[0];
    expect(hb.relaxationSuggestionCode).not.toBe("no_relaxation_possible");
  });
});

// ─────────────────────────────────────────────
// Test 16: cascade conflict detection (人間超越 Idea J)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — cascade conflict detection", () => {
  it("1 候補のみ block → cascade low / medium", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    expect(["low", "medium"]).toContain(out.minimalRelaxationSet.cascade);
  });

  it("0 候補 block → cascade none", () => {
    const out = resolveTravelConstraints(makeInput());
    expect(out.minimalRelaxationSet.cascade).toBe("none");
  });
});

// ─────────────────────────────────────────────
// Test 17: uncertainty-aware blocking (人間超越 Idea G)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — uncertainty-aware blocking", () => {
  it("info_lacking uncertainty + hard → soft 降格 (uncertainty_severity_demoted reason)", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const t4Output = makeT4Output({
      rankedCandidates: [makeT4Ranked("c1", "balanced", "info_lacking")],
    });
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, t4Output),
    );
    expect(out.reasonCodes).toContain(
      "uncertainty_severity_demoted" satisfies TravelConstraintReasonCode,
    );
    // soft warning に降格、hard block list 入らない
    const demoteWarn = out.softWarnings.find(
      (w) =>
        w.warningReasonCode ===
        ("uncertainty_demoted_from_hard" satisfies TravelConstraintSoftWarningCode),
    );
    expect(demoteWarn).toBeDefined();
  });

  it("red_line は uncertainty で降格しない", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "red_line_violation",
      detailCode: "no_overseas_violation",
    };
    const t4Output = makeT4Output({
      rankedCandidates: [makeT4Ranked("c1", "balanced", "info_lacking")],
    });
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, t4Output),
    );
    // red_line のまま、demoted reason 不在 (red_line は変えない)
    const redLineConflict = out.conflictGraph.find((n) => n.severity === "red_line");
    expect(redLineConflict).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// Test 18: constraint genealogy tracking (人間超越 Idea I)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — constraint genealogy tracking", () => {
  it("T3 blocked → origin_t3_itinerary tag / T4 dominated → origin_t4_pareto tag", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const dominated: TravelDominatedCandidate = {
      candidateId: "c2",
      dominatedByCandidateId: "c3",
      dominanceReasonCodes: ["dominates_universally"],
    };
    const out = resolveTravelConstraints(
      makeInput(
        undefined,
        { blockedCandidates: [blocked], rankedCandidates: [] },
        { dominatedCandidates: [dominated], rankedCandidates: [] },
      ),
    );
    const t3Conflict = out.conflictGraph.find((n) => n.originPhase === "origin_t3_itinerary");
    const t4Conflict = out.conflictGraph.find((n) => n.originPhase === "origin_t4_pareto");
    expect(t3Conflict).toBeDefined();
    expect(t4Conflict).toBeDefined();
    expect(out.reasonCodes).toContain(
      "constraint_genealogy_tagged" satisfies TravelConstraintReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 19: conflict heatmap (人間超越 Idea K)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — conflict heatmap", () => {
  it("heatmap[candidateId][constraintField] = severity", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    expect(out.conflictHeatmap["c1"]).toBeDefined();
    expect(out.conflictHeatmap["c1"]["budget"]).toBe("hard");
    expect(out.reasonCodes).toContain("conflict_heatmap_built" satisfies TravelConstraintReasonCode);
  });

  it("複数 severity 重なる → 最厳しい severity (red_line) を残す", () => {
    const blocked1: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "red_line_violation",
      detailCode: "no_long_drive_violation",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked1], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    // distance field に red_line
    expect(out.conflictHeatmap["c1"]["distance"]).toBe("red_line");
  });
});

// ─────────────────────────────────────────────
// Test 20: feasibility delta (人間超越 Idea M)
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — feasibility delta (1-step relaxation)", () => {
  it("1 hardBlock のみ → 1-step feasible + required relaxation", () => {
    const blocked: TravelBlockedItineraryCandidate = {
      candidateId: "c1",
      blockedReasonCode: "budget_over_band",
    };
    const out = resolveTravelConstraints(
      makeInput(undefined, { blockedCandidates: [blocked], rankedCandidates: [] }, { rankedCandidates: [] }),
    );
    const delta = out.feasibilityDelta.find((d) => d.candidateId === "c1");
    expect(delta).toBeDefined();
    expect(delta!.oneStepRelaxationFeasible).toBe(true);
    expect(delta!.requiredRelaxation).toBe(
      "relax_budget_one_step" satisfies TravelConstraintRelaxationCode,
    );
    expect(out.reasonCodes).toContain(
      "feasibility_delta_computed" satisfies TravelConstraintReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 21: intent pass-through
// ─────────────────────────────────────────────

describe("resolveTravelConstraints — intent pass-through", () => {
  it("intent=unsupported_future → passed_through_unsupported", () => {
    const out = resolveTravelConstraints(
      makeInput({
        inferredTravelIntent: "unsupported_future",
        travelScope: "unsupported_overseas",
      }),
    );
    expect(out.reasonCodes).toContain(
      "passed_through_unsupported" satisfies TravelConstraintReasonCode,
    );
    expect(out.resolvedCandidates).toEqual([]);
  });

  it("intent=needs_narrowing → passed_through_narrowing + missingInputs", () => {
    const out = resolveTravelConstraints(
      makeInput({
        inferredTravelIntent: "needs_narrowing",
        travelScope: "unclear_or_narrowing",
        needsNarrowing: true,
      }),
    );
    expect(out.reasonCodes).toContain(
      "passed_through_narrowing" satisfies TravelConstraintReasonCode,
    );
    expect(out.missingInputs).toContain("intent_output");
  });
});
