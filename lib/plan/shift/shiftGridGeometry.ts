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
 * July 原田 SPRIX の calibration（1860×846）。
 *
 * ground-truth 校正（2026-05-30, Playwright + canvas でヘッダー日番号の列中心を実測）:
 *   検出した数字中心 = day2..31 の 301,353,…,1795（均一 51.5px）。
 *   day1 の細い「1」は輝度閾下で未検出 → 外挿で中心 249.5。
 *   → day1 セル左端 = 249.5 − 51.5/2 ≈ 224、colWidth = 51.5。
 * 裏付け: 旧 gridLeft=298 では「day25 に合わせると day26 が光る」（CEO 観測）。
 *   旧 box center=1550 が true day26(≈1537) に乗る計算と一致し、検出 index0=day2 を確証。
 *   新値は全日 <1px で整合（旧 247/51.1 は day25 のみ合致し低day で +20px 残存の近似）。
 * ※ 縦(cropTop/Height)は CEO 許容範囲。微調整は実機 calibration UI（将来）。
 */
export const HARADA_SPRIX_JULY_GEOMETRY: ShiftGridGeometry = {
  imageWidth: 1860,
  imageHeight: 846,
  gridLeft: 224,
  colWidth: 51.5,
  cropTop: 298,
  cropHeight: 52,
};
