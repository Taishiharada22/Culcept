/**
 * DayGraph Integrity Contract — Phase 3-K (= K-1a)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §12
 *
 * 役割:
 *   DayGraph の構造的不変条件を機械検証する type-lock invariants。
 *   ProposalIntegrityContract と同思想。
 *
 * 不変条件:
 *   - nodes 時系列順 (= startTime 昇順)
 *   - StartNode 必ず 1 個 + 先頭
 *   - EndNode 必ず 1 個 + 末尾
 *   - cycle なし (= 線形 graph、 edges は consecutive node のみ)
 *   - EventNode の anchorId はすべて unique
 *   - edges は consecutive node の sequential 接続のみ
 *   - transitions の from/to は EventNode を参照
 *   - snapshotId deterministic
 *   - redaction enforced
 */

import { assertRedactionCompliance } from "./dayGraphRedactionContract";
import type { DayGraph } from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Contract definition
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DayGraphIntegrityContract {
  readonly nodesTimeOrdered: true;
  readonly singleStartNode: true;
  readonly singleEndNode: true;
  readonly startNodeFirst: true;
  readonly endNodeLast: true;
  readonly noCycle: true;
  readonly uniqueAnchorIds: true;
  readonly edgesSequentialOnly: true;
  readonly transitionsReferenceEventNodes: true;
  readonly snapshotIdNonEmpty: true;
  readonly redactionEnforced: true;
}

export const DAY_GRAPH_INTEGRITY_CONTRACT: DayGraphIntegrityContract = {
  nodesTimeOrdered: true,
  singleStartNode: true,
  singleEndNode: true,
  startNodeFirst: true,
  endNodeLast: true,
  noCycle: true,
  uniqueAnchorIds: true,
  edgesSequentialOnly: true,
  transitionsReferenceEventNodes: true,
  snapshotIdNonEmpty: true,
  redactionEnforced: true,
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Custom error class (= integrity violation を別 catch 可能)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export class DayGraphIntegrityError extends Error {
  override readonly name = "DayGraphIntegrityError";
  readonly violation: keyof DayGraphIntegrityContract;
  constructor(violation: keyof DayGraphIntegrityContract, detail: string) {
    super(`[DayGraphIntegrity] ${violation}: ${detail}`);
    this.violation = violation;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Compliance assertion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DayGraph の全 invariant を verify。 違反検出 → throw DayGraphIntegrityError。
 *
 * caller は通常 internal logic で呼ぶ (= production では try/catch で graceful)。
 */
export function assertDayGraphCompliance(
  graph: DayGraph,
  // contract は signature に含めるが、 v1.0 では DAY_GRAPH_INTEGRITY_CONTRACT 固定使用
  _contract: DayGraphIntegrityContract = DAY_GRAPH_INTEGRITY_CONTRACT,
): void {
  const { nodes, edges, transitions } = graph;

  // 1. nodes is non-empty (= 少なくとも start + end の 2 nodes)
  if (nodes.length < 2) {
    throw new DayGraphIntegrityError(
      "nodesTimeOrdered",
      `nodes.length must be >= 2 (= start + end at minimum)、 got ${nodes.length}`,
    );
  }

  // 2. StartNode 必ず 1 個
  const starts = nodes.filter((n) => n.kind === "start");
  if (starts.length !== 1) {
    throw new DayGraphIntegrityError(
      "singleStartNode",
      `expected exactly 1 StartNode, got ${starts.length}`,
    );
  }

  // 3. EndNode 必ず 1 個
  const ends = nodes.filter((n) => n.kind === "end");
  if (ends.length !== 1) {
    throw new DayGraphIntegrityError(
      "singleEndNode",
      `expected exactly 1 EndNode, got ${ends.length}`,
    );
  }

  // 4. StartNode 先頭
  if (nodes[0]!.kind !== "start") {
    throw new DayGraphIntegrityError(
      "startNodeFirst",
      `first node must be StartNode, got ${nodes[0]!.kind}`,
    );
  }

  // 5. EndNode 末尾
  if (nodes[nodes.length - 1]!.kind !== "end") {
    throw new DayGraphIntegrityError(
      "endNodeLast",
      `last node must be EndNode, got ${nodes[nodes.length - 1]!.kind}`,
    );
  }

  // 6. nodes 時系列順 (= startTime 昇順、 同 startTime 許容、 kind tie-break で確定)
  for (let i = 0; i < nodes.length - 1; i++) {
    if (nodes[i]!.startTime > nodes[i + 1]!.startTime) {
      throw new DayGraphIntegrityError(
        "nodesTimeOrdered",
        `nodes not time-ordered at index ${i}: ${nodes[i]!.startTime} > ${nodes[i + 1]!.startTime}`,
      );
    }
  }

  // 7. cycle なし (= 同 id の node が複数ない、 unique node id)
  const nodeIdSet = new Set<string>();
  for (const n of nodes) {
    if (nodeIdSet.has(n.id)) {
      throw new DayGraphIntegrityError(
        "noCycle",
        `duplicate node id "${n.id}"`,
      );
    }
    nodeIdSet.add(n.id);
  }

  // 8. EventNode の anchorId は unique
  const anchorIdSet = new Set<string>();
  for (const n of nodes) {
    if (n.kind === "event") {
      if (anchorIdSet.has(n.anchorId)) {
        throw new DayGraphIntegrityError(
          "uniqueAnchorIds",
          `duplicate anchorId "${n.anchorId}"`,
        );
      }
      anchorIdSet.add(n.anchorId);
    }
  }

  // 9. edges は consecutive node の sequential 接続のみ
  if (edges.length !== nodes.length - 1) {
    throw new DayGraphIntegrityError(
      "edgesSequentialOnly",
      `edges.length must be nodes.length - 1, got ${edges.length} vs ${nodes.length - 1}`,
    );
  }
  for (let i = 0; i < edges.length; i++) {
    const e = edges[i]!;
    if (e.kind !== "sequential") {
      throw new DayGraphIntegrityError(
        "edgesSequentialOnly",
        `edge at index ${i} kind="${e.kind}", expected "sequential"`,
      );
    }
    if (e.fromNodeId !== nodes[i]!.id || e.toNodeId !== nodes[i + 1]!.id) {
      throw new DayGraphIntegrityError(
        "edgesSequentialOnly",
        `edge at index ${i} does not match consecutive nodes: ` +
          `${e.fromNodeId}→${e.toNodeId} vs ${nodes[i]!.id}→${nodes[i + 1]!.id}`,
      );
    }
  }

  // 10. transitions の from/to は EventNode を参照
  const eventNodeIds = new Set(
    nodes.filter((n) => n.kind === "event").map((n) => n.id),
  );
  for (const t of transitions) {
    if (!eventNodeIds.has(t.fromNodeId)) {
      throw new DayGraphIntegrityError(
        "transitionsReferenceEventNodes",
        `transition.fromNodeId "${t.fromNodeId}" does not reference an EventNode`,
      );
    }
    if (!eventNodeIds.has(t.toNodeId)) {
      throw new DayGraphIntegrityError(
        "transitionsReferenceEventNodes",
        `transition.toNodeId "${t.toNodeId}" does not reference an EventNode`,
      );
    }
  }

  // 11. snapshotId non-empty
  if (typeof graph.snapshotId !== "string" || graph.snapshotId.length === 0) {
    throw new DayGraphIntegrityError(
      "snapshotIdNonEmpty",
      `snapshotId must be non-empty string`,
    );
  }

  // 12. redaction enforced (= 別 contract 委譲)
  assertRedactionCompliance(graph);
}
