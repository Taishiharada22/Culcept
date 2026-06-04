/**
 * Reality Control OS — A1-5-3a DurationEvidence Adapter / Assembler（pure・barrel 非 export）
 *
 * 設計: docs/aneurasync-reality-control-os-connection-design.md §8.12
 *
 * 役割: PRM(typicalDuration) / correction / seed_explicit が **将来出す構造化 duration 入力** を
 *   DurationEvidence（A1-4-3a/3b enrich 層が消費する契約）に整形し、seedRef -> DurationEvidence[]
 *   map（= CompleteDispatchInput.durationEvidences）を組む **pure producer / assembler**。
 *
 * 厳守:
 *   - **PRM / correction 実接続をしない**（typicalDuration / correctionMemoryFrame を import しない）。
 *     入力は「それらが出す構造化結果」を fixture / 呼び出し側が注入する（raw activity 文字列は読まない）。
 *   - **raw text を parse しない**・**default duration を置かない**（入力 duration をそのまま使う）。
 *   - **DB read / write なし**・**runtime / route / UI 未接続**・**barrel 非 export**・**pure**（server-only 不要）。
 *   - well-formed 検証（range / source）は enrich の検証器を **再利用**（単一権威）。採用方針
 *     （confidence-high / priority / conflict / prm_typical -> weak grounding）は enrich が決める。
 *     本層は **整形と集約のみ**。
 *
 * 安全床: prm_typical は enrich で grounding=weak に倒れ generateComplete の候補化条件（grounding=strong）
 *   を満たさない -> **prm_typical だけでは candidateCount=0**。candidateCount>0 は seed_explicit / correction のみ。
 */

import {
  type DurationEvidence,
  type DurationEvidenceSource,
  type DurationConfidence,
  isValidEvidenceSource,
  isValidEvidenceDuration,
} from "./seed-placement-enrich";

// ── source 別の構造化 fixture 入力型（raw を含まない・各 source の自然な形） ──

/** seed_explicit: capture 時に user が明示した duration。 */
export interface SeedExplicitDurationInput {
  readonly seedRef: string;
  readonly durationMin: number;
  readonly confidence: DurationConfidence;
}

/** correction: 配置済 seed への user 編集（runtime・future）の構造化観測。 */
export interface CorrectionDurationInput {
  readonly seedRef: string;
  readonly correctedMin: number;
  readonly confidence: DurationConfidence;
}

/**
 * prm_typical: typicalDuration(activity) の **構造化出力**（capture 時に算出済み）。
 * typicalDuration の 3 段階 confidence を DurationConfidence(high/low) に写像する（medium / low -> low）。
 * activity 文字列（raw）は本層に渡さない（capture 側で構造化済み）。
 */
export interface PrmTypicalDurationInput {
  readonly seedRef: string;
  readonly typicalMin: number;
  readonly typicalConfidence: "high" | "medium" | "low";
}

/**
 * 汎用: 構造化入力 -> DurationEvidence（well-formed のみ・enrich の検証器で単一権威化）。
 * seedRef 空 / duration 範囲外(1<分<=1440 でない)・非有限 / source 不正 -> **null（reject）**。
 * confidence(high/low) は well-formed として通す（low も生成）。**採用(high のみ)は enrich の責務**。
 */
export function toDurationEvidence(input: {
  readonly seedRef: string;
  readonly durationMin: number;
  readonly source: string;
  readonly confidence: DurationConfidence;
}): DurationEvidence | null {
  if (!input.seedRef) return null; // seedRef 空 -> reject
  if (!isValidEvidenceDuration(input.durationMin)) return null; // 範囲外 / 非有限 -> reject
  if (!isValidEvidenceSource(input.source as DurationEvidenceSource)) return null; // 不正 source -> reject
  return {
    seedRef: input.seedRef,
    durationMin: input.durationMin,
    source: input.source as DurationEvidenceSource,
    confidence: input.confidence,
  };
}

/** seed_explicit 構造化入力 -> DurationEvidence（source 固定）。well-formed でなければ null。 */
export function seedExplicitToEvidence(input: SeedExplicitDurationInput): DurationEvidence | null {
  return toDurationEvidence({ seedRef: input.seedRef, durationMin: input.durationMin, source: "seed_explicit", confidence: input.confidence });
}

/** correction 構造化入力 -> DurationEvidence（source 固定）。well-formed でなければ null。 */
export function correctionToEvidence(input: CorrectionDurationInput): DurationEvidence | null {
  return toDurationEvidence({ seedRef: input.seedRef, durationMin: input.correctedMin, source: "correction", confidence: input.confidence });
}

/**
 * prm_typical 構造化入力 -> DurationEvidence（source 固定・confidence 写像）。
 * typicalConfidence high -> high / medium・low -> low。enrich で grounding=weak に倒れる（候補化しない）。
 */
export function prmTypicalToEvidence(input: PrmTypicalDurationInput): DurationEvidence | null {
  const confidence: DurationConfidence = input.typicalConfidence === "high" ? "high" : "low";
  return toDurationEvidence({ seedRef: input.seedRef, durationMin: input.typicalMin, source: "prm_typical", confidence });
}

/**
 * DurationEvidence[]（null 混在可）-> seedRef -> DurationEvidence[] map。
 * null は除外し seedRef ごとに集約（= CompleteDispatchInput.durationEvidences）。順序保持・純粋。
 */
export function assembleDurationEvidenceMap(
  evidences: readonly (DurationEvidence | null)[]
): Record<string, DurationEvidence[]> {
  const map: Record<string, DurationEvidence[]> = {};
  for (const e of evidences) {
    if (!e) continue;
    (map[e.seedRef] ??= []).push(e);
  }
  return map;
}
