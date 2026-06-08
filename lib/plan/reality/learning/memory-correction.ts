/**
 * Reality Control OS — R1-3 Correction Memory（**pure・no-DB**・barrel 非 export）
 *
 * 設計: docs/reality-secretary-os-unbuilt-roadmap.md（R1-3）/ memory-model.ts（R1-1）/ A1-7-35 feedback
 *
 * 役割: 「AI 提案 → 本人が直す」の **最強 signal** を統一 `MemoryItem`(kind="correction") に写す pure 層。
 *   さらに各 correction を **実行可能な verdict**（trust_more/suppress/adjust_direction/narrow_context）に変換し、
 *   下流（R1-7 synthesis・Alter bridge）が **directly-observed > inferred** で重み付け/抑制に使えるようにする。
 *   ＝「直した分だけ秘書が育つ」を機械化する層。
 *
 * 4 種 signal の出所（A1-7-35）:
 *   - confirmed: user M2(approve)＝prm_review_decision（active M3 は user_correction=null ゆえ M2 でしか見えない）
 *   - rejected : user M2(reject)＋M3 retracted＝prm_review_decision（非 retracted read から消える）
 *   - direction_adjusted / context_refined: active M3 の user_correction＝prm_model_entry（SecondSelfTendency に見える）
 *
 * 厳守: 非断定 observation（trait 語なし）・certainty ≤tentative・kind 別に正しい provenance・raw を持たない・pure。
 */

import type { SecondSelfTendency } from "./prm-model-entry-read";
import { buildMemoryItem, memoryContextPhrase, type MemoryItem, type MemorySource } from "./memory-model";

/** 本人訂正の 4 種（confirm＝肯定の訂正も含む）。 */
export type CorrectionKind = "confirmed" | "rejected" | "direction_adjusted" | "context_refined";

/** 訂正の実行可能 verdict（下流の重み付け/抑制に使う）。 */
export type CorrectionVerdict =
  | "trust_more" // confirmed: 本人が合っていると確認 → 信頼を上げてよい（ただし certainty は別管理）
  | "suppress" // rejected: 本人が違うとした → surface しない
  | "adjust_direction" // direction_adjusted: 文脈は合うが向きが違う
  | "narrow_context"; // context_refined: 向きは合うが文脈が広すぎ/ずれ

/** 1 件の訂正イベント（M2 user decision または M3 user_correction 由来の正規入力）。 */
export interface CorrectionRecord {
  readonly contextDimension: string;
  readonly contextValue: string;
  readonly tendencyDirection: "adoption" | "non_adoption" | "deferral";
  readonly kind: CorrectionKind;
  readonly evidenceCount: number;
  readonly counterCount: number;
  readonly certainty: "low" | "tentative";
}

const VERDICT: Record<CorrectionKind, CorrectionVerdict> = {
  confirmed: "trust_more",
  rejected: "suppress",
  direction_adjusted: "adjust_direction",
  context_refined: "narrow_context",
};

/** kind → verdict（下流が「どう扱うか」を一意に決める）。 */
export function correctionVerdict(kind: CorrectionKind): CorrectionVerdict {
  return VERDICT[kind];
}

/** confirm/reject は本人 review(M2)由来、direction/context は M3 由来。 */
function sourceOf(kind: CorrectionKind): MemorySource {
  return kind === "confirmed" || kind === "rejected" ? "prm_review_decision" : "prm_model_entry";
}

const OBSERVATION: Record<CorrectionKind, (ctx: string) => string> = {
  confirmed: (c) => `${c}での見立てを、本人が確認した`,
  rejected: (c) => `${c}での見立てを、本人が違うとした`,
  direction_adjusted: (c) => `${c}での見立てを、本人が向きを調整した`,
  context_refined: (c) => `${c}での見立てを、本人が文脈を補った`,
};

/** CorrectionRecord → correction MemoryItem（非断定・kind 別 provenance・verdict は別 API）。 */
export function correctionRecordToMemory(r: CorrectionRecord): MemoryItem {
  const ctx = memoryContextPhrase(r.contextDimension, r.contextValue);
  return buildMemoryItem({
    kind: "correction",
    observation: OBSERVATION[r.kind](ctx),
    context: { dimension: r.contextDimension, value: r.contextValue },
    evidenceCount: r.evidenceCount,
    counterCount: r.counterCount,
    certainty: r.certainty,
    userConfirmed: r.kind === "confirmed",
    userCorrection: r.kind === "confirmed" ? null : r.kind, // confirmed は訂正でない（肯定）
    source: sourceOf(r.kind),
  });
}

export function correctionRecordsToMemory(records: readonly CorrectionRecord[]): readonly MemoryItem[] {
  return records.map(correctionRecordToMemory);
}

/**
 * R1-3: 既存 `SecondSelfTendency[]`（非 retracted M3）から **direction_adjusted / context_refined** の
 *   correction record を導く（confirm は M2 由来・reject は retracted で見えない → M2 reader 拡張で別途）。
 *   ＝今ある read だけで掴める correction を取りこぼさず拾う pure deriver。
 */
export function tendenciesToCorrectionRecords(tendencies: readonly SecondSelfTendency[]): readonly CorrectionRecord[] {
  const records: CorrectionRecord[] = [];
  for (const t of tendencies) {
    if (t.userCorrection === "direction_adjusted" || t.userCorrection === "context_refined") {
      records.push({
        contextDimension: t.contextDimension,
        contextValue: t.contextValue,
        tendencyDirection: t.tendencyDirection,
        kind: t.userCorrection,
        evidenceCount: t.evidenceCount,
        counterCount: t.counterCount,
        certainty: t.certainty,
      });
    }
  }
  return records;
}
