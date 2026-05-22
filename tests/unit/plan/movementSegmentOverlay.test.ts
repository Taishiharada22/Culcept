/**
 * Phase 3-L L-3b (pure) — movementSegmentOverlay tests
 *
 * 設計書: docs/alter-plan-phase3-l-3-readiness-audit.md §2.4
 *
 * 検証範囲 (= GPT 補正 6 件 + 自律補強 5 件):
 *   §1. transitionKey (= B1)
 *       - K view と同形式: `transition_${index}_${fromNodeId}_${toNodeId}`
 *
 *   §2. K phase 既存 fixtures 全件 overlay 通過 (= K compat)
 *       - EMPTY / SINGLE / LIGHT / HEAVY / MOVEMENT / SENSITIVE / OVERLAP
 *       - 全 fixture で overlay 完走 (= internal_error 0)
 *
 *   §3. Graph immutability runtime assertion (= B3、 GPT 補正 4)
 *       - overlay 実行前後で snapshotId 不変
 *       - graph.nodes / edges / transitions 参照同一性 (= 浅い読み取り)
 *
 *   §4. Privacy structural (= C1)
 *       - OverlayResult type には title / locationText / userId / anchorId field なし
 *       - segmentsByTransitionKey の値も PII を持たない
 *
 *   §5. Missing coords → unresolved (= GPT 補正 2)
 *       - coordsByAnchorId 空 → 全 transition unresolved
 *
 *   §6. sensitiveProximity → unresolved (= GPT 補正 3)
 *       - SENSITIVE fixture の sensitive 跨ぎ transition は unresolved
 *
 *   §7. Per-transition isolation (= B2、 GPT 補正 6)
 *       - 1 transition の provider throw が他 transitions に伝搬しない
 *
 *   §8. Resolved scenarios (= happy path)
 *       - coords + override 揃いで resolved 生成
 *       - 集計 (resolvedCount / unresolvedCount) 正確
 *
 *   §9. Forward compat (= F1)
 *       - tracingId passthrough
 *
 * 不変原則:
 *   - LLM 不使用 / API 不使用 / geocode 不使用 / localStorage 不使用 / network 不使用
 *   - K phase 既存 file 変更 0
 *   - buildDayGraph は無変更で利用 (= 同期 pure)
 */

import { describe, expect, it, vi } from "vitest";

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { createHeuristicDistanceProvider } from "@/lib/plan/transport/heuristicDistanceProvider";
import { createManualUserProvider } from "@/lib/plan/transport/manualUserProvider";
import { createUnresolvedProvider } from "@/lib/plan/transport/unresolvedProvider";
import {
  buildTransitionKey,
  resolveMovementSegmentOverlay,
  type OverlayInput,
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
  ["move_morning", SHIBUYA],   // 渋谷
  ["move_afternoon", SHINJUKU], // 新宿
  ["move_evening", SHINJUKU],   // 新宿 (= same as afternoon)
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
// §1. transitionKey (= 自律補強 B1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§1. transitionKey (= K view と同形式)", () => {
  it("buildTransitionKey は K の MovementTransitionView.key と同 pattern を生成する", () => {
    const transition = {
      fromNodeId: "evt_a",
      toNodeId: "evt_b",
      timingStatus: "unresolved" as const,
      sensitiveProximity: false,
    };
    expect(buildTransitionKey(transition, 0)).toBe("transition_0_evt_a_evt_b");
    expect(buildTransitionKey(transition, 5)).toBe("transition_5_evt_a_evt_b");
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
        coordsByAnchorId: new Map(), // 全 transition coords なし → unresolved
        cascadeOptions: { providers: defaultProviders() },
      };
      const result = await resolveMovementSegmentOverlay(input);
      expect(result.internalErrorCount).toBe(0);
      // segmentsByTransitionKey 個数 = graph.transitions 個数
      expect(result.segmentsByTransitionKey.size).toBe(graph.transitions.length);
      // 全 transitionKey の outcome は ok=true (= cascade 通過、 internal_error なし)
      for (const outcome of result.segmentsByTransitionKey.values()) {
        expect(outcome.ok).toBe(true);
      }
    });
  }
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3. Graph immutability runtime assertion (= 自律補強 B3、 GPT 補正 4)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§3. Graph immutability — overlay は DayGraph を mutate しない", () => {
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
// §4. Privacy structural (= 自律補強 C1)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§4. Privacy structural — OverlayResult に PII field 不存在", () => {
  it("result の top-level field に title / locationText / userId / anchorId なし", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map(),
      cascadeOptions: { providers: defaultProviders() },
    });

    const keys = Object.keys(result).sort();
    // Allowed keys のみ存在 (= PII 不存在 structural)
    expect(keys).toEqual([
      "internalErrorCount",
      "resolvedCount",
      "segmentsByTransitionKey",
      "unresolvedCount",
    ]);
  });

  it("HEAVY fixture の overlay JSON に raw anchor title が含まれない", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: new Map([
        ["heavy_c", SHINJUKU],
        ["heavy_d", OFFICE_COORDS],
      ]),
      cascadeOptions: { providers: defaultProviders() },
    });

    const serialized = JSON.stringify(
      Array.from(result.segmentsByTransitionKey.entries()),
    );
    // HEAVY fixture の anchor title (= 朝会議 / 商談 / ランチ / 面接 / 夜会議) は overlay 出力に含まれない
    expect(serialized).not.toContain("朝会議");
    expect(serialized).not.toContain("商談");
    expect(serialized).not.toContain("ランチ");
    expect(serialized).not.toContain("面接");
    expect(serialized).not.toContain("夜会議");
  });

  it("SENSITIVE fixture の overlay 出力に sensitive raw title が含まれない", async () => {
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

    const serialized = JSON.stringify(
      Array.from(result.segmentsByTransitionKey.entries()),
    );
    expect(serialized).not.toContain("MRI 予約");
    expect(serialized).not.toContain("弁護士相談");
    expect(serialized).not.toContain("○○病院");
    expect(serialized).not.toContain("××法律事務所");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5. Missing coords → unresolved (= GPT 補正 2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§5. Missing coords — 全 transition unresolved (= GPT 補正 2)", () => {
  it("coordsByAnchorId 空 → MOVEMENT fixture の transition は全て unresolved", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    expect(graph.transitions.length).toBeGreaterThan(0); // pre-check

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
    const partialCoords = new Map([["light_a", SHINJUKU]]); // light_b の coords 欠落

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
// §6. sensitiveProximity → unresolved (= GPT 補正 3)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§6. sensitiveProximity — coords あっても unresolved (= GPT 補正 3)", () => {
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

    // SENSITIVE fixture の transitions は **全て sensitive proximity** (= 一方が sensitive)
    // → 全 transition unresolved
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
// §7. Per-transition isolation (= 自律補強 B2、 GPT 補正 6)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§7. Per-transition isolation — 1 transition の失敗は他に伝搬しない", () => {
  it("provider が throw しても他 transitions は健全に完了", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });

    // throw する provider を最初に置く + heuristic fallback
    const throwingProvider = makeFakeProvider("google_routes", async () => {
      throw new Error("simulated network failure");
    });
    const heuristic = createHeuristicDistanceProvider();

    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: [throwingProvider, heuristic] },
    });

    // throw は cascade 内で吸収、 cascade は heuristic に fallback
    // → overlay の internal_error は 0、 各 transition は ok=true
    expect(result.internalErrorCount).toBe(0);
    for (const outcome of result.segmentsByTransitionKey.values()) {
      expect(outcome.ok).toBe(true);
    }
  });

  it("複数 transition のうち 1 transition が internal_error でも残り continue", async () => {
    // 構造的に internal_error を起こすには graph 操作が必要。
    // ここでは graph の不正な transition (= node 不存在) を構築して overlay を呼ぶ。
    const { graph } = buildDayGraph({ anchors: LIGHT_DAY_ANCHORS, date: DATE });

    // graph に「存在しない fromNodeId」 を持つ transition を捏造して mutate-test 用に新 graph を作る
    // (= 元 graph を mutate せず、 新 graph を作って渡す)
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

    const result = await resolveMovementSegmentOverlay({
      graph: corruptedGraph,
      coordsByAnchorId: LIGHT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    // 1 つの transition は "from_anchor_id_missing" で fail、 残りは ok
    expect(result.internalErrorCount).toBe(1);
    expect(result.segmentsByTransitionKey.size).toBe(corruptedGraph.transitions.length);

    // 元の transition は全て ok
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
// §8. Resolved scenarios (= happy path、 集計)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§8. Resolved scenarios + 集計", () => {
  it("MOVEMENT fixture + 全 coords 揃い → heuristic で resolved", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    // MOVEMENT fixture: 3 anchors (渋谷→新宿→新宿) = transition 1 つ (新宿→新宿 は同一なので非生成)
    // 新宿→新宿は location 同じなので buildMovementTransitions で生成されない
    expect(graph.transitions.length).toBe(1);
    expect(result.resolvedCount).toBe(1);
    expect(result.unresolvedCount).toBe(0);

    const firstOutcome = Array.from(result.segmentsByTransitionKey.values())[0]!;
    expect(firstOutcome.ok).toBe(true);
    if (firstOutcome.ok && firstOutcome.segment.timingStatus === "resolved") {
      expect(firstOutcome.segment.source).toBe("heuristic_distance");
      expect(firstOutcome.segment.confidence.level).toBe("low");
      expect(firstOutcome.segment.modeCandidate.mode).toBe("unknown");
      expect(firstOutcome.segment.estimatedDurationMin).toBeGreaterThan(0);
    }
  });

  it("manual override 付き transition は manual_user で resolved", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });

    // 唯一の transition の key を取得
    const firstTransition = graph.transitions[0]!;
    const targetKey = buildTransitionKey(firstTransition, 0);
    const overrides = new Map<string, ManualOverride>([
      [targetKey, { userDurationMin: 33, userMode: "walking" }],
    ]);

    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      overridesByTransitionKey: overrides,
      cascadeOptions: { providers: defaultProviders() },
    });

    const outcome = result.segmentsByTransitionKey.get(targetKey)!;
    expect(outcome.ok).toBe(true);
    if (outcome.ok && outcome.segment.timingStatus === "resolved") {
      expect(outcome.segment.source).toBe("manual_user");
      expect(outcome.segment.estimatedDurationMin).toBe(33);
      expect(outcome.segment.modeCandidate.mode).toBe("walking");
    }
  });

  it("集計: resolvedCount + unresolvedCount + internalErrorCount = transitions.length", async () => {
    const { graph } = buildDayGraph({ anchors: HEAVY_DAY_ANCHORS, date: DATE });

    // 全 coords を OFFICE 固定 (= ≤0.2km 同地点 → heuristic_failed → unresolved)
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
// §9. Forward compat — tracingId passthrough (= 自律補強 F1)
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
// §10. transitionKey は K の MovementTransitionView.key と完全一致
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("§10. transitionKey の K view 互換", () => {
  it("各 transition について buildTransitionKey の出力が segmentsByTransitionKey の key と一致", async () => {
    const { graph } = buildDayGraph({ anchors: MOVEMENT_DAY_ANCHORS, date: DATE });
    const result = await resolveMovementSegmentOverlay({
      graph,
      coordsByAnchorId: MOVEMENT_COORDS,
      cascadeOptions: { providers: defaultProviders() },
    });

    graph.transitions.forEach((transition, index) => {
      const expectedKey = buildTransitionKey(transition, index);
      expect(result.segmentsByTransitionKey.has(expectedKey)).toBe(true);
    });
  });
});
