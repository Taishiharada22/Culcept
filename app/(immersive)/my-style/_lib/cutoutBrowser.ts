/**
 * Cutout Browser Glue (C1L-4a) — browser-only 処理シェル
 *
 * 役割:
 *   File / Blob / dataURL → decode → canvas → RGBA(ImageData)
 *     → computeCutoutV1(data,w,h,frame?) → applyMaskAlpha → PNG dataURL
 *     → { status, confidence, bbox, signals, dataUrl? } を返す。
 *
 * 厳守（C1L-4a）:
 *   - production path（PhotoAddWizard / BackgroundRemover / 登録 / 保存 / /plan）には **接続しない**。 関数を作るだけ。
 *   - **browser-only**: window/document/canvas が無い（SSR/Node）場合は throw せず `skipped` を返す。
 *   - decode/canvas/compute 失敗時も throw しない（`failed` を返し UI を壊さない）。
 *   - 元画像は保存しない。 処理用 canvas のみ maxDimension で縮小（縦横比維持）。
 *
 * テスト容易性:
 *   - frame 変換 / resize 計算 / output policy は **pure helper** として export（Node で直接テスト）。
 *   - canvas 依存部（decode / encode）は `deps` で差し替え可能（DI seam）。 本番は無指定＝実 canvas。
 */

import {
  computeCutoutV1,
  applyMaskAlpha,
  type CutoutFrame,
  type CutoutStatus,
  type CutoutBounds,
  type CutoutV1Signals,
} from "./backgroundRemovalV1";
import type { CaptureGuideFrame } from "./captureGuides";

const DEFAULT_MAX_DIMENSION = 1024;

export interface CutoutBrowserOptions {
  /** 撮影ガイド枠（C1L-3 の {x,y,width,height}）。 内部で CutoutFrame に変換して prior に渡す。 */
  frame?: CaptureGuideFrame;
  /** 処理用 canvas の最大辺（px）。 既定 1024。 */
  maxDimension?: number;
}

export interface CutoutBrowserResult {
  /** success / needs_review のときだけ入る（preview/採用候補）。 failed/skipped では無し。 */
  dataUrl?: string;
  status: CutoutStatus;
  confidence: number;
  bbox?: CutoutBounds | null;
  method: "heuristic_v1";
  signals?: CutoutV1Signals;
  error?: string;
}

/** decode/encode を差し替えるための注入口（テスト用。 本番は無指定）。 */
export interface CutoutBrowserDeps {
  decodeToImageData?: (
    input: Blob | string,
    maxDimension: number,
  ) => Promise<{ data: Uint8ClampedArray; width: number; height: number } | null>;
  encodePng?: (data: Uint8ClampedArray, width: number, height: number) => string | null;
}

/* ── pure helpers（Node test 可能） ── */

/** C1L-3 CaptureGuideFrame {x,y,width,height} → C1L-2 CutoutFrame {x0,y0,x1,y1}（0..1 にクランプ）。 */
export function guideFrameToCutoutFrame(f: CaptureGuideFrame): CutoutFrame {
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  return {
    x0: clamp(f.x),
    y0: clamp(f.y),
    x1: clamp(f.x + f.width),
    y1: clamp(f.y + f.height),
  };
}

/** 縦横比を維持して最大辺を maxDimension に収める処理用サイズ。 */
export function computeResize(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number; scaled: boolean } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension || longest <= 0) return { width, height, scaled: false };
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scaled: true,
  };
}

/** computeCutoutV1 結果 + dataUrl から、 出力ポリシーを適用した結果を作る。
 *  policy: success → dataUrl / needs_review → dataUrl（自動採用せず手動確認用）/ failed・skipped → dataUrl なし。 */
export function buildCutoutBrowserResult(
  v1: { status: CutoutStatus; confidence: number; bbox: CutoutBounds | null; signals: CutoutV1Signals },
  dataUrl: string | null,
): CutoutBrowserResult {
  const includeDataUrl =
    !!dataUrl && (v1.status === "success" || v1.status === "needs_review");
  return {
    status: v1.status,
    confidence: v1.confidence,
    bbox: v1.bbox,
    method: "heuristic_v1",
    signals: v1.signals,
    ...(includeDataUrl ? { dataUrl: dataUrl! } : {}),
  };
}

function skippedResult(error: string): CutoutBrowserResult {
  return { status: "skipped", confidence: 0, method: "heuristic_v1", error };
}

function failedResult(error: string): CutoutBrowserResult {
  return { status: "failed", confidence: 0, method: "heuristic_v1", error };
}

/* ── browser-only default impls ── */

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

async function defaultDecodeToImageData(
  input: Blob | string,
  maxDimension: number,
): Promise<{ data: Uint8ClampedArray; width: number; height: number } | null> {
  if (typeof document === "undefined" || typeof window === "undefined") return null;
  try {
    let source: CanvasImageSource;
    let srcW: number;
    let srcH: number;
    let revoke: string | null = null;
    if (typeof input !== "string" && typeof createImageBitmap === "function") {
      const bmp = await createImageBitmap(input);
      source = bmp;
      srcW = bmp.width;
      srcH = bmp.height;
    } else {
      const url = typeof input === "string" ? input : (revoke = URL.createObjectURL(input));
      const img = await loadImageElement(url);
      source = img;
      srcW = img.naturalWidth || img.width;
      srcH = img.naturalHeight || img.height;
    }
    const { width, height } = computeResize(srcW, srcH, maxDimension);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      if (revoke) URL.revokeObjectURL(revoke);
      return null;
    }
    ctx.drawImage(source, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);
    if (revoke) URL.revokeObjectURL(revoke);
    return { data: imageData.data, width, height };
  } catch {
    return null;
  }
}

function defaultEncodePng(data: Uint8ClampedArray, width: number, height: number): string | null {
  if (typeof document === "undefined") return null;
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // new ImageData(data,...) は typed-array generics で overload 不一致になり得るため、
    // createImageData + data.set() で確実に RGBA を載せる。
    const imageData = ctx.createImageData(width, height);
    imageData.data.set(data);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

/* ── public: browser glue 本体 ── */

/**
 * File/Blob/dataURL を背景除去して PNG dataURL を返す（browser-only・throw しない）。
 * production path には接続しない（C1L-4a）。 `deps` はテスト用注入口。
 */
export async function processImageCutout(
  input: Blob | string,
  options: CutoutBrowserOptions = {},
  deps: CutoutBrowserDeps = {},
): Promise<CutoutBrowserResult> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const decode = deps.decodeToImageData ?? defaultDecodeToImageData;
  const encode = deps.encodePng ?? defaultEncodePng;
  try {
    const img = await decode(input, maxDimension);
    if (!img) return skippedResult("decode-unavailable"); // SSR / decode 失敗
    const frame = options.frame ? guideFrameToCutoutFrame(options.frame) : undefined;
    const v1 = computeCutoutV1(img.data, img.width, img.height, frame ? { frame } : {});
    let dataUrl: string | null = null;
    if (v1.status === "success" || v1.status === "needs_review") {
      const masked = applyMaskAlpha(img.data, v1.mask);
      dataUrl = encode(masked, img.width, img.height);
    }
    return buildCutoutBrowserResult(v1, dataUrl);
  } catch (e) {
    return failedResult(e instanceof Error ? e.message : "cutout-failed");
  }
}

/** WardrobeItem に保存する cutout メタ（pure）。 originalUrl は C1L-4b では設定しない（imageUrl が原画を兼ねる）。 */
export interface CutoutItemFields {
  cutoutUrl?: string;
  cutoutStatus: CutoutStatus;
  cutoutConfidence: number;
  cutoutMethod: "heuristic_v1" | "manual" | "none";
}

/**
 * processImageCutout の結果を、 WardrobeItem へ保存する cutout フィールドへ写像する（pure・テスト用に分離）。
 * 採用ポリシー: success / needs_review → cutoutUrl 保存 + method=heuristic_v1。
 *               failed / skipped → cutoutUrl なし + method=none。 ※needs_review は保存するが自動採用しない（C1L-4c で確認）。
 */
export function cutoutResultToItemFields(result: CutoutBrowserResult): CutoutItemFields {
  const adopted = result.status === "success" || result.status === "needs_review";
  return {
    ...(adopted && result.dataUrl ? { cutoutUrl: result.dataUrl } : {}),
    cutoutStatus: result.status,
    cutoutConfidence: result.confidence,
    cutoutMethod: adopted ? "heuristic_v1" : "none",
  };
}

/* ── C1L-4c-b1: BackgroundRemover の「適用」結果（draft）と保存写像 ── */

/** ユーザーが overlay で確認/編集して保存対象に確定した cutout の下書き。 */
export interface CutoutDraft {
  dataUrl?: string;
  status: CutoutStatus;
  method: "heuristic_v1" | "manual" | "none";
  confidence?: number;
}

/**
 * BackgroundRemover の「適用」押下時に、 cutout draft を決める（pure）。
 * - 手動編集あり（消しゴム使用）→ status=success / method=manual / dataUrl=編集結果。
 * - 編集なし & V1 が cutout を出していた（success/needs_review）→ success / heuristic_v1 / dataUrl=V1 結果。
 *   （**ユーザーが明示適用 → needs_review のまま残さず success に昇格**）
 * - 編集なし & V1 が cutout を出せなかった（failed/skipped）→ cutout なし（dataUrl 無し・method=none）。
 *   原画をそのまま「cutout」として保存しない。
 */
export function resolveApplyDraft(input: {
  edited: boolean;
  v1Status: CutoutStatus;
  currentDataUrl: string | null;
  confidence: number;
}): CutoutDraft {
  const hadCutout = input.v1Status === "success" || input.v1Status === "needs_review";
  if (input.edited && input.currentDataUrl) {
    return { dataUrl: input.currentDataUrl, status: "success", method: "manual", confidence: input.confidence };
  }
  if (hadCutout && input.currentDataUrl) {
    return { dataUrl: input.currentDataUrl, status: "success", method: "heuristic_v1", confidence: input.confidence };
  }
  // V1 が cutout を出せず、 手動編集も無い → cutout なし（failed/skipped を踏襲）。
  return {
    status: input.v1Status === "failed" ? "failed" : "skipped",
    method: "none",
    confidence: input.confidence,
  };
}

/** スキップ時の draft。 */
export function skippedDraft(): CutoutDraft {
  return { status: "skipped", method: "none" };
}

/** cutout draft を WardrobeItem 保存フィールドへ写像する（pure）。 manual も保持する点が cutoutResultToItemFields と異なる。 */
export function cutoutDraftToItemFields(draft: CutoutDraft): CutoutItemFields {
  const adopted = draft.status === "success" || draft.status === "needs_review";
  return {
    ...(adopted && draft.dataUrl ? { cutoutUrl: draft.dataUrl } : {}),
    cutoutStatus: draft.status,
    cutoutConfidence: draft.confidence ?? 0,
    cutoutMethod: draft.method,
  };
}
