/**
 * Phase 3-L L-4b — movementDisplayContract tests
 *
 * 設計書: docs/alter-plan-phase3-l-4-readiness-audit.md §3 / §5.2
 *
 * 検証範囲:
 *   §1. MOVEMENT_DISPLAY_CONTRACT は 6 invariants 全 literal true
 *   §2. assertMovementDisplayCompliance — happy path
 *   §3. 各 invariant の violation 検出
 *      - noPiiInDisplayText (= empty)
 *      - noPiiInViewKeys (= 14 forbidden keys、 individually)
 *      - tierIsTier2Movement
 *      - variantIsOneOfThree
 *      - noNgWordingInDisplayText (= 20+ NG word、 抜粋)
 *      - displayTextMatchesOkPattern (= 「移動 30 分」 等の不正形)
 *   §4. assertMovementDisplayResultCompliance — bulk
 *   §5. Real L-4a output が contract を必ず通る (= regression guard)
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase 既存 file 変更 0
 *   - L-1/L-2/L-3 file 変更 0
 */

import { describe, expect, it } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import { resolveMovementSegmentOverlay } from "@/lib/plan/transport/movementSegmentOverlay";
import {
  formatOverlayResultForDisplay,
  formatOverlaySegmentForDisplay,
  type MovementDisplayResult,
  type MovementDisplayView,
} from "@/lib/plan/transport/movementDisplayFormatter";
import {
  MOVEMENT_DISPLAY_CONTRACT,
  MovementDisplayContractError,
  NG_WORDING_SUBSTRINGS_FOR_TEST,
  OK_DISPLAY_TEXT_PATTERNS_FOR_TEST,
  assertMovementDisplayCompliance,
  assertMovementDisplayResultCompliance,
  type MovementDisplayContract,
} from "@/lib/plan/transport/movementDisplayContract";
import type {
  OverlaySegmentResolvedView,
  OverlaySegmentUnresolvedView,
} from "@/lib/plan/transport/movementSegmentOverlay";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";
import {
  HEAVY_DAY_ANCHORS,
  LIGHT_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
} from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-22";
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

function makeUnresolvedView(
  overrides: Partial<OverlaySegmentUnresolvedView> = {},
): OverlaySegmentUnresolvedView {
  return {
    timingStatus: "unresolved",
    transitionIndex: 0,
    unresolvedReason: "location_unknown",
    ...overrides,
  };
}

function makeResolvedView(
  overrides: Partial<OverlaySegmentResolvedView> = {},
): OverlaySegmentResolvedView {
  return {
    timingStatus: "resolved",
    transitionIndex: 0,
    estimatedDurationMin: 25,
    modeCandidate: { mode: "unknown", confidence: { level: "low", reason: "heuristic_distance_only" } },
    source: "heuristic_distance",
    confidence: { level: "low", reason: "heuristic_distance_only" },
    privacyClass: "normal",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. Contract 値検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. MOVEMENT_DISPLAY_CONTRACT — 6 invariants 全 true", () => {
  it("exposes exactly 6 invariants, all true", () => {
    const keys = Object.keys(MOVEMENT_DISPLAY_CONTRACT) as Array<
      keyof MovementDisplayContract
    >;
    expect(keys.sort()).toEqual(
      [
        "noPiiInDisplayText",
        "noPiiInViewKeys",
        "tierIsTier2Movement",
        "variantIsOneOfThree",
        "noNgWordingInDisplayText",
        "displayTextMatchesOkPattern",
      ].sort(),
    );
    for (const key of keys) {
      expect(MOVEMENT_DISPLAY_CONTRACT[key]).toBe(true);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. assertMovementDisplayCompliance — happy path
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. happy path — L-4a 出力は全件 PASS", () => {
  it("unresolved view", () => {
    const view = formatOverlaySegmentForDisplay(makeUnresolvedView());
    expect(() => assertMovementDisplayCompliance(view)).not.toThrow();
  });

  it("sensitive view", () => {
    const view = formatOverlaySegmentForDisplay(
      makeResolvedView({ privacyClass: "sensitive_both" }),
    );
    expect(() => assertMovementDisplayCompliance(view)).not.toThrow();
  });

  it("duration_only view (low confidence)", () => {
    const view = formatOverlaySegmentForDisplay(makeResolvedView());
    expect(() => assertMovementDisplayCompliance(view)).not.toThrow();
  });

  it("duration_only view (high confidence)", () => {
    const view = formatOverlaySegmentForDisplay(
      makeResolvedView({
        confidence: { level: "high", reason: "user_explicit" },
        source: "manual_user",
      }),
    );
    expect(() => assertMovementDisplayCompliance(view)).not.toThrow();
  });

  it("duration 1, 25, 90 分の境界値", () => {
    for (const min of [1, 25, 90]) {
      const view = formatOverlaySegmentForDisplay(
        makeResolvedView({ estimatedDurationMin: min }),
      );
      expect(() => assertMovementDisplayCompliance(view)).not.toThrow();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. 各 invariant の violation 検出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3.1 noPiiInDisplayText — displayText が empty", () => {
  it("displayText='' → throw", () => {
    const view: MovementDisplayView = {
      transitionIndex: 0,
      displayText: "",
      tier: "tier_2_movement",
      variant: "unresolved",
    };
    try {
      assertMovementDisplayCompliance(view);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(MovementDisplayContractError);
      expect((err as MovementDisplayContractError).violation).toBe("noPiiInDisplayText");
    }
  });
});

describe("§3.2 noPiiInViewKeys — forbidden keys", () => {
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
    "modeCandidate",
    "source",
    "confidence",
    "privacyClass",
    "distanceM",
  ];

  for (const forbidden of forbiddenKeys) {
    it(`view に "${forbidden}" 含有 → throw`, () => {
      const view = {
        transitionIndex: 0,
        displayText: "→ 移動",
        tier: "tier_2_movement",
        variant: "unresolved",
        [forbidden]: "leak-value",
      } as unknown as MovementDisplayView;
      try {
        assertMovementDisplayCompliance(view);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(MovementDisplayContractError);
        expect((err as MovementDisplayContractError).violation).toBe("noPiiInViewKeys");
      }
    });
  }
});

describe("§3.3 tierIsTier2Movement", () => {
  it("tier 不正値 → throw", () => {
    const view = {
      transitionIndex: 0,
      displayText: "→ 移動",
      tier: "tier_999_bogus",
      variant: "unresolved",
    } as unknown as MovementDisplayView;
    try {
      assertMovementDisplayCompliance(view);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as MovementDisplayContractError).violation).toBe("tierIsTier2Movement");
    }
  });
});

describe("§3.4 variantIsOneOfThree", () => {
  it("variant 不正値 → throw", () => {
    const view = {
      transitionIndex: 0,
      displayText: "→ 移動",
      tier: "tier_2_movement",
      variant: "bogus_variant",
    } as unknown as MovementDisplayView;
    try {
      assertMovementDisplayCompliance(view);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as MovementDisplayContractError).violation).toBe("variantIsOneOfThree");
    }
  });
});

describe("§3.5 noNgWordingInDisplayText", () => {
  const ngExamples: ReadonlyArray<string> = [
    "早めに移動",
    "お急ぎで移動",
    "余裕あり移動",
    "快適移動",
    "便利な移動",
    "最適ルート",
    "注意 移動長め",
    "警告 遅刻リスク",
    "歩いて 30 分",
    "車で 30 分",
    "電車で 30 分",
    "飛行機で 30 分",
    "3 km 移動",
    "from Tokyo",
    "to Shinjuku",
  ];
  for (const bad of ngExamples) {
    it(`displayText="${bad}" → throw (= NG wording)`, () => {
      const view: MovementDisplayView = {
        transitionIndex: 0,
        displayText: bad,
        tier: "tier_2_movement",
        variant: "duration_only",
      };
      try {
        assertMovementDisplayCompliance(view);
        throw new Error("expected throw");
      } catch (err) {
        expect(err).toBeInstanceOf(MovementDisplayContractError);
        // NG wording check が OK pattern より先に走るので noNgWordingInDisplayText で fire
        // 但し OK pattern で先に弾かれるケースもあり得る (= 順序依存)
        const violation = (err as MovementDisplayContractError).violation;
        expect([
          "noNgWordingInDisplayText",
          "displayTextMatchesOkPattern",
        ]).toContain(violation);
      }
    });
  }
});

describe("§3.6 displayTextMatchesOkPattern — 不正形を reject", () => {
  it("'移動 30 分' (= 「約」 抜け) → throw", () => {
    const view: MovementDisplayView = {
      transitionIndex: 0,
      displayText: "移動 30 分",
      tier: "tier_2_movement",
      variant: "duration_only",
    };
    try {
      assertMovementDisplayCompliance(view);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as MovementDisplayContractError).violation).toBe("displayTextMatchesOkPattern");
    }
  });

  it("'移動 約 N 分' (= literal N) → throw", () => {
    const view: MovementDisplayView = {
      transitionIndex: 0,
      displayText: "移動 約 N 分",
      tier: "tier_2_movement",
      variant: "duration_only",
    };
    try {
      assertMovementDisplayCompliance(view);
      throw new Error("expected throw");
    } catch (err) {
      expect((err as MovementDisplayContractError).violation).toBe("displayTextMatchesOkPattern");
    }
  });

  it("'移動 about 30 min' (= 英語) → throw", () => {
    const view: MovementDisplayView = {
      transitionIndex: 0,
      displayText: "移動 about 30 min",
      tier: "tier_2_movement",
      variant: "duration_only",
    };
    expect(() => assertMovementDisplayCompliance(view)).toThrow(MovementDisplayContractError);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. assertMovementDisplayResultCompliance — bulk
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. bulk assertion", () => {
  it("正常な L-4a 出力を bulk assert → PASS", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const display = formatOverlayResultForDisplay(overlay);
    expect(() => assertMovementDisplayResultCompliance(display)).not.toThrow();
  });

  it("transitionKey 形式違反 → throw", () => {
    const view: MovementDisplayView = {
      transitionIndex: 0,
      displayText: "→ 移動",
      tier: "tier_2_movement",
      variant: "unresolved",
    };
    const bad: MovementDisplayResult = {
      displaysByTransitionKey: new Map([["transition_0_with_extra", view]]),
      variantCounts: { unresolved: 1, sensitive: 0, duration_only: 0 },
    };
    expect(() => assertMovementDisplayResultCompliance(bad)).toThrow(
      MovementDisplayContractError,
    );
  });

  it("variantCounts 集計恒等式 違反 → throw", () => {
    const view: MovementDisplayView = {
      transitionIndex: 0,
      displayText: "→ 移動",
      tier: "tier_2_movement",
      variant: "unresolved",
    };
    const bad: MovementDisplayResult = {
      displaysByTransitionKey: new Map([["transition_0", view]]),
      variantCounts: { unresolved: 999, sensitive: 0, duration_only: 0 }, // 数が合わない
    };
    expect(() => assertMovementDisplayResultCompliance(bad)).toThrow(
      MovementDisplayContractError,
    );
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Real overlay → L-4a → L-4b の full pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. Real overlay → L-4a → L-4b pipeline", () => {
  const fixtures = [
    { name: "LIGHT", anchors: LIGHT_DAY_ANCHORS, coords: new Map([["light_a", SHINJUKU], ["light_b", SHIBUYA]]) },
    { name: "MOVEMENT", anchors: MOVEMENT_DAY_ANCHORS, coords: new Map([["move_morning", SHIBUYA], ["move_afternoon", SHINJUKU], ["move_evening", SHINJUKU]]) },
    { name: "HEAVY", anchors: HEAVY_DAY_ANCHORS, coords: new Map<string, { lat: number; lng: number }>() },
    { name: "SENSITIVE", anchors: SENSITIVE_DAY_ANCHORS, coords: new Map([["sens_med", TOKYO], ["sens_legal", SHINJUKU], ["normal", SHIBUYA]]) },
  ];

  for (const { name, anchors, coords } of fixtures) {
    it(`${name} fixture: overlay → display → contract assert 全 PASS`, async () => {
      const { graph } = buildDayGraph({ anchors, date: DATE });
      const overlay = await resolveMovementSegmentOverlay({
        graph,
        coordsByAnchorId: coords,
        cascadeOptions: { providers: defaultProviders() },
      });
      const display = formatOverlayResultForDisplay(overlay);
      expect(() => assertMovementDisplayResultCompliance(display)).not.toThrow();
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. NG wording list / OK pattern の export 健全性
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. NG wording / OK pattern export 健全性", () => {
  it("NG_WORDING_SUBSTRINGS_FOR_TEST は readiness audit §3.2 と整合", () => {
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("早めに");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("お急ぎ");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("快適");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("注意");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("歩いて");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("km");
    expect(NG_WORDING_SUBSTRINGS_FOR_TEST).toContain("from");
  });

  it("OK pattern は 3 種", () => {
    expect(OK_DISPLAY_TEXT_PATTERNS_FOR_TEST.length).toBe(3);
    // 各 pattern が L-4a の出力例にマッチ
    expect(OK_DISPLAY_TEXT_PATTERNS_FOR_TEST.some((re) => re.test("→ 移動"))).toBe(true);
    expect(OK_DISPLAY_TEXT_PATTERNS_FOR_TEST.some((re) => re.test("移動"))).toBe(true);
    expect(OK_DISPLAY_TEXT_PATTERNS_FOR_TEST.some((re) => re.test("移動 約 25 分"))).toBe(true);
  });
});
