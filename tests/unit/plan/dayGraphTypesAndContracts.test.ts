/**
 * Phase 3-K K-1a — Types + IntegrityContract + RedactionContract tests
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4 / §7 / §12
 *
 * 検証範囲:
 *   - type level export 整合
 *   - constants 値整合
 *   - DayGraphIntegrityContract: 12 invariant の各違反検出
 *   - DayGraphRedactionContract: 4 invariant の各違反検出
 *   - exhaustiveDayGraphNodeKindCheck の runtime error
 *
 * 不変原則:
 *   - LLM 不使用
 *   - pure (= no side effects)
 *   - no DB / API / network access
 */

import { describe, expect, it } from "vitest";

import {
  DAY_GRAPH_INTEGRITY_CONTRACT,
  DayGraphIntegrityError,
  assertDayGraphCompliance,
} from "@/lib/plan/dayGraph/dayGraphIntegrityContract";
import {
  DAY_GRAPH_REDACTION_CONTRACT,
  DayGraphRedactionError,
  assertRedactionCompliance,
} from "@/lib/plan/dayGraph/dayGraphRedactionContract";
import {
  DEFAULT_BOUNDARY_END_TIME,
  DEFAULT_BOUNDARY_START_TIME,
  DEFAULT_EVENT_DURATION_MIN,
  DEFAULT_MIN_GAP_MINUTES,
  SNAPSHOT_ID_VERSION,
  exhaustiveDayGraphNodeKindCheck,
  type DayGraph,
  type EndNode,
  type EventNode,
  type GapNode,
  type StartNode,
} from "@/lib/plan/dayGraph/dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeStartNode(overrides: Partial<StartNode> = {}): StartNode {
  return {
    id: "2026-05-22_start_0",
    kind: "start",
    origin: "implicit",
    startTime: "06:00",
    endTime: "06:00",
    durationMin: 0,
    timeBucket: "early_morning",
    boundaryRationale: { type: "default", timezone: "local" },
    ...overrides,
  };
}

function makeEndNode(overrides: Partial<EndNode> = {}): EndNode {
  return {
    id: "2026-05-22_end_0",
    kind: "end",
    origin: "implicit",
    startTime: "23:00",
    endTime: "23:00",
    durationMin: 0,
    timeBucket: "night",
    boundaryRationale: { type: "default", timezone: "local" },
    ...overrides,
  };
}

function makeEventNode(overrides: Partial<EventNode> = {}): EventNode {
  return {
    id: "anchor_a",
    kind: "event",
    origin: "explicit",
    startTime: "14:00",
    endTime: "15:00",
    durationMin: 60,
    timeBucket: "afternoon",
    anchorId: "anchor_a",
    displayLabel: "カフェ",
    title: "カフェ",
    locationText: "渋谷",
    verb: "eat",
    rigidity: "soft",
    latencyTolerance: "flexible",
    durationSource: "explicit",
    boundaryClipped: false,
    sensitive: false,
    overlapsWithNodeIds: [],
    ...overrides,
  };
}

function makeGapNode(overrides: Partial<GapNode> = {}): GapNode {
  return {
    id: "2026-05-22_gap_0",
    kind: "gap",
    origin: "implicit",
    startTime: "06:00",
    endTime: "14:00",
    durationMin: 480,
    timeBucket: "early_morning",
    sequence: 0,
    sensitiveProximity: false,
    ...overrides,
  } as GapNode;
}

function makeValidGraph(overrides: Partial<DayGraph> = {}): DayGraph {
  const start = makeStartNode();
  const event = makeEventNode();
  const end = makeEndNode();
  const nodes = [start, event, end];
  return {
    snapshotId: "daygraph:v1:2026-05-22:anchor_a:06:00-23:00:gap30",
    attributes: {
      date: "2026-05-22",
      dayMood: "light",
      anchorCount: 1,
      verbDistribution: {
        eat: 1, work: 0, rest: 0, move: 0, care: 0, social: 0, unknown: 0,
      },
      density: "sparse",
      timeBucketCoverage: new Set(["afternoon"]),
      hasOverlap: false,
      hasSensitive: false,
    },
    nodes,
    edges: [
      { fromNodeId: start.id, toNodeId: event.id, kind: "sequential" },
      { fromNodeId: event.id, toNodeId: end.id, kind: "sequential" },
    ],
    transitions: [],
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayGraph constants", () => {
  it("DEFAULT_BOUNDARY_START_TIME = '06:00'", () => {
    expect(DEFAULT_BOUNDARY_START_TIME).toBe("06:00");
  });

  it("DEFAULT_BOUNDARY_END_TIME = '23:00'", () => {
    expect(DEFAULT_BOUNDARY_END_TIME).toBe("23:00");
  });

  it("DEFAULT_MIN_GAP_MINUTES = 30", () => {
    expect(DEFAULT_MIN_GAP_MINUTES).toBe(30);
  });

  it("DEFAULT_EVENT_DURATION_MIN = 60 (= v1.1 §22.2)", () => {
    expect(DEFAULT_EVENT_DURATION_MIN).toBe(60);
  });

  it("SNAPSHOT_ID_VERSION = 'v1'", () => {
    expect(SNAPSHOT_ID_VERSION).toBe("v1");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IntegrityContract — valid graph
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayGraphIntegrityContract — valid graph passes", () => {
  it("minimum valid graph (start + event + end)", () => {
    const graph = makeValidGraph();
    expect(() => assertDayGraphCompliance(graph)).not.toThrow();
  });

  it("contract object 形式が正しい", () => {
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.nodesTimeOrdered).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.singleStartNode).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.singleEndNode).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.startNodeFirst).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.endNodeLast).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.noCycle).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.uniqueAnchorIds).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.edgesSequentialOnly).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.transitionsReferenceEventNodes).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.snapshotIdNonEmpty).toBe(true);
    expect(DAY_GRAPH_INTEGRITY_CONTRACT.redactionEnforced).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// IntegrityContract — violation detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayGraphIntegrityContract — violation detection", () => {
  it("nodes.length < 2 → throw", () => {
    const graph = makeValidGraph({ nodes: [makeStartNode()], edges: [] });
    expect(() => assertDayGraphCompliance(graph)).toThrow(DayGraphIntegrityError);
  });

  it("2 個の StartNode → singleStartNode 違反", () => {
    const start1 = makeStartNode({ id: "start_1" });
    const start2 = makeStartNode({ id: "start_2" });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start1, start2, end],
      edges: [
        { fromNodeId: start1.id, toNodeId: start2.id, kind: "sequential" },
        { fromNodeId: start2.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertDayGraphCompliance(graph)).toThrow(/singleStartNode/);
  });

  it("EndNode 0 個 → singleEndNode 違反", () => {
    const start = makeStartNode();
    const event = makeEventNode();
    const graph = makeValidGraph({
      nodes: [start, event],
      edges: [{ fromNodeId: start.id, toNodeId: event.id, kind: "sequential" }],
    });
    expect(() => assertDayGraphCompliance(graph)).toThrow(/singleEndNode/);
  });

  it("first node が start でない → startNodeFirst 違反", () => {
    const event = makeEventNode({ startTime: "05:00", endTime: "06:00" });
    const start = makeStartNode();
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [event, start, end],
      edges: [
        { fromNodeId: event.id, toNodeId: start.id, kind: "sequential" },
        { fromNodeId: start.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertDayGraphCompliance(graph)).toThrow(/startNodeFirst/);
  });

  it("last node が end でない → endNodeLast 違反", () => {
    const start = makeStartNode();
    const event = makeEventNode({ startTime: "23:30", endTime: "23:45" });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start, end, event],
      edges: [
        { fromNodeId: start.id, toNodeId: end.id, kind: "sequential" },
        { fromNodeId: end.id, toNodeId: event.id, kind: "sequential" },
      ],
    });
    expect(() => assertDayGraphCompliance(graph)).toThrow(/endNodeLast/);
  });

  it("nodes 時系列順違反 (= 例 event が start より前) → nodesTimeOrdered", () => {
    const start = makeStartNode({ startTime: "10:00" });
    const event = makeEventNode({ startTime: "09:00", endTime: "10:00" });
    const end = makeEndNode();
    // start を頭に置きつつ startTime 逆転
    const graph = makeValidGraph({
      nodes: [start, event, end],
      edges: [
        { fromNodeId: start.id, toNodeId: event.id, kind: "sequential" },
        { fromNodeId: event.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertDayGraphCompliance(graph)).toThrow(/nodesTimeOrdered/);
  });

  it("duplicate node id → noCycle 違反", () => {
    const start = makeStartNode({ id: "DUP" });
    const event = makeEventNode({ id: "DUP" });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start, event, end],
      edges: [
        { fromNodeId: start.id, toNodeId: event.id, kind: "sequential" },
        { fromNodeId: event.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertDayGraphCompliance(graph)).toThrow(/noCycle/);
  });

  it("duplicate anchorId → uniqueAnchorIds 違反", () => {
    const start = makeStartNode();
    const e1 = makeEventNode({ id: "e1", anchorId: "DUP", startTime: "10:00", endTime: "11:00" });
    const e2 = makeEventNode({ id: "e2", anchorId: "DUP", startTime: "14:00", endTime: "15:00" });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start, e1, e2, end],
      edges: [
        { fromNodeId: start.id, toNodeId: e1.id, kind: "sequential" },
        { fromNodeId: e1.id, toNodeId: e2.id, kind: "sequential" },
        { fromNodeId: e2.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertDayGraphCompliance(graph)).toThrow(/uniqueAnchorIds/);
  });

  it("edges.length が nodes.length - 1 と異なる → edgesSequentialOnly 違反", () => {
    const graph = makeValidGraph({ edges: [] }); // 期待 2、 実 0
    expect(() => assertDayGraphCompliance(graph)).toThrow(/edgesSequentialOnly/);
  });

  it("transition が EventNode 以外を参照 → transitionsReferenceEventNodes 違反", () => {
    const graph = makeValidGraph();
    const badGraph: DayGraph = {
      ...graph,
      transitions: [
        {
          fromNodeId: graph.nodes[0]!.id, // = StartNode
          toNodeId: graph.nodes[1]!.id,   // = EventNode
          timingStatus: "unresolved",
          sensitiveProximity: false,
        },
      ],
    };
    expect(() => assertDayGraphCompliance(badGraph)).toThrow(/transitionsReferenceEventNodes/);
  });

  it("snapshotId が空文字列 → snapshotIdNonEmpty 違反", () => {
    const graph = makeValidGraph({ snapshotId: "" });
    expect(() => assertDayGraphCompliance(graph)).toThrow(/snapshotIdNonEmpty/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RedactionContract — valid + violation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayGraphRedactionContract — valid graph passes", () => {
  it("非 sensitive event は title / locationText 保持可", () => {
    const graph = makeValidGraph();
    expect(() => assertRedactionCompliance(graph)).not.toThrow();
  });

  it("sensitive event は title / locationText が undefined なら OK", () => {
    const start = makeStartNode();
    const sens = makeEventNode({
      id: "anchor_s",
      anchorId: "anchor_s",
      displayLabel: "予定 (= 医療系)",
      title: undefined,
      locationText: undefined,
      sensitive: true,
      sensitiveCategory: "medical",
    });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start, sens, end],
      edges: [
        { fromNodeId: start.id, toNodeId: sens.id, kind: "sequential" },
        { fromNodeId: sens.id, toNodeId: end.id, kind: "sequential" },
      ],
      attributes: { ...makeValidGraph().attributes, hasSensitive: true },
    });
    expect(() => assertRedactionCompliance(graph)).not.toThrow();
  });

  it("contract object 形式が正しい", () => {
    expect(DAY_GRAPH_REDACTION_CONTRACT.sensitiveTitleHidden).toBe(true);
    expect(DAY_GRAPH_REDACTION_CONTRACT.sensitiveLocationHidden).toBe(true);
    expect(DAY_GRAPH_REDACTION_CONTRACT.displayLabelAlwaysPresent).toBe(true);
    expect(DAY_GRAPH_REDACTION_CONTRACT.sensitiveTransitionLocationHidden).toBe(true);
  });
});

describe("DayGraphRedactionContract — violation detection", () => {
  it("sensitive=true で title 残存 → sensitiveTitleHidden 違反", () => {
    const start = makeStartNode();
    const bad = makeEventNode({
      sensitive: true,
      title: "MRI 予約", // ← 漏れている
      locationText: undefined,
      displayLabel: "予定 (= 医療系)",
    });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start, bad, end],
      edges: [
        { fromNodeId: start.id, toNodeId: bad.id, kind: "sequential" },
        { fromNodeId: bad.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertRedactionCompliance(graph)).toThrow(DayGraphRedactionError);
    expect(() => assertRedactionCompliance(graph)).toThrow(/sensitiveTitleHidden/);
  });

  it("sensitive=true で locationText 残存 → sensitiveLocationHidden 違反", () => {
    const start = makeStartNode();
    const bad = makeEventNode({
      sensitive: true,
      title: undefined,
      locationText: "○○病院", // ← 漏れている
      displayLabel: "予定 (= 医療系)",
    });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start, bad, end],
      edges: [
        { fromNodeId: start.id, toNodeId: bad.id, kind: "sequential" },
        { fromNodeId: bad.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertRedactionCompliance(graph)).toThrow(/sensitiveLocationHidden/);
  });

  it("displayLabel 空文字 → displayLabelAlwaysPresent 違反", () => {
    const start = makeStartNode();
    const bad = makeEventNode({ displayLabel: "" });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start, bad, end],
      edges: [
        { fromNodeId: start.id, toNodeId: bad.id, kind: "sequential" },
        { fromNodeId: bad.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertRedactionCompliance(graph)).toThrow(/displayLabelAlwaysPresent/);
  });

  it("sensitiveProximity transition で fromLocationText 残存 → sensitiveTransitionLocationHidden", () => {
    const start = makeStartNode();
    const e1 = makeEventNode({ id: "e1", anchorId: "e1", sensitive: true, title: undefined, locationText: undefined, displayLabel: "予定 (= 医療系)" });
    const e2 = makeEventNode({ id: "e2", anchorId: "e2", startTime: "16:00", endTime: "17:00" });
    const end = makeEndNode();
    const badGraph = makeValidGraph({
      nodes: [start, e1, e2, end],
      edges: [
        { fromNodeId: start.id, toNodeId: e1.id, kind: "sequential" },
        { fromNodeId: e1.id, toNodeId: e2.id, kind: "sequential" },
        { fromNodeId: e2.id, toNodeId: end.id, kind: "sequential" },
      ],
      transitions: [
        {
          fromNodeId: e1.id,
          toNodeId: e2.id,
          timingStatus: "unresolved",
          fromLocationText: "○○病院", // ← 漏れている
          sensitiveProximity: true,
        },
      ],
    });
    expect(() => assertRedactionCompliance(badGraph)).toThrow(/sensitiveTransitionLocationHidden/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Exhaustive switch helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("exhaustiveDayGraphNodeKindCheck", () => {
  it("runtime で error を throw する", () => {
    // 型システムをだまして runtime fallback を発火させる
    expect(() => {
      exhaustiveDayGraphNodeKindCheck({ kind: "INVALID_KIND" } as never);
    }).toThrow(/exhaustive/);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// assertDayGraphCompliance triggers redaction check
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("assertDayGraphCompliance — integrity + redaction 両方検証", () => {
  it("redaction 違反でも assertDayGraphCompliance が catch", () => {
    const start = makeStartNode();
    const bad = makeEventNode({
      sensitive: true,
      title: "MRI 予約",
      locationText: undefined,
      displayLabel: "予定 (= 医療系)",
    });
    const end = makeEndNode();
    const graph = makeValidGraph({
      nodes: [start, bad, end],
      edges: [
        { fromNodeId: start.id, toNodeId: bad.id, kind: "sequential" },
        { fromNodeId: bad.id, toNodeId: end.id, kind: "sequential" },
      ],
    });
    expect(() => assertDayGraphCompliance(graph)).toThrow(DayGraphRedactionError);
  });
});
