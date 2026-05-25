/**
 * GapNode generator — Phase 3-K (= K-1c)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §4.4 / §6.4
 *
 * 役割:
 *   StartNode / EventNodes / EndNode 間の空白を GapNode として生成。
 *   minGapMinutes 未満は natural padding として無視。
 *   overlap event は running max endTime で 1 block として扱う。
 *
 * Empty day:
 *   anchor 0 件 → start + 1 large gap + end (= 設計 §6.4)
 *
 * 不変原則:
 *   - pure / no side effects
 *   - sensitiveProximity = pair 前後の sensitive flag OR
 *   - LLM 不使用
 */

import type { EndNode, EventNode, GapNode, StartNode } from "./dayGraphTypes";
import { bucketFromMinutes, minutesToHHMM, parseHHMMtoMinutes } from "./timeFormat";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface BuildGapNodesInput {
  readonly startNode: StartNode;
  /** startTime 昇順 sort 済 event node 配列 (= caller 責任) */
  readonly eventNodes: ReadonlyArray<EventNode>;
  readonly endNode: EndNode;
  readonly date: string;
  readonly minGapMinutes: number;
}

interface RunningPoint {
  readonly time: string;     // "HH:MM"
  readonly sensitive: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * event sequence を「running max endTime block」 で集約。
 *
 * 例:
 *   ev1: 14:00-16:00
 *   ev2: 15:00-15:30 (= overlap)
 *   ev3: 17:00-18:00
 *   ev4: 18:30-19:00
 *
 *   blocks = [{end:16:00,sens:?}, {end:18:00,sens:?}, {end:19:00,sens:?}]
 *   gaps = [start→14:00, 16:00→17:00, 18:00→18:30, 19:00→end]
 *
 * sensitive 集約: block 内 event のいずれか sensitive なら block.sensitive = true
 */
function buildPairsForGaps(
  startNode: StartNode,
  eventNodes: ReadonlyArray<EventNode>,
  endNode: EndNode,
): Array<{ from: RunningPoint; to: RunningPoint }> {
  if (eventNodes.length === 0) {
    return [
      {
        from: { time: startNode.endTime, sensitive: false },
        to: { time: endNode.startTime, sensitive: false },
      },
    ];
  }

  const pairs: Array<{ from: RunningPoint; to: RunningPoint }> = [];

  // Start → first event の gap
  pairs.push({
    from: { time: startNode.endTime, sensitive: false },
    to: { time: eventNodes[0]!.startTime, sensitive: eventNodes[0]!.sensitive },
  });

  // 連続 event 間 (= running max endTime block で集約)
  let runningEndTime = eventNodes[0]!.endTime;
  let runningSensitive = eventNodes[0]!.sensitive;

  for (let i = 1; i < eventNodes.length; i++) {
    const ev = eventNodes[i]!;
    // 現 event の startTime が runningEndTime より後 → gap pair
    if (ev.startTime > runningEndTime) {
      pairs.push({
        from: { time: runningEndTime, sensitive: runningSensitive },
        to: { time: ev.startTime, sensitive: ev.sensitive },
      });
    }
    // runningEndTime 更新 (= 現 event の endTime が大きければ)
    if (ev.endTime > runningEndTime) {
      runningEndTime = ev.endTime;
      runningSensitive = ev.sensitive;
    } else if (ev.endTime === runningEndTime && ev.sensitive) {
      // 同時刻終了でも sensitive を反映
      runningSensitive = true;
    }
  }

  // Last event-block → End の gap
  pairs.push({
    from: { time: runningEndTime, sensitive: runningSensitive },
    to: { time: endNode.startTime, sensitive: false },
  });

  return pairs;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * GapNode 配列を生成。
 *
 * 規則:
 *   - empty day → start + 1 large gap + end の 1 gap (= 設計 §6.4)
 *   - 各 pair の duration が minGapMinutes 未満 → skip (= natural padding)
 *   - duration が <= 0 → skip (= overlap / boundary 一致)
 *   - sensitiveProximity = pair 前後の sensitive flag OR
 *
 * 戻り値: startTime 順の GapNode 配列
 */
export function buildGapNodes(input: BuildGapNodesInput): ReadonlyArray<GapNode> {
  const { startNode, eventNodes, endNode, date, minGapMinutes } = input;
  const pairs = buildPairsForGaps(startNode, eventNodes, endNode);

  const gaps: GapNode[] = [];
  let order = 0;

  for (const pair of pairs) {
    const fromMin = parseHHMMtoMinutes(pair.from.time);
    const toMin = parseHHMMtoMinutes(pair.to.time);
    if (fromMin === null || toMin === null) continue;

    const duration = toMin - fromMin;
    if (duration <= 0) continue;
    if (duration < minGapMinutes) continue;

    gaps.push({
      id: `${date}_gap_${order++}`,
      kind: "gap",
      origin: "implicit",
      startTime: minutesToHHMM(fromMin),
      endTime: minutesToHHMM(toMin),
      durationMin: duration,
      timeBucket: bucketFromMinutes(fromMin),
      sensitiveProximity: pair.from.sensitive || pair.to.sensitive,
    });
  }

  return gaps;
}
