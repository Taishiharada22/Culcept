/**
 * Reality Control OS — R1-5 Procedural Memory Adapter（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-5）/ memory-model.ts（R1-1 taxonomy: procedural=M1 accept + M2 approve）
 *
 * 役割: 「うまくいった手順（採用・承認された進め方）」を統一 `MemoryItem`（kind="procedural"）へ合成する **pure mapper**。
 *   専用 procedural ストアは無い（R1-0 監査）→ **PRM の 2 source から合成**:
 *     - **M1 accept**（`PrmLearningEventReadRow` 由来）= 採用された選択＝うまくいった進め方（behavioral・review 前）。
 *     - **M2 user-approve**（`ReviewDecisionRead` 由来）= 本人が review で承認した進め方（reviewed・confirm signal）。
 *   episodic（R1-4・M1 全 action の事実）/ semantic（R1-2・M3 傾向）とは別:
 *     procedural は **「採るべき進め方」を再利用するため**の記憶（dismiss/later は採用でない＝手順でない）。
 *
 * 厳守（redacted・非断定）:
 *   - M1 由来は band×action のみ（accept-only）・handle/絶対日付を持ち込まない。M2 由来は context 列のみ（fingerprint/日付なし）。
 *   - 非断定 observation（trait 語なし・「〜進め方を採ってきた/選んでいる」型）・counterCount: M1=0（採用事実）/ M2=read の counter。
 *   - certainty ≤tentative（cap 防御）・pure・deterministic（Date.now/LLM/DB なし）・出力は band の固定順（M1）→ M2 順。
 *   - **userConfirmed**: M1 accept=false（in-flow 採用）/ M2 user-approve=true（本人 review 承認＝confirm）。
 */

import type { CandidateActionKind } from "../candidate-action";
import type { PrmLearningEventReadRow } from "./prm-learning-event-read";
import type { ReviewDecisionRead } from "./prm-review-decision-read";
import { buildMemoryItem, memoryContextPhrase, type MemoryItem } from "./memory-model";

/** action → 進め方（procedural は「採るべき approach」＝現在形・動作名詞化）。 */
const APPROACH_VERB: Record<CandidateActionKind, string> = {
  accept: "取り入れる",
  dismiss: "見送る",
  later: "後回しにする",
};

/** M1 由来 procedural の決定的出力順。 */
const BAND_ORDER = ["morning", "afternoon", "evening", "none"] as const;

/** band(null/不正=none) を MEMORY_CONTEXT_PHRASE の band 値へ正規化。 */
function bandValue(band: string | null): string {
  return band === "morning" || band === "afternoon" || band === "evening" ? band : "none";
}

/**
 * R1-5: M1 read rows → procedural MemoryItem[]。**accept-only**（採用＝うまくいった手順）を band で collapse。
 *   dismiss/later は「採用された進め方」でないため procedural にしない（それらは episodic R1-4 が事実として持つ）。
 */
export function learningEventsToProceduralMemory(rows: readonly PrmLearningEventReadRow[]): readonly MemoryItem[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (row.action !== "accept") continue; // 採用のみが「手順」
    const band = bandValue(row.band);
    counts.set(band, (counts.get(band) ?? 0) + 1);
  }
  const items: MemoryItem[] = [];
  for (const band of BAND_ORDER) {
    const occurrences = counts.get(band);
    if (!occurrences) continue;
    items.push(
      buildMemoryItem({
        kind: "procedural",
        observation: `${memoryContextPhrase("band", band)}では、取り入れる進め方を採ってきた`,
        context: { dimension: "band", value: band },
        evidenceCount: occurrences,
        counterCount: 0, // 採用は事実（反証の概念がない）
        certainty: occurrences >= 2 ? "tentative" : "low",
        userConfirmed: false, // in-flow 採用（review approve でない）
        userCorrection: null,
        source: "prm_learning_event",
      })
    );
  }
  return items;
}

/**
 * R1-5: M2 read → procedural MemoryItem[]。**reviewer=user ∧ decision=approve のみ**（本人が承認した進め方）。
 *   operator approve / reject / defer は「本人がうまくいくと承認した手順」でないため除外。userConfirmed=true。
 */
export function reviewDecisionsToProceduralMemory(reads: readonly ReviewDecisionRead[]): readonly MemoryItem[] {
  return reads
    .filter((r) => r.reviewer === "user" && r.decision === "approve")
    .map((r) =>
      buildMemoryItem({
        kind: "procedural",
        observation: `${memoryContextPhrase(r.contextDimension, r.contextValue)}では、${APPROACH_VERB[r.dominantAction]}進め方を本人が選んでいる`,
        context: { dimension: r.contextDimension, value: r.contextValue },
        evidenceCount: r.evidenceCount,
        counterCount: r.counterCount,
        certainty: r.certainty,
        userConfirmed: true, // 本人が review で approve（confirm signal）
        userCorrection: null,
        source: "prm_review_decision",
      })
    );
}

/**
 * R1-5: procedural memory の統一入口（M1 accept ＋ M2 user-approve を合成）。
 *   両 source は別 evidence（behavioral 採用 vs reviewed 承認）として **共存**（merge は R1-7 synthesis が担う）。
 */
export function buildProceduralMemory(input: {
  readonly learningEvents?: readonly PrmLearningEventReadRow[];
  readonly reviewDecisions?: readonly ReviewDecisionRead[];
}): readonly MemoryItem[] {
  return [
    ...learningEventsToProceduralMemory(input.learningEvents ?? []),
    ...reviewDecisionsToProceduralMemory(input.reviewDecisions ?? []),
  ];
}
