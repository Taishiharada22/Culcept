/**
 * Phase 3-L L-3c — Privacy + Mutation Hardening tests
 *
 * 設計書: docs/alter-plan-phase3-l-3-post-implementation-audit.md (= 4 critical 実害 詳述)
 *
 * 役割:
 *   L-3a/L-3b で見逃された 4 critical の **regression guard** test。
 *   GPT 指摘 + runtime 実測で発覚した実害を直接検証する。
 *
 *   1. snapshotId mutation guard 弱さ (= JSON snapshot 比較に強化)
 *   2. transitionKey の anchor id 漏洩 (= 非 PII 化、 `transition_${index}`)
 *   3. sensitive_adjacent も unresolved (= cascade early-exit)
 *   6. overlay output の raw locationText 漏洩 (= OverlaySegmentView で sanitize)
 *
 *   + 追加条件 (= CEO 2026-05-22 PM):
 *     - nodeId を overlay output に出さない
 *     - assertOverlayResultCompliance による privacy assertion
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase 既存 file 変更 0
 *   - L-1 type 変更 0
 */

import { describe, expect, it } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { runCascade } from "@/lib/plan/transport/cascadeOrchestrator";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import {
  assertOverlayResultCompliance,
  buildTransitionKey,
  MovementOverlayMutationError,
  OverlayPrivacyAssertionError,
  resolveMovementSegmentOverlay,
  type OverlayResult,
  type OverlaySegmentView,
  type OverlayTransitionOutcome,
} from "@/lib/plan/transport/movementSegmentOverlay";
import type { TransportResolutionProvider } from "@/lib/plan/transport/transportTypes";
import {
  LIGHT_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
} from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-22";

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const SHIBUYA = { lat: 35.6580, lng: 139.7016 };

const LIGHT_COORDS = new Map([
  ["light_a", SHINJUKU],
  ["light_b", SHIBUYA],
]);

const MOVEMENT_COORDS = new Map([
  ["move_morning", SHIBUYA],
  ["move_afternoon", SHINJUKU],
  ["move_evening", SHINJUKU],
]);

function defaultProviders(): TransportResolutionProvider[] {
  return [
    createManualUserProvider(),
    createHeuristicDistanceProvider(),
    createUnresolvedProvider("no_provider_available"),
  ];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Critical 1: snapshotId mutation guard 強化 (= L-3c 1A)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Critical 1: mutation guard 強化 — JSON snapshot 比較で内部 mutation 検出", () => {
  /**
   * Test 戦略:
   *   通常 path では graph mutation は起きないため、 mutation 発生を simulate するために
   *   provider 内で graph を mutate する fake provider を作る。
   *   - 旧 snapshotId 比較: graph.nodes[0] の field を mutate しても snapshotId 不変 → 検出不能
   *   - 新 JSON snapshot 比較: 内部 field mutation も検出 → throw
   */

  it("provider 内で graph.nodes[0] の locationText を直接 mutate → 強化 assertion が発火", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });

    const mutatingProvider: TransportResolutionProvider = {
      id: "heuristic_distance",
      health: "healthy",
      async resolveDuration() {
        // 直接 mutate (= ReadonlyArray は runtime 防御なし)
        // @ts-expect-error readonly violation で意図的 mutate
        graph.nodes[0]!.locationText = "MUTATED_BY_PROVIDER";
        return { ok: false, reason: "heuristic_failed" };
      },
    };

    await expect(
      resolveMovementSegmentOverlay({
        graph,
        coordsByAnchorId: LIGHT_COORDS,
        cascadeOptions: { providers: [mutatingProvider] },
      }),
    ).rejects.toThrow(MovementOverlayMutationError);
  });

  it("provider が graph.transitions.push を試行 → 早期検出で長さ違反 throw", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });

    const pushingProvider: TransportResolutionProvider = {
      id: "heuristic_distance",
      health: "healthy",
      async resolveDuration() {
        // @ts-expect-error mutation
        graph.transitions.push({
          fromNodeId: "x",
          toNodeId: "y",
          timingStatus: "unresolved",
          sensitiveProximity: false,
        });
        return { ok: false, reason: "heuristic_failed" };
      },
    };

    await expect(
      resolveMovementSegmentOverlay({
        graph,
        coordsByAnchorId: LIGHT_COORDS,
        cascadeOptions: { providers: [pushingProvider] },
      }),
    ).rejects.toThrow(MovementOverlayMutationError);
  });

  it("通常 path (= mutation なし) では assertion は throw しない", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    await expect(
      resolveMovementSegmentOverlay({
        graph,
        coordsByAnchorId: MOVEMENT_COORDS,
        cascadeOptions: { providers: defaultProviders() },
      }),
    ).resolves.toBeDefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Critical 2: transitionKey 非 PII 化 (= L-3c 2A)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Critical 2: transitionKey 非 PII 化 — anchor id 漏洩防止", () => {
  it("buildTransitionKey 出力に anchor id / nodeId が含まれない", () => {
    const key0 = buildTransitionKey(0);
    expect(key0).toBe("transition_0");
    expect(key0).not.toContain("move_morning");
    expect(key0).not.toContain("evt_");
  });

  it("MOVEMENT fixture の overlay 出力 transitionKey に anchor id が含まれない", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    for (const key of result.segmentsByTransitionKey.keys()) {
      expect(key).toMatch(/^transition_\d+$/);
      expect(key).not.toContain("move_morning");
      expect(key).not.toContain("move_afternoon");
      expect(key).not.toContain("move_evening");
    }
  });

  it("L-3b 旧形式 (= transition_0_move_morning_move_afternoon) は overlay から生成されない", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    // L-3b 旧形式が key として存在しないことを直接 confirm
    expect(result.segmentsByTransitionKey.has("transition_0_move_morning_move_afternoon")).toBe(false);
    // L-3c 新形式が存在
    expect(result.segmentsByTransitionKey.has("transition_0")).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Critical 3: sensitive_adjacent も unresolved (= L-3c 3A)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Critical 3: sensitive_adjacent も unresolved — cascade 完全 sensitive 防御", () => {
  it("cascade に sensitive_adjacent input → unresolved 'sensitive_proximity'", async () => {
    const heuristic = createHeuristicDistanceProvider();
    const result = await runCascade(
      {
        resolution: {
          privacyClass: "sensitive_adjacent",
          fromCoords: TOKYO,
          toCoords: SHINJUKU,
        },
        segmentBase: {
          fromNodeId: "n1",
          toNodeId: "n2",
          sensitiveProximity: false,
        },
      },
      { providers: [heuristic] },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("sensitive_proximity");
      expect(result.trace.earlyExitReason).toBe("sensitive_proximity");
      expect(result.trace.attemptedProviders).toEqual([]);
    }
  });

  it("片側 sensitive / 両側 sensitive 両方とも duration を resolve しない (= runtime)", async () => {
    const heuristic = createHeuristicDistanceProvider();

    for (const privacyClass of ["sensitive_adjacent", "sensitive_both"] as const) {
      const result = await runCascade(
        {
          resolution: { privacyClass, fromCoords: TOKYO, toCoords: SHINJUKU },
          segmentBase: { fromNodeId: "x", toNodeId: "y", sensitiveProximity: false },
        },
        { providers: [heuristic] },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("sensitive_proximity");
      }
    }
  });

  it("SENSITIVE fixture (= overlay 経由) の全 transition が unresolved 'sensitive_proximity'", async () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const allCoords = new Map([
      ["sens_med", TOKYO],
      ["sens_legal", SHINJUKU],
      ["normal", SHIBUYA],
    ]);

    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: allCoords,
      cascadeOptions: { providers: defaultProviders() },
    });

    for (const outcome of result.segmentsByTransitionKey.values()) {
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.segment.timingStatus).toBe("unresolved");
        if (outcome.segment.timingStatus === "unresolved") {
          expect(outcome.segment.unresolvedReason).toBe("sensitive_proximity");
        }
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Critical 6: overlay output で raw locationText / nodeId を出さない (= L-3c 6A)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Critical 6: overlay output sanitize — raw locationText / nodeId 漏洩防止", () => {
  it("LIGHT fixture: resolved segment view に locationText / nodeId field 不存在", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: [createHeuristicDistanceProvider()] },
    });

    for (const outcome of result.segmentsByTransitionKey.values()) {
      if (outcome.ok && outcome.segment.timingStatus === "resolved") {
        const keys = Object.keys(outcome.segment);
        expect(keys).not.toContain("fromNodeId");
        expect(keys).not.toContain("toNodeId");
        expect(keys).not.toContain("fromLocationText");
        expect(keys).not.toContain("toLocationText");
        expect(keys).not.toContain("sensitiveProximity");
        expect(keys).not.toContain("anchorId");
        // 期待される field のみ
        expect(keys).toContain("timingStatus");
        expect(keys).toContain("transitionIndex");
        expect(keys).toContain("estimatedDurationMin");
        expect(keys).toContain("modeCandidate");
        expect(keys).toContain("source");
        expect(keys).toContain("confidence");
        expect(keys).toContain("privacyClass");
      }
    }
  });

  it("LIGHT fixture: overlay 出力 JSON 全体に raw 新宿 / 渋谷 / light_a / light_b 含まれない", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: [createHeuristicDistanceProvider()] },
    });

    const serialized = JSON.stringify(Array.from(result.segmentsByTransitionKey.entries()));
    expect(serialized).not.toContain("新宿");
    expect(serialized).not.toContain("渋谷");
    expect(serialized).not.toContain("light_a");
    expect(serialized).not.toContain("light_b");
  });

  it("Unresolved segment view にも nodeId / locationText 不存在", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(), // 全 transition unresolved
      cascadeOptions: { providers: defaultProviders() },
    });

    for (const outcome of result.segmentsByTransitionKey.values()) {
      if (outcome.ok) {
        const keys = Object.keys(outcome.segment);
        expect(keys).not.toContain("fromNodeId");
        expect(keys).not.toContain("toNodeId");
        expect(keys).not.toContain("fromLocationText");
        expect(keys).not.toContain("toLocationText");
        // unresolved の期待 field のみ
        if (outcome.segment.timingStatus === "unresolved") {
          expect(keys.sort()).toEqual(["timingStatus", "transitionIndex", "unresolvedReason"].sort());
        }
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Critical addition: privacy assertion 関数化 (= CEO 追加条件)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("assertOverlayResultCompliance — runtime structural 機械保証", () => {
  it("正常な result は PASS", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });
    expect(() => assertOverlayResultCompliance(result)).not.toThrow();
  });

  it("transitionKey が L-3c 形式以外 → throw", () => {
    const segment: OverlaySegmentView = {
      timingStatus: "unresolved",
      transitionIndex: 0,
      unresolvedReason: "no_provider_available",
    };
    const outcome: OverlayTransitionOutcome = { ok: true, segment, trace: { attemptedProviders: [], decidedBy: "none" } };
    const badResult: OverlayResult = {
      segmentsByTransitionKey: new Map([["transition_0_light_a_light_b", outcome]]),
      resolvedCount: 0,
      unresolvedCount: 1,
      internalErrorCount: 0,
    };
    expect(() => assertOverlayResultCompliance(badResult)).toThrow(OverlayPrivacyAssertionError);
  });

  it("segment view に fromNodeId field が混入 → throw", () => {
    const badSegment = {
      timingStatus: "resolved" as const,
      transitionIndex: 0,
      estimatedDurationMin: 25,
      modeCandidate: { mode: "unknown" as const, confidence: { level: "low" as const, reason: "heuristic_distance_only" as const } },
      source: "heuristic_distance" as const,
      confidence: { level: "low" as const, reason: "heuristic_distance_only" as const },
      privacyClass: "normal" as const,
      // PII 混入を simulate
      fromNodeId: "evt_a",
    } as unknown as OverlaySegmentView;

    const outcome: OverlayTransitionOutcome = { ok: true, segment: badSegment, trace: { attemptedProviders: ["heuristic_distance"], decidedBy: "heuristic_distance" } };
    const badResult: OverlayResult = {
      segmentsByTransitionKey: new Map([["transition_0", outcome]]),
      resolvedCount: 1,
      unresolvedCount: 0,
      internalErrorCount: 0,
    };
    expect(() => assertOverlayResultCompliance(badResult)).toThrow(OverlayPrivacyAssertionError);
  });

  it("segment view に fromLocationText 混入 → throw", () => {
    const badSegment = {
      timingStatus: "resolved" as const,
      transitionIndex: 0,
      estimatedDurationMin: 25,
      modeCandidate: { mode: "unknown" as const, confidence: { level: "low" as const, reason: "heuristic_distance_only" as const } },
      source: "heuristic_distance" as const,
      confidence: { level: "low" as const, reason: "heuristic_distance_only" as const },
      privacyClass: "normal" as const,
      fromLocationText: "新宿",
    } as unknown as OverlaySegmentView;

    const outcome: OverlayTransitionOutcome = { ok: true, segment: badSegment, trace: { attemptedProviders: ["heuristic_distance"], decidedBy: "heuristic_distance" } };
    const badResult: OverlayResult = {
      segmentsByTransitionKey: new Map([["transition_0", outcome]]),
      resolvedCount: 1,
      unresolvedCount: 0,
      internalErrorCount: 0,
    };
    expect(() => assertOverlayResultCompliance(badResult)).toThrow(OverlayPrivacyAssertionError);
  });

  it("violation 詳細が error メッセージに含まれる", () => {
    const segment: OverlaySegmentView = {
      timingStatus: "unresolved",
      transitionIndex: 0,
      unresolvedReason: "no_provider_available",
    };
    const badResult: OverlayResult = {
      segmentsByTransitionKey: new Map([["bogus_key", { ok: true, segment, trace: { attemptedProviders: [], decidedBy: "none" } }]]),
      resolvedCount: 0,
      unresolvedCount: 1,
      internalErrorCount: 0,
    };
    try {
      assertOverlayResultCompliance(badResult);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(OverlayPrivacyAssertionError);
      const e = err as OverlayPrivacyAssertionError;
      expect(e.violation).toBe("transition_key_format_violation");
      expect(e.message).toContain("[L-3c]");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Regression: L-3b に対する hardening が L-3 既存 161 test を破壊していないこと
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("L-3c regression: overlay 正常 path は引き続き動く", () => {
  it("MOVEMENT fixture + 全 coords → resolved 1 件、 PII 漏洩 0", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    expect(result.resolvedCount).toBe(1);
    expect(result.unresolvedCount).toBe(0);
    expect(result.internalErrorCount).toBe(0);

    // Resolved segment の必須 field
    const outcome = result.segmentsByTransitionKey.get("transition_0")!;
    expect(outcome.ok).toBe(true);
    if (outcome.ok && outcome.segment.timingStatus === "resolved") {
      expect(outcome.segment.source).toBe("heuristic_distance");
      expect(outcome.segment.transitionIndex).toBe(0);
      expect(outcome.segment.estimatedDurationMin).toBeGreaterThan(0);
    }
  });
});
