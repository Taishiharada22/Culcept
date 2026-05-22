/**
 * buildDayGraph — Phase 3-K orchestration (= K-1e)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §6 / §9
 *
 * 役割:
 *   anchors + date + options から DayGraph (= 完成形) を生成する top-level pure 関数。
 *   各 K-1a〜K-1d helper を統合 + IntegrityContract 検証。
 *
 * 不変原則:
 *   - pure deterministic (= 同 input → 同 output)
 *   - anchor mutation なし
 *   - 永続化なし、 cache なし (= caller の useMemo で対応)
 *   - LLM 不使用
 *   - crypto 不使用 (= snapshotId は deterministic string)
 *
 * Step (= 設計 §6.2):
 *   1. options normalize
 *   2. start / end nodes
 *   3. boundary minutes parse + invariant check
 *   4. event nodes + warnings
 *   5. gap nodes
 *   6. movement transitions
 *   7. sequence all nodes (= 時系列順 + kind tie-break)
 *   8. edges (= consecutive sequential)
 *   9. attributes (= dayMood / verb / density / coverage / flags)
 *   10. snapshotId (= deterministic string)
 *   11. assertDayGraphCompliance (= invariant 検証)
 *   12. return { graph, warnings }
 */

import { computeDayGraphAttributes } from "./dayGraphAttributes";
import { assertDayGraphCompliance } from "./dayGraphIntegrityContract";
import {
  DEFAULT_MIN_GAP_MINUTES,
  SNAPSHOT_ID_VERSION,
  type BuildDayGraphInput,
  type BuildDayGraphResult,
  type DayGraph,
  type DayGraphEdge,
  type DayGraphNode,
  type DayGraphNodeKind,
  type DayGraphWarning,
  type EndNode,
  type EventNode,
  type GapNode,
  type StartNode,
} from "./dayGraphTypes";
import { buildEventNodesFromAnchors } from "./eventNodes";
import { buildGapNodes } from "./gapNodes";
import { buildMovementTransitions } from "./movementTransitions";
import { buildEndNode, buildStartNode } from "./startEndNodes";
import { parseHHMMtoMinutes } from "./timeFormat";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全 node を 1 配列に統合 + 時系列順 sort + kind tie-break。
 *
 * tie-break order (= 同 startTime 時):
 *   start (0) < event (1) < gap (2) < end (3)
 *
 * これにより StartNode は先頭、 EndNode は末尾を保証 (= IntegrityContract 整合)。
 */
function sequenceNodes(
  startNode: StartNode,
  eventNodes: ReadonlyArray<EventNode>,
  gapNodes: ReadonlyArray<GapNode>,
  endNode: EndNode,
): ReadonlyArray<DayGraphNode> {
  const kindOrder: Record<DayGraphNodeKind, number> = {
    start: 0,
    event: 1,
    gap: 2,
    end: 3,
  };
  const all: DayGraphNode[] = [startNode, ...eventNodes, ...gapNodes, endNode];
  return all.sort((a, b) => {
    const cmp = a.startTime.localeCompare(b.startTime);
    if (cmp !== 0) return cmp;
    return kindOrder[a.kind] - kindOrder[b.kind];
  });
}

/**
 * consecutive node に sequential edge を張る。
 */
function buildEdges(
  sortedNodes: ReadonlyArray<DayGraphNode>,
): ReadonlyArray<DayGraphEdge> {
  const edges: DayGraphEdge[] = [];
  for (let i = 0; i < sortedNodes.length - 1; i++) {
    edges.push({
      fromNodeId: sortedNodes[i]!.id,
      toNodeId: sortedNodes[i + 1]!.id,
      kind: "sequential",
    });
  }
  return edges;
}

/**
 * snapshotId 計算 (= 設計 §9、 deterministic string key)。
 *
 * 形式: "daygraph:v1:${date}:${sortedAnchorIds}:${startTime}-${endTime}:gap${minGapMinutes}"
 */
export function computeSnapshotId(input: {
  readonly date: string;
  readonly anchorIds: ReadonlyArray<string>;
  readonly startTime: string;
  readonly endTime: string;
  readonly minGapMinutes: number;
}): string {
  const sortedIds = [...input.anchorIds].sort().join(",");
  return [
    "daygraph",
    SNAPSHOT_ID_VERSION,
    input.date,
    sortedIds,
    `${input.startTime}-${input.endTime}`,
    `gap${input.minGapMinutes}`,
  ].join(":");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main orchestration
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function buildDayGraph(input: BuildDayGraphInput): BuildDayGraphResult {
  const warnings: DayGraphWarning[] = [];

  // 1. options normalize
  const options = input.options ?? {};
  const minGapMinutes = options.minGapMinutes ?? DEFAULT_MIN_GAP_MINUTES;

  // 2. start / end nodes
  const startNode = buildStartNode({
    date: input.date,
    startTime: options.startTime,
  });
  const endNode = buildEndNode({
    date: input.date,
    endTime: options.endTime,
  });

  // 3. boundary minutes parse (= invariant: startNode/endNode.startTime は valid)
  const startBoundMin = parseHHMMtoMinutes(startNode.startTime);
  const endBoundMin = parseHHMMtoMinutes(endNode.startTime);
  if (startBoundMin === null || endBoundMin === null || startBoundMin >= endBoundMin) {
    // Catastrophic: boundary 不正 → 空 graph + warning (= UI 側で graceful)
    warnings.push({
      kind: "anchor_outside_boundary",
      detail: `invalid boundary: start=${startNode.startTime}, end=${endNode.startTime}`,
    });
    // 安全な fallback graph (= start + end のみ)
    const emptyNodes = [startNode, endNode];
    const emptyEdges = [
      { fromNodeId: startNode.id, toNodeId: endNode.id, kind: "sequential" as const },
    ];
    const emptyAttributes = computeDayGraphAttributes({
      date: input.date,
      anchors: input.anchors,
      eventNodes: [],
    });
    const emptySnapshotId = computeSnapshotId({
      date: input.date,
      anchorIds: [],
      startTime: startNode.startTime,
      endTime: endNode.startTime,
      minGapMinutes,
    });
    const fallbackGraph: DayGraph = {
      snapshotId: emptySnapshotId,
      attributes: emptyAttributes,
      nodes: emptyNodes,
      edges: emptyEdges,
      transitions: [],
    };
    return { graph: fallbackGraph, warnings };
  }

  // 4. event nodes (= warnings 集約)
  const { events, warnings: eventWarnings } = buildEventNodesFromAnchors({
    anchors: input.anchors,
    bounds: { startMin: startBoundMin, endMin: endBoundMin },
  });
  warnings.push(...eventWarnings);

  // 5. gap nodes
  const gaps = buildGapNodes({
    startNode,
    eventNodes: events,
    endNode,
    date: input.date,
    minGapMinutes,
  });

  // 6. movement transitions
  const transitions = buildMovementTransitions(events);

  // 7. sequence all nodes
  const allNodes = sequenceNodes(startNode, events, gaps, endNode);

  // 8. edges
  const edges = buildEdges(allNodes);

  // 9. attributes
  const attributes = computeDayGraphAttributes({
    date: input.date,
    anchors: input.anchors,
    eventNodes: events,
  });

  // 10. snapshotId
  const snapshotId = computeSnapshotId({
    date: input.date,
    anchorIds: events.map((e) => e.anchorId),
    startTime: startNode.startTime,
    endTime: endNode.startTime,
    minGapMinutes,
  });

  // 11. graph 構築
  const graph: DayGraph = {
    snapshotId,
    attributes,
    nodes: allNodes,
    edges,
    transitions,
  };

  // 12. integrity + redaction 検証 (= throws on violation)
  // production では caller 側で try/catch して graceful degradation 可能。
  // 設計上 K helper の出力は assert を通る前提のため、 violation は internal bug。
  assertDayGraphCompliance(graph);

  return { graph, warnings };
}
