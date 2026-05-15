/**
 * Daily Dispatch DD1 — Pure types compile-level test
 */

import { describe, expect, it } from "vitest";

import type {
  DailyChainPosition,
  DailyConstraintCarryOver,
  DailyContext,
  DailyDomain,
  DailyDomainInferRationale,
  DailyDomainRequest,
  DailyDomainRoutingReason,
  DailyFairnessHint,
  DailyPairAvailability,
  DailyTargetWindow,
  DailyTimeSlot,
} from "@/lib/coalter/daily/types";

describe("daily types — type import", () => {
  it("全 type が import 可能", () => {
    expect(true).toBe(true);
  });
});

describe("daily types — DailyDomain", () => {
  it("4 値 (food / movie / travel / activity、Axis C 部分集合)", () => {
    const domains: DailyDomain[] = ["food", "movie", "travel", "activity"];
    expect(domains).toHaveLength(4);
  });
});

describe("daily types — DailyTimeSlot", () => {
  it("6 値 (morning / noon / afternoon / evening / night / deepnight)", () => {
    const slots: DailyTimeSlot[] = [
      "morning",
      "noon",
      "afternoon",
      "evening",
      "night",
      "deepnight",
    ];
    expect(slots).toHaveLength(6);
  });
});

describe("daily types — DailyTargetWindow", () => {
  it("4 値 (today / tonight / tomorrow / this_weekend)", () => {
    const windows: DailyTargetWindow[] = ["today", "tonight", "tomorrow", "this_weekend"];
    expect(windows).toHaveLength(4);
  });
});

describe("daily types — DailyPairAvailability", () => {
  it("3 値 (both / one_only / unknown)", () => {
    const values: DailyPairAvailability[] = ["both", "one_only", "unknown"];
    expect(values).toHaveLength(3);
  });
});

describe("daily types — DailyContext", () => {
  it("context object を満たす", () => {
    const context: DailyContext = {
      timeSlot: "evening",
      targetWindow: "tonight",
      isWeekend: false,
      pairAvailability: "both",
    };
    expect(context.timeSlot).toBe("evening");
    expect(context.isWeekend).toBe(false);
  });
});

describe("daily types — DailyConstraintCarryOver", () => {
  it("budgetCeiling / timeWindow / energyBudget / redLines 全て optional", () => {
    const empty: DailyConstraintCarryOver = {};
    expect(empty).toEqual({});
  });

  it("budgetCeiling object を満たす", () => {
    const carryOver: DailyConstraintCarryOver = {
      budgetCeiling: { lo: 5000, hi: 10000, confidence: 0.8 },
    };
    expect(carryOver.budgetCeiling?.lo).toBe(5000);
  });

  it("timeWindow ISO 8601 format (raw text ではない)", () => {
    const carryOver: DailyConstraintCarryOver = {
      timeWindow: {
        startISO: "2026-05-15T17:00:00+09:00",
        endISO: "2026-05-15T21:00:00+09:00",
      },
    };
    expect(carryOver.timeWindow?.startISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("energyBudget は 1-5 numeric literal union", () => {
    const e1: DailyConstraintCarryOver = { energyBudget: 1 };
    const e3: DailyConstraintCarryOver = { energyBudget: 3 };
    const e5: DailyConstraintCarryOver = { energyBudget: 5 };
    expect(e1.energyBudget).toBe(1);
    expect(e3.energyBudget).toBe(3);
    expect(e5.energyBudget).toBe(5);
  });

  it("redLines は normalized string array (caller 責任で PII filter)", () => {
    const carryOver: DailyConstraintCarryOver = {
      redLines: ["no alcohol", "avoid long walk"],
    };
    expect(carryOver.redLines).toHaveLength(2);
  });
});

describe("daily types — DailyFairnessHint", () => {
  it("recentBias / cooldownDomains object を満たす", () => {
    const hint: DailyFairnessHint = {
      recentBias: -0.3,
      cooldownDomains: ["food"],
    };
    expect(hint.recentBias).toBeCloseTo(-0.3, 10);
    expect(hint.cooldownDomains).toContain("food");
  });

  it("空 cooldownDomains 許容", () => {
    const hint: DailyFairnessHint = {
      recentBias: 0,
      cooldownDomains: [],
    };
    expect(hint.cooldownDomains).toHaveLength(0);
  });
});

describe("daily types — DailyChainPosition", () => {
  it("単独 chain position object を満たす", () => {
    const position: DailyChainPosition = {
      index: 0,
      total: 1,
    };
    expect(position.index).toBe(0);
    expect(position.total).toBe(1);
  });

  it("multi-domain chain position with prevDomain", () => {
    const position: DailyChainPosition = {
      index: 1,
      total: 2,
      prevDomain: "food",
    };
    expect(position.prevDomain).toBe("food");
  });
});

describe("daily types — DailyDomainRoutingReason", () => {
  it("5 値 (explicit / implicit / fallback / chain / handoff)", () => {
    const reasons: DailyDomainRoutingReason[] = [
      "explicit_keyword",
      "implicit_pattern",
      "fallback_default",
      "multi_domain_chain",
      "cross_domain_handoff",
    ];
    expect(reasons).toHaveLength(5);
  });
});

describe("daily types — DailyDomainInferRationale", () => {
  it("rationale object を満たす", () => {
    const rationale: DailyDomainInferRationale = {
      confidence: 0.85,
      signals: ["keyword_food_lexeme", "timeslot_evening", "history_food_recent"],
      alternates: ["activity"],
    };
    expect(rationale.confidence).toBeCloseTo(0.85, 10);
    expect(rationale.signals).toHaveLength(3);
    expect(rationale.alternates).toContain("activity");
  });

  it("signals は raw user text を含まない code list (caller 責任)", () => {
    const rationale: DailyDomainInferRationale = {
      confidence: 0.6,
      signals: ["keyword_food_lexeme"],
      alternates: [],
    };
    // signal は lower_snake_case code のみ (regex check は test 内で行う runtime check、本 type は string)
    for (const signal of rationale.signals) {
      expect(signal).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });
});

describe("daily types — DailyDomainRequest", () => {
  it("complete request object を満たす", () => {
    const request: DailyDomainRequest = {
      domain: "food",
      context: {
        timeSlot: "evening",
        targetWindow: "tonight",
        isWeekend: false,
        pairAvailability: "both",
      },
      constraints: {
        budgetCeiling: { lo: 3000, hi: 8000, confidence: 0.7 },
        energyBudget: 2,
      },
      fairnessHints: {
        recentBias: 0.2,
        cooldownDomains: [],
      },
      routingReason: "explicit_keyword",
      inferRationale: {
        confidence: 0.85,
        signals: ["keyword_food_lexeme"],
        alternates: ["activity"],
      },
    };
    expect(request.domain).toBe("food");
    expect(request.context.timeSlot).toBe("evening");
    expect(request.routingReason).toBe("explicit_keyword");
  });

  it("chainPosition は optional、単独 dispatch では undefined", () => {
    const request: DailyDomainRequest = {
      domain: "activity",
      context: {
        timeSlot: "morning",
        targetWindow: "today",
        isWeekend: true,
        pairAvailability: "both",
      },
      constraints: {},
      fairnessHints: { recentBias: 0, cooldownDomains: [] },
      routingReason: "fallback_default",
      inferRationale: {
        confidence: 0.5,
        signals: [],
        alternates: ["food"],
      },
    };
    expect(request.chainPosition).toBeUndefined();
  });

  it("multi-domain chain request", () => {
    const request: DailyDomainRequest = {
      domain: "movie",
      context: {
        timeSlot: "night",
        targetWindow: "tonight",
        isWeekend: true,
        pairAvailability: "both",
      },
      constraints: {
        timeWindow: {
          startISO: "2026-05-15T21:00:00+09:00",
          endISO: "2026-05-15T23:00:00+09:00",
        },
      },
      fairnessHints: { recentBias: 0, cooldownDomains: [] },
      chainPosition: { index: 1, total: 2, prevDomain: "food" },
      routingReason: "multi_domain_chain",
      inferRationale: {
        confidence: 0.8,
        signals: ["keyword_movie", "chain_food_to_movie_pattern"],
        alternates: [],
      },
    };
    expect(request.chainPosition?.prevDomain).toBe("food");
    expect(request.routingReason).toBe("multi_domain_chain");
  });
});

describe("daily types — no runtime value exports", () => {
  it("本 file は pure types only、runtime function / constants を export しない", async () => {
    const mod = await import("@/lib/coalter/daily/types");
    const exportedKeys = Object.keys(mod);
    expect(exportedKeys).toHaveLength(0);
  });
});

describe("daily types — 3 軸混同回避 (compile-time check)", () => {
  it("DailyDomain は Axis C (Domain) の部分集合のみ、Axis A / Axis B 値を含まない", () => {
    // DailyDomain 4 値が ConversationTheme と一致するが、CoAlterMode / PresenceMode と
    // type 上区別される (TypeScript 型レベル constraint)
    const domain: DailyDomain = "food";
    // 以下は compile error (test では型 check のみ確認):
    //   const wrongA: DailyDomain = "decision"; // CoAlterMode、type error
    //   const wrongB: DailyDomain = "daily"; // PresenceMode、type error
    expect(domain).toBe("food");
  });
});
