/**
 * Dev shift-draft debug summary — pure（SR B1b-2C-9-FIX）
 *
 * 役割: dev-shift-draft host の crop_review / extracting / cells_loaded で表示する
 *   **安全な診断サマリ**を構築する。原因切り分け（列対応ズレ・crop 不一致・targetMonth 不整合）
 *   のために、座標・寸法・件数だけを構造化して返す。
 *
 * 安全原則（CEO/GPT 補正・2026-06-01）— **構造的に raw を排除**:
 *   - 出力に raw 画像 / base64 / dataURL / VLM raw response / API key / user id を**含めない**
 *     （型に該当 field が無い＝構造的禁止）。
 *   - 含めてよいのは: imageW/H, targetYear/month/daysInMonth, band 座標, crop 寸法・byte size,
 *     chunk ranges, model 名, elapsedMs, cells 件数, blank 件数。
 *
 * 不変原則: pure（IO / DOM / Date / random / env なし）。throw しない。
 */

import type { ShiftReviewCell } from "./shiftReviewClassification";

export interface CropDims {
  width: number;
  height: number;
  sizeBytes: number;
}

export interface DevShiftDraftDebugInput {
  imageW: number;
  imageH: number;
  year: number;
  month: number;
  daysInMonth: number;
  headerBand: { top: number; bottom: number };
  personRowBand: { top: number; bottom: number };
  /** crop 寸法（生成後にのみ既知。crop_review 以降で渡す）。 */
  crops?: {
    header?: CropDims;
    personRow?: CropDims;
    combined?: CropDims;
  };
  /** chunk 分割の境目（B1b-1R 92.8% 最良 = [15]）。 */
  chunkBoundaries: number[];
  /** VLM model 名（server prop 経由）。 */
  model?: string;
  /** 抽出にかかった ms（cells_loaded / error で既知）。 */
  elapsedMs?: number;
  /** cells（cells_loaded で既知）。blank 件数算出に使う。 */
  cells?: ShiftReviewCell[];
}

export interface DevShiftDraftDebugSummary {
  imageW: number;
  imageH: number;
  targetYear: number;
  targetMonth: number;
  daysInMonth: number;
  headerBandTop: number;
  headerBandBottom: number;
  personRowBandTop: number;
  personRowBandBottom: number;
  headerCrop: CropDims | null;
  personRowCrop: CropDims | null;
  combinedCrop: CropDims | null;
  chunkRanges: Array<{ from: number; to: number }>;
  model: string | null;
  elapsedMs: number | null;
  cellsCount: number | null;
  blankCount: number | null;
}

/** boundaries から chunk の day 範囲を算出（pure・planner と同型）。例: [15], 31 → [[1,15],[16,31]]。 */
export function computeChunkRanges(
  daysInMonth: number,
  chunkBoundaries: number[]
): Array<{ from: number; to: number }> {
  if (!Number.isInteger(daysInMonth) || daysInMonth < 1) return [];
  const valid = [
    ...new Set(
      chunkBoundaries.filter(
        (b) => Number.isInteger(b) && b >= 1 && b <= daysInMonth - 1
      )
    ),
  ].sort((a, b) => a - b);
  const ranges: Array<{ from: number; to: number }> = [];
  let from = 1;
  for (const b of valid) {
    ranges.push({ from, to: b });
    from = b + 1;
  }
  ranges.push({ from, to: daysInMonth });
  return ranges;
}

/** rawCode が空（空白のみ含む）の cell を blank とみなす。 */
function isBlankCell(c: ShiftReviewCell): boolean {
  return typeof c.rawCode !== "string" || c.rawCode.trim() === "";
}

/** 安全な診断サマリを構築（pure）。raw / base64 / key / userid は型上含めない。 */
export function buildDevShiftDraftDebugSummary(
  input: DevShiftDraftDebugInput
): DevShiftDraftDebugSummary {
  const cells = input.cells;
  return {
    imageW: input.imageW,
    imageH: input.imageH,
    targetYear: input.year,
    targetMonth: input.month,
    daysInMonth: input.daysInMonth,
    headerBandTop: input.headerBand.top,
    headerBandBottom: input.headerBand.bottom,
    personRowBandTop: input.personRowBand.top,
    personRowBandBottom: input.personRowBand.bottom,
    headerCrop: input.crops?.header ?? null,
    personRowCrop: input.crops?.personRow ?? null,
    combinedCrop: input.crops?.combined ?? null,
    chunkRanges: computeChunkRanges(input.daysInMonth, input.chunkBoundaries),
    model: input.model ?? null,
    elapsedMs: typeof input.elapsedMs === "number" ? input.elapsedMs : null,
    cellsCount: cells ? cells.length : null,
    blankCount: cells ? cells.filter(isBlankCell).length : null,
  };
}
