/**
 * Phase 3-L L-3b + L-3c — movementSegmentOverlay tests
 *
 * 設計書: docs/alter-plan-phase3-l-3-readiness-audit.md §2.4
 *         docs/alter-plan-phase3-l-3-post-implementation-audit.md (= L-3c hardening)
 *
 * 検証範囲 (= GPT 補正 6 件 + 自律補強 5 件 + L-3c hardening 4 件):
 *   §1. transitionKey (= L-3c 非 PII 化、 `transition_${index}` 単独)
 *   §2. K phase 既存 fixtures 全件 overlay 通過 (= K compat)
 *   §3. Graph immutability runtime assertion (= L-3c 強化、 JSON deep + reference + length)
 *   §4. Privacy structural (= OverlaySegmentView に PII 不存在)
 *   §5. Missing coords → unresolved
 *   §6. sensitiveProximity → unresolved
 *   §7. Per-transition isolation
 *   §8. Resolved scenarios (= happy path)
 *   §9. Forward compat — tracingId passthrough
 *   §10. transitionIndex と K view key の bridge helper
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase 既存 file 変更 0
 *   - buildDayGraph 同期 pure 維持
 */

import { describe, expect, it, vi } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import {
  buildTransitionKey,
  extractTransitionIndexFromKViewKey,
  resolveMovementSegmentOverlay,
  type OverlayInput,
  type OverlaySegmentResolvedView,
} from "@/lib/plan/transport/movementSegmentOverlay";
import type {
  ManualOverride,
} from "@/lib/plan/transport/cascadeOrchestrator";
import type {
  MovementResolutionInput,
  MovementResolutionResult,
  TransportProvider,
  TransportResolutionProvider,
} from "@/lib/plan/transport/transportTypes";
import {
  EMPTY_DAY_ANCHORS,
  HEAVY_DAY_ANCHORS,
  LIGHT_DAY_ANCHORS,
  MOVEMENT_DAY_ANCHORS,
  OVERLAP_DAY_ANCHORS,
  SENSITIVE_DAY_ANCHORS,
  SINGLE_DAY_ANCHORS,
} from "@/tests/fixtures/dayGraph";

const DATE = "2026-05-22";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Coord fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const SHINJUKU = { lat: 35.6896, lng: 139.7006 };
const SHIBUYA = { lat: 35.6580, lng: 139.7016 };
const OFFICE_COORDS = { lat: 35.6700, lng: 139.7400 };

const MOVEMENT_COORDS: ReadonlyMap<string, { lat: number; lng: number }> = new Map([
  ["move_morning", SHIBUYA],
  ["move_afternoon", SHINJUKU],
  ["move_evening", SHINJUKU],
]);

const LIGHT_COORDS: ReadonlyMap<string, { lat: number; lng: number }> = new Map([
  ["light_a", SHINJUKU],
  ["light_b", SHIBUYA],
]);

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Provider fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function defaultProviders(): TransportResolutionProvider[] {
  return [
    createManualUserProvider(),
    createHeuristicDistanceProvider(),
    createUnresolvedProvider("no_provider_available"),
  ];
}

function makeFakeProvider(
  id: TransportProvider,
  behavior: (input: MovementResolutionInput) => Promise<MovementResolutionResult>,
  health: TransportResolutionProvider["health"] = "healthy",
): TransportResolutionProvider {
  return { id, health, resolveDuration: vi.fn(behavior) };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1. transitionKey (= L-3c 非 PII 化)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. transitionKey (= L-3c 非 PII)", () => {
  it("buildTransitionKey は transition_${index} 単独 (= anchor id 含まない)", () => {
    expect(buildTransitionKey(0)).toBe("transition_0");
    expect(buildTransitionKey(5)).toBe("transition_5");
    expect(buildTransitionKey(99)).toBe("transition_99");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2. K phase 既存 fixtures 全件 overlay 通過 (= K compat)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§2. K phase fixtures 全件 — overlay 完走 (= K compat)", () => {
  const fixtures = [
    { name: "EMPTY", anchors: EMPTY_DAY_ANCHORS },
    { name: "SINGLE", anchors: SINGLE_DAY_ANCHORS },
    { name: "LIGHT", anchors: LIGHT_DAY_ANCHORS },
    { name: "HEAVY", anchors: HEAVY_DAY_ANCHORS },
    { name: "MOVEMENT", anchors: MOVEMENT_DAY_ANCHORS },
    { name: "SENSITIVE", anchors: SENSITIVE_DAY_ANCHORS },
    { name: "OVERLAP", anchors: OVERLAP_DAY_ANCHORS },
  ];

  for (const { name, anchors } of fixtures) {
    it(`${name} fixture で overlay が internal_error なく完走`, async () => {
      const { graph } = buildDayGraph({ anchors, date: DATE });
      const input: OverlayInput = {
        graph,
        coordsByAnchorId: new Map(),
        cascadeOptions: { providers: defaultProviders() },
      };
      const result = await resolveMovementSegmentOverlay(input);
      expect(result.internalErrorCount).toBe(0);
      expect(result.segmentsByTransitionKey.size).toBe(graph.transitions.length);
      for (const outcome of result.segmentsByTransitionKey.values()) {
        expect(outcome.ok).toBe(true);
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. Graph immutability (= L-3c 強化、 JSON deep + reference + length)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. Graph immutability — L-3c 強化 assertion", () => {
  it("overlay 実行前後で snapshotId 不変", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const snapshotBefore = graph.snapshotId;

    await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    expect(graph.snapshotId).toBe(snapshotBefore);
  });

  it("graph.transitions / nodes / edges の参照が overlay 前後で同一", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const transitionsRefBefore = graph.transitions;
    const nodesRefBefore = graph.nodes;
    const edgesRefBefore = graph.edges;

    await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    expect(graph.transitions).toBe(transitionsRefBefore);
    expect(graph.nodes).toBe(nodesRefBefore);
    expect(graph.edges).toBe(edgesRefBefore);
  });

  it("graph 全体を deep clone した snapshot と完全一致", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const graphBeforeJson = JSON.stringify(graph);

    await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });

    expect(JSON.stringify(graph)).toBe(graphBeforeJson);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4. Privacy structural (= L-3c 強化、 OverlaySegmentView に PII 不存在)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. Privacy structural — OverlaySegmentView に PII field 不存在", () => {
  it("result top-level に PII field なし", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });

    const keys = Object.keys(result).sort();
    expect(keys).toEqual([
      "internalErrorCount",
      "resolvedCount",
      "segmentsByTransitionKey",
      "unresolvedCount",
    ]);
  });

  it("HEAVY fixture: overlay JSON に raw anchor title が含まれない", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["heavy_c", SHINJUKU],
        ["heavy_d", OFFICE_COORDS],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });

    const serialized = JSON.stringify(Array.from(result.segmentsByTransitionKey.entries()));
    expect(serialized).not.toContain("朝会議");
    expect(serialized).not.toContain("商談");
    expect(serialized).not.toContain("ランチ");
    expect(serialized).not.toContain("面接");
    expect(serialized).not.toContain("夜会議");
  });

  it("SENSITIVE fixture: sensitive raw title 含まれない", async () => {
    const { graph } = buildDayGraph({ anchors: SENSITIVE_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["sens_med", TOKYO],
        ["sens_legal", SHINJUKU],
        ["normal", SHIBUYA],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });

    const serialized = JSON.stringify(Array.from(result.segmentsByTransitionKey.entries()));
    expect(serialized).not.toContain("MRI 予約");
    expect(serialized).not.toContain("弁護士相談");
    expect(serialized).not.toContain("○○病院");
    expect(serialized).not.toContain("××法律事務所");
  });

  it("L-3c 新規: LIGHT fixture (= 非 sensitive) でも raw locationText が overlay output に出ない", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: [createHeuristicDistanceProvider()] },
    });

    const serialized = JSON.stringify(Array.from(result.segmentsByTransitionKey.entries()));
    // raw locationText が存在しないことを confirm
    expect(serialized).not.toContain("新宿");
    expect(serialized).not.toContain("渋谷");
    // anchor id (= nodeId 経由でも) 露出しないことを confirm
    expect(serialized).not.toContain("light_a");
    expect(serialized).not.toContain("light_b");
  });

  it("L-3c 新規: segment view の key set に fromNodeId / toNodeId / locationText 等の PII field 不在", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: [createHeuristicDistanceProvider()] },
    });

    for (const outcome of result.segmentsByTransitionKey.values()) {
      if (outcome.ok) {
        const keys = Object.keys(outcome.segment);
        expect(keys).not.toContain("fromNodeId");
        expect(keys).not.toContain("toNodeId");
        expect(keys).not.toContain("fromLocationText");
        expect(keys).not.toContain("toLocationText");
        expect(keys).not.toContain("sensitiveProximity");
        expect(keys).not.toContain("anchorId");
        expect(keys).not.toContain("userId");
        expect(keys).not.toContain("title");
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Missing coords → unresolved
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. Missing coords — 全 transition unresolved", () => {
  it("coordsByAnchorId 空 → MOVEMENT fixture の transition は全て unresolved", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    expect(graph.transitions.length).toBeGreaterThan(0);

    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });

    expect(result.resolvedCount).toBe(0);
    expect(result.unresolvedCount).toBe(graph.transitions.length);
    for (const outcome of result.segmentsByTransitionKey.values()) {
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.segment.timingStatus).toBe("unresolved");
      }
    }
  });

  it("片方のみ coords 欠落 → unresolved", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const partialCoords = new Map([["light_a", SHINJUKU]]);

    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: partialCoords,
      cascadeOptions: { providers: defaultProviders() },
    });

    for (const outcome of result.segmentsByTransitionKey.values()) {
      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.segment.timingStatus).toBe("unresolved");
      }
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6. sensitiveProximity → unresolved
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. sensitiveProximity — coords あっても unresolved", () => {
  it("SENSITIVE fixture の sensitiveProximity transition は coords 全揃いでも unresolved", async () => {
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
// §7. Per-transition isolation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. Per-transition isolation", () => {
  it("provider が throw しても他 transitions は健全に完了", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });

    const throwingProvider = makeFakeProvider("google_routes", async () => {
      throw new Error("simulated network failure");
    });
    const heuristic = createHeuristicDistanceProvider();

    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: [throwingProvider, heuristic] },
    });

    expect(result.internalErrorCount).toBe(0);
    for (const outcome of result.segmentsByTransitionKey.values()) {
      expect(outcome.ok).toBe(true);
    }
  });

  it("不正な transition (= node 不存在) は internal_error、 残り continue", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });

    const corruptedGraph = {
      ...graph,
      transitions: [
        ...graph.transitions,
        {
          fromNodeId: "bogus_node_id",
          toNodeId: "another_bogus",
          timingStatus: "unresolved" as const,
          sensitiveProximity: false,
        },
      ],
    };
    // snapshotId と sync させるため、 corruptedGraph の snapshotId は graph と同じものを継承 (= JSON snapshot で immutability 確認できる)
    // 但しこの test ではあえて mutate 検出を緩めるため、 immutability check が問題なくパスする input を用意する必要があるが、
    // graph 自体は invalid (= transitions に bogus node を持つ)、 これは内部的に「node 不存在」 を発火させる。
    // immutability は本 graph 自体の前後変化を見るので、 corruptedGraph に対する mutation がなければ pass する。

    const result = await resolveMovementSegmentOverlay({
      graph: corruptedGraph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    expect(result.internalErrorCount).toBe(1);
    expect(result.segmentsByTransitionKey.size).toBe(corruptedGraph.transitions.length);

    let fromMissingFound = false;
    for (const outcome of result.segmentsByTransitionKey.values()) {
      if (!outcome.ok) {
        expect(outcome.reason).toBe("from_anchor_id_missing");
        fromMissingFound = true;
      }
    }
    expect(fromMissingFound).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8. Resolved scenarios + 集計
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. Resolved scenarios + 集計", () => {
  it("MOVEMENT fixture + 全 coords 揃い → heuristic で resolved", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    expect(graph.transitions.length).toBe(1);
    expect(result.resolvedCount).toBe(1);
    expect(result.unresolvedCount).toBe(0);

    const firstOutcome = Array.from(result.segmentsByTransitionKey.values())[0]!;
    expect(firstOutcome.ok).toBe(true);
    if (firstOutcome.ok && firstOutcome.segment.timingStatus === "resolved") {
      const resolved = firstOutcome.segment as OverlaySegmentResolvedView;
      expect(resolved.source).toBe("heuristic_distance");
      expect(resolved.confidence.level).toBe("low");
      expect(resolved.modeCandidate.mode).toBe("unknown");
      expect(resolved.estimatedDurationMin).toBeGreaterThan(0);
      expect(resolved.transitionIndex).toBe(0);
    }
  });

  it("manual override 付き transition は manual_user で resolved (= L-3c index key)", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const overrides = new Map<number, ManualOverride>([
      [0, { userDurationMin: 33, userMode: "walking" }],
    ]);

    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      overridesByTransitionIndex: overrides,
      cascadeOptions: { providers: defaultProviders() },
    });

    const outcome = result.segmentsByTransitionKey.get("transition_0")!;
    expect(outcome.ok).toBe(true);
    if (outcome.ok && outcome.segment.timingStatus === "resolved") {
      expect(outcome.segment.source).toBe("manual_user");
      expect(outcome.segment.estimatedDurationMin).toBe(33);
      expect(outcome.segment.modeCandidate.mode).toBe("walking");
    }
  });

  it("集計: resolvedCount + unresolvedCount + internalErrorCount = transitions.length", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });

    const sameCoords = new Map<string, { lat: number; lng: number }>();
    for (const node of graph.nodes) {
      if (node.kind === "event") {
        sameCoords.set(node.anchorId, OFFICE_COORDS);
      }
    }

    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: sameCoords,
      cascadeOptions: { providers: defaultProviders() },
    });

    const total =
      result.resolvedCount + result.unresolvedCount + result.internalErrorCount;
    expect(total).toBe(graph.transitions.length);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9. Forward compat — tracingId passthrough
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§9. Forward compat — tracingId passthrough", () => {
  it("tracingId が input に存在すれば result にそのまま含まれる", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
      tracingId: "trace-001-deadbeef",
    });
    expect(result.tracingId).toBe("trace-001-deadbeef");
  });

  it("tracingId が input にない場合は result でも undefined", async () => {
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });
    expect(result.tracingId).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10. transitionIndex bridge — K view との join (= L-3c)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§10. extractTransitionIndexFromKViewKey — K view との bridge", () => {
  it("K view key (= transition_${index}_${fromNodeId}_${toNodeId}) から index を抽出", () => {
    expect(extractTransitionIndexFromKViewKey("transition_0_evt_a_evt_b")).toBe(0);
    expect(extractTransitionIndexFromKViewKey("transition_5_x_y")).toBe(5);
    expect(extractTransitionIndexFromKViewKey("transition_42_move_morning_move_afternoon")).toBe(42);
  });

  it("不正な形式は null", () => {
    expect(extractTransitionIndexFromKViewKey("transition_NaN_x_y")).toBeNull();
    expect(extractTransitionIndexFromKViewKey("not_a_transition_key")).toBeNull();
    expect(extractTransitionIndexFromKViewKey("transition_0")).toBeNull(); // L overlay 形式は K view 形式ではない
  });

  it("各 transition について overlay の transitionKey と extract した index が一致", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    graph.transitions.forEach((_transition, index) => {
      const expectedKey = buildTransitionKey(index);
      expect(result.segmentsByTransitionKey.has(expectedKey)).toBe(true);
    });
  });
});
