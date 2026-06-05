/**
 * VLM 抽出結果 → ShiftReviewCell[] 変換（SR B1b-2C-4-b・pure）
 *
 * 役割: chunk 結果（DayKeyedShiftCell[]）を ShiftReviewGrid が消費する ShiftReviewCell[] に
 *   写像する pure layer。host が VLM adapter から受け取って Grid に渡すまでの間に挟む。
 *
 * 不変原則:
 *   - pure（IO / LLM / DB / Date / random / env / fetch / Blob / base64 なし）
 *   - confidence が null/undefined のセルは既定値で埋める（呼び元が opt-in 可）
 *   - 後処理で「都合よく補正」しない（rawCode は normalize しない・raw 値保持）
 *   - dayNumber → date は year/month から決定論的に解決
 *   - 範囲外 dayNumber（<1 or >daysInMonth）は黙って drop（防御的・raw error 防止）
 */

import type { DayKeyedShiftCell } from "./shiftExtractionContract";
import type { ShiftReviewCell } from "./shiftReviewClassification";

/** confidence 未指定セルに与える既定（B1b-2B blank-risk 閾値 0.7 より少し上 = soft hint を発火しすぎない）。 */
export const DEFAULT_CONFIDENCE = 0.8;

/**
 * A3-D2: **空欄（rawCode が空）かつ confidence 欠落/非有限**のセルに与える安全側の既定。
 *   blank-risk 閾値（0.7）より **下** にして、read-miss（読めずに "" に化けた日）が高 confidence の
 *   空欄として silent skip するのを防ぐ（VLM が confidence を落とさなくても要確認へ確実に回す）。
 *   ※ 非空セル / 明示 confidence 付きの空欄には適用しない（確実な休みは高 confidence を維持）。
 */
export const BLANK_MISSING_CONFIDENCE = 0.5;

export interface AssistedDraftToShiftReviewCellsOptions {
  /** confidence 未指定/null/Infinity の場合の埋め値（0..1）。既定 DEFAULT_CONFIDENCE。 */
  defaultConfidence?: number;
}

/** "YYYY-MM-DD" を pure に組む（Date 非依存）。 */
function ymd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return DEFAULT_CONFIDENCE;
  return Math.max(0, Math.min(1, v));
}

/**
 * DayKeyedShiftCell[] → ShiftReviewCell[]。
 *   - day=1..daysInMonth のみ採用（範囲外は drop）
 *   - 同 day が重複していた場合は **最初の出現を採用**（防御的・後処理しない原則）
 *   - rawCode は VLM 出力をそのまま保持（trim/normalize しない＝raw 評価）
 *   - confidence 未指定/null/Infinity/<0/>1 は defaultConfidence に丸める
 *   - 出力は day 昇順
 */
export function assistedDraftToShiftReviewCells(
  cells: readonly DayKeyedShiftCell[],
  meta: { year: number; month: number; daysInMonth: number },
  options?: AssistedDraftToShiftReviewCellsOptions
): ShiftReviewCell[] {
  const def = clamp01(options?.defaultConfidence ?? DEFAULT_CONFIDENCE);
  const seen = new Set<number>();
  const accepted: ShiftReviewCell[] = [];
  for (const c of cells) {
    if (
      !Number.isInteger(c.day) ||
      c.day < 1 ||
      c.day > meta.daysInMonth ||
      seen.has(c.day)
    ) {
      continue;
    }
    seen.add(c.day);
    // A3-D2: 空欄かつ confidence 欠落/非有限は安全側（BLANK_MISSING_CONFIDENCE < 閾値）へ。
    //   明示 confidence 付き空欄は尊重（確実な休み=高 conf を保つ / read-miss=低 conf をそのまま）。
    const isBlankCell = typeof c.rawCode === "string" && c.rawCode.trim() === "";
    const hasConfidence =
      typeof c.confidence === "number" && Number.isFinite(c.confidence);
    const conf = hasConfidence
      ? clamp01(c.confidence as number)
      : isBlankCell
        ? BLANK_MISSING_CONFIDENCE
        : def;
    accepted.push({
      day: c.day,
      date: ymd(meta.year, meta.month, c.day),
      rawCode: c.rawCode,
      confidence: conf,
      // A2B-1: rowLabel（人名）を review 専用 metadata として carry。非空のみ載せる（保存には混ぜない）。
      ...(typeof c.rowLabel === "string" && c.rowLabel.trim() !== ""
        ? { rowLabel: c.rowLabel }
        : {}),
    });
  }
  accepted.sort((a, b) => a.day - b.day);
  return accepted;
}
