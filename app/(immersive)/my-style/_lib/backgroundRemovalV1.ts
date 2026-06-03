/**
 * Local Cutout Heuristic v1 — pure, isolated, DOM-free (C1L-2)
 *
 * 目的:
 *   - 既存 `backgroundRemoval.ts`（corner-sample + edge flood-fill）の構造的弱点を補う、
 *     **外部依存なし**の改良版背景除去ヒューリスティック。
 *   - 本モジュールは **純関数**（File / canvas / DOM / Image に触れない）。 入力は生 RGBA
 *     （`Uint8ClampedArray` + width + height）、 出力は mask + confidence + status + bbox。
 *     → Node でも synthetic ピクセルで直接テストできる。 ブラウザ glue（decode/encode）は別スライス。
 *
 * 既存との関係（重要）:
 *   - `backgroundRemoval.ts` の `removeBackground()` は **一切変更しない**（/plan 描画時 cutout への影響回避）。
 *   - 本 v1 は新規 module。 My-Style 登録 / /plan / cutoutUrl 保存には **接続しない**（C1L-2 は純算法のみ）。
 *
 * 設計方針（保守的）:
 *   - 品質が悪い cutout を無理に success にしない。 曖昧なら `needs_review`、 破綻なら `failed`。
 *   - 白い服を白背景として消さない / 黒い服・靴を影として消さない（luminance floor・彩度・隣接で保護）。
 *   - mask: 1 = background（除去対象）, 0 = subject（残す）。
 */

export type CutoutStatus = "success" | "needs_review" | "failed" | "skipped";

/** 正規化矩形（0..1）。 撮影ガイド枠を「枠外＝強い背景シード」として使う prior（hard-crop しない）。 */
export interface CutoutFrame {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface CutoutV1Options {
  /** 明示 tolerance（未指定なら背景の均一度から適応決定）。 */
  tolerance?: number;
  /** 撮影ガイド枠（枠外を追加の背景シードにする）。 */
  frame?: CutoutFrame;
}

export interface CutoutV1Signals {
  /** 背景と判定された画素の比率。 */
  bgRatio: number;
  /** 辺色の一貫性（1=均一背景、0=バラバラ）。 */
  edgeConsistency: number;
  /** subject が単一の塊か（最大連結成分 / subject 総数、1=単塊）。 */
  subjectConnectedness: number;
  /** subject が四辺のうちいくつに接しているか（0..1、 高い＝flood-fill が背景を取り切れていない兆候）。 */
  subjectEdgeTouch: number;
  /** subject bbox 面積 / 全体。 */
  bboxCoverage: number;
  /** 囲み穴 pass で除去した比率（大きい＝曖昧）。 */
  holePassRatio: number;
  /** 影 pass で除去した比率（大きい＝曖昧）。 */
  shadowPassRatio: number;
}

export interface CutoutBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface CutoutV1Result {
  /** 1 = background, 0 = subject。 全 pass 適用後。 */
  mask: Uint8Array;
  width: number;
  height: number;
  confidence: number;
  status: CutoutStatus;
  /** subject の bounding box（trim 用、 small padding 込み）。 subject 無しなら null。 */
  bbox: CutoutBounds | null;
  bgColor: [number, number, number];
  tolerance: number;
  signals: CutoutV1Signals;
}

/* ── tunable constants（保守寄り） ── */
const BASE_TOLERANCE = 50;
const TOL_MIN = 28;
const TOL_MAX = 90;
const HOLE_TOL_FACTOR = 0.7; // 囲み穴は edge tol より厳しく
const HOLE_MAX_RATIO = 0.12; // 1 つの穴が全体の 12% 超なら穴ではない（消し過ぎ防止）
const HOLE_MIN_AREA_RATIO = 0.0002;
const SHADOW_SAT_MAX = 0.18; // 低彩度のみ影候補
const SHADOW_LUM_FLOOR = 60; // これより暗い画素は消さない（黒い服・靴を保護）
const SHADOW_TOL = 130; // 影は背景から色距離やや遠くても、低彩度＋隣接＋暗いなら許容
const SHADOW_ITERATIONS = 3;
const SUCCESS_TH = 0.68;
const REVIEW_TH = 0.42;
const MIN_SUBJECT_RATIO = 0.03; // subject がこれ未満＝消し過ぎ → failed
const MIN_BG_RATIO = 0.04; // 背景がこれ未満＝ほぼ消せていない → failed
const BBOX_PADDING_RATIO = 0.04;

/* ── color helpers ── */
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** 0..1 の彩度（HSV S 相当の簡易版）。 */
function saturation(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max <= 0) return 0;
  return (max - min) / max;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

/* ── 1. 辺全体からの背景サンプリング（四隅依存をやめる） ── */
export function sampleEdgeColors(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Array<[number, number, number]> {
  const samples: Array<[number, number, number]> = [];
  const stride = Math.max(1, Math.floor(Math.min(width, height) / 64));
  const push = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    samples.push([data[idx], data[idx + 1], data[idx + 2]]);
  };
  for (let x = 0; x < width; x += stride) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y += stride) {
    push(0, y);
    push(width - 1, y);
  }
  return samples;
}

/** 辺サンプルの代表背景色（チャネル別 median）＋ spread（外れ値に頑健な均一度指標）。 */
export function representativeBackground(samples: Array<[number, number, number]>): {
  color: [number, number, number];
  spread: number;
} {
  if (samples.length === 0) return { color: [255, 255, 255], spread: 0 };
  const rs = samples.map((s) => s[0]);
  const gs = samples.map((s) => s[1]);
  const bs = samples.map((s) => s[2]);
  const color: [number, number, number] = [median(rs), median(gs), median(bs)];
  // spread = median 周りの平均絶対偏差（色距離ベース）。
  let dev = 0;
  for (const [r, g, b] of samples) dev += colorDistance(r, g, b, color[0], color[1], color[2]);
  const spread = dev / samples.length;
  return { color, spread };
}

/* ── 2. adaptive tolerance ── */
function adaptiveTolerance(bg: [number, number, number], spread: number): number {
  let tol = BASE_TOLERANCE;
  const lum = luminance(bg[0], bg[1], bg[2]);
  if (lum > 200) tol *= 1.1; // 明るい無地背景はやや広め
  if (lum < 70) tol *= 0.85; // 暗背景は慎重
  if (spread > 40) tol *= 0.82; // 背景が不均一なら subject を消さないよう絞る
  return Math.max(TOL_MIN, Math.min(TOL_MAX, Math.round(tol)));
}

/* ── 3. edge flood-fill（辺 + 枠外シードから） ── */
function floodFillFromEdges(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  bg: [number, number, number],
  tolerance: number,
  frame?: CutoutFrame,
): Uint8Array {
  const mask = new Uint8Array(width * height); // 0=subject 1=bg
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const isBg = (pos: number): boolean => {
    const idx = pos * 4;
    return colorDistance(data[idx], data[idx + 1], data[idx + 2], bg[0], bg[1], bg[2]) <= tolerance;
  };
  const seed = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return;
    const pos = y * width + x;
    if (visited[pos]) return;
    visited[pos] = 1;
    if (isBg(pos)) {
      mask[pos] = 1;
      queue[tail++] = pos;
    }
  };

  // 辺シード
  for (let x = 0; x < width; x++) {
    seed(x, 0);
    seed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    seed(0, y);
    seed(width - 1, y);
  }
  // 枠外シード（撮影ガイド prior。 hard-crop ではなく「背景の確度を上げる」だけ）
  if (frame) {
    const fx0 = Math.round(frame.x0 * width);
    const fy0 = Math.round(frame.y0 * height);
    const fx1 = Math.round(frame.x1 * width);
    const fy1 = Math.round(frame.y1 * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (x < fx0 || x > fx1 || y < fy0 || y > fy1) seed(x, y);
      }
    }
  }

  // BFS（head pointer queue。 shift() は O(n) なので使わない）
  while (head < tail) {
    const pos = queue[head++];
    const x = pos % width;
    const y = (pos - x) / width;
    if (x > 0) seed(x - 1, y);
    if (x < width - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < height - 1) seed(x, y + 1);
  }
  return mask;
}

/* ── 4. 囲み穴 pass（edge に繋がっていない背景色領域を保守的に抜く） ── */
function enclosedHolePass(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  bg: [number, number, number],
  holeTol: number,
  total: number,
): number {
  const maxArea = Math.floor(total * HOLE_MAX_RATIO);
  const minArea = Math.max(8, Math.floor(total * HOLE_MIN_AREA_RATIO));
  const seen = new Uint8Array(width * height);
  const comp = new Int32Array(width * height);
  let removed = 0;

  const nearBg = (pos: number): boolean => {
    const idx = pos * 4;
    return colorDistance(data[idx], data[idx + 1], data[idx + 2], bg[0], bg[1], bg[2]) <= holeTol;
  };

  for (let start = 0; start < width * height; start++) {
    if (seen[start] || mask[start] === 1 || !nearBg(start)) continue;
    // 連結成分（subject かつ背景色に近い画素）を収集
    let count = 0;
    let touchesBorder = false;
    let qh = 0;
    let qt = 0;
    seen[start] = 1;
    comp[qt++] = start;
    while (qh < qt) {
      const pos = comp[qh++];
      const x = pos % width;
      const y = (pos - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesBorder = true;
      count++;
      const neighbors = [x > 0 ? pos - 1 : -1, x < width - 1 ? pos + 1 : -1, y > 0 ? pos - width : -1, y < height - 1 ? pos + width : -1];
      for (const np of neighbors) {
        if (np < 0 || seen[np] || mask[np] === 1 || !nearBg(np)) continue;
        seen[np] = 1;
        comp[qt++] = np;
      }
    }
    // 「囲まれている（border 非接触）」かつ「小〜中サイズ」かつ「背景色に近い」→ 穴として除去
    if (!touchesBorder && count >= minArea && count <= maxArea) {
      for (let i = 0; i < qt; i++) {
        mask[comp[i]] = 1;
        removed++;
      }
    }
  }
  return removed;
}

/* ── 5. 影 pass（背景色に近い低彩度の影を、 黒物体を守りつつ除去） ── */
function shadowPass(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  mask: Uint8Array,
  bg: [number, number, number],
  total: number,
): number {
  const bgLum = luminance(bg[0], bg[1], bg[2]);
  let removed = 0;
  for (let iter = 0; iter < SHADOW_ITERATIONS; iter++) {
    const toRemove: number[] = [];
    for (let pos = 0; pos < total; pos++) {
      if (mask[pos] === 1) continue; // 既に背景
      const x = pos % width;
      const y = (pos - x) / width;
      // 背景画素に隣接しているか（影は背景境界に出る）
      const adjBg =
        (x > 0 && mask[pos - 1] === 1) ||
        (x < width - 1 && mask[pos + 1] === 1) ||
        (y > 0 && mask[pos - width] === 1) ||
        (y < height - 1 && mask[pos + width] === 1);
      if (!adjBg) continue;
      const idx = pos * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = luminance(r, g, b);
      if (lum <= SHADOW_LUM_FLOOR) continue; // 黒い服・靴を保護
      if (lum >= bgLum) continue; // 影は背景より暗い
      if (saturation(r, g, b) > SHADOW_SAT_MAX) continue; // 彩度ある色は影でない
      if (colorDistance(r, g, b, bg[0], bg[1], bg[2]) > SHADOW_TOL) continue;
      toRemove.push(pos);
    }
    if (toRemove.length === 0) break;
    for (const pos of toRemove) {
      mask[pos] = 1;
      removed++;
    }
  }
  return removed;
}

/* ── 6. subject bounding box ── */
export function findSubjectBounds(mask: Uint8Array, width: number, height: number): CutoutBounds | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY };
}

function withPadding(bounds: CutoutBounds | null, width: number, height: number): CutoutBounds | null {
  if (!bounds) return null;
  const padX = Math.round(width * BBOX_PADDING_RATIO);
  const padY = Math.round(height * BBOX_PADDING_RATIO);
  return {
    minX: Math.max(0, bounds.minX - padX),
    minY: Math.max(0, bounds.minY - padY),
    maxX: Math.min(width - 1, bounds.maxX + padX),
    maxY: Math.min(height - 1, bounds.maxY + padY),
  };
}

/* ── 7. signals / confidence / status ── */
function countMask(mask: Uint8Array): number {
  let c = 0;
  for (let i = 0; i < mask.length; i++) c += mask[i];
  return c;
}

function edgeConsistencyScore(spread: number): number {
  return Math.max(0, Math.min(1, 1 - spread / 60));
}

/** subject の最大連結成分比（connectedness）と、 四辺接触数（edgeTouch）。 */
function subjectTopology(
  mask: Uint8Array,
  width: number,
  height: number,
  subjectCount: number,
): { connectedness: number; edgeTouch: number } {
  if (subjectCount === 0) return { connectedness: 0, edgeTouch: 0 };
  const seen = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  let largest = 0;
  const touchedEdges = new Set<string>();
  for (let start = 0; start < width * height; start++) {
    if (seen[start] || mask[start] === 1) continue;
    let count = 0;
    let sp = 0;
    seen[start] = 1;
    stack[sp++] = start;
    while (sp > 0) {
      const pos = stack[--sp];
      const x = pos % width;
      const y = (pos - x) / width;
      count++;
      if (x === 0) touchedEdges.add("L");
      if (x === width - 1) touchedEdges.add("R");
      if (y === 0) touchedEdges.add("T");
      if (y === height - 1) touchedEdges.add("B");
      const neighbors = [x > 0 ? pos - 1 : -1, x < width - 1 ? pos + 1 : -1, y > 0 ? pos - width : -1, y < height - 1 ? pos + width : -1];
      for (const np of neighbors) {
        if (np < 0 || seen[np] || mask[np] === 1) continue;
        seen[np] = 1;
        stack[sp++] = np;
      }
    }
    if (count > largest) largest = count;
  }
  return { connectedness: largest / subjectCount, edgeTouch: touchedEdges.size / 4 };
}

function scoreConfidence(s: CutoutV1Signals): number {
  // 各信号を 0..1 の「良さ」に写像して加重平均（保守的：曖昧要素は減点）。
  const bgRatioGood = s.bgRatio >= 0.15 && s.bgRatio <= 0.85 ? 1 : s.bgRatio >= 0.05 && s.bgRatio <= 0.95 ? 0.5 : 0;
  const coverageGood = s.bboxCoverage >= 0.08 && s.bboxCoverage <= 0.9 ? 1 : 0.3;
  const edgeTouchGood = 1 - Math.min(1, s.subjectEdgeTouch); // 四辺接触が多いほど減点
  const holePenalty = 1 - Math.min(1, s.holePassRatio / HOLE_MAX_RATIO); // 穴除去が多いと曖昧
  const shadowPenalty = 1 - Math.min(1, s.shadowPassRatio / 0.15);
  const weights: Array<[number, number]> = [
    [s.edgeConsistency, 0.26],
    [s.subjectConnectedness, 0.22],
    [bgRatioGood, 0.16],
    [edgeTouchGood, 0.14],
    [coverageGood, 0.1],
    [holePenalty, 0.06],
    [shadowPenalty, 0.06],
  ];
  let sum = 0;
  let wsum = 0;
  for (const [v, w] of weights) {
    sum += v * w;
    wsum += w;
  }
  return Math.max(0, Math.min(1, sum / wsum));
}

function decideStatus(
  confidence: number,
  signals: CutoutV1Signals,
  subjectCount: number,
  total: number,
): CutoutStatus {
  if (subjectCount === 0 || subjectCount < total * MIN_SUBJECT_RATIO) return "failed"; // 消し過ぎ / subject 喪失
  if (signals.bgRatio < MIN_BG_RATIO) return "failed"; // ほぼ消せていない
  if (confidence >= SUCCESS_TH) return "success";
  if (confidence >= REVIEW_TH) return "needs_review";
  return "failed";
}

function skippedResult(width: number, height: number): CutoutV1Result {
  return {
    mask: new Uint8Array(Math.max(0, width * height)),
    width,
    height,
    confidence: 0,
    status: "skipped",
    bbox: null,
    bgColor: [255, 255, 255],
    tolerance: BASE_TOLERANCE,
    signals: {
      bgRatio: 0,
      edgeConsistency: 0,
      subjectConnectedness: 0,
      subjectEdgeTouch: 0,
      bboxCoverage: 0,
      holePassRatio: 0,
      shadowPassRatio: 0,
    },
  };
}

/* ── public: 純算法本体 ── */
export function computeCutoutV1(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: CutoutV1Options = {},
): CutoutV1Result {
  const total = width * height;
  if (width <= 1 || height <= 1 || data.length < total * 4) return skippedResult(width, height);

  // 1. 辺サンプリング → 代表背景色 + spread
  const { color: bg, spread } = representativeBackground(sampleEdgeColors(data, width, height));
  // 2. 適応 tolerance
  const tolerance = options.tolerance ?? adaptiveTolerance(bg, spread);
  // 3. edge flood-fill（+ 枠外シード）
  const mask = floodFillFromEdges(data, width, height, bg, tolerance, options.frame);
  // 4. 囲み穴 pass
  const holeRemoved = enclosedHolePass(data, width, height, mask, bg, tolerance * HOLE_TOL_FACTOR, total);
  // 5. 影 pass
  const shadowRemoved = shadowPass(data, width, height, mask, bg, total);

  // signals
  const bgCount = countMask(mask);
  const subjectCount = total - bgCount;
  const bounds = findSubjectBounds(mask, width, height);
  const bboxCoverage = bounds
    ? ((bounds.maxX - bounds.minX + 1) * (bounds.maxY - bounds.minY + 1)) / total
    : 0;
  const { connectedness, edgeTouch } = subjectTopology(mask, width, height, subjectCount);
  const signals: CutoutV1Signals = {
    bgRatio: bgCount / total,
    edgeConsistency: edgeConsistencyScore(spread),
    subjectConnectedness: connectedness,
    subjectEdgeTouch: edgeTouch,
    bboxCoverage,
    holePassRatio: holeRemoved / total,
    shadowPassRatio: shadowRemoved / total,
  };
  const confidence = scoreConfidence(signals);
  const status = decideStatus(confidence, signals, subjectCount, total);

  return {
    mask,
    width,
    height,
    confidence,
    status,
    bbox: withPadding(bounds, width, height),
    bgColor: bg,
    tolerance,
    signals,
  };
}

/**
 * mask を RGBA に適用し、 背景画素の alpha を 0 にした新しいバッファを返す（純関数）。
 * ブラウザ側の encode（canvas.toDataURL）glue は別スライス。 ここでは保存しない。
 */
export function applyMaskAlpha(data: Uint8ClampedArray, mask: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(data.length);
  out.set(data);
  for (let i = 0; i < mask.length; i++) {
    if (mask[i] === 1) out[i * 4 + 3] = 0;
  }
  return out;
}
