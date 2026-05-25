/**
 * Phase 3-M M-1 (pure) — feasibilityTypes + feasibilityIntegrityContract tests
 *
 * 設計書: docs/alter-plan-phase3-m-readiness-audit.md §4
 *
 * 検証範囲:
 *   §1. type 露出 (= compile-time + literal 確認)
 *   §2. FEASIBILITY_INTEGRITY_CONTRACT: 9 invariants 全 literal true
 *   §3. assertFeasibilityCompliance: 各 invariant の violation 検出
 *   §4. assertDayFeasibilityResultCompliance: top-level 検証
 *   §5. exhaustiveSlackStatus: runtime error
 *   §6. PII grep: forbidden keys 不在
 *
 * 不変原則:
 *   - LLM 不使用
 *   - pure (= no side effects)
 *   - no DB / API / network / localStorage / env access
 *   - no UI import
 */

import { describe, expect, it } from "vitest";

import {
  FEASIBILITY_INTEGRITY_CONTRACT,
  FeasibilityIntegrityError,
  assertDayFeasibilityResultCompliance,
  assertFeasibilityCompliance,
  type FeasibilityIntegrityContract,
} from "@/lib/plan/feasibility/feasibilityIntegrityContract";
import {
  exhaustiveSlackStatus,
  type DayFeasibilityResult,
  type FeasibilitySlackView,
  type SlackStatus,
} from "@/lib/plan/feasibility/feasibilityTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeSufficient(
  overrides: Partial<FeasibilitySlackView> = {},
): FeasibilitySlackView {
  return {
    transitionIndex: 0,
    status: "sufficient",
    slackMin: 30,
    ...overrides,
  };
}

function makeInsufficient(
  overrides: Partial<FeasibilitySlackView> = {},
): FeasibilitySlackView {
  return {
    transitionIndex: 0,
    status: "insufficient",
    shortfallMin: 10,
    ...overrides,
  };
}

function makeNotApplicable(
  overrides: Partial<FeasibilitySlackView> = {},
): FeasibilitySlackView {
  return {
    transitionIndex: 0,
    status: "not_applicable",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. Type 露出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. SlackStatus literal exports", () => {
  it("SlackStatus has exactly 3 literal values", () => {
    const statuses: SlackStatus[] = ["sufficient", "insufficient", "not_applicable"];
    expect(statuses).toHaveLength(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. FEASIBILITY_INTEGRITY_CONTRACT (= 9 invariants 全 true)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. FEASIBILITY_INTEGRITY_CONTRACT", () => {
  it("exposes exactly 9 invariants, all true", () => {
    const keys = Object.keys(FEASIBILITY_INTEGRITY_CONTRACT) as Array<
      keyof FeasibilityIntegrityContract
    >;
    expect(keys.sort()).toEqual(
      [
        "sufficientHasSlackMin",
        "insufficientHasShortfallMin",
        "notApplicableHasNoFields",
        "transitionIndexIsFinite",
        "statusIsOneOfThree",
        "noPiiInFeasibilityView",
        "transitionKeyFormatIsOrdinal",
        "countsSumEqualsSize",
        "noPiiInResultTopLevel",
      ].sort(),
    );
    for (const key of keys) {
      expect(FEASIBILITY_INTEGRITY_CONTRACT[key]).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. assertFeasibilityCompliance — happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3.0 happy path", () => {
  it("sufficient (slackMin=30)", () => {
    expect(() => assertFeasibilityCompliance(makeSufficient())).not.toThrow();
  });

  it("sufficient (slackMin=0)", () => {
    expect(() => assertFeasibilityCompliance(makeSufficient({ slackMin: 0 }))).not.toThrow();
  });

  it("insufficient (shortfallMin=10)", () => {
    expect(() => assertFeasibilityCompliance(makeInsufficient())).not.toThrow();
  });

  it("not_applicable (no fields)", () => {
    expect(() => assertFeasibilityCompliance(makeNotApplicable())).not.toThrow();
  });
});

describe("§3.1 statusIsOneOfThree", () => {
  it("invalid status → throw", () => {
    const bad = makeSufficient({ status: "bogus_status" as unknown as SlackStatus });
    try {
      assertFeasibilityCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FeasibilityIntegrityError);
      expect((err as FeasibilityIntegrityError).violation).toBe("statusIsOneOfThree");
    }
  });
});

describe("§3.2 transitionIndexIsFinite", () => {
  it("negative → throw", () => {
    const bad = makeSufficient({ transitionIndex: -1 });
    try {
      assertFeasibilityCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityIntegrityError).violation).toBe("transitionIndexIsFinite");
    }
  });

  it("non-integer → throw", () => {
    const bad = makeSufficient({ transitionIndex: 1.5 });
    expect(() => assertFeasibilityCompliance(bad)).toThrow(FeasibilityIntegrityError);
  });

  it("NaN → throw", () => {
    const bad = makeSufficient({ transitionIndex: Number.NaN });
    expect(() => assertFeasibilityCompliance(bad)).toThrow(FeasibilityIntegrityError);
  });
});

describe("§3.3 sufficientHasSlackMin", () => {
  it("sufficient without slackMin → throw", () => {
    const bad: FeasibilitySlackView = {
      transitionIndex: 0,
      status: "sufficient",
      // slackMin 不在
    };
    try {
      assertFeasibilityCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityIntegrityError).violation).toBe("sufficientHasSlackMin");
    }
  });

  it("sufficient with negative slackMin → throw", () => {
    const bad = makeSufficient({ slackMin: -5 });
    expect(() => assertFeasibilityCompliance(bad)).toThrow(FeasibilityIntegrityError);
  });

  it("sufficient with NaN slackMin → throw", () => {
    const bad = makeSufficient({ slackMin: Number.NaN });
    expect(() => assertFeasibilityCompliance(bad)).toThrow(FeasibilityIntegrityError);
  });

  it("sufficient with shortfallMin (= 排他) → throw", () => {
    const bad = makeSufficient({ shortfallMin: 5 });
    expect(() => assertFeasibilityCompliance(bad)).toThrow(FeasibilityIntegrityError);
  });
});

describe("§3.4 insufficientHasShortfallMin", () => {
  it("insufficient without shortfallMin → throw", () => {
    const bad: FeasibilitySlackView = {
      transitionIndex: 0,
      status: "insufficient",
    };
    expect(() => assertFeasibilityCompliance(bad)).toThrow(FeasibilityIntegrityError);
  });

  it("insufficient with 0 shortfallMin → throw (= positive 要求)", () => {
    const bad = makeInsufficient({ shortfallMin: 0 });
    try {
      assertFeasibilityCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityIntegrityError).violation).toBe("insufficientHasShortfallMin");
    }
  });

  it("insufficient with slackMin (= 排他) → throw", () => {
    const bad = makeInsufficient({ slackMin: 5 });
    expect(() => assertFeasibilityCompliance(bad)).toThrow(FeasibilityIntegrityError);
  });
});

describe("§3.5 notApplicableHasNoFields", () => {
  it("not_applicable with slackMin → throw", () => {
    const bad = makeNotApplicable({ slackMin: 5 });
    try {
      assertFeasibilityCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityIntegrityError).violation).toBe("notApplicableHasNoFields");
    }
  });

  it("not_applicable with shortfallMin → throw", () => {
    const bad = makeNotApplicable({ shortfallMin: 5 });
    expect(() => assertFeasibilityCompliance(bad)).toThrow(FeasibilityIntegrityError);
  });
});

describe("§3.6 noPiiInFeasibilityView", () => {
  const forbiddenKeys = [
    "fromNodeId",
    "toNodeId",
    "fromLocationText",
    "toLocationText",
    "sensitiveProximity",
    "anchorId",
    "userId",
    "title",
    "locationText",
    "estimatedDurationMin",
    "distanceM",
    "modeCandidate",
    "source",
    "privacyClass",
  ];

  for (const forbidden of forbiddenKeys) {
    it(`view に "${forbidden}" 含有 → throw`, () => {
      const bad = {
        ...makeSufficient(),
        [forbidden]: "leak-value",
      } as unknown as FeasibilitySlackView;
      try {
        assertFeasibilityCompliance(bad);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(FeasibilityIntegrityError);
        expect((err as FeasibilityIntegrityError).violation).toBe("noPiiInFeasibilityView");
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. assertDayFeasibilityResultCompliance — top-level
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4.0 result happy path", () => {
  it("空 result PASS", () => {
    const result: DayFeasibilityResult = {
      feasibilityByTransitionKey: new Map(),
      counts: { sufficient: 0, insufficient: 0, notApplicable: 0 },
    };
    expect(() => assertDayFeasibilityResultCompliance(result)).not.toThrow();
  });

  it("正常な 3 entry result", () => {
    const map = new Map<string, FeasibilitySlackView>();
    map.set("transition_0", makeSufficient({ transitionIndex: 0 }));
    map.set("transition_1", makeInsufficient({ transitionIndex: 1 }));
    map.set("transition_2", makeNotApplicable({ transitionIndex: 2 }));
    const result: DayFeasibilityResult = {
      feasibilityByTransitionKey: map,
      counts: { sufficient: 1, insufficient: 1, notApplicable: 1 },
    };
    expect(() => assertDayFeasibilityResultCompliance(result)).not.toThrow();
  });
});

describe("§4.1 transitionKeyFormatIsOrdinal", () => {
  it("transition_0_with_extra (= L-3b 旧形式) → throw", () => {
    const map = new Map<string, FeasibilitySlackView>();
    map.set("transition_0_move_morning_move_afternoon", makeSufficient());
    const result: DayFeasibilityResult = {
      feasibilityByTransitionKey: map,
      counts: { sufficient: 1, insufficient: 0, notApplicable: 0 },
    };
    try {
      assertDayFeasibilityResultCompliance(result);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityIntegrityError).violation).toBe("transitionKeyFormatIsOrdinal");
    }
  });

  it("無関係な key → throw", () => {
    const map = new Map<string, FeasibilitySlackView>();
    map.set("bogus_key", makeSufficient());
    const result: DayFeasibilityResult = {
      feasibilityByTransitionKey: map,
      counts: { sufficient: 1, insufficient: 0, notApplicable: 0 },
    };
    expect(() => assertDayFeasibilityResultCompliance(result)).toThrow(FeasibilityIntegrityError);
  });
});

describe("§4.2 countsSumEqualsSize", () => {
  it("counts 過剰 → throw", () => {
    const map = new Map<string, FeasibilitySlackView>();
    map.set("transition_0", makeSufficient());
    const result: DayFeasibilityResult = {
      feasibilityByTransitionKey: map,
      counts: { sufficient: 999, insufficient: 0, notApplicable: 0 },
    };
    try {
      assertDayFeasibilityResultCompliance(result);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityIntegrityError).violation).toBe("countsSumEqualsSize");
    }
  });

  it("counts 過少 → throw", () => {
    const map = new Map<string, FeasibilitySlackView>();
    map.set("transition_0", makeSufficient());
    map.set("transition_1", makeInsufficient({ transitionIndex: 1 }));
    const result: DayFeasibilityResult = {
      feasibilityByTransitionKey: map,
      counts: { sufficient: 1, insufficient: 0, notApplicable: 0 },
    };
    expect(() => assertDayFeasibilityResultCompliance(result)).toThrow(FeasibilityIntegrityError);
  });
});

describe("§4.3 noPiiInResultTopLevel", () => {
  const forbiddenTopKeys = [
    "fromNodeId",
    "toNodeId",
    "fromLocationText",
    "toLocationText",
    "anchorId",
    "userId",
    "title",
    "locationText",
    "tracingId",
  ];
  for (const forbidden of forbiddenTopKeys) {
    it(`result top-level に "${forbidden}" 含有 → throw`, () => {
      const map = new Map<string, FeasibilitySlackView>();
      const badResult = {
        feasibilityByTransitionKey: map,
        counts: { sufficient: 0, insufficient: 0, notApplicable: 0 },
        [forbidden]: "leak-value",
      } as unknown as DayFeasibilityResult;
      try {
        assertDayFeasibilityResultCompliance(badResult);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(FeasibilityIntegrityError);
        expect((err as FeasibilityIntegrityError).violation).toBe("noPiiInResultTopLevel");
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. exhaustiveSlackStatus
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. exhaustiveSlackStatus", () => {
  it("throws with informative message", () => {
    expect(() => exhaustiveSlackStatus("future_state" as never)).toThrow(
      /Non-exhaustive SlackStatus/,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. FeasibilityIntegrityError shape
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. FeasibilityIntegrityError snapshot 保持", () => {
  it("view を error に保持する", () => {
    const bad = makeSufficient({ slackMin: -1 });
    try {
      assertFeasibilityCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      const e = err as FeasibilityIntegrityError;
      expect(e.name).toBe("FeasibilityIntegrityError");
      expect(e.viewSnapshot).toBe(bad);
      expect(e.message).toContain("[M-1]");
    }
  });
});
