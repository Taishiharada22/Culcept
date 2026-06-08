/**
 * Reality Control OS — R1-2 Semantic Memory Adapter（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-2）/ memory-model.ts（R1-1）
 *
 * 役割: A1-7-34 の `SecondSelfTendency`（M3 review 済 tendency・既存 reader が産出）を、
 *   R1-1 の統一 `MemoryItem`（kind="semantic"）へ写す **pure mapper**。新規 read はせず既存出力を変換するだけ。
 *
 * 厳守: 非断定 observation（trait 語なし）・certainty は ≤tentative のまま cap・provenance=prm_model_entry・raw を持たない。
 *   user_correction "rejected" は semantic として出さない（本人が否定した傾向を「一般傾向」にしない）。
 */

import type { SecondSelfTendency } from "./prm-model-entry-read";
import { buildMemoryItem, type MemoryItem } from "./memory-model";

const CONTEXT_PHRASE: Record<string, Record<string, string>> = {
  band: { morning: "朝の予定", afternoon: "午後の予定", evening: "夜の予定", none: "時間帯の定まらない予定" },
  durationBucket: { short: "短い予定", medium: "中くらいの予定", long: "時間のかかる予定", unknown: "所要不明の予定" },
  confidence: { high: "確信高めの提案", medium: "確信中くらいの提案", low: "確信低めの提案" },
  source: { seed_explicit: "会話から拾った予定", correction: "調整された予定" },
};
const VERB: Record<string, string> = { adoption: "取り入れ", non_adoption: "見送り", deferral: "後回しにし" };

function phrase(dim: string, value: string): string {
  return CONTEXT_PHRASE[dim]?.[value] ?? "ある場面";
}

/** SecondSelfTendency → semantic MemoryItem（非断定・文脈束縛）。 */
export function tendencyToSemanticMemory(t: SecondSelfTendency): MemoryItem {
  const verb = VERB[t.tendencyDirection] ?? "動き";
  // 内部 observation（非断定・「〜やすい傾向」型・trait 語なし）。表示時は presenter を別途通す。
  const observation = `${phrase(t.contextDimension, t.contextValue)}では「${verb}やすい」傾向`;
  return buildMemoryItem({
    kind: "semantic",
    observation,
    context: { dimension: t.contextDimension, value: t.contextValue },
    evidenceCount: t.evidenceCount,
    counterCount: t.counterCount,
    certainty: t.certainty, // 既に low|tentative（cap は防御）
    userConfirmed: false, // semantic は「一般傾向」。本人確認は correction memory が担う
    userCorrection: t.userCorrection,
    source: "prm_model_entry",
  });
}

/**
 * R1-2: tendencies → semantic MemoryItem[]。**rejected は除外**（本人否定の傾向を一般傾向にしない）。
 */
export function tendenciesToSemanticMemory(tendencies: readonly SecondSelfTendency[]): readonly MemoryItem[] {
  return tendencies.filter((t) => t.userCorrection !== "rejected").map(tendencyToSemanticMemory);
}
