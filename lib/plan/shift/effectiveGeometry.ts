/**
 * effectiveGeometry — S-geo persist: dayColumns / gridCalibration から「採用すべき geometry」を解決する pure helper。
 *
 * 3 層モデル:
 *   dayColumns        = 初期 geometry を作る荒い 2 点（ヘッダ tap）
 *   gridCalibration   = 全列オーバーレイで人間が合わせた最終 geometry（X 成分）+ 誤適用防止コンテキスト
 *   effectiveGeometry = gridCalibration が現コンテキストと整合すれば優先、なければ dayColumns 由来
 *
 * 不変原則: **pure**（IO / Date / random / env なし・**throw しない**・deterministic）。
 *   raw 画像非依存（座標のみ）。gridCalibration は **現 imageW/imageH/dayCount と一致する場合だけ**採用する
 *   （別画像・別月への誤適用を防ぐ）。
 */

import {
  validateGridCalibration,
  type AssistedRowSelection,
} from "./assistedRowSelection";
import { buildShiftGridGeometry } from "./buildShiftGridGeometry";
import { daysInMonth } from "./targetMonth";
import type { ShiftGridGeometry } from "./shiftGridGeometry";

export interface ResolveEffectiveGeometryInput {
  /** 対象 selection（dayColumns / gridCalibration / personRowBand / imageW/H を持つ）。 */
  selection: AssistedRowSelection | undefined;
  /**
   * 任意: 現画像の寸法。指定時はこちらを **current image dims** として誤適用照合 + geometry に使う。
   * 既定は selection.imageW/imageH（selection は per-image なので通常はこれで十分）。
   */
  imageMeta?: { imageW: number; imageH: number };
  /** 対象年（dayCount 算出）。 */
  year: number;
  /** 対象月 1..12。 */
  month: number;
}

/**
 * 採用すべき geometry を解決する（pure・throw しない・deterministic）。
 * - gridCalibration が現コンテキスト（imageW/imageH/dayCount）と整合 → **calibration 由来 geometry を優先**
 *   （X=校正値 gridLeft/colWidth、Y=personRowBand 由来 cropTop/cropHeight）。
 * - gridCalibration なし or 不整合 or 破綻 → **dayColumns 由来 geometry**（buildShiftGridGeometry）。
 * - どちらも無効 → **undefined**（fail-soft）。
 */
export function resolveEffectiveGeometry(
  input: ResolveEffectiveGeometryInput
): ShiftGridGeometry | undefined {
  const { selection, imageMeta, year, month } = input;
  if (!selection) return undefined;

  const imageW = imageMeta?.imageW ?? selection.imageW;
  const imageH = imageMeta?.imageH ?? selection.imageH;
  const dayCount = daysInMonth(year, month);

  // ① gridCalibration が現コンテキストと整合する場合のみ優先採用。
  if (
    selection.gridCalibration &&
    validateGridCalibration(selection.gridCalibration, {
      imageW,
      imageH,
      dayCount,
    }).length === 0
  ) {
    const cal = selection.gridCalibration;
    const cropTop = selection.personRowBand.top;
    const cropHeight =
      selection.personRowBand.bottom - selection.personRowBand.top;
    // X は校正値・Y は personRowBand。縦帯が破綻していなければ採用。
    if (Number.isFinite(cropTop) && cropHeight > 0 && cal.colWidth > 0) {
      return {
        imageWidth: imageW,
        imageHeight: imageH,
        gridLeft: cal.gridLeft,
        colWidth: cal.colWidth,
        cropTop,
        cropHeight,
      };
    }
    // calibration が破綻 → dayColumns fallback へ流す。
  }

  // ② dayColumns 由来（現行の決定論 geometry）。
  if (selection.dayColumns) {
    const r = buildShiftGridGeometry({
      imageW,
      imageH,
      personRowBand: selection.personRowBand,
      dayCount,
      firstDayCenterX: selection.dayColumns.firstDayCenterX,
      lastDayCenterX: selection.dayColumns.lastDayCenterX,
      headerBand: selection.headerBand,
    });
    if (r.ok && r.geometry) return r.geometry;
  }

  // ③ どちらも無効。
  return undefined;
}
