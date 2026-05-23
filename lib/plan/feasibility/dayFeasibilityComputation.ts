/**
 * Phase 3-M-1 (pure) — Day Feasibility Computation Helper
 *
 * 役割:
 *   K phase DayGraph + L phase OverlayResult から各 transition の余白 / 不足を計算し、
 *   `DayFeasibilityResult` を返す pure function。
 *
 * Step (= per transition):
 *   1. overlay outcome が ok=false (= internal_error) → status "not_applicable"
 *   2. overlay segment が unresolved → status "not_applicable"
 *   3. resolved な場合:
 *      a. K phase の graph.transitions から該当 transition (= 同 index) を取得
 *      b. transition.fromNodeId / toNodeId に対応する EventNode を graph.nodes から取得
 *      c. 前 EventNode (= fromNode) の endTime と 次 EventNode (= toNode) の startTime を分換算
 *      d. parse 失敗 → status "not_applicable" (= 安全側)
 *      e. availableMin = next startMin - prev endMin
 *      f. durationMin = MovementSegmentResolved.estimatedDurationMin
 *         (= overlay の内部 MovementSegment、 OverlaySegmentView では sanitize 済だが
 *          MovementSegment 自体は L overlay 内部に保持されている。 但し L-3c では
 *          OverlayResult.segmentsByTransitionKey の outcome.segment が OverlaySegmentView
 *          なので、 そこに含まれる estimatedDurationMin を読む。 これは L-3c で公開された field)
 *      g. slack = availableMin - durationMin
 *      h. slack >= 0 → status "sufficient", slackMin = slack
 *         slack < 0  → status "insufficient", shortfallMin = -slack
 *
 * 純度保証:
 *   - 副作用なし (= no DB, no API, no console, no localStorage)
 *   - input mutation なし (= graph / overlayResult を読み取りのみ)
 *   - deterministic (= 同じ input → 同じ output)
 *
 * 思想:
 *   - Day Feasibility Truth Layer (= K / L の上の 3 段目)
 *   - 観測のみ、 推奨 / 警告 / 評価しない
 *   - 「不足」 と「警告」 の明示分離 (= 「不足 N 分」 は事実の表記)
 *
 * M-1-pure scope:
 *   - LLM 不使用 / no DB / no UI / no API / no localStorage / no telemetry sink
 *   - K phase / L 既存 file 改変 0
 *
 * 参照:
 *   - docs/alter-plan-phase3-m-readiness-audit.md §4.3
 *   - lib/plan/dayGraph/dayGraphTypes.ts (= K phase 読み取り)
 *   - lib/plan/transport/movementSegmentOverlay.ts (= L-3c OverlayResult 読み取り)
 *   - lib/plan/transport/transportTypes.ts (= L-1、 OverlaySegmentResolvedView の field)
 */

import type {
  DayGraph,
  EventNode,
} from "@/lib/plan/dayGraph/dayGraphTypes";
import { parseHHMMtoMinutes } from "@/lib/plan/dayGraph/timeFormat";
import type {
  OverlayResult,
  OverlaySegmentResolvedView,
  OverlaySegmentView,
} from "@/lib/plan/transport/movementSegmentOverlay";

import { assertDayFeasibilityResultCompliance } from "./feasibilityIntegrityContract";
import type {
  DayFeasibilityResult,
  FeasibilitySlackView,
} from "./feasibilityTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Internal helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * graph.nodes から EventNode (= id 一致) を逆引きする pure helper。
 *
 * 注: K phase 不変条件で `EventNode.id === EventNode.anchorId`。
 *      transition.fromNodeId / toNodeId は EventNode.id (= anchor id) と一致。
 */
function findEventNodeById(graph: DayGraph, nodeId: string): EventNode | undefined {
  for (const node of graph.nodes) {
    if (node.kind === "event" && node.id === nodeId) {
      return node;
    }
  }
  return undefined;
}

/**
 * not_applicable view を構築する helper。
 */
function notApplicable(transitionIndex: number): FeasibilitySlackView {
  return {
    transitionIndex,
    status: "not_applicable",
  };
}

/**
 * 単一 transition の feasibility を計算する pure helper。
 *
 * @param graph K phase DayGraph
 * @param overlaySegment L overlay の OverlaySegmentView (= unresolved / resolved)
 * @param transitionIndex L-3c の non-PII ordinal
 * @param fromNodeId K phase transition の from
 * @param toNodeId K phase transition の to
 *
 * @returns FeasibilitySlackView (= sufficient / insufficient / not_applicable)
 */
function computeSingleTransitionFeasibility(
  graph: DayGraph,
  overlaySegment: OverlaySegmentView,
  transitionIndex: number,
  fromNodeId: string,
  toNodeId: string,
): FeasibilitySlackView {
  // (2) overlay が unresolved → not_applicable
  if (overlaySegment.timingStatus !== "resolved") {
    return notApplicable(transitionIndex);
  }

  const resolvedSegment = overlaySegment as OverlaySegmentResolvedView;

  // (3a-b) fromNode / toNode の取得
  const fromNode = findEventNodeById(graph, fromNodeId);
  const toNode = findEventNodeById(graph, toNodeId);

  if (!fromNode || !toNode) {
    // node 不在 (= K phase の不整合等) → 安全側 not_applicable
    return notApplicable(transitionIndex);
  }

  // (3c-d) 時刻を分換算 (= parse 失敗時は not_applicable)
  const prevEndMin = parseHHMMtoMinutes(fromNode.endTime);
  const nextStartMin = parseHHMMtoMinutes(toNode.startTime);

  if (prevEndMin === null || nextStartMin === null) {
    return notApplicable(transitionIndex);
  }

  // (3e) availableMin = next startMin - prev endMin
  //    next startMin < prev endMin (= 時系列逆転、 K phase で起こり得ないが防御)
  //    の場合は negative になるが、 そのまま slack 計算に流す (= insufficient として扱われる)
  const availableMin = nextStartMin - prevEndMin;

  // (3f) durationMin = OverlaySegmentResolvedView の estimatedDurationMin
  const durationMin = resolvedSegment.estimatedDurationMin;
  if (!Number.isFinite(durationMin) || durationMin < 0) {
    // 防御 (= L-1 で保証済だが)
    return notApplicable(transitionIndex);
  }

  // (3g-h) slack = availableMin - durationMin
  const slack = availableMin - durationMin;
  // 表示用に round (= 整数化、 caller の UI 表示で readable)
  const slackRounded = Math.round(slack);

  if (slackRounded >= 0) {
    return {
      transitionIndex,
      status: "sufficient",
      slackMin: slackRounded,
    };
  }
  // slack < 0 → 不足
  return {
    transitionIndex,
    status: "insufficient",
    shortfallMin: -slackRounded,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public: computeDayFeasibility
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * DayGraph + OverlayResult から DayFeasibilityResult を計算する pure helper。
 *
 * 各 transition (= K phase の graph.transitions と L overlay の result) を pair で処理し、
 * 余白 / 不足 / 該当なし を観測する。
 *
 * 純度保証:
 *   - input (= graph / overlayResult) を mutate しない
 *   - 副作用なし
 *   - deterministic
 *   - 出荷直前に `assertDayFeasibilityResultCompliance` で 9 不変条件を機械保証
 *
 * 規約 (= M-1):
 *   - 推奨 / 警告 / 評価語を含まない (= 数値のみ output)
 *   - PII (= title / locationText / anchorId 等) を持たない
 *   - transitionKey は L-3c 形式 (= `transition_${index}`)
 *   - sensitive proximity / unresolved transition は not_applicable
 *
 * @param graph K phase DayGraph (= 読み取りのみ)
 * @param overlayResult L overlay の OverlayResult (= 読み取りのみ)
 * @returns DayFeasibilityResult (= 集計付き、 PII-free)
 */
export function computeDayFeasibility(
  graph: DayGraph,
  overlayResult: OverlayResult,
): DayFeasibilityResult {
  const feasibilityByTransitionKey = new Map<string, FeasibilitySlackView>();
  let sufficient = 0;
  let insufficient = 0;
  let notApplicableCount = 0;

  // K phase の graph.transitions と L overlay の result.segmentsByTransitionKey を
  // index で対応付けて処理。 L-3c の transitionKey は `transition_${index}`、
  // graph.transitions[index] と 1 対 1。
  graph.transitions.forEach((transition, index) => {
    const transitionKey = `transition_${index}`;
    const outcome = overlayResult.segmentsByTransitionKey.get(transitionKey);

    let view: FeasibilitySlackView;
    if (!outcome) {
      // overlay に該当 key なし (= 通常起こらないが防御) → not_applicable
      view = notApplicable(index);
    } else if (!outcome.ok) {
      // overlay 内 internal_error → not_applicable
      view = notApplicable(index);
    } else {
      // overlay 計算成功 (= resolved / unresolved どちらも)
      view = computeSingleTransitionFeasibility(
        graph,
        outcome.segment,
        index,
        transition.fromNodeId,
        transition.toNodeId,
      );
    }

    feasibilityByTransitionKey.set(transitionKey, view);

    if (view.status === "sufficient") sufficient++;
    else if (view.status === "insufficient") insufficient++;
    else notApplicableCount++;
  });

  const result: DayFeasibilityResult = {
    feasibilityByTransitionKey,
    counts: {
      sufficient,
      insufficient,
      notApplicable: notApplicableCount,
    },
  };

  // 出荷直前に compliance assertion (= 9 不変条件の機械保証)
  assertDayFeasibilityResultCompliance(result);

  return result;
}
