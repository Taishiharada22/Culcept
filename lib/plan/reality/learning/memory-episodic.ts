/**
 * Reality Control OS — R1-4 Episodic Memory（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-4）/ memory-model.ts（R1-1）/ prm-learning-event-read.ts（M1）
 *
 * 役割: M1 `prm_learning_events`（accept/dismiss/later の signal log）の read row を、**個々の過去出来事**として
 *   `MemoryItem`(kind="episodic") に写す pure mapper。Semantic（傾向＝集約）と違い episodic は **イベント単位＋WHEN**。
 *   retrieval 用途: 「前にこの文脈でどうしたか」を想起（recency 並べ替えは synthesis が nowMs で行う）。
 *
 * 厳守: 非断定（事実の記録・trait 語なし）・個々イベントは弱い証拠＝certainty="low"・occurredAtISO=acted_at・
 *   raw/seedRef を持たない（M1 read は context 列のみ）・pure・Date.now なし。
 */

import { isValidActionKind, type CandidateActionKind } from "../candidate-action";
import type { PrmLearningEventReadRow } from "./prm-learning-event-read";
import { buildMemoryItem, memoryContextPhrase, type MemoryItem } from "./memory-model";

/** action → 過去形の事実動詞（非断定・「した」事実）。 */
const ACTION_VERB: Record<string, string> = {
  accept: "取り入れた",
  dismiss: "見送った",
  later: "後回しにした",
};

/** M1 read row → episodic MemoryItem（1 イベント=1 記憶・occurredAtISO=acted_at）。 */
export function learningEventToEpisodicMemory(row: PrmLearningEventReadRow): MemoryItem {
  const verb = ACTION_VERB[row.action] ?? "対応した";
  const phrase = memoryContextPhrase("band", row.band ?? ""); // band 不明は「ある場面」に fallback
  return buildMemoryItem({
    kind: "episodic",
    observation: `${phrase}で、${verb}`,
    context: { dimension: "band", value: row.band ?? null },
    evidenceCount: 1, // 個々の出来事は 1 回
    counterCount: 0,
    certainty: "low", // 単発イベントは一般化の証拠として弱い
    occurredAtISO: row.acted_at, // recency の基点（並べ替えは下流）
    source: "prm_learning_event",
  });
}

/** 複数 M1 row → episodic MemoryItem[]（**action 不正な row は skip**＝防御・DB CHECK 前提だが loose row 耐性）。 */
export function learningEventsToEpisodicMemory(rows: readonly PrmLearningEventReadRow[]): readonly MemoryItem[] {
  return rows
    // A-4-c10 先回り防御: Life Ops feedback 行（handle 'lifeops:' namespace・将来 write・CHECK 拡張 migration 後）は
    //   plan-seed 文脈の episodic memory に**混入させない**（Life Ops 側は専用 adapter（c8）が読む・migration 前でも無害な additive filter）。
    .filter((r) => !r.handle.startsWith("lifeops:"))
    .filter((r) => isValidActionKind(r.action as CandidateActionKind))
    .map(learningEventToEpisodicMemory);
}
