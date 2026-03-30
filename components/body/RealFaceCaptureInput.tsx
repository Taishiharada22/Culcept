/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
    GlassBadge,
    GlassButton,
    GlassCard,
    GlassModal,
} from "@/components/ui/glassmorphism-design";
import type { UserBodyAvatarProfile } from "@/types/body-color";
import {
    mergeRealFaceMeta,
    readRealFaceMeta,
    type RealFaceCaptureMethod,
    type RealFaceCheckResult,
} from "@/lib/realFaceStorage";
import {
    detectLandmarks,
    detectLandmarksVideo,
    drawLandmarkOverlay,
    type LandmarkDetectionResult,
    type NormalizedLandmark,
} from "@/lib/face/mediapipeFaceLandmarks";
import QualityProgressRing from "@/components/body/QualityProgressRing";
import { assessPose } from "@/lib/face/headPose";
import {
    FOREHEAD, LEFT_CHEEK, RIGHT_CHEEK, CHIN,
    centroid, landmarkToPixel,
} from "@/lib/face/landmarkIndices";

type Props = {
    avatarProfile?: UserBodyAvatarProfile | null;
    onSaved?: (avatarProfile: UserBodyAvatarProfile | null) => void;
    standaloneMode?: boolean;
    standaloneToken?: string | null;
    inlineMode?: boolean;
    hideMobileCaptureOption?: boolean;
    footer?: ReactNode;
};

type CaptureStep = "chooser" | "camera" | "align" | "mobile_wait";

type DetectionBox = {
    x: number;
    y: number;
    width: number;
    height: number;
};

/** MediaPipe 拡張検出結果（後方互換のため DetectionBox も含む） */
type EnhancedDetection = {
    box: DetectionBox;
    landmarks: NormalizedLandmark[] | null;
    faceCount: number;
    transformationMatrix: Float32Array | null;
};

type FrameAssessment = {
    fit: RealFaceCheckResult;
    brightness: RealFaceCheckResult;
    pose: RealFaceCheckResult;
};

type FaceLightingStats = {
    leftLuminance: number;
    rightLuminance: number;
    luminanceDelta: number;
    avgR: number;
    avgG: number;
    avgB: number;
    temperatureGap: number;
    colorSpread: number;
};

const FRAME_W = 1000;
const FRAME_H = 1350;
const MIDDLE_GUIDE_X1 = 404;
const MIDDLE_GUIDE_X2 = 596;
const MIDDLE_GUIDE_Y = 110;
const LOWER_GUIDE_X1 = 350;
const LOWER_GUIDE_X2 = 650;
const LOWER_GUIDE_Y = 1000;
const AUTO_CAPTURE_MS = 820;
const SCALE_MIN = 0.8;
const SCALE_MAX = 2.6;
const DEFAULT_SCALE = 1;
const FRAME_PROMPT = "自然な枠に顔全体と首元を合わせてください";
const DEFAULT_STATUS: FrameAssessment = {
    fit: { status: "unstable", message: "顔全体の位置を合わせると判定できます" },
    brightness: { status: "unstable", message: "明るさと色偏りを確認中です" },
    pose: { status: "unstable", message: "姿勢を確認中です" },
};
const BUST_SILHOUETTE_PATH =
    "M500 108 C305 108 180 220 176 448 C174 610 236 760 302 912 L-782 1350 L1782 1350 L698 912 C764 760 826 610 824 448 C820 220 695 108 500 108 Z";
const FIT_LIMITS = {
    faceWidthMin: 120,
    faceWidthMax: 660,
    centerXMin: 300,
    centerXMax: 700,
    topYMin: 0,
    topYMax: 360,
    chinYMin: 420,
    chinYMax: 920,
    shoulderRoomMin: 80,
    sidePaddingMin: 40,
} as const;
const CAPTURE_REQUIREMENTS = [
    { key: "no_glasses", label: "眼鏡を外している" },
    { key: "clear_forehead", label: "前髪で肌色が隠れていない" },
    { key: "neutral_top", label: "色付きトップスを避けている" },
    { key: "neutral_light", label: "暖色照明ではなく白色光で撮影する" },
] as const;

function cn(...values: Array<string | false | null | undefined>) {
    return values.filter(Boolean).join(" ");
}

function dataUrlFromFile(file: File) {
    return new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("画像の読み込みに失敗しました"));
        reader.readAsDataURL(file);
    });
}

function loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
        image.src = src;
    });
}

function computeContainRect(
    sourceWidth: number,
    sourceHeight: number,
    scale: number,
    offsetX: number,
    offsetY: number
) {
    const baseScale = Math.min(FRAME_W / sourceWidth, FRAME_H / sourceHeight);
    const drawScale = baseScale * scale;
    const width = sourceWidth * drawScale;
    const height = sourceHeight * drawScale;
    const x = (FRAME_W - width) / 2 + offsetX;
    const y = (FRAME_H - height) / 2 + offsetY;
    return { x, y, width, height, drawScale };
}

function computeCoverRect(sourceWidth: number, sourceHeight: number) {
    const scale = Math.max(FRAME_W / sourceWidth, FRAME_H / sourceHeight);
    const width = sourceWidth * scale;
    const height = sourceHeight * scale;
    const x = (FRAME_W - width) / 2;
    const y = (FRAME_H - height) / 2;
    return { x, y, width, height, drawScale: scale };
}

/**
 * MediaPipe FaceLandmarker による顔検出（静止画用）
 * 478 ランドマーク + BBox + 変換行列を返す。
 * MediaPipe 非対応時は null を返す。
 */
async function detectFaceEnhanced(
    source: HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas,
): Promise<EnhancedDetection | null> {
    const result = await detectLandmarks(source);
    if (!result) return null;
    return {
        box: result.box,
        landmarks: result.landmarks,
        faceCount: result.faceCount,
        transformationMatrix: result.transformationMatrix,
    };
}

/**
 * MediaPipe FaceLandmarker による顔検出（ビデオフレーム用）
 */
async function detectFaceEnhancedVideo(
    source: HTMLVideoElement,
    timestampMs: number,
): Promise<EnhancedDetection | null> {
    const result = await detectLandmarksVideo(source, timestampMs);
    if (!result) return null;
    return {
        box: result.box,
        landmarks: result.landmarks,
        faceCount: result.faceCount,
        transformationMatrix: result.transformationMatrix,
    };
}

/** 後方互換: DetectionBox のみを返す */
async function detectFace(source: CanvasImageSource): Promise<DetectionBox | null> {
    // HTMLImageElement または HTMLCanvasElement のみ対応
    if (source instanceof HTMLImageElement || source instanceof HTMLCanvasElement) {
        const enhanced = await detectFaceEnhanced(source);
        return enhanced?.box ?? null;
    }
    return null;
}

function sampleBrightness(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return 128;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = imageData;
    let total = 0;
    let count = 0;
    for (let index = 0; index < data.length; index += 16) {
        const r = data[index] ?? 0;
        const g = data[index + 1] ?? 0;
        const b = data[index + 2] ?? 0;
        total += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        count += 1;
    }
    return count > 0 ? total / count : 128;
}

/**
 * ランドマーク定義領域の平均RGB/輝度をサンプリング
 */
function sampleRegion(
    ctx: CanvasRenderingContext2D,
    cx: number, cy: number,
    radius: number,
    canvasW: number, canvasH: number,
): { avgR: number; avgG: number; avgB: number; lum: number } | null {
    const x0 = Math.max(0, Math.floor(cx - radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const x1 = Math.min(canvasW, Math.ceil(cx + radius));
    const y1 = Math.min(canvasH, Math.ceil(cy + radius));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w <= 0 || h <= 0) return null;

    const imageData = ctx.getImageData(x0, y0, w, h);
    const { data } = imageData;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;
    for (let i = 0; i < data.length; i += 16) { // 4px skip for speed
        sumR += data[i] ?? 0;
        sumG += data[i + 1] ?? 0;
        sumB += data[i + 2] ?? 0;
        count++;
    }
    if (count === 0) return null;
    const avgR = sumR / count;
    const avgG = sumG / count;
    const avgB = sumB / count;
    return { avgR, avgG, avgB, lum: 0.2126 * avgR + 0.7152 * avgG + 0.0722 * avgB };
}

function computeFaceLightingStats(
    canvas: HTMLCanvasElement,
    faceBox: DetectionBox | null,
    rect: { x: number; y: number; width: number; height: number; drawScale: number },
    landmarks?: NormalizedLandmark[] | null,
) {
    if (!faceBox) return null;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;

    const cW = canvas.width;
    const cH = canvas.height;

    // ランドマークがある場合: 額/左頬/右頬/顎の4領域をサンプリング
    if (landmarks && landmarks.length >= 468) {
        const radius = Math.max(12, (faceBox.width * rect.drawScale) * 0.06);
        const foreheadC = centroid(landmarks, FOREHEAD, cW, cH);
        const leftC = centroid(landmarks, LEFT_CHEEK, cW, cH);
        const rightC = centroid(landmarks, RIGHT_CHEEK, cW, cH);
        const chinC = centroid(landmarks, CHIN.slice(0, 4), cW, cH);

        const regions = [
            { name: "forehead", ...foreheadC },
            { name: "leftCheek", ...leftC },
            { name: "rightCheek", ...rightC },
            { name: "chin", ...chinC },
        ];

        let totalR = 0, totalG = 0, totalB = 0, totalLum = 0;
        let leftLum = 0, rightLum = 0;
        let regionCount = 0;

        for (const region of regions) {
            const sample = sampleRegion(ctx, region.x, region.y, radius, cW, cH);
            if (!sample) continue;
            totalR += sample.avgR;
            totalG += sample.avgG;
            totalB += sample.avgB;
            totalLum += sample.lum;
            regionCount++;
            if (region.name === "leftCheek" || region.name === "forehead") leftLum += sample.lum;
            if (region.name === "rightCheek" || region.name === "chin") rightLum += sample.lum;
        }

        if (regionCount < 2) return null;
        const avgR = totalR / regionCount;
        const avgG = totalG / regionCount;
        const avgB = totalB / regionCount;
        const leftLuminance = leftLum / Math.max(1, Math.ceil(regionCount / 2));
        const rightLuminance = rightLum / Math.max(1, Math.floor(regionCount / 2));

        return {
            leftLuminance,
            rightLuminance,
            luminanceDelta: Math.abs(leftLuminance - rightLuminance),
            avgR, avgG, avgB,
            temperatureGap: Math.abs(avgR - avgB),
            colorSpread: Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB),
        } satisfies FaceLightingStats;
    }

    // フォールバック: 旧ロジック（固定矩形）
    const faceLeft = rect.x + faceBox.x * rect.drawScale;
    const faceTop = rect.y + faceBox.y * rect.drawScale;
    const faceWidth = faceBox.width * rect.drawScale;
    const faceHeight = faceBox.height * rect.drawScale;
    const sampleLeft = Math.max(0, Math.floor(faceLeft + faceWidth * 0.18));
    const sampleTop = Math.max(0, Math.floor(faceTop + faceHeight * 0.18));
    const sampleWidth = Math.min(cW - sampleLeft, Math.max(24, Math.floor(faceWidth * 0.64)));
    const sampleHeight = Math.min(cH - sampleTop, Math.max(24, Math.floor(faceHeight * 0.56)));
    if (sampleWidth <= 0 || sampleHeight <= 0) return null;

    const imageData = ctx.getImageData(sampleLeft, sampleTop, sampleWidth, sampleHeight);
    const { data, width, height } = imageData;
    const midpoint = width / 2;
    let leftLum = 0, rightLum = 0, leftCount = 0, rightCount = 0;
    let sumR = 0, sumG = 0, sumB = 0, count = 0;

    for (let y = 0; y < height; y += 8) {
        for (let x = 0; x < width; x += 8) {
            const index = (y * width + x) * 4;
            const r = data[index] ?? 0;
            const g = data[index + 1] ?? 0;
            const b = data[index + 2] ?? 0;
            const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            sumR += r; sumG += g; sumB += b; count++;
            if (x < midpoint) { leftLum += luminance; leftCount++; }
            else { rightLum += luminance; rightCount++; }
        }
    }

    if (count === 0 || leftCount === 0 || rightCount === 0) return null;
    const avgR = sumR / count;
    const avgG = sumG / count;
    const avgB = sumB / count;
    return {
        leftLuminance: leftLum / leftCount,
        rightLuminance: rightLum / rightCount,
        luminanceDelta: Math.abs(leftLum / leftCount - rightLum / rightCount),
        avgR, avgG, avgB,
        temperatureGap: Math.abs(avgR - avgB),
        colorSpread: Math.max(avgR, avgG, avgB) - Math.min(avgR, avgG, avgB),
    } satisfies FaceLightingStats;
}

function evaluateBrightness(luminance: number, lightingStats?: FaceLightingStats | null): RealFaceCheckResult {
    if (luminance < 45) {
        return { status: "ng", score: luminance, message: "暗すぎます。明るい場所で撮影してください" };
    }
    if (luminance > 232) {
        return { status: "ng", score: luminance, message: "白飛びが強すぎます" };
    }
    if (lightingStats) {
        const redBlueRatio = lightingStats.avgR / Math.max(lightingStats.avgB, 1);
        // 左右の光ムラ（極端な片側照明のみNG）
        if (lightingStats.luminanceDelta > 55) {
            return { status: "ng", score: lightingStats.luminanceDelta, message: "左右の光ムラが大きすぎます" };
        }
        // 暖色照明の判定: 肌色は自然に R > B（差40〜60が普通）なので、
        // 極端な暖色照明（白熱灯/キャンドル級）のみ弾く
        if (lightingStats.avgR > lightingStats.avgB && lightingStats.temperatureGap > 80 && redBlueRatio > 1.55) {
            return { status: "ng", score: lightingStats.temperatureGap, message: "暖色照明が強すぎます。白色光で撮影してください" };
        }
        if (lightingStats.colorSpread > 85) {
            return { status: "ng", score: lightingStats.colorSpread, message: "色温度の偏りが強すぎます" };
        }
    }
    if (luminance < 55 || luminance > 225) {
        return { status: "unstable", score: luminance, message: "明るさがやや不安定です" };
    }
    if (lightingStats) {
        const redBlueRatio = lightingStats.avgR / Math.max(lightingStats.avgB, 1);
        if (lightingStats.luminanceDelta > 40) {
            return { status: "unstable", score: lightingStats.luminanceDelta, message: "左右の光ムラがやや大きいです" };
        }
        // unstable: 肌のR-Bベースライン(~50)を超えた分だけ照明の影響と見なす
        if (lightingStats.avgR > lightingStats.avgB && lightingStats.temperatureGap > 65 && redBlueRatio > 1.4) {
            return { status: "unstable", score: lightingStats.temperatureGap, message: "やや黄みが強い照明です" };
        }
        if (lightingStats.colorSpread > 60) {
            return { status: "unstable", score: lightingStats.colorSpread, message: "色温度がやや偏っています" };
        }
    }
    return { status: "ok", score: luminance, message: "明るさは診断可能です" };
}

function evaluatePose(
    faceBox: DetectionBox | null,
    captureMethod: RealFaceCaptureMethod,
    enhanced?: { landmarks?: NormalizedLandmark[] | null; transformationMatrix?: Float32Array | null } | null,
): RealFaceCheckResult {
    // MediaPipe ランドマーク / 変換行列があれば 3D 姿勢推定を使用
    if (enhanced?.landmarks || enhanced?.transformationMatrix) {
        const poseResult = assessPose(
            enhanced.transformationMatrix ?? null,
            enhanced.landmarks ?? null,
        );
        return {
            status: poseResult.status,
            score: poseResult.pose ? Math.max(
                Math.abs(poseResult.pose.pitch),
                Math.abs(poseResult.pose.yaw),
                Math.abs(poseResult.pose.roll),
            ) : undefined,
            message: poseResult.message,
        };
    }

    // フォールバック: アスペクト比ベース
    if (!faceBox) {
        return {
            status: "unstable",
            message: "姿勢判定が不安定です。ほぼ正面ならこのまま続行できます",
        };
    }

    const aspect = faceBox.width / Math.max(faceBox.height, 1);
    const lower = captureMethod === "pc_camera" ? 0.62 : 0.66;
    const upper = captureMethod === "pc_camera" ? 0.97 : 0.92;

    if (aspect < 0.5 || aspect > 1.08) {
        return { status: "ng", score: aspect, message: "横向きが強い可能性があります" };
    }
    if (aspect < lower || aspect > upper) {
        return { status: "unstable", score: aspect, message: "姿勢判定がやや不安定です" };
    }
    return { status: "ok", score: aspect, message: "姿勢は概ね正面です" };
}

function evaluateFit(
    faceBox: DetectionBox | null,
    rect: { x: number; y: number; width: number; height: number; drawScale: number },
    captureMethod: RealFaceCaptureMethod
): RealFaceCheckResult {
    if (!faceBox) {
        return {
            status: "unstable",
            message: "構図判定が不安定です。顔全体が枠に入っていれば続行できます",
        };
    }

    const left = rect.x + faceBox.x * rect.drawScale;
    const top = rect.y + faceBox.y * rect.drawScale;
    const width = faceBox.width * rect.drawScale;
    const height = faceBox.height * rect.drawScale;
    const right = left + width;
    const centerX = left + width / 2;
    const chinY = top + height * 0.94;
    const shoulderRoom = FRAME_H - chinY;
    const tolerance = captureMethod === "pc_camera" ? 1.08 : 1;

    if (width < FIT_LIMITS.faceWidthMin / tolerance || width > FIT_LIMITS.faceWidthMax * tolerance) {
        return { status: "ng", score: width, message: "顔の大きさが枠と大きくずれています" };
    }
    if (centerX < FIT_LIMITS.centerXMin || centerX > FIT_LIMITS.centerXMax) {
        return { status: "unstable", score: centerX, message: "顔の中心が少しずれています" };
    }
    if (top < FIT_LIMITS.topYMin || top > FIT_LIMITS.topYMax) {
        return { status: "unstable", score: top, message: "頭頂の位置が少しずれています" };
    }
    if (chinY < FIT_LIMITS.chinYMin || chinY > FIT_LIMITS.chinYMax) {
        return { status: "unstable", score: chinY, message: "顎位置が枠の目安から外れています" };
    }
    if (shoulderRoom < FIT_LIMITS.shoulderRoomMin / tolerance) {
        return { status: "ng", score: shoulderRoom, message: "首元と肩の写りが不足しています" };
    }
    if (left < FIT_LIMITS.sidePaddingMin || right > FRAME_W - FIT_LIMITS.sidePaddingMin) {
        return { status: "unstable", message: "左右の余白が少ないです" };
    }
    return { status: "ok", message: "構図は診断可能です" };
}

function buildAssessment(
    faceBox: DetectionBox | null,
    rect: { x: number; y: number; width: number; height: number; drawScale: number },
    luminance: number,
    lightingStats: FaceLightingStats | null,
    captureMethod: RealFaceCaptureMethod,
    enhanced?: EnhancedDetection | null,
): FrameAssessment {
    // 複数顔チェック
    if (enhanced && enhanced.faceCount > 1) {
        return {
            fit: { status: "ng", message: `${enhanced.faceCount}人の顔が検出されました。一人で撮影してください` },
            brightness: evaluateBrightness(luminance, lightingStats),
            pose: { status: "ng", message: "複数の顔が検出されています" },
        };
    }

    return {
        fit: evaluateFit(faceBox, rect, captureMethod),
        brightness: evaluateBrightness(luminance, lightingStats),
        pose: evaluatePose(faceBox, captureMethod, enhanced),
    };
}

async function buildNormalizedDataUrl(
    sourceUrl: string,
    scale: number,
    offsetX: number,
    offsetY: number
) {
    const image = await loadImage(sourceUrl);
    const canvas = document.createElement("canvas");
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("描画に失敗しました");

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, FRAME_W, FRAME_H);

    const rect = computeContainRect(image.naturalWidth, image.naturalHeight, scale, offsetX, offsetY);
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height);

    return canvas.toDataURL("image/jpeg", 0.92);
}

async function fetchAvatarProfile() {
    const response = await fetch("/api/body-color/profile", { cache: "no-store" });
    const json = await response.json().catch(() => ({}));
    return (json?.avatar_profile ?? null) as UserBodyAvatarProfile | null;
}

function makeQrUrl(url: string) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
}

export default function RealFaceCaptureInput({
    avatarProfile,
    onSaved,
    standaloneMode = false,
    standaloneToken = null,
    inlineMode = false,
    hideMobileCaptureOption = false,
    footer,
}: Props) {
    const inputRef = useRef<HTMLInputElement | null>(null);
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const [isOpen, setIsOpen] = useState(standaloneMode);
    const [step, setStep] = useState<CaptureStep>(standaloneMode ? "camera" : "chooser");
    const [captureMethod, setCaptureMethod] = useState<RealFaceCaptureMethod>(
        standaloneMode ? "mobile_camera" : "upload"
    );
    const [sourceImage, setSourceImage] = useState<string | null>(null);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [alignScale, setAlignScale] = useState(DEFAULT_SCALE);
    const [offsetX, setOffsetX] = useState(0);
    const [offsetY, setOffsetY] = useState(0);
    const [sourceSize, setSourceSize] = useState<{ width: number; height: number } | null>(null);
    const [detectedFace, setDetectedFace] = useState<DetectionBox | null>(null);
    const [detectedLandmarks, setDetectedLandmarks] = useState<NormalizedLandmark[] | null>(null);
    const [lastEnhanced, setLastEnhanced] = useState<EnhancedDetection | null>(null);
    const [assessment, setAssessment] = useState<FrameAssessment>(DEFAULT_STATUS);
    const [saving, setSaving] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [streamActive, setStreamActive] = useState(false);
    const [cameraPrompt, setCameraPrompt] = useState(FRAME_PROMPT);
    const [captureRequirements, setCaptureRequirements] = useState<Record<(typeof CAPTURE_REQUIREMENTS)[number]["key"], boolean>>({
        no_glasses: false,
        clear_forehead: false,
        neutral_top: false,
        neutral_light: false,
    });
    const [mobileSession, setMobileSession] = useState<{
        token: string;
        captureUrl: string;
        status: string;
    } | null>(standaloneToken ? { token: standaloneToken, captureUrl: "", status: "pending" } : null);
    const autoCaptureStartedAt = useRef<number | null>(null);
    const pollTimer = useRef<number | null>(null);
    const meta = useMemo(() => readRealFaceMeta(avatarProfile?.views), [avatarProfile?.views]);

    const frameRect = useMemo(() => {
        if (!sourceSize) return null;
        return computeContainRect(sourceSize.width, sourceSize.height, alignScale, offsetX, offsetY);
    }, [sourceSize, alignScale, offsetX, offsetY]);

    const canContinue =
        assessment.fit.status !== "ng" &&
        assessment.brightness.status !== "ng" &&
        assessment.pose.status !== "ng" &&
        !!sourceImage;
    const requirementsReady = Object.values(captureRequirements).every(Boolean);

    const refreshProfile = useCallback(async () => {
        const next = await fetchAvatarProfile().catch(() => null);
        onSaved?.(next);
        return next;
    }, [onSaved]);

    const stopCamera = useCallback(() => {
        const stream = videoRef.current?.srcObject as MediaStream | null;
        stream?.getTracks().forEach((track) => track.stop());
        if (videoRef.current) {
            videoRef.current.srcObject = null;
        }
        setStreamActive(false);
        autoCaptureStartedAt.current = null;
    }, []);

    const startCamera = useCallback(async () => {
        try {
            setError(null);
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: captureMethod === "mobile_camera" ? { ideal: "user" } : "user",
                },
                audio: false,
            });
            if (!videoRef.current) return;
            videoRef.current.srcObject = stream;
            await videoRef.current.play();
            setStreamActive(true);
            setCameraPrompt(FRAME_PROMPT);
        } catch (cameraError) {
            setError(cameraError instanceof Error ? cameraError.message : "カメラを起動できませんでした");
        }
    }, [captureMethod]);

    const handleDetectedStaticImage = useCallback(async (imageUrl: string) => {
        const image = await loadImage(imageUrl);
        setSourceSize({ width: image.naturalWidth, height: image.naturalHeight });
        const enhanced = await detectFaceEnhanced(image);
        setDetectedFace(enhanced?.box ?? null);
        setDetectedLandmarks(enhanced?.landmarks ?? null);
        setLastEnhanced(enhanced);
    }, []);

    const updateStaticAssessment = useCallback(async () => {
        if (!sourceImage || !frameRect) return;
        const image = await loadImage(sourceImage);
        const canvas = document.createElement("canvas");
        canvas.width = FRAME_W;
        canvas.height = FRAME_H;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, FRAME_W, FRAME_H);
        ctx.drawImage(image, frameRect.x, frameRect.y, frameRect.width, frameRect.height);
        const luminance = sampleBrightness(canvas);
        const lightingStats = computeFaceLightingStats(canvas, detectedFace, frameRect, detectedLandmarks);
        setAssessment(buildAssessment(detectedFace, frameRect, luminance, lightingStats, captureMethod, lastEnhanced));
        setPreviewImage(canvas.toDataURL("image/jpeg", 0.88));
    }, [captureMethod, detectedFace, detectedLandmarks, frameRect, lastEnhanced, sourceImage]);

    const handleUpload = useCallback(
        async (file: File | null, nextMethod: RealFaceCaptureMethod) => {
            if (!file) return;
            stopCamera();
            setCaptureMethod(nextMethod);
            setError(null);
            setNotice(null);
            const dataUrl = await dataUrlFromFile(file);
            setSourceImage(dataUrl);
            setAlignScale(DEFAULT_SCALE);
            setOffsetX(0);
            setOffsetY(0);
            setStep("align");
            await handleDetectedStaticImage(dataUrl);
        },
        [handleDetectedStaticImage, stopCamera]
    );

    const captureFromVideo = useCallback(async () => {
        if (!requirementsReady) return;
        const video = videoRef.current;
        if (!video) return;

        // カメラプレビューと同じ cover 表示をそのまま保存する
        // ユーザーが見ていた見た目 = 保存される画像
        const coverRect = computeCoverRect(video.videoWidth, video.videoHeight);
        const canvas = document.createElement("canvas");
        canvas.width = FRAME_W;
        canvas.height = FRAME_H;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        // Mirror the capture to match the mirrored preview
        ctx.translate(FRAME_W, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, coverRect.x, coverRect.y, coverRect.width, coverRect.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);

        stopCamera();
        setSourceImage(dataUrl);
        setAlignScale(DEFAULT_SCALE);
        setOffsetX(0);
        setOffsetY(0);
        setStep("align");
        await handleDetectedStaticImage(dataUrl);
    }, [handleDetectedStaticImage, requirementsReady, stopCamera]);

    const beginMobileSession = useCallback(async () => {
        setError(null);
        const response = await fetch("/api/body-color/real-face-session", { method: "POST" });
        const json = await response.json().catch(() => ({}));
        if (!response.ok || !json?.session) {
            setError(json?.error ?? "スマホ撮影セッションを作成できませんでした");
            return;
        }
        setMobileSession({
            token: json.session.token,
            captureUrl: json.session.captureUrl,
            status: json.session.status,
        });
        setCaptureMethod("mobile_camera");
        setStep("mobile_wait");
    }, []);

    const saveNormalizedImage = useCallback(async () => {
        if (!sourceImage) return;
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            const normalizedImageData = await buildNormalizedDataUrl(sourceImage, alignScale, offsetX, offsetY);
            const updatedAt = new Date().toISOString();
            // カメラ撮影時は normalizedImageData と同じ解像度のため original は省略
            // アップロード時のみ original を送信（ただしペイロードが大きすぎないよう 2MB 以下のみ）
            const MAX_ORIGINAL_SIZE = 2 * 1024 * 1024;
            const shouldSendOriginal =
                captureMethod === "upload" &&
                sourceImage.length <= MAX_ORIGINAL_SIZE;
            const response = await fetch("/api/body-color/real-face-submit", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    captureMethod,
                    captureSessionToken: standaloneToken ?? mobileSession?.token ?? null,
                    originalImageData: shouldSendOriginal ? sourceImage : null,
                    normalizedImageData,
                    fitCheckResult: assessment.fit,
                    brightnessCheckResult: assessment.brightness,
                    poseCheckResult: assessment.pose,
                }),
            });
            const json = await response.json().catch(() => ({}));
            if (!response.ok || !json?.ok) {
                throw new Error(json?.error ?? "保存に失敗しました");
            }
            setNotice("診断用の実顔写真を保存しました");
            const optimisticAvatarProfile = {
                ...(avatarProfile ?? {}),
                views: mergeRealFaceMeta(avatarProfile?.views, {
                    originalImage: captureMethod === "upload" ? sourceImage : undefined,
                    normalizedRealFace: normalizedImageData,
                    captureMethod,
                    captureSessionToken: standaloneToken ?? mobileSession?.token ?? null,
                    fitCheckResult: assessment.fit,
                    brightnessCheckResult: assessment.brightness,
                    poseCheckResult: assessment.pose,
                    isNormalized: true,
                    updatedAt,
                }),
                updated_at: updatedAt,
            } as UserBodyAvatarProfile;
            const serverAvatarProfile = (json?.avatar_profile ?? null) as UserBodyAvatarProfile | null;
            const nextAvatarProfile = serverAvatarProfile
                ? {
                    ...optimisticAvatarProfile,
                    ...serverAvatarProfile,
                    views: {
                        ...(optimisticAvatarProfile.views ?? {}),
                        ...((serverAvatarProfile.views as Record<string, string> | undefined) ?? {}),
                    },
                } as UserBodyAvatarProfile
                : optimisticAvatarProfile;
            onSaved?.(nextAvatarProfile);
            // 保存後はキャプチャ状態をリセット（UIが保存済み状態を正しく反映する）
            setSourceImage(null);
            setPreviewImage(null);
            setDetectedFace(null);
            setDetectedLandmarks(null);
            setLastEnhanced(null);
            setAssessment(DEFAULT_STATUS);
            if (!standaloneMode) {
                setIsOpen(false);
                setStep("chooser");
            }
        } catch (saveError) {
            setError(saveError instanceof Error ? saveError.message : "保存に失敗しました");
        } finally {
            setSaving(false);
        }
    }, [
        alignScale,
        assessment.brightness,
        assessment.fit,
        assessment.pose,
        avatarProfile,
        captureMethod,
        mobileSession?.token,
        offsetX,
        offsetY,
        onSaved,
        sourceImage,
        standaloneMode,
        standaloneToken,
    ]);

    const clearRealFace = useCallback(async () => {
        setSaving(true);
        setError(null);
        setNotice(null);
        try {
            const response = await fetch("/api/body-color/real-face-submit", { method: "DELETE" });
            const json = await response.json().catch(() => ({}));
            if (!response.ok || !json?.ok) {
                throw new Error(json?.error ?? "削除に失敗しました");
            }
            setSourceImage(null);
            setPreviewImage(null);
            setDetectedFace(null);
            setDetectedLandmarks(null);
            setLastEnhanced(null);
            setAssessment(DEFAULT_STATUS);
            setNotice("診断用の実顔写真をクリアしました");
            await refreshProfile();
        } catch (clearError) {
            setError(clearError instanceof Error ? clearError.message : "削除に失敗しました");
        } finally {
            setSaving(false);
        }
    }, [refreshProfile]);

    useEffect(() => {
        if (!sourceImage || !frameRect || !sourceSize) return;
        void updateStaticAssessment();
    }, [sourceImage, frameRect, sourceSize, updateStaticAssessment]);

    useEffect(() => {
        if (step !== "camera" || !streamActive || !requirementsReady) {
            if (step === "camera" && !requirementsReady) {
                setCameraPrompt("必須チェックを完了すると撮影を開始できます");
            }
            return;
        }
        let cancelled = false;

        const run = async () => {
            if (cancelled || !videoRef.current) return;
            const video = videoRef.current;
            if (video.readyState < 2) {
                requestAnimationFrame(() => void run());
                return;
            }

            const coverRect = computeCoverRect(video.videoWidth, video.videoHeight);

            // MediaPipe ビデオモードで顔検出
            const enhanced = await detectFaceEnhancedVideo(video, performance.now());
            const faceBox = enhanced?.box ?? null;
            const landmarks = enhanced?.landmarks ?? null;

            const targetCanvas = cameraCanvasRef.current;
            if (!targetCanvas) {
                requestAnimationFrame(() => void run());
                return;
            }
            targetCanvas.width = FRAME_W;
            targetCanvas.height = FRAME_H;
            const ctx = targetCanvas.getContext("2d", { willReadFrequently: true });
            if (!ctx) {
                requestAnimationFrame(() => void run());
                return;
            }
            ctx.drawImage(video, coverRect.x, coverRect.y, coverRect.width, coverRect.height);

            // ランドマークオーバーレイ描画
            if (landmarks) {
                drawLandmarkOverlay(ctx, landmarks, FRAME_W, FRAME_H);
            }

            const luminance = sampleBrightness(targetCanvas);
            const lightingStats = computeFaceLightingStats(targetCanvas, faceBox, coverRect, landmarks);
            const currentAssessment = buildAssessment(faceBox, coverRect, luminance, lightingStats, captureMethod, enhanced);

            if (cancelled) return;
            setAssessment(currentAssessment);

            const allGood = [currentAssessment.fit, currentAssessment.brightness, currentAssessment.pose].every(
                (item) => item.status === "ok"
            );
            const almostGood = [currentAssessment.fit, currentAssessment.brightness, currentAssessment.pose].every(
                (item) => item.status !== "ng"
            );

            if (allGood) {
                if (!autoCaptureStartedAt.current) {
                    autoCaptureStartedAt.current = performance.now();
                    setCameraPrompt("撮影します…");
                } else if (performance.now() - autoCaptureStartedAt.current >= AUTO_CAPTURE_MS) {
                    autoCaptureStartedAt.current = null;
                    await captureFromVideo();
                    return;
                }
            } else {
                autoCaptureStartedAt.current = null;
                const issueMessage = [currentAssessment.fit, currentAssessment.brightness, currentAssessment.pose].find(
                    (item) => item.status !== "ok"
                )?.message;
                setCameraPrompt(issueMessage ?? (almostGood ? "そのままキープしてください" : FRAME_PROMPT));
            }

            window.setTimeout(() => void run(), 240);
        };

        void run();
        return () => {
            cancelled = true;
        };
    }, [captureFromVideo, captureMethod, step, streamActive]);

    useEffect(() => {
        if (!standaloneMode || !standaloneToken) return;
        setMobileSession({ token: standaloneToken, captureUrl: window.location.href, status: "pending" });
    }, [standaloneMode, standaloneToken]);

    useEffect(() => {
        if (step !== "mobile_wait" || !mobileSession?.token) return;
        let active = true;

        const poll = async () => {
            if (!active) return;
            const response = await fetch(`/api/body-color/real-face-session?token=${mobileSession.token}`, {
                cache: "no-store",
            });
            const json = await response.json().catch(() => ({}));
            if (!active) return;
            const session = json?.session;
            if (response.ok && session?.status === "completed") {
                setMobileSession((prev) => (prev ? { ...prev, status: session.status } : prev));
                setNotice("スマホで撮影した写真を反映しました");
                await refreshProfile();
                setIsOpen(false);
                return;
            }
            setMobileSession((prev) =>
                prev ? { ...prev, status: session?.status ?? prev.status } : prev
            );
            pollTimer.current = window.setTimeout(() => void poll(), 2400);
        };

        void poll();
        return () => {
            active = false;
            if (pollTimer.current) {
                window.clearTimeout(pollTimer.current);
                pollTimer.current = null;
            }
        };
    }, [mobileSession?.token, refreshProfile, step]);

    useEffect(() => {
        if (step === "camera") {
            void startCamera();
        }
        return () => {
            if (step === "camera") stopCamera();
        };
    }, [startCamera, step, stopCamera]);

    useEffect(() => {
        return () => {
            stopCamera();
            if (pollTimer.current) window.clearTimeout(pollTimer.current);
        };
    }, [stopCamera]);

    const currentPreview = previewImage || meta.normalizedRealFace || meta.originalImage;
    const hasNormalized = !!meta.normalizedRealFace;
    const showNotice = notice || (meta.isNormalized ? "診断用の実顔写真が設定済みです" : null);

    const guidePreview = (
        <div className="relative mx-auto w-full max-w-[340px] overflow-hidden rounded-xl border border-white/70 bg-slate-900/80 shadow-inner sm:max-w-[400px] sm:rounded-2xl">
            <div className="relative w-full" style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}>
                {sourceImage ? (
                    <img
                        src={previewImage ?? sourceImage}
                        alt="real face source"
                        className="absolute inset-0 h-full w-full object-cover"
                    />
                ) : currentPreview ? (
                    <img src={currentPreview} alt="real face preview" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_58%)]" />
                )}

                <svg viewBox={`0 0 ${FRAME_W} ${FRAME_H}`} className="absolute inset-0 h-full w-full">
                    <defs>
                        <mask id="real-face-mask">
                            <rect width={FRAME_W} height={FRAME_H} fill="white" />
                            <path d={BUST_SILHOUETTE_PATH} fill="black" />
                        </mask>
                    </defs>
                    <rect width={FRAME_W} height={FRAME_H} fill="rgba(15,23,42,0.42)" mask="url(#real-face-mask)" />
                    <path d={BUST_SILHOUETTE_PATH} fill="none" stroke="rgba(255,255,255,0.96)" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                    <path d={`M${MIDDLE_GUIDE_X1} ${MIDDLE_GUIDE_Y} L${MIDDLE_GUIDE_X2} ${MIDDLE_GUIDE_Y}`} stroke="rgba(255,255,255,0.75)" strokeWidth="4" strokeDasharray="14 12" strokeLinecap="round" />
                    <path d={`M${LOWER_GUIDE_X1} ${LOWER_GUIDE_Y} L${LOWER_GUIDE_X2} ${LOWER_GUIDE_Y}`} stroke="rgba(255,255,255,0.65)" strokeWidth="4" strokeDasharray="14 12" strokeLinecap="round" />
                </svg>
            </div>
        </div>
    );

    const body = (
        <div className="space-y-3 sm:space-y-3.5">
            {(notice || error) && (
                <div className="space-y-1.5">
                    {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</div>}
                    {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}
                </div>
            )}

            {step === "chooser" && (
                <div className="space-y-2.5 sm:space-y-3">
                    <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 sm:rounded-2xl sm:p-3.5">
                        <div className="text-xs font-bold text-rose-800">撮影前の必須チェック</div>
                        <div className="mt-2 grid grid-cols-2 gap-1.5">
                            {CAPTURE_REQUIREMENTS.map((item) => (
                                <label key={item.key} className="flex items-center gap-2 rounded-lg border border-white/80 bg-white/85 px-2.5 py-1.5 text-[11px] text-slate-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs">
                                    <input
                                        type="checkbox"
                                        checked={captureRequirements[item.key]}
                                        onChange={(event) =>
                                            setCaptureRequirements((prev) => ({
                                                ...prev,
                                                [item.key]: event.target.checked,
                                            }))
                                        }
                                        className="h-3.5 w-3.5 accent-violet-500"
                                    />
                                    <span>{item.label}</span>
                                </label>
                            ))}
                        </div>
                        {!requirementsReady && (
                            <div className="mt-2 text-[11px] font-semibold text-rose-600">
                                4項目すべて確認しないと撮影を開始できません。
                            </div>
                        )}
                    </div>
                    <div className={cn("grid gap-2 sm:gap-2", hideMobileCaptureOption ? "grid-cols-2" : "md:grid-cols-3")}>
                        {!hideMobileCaptureOption && (
                            <button
                                type="button"
                                onClick={() => void beginMobileSession()}
                                disabled={!requirementsReady}
                                className={cn(
                                    "rounded-xl border p-2.5 text-left shadow-sm transition sm:rounded-2xl sm:p-3",
                                    requirementsReady
                                        ? "border-violet-200 bg-violet-50 hover:border-violet-300 hover:bg-violet-100"
                                        : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60"
                                )}
                            >
                                <div className="flex items-center justify-between gap-1.5">
                                    <div className="text-xs font-bold text-slate-900">スマホで撮影する</div>
                                    <GlassBadge variant="gradient" size="sm">推奨</GlassBadge>
                                </div>
                                <div className="mt-1 text-[11px] text-slate-600">QR で専用ページを開き、枠合わせ後に自動反映します。</div>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => {
                                if (!requirementsReady) return;
                                setCaptureMethod("pc_camera");
                                setStep("camera");
                            }}
                            disabled={!requirementsReady}
                            className={cn(
                                "rounded-xl border p-2.5 text-left shadow-sm transition sm:rounded-2xl sm:p-3",
                                requirementsReady
                                    ? "border-slate-200 bg-white/80 hover:border-slate-300"
                                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60"
                            )}
                        >
                            <div className="text-xs font-bold text-slate-900">撮影する</div>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (!requirementsReady) return;
                                inputRef.current?.click();
                            }}
                            disabled={!requirementsReady}
                            className={cn(
                                "rounded-xl border p-2.5 text-left shadow-sm transition sm:rounded-2xl sm:p-3",
                                requirementsReady
                                    ? "border-slate-200 bg-white/80 hover:border-slate-300"
                                    : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-60"
                            )}
                        >
                            <div className="text-xs font-bold text-slate-900">写真をアップロードする</div>
                            <div className="mt-1 text-[11px] text-slate-600">既存写真を選び、枠に合わせて診断用の構図に整えます。</div>
                        </button>
                    </div>
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="hidden"
                        onChange={(event) => void handleUpload(event.target.files?.[0] ?? null, "upload")}
                    />
                </div>
            )}

            {step === "camera" && (
                <div className="space-y-2.5 sm:space-y-3">
                    <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-xl border border-white/70 bg-slate-900/85 shadow-inner sm:max-w-[360px] sm:rounded-2xl lg:max-w-[420px]" style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}>
                        <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover [transform:scaleX(-1)]" playsInline muted />
                        <svg viewBox={`0 0 ${FRAME_W} ${FRAME_H}`} className="absolute inset-0 h-full w-full">
                            <defs>
                                <mask id="real-face-camera-mask">
                                    <rect width={FRAME_W} height={FRAME_H} fill="white" />
                                    <path d={BUST_SILHOUETTE_PATH} fill="black" />
                                </mask>
                            </defs>
                            <rect width={FRAME_W} height={FRAME_H} fill="rgba(15,23,42,0.42)" mask="url(#real-face-camera-mask)" />
                            <path d={BUST_SILHOUETTE_PATH} fill="none" stroke={cameraPrompt === "撮影します…" ? "#a855f7" : "rgba(255,255,255,0.96)"} strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                            <path d={`M${MIDDLE_GUIDE_X1} ${MIDDLE_GUIDE_Y} L${MIDDLE_GUIDE_X2} ${MIDDLE_GUIDE_Y}`} stroke="rgba(255,255,255,0.75)" strokeWidth="4" strokeDasharray="14 12" strokeLinecap="round" />
                            <path d={`M${LOWER_GUIDE_X1} ${LOWER_GUIDE_Y} L${LOWER_GUIDE_X2} ${LOWER_GUIDE_Y}`} stroke="rgba(255,255,255,0.65)" strokeWidth="4" strokeDasharray="14 12" strokeLinecap="round" />
                        </svg>
                    </div>
                    <canvas ref={cameraCanvasRef} className="hidden" />
                    {!requirementsReady && (
                        <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3 sm:rounded-2xl sm:p-3.5">
                            <div className="text-xs font-bold text-rose-800">撮影前の必須チェック</div>
                            <div className="mt-2 grid grid-cols-2 gap-1.5">
                                {CAPTURE_REQUIREMENTS.map((item) => (
                                    <label key={item.key} className="flex items-center gap-2 rounded-lg border border-white/80 bg-white/85 px-2.5 py-1.5 text-[11px] text-slate-700 sm:rounded-xl sm:px-3 sm:py-2 sm:text-xs">
                                        <input
                                            type="checkbox"
                                            checked={captureRequirements[item.key]}
                                            onChange={(event) =>
                                                setCaptureRequirements((prev) => ({
                                                    ...prev,
                                                    [item.key]: event.target.checked,
                                                }))
                                            }
                                            className="h-3.5 w-3.5 accent-violet-500"
                                        />
                                        <span>{item.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    )}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 sm:rounded-xl sm:px-3.5 sm:py-2.5">{cameraPrompt}</div>
                    <div className="flex flex-wrap gap-2">
                        <GlassButton onClick={() => void captureFromVideo()} variant="gradient" disabled={!requirementsReady}>
                            今すぐ撮影
                        </GlassButton>
                        <GlassButton
                            onClick={() => {
                                stopCamera();
                                setStep(standaloneMode ? "camera" : "chooser");
                            }}
                            variant="secondary"
                        >
                            戻る
                        </GlassButton>
                    </div>
                </div>
            )}

            {step === "mobile_wait" && mobileSession && (
                <div className="space-y-2.5 sm:space-y-3">
                    <div className="grid gap-3 md:grid-cols-[150px_minmax(0,1fr)] md:items-center md:gap-4">
                        <div className="rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm sm:rounded-2xl sm:p-3">
                            <img src={makeQrUrl(mobileSession.captureUrl)} alt="capture qr" className="h-auto w-full rounded-xl" />
                        </div>
                        <div className="space-y-2">
                            <div className="text-sm font-bold text-slate-900">スマホで撮影後、自動で反映されます</div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs text-slate-600 sm:rounded-xl sm:p-3">
                                <div>1. スマホで URL を開く</div>
                                <div>2. 顔全体と首元をフレームに合わせる</div>
                                <div>3. 保存すると、この画面に自動反映されます</div>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-[11px] text-slate-500 break-all sm:rounded-xl sm:px-3 sm:py-2">
                                {mobileSession.captureUrl}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <GlassBadge variant="info">状態: {mobileSession.status === "pending" ? "アップロード待機中…" : mobileSession.status}</GlassBadge>
                                <GlassButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => navigator.clipboard.writeText(mobileSession.captureUrl).catch(() => undefined)}
                                >
                                    URLをコピー
                                </GlassButton>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {step === "align" && (
                <div className="space-y-2.5 sm:space-y-3">
                    {guidePreview}
                    {/* 品質プログレスリング + 詳細 */}
                    <div className="flex flex-col items-center gap-2.5 sm:flex-row sm:items-start sm:justify-center sm:gap-3">
                        <QualityProgressRing fit={assessment.fit} brightness={assessment.brightness} pose={assessment.pose} />
                        <div className="grid flex-1 gap-1.5 sm:grid-cols-1">
                            <div className={cn("rounded-xl border px-2.5 py-1.5 text-[11px]", assessment.fit.status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : assessment.fit.status === "ng" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700")} role="status" aria-label="構図チェック">
                                <span className="font-semibold">構図</span> {assessment.fit.message}
                            </div>
                            <div className={cn("rounded-xl border px-2.5 py-1.5 text-[11px]", assessment.brightness.status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : assessment.brightness.status === "ng" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700")} role="status" aria-label="明るさチェック">
                                <span className="font-semibold">明るさ</span> {assessment.brightness.message}
                            </div>
                            <div className={cn("rounded-xl border px-2.5 py-1.5 text-[11px]", assessment.pose.status === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : assessment.pose.status === "ng" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-amber-200 bg-amber-50 text-amber-700")} role="status" aria-label="姿勢チェック">
                                <span className="font-semibold">姿勢</span> {assessment.pose.message}
                            </div>
                        </div>
                    </div>
                    {[assessment.fit, assessment.pose].some((item) => item.status === "unstable") && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 sm:rounded-xl sm:px-3 sm:py-2">
                            判定がやや不安定です。見た目で問題なければ「この写真を使う」で続行できます。
                        </div>
                    )}
                    <div className="space-y-2 rounded-xl border border-slate-200 bg-white/80 p-2.5 sm:space-y-2 sm:rounded-2xl sm:p-3">
                        <label className="block text-xs font-semibold text-slate-700">拡大縮小: {alignScale.toFixed(2)}x</label>
                        <input type="range" min={SCALE_MIN} max={SCALE_MAX} step={0.01} value={alignScale} onChange={(event) => setAlignScale(Number(event.target.value))} className="w-full accent-violet-500" />
                        <label className="block text-xs font-semibold text-slate-700">左右位置: {offsetX}px</label>
                        <input type="range" min={-220} max={220} step={1} value={offsetX} onChange={(event) => setOffsetX(Number(event.target.value))} className="w-full accent-violet-500" />
                        <label className="block text-xs font-semibold text-slate-700">上下位置: {offsetY}px</label>
                        <input type="range" min={-260} max={260} step={1} value={offsetY} onChange={(event) => setOffsetY(Number(event.target.value))} className="w-full accent-violet-500" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <GlassButton onClick={() => void saveNormalizedImage()} loading={saving} disabled={!canContinue} variant="gradient">
                            {assessment.fit.status === "unstable" || assessment.pose.status === "unstable" ? "このまま使う" : "この写真を使う"}
                        </GlassButton>
                        <GlassButton
                            onClick={() => {
                                setSourceImage(null);
                                setPreviewImage(null);
                                setDetectedFace(null);
                                setDetectedLandmarks(null);
                                setLastEnhanced(null);
                                setAssessment(DEFAULT_STATUS);
                                setStep(standaloneMode ? "camera" : "chooser");
                            }}
                            variant="secondary"
                        >
                            撮り直す
                        </GlassButton>
                    </div>
                </div>
            )}
        </div>
    );

    if (standaloneMode || inlineMode) {
        return (
            <GlassCard className="p-3 sm:p-4">
                <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div>
                        <div className="text-sm font-bold text-slate-900">実顔写真の診断用セットアップ</div>
                        <div className="text-[11px] leading-4 text-slate-500">
                            必須条件を確認してから、入力手段を選択し、枠合わせと適合チェックを完了してください
                        </div>
                    </div>
                    {meta.normalizedRealFace && (
                        <GlassButton variant="secondary" size="sm" onClick={() => void clearRealFace()}>
                            クリア
                        </GlassButton>
                    )}
                </div>
                {body}
                {footer ? <div className="mt-3 sm:mt-3.5">{footer}</div> : null}
            </GlassCard>
        );
    }

    return (
        <>
            <GlassCard className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <div className="text-lg font-bold text-slate-900">実顔比較</div>
                            <GlassBadge variant={hasNormalized ? "success" : "secondary"} size="sm">
                                {hasNormalized ? "診断用画像あり" : "未設定"}
                            </GlassBadge>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                            この顔写真はパーソナルカラー診断にも使用されます。眼鏡なし・前髪で肌色を隠さない・色付きトップスを避ける・白色光での撮影を必須として扱ってください。
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <GlassButton onClick={() => { setStep("chooser"); setIsOpen(true); }} variant="gradient">
                            顔写真を設定
                        </GlassButton>
                        {hasNormalized && (
                            <GlassButton onClick={() => void clearRealFace()} variant="secondary" loading={saving}>
                                クリア
                            </GlassButton>
                        )}
                    </div>
                </div>

                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,420px),minmax(0,1fr)] lg:items-start">
                    {guidePreview}
                    <div className="space-y-3">
                        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50/80 p-5">
                            <div className="text-base font-bold text-slate-900">顔全体〜首元を枠に合わせて設定してください</div>
                            <div className="mt-2 text-sm text-slate-600">診断用に構図を整えます。自由アップロードではなく、枠合わせ必須で保存します。</div>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-3">
                            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">構図</div>
                                <div className="mt-2 text-sm font-semibold text-slate-800">{meta.fitCheckResult?.message ?? "未判定"}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">明るさ / 色偏り</div>
                                <div className="mt-2 text-sm font-semibold text-slate-800">{meta.brightnessCheckResult?.message ?? "未判定"}</div>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
                                <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">姿勢</div>
                                <div className="mt-2 text-sm font-semibold text-slate-800">{meta.poseCheckResult?.message ?? "未判定"}</div>
                            </div>
                        </div>
                        {showNotice && <div className="text-sm text-emerald-600">{showNotice}</div>}
                    </div>
                </div>
            </GlassCard>

            <GlassModal
                isOpen={isOpen}
                onClose={() => {
                    setIsOpen(false);
                    if (!standaloneMode) {
                        setStep("chooser");
                        setError(null);
                        setNotice(null);
                    }
                }}
                title="実顔写真の診断用セットアップ"
                size="xl"
            >
                <div className="mb-4 text-sm text-slate-500">
                    必須条件を確認してから、入力手段を選択し、枠合わせと適合チェックを完了してください
                </div>
                {body}
            </GlassModal>
        </>
    );
}
