/**
 * シフト表の格子幾何（calibrated grid geometry）
 *
 * 設計書: docs/alter-plan-shift-import-cell-review-readiness.md §2
 *
 * VLM の bbox に頼らず、表の規則的な格子構造から各日のセル領域を決定論的に算出する。
 * calibration 値（gridLeft / colWidth / cropTop / cropHeight）は per-image・per-template の
 * 自動推定 + ユーザー手動補正で得る（本モジュールは pure な算出のみ）。
 *
 * 不変原則: pure（IO なし）。固定座標決め打ちはせず、calibration を入力に取る（GPT 補正）。
 */

export interface ShiftGridGeometry {
  /** 元画像の幅(px) */
  imageWidth: number;
  /** 元画像の高さ(px) */
  imageHeight: number;
  /** day 1 セルの左端 x(px) */
  gridLeft: number;
  /** 1 列の幅(px) */
  colWidth: number;
  /** crop の縦範囲・上端 y(px)（日付番号〜本人行セルを含めると文脈が分かる） */
  cropTop: number;
  /** crop の縦範囲・高さ(px) */
  cropHeight: number;
}

export interface CropRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * 指定日のセル crop 領域（元画像 px 座標）を算出する。
 * x = gridLeft + (day-1)*colWidth、縦は cropTop/cropHeight 固定帯。
 * 画像範囲を超えないよう clamp する。
 */
export function cellCropRegion(
  geometry: ShiftGridGeometry,
  day: number
): CropRegion {
  const rawX = geometry.gridLeft + (day - 1) * geometry.colWidth;
  const x = Math.max(0, Math.min(rawX, geometry.imageWidth - geometry.colWidth));
  const y = Math.max(0, Math.min(geometry.cropTop, geometry.imageHeight - geometry.cropHeight));
  return {
    x,
    y,
    width: geometry.colWidth,
    height: geometry.cropHeight,
  };
}

/**
 * July 原田 SPRIX crop の calibration（1860×846）。
 * ※ prototype の概算値。実機 calibration（ユーザー補正）の置き換え対象。
 */
export const HARADA_SPRIX_JULY_GEOMETRY: ShiftGridGeometry = {
  imageWidth: 1860,
  imageHeight: 846,
  gridLeft: 400,
  colWidth: 45.4,
  cropTop: 298,
  cropHeight: 52,
};
