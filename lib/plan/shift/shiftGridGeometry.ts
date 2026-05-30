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
 * 「詰め描画」原画像のカレンダー日 → 物理データ列(1-based) を算出する。
 *
 * 背景（2026-05-30 CEO 観測 + 実測）: 原画像のデータ行は「空の日（コード無し）」に
 * セルを持たず、後続の日が左へ詰まる（例: 25日が空なら 26日のデータが 25列目に来る）。
 * 一方ヘッダーの日番号は 1..31 規則正しく並ぶため、日番号位置に枠を置くと空以降が +1 ずれる。
 *
 * ルール（CEO 指定）: 空の日は数えず、空の日自身は直前の非空列に stay させる。
 *   col(D) = [1..D] の非空日数。空の D では [1..D-1] の非空数 = 直前列に一致。
 *   blankDays が空なら恒等（col(D)=D）。
 */
export function sourceColumnForDay(
  day: number,
  blankDays: readonly number[] = []
): number {
  const blanks = new Set(blankDays);
  let col = 0;
  for (let d = 1; d <= day; d += 1) {
    if (!blanks.has(d)) col += 1;
  }
  return Math.max(1, col);
}

/**
 * July 原田 SPRIX の calibration（1860×846）。
 *
 * ground-truth 校正（2026-05-30, Playwright + canvas でヘッダー日番号の列中心を実測）:
 *   検出した数字中心 = 301,353,…,1795（均一 51.5px）。
 *   index0(301) が day1 か day2 かが原点を決める。CEO の構造的観測が決定打:
 *   「gridLeft=224 では day1 が左隣の公休列を指し、day25 が day24」=「301=day1」を確定
 *   （細い「1」を別要素と誤認し一時 301=day2 と推論したのは誤り）。
 *   → box 中心を数字中心に一致させる gridLeft = 301 − 51.5/2 ≈ 275、colWidth = 51.5。
 *   検証: box_center(D)=275+(D-0.5)*51.5 は digit_center(D)=301+(D-1)*51.5 と全日 <0.5px 一致。
 *   （旧 298 は +0.45 セルで CEO に +1=day26 と見え、224 は −1 セルで公休にずれた。275 が中心）
 * ※ 縦(cropTop/Height)は CEO 許容範囲。微調整は実機 calibration UI（将来）。
 */
export const HARADA_SPRIX_JULY_GEOMETRY: ShiftGridGeometry = {
  imageWidth: 1860,
  imageHeight: 846,
  gridLeft: 275,
  colWidth: 51.5,
  cropTop: 298,
  cropHeight: 52,
};
