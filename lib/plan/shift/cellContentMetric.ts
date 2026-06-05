/**
 * SR A4 — セル content metric（pure・原稿画像セルの「視覚的存在」を測る）
 *
 * 役割: 原稿シフト表の 1 セル領域の RGB pixel 群から、「何か書かれている / 色がついている」度合いを
 *   deterministic に算出する。VLM の confidence を信じず、画像側から source/result 不一致を検出する
 *   A4 guard（sourceCellConsistency）の入力になる。
 *
 * 捕えるもの（複合・CEO D1）:
 *   - **彩度**（saturation）: 色付きセル（E=pink / N=blue / L=lightblue / G=green / BD=pink / E-18=pink）。
 *   - **赤チャネル優位**（redness = R − max(G,B)）: 白セルの赤文字 H / HREQ（背景白でも赤文字を拾う）。
 *   - **暗インク**（low luminance）: 黒系の文字・濃い色セル。
 *   content score = max(彩度比率, 赤文字比率, 暗インク比率)。空っぽの白セル（テクスチャのみ）は低い。
 *
 * 不変原則: pure（IO / LLM / DB / Date / random / env なし）・**throw しない**・deterministic。
 *   pixel 抽出（sharp）は別層。本 module は数値だけを扱う。
 */

/** content 判定の閾値（pixel 単位の floor / ceil）。 */
export interface CellContentThresholds {
  /** 彩度（0..1）これ以上で「色付き」pixel。 */
  satFloor: number;
  /** 赤優位 (R − max(G,B))/255 これ以上で「赤文字」pixel。 */
  redFloor: number;
  /** luminance（0..1）これ以下で「暗インク」pixel。 */
  darkCeil: number;
}

/** 既定閾値（実画像 smoke で調整した保守値）。 */
export const DEFAULT_CONTENT_THRESHOLDS: CellContentThresholds = {
  satFloor: 0.22,
  redFloor: 0.1,
  darkCeil: 0.4,
};

/** セル領域の content 統計（各比率は 0..1）。 */
export interface CellContentStats {
  pixelCount: number;
  /** 彩度 floor 超の pixel 比率（色付きセル）。 */
  satRatio: number;
  /** 赤優位 floor 超の pixel 比率（白セルの赤文字）。 */
  rednessRatio: number;
  /** 暗インク（luminance ≤ darkCeil）の pixel 比率。 */
  darkRatio: number;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/**
 * 連続 RGB（length = 3*N、各 0..255）から content 統計を算出する（pure）。
 * alpha は無視（RGB のみ前提）。空入力は全 0。
 */
export function computeCellContentStats(
  rgb: ArrayLike<number>,
  thresholds: CellContentThresholds = DEFAULT_CONTENT_THRESHOLDS
): CellContentStats {
  const n = Math.floor((rgb?.length ?? 0) / 3);
  if (n <= 0) return { pixelCount: 0, satRatio: 0, rednessRatio: 0, darkRatio: 0 };
  let sat = 0;
  let red = 0;
  let dark = 0;
  for (let i = 0; i < n; i++) {
    const r = clampByte(rgb[i * 3]);
    const g = clampByte(rgb[i * 3 + 1]);
    const b = clampByte(rgb[i * 3 + 2]);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max <= 0 ? 0 : (max - min) / max;
    const redness = (r - Math.max(g, b)) / 255;
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    if (saturation >= thresholds.satFloor) sat++;
    if (redness >= thresholds.redFloor) red++;
    if (lum <= thresholds.darkCeil) dark++;
  }
  return {
    pixelCount: n,
    satRatio: sat / n,
    rednessRatio: red / n,
    darkRatio: dark / n,
  };
}

/** content score = max(彩度, 赤文字, 暗インク)。0..1。 */
export function cellContentScore(stats: CellContentStats): number {
  if (!stats || stats.pixelCount <= 0) return 0;
  return Math.max(stats.satRatio, stats.rednessRatio, stats.darkRatio);
}
