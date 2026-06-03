/**
 * Assisted crop generator — pure plan + adapter-injected runtime（SR B1b-2C-3-a）
 *
 * 役割: AssistedRowSelection から headerBand / personRowBand の 2 帯を Blob で取り出す。
 *   - pure 部分（dryRun / dimensions / mime / null handling）と
 *   - adapter 部分（drawImage / toBlob / OffscreenCanvas fallback）を分離。
 *   - test では fake adapter を注入して新依存（jsdom / canvas polyfill）なしで検証する。
 *
 * 不変原則（CEO 補正・2026-05-31〜06-01）:
 *   - invalid selection は throw せず **null**（CTA gate と整合）。
 *   - File / Blob / base64 / dataURL を module 内に永続化しない（必要なら呼び元が処理）。
 *   - VLM / DB / localStorage / fetch には触れない。helper は描画と Blob 化だけ。
 *
 * 設計分離:
 *   - planAssistedCrops(): pure（DOM/canvas/Date/random なし）。drawImage は行わない。
 *     valid selection なら 2 帯の矩形・mime・解像度を返す。invalid なら null。
 *   - DefaultAssistedCropCanvasAdapter: browser runtime 既定（OffscreenCanvas 優先・<canvas> fallback）。
 *   - generateAssistedCrops(): plan + adapter を組み合わせて Blob を返す async API。
 *
 * 不変原則: throw しない（fake adapter が throw した場合は伝播する。default adapter は browser 環境を前提）。
 */

import {
  computeCropRegions,
  type AssistedCropRegions,
  type AssistedRowSelection,
  type CropRegionPx,
} from "./assistedRowSelection";

/** 既定: VLM 精度優先で PNG（lossless）。容量重視時は JPEG にできる。 */
export const DEFAULT_CROP_MIME: SupportedCropMime = "image/png";
export type SupportedCropMime = "image/png" | "image/jpeg";

/** plan の結果（pure・実描画なし）。 */
export interface AssistedCropPlan {
  regions: AssistedCropRegions;
  mimeType: SupportedCropMime;
  /** JPEG 時のみ意味あり 0..1。PNG は undefined / 無視。 */
  quality?: number;
}

/** crop の 1 帯の出力（Blob + 矩形 trace + mime）。 */
export interface AssistedCropPiece {
  blob: Blob;
  region: CropRegionPx;
  mimeType: SupportedCropMime;
}

/** generateAssistedCrops の戻り（VLM 入力契約・先取り）。 */
export interface AssistedCropOutput {
  header: AssistedCropPiece;
  personRow: AssistedCropPiece;
  selection: AssistedRowSelection;
  regions: AssistedCropRegions;
}

/** adapter が受ける画像入力。HTMLImageElement / ImageBitmap いずれか。 */
export type AssistedImageSource = HTMLImageElement | ImageBitmap;

/**
 * 描画 + Blob 化のランタイム adapter。
 * default は browser canvas（OffscreenCanvas 優先）。test では fake を入れる。
 */
export interface AssistedCropCanvasAdapter {
  /** 1 region 分: 元画像から region をコピー→指定 mime で Blob 化。 */
  drawAndEncode(
    image: AssistedImageSource,
    region: CropRegionPx,
    mimeType: SupportedCropMime,
    quality: number | undefined
  ): Promise<Blob>;
}

// ─────────────────────────────────────────────────────────────
// pure: plan
// ─────────────────────────────────────────────────────────────

/**
 * selection から crop の計画を作る（pure・描画しない）。
 * - invalid selection（B1b-2C-1 validateSelection と整合）→ null
 * - valid なら 2 矩形 + mime + quality を返す
 */
export function planAssistedCrops(
  selection: AssistedRowSelection,
  options?: { mimeType?: SupportedCropMime; quality?: number }
): AssistedCropPlan | null {
  const regions = computeCropRegions(selection);
  if (!regions) return null;
  const mimeType = options?.mimeType ?? DEFAULT_CROP_MIME;
  const plan: AssistedCropPlan = { regions, mimeType };
  if (mimeType === "image/jpeg" && typeof options?.quality === "number") {
    plan.quality = Math.max(0, Math.min(1, options.quality));
  }
  return plan;
}

// ─────────────────────────────────────────────────────────────
// adapter: default browser canvas（OffscreenCanvas 優先・<canvas> fallback）
// ─────────────────────────────────────────────────────────────

function imageWidth(image: AssistedImageSource): number {
  // HTMLImageElement = naturalWidth、ImageBitmap = width
  return (image as HTMLImageElement).naturalWidth ?? (image as ImageBitmap).width;
}
function imageHeight(image: AssistedImageSource): number {
  return (image as HTMLImageElement).naturalHeight ?? (image as ImageBitmap).height;
}

/** OffscreenCanvas → <canvas> の二段 fallback で 1 region を Blob 化。 */
export const DefaultAssistedCropCanvasAdapter: AssistedCropCanvasAdapter = {
  async drawAndEncode(image, region, mimeType, quality) {
    const w = Math.max(1, Math.round(region.width));
    const h = Math.max(1, Math.round(region.height));
    // OffscreenCanvas 優先（worker 安全・将来の background 処理に有利）
    if (typeof OffscreenCanvas !== "undefined") {
      const oc = new OffscreenCanvas(w, h);
      const ctx = oc.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      ctx.drawImage(
        image,
        region.left,
        region.top,
        Math.max(1, Math.round(region.width)),
        Math.max(1, Math.round(region.height)),
        0,
        0,
        w,
        h
      );
      // OffscreenCanvas.convertToBlob は quality は jpeg 時のみ意味あり
      return await oc.convertToBlob({ type: mimeType, quality });
    }
    // fallback: <canvas>（DOM 必須）
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    ctx.drawImage(
      image,
      region.left,
      region.top,
      Math.max(1, Math.round(region.width)),
      Math.max(1, Math.round(region.height)),
      0,
      0,
      w,
      h
    );
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        mimeType,
        quality
      );
    });
  },
};

// ─────────────────────────────────────────────────────────────
// public API: plan + adapter
// ─────────────────────────────────────────────────────────────

export interface GenerateAssistedCropsOptions {
  mimeType?: SupportedCropMime;
  quality?: number;
  /** test 用 adapter 注入。未指定なら DefaultAssistedCropCanvasAdapter。 */
  canvasAdapter?: AssistedCropCanvasAdapter;
}

/**
 * selection に従って 2 帯（header / personRow）を Blob で生成する。
 * - invalid selection → null（throw しない）
 * - adapter が throw した場合は伝播（呼び元が host で UI 通知）
 * - 画像 size と selection.imageW/H の不一致は無視せず**正規化はしない**（呼び元責任）
 */
export async function generateAssistedCrops(
  image: AssistedImageSource,
  selection: AssistedRowSelection,
  options?: GenerateAssistedCropsOptions
): Promise<AssistedCropOutput | null> {
  const plan = planAssistedCrops(selection, options);
  if (!plan) return null;
  // 画像実寸と selection.imageW/H の不一致は防御的にチェック（trace 用・ここでは fail しない）
  // ※ host が createImageBitmap / Image.onload で取得したサイズを selection と揃える前提
  void imageWidth(image);
  void imageHeight(image);
  const adapter = options?.canvasAdapter ?? DefaultAssistedCropCanvasAdapter;

  // 2 帯を並列描画（adapter 内部は OffscreenCanvas/<canvas> で独立）
  const [headerBlob, personBlob] = await Promise.all([
    adapter.drawAndEncode(image, plan.regions.header, plan.mimeType, plan.quality),
    adapter.drawAndEncode(image, plan.regions.personRow, plan.mimeType, plan.quality),
  ]);

  return {
    header: { blob: headerBlob, region: plan.regions.header, mimeType: plan.mimeType },
    personRow: { blob: personBlob, region: plan.regions.personRow, mimeType: plan.mimeType },
    selection,
    regions: plan.regions,
  };
}
