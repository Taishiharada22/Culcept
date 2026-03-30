/* ─────────────────────────────────────────────
   MediaPipe PoseLandmarker ラッパー
   - シングルトン遅延初期化（FaceLandmarker と同じパターン）
   - CDN から WASM + モデルをロード
   - IMAGE / VIDEO モード両対応
   ───────────────────────────────────────────── */
"use client";

const WASM_CDN = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.17/wasm";
const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";

/* ─── 型定義 ─── */

export interface PoseLandmark {
    x: number;
    y: number;
    z: number;
    visibility: number;
}

export interface PoseDetectionResult {
    /** 正規化座標 (0-1) のランドマーク 33 点 */
    landmarks: PoseLandmark[];
    /** ワールド座標（メートル単位）のランドマーク 33 点 */
    worldLandmarks: PoseLandmark[];
}

/* ─── Pose ランドマークインデックス ─── */

export const POSE = {
    NOSE: 0,
    LEFT_SHOULDER: 11,
    RIGHT_SHOULDER: 12,
    LEFT_ELBOW: 13,
    RIGHT_ELBOW: 14,
    LEFT_WRIST: 15,
    RIGHT_WRIST: 16,
    LEFT_HIP: 23,
    RIGHT_HIP: 24,
    LEFT_KNEE: 25,
    RIGHT_KNEE: 26,
    LEFT_ANKLE: 27,
    RIGHT_ANKLE: 28,
    LEFT_HEEL: 29,
    RIGHT_HEEL: 30,
} as const;

/* ─── シングルトン ─── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PoseLandmarkerInstance = any;

let _initPromise: Promise<PoseLandmarkerInstance | null> | null = null;
let _instance: PoseLandmarkerInstance | null = null;
let _currentMode: "IMAGE" | "VIDEO" = "IMAGE";
let _available = false;

export async function ensurePoseLandmarker(): Promise<PoseLandmarkerInstance | null> {
    if (_instance) return _instance;
    if (_initPromise) return _initPromise;

    _initPromise = (async () => {
        try {
            const vision = await import("@mediapipe/tasks-vision");
            const { PoseLandmarker, FilesetResolver } = vision;

            const fileset = await FilesetResolver.forVisionTasks(WASM_CDN);

            const landmarker = await PoseLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: MODEL_URL,
                    delegate: "GPU",
                },
                runningMode: "IMAGE",
                numPoses: 1,
            });

            _instance = landmarker;
            _currentMode = "IMAGE";
            _available = true;
            console.log("[MediaPipe] PoseLandmarker 初期化完了");
            return landmarker;
        } catch (err) {
            console.warn("[MediaPipe] PoseLandmarker 初期化失敗:", err);
            _available = false;
            return null;
        }
    })();

    return _initPromise;
}

export function isPoseAvailable(): boolean {
    return _available;
}

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

export async function detectPose(
    source: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
): Promise<PoseDetectionResult | null> {
    const landmarker = await ensurePoseLandmarker();
    if (!landmarker) return null;

    await switchMode("IMAGE");

    try {
        const result = landmarker.detect(source);
        return parseResult(result);
    } catch (err) {
        console.warn("[MediaPipe] Pose detect 失敗:", err);
        return null;
    }
}

export async function detectPoseVideo(
    source: HTMLVideoElement,
    timestampMs: number,
): Promise<PoseDetectionResult | null> {
    const landmarker = await ensurePoseLandmarker();
    if (!landmarker) return null;

    await switchMode("VIDEO");

    try {
        const result = landmarker.detectForVideo(source, timestampMs);
        return parseResult(result);
    } catch (err) {
        console.warn("[MediaPipe] Pose detectForVideo 失敗:", err);
        return null;
    }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseResult(result: any): PoseDetectionResult | null {
    if (!result?.landmarks?.[0]) return null;

    return {
        landmarks: result.landmarks[0].map((lm: PoseLandmark) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 0,
        })),
        worldLandmarks: (result.worldLandmarks?.[0] ?? []).map((lm: PoseLandmark) => ({
            x: lm.x,
            y: lm.y,
            z: lm.z,
            visibility: lm.visibility ?? 0,
        })),
    };
}

/* ─── スケルトン描画 ─── */

const SKELETON_CONNECTIONS: [number, number][] = [
    [11, 12], // 肩
    [11, 13], [13, 15], // 左腕
    [12, 14], [14, 16], // 右腕
    [11, 23], [12, 24], // 体幹
    [23, 24], // 腰
    [23, 25], [25, 27], // 左脚
    [24, 26], [26, 28], // 右脚
    [27, 29], [28, 30], // 足首→かかと
];

export function drawPoseOverlay(
    ctx: CanvasRenderingContext2D,
    landmarks: PoseLandmark[],
    canvasW: number,
    canvasH: number,
    options?: { color?: string; lineWidth?: number; dotRadius?: number },
): void {
    const { color = "rgba(0, 220, 255, 0.7)", lineWidth = 2, dotRadius = 4 } = options ?? {};

    // 接続線
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    for (const [a, b] of SKELETON_CONNECTIONS) {
        const la = landmarks[a];
        const lb = landmarks[b];
        if (!la || !lb || la.visibility < 0.5 || lb.visibility < 0.5) continue;
        ctx.beginPath();
        ctx.moveTo(la.x * canvasW, la.y * canvasH);
        ctx.lineTo(lb.x * canvasW, lb.y * canvasH);
        ctx.stroke();
    }

    // ドット
    ctx.fillStyle = color;
    for (const lm of landmarks) {
        if (lm.visibility < 0.5) continue;
        ctx.beginPath();
        ctx.arc(lm.x * canvasW, lm.y * canvasH, dotRadius, 0, Math.PI * 2);
        ctx.fill();
    }
}
