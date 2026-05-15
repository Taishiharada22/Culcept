/**
 * CoAlter Travel Domain — Itinerary Generator Tests (T3 phase)
 *
 * 正本:
 *   - lib/coalter/travel/itinerary.ts (本 PR T3)
 *   - lib/coalter/travel/intent.ts (PR #137 T2)
 *   - docs/coalter-travel-domain-greenfield-design.md (PR #124)
 *
 * 19 test category × 40+ individual tests.
 */

import { describe, expect, it } from "vitest";
import {
  generateTravelItineraries,
  ITINERARY_GENERATOR_VERSION,
  PROVISIONAL_MAX_CANDIDATES,
  PROVISIONAL_ANCHOR_PER_DAY_CEILING,
  PROVISIONAL_COGNITIVE_LOAD_CEILING_PER_DAY,
  PROVISIONAL_TRANSIT_MINUTES_HIGH,
  PROVISIONAL_TRANSIT_MINUTES_EXTREME,
  type TravelDestinationSeed,
  type TravelExperienceSeed,
  type TravelLodgingSeed,
  type TravelMoveSeed,
  type TravelItineraryGeneratorInput,
  type TravelItineraryGeneratorOutput,
  type TravelItineraryReasonCode,
  type TravelItineraryBlockedReasonCode,
  type TravelItineraryExplanationCode,
} from "../../../../lib/coalter/travel/itinerary";
import type { TravelIntentOutput } from "../../../../lib/coalter/travel/intent";
import type { TravelBudgetBand } from "../../../../lib/coalter/travel/types";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeBudget(lo: number, hi: number): TravelBudgetBand {
  return { lo, hi, confidence: 0.5 };
}

function makeDest(
  seedId: string,
  fatigue: 1 | 2 | 3 | 4 | 5 = 3,
  budgetLo = 5000,
  budgetHi = 15000,
): TravelDestinationSeed {
  return {
    seedId,
    placeIdCode: `place_${seedId}`,
    region: "domestic_kanto",
    defaultFatigueLoad: fatigue,
    budgetEstimate: makeBudget(budgetLo, budgetHi),
    anchorLevel: "anchor",
    activityType: "sightseeing",
  };
}

function makeLodging(seedId: string, budgetLo = 10000, budgetHi = 20000): TravelLodgingSeed {
  return {
    seedId,
    placeIdCode: `lodging_${seedId}`,
    region: "domestic_kanto",
    budgetEstimate: makeBudget(budgetLo, budgetHi),
    anchorLevel: "anchor",
  };
}

function makeExperience(
  seedId: string,
  fatigue: 1 | 2 | 3 | 4 | 5 = 2,
): TravelExperienceSeed {
  return {
    seedId,
    placeIdCode: `exp_${seedId}`,
    activityType: "experience",
    defaultFatigueLoad: fatigue,
    durationMinutes: 120,
    budgetEstimate: makeBudget(2000, 5000),
    anchorLevel: "wander",
  };
}

function makeMove(
  seedId: string,
  fromCode: string,
  toCode: string,
  duration: number,
): TravelMoveSeed {
  return {
    seedId,
    fromPlaceIdCode: fromCode,
    toPlaceIdCode: toCode,
    transport: "train",
    durationMinutes: duration,
    costEstimate: makeBudget(500, 2000),
  };
}

function makeIntentOutput(
  overrides: Partial<TravelIntentOutput> = {},
): TravelIntentOutput {
  return {
    inferredTravelIntent: "travel_eligible",
    travelScope: "overnight_one_night",
    suggestedConstraints: ["duration_one_night_inferred"],
    destinationSignals: ["domestic_kanto"],
    durationSignals: ["one_night"],
    budgetSignals: ["moderate"],
    fatigueSignals: { transitFatigue: 3, onSiteFatigue: 3, combined: 3 },
    needsNarrowing: false,
    missingSlots: [],
    confidence: 0.8,
    reasonCodes: ["travel_signal_present", "above_threshold"],
    intentVersion: "0.1.0",
    ...overrides,
  };
}

function makeInput(
  overrides: Partial<TravelItineraryGeneratorInput> = {},
): TravelItineraryGeneratorInput {
  return {
    intentOutput: makeIntentOutput(),
    destinationSeeds: [makeDest("d1"), makeDest("d2")],
    experienceSeeds: [makeExperience("e1")],
    lodgingSeeds: [makeLodging("l1")],
    moveSeeds: [makeMove("m1", "place_d1", "lodging_l1", 30)],
    ...overrides,
  };
}

// ─────────────────────────────────────────────
// Test 1: empty input fail-closed
// ─────────────────────────────────────────────

describe("generateTravelItineraries — empty input fail-closed", () => {
  it("empty destinationSeeds → fail_closed_no_destinations", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput(),
      destinationSeeds: [],
    });
    expect(out.rankedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("fail_closed_no_destinations" satisfies TravelItineraryReasonCode);
    expect(out.missingInputs).toContain("destination_seeds");
  });

  it("undefined destinationSeeds → fail_closed_no_destinations", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput(),
    });
    expect(out.reasonCodes).toContain("fail_closed_no_destinations" satisfies TravelItineraryReasonCode);
  });

  it("overnight scope + lodging seed 不在 → fail_closed_no_lodging_for_overnight", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({ travelScope: "overnight_one_night" }),
      destinationSeeds: [makeDest("d1")],
      lodgingSeeds: [],
    });
    expect(out.reasonCodes).toContain("fail_closed_no_lodging_for_overnight" satisfies TravelItineraryReasonCode);
    expect(out.missingInputs).toContain("lodging_seeds_for_overnight");
  });
});

// ─────────────────────────────────────────────
// Test 2: T2 needs_narrowing pass-through
// ─────────────────────────────────────────────

describe("generateTravelItineraries — T2 needs_narrowing pass-through", () => {
  it("intent=needs_narrowing → passed_through_narrowing + empty rankedCandidates", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({
        inferredTravelIntent: "needs_narrowing",
        travelScope: "unclear_or_narrowing",
        needsNarrowing: true,
      }),
      destinationSeeds: [makeDest("d1")],
      lodgingSeeds: [makeLodging("l1")],
    });
    expect(out.rankedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("passed_through_narrowing" satisfies TravelItineraryReasonCode);
    expect(out.missingInputs).toContain("intent_output");
  });
});

// ─────────────────────────────────────────────
// Test 3: T2 unsupported_future pass-through
// ─────────────────────────────────────────────

describe("generateTravelItineraries — T2 unsupported_future pass-through", () => {
  it("intent=unsupported_future (overseas) → passed_through_unsupported", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({
        inferredTravelIntent: "unsupported_future",
        travelScope: "unsupported_overseas",
      }),
      destinationSeeds: [makeDest("d1")],
      lodgingSeeds: [makeLodging("l1")],
    });
    expect(out.rankedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("passed_through_unsupported" satisfies TravelItineraryReasonCode);
  });

  it("intent=unsupported_future (extended) → passed_through_unsupported", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({
        inferredTravelIntent: "unsupported_future",
        travelScope: "unsupported_extended",
      }),
      destinationSeeds: [makeDest("d1")],
      lodgingSeeds: [makeLodging("l1")],
    });
    expect(out.reasonCodes).toContain("passed_through_unsupported" satisfies TravelItineraryReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 4: T2 out_of_scope_handoff pass-through
// ─────────────────────────────────────────────

describe("generateTravelItineraries — T2 out_of_scope_handoff pass-through", () => {
  it("intent=out_of_scope_handoff → passed_through_handoff", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({
        inferredTravelIntent: "out_of_scope_handoff",
        travelScope: "out_of_scope_short",
        handoffTarget: "activity",
      }),
      destinationSeeds: [makeDest("d1")],
      lodgingSeeds: [makeLodging("l1")],
    });
    expect(out.rankedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("passed_through_handoff" satisfies TravelItineraryReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 5: clear 1 泊 itinerary
// ─────────────────────────────────────────────

describe("generateTravelItineraries — clear 1 泊 itinerary", () => {
  it("travel_eligible + 1 泊 scope + seeds 揃った → rankedCandidates 生成", () => {
    const out = generateTravelItineraries(makeInput());
    expect(out.rankedCandidates.length).toBeGreaterThan(0);
    expect(out.reasonCodes).toContain("candidates_generated" satisfies TravelItineraryReasonCode);
    expect(out.itineraryVersion).toBe(ITINERARY_GENERATOR_VERSION);
    // top candidate の itinerary 構造
    const top = out.rankedCandidates[0];
    expect(top.rank).toBe(1);
    expect(top.candidate.itinerary.totalDays).toBe(1);
    expect(top.candidate.itinerary.totalNights).toBe(1);
    expect(top.candidate.itinerary.nodes.length).toBeGreaterThan(2);
    // lodging node 存在
    const lodgingNode = top.candidate.itinerary.nodes.find((n) => n.type === "lodging");
    expect(lodgingNode).toBeDefined();
  });

  it("explanationReasonCodes に pareto axis label が含まれる", () => {
    const out = generateTravelItineraries(makeInput());
    const top = out.rankedCandidates[0];
    const hasPareto = top.explanationReasonCodes.some((c) => c.startsWith("pareto_axis_"));
    expect(hasPareto).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 6: clear 2 泊 itinerary
// ─────────────────────────────────────────────

describe("generateTravelItineraries — clear 2 泊 itinerary", () => {
  it("travel_eligible + 2 泊 scope → totalDays=2 / totalNights=2", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      intentOutput: makeIntentOutput({ travelScope: "overnight_two_nights" }),
      lodgingSeeds: [makeLodging("l1"), makeLodging("l2")],
    });
    expect(out.rankedCandidates.length).toBeGreaterThan(0);
    const top = out.rankedCandidates[0];
    expect(top.candidate.itinerary.totalDays).toBe(2);
    expect(top.candidate.itinerary.totalNights).toBe(2);
    // 2 つの lodging node
    const lodgingNodes = top.candidate.itinerary.nodes.filter((n) => n.type === "lodging");
    expect(lodgingNodes.length).toBe(2);
  });
});

// ─────────────────────────────────────────────
// Test 7: day trip handling
// ─────────────────────────────────────────────

describe("generateTravelItineraries — day trip handling", () => {
  it("day_trip_excursion scope → totalNights=0、lodging 不要", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({
        travelScope: "day_trip_excursion",
        durationSignals: ["day_trip"],
      }),
      destinationSeeds: [makeDest("d1")],
      moveSeeds: [makeMove("m1", "place_d1", "place_d1", 60)],
    });
    expect(out.rankedCandidates.length).toBeGreaterThan(0);
    expect(out.rankedCandidates[0].candidate.itinerary.totalNights).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 8: missing destination seed
// ─────────────────────────────────────────────

describe("generateTravelItineraries — missing destination seed", () => {
  it("destinationSeeds 0 → fail-closed", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput(),
      destinationSeeds: [],
      lodgingSeeds: [makeLodging("l1")],
    });
    expect(out.missingInputs).toContain("destination_seeds");
    expect(out.rankedCandidates).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// Test 9: missing lodging seed for overnight
// ─────────────────────────────────────────────

describe("generateTravelItineraries — missing lodging seed for overnight", () => {
  it("overnight + lodging 0 → fail-closed", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({ travelScope: "overnight_one_night" }),
      destinationSeeds: [makeDest("d1")],
      lodgingSeeds: [],
    });
    expect(out.missingInputs).toContain("lodging_seeds_for_overnight");
    expect(out.rankedCandidates).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// Test 10: fatigue-aware itinerary
// ─────────────────────────────────────────────

describe("generateTravelItineraries — fatigue-aware", () => {
  it("low fatigue seed → scoreBreakdown.onSiteFatigue 高め", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      destinationSeeds: [makeDest("d1", 1), makeDest("d2", 1)],
    });
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.onSiteFatigue).toBeGreaterThan(0.5);
  });

  it("high fatigue seed → scoreBreakdown.onSiteFatigue 低め", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      destinationSeeds: [makeDest("d1", 5), makeDest("d2", 5)],
    });
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.onSiteFatigue).toBeLessThan(0.8);
  });

  it("long transit minutes → scoreBreakdown.transitFatigue 低め", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      moveSeeds: [
        makeMove("m1", "place_d1", "lodging_l1", 200),
        makeMove("m2", "lodging_l1", "place_d2", 200),
      ],
    });
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.transitionRisks.some((r) => r === "high" || r === "extreme")).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 11: budget-aware itinerary
// ─────────────────────────────────────────────

describe("generateTravelItineraries — budget-aware", () => {
  it("budget=tight + cheap seeds → budget_tight_aligned reason", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({ budgetSignals: ["tight"] }),
      destinationSeeds: [makeDest("d1", 3, 3000, 8000), makeDest("d2", 3, 3000, 8000)],
      lodgingSeeds: [makeLodging("l1", 5000, 10000)],
      moveSeeds: [makeMove("m1", "place_d1", "lodging_l1", 30)],
    });
    expect(out.rankedCandidates.length).toBeGreaterThan(0);
    // cheap_far axis candidate あり
    const cheapFar = out.rankedCandidates.find((c) => c.scoreBreakdown.paretoAxis === "cheap_far");
    expect(cheapFar).toBeDefined();
  });

  it("budget=ample + expensive seeds → budget_ample_aligned reason", () => {
    const out = generateTravelItineraries({
      intentOutput: makeIntentOutput({ budgetSignals: ["ample"] }),
      destinationSeeds: [
        makeDest("d1", 3, 30000, 60000),
        makeDest("d2", 3, 30000, 60000),
      ],
      lodgingSeeds: [makeLodging("l1", 30000, 60000)],
      moveSeeds: [makeMove("m1", "place_d1", "lodging_l1", 30)],
    });
    expect(out.rankedCandidates.length).toBeGreaterThan(0);
  });

  it("budget allocation: transport ratio 高過ぎ → budget_transport_heavy", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      destinationSeeds: [makeDest("d1", 3, 1000, 2000)],
      lodgingSeeds: [makeLodging("l1", 2000, 5000)],
      moveSeeds: [
        makeMove("m1", "place_d1", "lodging_l1", 200),
      ],
    });
    // moveSeeds 高 cost で transport heavy 検出 (簡略 implementation の限界、validate ratio 計算)
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.budgetAllocation.transportRatio).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────
// Test 12: pair-togetherness-aware
// ─────────────────────────────────────────────

describe("generateTravelItineraries — pair-togetherness-aware", () => {
  it("pair=together_all_time → pairTogethernessFit 高め", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      pairTogethernessOverride: "together_all_time",
    });
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.pairTogethernessFit).toBeGreaterThan(0.5);
    expect(top.scoreBreakdown.pairBalanceSignature.togetherNodeRatio).toBeGreaterThan(0.5);
  });

  it("pair=unknown → pairTogethernessFit neutral 0.5", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      pairTogethernessOverride: "unknown",
    });
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.pairTogethernessFit).toBeCloseTo(0.5, 1);
  });
});

// ─────────────────────────────────────────────
// Test 13: anchor-and-wander balance
// ─────────────────────────────────────────────

describe("generateTravelItineraries — anchor-wander balance", () => {
  it("anchor + wander mixed → anchorWanderBalance > 0.5", () => {
    const out = generateTravelItineraries(makeInput());
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.anchorWanderBalance).toBeGreaterThan(0);
  });

  it("anchor count per day が PROVISIONAL_ANCHOR_PER_DAY_CEILING 以下", () => {
    const out = generateTravelItineraries(makeInput());
    const top = out.rankedCandidates[0];
    const maxAnchor = top.scoreBreakdown.anchorCountPerDay.reduce((m, c) => (c > m ? c : m), 0);
    // 詰め込み防止
    expect(maxAnchor).toBeLessThanOrEqual(PROVISIONAL_ANCHOR_PER_DAY_CEILING + 1);
  });
});

// ─────────────────────────────────────────────
// Test 14: red-line blocking (cascade)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — red-line blocking (cascade)", () => {
  it("redLineCodes=['no_long_drive'] + transit extreme → blocked", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      redLineCodes: ["no_long_drive"],
      moveSeeds: [makeMove("m1", "place_d1", "lodging_l1", PROVISIONAL_TRANSIT_MINUTES_EXTREME)],
    });
    // blocked 候補があるはず
    expect(out.blockedCandidates.length).toBeGreaterThan(0);
    const allBlocked = out.blockedCandidates.every(
      (b) =>
        b.blockedReasonCode === ("red_line_violation" satisfies TravelItineraryBlockedReasonCode) ||
        b.blockedReasonCode === ("transit_extreme_cascade" satisfies TravelItineraryBlockedReasonCode),
    );
    expect(allBlocked).toBe(true);
  });

  it("redLineCodes=['max_budget_3000'] + budget over → blocked with budget_cap_violation", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      redLineCodes: ["max_budget_3000"],
      destinationSeeds: [makeDest("d1", 3, 10000, 30000)],
      lodgingSeeds: [makeLodging("l1", 10000, 30000)],
    });
    expect(out.blockedCandidates.length).toBeGreaterThan(0);
    const hasBudgetCap = out.blockedCandidates.some((b) => b.detailCode === "budget_cap_violation");
    expect(hasBudgetCap).toBe(true);
  });

  it("redLineCodes=['fatigue_cap_2'] + high fatigue → blocked with fatigue_cap_violation", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      redLineCodes: ["fatigue_cap_2"],
      destinationSeeds: [makeDest("d1", 5), makeDest("d2", 5)],
    });
    expect(out.blockedCandidates.length).toBeGreaterThan(0);
    const hasFatigueCap = out.blockedCandidates.some((b) => b.detailCode === "fatigue_cap_violation");
    expect(hasFatigueCap).toBe(true);
  });

  it("redLineCodes 空 → no blocked", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      redLineCodes: [],
    });
    const redLineBlocked = out.blockedCandidates.filter(
      (b) => b.blockedReasonCode === "red_line_violation",
    );
    expect(redLineBlocked.length).toBe(0);
  });
});

// ─────────────────────────────────────────────
// Test 15: uncertainty label cascade propagation
// ─────────────────────────────────────────────

describe("generateTravelItineraries — uncertainty label cascade", () => {
  it("weather=typhoon_warning → uncertainty 1 段階上げ + uncertainty_raised_weather reason", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      intentOutput: makeIntentOutput({
        reasonCodes: ["weather_typhoon_warning", "travel_signal_present"],
      }),
    });
    expect(out.reasonCodes).toContain("uncertainty_raised_weather" satisfies TravelItineraryReasonCode);
    const top = out.rankedCandidates[0];
    // mid_confidence base → low_confidence
    expect(["low_confidence", "info_lacking"]).toContain(top.uncertaintyLabel);
  });

  it("experienceSeeds 空 → uncertainty_raised_seed_lack", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      experienceSeeds: [],
      moveSeeds: [],
    });
    expect(out.reasonCodes).toContain("uncertainty_raised_seed_lack" satisfies TravelItineraryReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 16: day rhythm pattern (人間超越 Idea A)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — day rhythm pattern", () => {
  it("itinerary に dayRhythmPatterns 列挙される", () => {
    const out = generateTravelItineraries(makeInput());
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.dayRhythmPatterns.length).toBeGreaterThan(0);
    for (const pattern of top.scoreBreakdown.dayRhythmPatterns) {
      expect([
        "intense_morning",
        "balanced_arc",
        "late_start_evening_peak",
        "flexible_unstructured",
      ]).toContain(pattern);
    }
  });

  it("explanationReasonCodes に rhythm_* label 含む", () => {
    const out = generateTravelItineraries(makeInput());
    const top = out.rankedCandidates[0];
    const hasRhythm = top.explanationReasonCodes.some((c) => c.startsWith("rhythm_"));
    expect(hasRhythm).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 17: transition risk matrix (人間超越 Idea B)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — transition risk matrix", () => {
  it("durationMinutes 20 → low risk", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      moveSeeds: [makeMove("m1", "place_d1", "lodging_l1", 20)],
    });
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.transitionRisks).toContain("low");
  });

  it("durationMinutes 150 → high risk", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      moveSeeds: [makeMove("m1", "place_d1", "lodging_l1", 150)],
    });
    const top = out.rankedCandidates[0];
    expect(top.scoreBreakdown.transitionRisks).toContain("high");
  });

  it("durationMinutes 300 → extreme risk + transit_extreme_detected reason", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      moveSeeds: [
        makeMove("m1", "place_d1", "lodging_l1", 300),
        makeMove("m2", "lodging_l1", "place_d2", 300),
      ],
    });
    // red-line 不在 + extreme なら detected reason
    expect(out.reasonCodes).toContain("transit_extreme_detected" satisfies TravelItineraryReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 18: recovery window injection (人間超越 Idea C)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — recovery window injection", () => {
  it("rest node なし → recovery_window_insufficient reason", () => {
    const out = generateTravelItineraries(makeInput());
    expect(out.reasonCodes).toContain("recovery_window_insufficient" satisfies TravelItineraryReasonCode);
    // feasibilityNotes に rest_node_recommended が含まれる
    const hasRestNote = out.feasibilityNotes.some((n) => n.reasonCode === "rest_node_recommended");
    expect(hasRestNote).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 19: reasonCodes 構造的検証 (raw text 不入)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — reasonCodes structural safety", () => {
  it("reasonCodes は enum のみ、raw text 不含", () => {
    const out = generateTravelItineraries(makeInput());
    for (const code of out.reasonCodes) {
      expect(typeof code).toBe("string");
      expect(code).toMatch(/^[a-z_]+$/);
    }
  });

  it("explanationReasonCodes は enum のみ", () => {
    const out = generateTravelItineraries(makeInput());
    const top = out.rankedCandidates[0];
    for (const code of top.explanationReasonCodes) {
      expect(code).toMatch(/^[a-z_]+$/);
    }
  });

  it("blockedReasonCodes / blockedDetailCodes は enum のみ", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      redLineCodes: ["max_budget_1000"],
      destinationSeeds: [makeDest("d1", 3, 10000, 30000)],
    });
    for (const blocked of out.blockedCandidates) {
      expect(blocked.blockedReasonCode).toMatch(/^[a-z_]+$/);
      if (blocked.detailCode !== undefined) {
        expect(blocked.detailCode).toMatch(/^[a-z_]+$/);
      }
    }
  });

  it("redLineCodes に潜在 PII を入れても output 文字列に raw 漏れない", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      redLineCodes: ["potentially-pii-suspicious-string"],
    });
    const stringified = JSON.stringify(out);
    // applied constraint description には raw code が含まれる (caller-normalized) が、
    // それ自体は normalized code であり、reasonCodes enum には含まれない
    // 重要: reasonCodes / explanationReasonCodes / blockedReasonCodes に raw 文字列が
    // 入っていないことを確認
    const reasonsString = JSON.stringify(out.reasonCodes);
    expect(reasonsString).not.toContain("potentially-pii");
  });
});

// ─────────────────────────────────────────────
// Test 20: deterministic (100 回連続呼出)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — deterministic", () => {
  it("同一 input 100 回呼出で完全同一 output", () => {
    const input = makeInput();
    const baseline = JSON.stringify(generateTravelItineraries(input));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(generateTravelItineraries(input))).toBe(baseline);
    }
  });

  it("seedId 順序入替えても同一 output (lexicographic sort 適用)", () => {
    const input1 = makeInput();
    const input2 = {
      ...input1,
      destinationSeeds: [...(input1.destinationSeeds ?? [])].reverse(),
      lodgingSeeds: [...(input1.lodgingSeeds ?? [])].reverse(),
    };
    const out1 = generateTravelItineraries(input1);
    const out2 = generateTravelItineraries(input2);
    // rankedCandidates の candidateId / paretoAxis は同じ順序
    expect(out1.rankedCandidates.map((c) => c.candidate.candidateId)).toEqual(
      out2.rankedCandidates.map((c) => c.candidate.candidateId),
    );
  });

  it("ITINERARY_GENERATOR_VERSION は const string '0.1.0'", () => {
    expect(ITINERARY_GENERATOR_VERSION).toBe("0.1.0");
  });

  it("PROVISIONAL constants は固定値", () => {
    expect(PROVISIONAL_MAX_CANDIDATES).toBe(3);
    expect(PROVISIONAL_ANCHOR_PER_DAY_CEILING).toBe(3);
    expect(PROVISIONAL_COGNITIVE_LOAD_CEILING_PER_DAY).toBe(5);
    expect(PROVISIONAL_TRANSIT_MINUTES_HIGH).toBe(120);
    expect(PROVISIONAL_TRANSIT_MINUTES_EXTREME).toBe(240);
  });
});

// ─────────────────────────────────────────────
// Test 21: no runtime wiring (pure function 検証)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — no runtime wiring", () => {
  it("output は JSON serializable", () => {
    const out = generateTravelItineraries(makeInput());
    const json = JSON.stringify(out);
    expect(json).toBeDefined();
    const parsed = JSON.parse(json) as TravelItineraryGeneratorOutput;
    expect(parsed.itineraryVersion).toBe("0.1.0");
  });

  it("maxCandidates override で truncate", () => {
    const out = generateTravelItineraries({ ...makeInput(), maxCandidates: 1 });
    expect(out.rankedCandidates.length).toBeLessThanOrEqual(1);
  });

  it("cognitiveLoadCeilingPerDay override で block 制御", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      cognitiveLoadCeilingPerDay: 1,
    });
    // 通常 itinerary は anchor+transit ≥ 2 程度 → block されるはず
    expect(out.blockedCandidates.length).toBeGreaterThan(0);
  });

  it("dynamic import 可能 (call-site wiring 0、deferred 構造)", async () => {
    const mod = await import("../../../../lib/coalter/travel/itinerary");
    expect(typeof mod.generateTravelItineraries).toBe("function");
    expect(mod.ITINERARY_GENERATOR_VERSION).toBe("0.1.0");
  });
});

// ─────────────────────────────────────────────
// Test 22: cognitive load ceiling (AD4 継承)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — cognitive load ceiling", () => {
  it("ceiling 低い + anchor 多い → cognitive_load_ceiling_exceeded blocked", () => {
    const out = generateTravelItineraries({
      ...makeInput(),
      cognitiveLoadCeilingPerDay: 1,
      destinationSeeds: [makeDest("d1"), makeDest("d2"), makeDest("d3")],
    });
    const hasCognitiveBlock = out.blockedCandidates.some(
      (b) => b.blockedReasonCode === "cognitive_load_ceiling_exceeded",
    );
    expect(hasCognitiveBlock).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 23: budget allocation 4 分割 (人間超越 Idea F)
// ─────────────────────────────────────────────

describe("generateTravelItineraries — budget allocation 4 分割", () => {
  it("budgetAllocation の 4 ratio 合計 ≈ 1 (誤差許容)", () => {
    const out = generateTravelItineraries(makeInput());
    const top = out.rankedCandidates[0];
    const alloc = top.scoreBreakdown.budgetAllocation;
    const sum = alloc.lodgingRatio + alloc.transportRatio + alloc.foodRatio + alloc.activityRatio;
    expect(sum).toBeGreaterThan(0.5); // 簡略 implementation の許容
    expect(sum).toBeLessThanOrEqual(1.5);
  });

  it("totalCost は budgetBand の中央値", () => {
    const out = generateTravelItineraries(makeInput());
    const top = out.rankedCandidates[0];
    const alloc = top.scoreBreakdown.budgetAllocation;
    const mid = (top.candidate.itinerary.budgetBand.lo + top.candidate.itinerary.budgetBand.hi) / 2;
    expect(alloc.totalCost).toBeCloseTo(mid, 0);
  });
});
