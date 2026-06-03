/**
 * Combined draft image — pure plan + adapter（SR B1b-2C-9-FIX）
 *
 * 役割: 日付ヘッダ帯（headerBand）と本人行帯（personRowBand）を、
 *   **同じ横幅・同じ X 軸で上下に結合した 1 枚画像**として生成する。
 *
 * 背景（2026-06-01 Phase A smoke FAIL の構造分析）:
 *   - 現行は header crop / personRow crop を **2 枚別画像**で VLM に渡している。
 *   - 密な 31 列表で、VLM は 2 枚間の列対応（column registration）を保持できず、
 *     「コードは原田行に近いが、日付ヘッダとの対応が途中でズレる」症状が出た。
 *   - computeCropRegions は両帯とも full-width（left=0, width=imageW）→ 縦に積めば
 *     X 軸が自動的に完全一致する。「day N の真下が code N」を 1 枚で見せられる。
 *
 * 本 module の位置づけ（9-FIX scope）:
 *   - **生成 + preview のための画像を作るだけ**。VLM 入力への配線・prompt 変更は次 gate。
 *   - pure plan（描画なし）+ adapter（canvas draw）の分離は assistedCropGenerator と同型。
 *   - **File / Blob / base64 を module 内に永続化しない**（呼び元が ObjectURL 化して preview）。
 *
 * 不変原則: planCombinedDraftImage は pure（DOM/canvas/Date/random なし）。invalid は null。
 */

import {
  computeCropRegions,
  type AssistedRowSelection,
  type CropRegionPx,
} from "./assistedRowSelection";
import type {
  AssistedImageSource,
  SupportedCropMime,
} from "./assistedCropGenerator";
import { DEFAULT_CROP_MIME } from "./assistedCropGenerator";

/** 結合画像の計画（pure・実描画なし）。 */
export interface CombinedDraftPlan {
  /** 結合キャンバス幅（= 両帯の最大幅 × scale）。 */
  combinedWidth: number;
  /** 結合キャンバス高さ（=（headerHeight + personRowHeight）× scale）。 */
  combinedHeight: number;
  /** 元画像から切り出す header 矩形（元画像座標）。 */
  headerRegion: CropRegionPx;
  /** 元画像から切り出す personRow 矩形（元画像座標）。 */
  personRowRegion: CropRegionPx;
  /** 結合キャンバス内の header 描画先（上段・scale 適用後座標）。 */
  headerDest: CropRegionPx;
  /** 結合キャンバス内の personRow 描画先（下段・scale 適用後座標）。 */
  personRowDest: CropRegionPx;
  /** 上下段の境界 y（scale 適用後・薄ガイド描画位置）。 */
  midlineY: number;
  /** SR B1b-2C-9-FIX-2: scale 倍率（1 = upscale なし / 2 = 2x）。 */
  scale: number;
  /** SR B1b-2C-9-FIX-2: 薄い上下段境界ガイドを描画するか。 */
  gridline: boolean;
  mimeType: SupportedCropMime;
  quality?: number;
}

export interface PlanCombinedDraftOptions {
  mimeType?: SupportedCropMime;
  quality?: number;
  /**
   * SR B1b-2C-9-FIX-2: target 最小幅（px）。元画像幅がこの値未満なら自動 2x upscale。
   *   既定 0（upscale なし＝既存挙動）。**3x 以上は CEO 指示で初期不採用**。
   */
  minWidth?: number;
  /** SR B1b-2C-9-FIX-2: 薄い上下段境界ガイドを描画するか。既定 false。 */
  gridline?: boolean;
}

/**
 * selection から結合画像の計画を作る（pure）。
 * - invalid selection（computeCropRegions が null）→ null。
 * - 両帯 full-width 前提。幅は両帯の最大（通常は同一= imageW）。
 * - header を上段（y=0）、personRow を下段（y=headerHeight）に積む。
 */
export function planCombinedDraftImage(
  selection: AssistedRowSelection,
  options?: PlanCombinedDraftOptions
): CombinedDraftPlan | null {
  const regions = computeCropRegions(selection);
  if (!regions) return null;

  const baseWidth = Math.max(regions.header.width, regions.personRow.width);
  const headerHeight = regions.header.height;
  const personRowHeight = regions.personRow.height;

  // SR B1b-2C-9-FIX-2: minWidth 指定時は 2x upscale を自動採用（3x は初期不採用）。
  //   - 元画像幅が minWidth 以上 → scale=1（upscale なし）
  //   - 未満 → scale=2 で文字・罫線が潰れないように
  const minWidth = options?.minWidth ?? 0;
  const scale = minWidth > 0 && baseWidth < minWidth ? 2 : 1;

  const combinedWidth = baseWidth * scale;
  const scaledHeaderHeight = headerHeight * scale;
  const scaledPersonHeight = personRowHeight * scale;
  const combinedHeight = scaledHeaderHeight + scaledPersonHeight;

  const mimeType = options?.mimeType ?? DEFAULT_CROP_MIME;
  const plan: CombinedDraftPlan = {
    combinedWidth,
    combinedHeight,
    headerRegion: regions.header,
    personRowRegion: regions.personRow,
    headerDest: { left: 0, top: 0, width: combinedWidth, height: scaledHeaderHeight },
    personRowDest: {
      left: 0,
      top: scaledHeaderHeight,
      width: combinedWidth,
      height: scaledPersonHeight,
    },
    midlineY: scaledHeaderHeight,
    scale,
    gridline: options?.gridline ?? false,
    mimeType,
  };
  if (mimeType === "image/jpeg" && typeof options?.quality === "number") {
    plan.quality = Math.max(0, Math.min(1, options.quality));
  }
  return plan;
}

/** 結合描画の runtime adapter（2 領域を 1 キャンバスに積む）。test では fake を注入。 */
export interface CombinedCanvasAdapter {
  drawCombined(
    image: AssistedImageSource,
    plan: CombinedDraftPlan
  ): Promise<Blob>;
}

/** OffscreenCanvas → <canvas> の二段 fallback で 2 帯を 1 枚に結合。 */
export const DefaultCombinedCanvasAdapter: CombinedCanvasAdapter = {
  async drawCombined(image, plan) {
    const w = Math.max(1, Math.round(plan.combinedWidth));
    const h = Math.max(1, Math.round(plan.combinedHeight));
    const draw = (ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D) => {
      // 上段: header
      ctx.drawImage(
        image,
        plan.headerRegion.left,
        plan.headerRegion.top,
        Math.max(1, Math.round(plan.headerRegion.width)),
        Math.max(1, Math.round(plan.headerRegion.height)),
        plan.headerDest.left,
        plan.headerDest.top,
        Math.max(1, Math.round(plan.headerDest.width)),
        Math.max(1, Math.round(plan.headerDest.height))
      );
      // 下段: personRow
      ctx.drawImage(
        image,
        plan.personRowRegion.left,
        plan.personRowRegion.top,
        Math.max(1, Math.round(plan.personRowRegion.width)),
        Math.max(1, Math.round(plan.personRowRegion.height)),
        plan.personRowDest.left,
        plan.personRowDest.top,
        Math.max(1, Math.round(plan.personRowDest.width)),
        Math.max(1, Math.round(plan.personRowDest.height))
      );
      // SR B1b-2C-9-FIX-2: 薄い上下段境界ガイド（過剰修飾禁止・rgba(0,0,0,0.15) 1px）
      if (plan.gridline) {
        ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
        ctx.fillRect(0, Math.round(plan.midlineY), w, 1);
      }
    };

    if (typeof OffscreenCanvas !== "undefined") {
      const oc = new OffscreenCanvas(w, h);
      const ctx = oc.getContext("2d");
      if (!ctx) throw new Error("2d context unavailable");
      draw(ctx);
      return await oc.convertToBlob({ type: plan.mimeType, quality: plan.quality });
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2d context unavailable");
    draw(ctx);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("toBlob returned null"))),
        plan.mimeType,
        plan.quality
      );
    });
  },
};

export interface GenerateCombinedDraftOptions extends PlanCombinedDraftOptions {
  /** test 用 adapter 注入。未指定なら DefaultCombinedCanvasAdapter。 */
  canvasAdapter?: CombinedCanvasAdapter;
}

/** plan + adapter を組み合わせて結合画像 Blob を生成。invalid selection → null。 */
export async function generateCombinedDraftImage(
  image: AssistedImageSource,
  selection: AssistedRowSelection,
  options?: GenerateCombinedDraftOptions
): Promise<{ blob: Blob; plan: CombinedDraftPlan } | null> {
  const plan = planCombinedDraftImage(selection, options);
  if (!plan) return null;
  const adapter = options?.canvasAdapter ?? DefaultCombinedCanvasAdapter;
  const blob = await adapter.drawCombined(image, plan);
  return { blob, plan };
}
