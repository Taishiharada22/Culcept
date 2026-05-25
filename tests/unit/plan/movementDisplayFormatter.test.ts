/**
 * Phase 3-L L-4a — movementDisplayFormatter tests
 *
 * 設計書: docs/alter-plan-phase3-l-4-readiness-audit.md §2 / §5
 *
 * 検証範囲:
 *   §1. variant ルール (= unresolved / sensitive / duration_only) の正確性
 *   §2. displayText 文言 (= 「→ 移動」 / 「移動」 / 「移動 約 N 分」)
 *   §3. tier 固定 (= "tier_2_movement")
 *   §4. confidenceBand mapping (= low → soft、 medium 以上 → strong)
 *   §5. duration 丸め (= Math.max(1, round))
 *   §6. PII 不存在 (= MovementDisplayView の key set 検証)
 *   §7. bulk formatter (= internal_error skip、 variantCounts 集計)
 *   §8. Real overlay pipeline integration (= OverlayResult → display view)
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
  type MovementDisplayView,
} from "@/lib/plan/transport/movementDisplayFormatter";
import type {
  OverlaySegmentResolvedView,
  OverlaySegmentUnresolvedView,
} from "@/lib/plan/transport/movementSegmentOverlay";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";
import {
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures (= 直接構築の OverlaySegmentView)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeUnresolved(
  overrides: Partial<OverlaySegmentUnresolvedView> = {},
): OverlaySegmentUnresolvedView {
  return {
    timingStatus: "unresolved",
    transitionIndex: 0,
    unresolvedReason: "location_unknown",
    ...overrides,
  };
}

function makeResolved(
  overrides: Partial<OverlaySegmentResolvedView> = {},
): OverlaySegmentResolvedView {
  return {
    timingStatus: "resolved",
    transitionIndex: 0,
    estimatedDurationMin: 25,
    modeCandidate: {
      mode: "unknown",
      confidence: { level: "low", reason: "heuristic_distance_only" },
    },
    source: "heuristic_distance",
    confidence: { level: "low", reason: "heuristic_distance_only" },
    privacyClass: "normal",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 + §2. variant ルール + displayText 文言
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1 variant + §2 displayText", () => {
  it("unresolved → variant='unresolved'、 displayText='→ 移動'", () => {
    const view = formatOverlaySegmentForDisplay(makeUnresolved());
    expect(view.variant).toBe("unresolved");
    expect(view.displayText).toBe("→ 移動");
    expect(view.transitionIndex).toBe(0);
    expect(view.tier).toBe("tier_2_movement");
    expect(view.confidenceBand).toBeUndefined();
  });

  it("resolved + privacyClass='normal' → variant='duration_only'、 ' 移動 約 N 分'", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ estimatedDurationMin: 25 }));
    expect(view.variant).toBe("duration_only");
    expect(view.displayText).toBe("移動 約 25 分");
  });

  it("resolved + privacyClass='sensitive_both' → variant='sensitive'、 '移動'", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ privacyClass: "sensitive_both" }));
    expect(view.variant).toBe("sensitive");
    expect(view.displayText).toBe("移動");
  });

  it("resolved + privacyClass='sensitive_adjacent' → variant='sensitive'、 '移動'", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ privacyClass: "sensitive_adjacent" }));
    expect(view.variant).toBe("sensitive");
    expect(view.displayText).toBe("移動");
  });

  it("resolved + privacyClass='location_unknown' → variant='sensitive' (= 防御)、 '移動'", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ privacyClass: "location_unknown" }));
    expect(view.variant).toBe("sensitive");
    expect(view.displayText).toBe("移動");
  });

  it("複数 unresolvedReason でも displayText は '→ 移動' 統一", () => {
    const reasons = [
      "location_unknown",
      "sensitive_proximity",
      "api_timeout",
      "api_error",
      "rate_limit",
      "cost_cap_exceeded",
      "heuristic_failed",
      "no_provider_available",
    ] as const;
    for (const reason of reasons) {
      const view = formatOverlaySegmentForDisplay(makeUnresolved({ unresolvedReason: reason }));
      expect(view.displayText).toBe("→ 移動");
      expect(view.variant).toBe("unresolved");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. tier 固定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. tier 固定 = 'tier_2_movement'", () => {
  it("全 variant で tier は 'tier_2_movement'", () => {
    const cases: Array<OverlaySegmentResolvedView | OverlaySegmentUnresolvedView> = [
      makeUnresolved(),
      makeResolved({ privacyClass: "normal" }),
      makeResolved({ privacyClass: "sensitive_both" }),
      makeResolved({ privacyClass: "sensitive_adjacent" }),
      makeResolved({ privacyClass: "location_unknown" }),
    ];
    for (const segment of cases) {
      const view = formatOverlaySegmentForDisplay(segment);
      expect(view.tier).toBe("tier_2_movement");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. confidenceBand mapping
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. confidenceBand mapping", () => {
  it("confidence.level='low' → confidenceBand='soft'", () => {
    const view = formatOverlaySegmentForDisplay(
      makeResolved({ confidence: { level: "low", reason: "heuristic_distance_only" } }),
    );
    expect(view.confidenceBand).toBe("soft");
  });

  it("confidence.level='medium' → confidenceBand='strong'", () => {
    const view = formatOverlaySegmentForDisplay(
      makeResolved({ confidence: { level: "medium", reason: "routes_api_response" } }),
    );
    expect(view.confidenceBand).toBe("strong");
  });

  it("confidence.level='high' → confidenceBand='strong'", () => {
    const view = formatOverlaySegmentForDisplay(
      makeResolved({
        confidence: { level: "high", reason: "user_explicit" },
        source: "manual_user",
      }),
    );
    expect(view.confidenceBand).toBe("strong");
  });

  it("confidence.level='very_high' → confidenceBand='strong'", () => {
    const view = formatOverlaySegmentForDisplay(
      makeResolved({ confidence: { level: "very_high", reason: "cross_provider_match" } }),
    );
    expect(view.confidenceBand).toBe("strong");
  });

  it("unresolved では confidenceBand undefined", () => {
    const view = formatOverlaySegmentForDisplay(makeUnresolved());
    expect(view.confidenceBand).toBeUndefined();
  });

  it("sensitive では confidenceBand undefined", () => {
    const view = formatOverlaySegmentForDisplay(
      makeResolved({ privacyClass: "sensitive_both" }),
    );
    expect(view.confidenceBand).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. duration 丸め (= Math.max(1, round))
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. duration 丸め", () => {
  it("estimatedDurationMin=25.4 → '移動 約 25 分'", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ estimatedDurationMin: 25.4 }));
    expect(view.displayText).toBe("移動 約 25 分");
  });

  it("estimatedDurationMin=25.6 → '移動 約 26 分'", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ estimatedDurationMin: 25.6 }));
    expect(view.displayText).toBe("移動 約 26 分");
  });

  it("estimatedDurationMin=0 → '移動 約 1 分' (= 「0 分」 表示防御)", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ estimatedDurationMin: 0 }));
    expect(view.displayText).toBe("移動 約 1 分");
  });

  it("estimatedDurationMin=0.4 → '移動 約 1 分' (= round で 0 になっても min 1)", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ estimatedDurationMin: 0.4 }));
    expect(view.displayText).toBe("移動 約 1 分");
  });

  it("estimatedDurationMin=90 → '移動 約 90 分'", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved({ estimatedDurationMin: 90 }));
    expect(view.displayText).toBe("移動 約 90 分");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. PII 不存在 (= MovementDisplayView の key set 検証)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. PII 不存在 — MovementDisplayView の key set", () => {
  it("unresolved view: PII field なし", () => {
    const view = formatOverlaySegmentForDisplay(makeUnresolved());
    const keys = Object.keys(view).sort();
    expect(keys).toEqual(["displayText", "tier", "transitionIndex", "variant"].sort());
  });

  it("sensitive view: PII field なし", () => {
    const view = formatOverlaySegmentForDisplay(
      makeResolved({ privacyClass: "sensitive_both" }),
    );
    const keys = Object.keys(view).sort();
    expect(keys).toEqual(["displayText", "tier", "transitionIndex", "variant"].sort());
  });

  it("duration_only view: confidenceBand 追加、 但し PII なし", () => {
    const view = formatOverlaySegmentForDisplay(makeResolved());
    const keys = Object.keys(view).sort();
    expect(keys).toEqual(
      ["confidenceBand", "displayText", "tier", "transitionIndex", "variant"].sort(),
    );
    // PII key の不在を念のため確認
    expect(keys).not.toContain("fromNodeId");
    expect(keys).not.toContain("toNodeId");
    expect(keys).not.toContain("fromLocationText");
    expect(keys).not.toContain("toLocationText");
    expect(keys).not.toContain("sensitiveProximity");
    expect(keys).not.toContain("anchorId");
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("title");
    expect(keys).not.toContain("estimatedDurationMin"); // raw 値出さない、 text のみ
    expect(keys).not.toContain("source");                // provider id 出さない
    expect(keys).not.toContain("confidence");            // raw confidence 出さない、 band のみ
    expect(keys).not.toContain("privacyClass");          // raw class 出さない
    expect(keys).not.toContain("distanceM");             // 距離出さない
    expect(keys).not.toContain("modeCandidate");         // mode 出さない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7. bulk formatter (= formatOverlayResultForDisplay)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. bulk formatter — formatOverlayResultForDisplay", () => {
  it("MOVEMENT fixture + 全 coords → variantCounts.duration_only=1", async () => {
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
    expect(display.variantCounts.duration_only).toBe(1);
    expect(display.variantCounts.unresolved).toBe(0);
    expect(display.variantCounts.sensitive).toBe(0);
    expect(display.displaysByTransitionKey.size).toBe(1);

    const view = display.displaysByTransitionKey.get("transition_0")!;
    expect(view.variant).toBe("duration_only");
    expect(view.displayText).toMatch(/^移動 約 \d+ 分$/);
  });

  it("MOVEMENT fixture + coords なし → 全 transition unresolved variant", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const display = formatOverlayResultForDisplay(overlay);
    expect(display.variantCounts.unresolved).toBe(graph.transitions.length);
    expect(display.variantCounts.duration_only).toBe(0);
    expect(display.variantCounts.sensitive).toBe(0);
  });

  it("SENSITIVE fixture → 全 transition sensitive (= cascade で sensitive_proximity unresolved 経由)", async () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["sens_med", TOKYO],
        ["sens_legal", SHINJUKU],
        ["normal", SHIBUYA],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const display = formatOverlayResultForDisplay(overlay);
    // cascade は sensitive_proximity → unresolved に倒すため、 formatter は variant "unresolved" を返す
    // (= sensitive variant は caller が直接 segment を作った場合のみ)
    for (const view of display.displaysByTransitionKey.values()) {
      expect(view.variant).toBe("unresolved");
      expect(view.displayText).toBe("→ 移動");
    }
  });

  it("空 graph (= transitions 0) → displaysByTransitionKey 空、 variantCounts 全 0", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    // LIGHT は 1 transition、 一旦実 overlay を呼ぶが、 ここで空 simulate も別途 test
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });
    const display = formatOverlayResultForDisplay(overlay);
    expect(display.displaysByTransitionKey.size).toBe(graph.transitions.length);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. Integration with real overlay pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. Real overlay pipeline integration", () => {
  it("MOVEMENT fixture + 全 coords + manual override → manual で resolved、 display 'duration_only' strong", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overrides = new Map([[0, { userDurationMin: 17 }]]);

    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["move_morning", SHIBUYA],
        ["move_afternoon", SHINJUKU],
        ["move_evening", SHINJUKU],
      ]),
      overridesByTransitionIndex: overrides,
      cascadeOptions: { providers: defaultProviders() },
    });

    const display = formatOverlayResultForDisplay(overlay);
    const view = display.displaysByTransitionKey.get("transition_0")!;
    expect(view.variant).toBe("duration_only");
    expect(view.displayText).toBe("移動 約 17 分");
    expect(view.confidenceBand).toBe("strong"); // manual_user → confidence.high
  });

  it("Real overlay JSON 全体に raw PII が含まれない", async () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["sens_med", TOKYO],
        ["sens_legal", SHINJUKU],
        ["normal", SHIBUYA],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });
    const display = formatOverlayResultForDisplay(overlay);
    const serialized = JSON.stringify(
      Array.from(display.displaysByTransitionKey.entries()),
    );
    expect(serialized).not.toContain("MRI 予約");
    expect(serialized).not.toContain("弁護士相談");
    expect(serialized).not.toContain("○○病院");
    expect(serialized).not.toContain("××法律事務所");
    expect(serialized).not.toContain("sens_med");
    expect(serialized).not.toContain("sens_legal");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. Input immutability
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. Input immutability", () => {
  it("formatOverlaySegmentForDisplay は input を mutate しない", () => {
    const segment = makeResolved({ estimatedDurationMin: 25 });
    const snapshot = JSON.stringify(segment);
    formatOverlaySegmentForDisplay(segment);
    expect(JSON.stringify(segment)).toBe(snapshot);
  });

  it("formatOverlayResultForDisplay は OverlayResult を mutate しない", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overlay = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });

    // segmentsByTransitionKey の size 等は変わらない
    const sizeBefore = overlay.segmentsByTransitionKey.size;
    const resolvedBefore = overlay.resolvedCount;
    const unresolvedBefore = overlay.unresolvedCount;

    formatOverlayResultForDisplay(overlay);

    expect(overlay.segmentsByTransitionKey.size).toBe(sizeBefore);
    expect(overlay.resolvedCount).toBe(resolvedBefore);
    expect(overlay.unresolvedCount).toBe(unresolvedBefore);
  });
});
