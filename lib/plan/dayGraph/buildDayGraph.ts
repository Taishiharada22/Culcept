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
import { fnv1a64Hex, canonicalSerialize } from "@/lib/plan/canonicalHash";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

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
 * anchor 内容 revision（RC2a-6A — content-aware identity の核 / DG0-A で provenance・privacy 境界を締めた）。
 *
 * v1 の snapshotId は anchor ID 集合しか見ず、**同一 ID 集合での時刻/場所/companions/rigidity 変更を
 * 拾えなかった**（→ RC2a identity chain が collide）。本関数は各 anchor の **content-relevant field** を
 * 正規化 projection して決定的 fingerprint 化する。
 *
 * 含める（content = 変われば derive 出力が変わりうる・grep で derive 読取を確認）:
 *   anchorKind / startTime / endTime / rigidity / locationCategory / locationText(hash) / title(hash) /
 *   sensitiveCategory / companions(hash) / **sourceId(hash)**。
 *   - **sourceId（DG0-A 追加）**: commitmentSignal.ts は `sourcesById.get(anchor.sourceId).sourceType==="manual"`
 *     で rigidity provenance（confidence 0.8/0.6・source known_from_user/derived）を決める → derive に効く。
 *     anchor の source 参照変更（re-sourcing）を捕捉するため hash で含める。
 *
 * 含めない（非 content / volatile — derive 読取 0 を grep で確認: lib/plan/{dayGraph,realityCore}）:
 *   id（既に anchorIds 集合に在る）/ userId / confirmedAt / confidence / externalUid / recurrence field
 *   （その日の startTime/endTime/ID 集合に解決済み）。
 *
 * privacy 境界（重要・FNV を privacy boundary と誤認しない — DG0-A 修正）:
 *   - locationText / title / companions / sourceId は **NFC 正規化 → fnv fingerprint** にしてから projection に入れ、
 *     snapshotId に **raw text を直接載せない**。
 *   - ただし **FNV64 は非暗号 fingerprint であって privacy guarantee ではない**。低エントロピーな場所名/人名/タイトルは
 *     hash でも辞書・相関・推測の余地が残る。「hash だから安全」とは言わない・raw 復元不能とも断定しない。
 *   - 由来 hash は **pseudonymous / sensitive-derived material** として扱う。snapshotId / dayGraphSnapshotId は
 *     **private-derived cache key**であり、debug/log/per-viewer/shared/external へ無制限露出しない。
 *   - 将来 persistent / public / shared / cross-viewer id に出す場合は **server-side secret salt / HMAC / stronger
 *     digest を再裁定**する（本 fingerprint のまま出さない）。
 *   - hash 同一は内容同一の証明ではない（cache key であって proof ではない）。
 *
 * 由来 boundary（DG0-A 明記・別 slice）: rigidity provenance は `sourcesById.get(sourceId).sourceType` に依存する。
 *   sourceId 変更（re-sourcing）は本 revision が捕捉するが、**同一 sourceId のまま source RECORD の sourceType を
 *   編集する変化**は anchor field ではなく sources-map の変化のため本 revision に乗らない（sources は buildDayGraph の
 *   入力でもない）。実運用上 sourceType は source 単位で実質不変だが、sources を identity chain に配線する際に
 *   sources-map revision として別途扱う。
 *
 * projection 最小仕様（固定・test で pin）:
 *   - canonicalSerialize（object key sort・finite number のみ・NaN/Date/BigInt は throw）を使う。
 *   - 各 anchor は **id で sort**（array index / 入力順に非依存）。companions も **sort**。
 *   - free-text は **NFC 正規化**してから hash。volatile runtime timestamp（confirmedAt 等）は入れない。
 */
export function computeAnchorContentRevision(anchors: ReadonlyArray<ExternalAnchor>): string {
  const projection = [...anchors]
    .map((a) => ({
      id: a.id,
      k: a.anchorKind,
      s: a.startTime,
      e: a.endTime ?? null,
      r: a.rigidity,
      lc: a.locationCategory ?? null,
      lh: a.locationText ? fnv1a64Hex(a.locationText.normalize("NFC")) : null,
      th: fnv1a64Hex(a.title.normalize("NFC")),
      sc: a.sensitiveCategory ?? null,
      ch:
        a.companions && a.companions.length > 0
          ? fnv1a64Hex(canonicalSerialize([...a.companions].map((c) => c.normalize("NFC")).sort()))
          : null,
      sid: fnv1a64Hex(a.sourceId), // source 参照（sourceType→rigidity provenance に効く・re-sourcing 検出）
    }))
    .sort((x, y) => x.id.localeCompare(y.id));
  return fnv1a64Hex(canonicalSerialize(projection));
}

/**
 * snapshotId 計算 (= 設計 §9、 deterministic string key)。
 *
 * 形式（v2・RC2a-6A）: "daygraph:v2:${date}:${sortedAnchorIds}:${startTime}-${endTime}:gap${minGapMinutes}:c${contentRevision}"
 *   末尾 c<hash> = computeAnchorContentRevision（anchor 内容変化を拾う・raw text は含まない opaque hash）。
 */
export function computeSnapshotId(input: {
  readonly date: string;
  readonly anchorIds: ReadonlyArray<string>;
  readonly startTime: string;
  readonly endTime: string;
  readonly minGapMinutes: number;
  readonly contentRevision: string;
}): string {
  const sortedIds = [...input.anchorIds].sort().join(",");
  return [
    "daygraph",
    SNAPSHOT_ID_VERSION,
    input.date,
    sortedIds,
    `${input.startTime}-${input.endTime}`,
    `gap${input.minGapMinutes}`,
    `c${input.contentRevision}`,
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
      contentRevision: computeAnchorContentRevision([]), // valid event なし → 空 content
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

  // 10. snapshotId（content-aware — RC2a-6A）。content revision は valid event に対応する anchor のみで計算
  const validAnchorIds = new Set(events.map((e) => e.anchorId));
  const validAnchors = input.anchors.filter((a) => validAnchorIds.has(a.id));
  const snapshotId = computeSnapshotId({
    date: input.date,
    anchorIds: events.map((e) => e.anchorId),
    startTime: startNode.startTime,
    endTime: endNode.startTime,
    minGapMinutes,
    contentRevision: computeAnchorContentRevision(validAnchors),
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
