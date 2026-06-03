/**
 * M3-1: 控えめ cutout post-process（CEO 補正 3 厳守）
 *
 * 役割:
 *   - backgroundRemovalV1 の出力（hard 0/255 alpha）に対して、 **保守的な** 後処理を提供する。
 *   - 初期 auto cutout に対してだけ適用する（caller 側でゲート。 manual 編集後は呼ばない）。
 *
 * CEO 補正 厳守:
 *   - radius / iter は小さく（既定 closing 1 iter のみ、 opening 0 iter、 feather 0 px）
 *   - 服本体を削る方向に強くしない（既定で前景 alpha を絶対に下げない）
 *   - feather は境界だけ（既定 off。 option で背景側 1 px のみ alpha 微増）
 *   - success 判定を無理に上げない（status / confidence は変えない・本 module の関与外）
 *   - 既存 manual 編集を上書きしない（caller responsibility）
 *
 * モジュール構成:
 *   - 純算法（Node でテスト可）: morphologicalCloseAlpha / morphologicalOpenAlpha / featherBackgroundEdgeAlpha
 *   - browser-only wrapper: applyCutoutPostProcess（dataURL → canvas → 上記 → dataURL）
 *
 * 二値モデル:
 *   - alpha === 255 を前景（服）、 alpha === 0 を背景とする。 中間値（0 < alpha < 255）は触らない。
 */

/* ── tunable defaults（保守寄り） ── */
export const POST_PROCESS_DEFAULTS = Object.freeze({
  /** closing iteration（dilate→erode で 前景の小穴を埋める）。 既定 1。 */
  closeIter: 1,
  /** opening iteration（erode→dilate で 前景の孤立小領域を消す）。 既定 0（OFF。 服本体保護を最優先）。 */
  openIter: 0,
  /** 背景側エッジ画素の alpha 引き上げ幅（0 で完全 OFF）。 既定 0。 */
  bgFeatherAlpha: 0,
});

export interface PostProcessOptions {
  closeIter?: number;
  openIter?: number;
  /** 0..127。 0 で feather OFF。 背景側エッジ画素の alpha を 0→ この値 に持ち上げる（halo 軽減用）。 */
  bgFeatherAlpha?: number;
}

/* ── pure subroutines（Node テスト可） ── */

/**
 * 「背景画素 (alpha=0) のうち 4-neighbor に前景 (alpha=255) を持つもの」を前景化する。
 * dilate(foreground) の二値版。 中間値は触らない（alpha が 0 でも 255 でもない画素は不変）。
 * 入力 alpha は **mutate しない**（新規バッファを返す）。
 */
export function dilateForegroundAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(alpha.length);
  out.set(alpha);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4 + 3; // alpha index
      if (alpha[i] !== 0) continue; // 背景画素のみ対象
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(i - 4);
      if (x < width - 1) neighbors.push(i + 4);
      if (y > 0) neighbors.push(i - width * 4);
      if (y < height - 1) neighbors.push(i + width * 4);
      for (const n of neighbors) {
        if (alpha[n] === 255) {
          out[i] = 255;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * 「前景画素 (alpha=255) のうち 4-neighbor に背景 (alpha=0) を持つもの」を背景化する。
 * erode(foreground) の二値版。 中間値は触らない。 入力 alpha は mutate しない。
 */
export function erodeForegroundAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(alpha.length);
  out.set(alpha);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4 + 3;
      if (alpha[i] !== 255) continue; // 前景画素のみ対象
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(i - 4);
      if (x < width - 1) neighbors.push(i + 4);
      if (y > 0) neighbors.push(i - width * 4);
      if (y < height - 1) neighbors.push(i + width * 4);
      for (const n of neighbors) {
        if (alpha[n] === 0) {
          out[i] = 0;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * Morphological closing = dilate → erode。 前景の小穴を埋める。
 * 服内側に残った背景色 1-2 px の穴を埋める用途。 服本体は削らない（dilate で広げ → erode で戻す）。
 * iter 0 で no-op（入力と同等の新規バッファ）。 入力を mutate しない。
 */
export function morphologicalCloseAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  iter = 1,
): Uint8ClampedArray {
  if (iter <= 0) {
    const copy = new Uint8ClampedArray(alpha.length);
    copy.set(alpha);
    return copy;
  }
  let cur = alpha;
  for (let i = 0; i < iter; i++) {
    cur = erodeForegroundAlpha(dilateForegroundAlpha(cur, width, height), width, height);
  }
  return cur;
}

/**
 * Morphological opening = erode → dilate。 前景の孤立小領域を消す。
 * 既定 OFF。 服が分断された場合（細い紐 1 px 等）に削れるリスクがあるため、 caller が明示的に有効化。
 * iter 0 で no-op。 入力を mutate しない。
 */
export function morphologicalOpenAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  iter = 0,
): Uint8ClampedArray {
  if (iter <= 0) {
    const copy = new Uint8ClampedArray(alpha.length);
    copy.set(alpha);
    return copy;
  }
  let cur = alpha;
  for (let i = 0; i < iter; i++) {
    cur = dilateForegroundAlpha(erodeForegroundAlpha(cur, width, height), width, height);
  }
  return cur;
}

/**
 * 背景側 1 px の境界画素のみ、 alpha を 0 → bgFeatherAlpha に持ち上げる。
 * 前景画素 (alpha=255) は **絶対に触らない**（CEO 補正「服を削らない」厳守）。
 * 中間値 (0<alpha<255) も触らない。
 * bgFeatherAlpha=0 で no-op。 安全上限 127（halo 強度の半透明を超えない）。 入力を mutate しない。
 */
export function featherBackgroundEdgeAlpha(
  alpha: Uint8ClampedArray,
  width: number,
  height: number,
  bgFeatherAlpha = 0,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(alpha.length);
  out.set(alpha);
  if (bgFeatherAlpha <= 0) return out;
  const target = Math.min(127, Math.max(1, Math.floor(bgFeatherAlpha)));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4 + 3;
      if (alpha[i] !== 0) continue; // 背景画素のみ対象
      const neighbors: number[] = [];
      if (x > 0) neighbors.push(i - 4);
      if (x < width - 1) neighbors.push(i + 4);
      if (y > 0) neighbors.push(i - width * 4);
      if (y < height - 1) neighbors.push(i + width * 4);
      for (const n of neighbors) {
        if (alpha[n] === 255) {
          out[i] = target;
          break;
        }
      }
    }
  }
  return out;
}

/**
 * 純算法本体: RGBA バッファに対して closing / opening / feather を順に適用。
 * RGB チャネルは触らない（alpha のみ）。 入力 data を mutate しない（新規バッファを返す）。
 */
export function applyPostProcessToRgba(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: PostProcessOptions = {},
): Uint8ClampedArray {
  const closeIter = options.closeIter ?? POST_PROCESS_DEFAULTS.closeIter;
  const openIter = options.openIter ?? POST_PROCESS_DEFAULTS.openIter;
  const bgFeather = options.bgFeatherAlpha ?? POST_PROCESS_DEFAULTS.bgFeatherAlpha;

  let alpha: Uint8ClampedArray = data;
  if (closeIter > 0) alpha = morphologicalCloseAlpha(alpha, width, height, closeIter);
  if (openIter > 0) alpha = morphologicalOpenAlpha(alpha, width, height, openIter);
  if (bgFeather > 0) alpha = featherBackgroundEdgeAlpha(alpha, width, height, bgFeather);

  // alpha が入力と同一参照（全 no-op）なら、 copy だけ返す（呼出側の mutation 防止）
  if (alpha === data) {
    const copy = new Uint8ClampedArray(data.length);
    copy.set(data);
    return copy;
  }
  return alpha;
}

/* ── browser-only wrapper（dataURL → canvas → 上記 → dataURL） ── */

/** browser-only: PNG dataURL を post-process して新しい PNG dataURL を返す。 失敗時は入力 dataURL を返す（fail-safe）。 */
export async function applyCutoutPostProcess(
  dataUrl: string,
  options: PostProcessOptions = {},
): Promise<string> {
  if (typeof document === "undefined" || typeof window === "undefined") return dataUrl;
  // 全 no-op なら canvas 往復をスキップ
  const closeIter = options.closeIter ?? POST_PROCESS_DEFAULTS.closeIter;
  const openIter = options.openIter ?? POST_PROCESS_DEFAULTS.openIter;
  const bgFeather = options.bgFeatherAlpha ?? POST_PROCESS_DEFAULTS.bgFeatherAlpha;
  if (closeIter <= 0 && openIter <= 0 && bgFeather <= 0) return dataUrl;
  try {
    const img = await loadImageFromDataUrl(dataUrl);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx || canvas.width <= 1 || canvas.height <= 1) return dataUrl;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const out = applyPostProcessToRgba(imageData.data, canvas.width, canvas.height, options);
    const next = ctx.createImageData(canvas.width, canvas.height);
    next.data.set(out);
    ctx.putImageData(next, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return dataUrl;
  }
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("post-process: image load failed"));
    img.src = dataUrl;
  });
}
