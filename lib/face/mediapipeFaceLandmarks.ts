/* ─────────────────────────────────────────────
   MediaPipe FaceLandmarker ラッパー
   - シングルトン遅延初期化
   - CDN から WASM + モデルをロード
   - IMAGE / VIDEO モード両対応
   - 失敗時はグレースフル・フォールバック (null)
   ───────────────────────────────────────────── */
"use client";

import { landmarksBBox } from "./landmarkIndices";

/* ─── CDN パス ─── */
const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

/* ─── 型定義（@mediapipe/tasks-vision の実型を使えない環境用に最小限を定義）─── */

export interface NormalizedLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export interface FaceLandmarkerResultLike {
  faceLandmarks: NormalizedLandmark[][];
  faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[];
  facialTransformationMatrixes?: { data: Float32Array }[];
}

export interface DetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LandmarkDetectionResult {
  box: DetectionBox;
  landmarks: NormalizedLandmark[];
  allFaceLandmarks: NormalizedLandmark[][];
  faceCount: number;
  blendshapes: Record<string, number> | null;
  transformationMatrix: Float32Array | null;
}

/* ─── シングルトン ─── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FaceLandmarkerInstance = any;

let _initPromise: Promise<FaceLandmarkerInstance | null> | null = null;
let _instance: FaceLandmarkerInstance | null = null;
let _currentMode: "IMAGE" | "VIDEO" = "IMAGE";
let _available = false;

/**
 * FaceLandmarker を初期化（遅延・1回のみ）。
 * WebGL / WASM 非対応環境では null を返す。
 */
export async function ensureLandmarker(): Promise<FaceLandmarkerInstance | null> {
  if (_instance) return _instance;
  if (_initPromise) return _initPromise;

  _initPromise = (async () => {
    try {
      // dynamic import — サーバーサイドでは実行されない
      const vision = await import("@mediapipe/tasks-vision");
      const { FaceLandmarker, FilesetResolver } = vision;

      const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);

      const landmarker = await FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "IMAGE",
        numFaces: 5,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      });

      _instance = landmarker;
      _currentMode = "IMAGE";
      _available = true;
      console.log("[MediaPipe] FaceLandmarker 初期化完了");
      return landmarker;
    } catch (err) {
      console.warn("[MediaPipe] FaceLandmarker 初期化失敗:", err);
      _available = false;
      return null;
    }
  })();

  return _initPromise;
}

/** MediaPipe が使用可能か */
export function isMediaPipeAvailable(): boolean {
  return _available;
}

/* ─── モード切り替え ─── */

async function switchMode(mode: "IMAGE" | "VIDEO"): Promise<void> {
  if (!_instance || _currentMode === mode) return;
  try {
    await _instance.setOptions({ runningMode: mode });
    _currentMode = mode;
  } catch {
    // 無視
  }
}

/* ─── 検出 API ─── */

/**
 * 静止画（HTMLImageElement, HTMLCanvasElement, ImageBitmap）から顔ランドマークを検出。
 */
export async function detectLandmarks(
  source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
): Promise<LandmarkDetectionResult | null> {
  const landmarker = await ensureLandmarker();
  if (!landmarker) return null;

  await switchMode("IMAGE");

  try {
    const result: FaceLandmarkerResultLike = landmarker.detect(source);
    return parseResult(result, source);
  } catch (err) {
    console.warn("[MediaPipe] detect 失敗:", err);
    return null;
  }
}

/**
 * ビデオフレームから顔ランドマークを検出（リアルタイム用）。
 */
export async function detectLandmarksVideo(
  source: HTMLVideoElement,
  timestampMs: number,
): Promise<LandmarkDetectionResult | null> {
  const landmarker = await ensureLandmarker();
  if (!landmarker) return null;

  await switchMode("VIDEO");

  try {
    const result: FaceLandmarkerResultLike = landmarker.detectForVideo(source, timestampMs);
    return parseResult(result, source);
  } catch (err) {
    console.warn("[MediaPipe] detectForVideo 失敗:", err);
    return null;
  }
}

/* ─── 結果パース ─── */

function getSourceDimensions(
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap | OffscreenCanvas,
): { w: number; h: number } {
  if (source instanceof HTMLVideoElement) {
    return { w: source.videoWidth || source.width, h: source.videoHeight || source.height };
  }
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth || source.width, h: source.naturalHeight || source.height };
  }
  return { w: source.width, h: source.height };
}

function parseResult(
  result: FaceLandmarkerResultLike,
  source: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement | ImageBitmap | OffscreenCanvas,
): LandmarkDetectionResult | null {
  if (!result.faceLandmarks || result.faceLandmarks.length === 0) return null;

  const { w, h } = getSourceDimensions(source);
  const primaryLandmarks = result.faceLandmarks[0];

  // BBox をランドマークから算出
  const box = landmarksBBox(primaryLandmarks, w, h);

  // Blendshapes
  let blendshapes: Record<string, number> | null = null;
  if (result.faceBlendshapes?.[0]) {
    blendshapes = {};
    for (const cat of result.faceBlendshapes[0].categories) {
      blendshapes[cat.categoryName] = cat.score;
    }
  }

  // Transformation matrix
  const transformationMatrix = result.facialTransformationMatrixes?.[0]?.data ?? null;

  return {
    box,
    landmarks: primaryLandmarks,
    allFaceLandmarks: result.faceLandmarks,
    faceCount: result.faceLandmarks.length,
    blendshapes,
    transformationMatrix,
  };
}

/* ─── ランドマーク描画ヘルパー ─── */

const FACE_CONTOUR_PATH = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365,
  379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93,
  234, 127, 162, 21, 54, 103, 67, 109, 10,
];

const LEFT_EYE_PATH = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246, 33];
const RIGHT_EYE_PATH = [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398, 362];
const LEFT_BROW_PATH = [46, 53, 52, 65, 55, 70, 63, 105, 66, 107];
const RIGHT_BROW_PATH = [276, 283, 282, 295, 285, 300, 293, 334, 296, 336];
const MOUTH_PATH = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185, 61];
const NOSE_PATH = [168, 6, 197, 195, 5, 4, 1, 19, 94, 2];

/**
 * CanvasRenderingContext2D にランドマークのオーバーレイを描画
 */
export function drawLandmarkOverlay(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  canvasW: number,
  canvasH: number,
  options?: {
    dotColor?: string;
    lineColor?: string;
    dotRadius?: number;
    lineWidth?: number;
  },
): void {
  const {
    dotColor = "rgba(0, 220, 255, 0.5)",
    lineColor = "rgba(0, 255, 180, 0.35)",
    dotRadius = 1.5,
    lineWidth = 1,
  } = options ?? {};

  const lp = (idx: number) => {
    const lm = landmarks[idx];
    return lm ? { x: lm.x * canvasW, y: lm.y * canvasH } : null;
  };

  const drawPath = (indices: number[]) => {
    ctx.beginPath();
    for (let i = 0; i < indices.length; i++) {
      const p = lp(indices[i]);
      if (!p) continue;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  };

  // 輪郭線
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = lineWidth;
  drawPath(FACE_CONTOUR_PATH);
  drawPath(LEFT_EYE_PATH);
  drawPath(RIGHT_EYE_PATH);
  drawPath(LEFT_BROW_PATH);
  drawPath(RIGHT_BROW_PATH);
  drawPath(MOUTH_PATH);
  drawPath(NOSE_PATH);

  // ドット（主要ランドマークのみ）
  ctx.fillStyle = dotColor;
  const keyPoints = [
    ...FACE_CONTOUR_PATH, ...LEFT_EYE_PATH, ...RIGHT_EYE_PATH,
    ...LEFT_BROW_PATH, ...RIGHT_BROW_PATH, ...MOUTH_PATH, ...NOSE_PATH,
  ];
  const drawn = new Set<number>();
  for (const idx of keyPoints) {
    if (drawn.has(idx)) continue;
    drawn.add(idx);
    const p = lp(idx);
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
    ctx.fill();
  }
}
