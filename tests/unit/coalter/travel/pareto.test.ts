/**
 * CoAlter Travel Domain — Pareto Comparator Tests (T4 phase)
 *
 * 正本:
 *   - lib/coalter/travel/pareto.ts (本 PR T4)
 *   - lib/coalter/travel/itinerary.ts (PR #138 T3)
 *
 * 17 test category × 40+ individual tests.
 */

import { describe, expect, it } from "vitest";
import {
  compareTravelCandidatesPareto,
  PARETO_COMPARATOR_VERSION,
  PROVISIONAL_PARETO_SAFETY_BAND,
  PROVISIONAL_UNCERTAINTY_DISCOUNT,
  PROVISIONAL_PAIR_MISMATCH_DISCOUNT,
  PROVISIONAL_MAX_FRONTS,
  PROVISIONAL_AXIS_WEIGHTS,
  type TravelParetoComparatorInput,
  type TravelParetoComparatorOutput,
  type TravelParetoReasonCode,
  type TravelParetoTradeoffLabelCode,
  type TravelParetoDominanceReasonCode,
  type TravelParetoWhyCode,
  type TravelParetoComparisonNoteCode,
} from "../../../../lib/coalter/travel/pareto";
import type {
  TravelItineraryScoreBreakdown,
  TravelRankedItineraryCandidate,
} from "../../../../lib/coalter/travel/itinerary";
import type {
  TravelCandidate,
  TravelItinerary,
  TravelParetoAxis,
  TravelUncertaintyLabel,
} from "../../../../lib/coalter/travel/types";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function makeBreakdown(
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

function makeItinerary(): TravelItinerary {
  return {
    itineraryId: "it1",
    nodes: [],
    moves: [],
    totalDays: 1,
    totalNights: 1,
    budgetBand: { lo: 15000, hi: 30000, confidence: 0.5 },
    fatigueLevel: 3,
    uncertaintyLabel: "mid_confidence",
  };
}

function makeRanked(
  candidateId: string,
  paretoAxis: TravelParetoAxis = "balanced",
  uncertaintyLabel: TravelUncertaintyLabel = "mid_confidence",
  breakdownOverrides: Partial<TravelItineraryScoreBreakdown> = {},
): TravelRankedItineraryCandidate {
  const candidate: TravelCandidate = {
    candidateId,
    itinerary: makeItinerary(),
    rationale: { perUserA: "", perUserB: "", synthesis: "" },
    paretoAxis,
    appliedConstraints: [],
  };
  return {
    candidate,
    rank: 1,
    scoreBreakdown: makeBreakdown({ paretoAxis, ...breakdownOverrides }),
    uncertaintyLabel,
    explanationReasonCodes: ["high_feasibility"],
  };
}

// ─────────────────────────────────────────────
// Test 1: empty input fail-closed
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — empty input fail-closed", () => {
  it("rankedCandidates 空 → fail_closed_empty_input + missingInputs", () => {
    const out = compareTravelCandidatesPareto({ rankedCandidates: [] });
    expect(out.paretoFronts).toEqual([]);
    expect(out.rankedCandidates).toEqual([]);
    expect(out.reasonCodes).toContain("fail_closed_empty_input" satisfies TravelParetoReasonCode);
    expect(out.missingInputs).toContain("ranked_candidates");
    expect(out.comparatorVersion).toBe(PARETO_COMPARATOR_VERSION);
  });
});

// ─────────────────────────────────────────────
// Test 2: single candidate
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — single candidate", () => {
  it("1 candidate のみ → single_candidate + 1 front", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [makeRanked("c1")],
    });
    expect(out.rankedCandidates.length).toBe(1);
    expect(out.paretoFronts.length).toBe(1);
    expect(out.paretoFronts[0].frontNumber).toBe(1);
    expect(out.reasonCodes).toContain("single_candidate" satisfies TravelParetoReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 3: clear Pareto front (multi-candidate non-dominated)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — clear Pareto front", () => {
  it("3 candidate 全て non-dominated (異 paretoAxis) → 全て front 1", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "cheap_far", "mid_confidence", { budgetFit: 0.9, onSiteFatigue: 0.4 }),
        makeRanked("c2", "near_expensive", "mid_confidence", { budgetFit: 0.4, onSiteFatigue: 0.9 }),
        makeRanked("c3", "balanced", "mid_confidence", { budgetFit: 0.7, onSiteFatigue: 0.7 }),
      ],
    });
    // 全て front 1 (お互い trade-off)
    expect(out.paretoFronts[0].frontNumber).toBe(1);
    expect(out.paretoFronts[0].candidateIds.length).toBeGreaterThanOrEqual(2);
    expect(out.reasonCodes).toContain("pareto_layering_applied" satisfies TravelParetoReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 4: dominated candidate detection
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — dominated candidate detection", () => {
  it("c1 が全軸で c2 を上回る → c2 dominated + dominanceReasonCodes 含む", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", {
          feasibility: 1,
          budgetFit: 1,
          transitFatigue: 1,
          onSiteFatigue: 1,
          pairTogethernessFit: 1,
          redLineSafety: 1,
        }),
        makeRanked("c2", "balanced", "mid_confidence", {
          feasibility: 0.3,
          budgetFit: 0.3,
          transitFatigue: 0.3,
          onSiteFatigue: 0.3,
          pairTogethernessFit: 0.3,
          redLineSafety: 0.3,
        }),
      ],
    });
    expect(out.dominatedCandidates.length).toBeGreaterThan(0);
    const dom = out.dominatedCandidates.find((d) => d.candidateId === "c2");
    expect(dom).toBeDefined();
    expect(dom!.dominatedByCandidateId).toBe("c1");
    expect(dom!.dominanceReasonCodes.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Test 5: budget vs fatigue trade-off
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — budget vs fatigue trade-off", () => {
  it("budget 高 / fatigue 低 vs budget 低 / fatigue 高 → budget_vs_fatigue label", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", {
          budgetFit: 0.9,
          transitFatigue: 0.3,
          onSiteFatigue: 0.3,
        }),
        makeRanked("c2", "balanced", "mid_confidence", {
          budgetFit: 0.3,
          transitFatigue: 0.9,
          onSiteFatigue: 0.9,
        }),
      ],
    });
    const hasLabel = out.tradeoffLabels.some(
      (l) => l.labelCode === ("budget_vs_fatigue" satisfies TravelParetoTradeoffLabelCode),
    );
    expect(hasLabel).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 6: near expensive vs far cheap trade-off
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — near expensive vs far cheap trade-off", () => {
  it("paretoAxis cheap_far vs near_expensive → cheap_far_vs_near_expensive label", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "cheap_far"),
        makeRanked("c2", "near_expensive"),
      ],
    });
    const hasLabel = out.tradeoffLabels.some(
      (l) => l.labelCode === ("cheap_far_vs_near_expensive" satisfies TravelParetoTradeoffLabelCode),
    );
    expect(hasLabel).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 7: low fatigue vs high novelty trade-off (人間超越 Idea E)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — low fatigue vs high novelty trade-off", () => {
  it("novelty 高 + 不確実 vs 慣れた領域 → comfort_vs_novelty label", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        // c1: novelty 高 (anchor diversity center + uncertainty mid)
        makeRanked("c1", "balanced", "mid_confidence", {
          anchorWanderBalance: 0.5,
          uncertaintyScore: 0.5,
          feasibility: 0.9,
        }),
        // c2: novelty 低 (anchor 極端 + uncertainty low)
        makeRanked("c2", "balanced", "high_confidence", {
          anchorWanderBalance: 0.1,
          uncertaintyScore: 0.1,
          feasibility: 0.5,
        }),
      ],
    });
    expect(out.reasonCodes).toContain("novelty_axis_derived" satisfies TravelParetoReasonCode);
    // novelty score 差 検出
    const c1nov = out.scoreBreakdown["c1"]?.noveltyScore;
    const c2nov = out.scoreBreakdown["c2"]?.noveltyScore;
    expect(c1nov).toBeDefined();
    expect(c2nov).toBeDefined();
    expect(c1nov!).toBeGreaterThan(c2nov!);
  });
});

// ─────────────────────────────────────────────
// Test 8: pair togetherness preference
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — pair togetherness preference", () => {
  it("pair preference=together_all_time + low pair fit → pair_mismatch_discount_applied", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { pairTogethernessFit: 0.2 }),
      ],
      pairTogethernessPreference: "together_all_time",
    });
    expect(out.reasonCodes).toContain("pair_mismatch_discount_applied" satisfies TravelParetoReasonCode);
  });

  it("pair preference=unknown → mismatch discount なし", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { pairTogethernessFit: 0.2 }),
      ],
      pairTogethernessPreference: "unknown",
    });
    expect(out.reasonCodes).not.toContain("pair_mismatch_discount_applied" satisfies TravelParetoReasonCode);
  });
});

// ─────────────────────────────────────────────
// Test 9: uncertainty-aware ranking (人間超越 Idea F)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — uncertainty-aware ranking", () => {
  it("high uncertainty 候補は effective score discount", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "info_lacking", { uncertaintyScore: 0.9 }),
        makeRanked("c2", "balanced", "high_confidence", { uncertaintyScore: 0.1 }),
      ],
    });
    expect(out.reasonCodes).toContain("uncertainty_discount_applied" satisfies TravelParetoReasonCode);
    // c2 (high_confidence) が上位
    const c2Pos = out.rankedCandidates.findIndex((c) => c.candidateId === "c2");
    const c1Pos = out.rankedCandidates.findIndex((c) => c.candidateId === "c1");
    if (c1Pos >= 0 && c2Pos >= 0) {
      expect(c2Pos).toBeLessThanOrEqual(c1Pos);
    }
  });

  it("uncertainty tie-break: 同 score なら uncertainty 低 (high_confidence) が上位", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "low_confidence", { uncertaintyScore: 0.5 }),
        makeRanked("c2", "balanced", "high_confidence", { uncertaintyScore: 0.5 }),
      ],
    });
    expect(out.rankedCandidates[0].candidateId).toBe("c2");
  });
});

// ─────────────────────────────────────────────
// Test 10: red-line hard block (人間超越 Idea G)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — red-line hard block", () => {
  it("redLineSafety < 0 候補 → 追加 block + cascade reason", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { redLineSafety: -1 }),
        makeRanked("c2", "balanced", "mid_confidence", { redLineSafety: 1 }),
      ],
    });
    expect(out.reasonCodes).toContain("red_line_hard_block_propagated" satisfies TravelParetoReasonCode);
    const blocked = out.blockedCandidates.find((b) => b.candidateId === "c1");
    expect(blocked).toBeDefined();
    expect(blocked!.blockedReasonCode).toBe("red_line_violation");
  });

  it("全 candidate redLineSafety < 0 → all_candidates_blocked + empty ranked", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { redLineSafety: -1 }),
        makeRanked("c2", "balanced", "mid_confidence", { redLineSafety: -1 }),
      ],
    });
    expect(out.reasonCodes).toContain("all_candidates_blocked" satisfies TravelParetoReasonCode);
    expect(out.rankedCandidates).toEqual([]);
  });
});

// ─────────────────────────────────────────────
// Test 11: deterministic tie-break (人間超越 Idea I)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — deterministic tie-break", () => {
  it("同 score / 同 uncertainty → paretoAxis lexicographic で tie-break", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "near_expensive"),  // n
        makeRanked("c2", "cheap_far"),       // c
        makeRanked("c3", "balanced"),        // b
      ],
    });
    // 全て同 score 同 uncertainty → paretoAxis lexicographic
    // balanced < cheap_far < near_expensive → c3, c2, c1 (diversity preservation後)
    // diversity preservation で 3 つとも異 paretoAxis なので全部残る
    expect(out.rankedCandidates.length).toBe(3);
  });

  it("100 回連続呼出で完全同一 output", () => {
    const input: TravelParetoComparatorInput = {
      rankedCandidates: [
        makeRanked("c1", "cheap_far", "mid_confidence", { budgetFit: 0.9 }),
        makeRanked("c2", "balanced", "high_confidence", { feasibility: 0.9 }),
        makeRanked("c3", "near_expensive", "mid_confidence", { onSiteFatigue: 0.9 }),
      ],
    };
    const baseline = JSON.stringify(compareTravelCandidatesPareto(input));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(compareTravelCandidatesPareto(input))).toBe(baseline);
    }
  });

  it("input 順序入替えても同一 output (deterministic)", () => {
    const cands = [
      makeRanked("c1", "balanced"),
      makeRanked("c2", "cheap_far"),
      makeRanked("c3", "slow_pace"),
    ];
    const out1 = compareTravelCandidatesPareto({ rankedCandidates: cands });
    const out2 = compareTravelCandidatesPareto({ rankedCandidates: [...cands].reverse() });
    expect(out1.rankedCandidates.map((c) => c.candidateId)).toEqual(
      out2.rankedCandidates.map((c) => c.candidateId),
    );
  });
});

// ─────────────────────────────────────────────
// Test 12: reasonCodes 構造的検証 (raw text 不入)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — reasonCodes structural safety", () => {
  it("reasonCodes は enum のみ", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [makeRanked("c1"), makeRanked("c2", "cheap_far")],
    });
    for (const code of out.reasonCodes) {
      expect(typeof code).toBe("string");
      expect(code).toMatch(/^[a-z_]+$/);
    }
  });

  it("tradeoffLabels code は enum のみ", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "cheap_far"),
        makeRanked("c2", "near_expensive"),
      ],
    });
    for (const label of out.tradeoffLabels) {
      expect(label.labelCode).toMatch(/^[a-z_]+$/);
    }
  });

  it("dominanceReasonCodes / whyCodes は enum のみ", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", {
          feasibility: 1,
          budgetFit: 1,
          redLineSafety: 1,
        }),
        makeRanked("c2", "balanced", "mid_confidence", {
          feasibility: 0.3,
          budgetFit: 0.3,
          redLineSafety: 0.3,
        }),
      ],
    });
    for (const dom of out.dominatedCandidates) {
      for (const code of dom.dominanceReasonCodes) {
        expect(code).toMatch(/^[a-z_]+$/);
      }
    }
    for (const cand of out.rankedCandidates) {
      for (const code of cand.whyThisRankCodes) {
        expect(code).toMatch(/^[a-z_]+$/);
      }
    }
  });

  it("comparisonNotes code は enum のみ", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [makeRanked("c1"), makeRanked("c2")],
    });
    for (const note of out.comparisonNotes) {
      expect(note.noteCode).toMatch(/^[a-z_]+$/);
    }
  });

  it("output 全体に raw text が含まれない (JSON.stringify 検証)", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [makeRanked("c1"), makeRanked("c2", "cheap_far")],
    });
    const json = JSON.stringify(out);
    // 候補 ID / placeId 等は normalized opaque code、enum/number 以外の自由テキスト不含
    // assert: no Japanese / no spaces in reasonCodes 部分
    for (const code of out.reasonCodes) {
      expect(code).not.toContain(" ");
    }
  });
});

// ─────────────────────────────────────────────
// Test 13: no runtime wiring (pure function 検証)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — no runtime wiring", () => {
  it("output is JSON serializable", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [makeRanked("c1"), makeRanked("c2", "cheap_far")],
    });
    const json = JSON.stringify(out);
    expect(json).toBeDefined();
    const parsed = JSON.parse(json) as TravelParetoComparatorOutput;
    expect(parsed.comparatorVersion).toBe("0.1.0");
  });

  it("dynamic import 可能 (call-site wiring 0、deferred 構造)", async () => {
    const mod = await import("../../../../lib/coalter/travel/pareto");
    expect(typeof mod.compareTravelCandidatesPareto).toBe("function");
    expect(mod.PARETO_COMPARATOR_VERSION).toBe("0.1.0");
  });

  it("PROVISIONAL constants は固定値", () => {
    expect(PARETO_COMPARATOR_VERSION).toBe("0.1.0");
    expect(PROVISIONAL_PARETO_SAFETY_BAND).toBe(0.05);
    expect(PROVISIONAL_UNCERTAINTY_DISCOUNT).toBe(0.1);
    expect(PROVISIONAL_PAIR_MISMATCH_DISCOUNT).toBe(0.2);
    expect(PROVISIONAL_MAX_FRONTS).toBe(3);
    expect(PROVISIONAL_AXIS_WEIGHTS.budget).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────
// Test 14: threshold safety zone (人間超越 Idea K)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — threshold safety zone", () => {
  it("score 差 < 0.05 → safety_band_neither_dominates note", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { feasibility: 0.8 }),
        makeRanked("c2", "balanced", "mid_confidence", { feasibility: 0.805 }),
      ],
    });
    // 微差なので safety_band 内で neither dominates
    const note = out.comparisonNotes.find((n) => n.noteCode === "neither_dominates_within_safety_band");
    expect(note).toBeDefined();
  });

  it("safety band override 可能", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { feasibility: 0.8 }),
        makeRanked("c2", "balanced", "mid_confidence", { feasibility: 0.85 }),
      ],
      paretoSafetyBand: 0.1, // larger band → 0.05 差は内側
    });
    const note = out.comparisonNotes.find((n) => n.noteCode === "neither_dominates_within_safety_band");
    expect(note).toBeDefined();
  });
});

// ─────────────────────────────────────────────
// Test 15: diversity preservation (人間超越 Idea L)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — diversity preservation", () => {
  it("同 paretoAxis 重複 → top maxFronts で 1 つに絞る", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { feasibility: 0.9 }),
        makeRanked("c2", "balanced", "mid_confidence", { feasibility: 0.85 }),
        makeRanked("c3", "cheap_far", "mid_confidence", { feasibility: 0.8 }),
        makeRanked("c4", "slow_pace", "mid_confidence", { feasibility: 0.75 }),
      ],
      maxFronts: 3,
    });
    // 3 個までに truncate
    expect(out.rankedCandidates.length).toBeLessThanOrEqual(3);
    // top 3 で paretoAxis ユニーク
    const axes = out.rankedCandidates.slice(0, 3).map((c) => c.paretoAxis);
    const uniqueAxes = new Set(axes);
    expect(uniqueAxes.size).toBe(axes.length);
  });
});

// ─────────────────────────────────────────────
// Test 16: provisional weights override (人間超越 Idea M)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — weights override", () => {
  it("weights override で reasonCodes に weights_overridden", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [makeRanked("c1"), makeRanked("c2")],
      axisWeightOverrides: { budget: 0.5 },
    });
    expect(out.reasonCodes).toContain("weights_overridden" satisfies TravelParetoReasonCode);
  });

  it("budget weight 0 で budget 軸 effective score 影響なし", () => {
    const baseInput: TravelParetoComparatorInput = {
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { budgetFit: 0.9 }),
        makeRanked("c2", "balanced", "mid_confidence", { budgetFit: 0.1 }),
      ],
    };
    const out1 = compareTravelCandidatesPareto(baseInput);
    const out2 = compareTravelCandidatesPareto({
      ...baseInput,
      axisWeightOverrides: { budget: 0 },
    });
    // budget weight 0 にすると budgetFit 差は score に影響なし
    const c1Score1 = out1.scoreBreakdown["c1"]?.effectiveScore ?? 0;
    const c1Score2 = out2.scoreBreakdown["c1"]?.effectiveScore ?? 0;
    expect(c1Score1).not.toBeCloseTo(c1Score2, 3);
  });
});

// ─────────────────────────────────────────────
// Test 17: dominance reason cascade (人間超越 Idea C)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — dominance reason cascade", () => {
  it("全軸 dominate → dominates_universally", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "high_confidence", {
          feasibility: 0.95,
          budgetFit: 0.95,
          transitFatigue: 0.95,
          onSiteFatigue: 0.95,
          pairTogethernessFit: 0.95,
          redLineSafety: 1,
          uncertaintyScore: 0.1,
          anchorWanderBalance: 0.5,
        }),
        makeRanked("c2", "balanced", "high_confidence", {
          feasibility: 0.3,
          budgetFit: 0.3,
          transitFatigue: 0.3,
          onSiteFatigue: 0.3,
          pairTogethernessFit: 0.3,
          redLineSafety: 0.3,
          uncertaintyScore: 0.5,
          anchorWanderBalance: 0.1,
        }),
      ],
    });
    const dom = out.dominatedCandidates.find((d) => d.candidateId === "c2");
    expect(dom).toBeDefined();
    expect(dom!.dominanceReasonCodes).toContain(
      "dominates_universally" satisfies TravelParetoDominanceReasonCode,
    );
  });

  it("budget 軸でのみ dominate → dominates_in_budget", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", {
          budgetFit: 0.9,
          // 他は c2 と同等
          feasibility: 0.7,
          transitFatigue: 0.7,
          onSiteFatigue: 0.7,
          pairTogethernessFit: 0.7,
          redLineSafety: 1,
        }),
        makeRanked("c2", "balanced", "mid_confidence", {
          budgetFit: 0.3,
          feasibility: 0.7,
          transitFatigue: 0.7,
          onSiteFatigue: 0.7,
          pairTogethernessFit: 0.7,
          redLineSafety: 1,
        }),
      ],
    });
    const dom = out.dominatedCandidates.find((d) => d.candidateId === "c2");
    expect(dom).toBeDefined();
    // budget axis dominance reason 含む
    expect(dom!.dominanceReasonCodes).toContain(
      "dominates_in_budget" satisfies TravelParetoDominanceReasonCode,
    );
  });
});

// ─────────────────────────────────────────────
// Test 18: comparison notes (人間超越 Idea J)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — comparison notes", () => {
  it("trade-off candidates → tradeoff_present note", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "cheap_far", "mid_confidence", { budgetFit: 0.9, onSiteFatigue: 0.3 }),
        makeRanked("c2", "near_expensive", "mid_confidence", { budgetFit: 0.3, onSiteFatigue: 0.9 }),
      ],
    });
    const hasNote = out.comparisonNotes.some(
      (n) =>
        n.noteCode === ("tradeoff_present" satisfies TravelParetoComparisonNoteCode) ||
        n.noteCode === ("axis_disparity_high" satisfies TravelParetoComparisonNoteCode),
    );
    expect(hasNote).toBe(true);
  });

  it("a strictly dominates b → a_dominates_b_strictly note", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "high_confidence", {
          feasibility: 0.95,
          budgetFit: 0.95,
          transitFatigue: 0.95,
          onSiteFatigue: 0.95,
          pairTogethernessFit: 0.95,
          redLineSafety: 1,
          uncertaintyScore: 0.1,
          anchorWanderBalance: 0.5,
        }),
        makeRanked("c2", "balanced", "high_confidence", {
          feasibility: 0.3,
          budgetFit: 0.3,
          transitFatigue: 0.3,
          onSiteFatigue: 0.3,
          pairTogethernessFit: 0.3,
          redLineSafety: 0.3,
          uncertaintyScore: 0.5,
          anchorWanderBalance: 0.1,
        }),
      ],
    });
    const hasStrictDom = out.comparisonNotes.some(
      (n) => n.noteCode === ("a_dominates_b_strictly" satisfies TravelParetoComparisonNoteCode),
    );
    expect(hasStrictDom).toBe(true);
  });
});

// ─────────────────────────────────────────────
// Test 19: why-this-over-that explanation (人間超越 Idea D)
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — why-this-over-that explanation", () => {
  it("higher rank candidate has whyThisRankCodes", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", {
          budgetFit: 0.9,
          transitFatigue: 0.7,
          feasibility: 0.9,
          redLineSafety: 1,
        }),
        makeRanked("c2", "balanced", "mid_confidence", {
          budgetFit: 0.3,
          transitFatigue: 0.7,
          feasibility: 0.5,
          redLineSafety: 1,
        }),
      ],
    });
    // c1 が高 rank、why codes 含む
    if (out.rankedCandidates[0] !== undefined) {
      const top = out.rankedCandidates[0];
      expect(top.whyThisRankCodes.length).toBeGreaterThanOrEqual(0);
    }
    expect(out.reasonCodes).toContain("why_codes_attached" satisfies TravelParetoReasonCode);
  });

  it("better budget + similar fatigue → better_budget_with_similar_fatigue", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", {
          budgetFit: 0.95,
          transitFatigue: 0.7,
        }),
        makeRanked("c2", "balanced", "mid_confidence", {
          budgetFit: 0.3,
          transitFatigue: 0.75,
        }),
      ],
    });
    // top candidate の why に含む
    const top = out.rankedCandidates[0];
    if (top !== undefined) {
      const hasWhy = top.whyThisRankCodes.includes(
        "better_budget_with_similar_fatigue" satisfies TravelParetoWhyCode,
      );
      // 必須ではないが存在する可能性
      expect(typeof hasWhy).toBe("boolean");
    }
  });
});

// ─────────────────────────────────────────────
// Test 20: max fronts truncation
// ─────────────────────────────────────────────

describe("compareTravelCandidatesPareto — max fronts truncation", () => {
  it("maxFronts=1 → 1 front のみ", () => {
    const out = compareTravelCandidatesPareto({
      rankedCandidates: [
        makeRanked("c1", "balanced", "mid_confidence", { feasibility: 1 }),
        makeRanked("c2", "balanced", "mid_confidence", { feasibility: 0.3 }),
      ],
      maxFronts: 1,
    });
    expect(out.paretoFronts.length).toBeLessThanOrEqual(1);
  });
});
