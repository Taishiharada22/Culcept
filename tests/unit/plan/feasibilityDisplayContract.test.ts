/**
 * Phase 3-M M-2b — feasibilityDisplayContract tests
 *
 * 設計書: docs/alter-plan-phase3-m-2-readiness-audit.md §3 / §7.2
 *
 * 検証範囲:
 *   §1. FEASIBILITY_DISPLAY_CONTRACT 9 invariants 全 literal true
 *   §2. happy path (= M-2a 出力は全件 PASS)
 *   §3. 各 invariant の violation 検出
 *      - noPiiInDisplayText (= empty)
 *      - noPiiInViewKeys (= 16 forbidden keys)
 *      - tierIsTier2MovementAux
 *      - variantIsOneOfTwo
 *      - noNgWordingInDisplayText (= 30+ NG word)
 *      - displayTextMatchesOkPattern (= 不正形)
 *   §4. bulk result assertion
 *   §5. NG / OK pattern export 健全性
 *   §6. integration with M-2a (= 全 fixture で contract assert 通過)
 *
 * 不変原則:
 *   - LLM 不使用 / no DB / no API / no network
 */

import { describe, expect, it } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import { resolveMovementSegmentOverlay } from "@/lib/plan/transport/movementSegmentOverlay";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";
import { computeDayFeasibility } from "@/lib/plan/feasibility/dayFeasibilityComputation";
import {
  formatFeasibilityForDisplay,
  type FeasibilityDisplayResult,
  type FeasibilityDisplayView,
} from "@/lib/plan/feasibility/feasibilityDisplayFormatter";
import {
  FEASIBILITY_DISPLAY_CONTRACT,
  FeasibilityDisplayContractError,
  NG_WORDING_SUBSTRINGS_FOR_TEST,
  OK_DISPLAY_TEXT_PATTERNS_FOR_TEST,
  assertFeasibilityDisplayCompliance,
  assertFeasibilityDisplayResultCompliance,
  type FeasibilityDisplayContract,
} from "@/lib/plan/feasibility/feasibilityDisplayContract";
import type { DayFeasibilityResult } from "@/lib/plan/feasibility/feasibilityTypes";
import {
  HEAVY_DAY_ANCHORS,
  LIGHT_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
} from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-23";
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const SHIBUYA = { lat: 35.6580, lng: 139.7016 };
const TOKYO = { lat: 35.6812, lng: 139.7671 };

function defaultProviders(): TransportResolutionProvider[] {
  return [
    createManualUserProvider(),
    createHeuristicDistanceProvider(),
    createUnresolvedProvider("no_provider_available"),
  ];
}

function makeSlackView(
  overrides: Partial<FeasibilityDisplayView> = {},
): FeasibilityDisplayView {
  return {
    transitionIndex: 0,
    displayText: "余白 30 分",
    variant: "slack",
    tier: "tier_2_movement_aux",
    ...overrides,
  };
}

function makeShortfallView(
  overrides: Partial<FeasibilityDisplayView> = {},
): FeasibilityDisplayView {
  return {
    transitionIndex: 0,
    displayText: "不足 10 分",
    variant: "shortfall",
    tier: "tier_2_movement_aux",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. Contract 値
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. FEASIBILITY_DISPLAY_CONTRACT — 9 invariants 全 true", () => {
  it("exposes exactly 9 invariants, all true", () => {
    const keys = Object.keys(FEASIBILITY_DISPLAY_CONTRACT) as Array<
      keyof FeasibilityDisplayContract
    >;
    expect(keys.sort()).toEqual(
      [
        "noPiiInDisplayText",
        "noPiiInViewKeys",
        "tierIsTier2MovementAux",
        "variantIsOneOfTwo",
        "noNgWordingInDisplayText",
        "displayTextMatchesOkPattern",
        "transitionKeyFormatIsOrdinal",
        "countsSumEqualsSize",
        "noPiiInResultTopLevel",
      ].sort(),
    );
    for (const key of keys) {
      expect(FEASIBILITY_DISPLAY_CONTRACT[key]).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. happy path", () => {
  it("slack view (= 余白 30 分)", () => {
    expect(() => assertFeasibilityDisplayCompliance(makeSlackView())).not.toThrow();
  });

  it("shortfall view (= 不足 10 分)", () => {
    expect(() => assertFeasibilityDisplayCompliance(makeShortfallView())).not.toThrow();
  });

  it("slack 境界値 (= 余白 0 分 / 余白 999 分)", () => {
    expect(() =>
      assertFeasibilityDisplayCompliance(makeSlackView({ displayText: "余白 0 分" })),
    ).not.toThrow();
    expect(() =>
      assertFeasibilityDisplayCompliance(makeSlackView({ displayText: "余白 999 分" })),
    ).not.toThrow();
  });

  it("shortfall 境界値 (= 不足 1 分 / 不足 500 分)", () => {
    expect(() =>
      assertFeasibilityDisplayCompliance(
        makeShortfallView({ displayText: "不足 1 分" }),
      ),
    ).not.toThrow();
    expect(() =>
      assertFeasibilityDisplayCompliance(
        makeShortfallView({ displayText: "不足 500 分" }),
      ),
    ).not.toThrow();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. 各 invariant violation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3.1 noPiiInDisplayText", () => {
  it("空 string → throw", () => {
    const bad = makeSlackView({ displayText: "" });
    try {
      assertFeasibilityDisplayCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(FeasibilityDisplayContractError);
      expect((err as FeasibilityDisplayContractError).violation).toBe("noPiiInDisplayText");
    }
  });
});

describe("§3.2 noPiiInViewKeys", () => {
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
    "slackMin",
    "shortfallMin",
    "estimatedDurationMin",
    "distanceM",
    "modeCandidate",
    "source",
    "privacyClass",
  ];
  for (const forbidden of forbiddenKeys) {
    it(`view に "${forbidden}" 含有 → throw`, () => {
      const bad = {
        ...makeSlackView(),
        [forbidden]: "leak-value",
      } as unknown as FeasibilityDisplayView;
      try {
        assertFeasibilityDisplayCompliance(bad);
        throw new Error("expected throw");
      } catch (err) {
        expect((err as FeasibilityDisplayContractError).violation).toBe("noPiiInViewKeys");
      }
    });
  }
});

describe("§3.3 tierIsTier2MovementAux", () => {
  it("不正 tier → throw", () => {
    const bad = {
      ...makeSlackView(),
      tier: "tier_2_movement",
    } as unknown as FeasibilityDisplayView;
    try {
      assertFeasibilityDisplayCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityDisplayContractError).violation).toBe(
        "tierIsTier2MovementAux",
      );
    }
  });
});

describe("§3.4 variantIsOneOfTwo", () => {
  it("不正 variant → throw", () => {
    const bad = {
      ...makeSlackView(),
      variant: "bogus",
    } as unknown as FeasibilityDisplayView;
    expect(() => assertFeasibilityDisplayCompliance(bad)).toThrow(
      FeasibilityDisplayContractError,
    );
  });
});

describe("§3.5 noNgWordingInDisplayText", () => {
  const ngExamples = [
    "ギリギリ余白",
    "急いで移動",
    "余裕あり",
    "快適移動",
    "便利な移動",
    "最適ルート",
    "注意 余白少なめ",
    "警告: 不足",
    "危険な移動",
    "リスクあり",
    "遅刻可能性",
    "お急ぎ ください",
    "早めに 出発",
    "間に合わない",
    "おすすめ ルート",
    "推奨 動線",
    "提案 あり",
    "推測 不足",
    "予測 余白",
    "予想 移動",
    "あと 30 分",
    "もう少し 余白",
    "足りない 移動",
    "余る 余白",
    "ピッタリ 余白",
    "ちょうど 不足",
    "⚠ 不足",
    "❗ 不足",
    "❌ 余白",
    "‼ 余白",
    "！ 不足",
    "？ 余白",
    "warning 不足",
    "alert 余白",
    "Achtung 余白",
    "OK 余白",
    "余白! 不足",
    "余白? 不足",
  ];
  for (const bad of ngExamples) {
    it(`displayText="${bad}" → throw`, () => {
      const view: FeasibilityDisplayView = makeSlackView({ displayText: bad });
      try {
        assertFeasibilityDisplayCompliance(view);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(FeasibilityDisplayContractError);
        const violation = (err as FeasibilityDisplayContractError).violation;
        expect(["noNgWordingInDisplayText", "displayTextMatchesOkPattern"]).toContain(
          violation,
        );
      }
    });
  }
});

describe("§3.6 displayTextMatchesOkPattern", () => {
  it("「余白 30分」 (= 半角全角混在の単位なし) → throw", () => {
    const bad = makeSlackView({ displayText: "余白 30分" });
    try {
      assertFeasibilityDisplayCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityDisplayContractError).violation).toBe(
        "displayTextMatchesOkPattern",
      );
    }
  });

  it("「不足30 分」 (= space 抜け) → throw", () => {
    const bad = makeShortfallView({ displayText: "不足30 分" });
    expect(() => assertFeasibilityDisplayCompliance(bad)).toThrow(
      FeasibilityDisplayContractError,
    );
  });

  it("「余白 N 分」 (= literal N) → throw", () => {
    const bad = makeSlackView({ displayText: "余白 N 分" });
    expect(() => assertFeasibilityDisplayCompliance(bad)).toThrow(
      FeasibilityDisplayContractError,
    );
  });

  it("「slack 30 min」 (= 英語) → throw", () => {
    const bad = makeSlackView({ displayText: "slack 30 min" });
    expect(() => assertFeasibilityDisplayCompliance(bad)).toThrow(
      FeasibilityDisplayContractError,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. bulk result assertion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. bulk result assertion", () => {
  it("正常 result PASS", () => {
    const map = new Map<string, FeasibilityDisplayView>();
    map.set("transition_0", makeSlackView());
    map.set("transition_1", makeShortfallView({ transitionIndex: 1 }));
    const result: FeasibilityDisplayResult = {
      feasibilityDisplayByTransitionKey: map,
      counts: { slack: 1, shortfall: 1 },
    };
    expect(() => assertFeasibilityDisplayResultCompliance(result)).not.toThrow();
  });

  it("不正 transitionKey 形式 → throw", () => {
    const map = new Map<string, FeasibilityDisplayView>();
    map.set("transition_0_with_extra", makeSlackView());
    const bad: FeasibilityDisplayResult = {
      feasibilityDisplayByTransitionKey: map,
      counts: { slack: 1, shortfall: 0 },
    };
    try {
      assertFeasibilityDisplayResultCompliance(bad);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as FeasibilityDisplayContractError).violation).toBe(
        "transitionKeyFormatIsOrdinal",
      );
    }
  });

  it("counts 不整合 → throw", () => {
    const map = new Map<string, FeasibilityDisplayView>();
    map.set("transition_0", makeSlackView());
    const bad: FeasibilityDisplayResult = {
      feasibilityDisplayByTransitionKey: map,
      counts: { slack: 99, shortfall: 0 },
    };
    expect(() => assertFeasibilityDisplayResultCompliance(bad)).toThrow(
      FeasibilityDisplayContractError,
    );
  });

  it("top-level に PII field 混入 → throw", () => {
    const map = new Map<string, FeasibilityDisplayView>();
    const bad = {
      feasibilityDisplayByTransitionKey: map,
      counts: { slack: 0, shortfall: 0 },
      title: "leak-value",
    } as unknown as FeasibilityDisplayResult;
    expect(() => assertFeasibilityDisplayResultCompliance(bad)).toThrow(
      FeasibilityDisplayContractError,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. NG / OK pattern export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. NG / OK pattern export 健全性", () => {
  it("NG_WORDING_SUBSTRINGS_FOR_TEST に必須 word 含む", () => {
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("ギリギリ");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("快適");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("危険");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("⚠");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("間に合わない");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("おすすめ");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("もう少し");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("足りない");
  });

  it("OK pattern は 2 種 (= 余白 / 不足)", () => {
    expect(OK_DISPLAY_TEXT_PATTERNS_FOR_TEST.length).toBe(2);
    expect(OK_DISPLAY_TEXT_PATTERNS_FOR_TEST.some((re) => re.test("余白 30 分"))).toBe(true);
    expect(OK_DISPLAY_TEXT_PATTERNS_FOR_TEST.some((re) => re.test("不足 10 分"))).toBe(true);
    expect(OK_DISPLAY_TEXT_PATTERNS_FOR_TEST.some((re) => re.test("該当なし"))).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. Integration with M-2a (= 全 fixture で contract 通過)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. Integration — M-2a 出力は全件 contract 通過", () => {
  const fixtures = [
    { name: "LIGHT", anchors: LIGHT_DAY_ANCHORS, coords: new Map([["light_a", SHINJUKU], ["light_b", SHIBUYA]]) },
    { name: "MOVEMENT", anchors: MOVEMENT_DAY_ANCHORS, coords: new Map([["move_morning", SHIBUYA], ["move_afternoon", SHINJUKU], ["move_evening", SHINJUKU]]) },
    { name: "HEAVY", anchors: HEAVY_DAY_ANCHORS, coords: new Map<string, { lat: number; lng: number }>() },
    { name: "SENSITIVE", anchors: SENSITIVE_DAY_ANCHORS, coords: new Map([["sens_med", TOKYO], ["sens_legal", SHINJUKU], ["normal", SHIBUYA]]) },
  ];

  for (const { name, anchors, coords } of fixtures) {
    it(`${name} fixture: overlay → feasibility → display → contract assert 全 PASS`, async () => {
      const { graph } = buildDayGraph({ anchors, date: DATE });
      const overlay = await resolveMovementSegmentOverlay({
        graph,
        coordsByAnchorId: coords,
        cascadeOptions: { providers: defaultProviders() },
      });
      const feasibility = computeDayFeasibility(graph, overlay);
      const display = formatFeasibilityForDisplay(feasibility);
      expect(() => assertFeasibilityDisplayResultCompliance(display)).not.toThrow();
    });
  }
});
