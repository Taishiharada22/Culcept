/**
 * DayGraph View Perspective — Phase 3-K (= K-1d)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §10
 *
 * 役割:
 *   同 DayGraph を view perspective ごとに異なる redaction level で返す pure helper。
 *
 * 不変原則:
 *   - pure (= input graph を mutate しない)
 *   - user_self: graph をそのまま返す (= EventNode 既に redacted、 displayLabel 安全)
 *   - shared_view: sensitive event の displayLabel を generic "予定" に置換
 *   - transition の sensitive proximity は既に redacted (= K-1c で対応済)
 */

import type {
  DayGraph,
  DayGraphNode,
  DayGraphView,
  EventNode,
} from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// View specific transformations
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * shared_view 向け sensitive event の displayLabel 置換。
 * 「医療系」「法務系」 等のカテゴリヒントも消し、 純粋な "予定" にする。
 */
function genericizeSensitiveEvent(node: EventNode): EventNode {
  if (!node.sensitive) return node;
  return {
    ...node,
    displayLabel: "予定",
    // sensitiveCategory も外す (= 他人が category 推測できないようにする)
    sensitiveCategory: undefined,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * user_self view: graph をそのまま返す。
 * EventNode は既に redacted、 displayLabel に sensitive 別 hint を含む。
 */
export function viewForUser(graph: DayGraph): DayGraph {
  return graph;
}

/**
 * shared_view: sensitive event の displayLabel を generic "予定" に置換。
 * sensitiveCategory も外し、 他人が category 推測できないようにする。
 * graph 自体は mutate せず、 新 DayGraph object を返す。
 */
export function viewForShared(graph: DayGraph): DayGraph {
  const newNodes: DayGraphNode[] = graph.nodes.map((n) => {
    if (n.kind === "event") return genericizeSensitiveEvent(n);
    return n;
  });
  return {
    ...graph,
    nodes: newNodes,
  };
}

/**
 * view enum から helper を選択する convenience。
 */
export function applyDayGraphView(graph: DayGraph, view: DayGraphView): DayGraph {
  switch (view) {
    case "user_self":
      return viewForUser(graph);
    case "shared_view":
      return viewForShared(graph);
  }
}
