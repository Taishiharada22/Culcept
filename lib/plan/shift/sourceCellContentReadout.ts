/**
 * SR A4-2a — source-cell content readout（pure・**Canvas/DOM 非依存**）
 *
 * 役割: RGBA pixel buffer（2D・row-major）+ セル領域（crop region）を受け取り、領域の**内側中央**を
 *   サンプリングして `cellContentMetric` で content 統計/score を算出する pure adapter。
 *   実際の `canvas.getImageData` 呼び出しは **A4-2b（review effect）**の責務。本 module は配列だけを扱う。
 *
 * 層分離（CEO/GPT E5）:
 *   - A4-2a（本 module）= RGBA 配列 + region → metric（DOM/canvas/DB/VLM/save 非接触）。
 *   - A4-2b = browser canvas から ImageData を取り、本 adapter に渡す。
 *   - 閾値による mismatch 分類は `sourceCellConsistency.detectSourceMismatches`（別層・既存）。
 *
 * 不変原則: pure・**throw しない（fail-open）**・deterministic・**raw 画像/base64 を保持しない**
 *   （戻り値は数値のみ。入力 buffer への参照を返さない）。
 */

import {
  computeCellContentStats,
  cellContentScore,
  type CellContentStats,
  type CellContentThresholds,
} from "./cellContentMetric";

/** RGBA（or RGB）2D pixel buffer の plain shape。browser の `ImageData` が構造的に適合する。 */
export interface PixelBuffer {
  /** row-major pixel data。length ≥ width*height*channels。 */
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** buffer 座標空間でのセル領域（`shiftGridGeometry.CropRegion` と同一 shape）。 */
export interface CellRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 内側サンプリング既定割合（A4-1 実証値・端の罫線/隣接滲みを避ける）。 */
export const DEFAULT_INNER_FRACTION = 0.62;

export interface SourceCellReadoutOptions {
  /** 内側中央サンプリング割合（0<f≤1）。既定 0.62。 */
  innerFraction?: number;
  /** content metric の閾値（既定は cellContentMetric の DEFAULT）。 */
  thresholds?: CellContentThresholds;
  /** pixel あたりチャネル数（既定 4 = RGBA）。3 = RGB。 */
  channels?: number;
}

export interface SourceCellContentReadout {
  /** false = fail-open（無効入力/領域）→ score 0。 */
  ok: boolean;
  /** content score 0..1。 */
  score: number;
  /** content 統計（pixelCount 0 = サンプリングなし）。 */
  stats: CellContentStats;
}

const ZERO_STATS: CellContentStats = {
  pixelCount: 0,
  satRatio: 0,
  rednessRatio: 0,
  darkRatio: 0,
};

function failOpen(): SourceCellContentReadout {
  return { ok: false, score: 0, stats: { ...ZERO_STATS } };
}

function isFiniteInt(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clampInt(v: number, lo: number, hi: number): number {
  const r = Math.round(v);
  return r < lo ? lo : r > hi ? hi : r;
}

/**
 * RGBA buffer の region 内側中央をサンプリングして content readout を返す（pure・fail-open）。
 *   無効な buffer / region / channels、領域が画像外・面積 0 → `{ok:false, score:0}`（throw しない）。
 */
export function readSourceCellContent(
  buffer: PixelBuffer,
  region: CellRegion,
  options: SourceCellReadoutOptions = {}
): SourceCellContentReadout {
  // --- buffer 妥当性 ---
  if (!buffer || !buffer.data || !isFiniteInt(buffer.width) || !isFiniteInt(buffer.height)) {
    return failOpen();
  }
  const W = Math.floor(buffer.width);
  const H = Math.floor(buffer.height);
  const channels = isFiniteInt(options.channels) && options.channels! >= 3 ? Math.floor(options.channels!) : 4;
  if (W <= 0 || H <= 0 || buffer.data.length < W * H * channels) {
    return failOpen();
  }
  // --- region 妥当性 + clamp ---
  if (!region || !isFiniteInt(region.x) || !isFiniteInt(region.y) || !isFiniteInt(region.width) || !isFiniteInt(region.height)) {
    return failOpen();
  }
  if (region.width <= 0 || region.height <= 0) return failOpen();
  const rx0 = clampInt(region.x, 0, W);
  const ry0 = clampInt(region.y, 0, H);
  const rx1 = clampInt(region.x + region.width, 0, W);
  const ry1 = clampInt(region.y + region.height, 0, H);
  if (rx1 <= rx0 || ry1 <= ry0) return failOpen();
  // --- 内側中央（innerFraction） ---
  const f =
    isFiniteInt(options.innerFraction) && options.innerFraction! > 0 && options.innerFraction! <= 1
      ? options.innerFraction!
      : DEFAULT_INNER_FRACTION;
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;
  const mx = (rw * (1 - f)) / 2;
  const my = (rh * (1 - f)) / 2;
  const ix0 = clampInt(rx0 + mx, 0, W);
  const iy0 = clampInt(ry0 + my, 0, H);
  const ix1 = clampInt(rx1 - mx, 0, W);
  const iy1 = clampInt(ry1 - my, 0, H);
  // 内側が潰れたら clamp 済 region 全体にフォールバック
  const sx0 = ix1 > ix0 ? ix0 : rx0;
  const sx1 = ix1 > ix0 ? ix1 : rx1;
  const sy0 = iy1 > iy0 ? iy0 : ry0;
  const sy1 = iy1 > iy0 ? iy1 : ry1;
  // --- RGB 抽出（alpha skip） ---
  const data = buffer.data;
  const rgb: number[] = [];
  for (let y = sy0; y < sy1; y++) {
    const rowBase = y * W * channels;
    for (let x = sx0; x < sx1; x++) {
      const i = rowBase + x * channels;
      rgb.push(data[i], data[i + 1], data[i + 2]);
    }
  }
  if (rgb.length === 0) return failOpen();
  const stats = computeCellContentStats(rgb, options.thresholds);
  return { ok: true, score: cellContentScore(stats), stats };
}
