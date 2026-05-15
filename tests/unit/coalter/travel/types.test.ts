/**
 * Travel T1 — Pure types compile-level test
 *
 * 検証項目 (CEO Batch-C 制約: type-only test):
 *   - 全 type import 可能
 *   - 各 interface を satisfy する object literal を作成可能 (compile time check)
 *   - 各 type union member が正しい
 *   - MVP scope 型レベル enforcement (totalDays: 1 | 2、totalNights: 0 | 1 | 2)
 *   - runtime function 含まない (pure types only)
 */

import { describe, expect, it } from "vitest";

import type {
  TravelActivityType,
  TravelAnchorLevel,
  TravelBudgetBand,
  TravelCandidate,
  TravelCandidateRationale,
  TravelConstraint,
  TravelConstraintField,
  TravelConstraintSeverity,
  TravelFatigueLevel,
  TravelItinerary,
  TravelMove,
  TravelNode,
  TravelNodeType,
  TravelParetoAxis,
  TravelTimeSlot,
  TravelTransport,
  TravelUncertaintyLabel,
} from "@/lib/coalter/travel/types";

describe("travel types — type import", () => {
  it("全 type が import 可能", () => {
    // 本 test は compile time check のみ、runtime assertion は trivial
    expect(true).toBe(true);
  });
});

describe("travel types — TravelBudgetBand", () => {
  it("valid object literal を満たす", () => {
    const band: TravelBudgetBand = { lo: 10000, hi: 30000, confidence: 0.7 };
    expect(band.lo).toBe(10000);
    expect(band.hi).toBe(30000);
    expect(band.confidence).toBeCloseTo(0.7, 10);
  });
});

describe("travel types — TravelFatigueLevel", () => {
  it("1-5 numeric literal union のみ受領", () => {
    const fatigue1: TravelFatigueLevel = 1;
    const fatigue3: TravelFatigueLevel = 3;
    const fatigue5: TravelFatigueLevel = 5;
    expect(fatigue1).toBe(1);
    expect(fatigue3).toBe(3);
    expect(fatigue5).toBe(5);
  });
});

describe("travel types — TravelTimeSlot", () => {
  it("5 値 string literal union", () => {
    const slots: TravelTimeSlot[] = ["morning", "noon", "afternoon", "evening", "night"];
    expect(slots).toHaveLength(5);
  });
});

describe("travel types — TravelActivityType", () => {
  it("6 値 string literal union", () => {
    const types: TravelActivityType[] = [
      "sightseeing",
      "meal",
      "lodging",
      "transport",
      "experience",
      "rest",
    ];
    expect(types).toHaveLength(6);
  });
});

describe("travel types — TravelNodeType", () => {
  it("6 値 string literal union (start / lodging / destination / activity / meal / return)", () => {
    const types: TravelNodeType[] = ["start", "lodging", "destination", "activity", "meal", "return"];
    expect(types).toHaveLength(6);
  });
});

describe("travel types — TravelTransport", () => {
  it("5 値 国内 MVP scope (train / bus / car / domestic_flight / walk)", () => {
    const transports: TravelTransport[] = ["train", "bus", "car", "domestic_flight", "walk"];
    expect(transports).toHaveLength(5);
  });
});

describe("travel types — TravelUncertaintyLabel", () => {
  it("4 段階 (high / mid / low / info_lacking)", () => {
    const labels: TravelUncertaintyLabel[] = [
      "high_confidence",
      "mid_confidence",
      "low_confidence",
      "info_lacking",
    ];
    expect(labels).toHaveLength(4);
  });
});

describe("travel types — TravelParetoAxis", () => {
  it("5 値 Pareto 最適 axis", () => {
    const axes: TravelParetoAxis[] = [
      "cheap_far",
      "near_expensive",
      "balanced",
      "slow_pace",
      "intense_pace",
    ];
    expect(axes).toHaveLength(5);
  });
});

describe("travel types — TravelAnchorLevel", () => {
  it("anchor / wander の 2 値", () => {
    const levels: TravelAnchorLevel[] = ["anchor", "wander"];
    expect(levels).toHaveLength(2);
  });
});

describe("travel types — TravelConstraint", () => {
  it("constraint object を満たす", () => {
    const constraint: TravelConstraint = {
      field: "budget",
      severity: "red_line",
      description: "budget upper limit 50000 JPY",
    };
    expect(constraint.field).toBe("budget");
    expect(constraint.severity).toBe("red_line");
  });

  it("field 7 値", () => {
    const fields: TravelConstraintField[] = [
      "budget",
      "time_window",
      "distance",
      "fatigue",
      "weather",
      "pair_preference",
      "red_line_explicit",
    ];
    expect(fields).toHaveLength(7);
  });

  it("severity 4 段階", () => {
    const severities: TravelConstraintSeverity[] = ["red_line", "hard", "soft", "preference"];
    expect(severities).toHaveLength(4);
  });
});

describe("travel types — TravelNode", () => {
  it("node object を満たす", () => {
    const node: TravelNode = {
      nodeId: "node-1",
      type: "destination",
      placeId: "place-onsen-001",
      startTime: "afternoon",
      endTime: "evening",
      activityType: "sightseeing",
      fatigueLoad: 3,
      anchorLevel: "anchor",
    };
    expect(node.nodeId).toBe("node-1");
    expect(node.type).toBe("destination");
  });
});

describe("travel types — TravelMove", () => {
  it("move object (edge) を満たす", () => {
    const move: TravelMove = {
      moveId: "move-1",
      fromNodeId: "node-1",
      toNodeId: "node-2",
      transport: "train",
      durationMinutes: 90,
      costEstimate: { lo: 3000, hi: 5000, confidence: 0.8 },
    };
    expect(move.moveId).toBe("move-1");
    expect(move.transport).toBe("train");
    expect(move.durationMinutes).toBe(90);
  });
});

describe("travel types — TravelItinerary (MVP scope enforcement)", () => {
  it("totalDays: 1 | 2 のみ受領 (型レベル constraint)", () => {
    const day1: TravelItinerary = {
      itineraryId: "i-1",
      nodes: [],
      moves: [],
      totalDays: 1,
      totalNights: 0,
      budgetBand: { lo: 0, hi: 10000, confidence: 0.5 },
      fatigueLevel: 2,
      uncertaintyLabel: "mid_confidence",
    };
    const day2: TravelItinerary = {
      itineraryId: "i-2",
      nodes: [],
      moves: [],
      totalDays: 2,
      totalNights: 2,
      budgetBand: { lo: 10000, hi: 50000, confidence: 0.7 },
      fatigueLevel: 3,
      uncertaintyLabel: "high_confidence",
    };
    expect(day1.totalDays).toBe(1);
    expect(day2.totalDays).toBe(2);
  });

  it("totalNights: 0 | 1 | 2 のみ受領 (型レベル constraint)", () => {
    const nights0: TravelItinerary["totalNights"] = 0;
    const nights1: TravelItinerary["totalNights"] = 1;
    const nights2: TravelItinerary["totalNights"] = 2;
    expect(nights0).toBe(0);
    expect(nights1).toBe(1);
    expect(nights2).toBe(2);
  });
});

describe("travel types — TravelCandidateRationale", () => {
  it("rationale object を満たす", () => {
    const rationale: TravelCandidateRationale = {
      perUserA: "outdoor enthusiast preference, hot spring affinity",
      perUserB: "historical site interest, low fatigue today",
      synthesis: "城下町 (history + hot spring intersection)",
    };
    expect(rationale.perUserA).toContain("outdoor");
    expect(rationale.perUserB).toContain("historical");
  });
});

describe("travel types — TravelCandidate", () => {
  it("candidate object を満たす", () => {
    const candidate: TravelCandidate = {
      candidateId: "c-1",
      itinerary: {
        itineraryId: "i-1",
        nodes: [],
        moves: [],
        totalDays: 1,
        totalNights: 1,
        budgetBand: { lo: 15000, hi: 25000, confidence: 0.7 },
        fatigueLevel: 2,
        uncertaintyLabel: "mid_confidence",
      },
      rationale: {
        perUserA: "test rationale A",
        perUserB: "test rationale B",
        synthesis: "test synthesis",
      },
      paretoAxis: "balanced",
      appliedConstraints: [
        {
          field: "budget",
          severity: "hard",
          description: "budget upper limit",
        },
      ],
    };
    expect(candidate.candidateId).toBe("c-1");
    expect(candidate.paretoAxis).toBe("balanced");
    expect(candidate.appliedConstraints).toHaveLength(1);
  });
});

describe("travel types — no runtime value exports", () => {
  it("本 file は pure types only、runtime function / constants を export しない", async () => {
    // 動的 import で module 取得、type 以外の export 0 を assert
    const mod = await import("@/lib/coalter/travel/types");
    // const / function exports は 0 (純 type module)
    const exportedKeys = Object.keys(mod);
    expect(exportedKeys).toHaveLength(0);
  });
});
