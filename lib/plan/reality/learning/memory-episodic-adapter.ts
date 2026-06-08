/**
 * Reality Control OS — R1-4 Episodic Memory Adapter（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-4）/ memory-model.ts（R1-1 taxonomy: episodic=prm_learning_event）
 *
 * 役割: M1 `prm_learning_events` の read row（`PrmLearningEventReadRow`・既存 A1-7-26 reader が産出）を、
 *   R1-1 統一 `MemoryItem`（kind="episodic"）へ写す **pure mapper**。新規 read はしない（既存 read 出力を変換するだけ）。
 *   episodic = 「前にこの文脈でどうした」を想起する **具体的行動の記録**（M1 signal log・review 前の behavioral fact）。
 *   semantic（R1-2・M3 review 済 tendency）とは出所も性格も別:
 *     - episodic: **「した」（事実）**・出所 M1（review 前）・反証の概念なし（counterCount=0）。
 *     - semantic: **「しやすい」（傾向）**・出所 M3（review 済）・favored hypothesis + counter を持つ。
 *
 * 厳守（redacted・sensitive 除外）:
 *   - **raw / handle / 絶対日付を持ち込まない**: read row 由来でも observation は band×action のみ。
 *     handle は候補参照（user 可読でない）・desired_date/acted_at は落とす。
 *     ＝ M1 read は元から column-restricted（raw/seedRef/user_id/id 非 select）。本層はさらに handle/date を捨て純度を上げる。
 *   - **非断定 observation**（trait 語なし・「〜したことがある」型・将来/傾向を主張しない）。
 *   - **counterCount=0**（事実に反証はない）・**certainty ≤tentative**（cap 防御・複数回でも tentative 止まり）。
 *   - pure・deterministic（Date.now/LLM/DB なし）。出力順は band×action の固定順序。
 *
 * 設計判断（collapse）: redaction で絶対日付を落とすため、同一 (band×action) の event は互いに区別不能。
 *   ゆえ plural は同一文脈を **occurrence count**（evidenceCount）へ collapse する（重複 item を作らない＝唯一誠実な表現）。
 *   日付付きの個別 episode 列挙は記憶 model（R1-1）が temporal field を持たないため対象外（将来 model 拡張で）。
 */

import type { CandidateActionKind } from "../candidate-action";
import { isValidActionKind } from "../candidate-action";
import type { PrmLearningEventReadRow } from "./prm-learning-event-read";
import { buildMemoryItem, memoryContextPhrase, type MemoryItem } from "./memory-model";

/** action → 過去形の具体行動（episodic は事実＝過去形・semantic の「〜やすい」と区別）。 */
const PAST_VERB: Record<CandidateActionKind, string> = {
  accept: "取り入れた",
  dismiss: "見送った",
  later: "後回しにした",
};

/** 出力の決定的順序（band×action の固定順）。 */
const BAND_ORDER = ["morning", "afternoon", "evening", "none"] as const;
const ACTION_ORDER: readonly CandidateActionKind[] = ["accept", "dismiss", "later"];

/** band(null/不正=none) を MEMORY_CONTEXT_PHRASE の band 値へ正規化。 */
function bandValue(band: string | null): string {
  return band === "morning" || band === "afternoon" || band === "evening" ? band : "none";
}

/** band×action×occurrences → episodic MemoryItem（非断定・counterCount=0・provenance=M1）。 */
function buildEpisodicItem(band: string, action: CandidateActionKind, occurrences: number): MemoryItem {
  // 内部 observation（非断定・「〜したことがある」型・trait 語なし）。表示時は presenter を別途通す。
  const observation = `${memoryContextPhrase("band", band)}を${PAST_VERB[action]}ことがある`;
  return buildMemoryItem({
    kind: "episodic",
    observation,
    context: { dimension: "band", value: band },
    evidenceCount: occurrences,
    counterCount: 0, // episodic は事実（反証の概念がない）
    certainty: occurrences >= 2 ? "tentative" : "low", // recall salience（傾向の主張ではない・cap で high 不可）
    userConfirmed: false, // 確認は correction memory（R1-3）が担う
    userCorrection: null,
    source: "prm_learning_event",
  });
}

/** 1 件の M1 read row → episodic MemoryItem（1 occurrence・building block）。 */
export function learningEventToEpisodicMemory(row: PrmLearningEventReadRow): MemoryItem {
  return buildEpisodicItem(bandValue(row.band), row.action, 1);
}

/**
 * R1-4: M1 read rows → episodic MemoryItem[]。同一 (band×action) を occurrence count へ **collapse**。
 *   不正 action row は skip（DB CHECK 前提だが loose row 耐性・既存 reader と同じ防御）。出力は band×action の固定順。
 */
export function learningEventsToEpisodicMemory(rows: readonly PrmLearningEventReadRow[]): readonly MemoryItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!isValidActionKind(row.action)) continue; // loose row 防御
    const key = `${bandValue(row.band)}:${row.action}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const items: MemoryItem[] = [];
  for (const band of BAND_ORDER) {
    for (const action of ACTION_ORDER) {
      const occurrences = counts.get(`${band}:${action}`);
      if (occurrences) items.push(buildEpisodicItem(band, action, occurrences));
    }
  }
  return items;
}
