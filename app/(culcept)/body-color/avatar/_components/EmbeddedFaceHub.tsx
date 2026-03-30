"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { GlassBadge, GlassButton, GlassCard } from "@/components/ui/glassmorphism-design";
import ImpressionStep from "@/app/aneurasync/face/_components/ImpressionStep";
import CompareFrame from "@/app/body-color/avatar/_components/CompareFrame";
import { FACE_COMPARISON_CATEGORIES } from "@/lib/face/references";
import { MOUTH_AXES, NOSE_AXES } from "@/lib/face/impressionAxes";
import type { CategorySelection, FacePhenotypeData, FaceImpressionScores, MouthImpression, NoseImpression } from "@/types/face-phenotype";
import { detectLandmarks, type NormalizedLandmark } from "@/lib/face/mediapipeFaceLandmarks";
import { classifyFaceParts, type FacePartsClassification } from "@/lib/face/facePartsClassifier";

type FaceFeatureId = "eye" | "face" | "brow" | "nose" | "mouth";
type GuidedFeatureId = "eye" | "face" | "brow";
type GuidedStage = "guide" | "capture" | "compare";

type OverlayOffset = { x: number; y: number };
type CaptureBounds = { x: number; y: number; w: number; h: number; margin: number; minShortSide?: number };

interface GuidedFeatureSample {
    key: string;
    label: string;
    desc: string;
    imageSrc?: string;
    fallback: ReactNode;
}

interface GuidedComparisonState {
    stage: GuidedStage;
    sampleIndex: number;
    overlayOffset: OverlayOffset;
    overlayScale: number;
    overlayOpacity: number;
    selectedKey: string | null;
    isFlipped: boolean;
}

interface EyeSession extends GuidedComparisonState {
    baseUrl: string | null;
}

interface FaceSession extends GuidedComparisonState {
    baseUrl: string | null;
}

interface BrowSession extends GuidedComparisonState {
    baseUrl: string | null;
}

interface GuidedFeatureConfig {
    id: GuidedFeatureId;
    label: string;
    icon: string;
    introTitle: string;
    introBody: string;
    introPoints: string[];
    compareTitle: string;
    compareHint: string;
    compareAspect: string;
    samples: GuidedFeatureSample[];
}

interface Props {
    defaultImage?: string | null;
    avatarImage?: string | null;
    initialPhenotype?: FacePhenotypeData | null;
    initialEyeType?: string | null;
    initialEyeColor?: string | null;
    initialFeature?: FaceFeatureId;
    onPersisted?: (nextPhenotype: FacePhenotypeData, completedCategories: string[]) => void;
    onEyePersisted?: (eyeType: string, eyeColor: string | null) => void;
    onLandmarksDetected?: (landmarks: Array<{ x: number; y: number; z: number }>) => void;
}

const GUIDE_VIEWBOX = { w: 290, h: 390 };
const REAL_FACE_GUIDE_VIEWBOX = { w: 1000, h: 1350 };
const REAL_FACE_MIDDLE_GUIDE = { x1: 404, x2: 596, y: 350 };
const REAL_FACE_LOWER_GUIDE = { x1: 350, x2: 650, y: 610 };
const REAL_FACE_BUST_SILHOUETTE_PATH =
    "M500 108 C305 108 180 220 176 448 C174 610 236 760 302 912 L-782 1350 L1782 1350 L698 912 C764 760 826 610 824 448 C820 220 695 108 500 108 Z";
const CAM_W = 1920;
const CAM_H = 1080;
const MIN_CAPTURE_SHORT_SIDE = 640;

const STORAGE_KEYS = {
    eyeCropRight: "culcept_eye_crop_right_v2",
    browCapture: "culcept_brow_capture_v2",
    browCaptureRightLegacy: "culcept_brow_capture_right_v1",
    browCaptureLeftLegacy: "culcept_brow_capture_left_v1",
    faceCapture: "culcept_face_capture_v1",
} as const;

const FEATURE_ORDER: Array<{ id: FaceFeatureId; label: string; icon: string }> = [
    { id: "eye", label: "目", icon: "👁️" },
    { id: "face", label: "輪郭", icon: "⬜" },
    { id: "brow", label: "眉", icon: "🖊️" },
    { id: "nose", label: "鼻", icon: "👃" },
    { id: "mouth", label: "口", icon: "👄" },
];

const FEATURE_TO_CATEGORY = {
    eye: "eye_shape",
    face: "face_shape",
    brow: "brow_shape",
} as const;

const FEATURE_LABELS: Record<FaceFeatureId, string> = {
    eye: "目",
    face: "輪郭",
    brow: "眉",
    nose: "鼻",
    mouth: "口",
};

const EYE_TYPE_LABELS: Record<string, string> = {
    armond: "アーモンド",
    kirenaga: "切れ長",
    tsurime: "つり目",
    tareme: "たれ目",
    marume: "丸目",
    yanagiba: "柳葉",
};

const CAPTURE_BOUNDS = {
    eye: { x: 44, y: 145, w: 92, h: 60, margin: 1.16, minShortSide: 820 },
    face: { x: 62, y: 56, w: 166, h: 246, margin: 1.1, minShortSide: 820 },
    brow: { x: 22, y: 88, w: 246, h: 112, margin: 1.12, minShortSide: 760 },
} as const satisfies Record<"eye" | "face" | "brow", CaptureBounds>;

const FACE_CONTOUR_SAMPLE_SRC: Record<string, string> = {
    oval: "/samples/genome/contour/tamago.png",
    square: "/samples/genome/contour/base.png",
    round: "/samples/genome/contour/maru.png",
    heart: "/samples/genome/contour/hart.png",
    oblong: "/samples/genome/contour/omonaga.png",
    inverted_triangle: "/samples/genome/contour/gyaku.png",
};

const STATIC_IMPRESSION_REFERENCES = {
    nose: {
        images: ["/avatars/mae.png", "/avatars/yoko.png"],
        captions: ["正面", "横顔"],
        previewLabel: "平均の参照画像",
        thumbnail: "/avatars/yoko.png",
    },
    mouth: {
        images: ["/avatars/mouth.png"],
        captions: ["口元"],
        previewLabel: "平均の参照画像",
        thumbnail: "/avatars/mouth.png",
    },
} as const;

function clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
}

function readStorage(key: string) {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(key);
    } catch {
        return null;
    }
}

function writeStorage(key: string, value: string) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(key, value);
    } catch {
        // ignore storage failures in MVP flow
    }
}

function removeStorage(key: string) {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(key);
    } catch {
        // ignore storage failures in MVP flow
    }
}

function deriveCompletedCategories(phenotype: FacePhenotypeData): string[] {
    const completed: string[] = [];
    if (phenotype.eye_shape?.primary) completed.push("目");
    if (phenotype.face_shape?.primary) completed.push("輪郭");
    if (phenotype.brow_shape?.primary) completed.push("眉");
    if (phenotype.nose_impression) completed.push("鼻");
    if (phenotype.mouth_impression) completed.push("口");
    return completed;
}

function getNextFeature(current: FaceFeatureId): FaceFeatureId {
    const currentIndex = FEATURE_ORDER.findIndex((item) => item.id === current);
    return FEATURE_ORDER[Math.min(currentIndex + 1, FEATURE_ORDER.length - 1)]?.id ?? current;
}

function isGuidedFeature(feature: FaceFeatureId): feature is GuidedFeatureId {
    return feature === "eye" || feature === "face" || feature === "brow";
}

function defaultComparisonState(selectedKey: string | null, sampleIndex = 0): GuidedComparisonState {
    return {
        stage: "guide",
        sampleIndex,
        overlayOffset: { x: 0, y: 0 },
        overlayScale: 0.92,
        overlayOpacity: 0.55,
        selectedKey,
        isFlipped: true,
    };
}

function buildEyeSession(selectedKey: string | null, sampleIndex = 0): EyeSession {
    return {
        ...defaultComparisonState(selectedKey, sampleIndex),
        baseUrl: null,
    };
}

function buildFaceSession(selectedKey: string | null, sampleIndex = 0): FaceSession {
    return {
        ...defaultComparisonState(selectedKey, sampleIndex),
        baseUrl: null,
    };
}

function buildBrowSession(selectedKey: string | null, sampleIndex = 0): BrowSession {
    return {
        ...defaultComparisonState(selectedKey, sampleIndex),
        baseUrl: null,
    };
}

function findSampleIndex(samples: GuidedFeatureSample[], key: string | null | undefined) {
    if (!key) return 0;
    const index = samples.findIndex((item) => item.key === key);
    return index >= 0 ? index : 0;
}

function resetOverlayState<T extends GuidedComparisonState>(session: T): T {
    return {
        ...session,
        overlayOffset: { x: 0, y: 0 },
        overlayScale: 0.92,
        overlayOpacity: 0.55,
    };
}

function captureGuidedCrop({
    video,
    canvas,
    container,
    crop,
    isFlipped,
}: {
    video: HTMLVideoElement;
    canvas: HTMLCanvasElement;
    container: HTMLDivElement;
    crop: CaptureBounds;
    isFlipped: boolean;
}) {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    if (!vw || !vh || !cw || !ch) return null;

    const containerAspect = cw / ch;
    const guideAspect = GUIDE_VIEWBOX.w / GUIDE_VIEWBOX.h;

    let guideScale = 1;
    let guideOffsetX = 0;
    let guideOffsetY = 0;

    if (containerAspect > guideAspect) {
        guideScale = ch / GUIDE_VIEWBOX.h;
        guideOffsetX = (cw - GUIDE_VIEWBOX.w * guideScale) / 2;
    } else {
        guideScale = cw / GUIDE_VIEWBOX.w;
        guideOffsetY = (ch - GUIDE_VIEWBOX.h * guideScale) / 2;
    }

    const cropCxContainer = guideOffsetX + (crop.x + crop.w / 2) * guideScale;
    const cropCyContainer = guideOffsetY + (crop.y + crop.h / 2) * guideScale;
    const cropWContainer = crop.w * guideScale;
    const cropHContainer = crop.h * guideScale;

    const videoAspect = vw / vh;
    let videoScale = 1;
    let videoOffsetX = 0;
    let videoOffsetY = 0;

    if (containerAspect > videoAspect) {
        videoScale = cw / vw;
        videoOffsetY = (ch - vh * videoScale) / 2;
    } else {
        videoScale = ch / vh;
        videoOffsetX = (cw - vw * videoScale) / 2;
    }

    let srcCx = (cropCxContainer - videoOffsetX) / videoScale;
    const srcCy = (cropCyContainer - videoOffsetY) / videoScale;
    if (isFlipped) srcCx = vw - srcCx;

    const srcW = (cropWContainer / videoScale) * crop.margin;
    const srcH = (cropHContainer / videoScale) * crop.margin;
    const sx = clamp(srcCx - srcW / 2, 0, vw - srcW);
    const sy = clamp(srcCy - srcH / 2, 0, vh - srcH);
    const minShortSide = crop.minShortSide ?? MIN_CAPTURE_SHORT_SIDE;
    const scaleFactor = Math.max(minShortSide / Math.min(srcW, srcH), 1);
    const outW = Math.round(srcW * scaleFactor);
    const outH = Math.round(srcH * scaleFactor);

    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, sx, sy, srcW, srcH, 0, 0, outW, outH);
    return canvas.toDataURL("image/jpeg", 0.96);
}

function GuideShell({ className, children }: { className?: string; children: ReactNode }) {
    return (
        <svg viewBox={`0 0 ${GUIDE_VIEWBOX.w} ${GUIDE_VIEWBOX.h}`} className={className} style={{ pointerEvents: "none" }}>
            {children}
        </svg>
    );
}

function EyeGuideOverlay({ className }: { className?: string }) {
    const eyeCenterX = CAPTURE_BOUNDS.eye.x + CAPTURE_BOUNDS.eye.w / 2;
    const eyeCenterY = CAPTURE_BOUNDS.eye.y + CAPTURE_BOUNDS.eye.h / 2;
    return (
        <GuideShell className={className}>
            <ellipse
                cx="145"
                cy="184"
                rx="80"
                ry="114"
                fill="none"
                stroke="rgba(255,255,255,0.62)"
                strokeWidth="1.7"
                strokeDasharray="7 4"
            />
            <rect
                x={CAPTURE_BOUNDS.eye.x}
                y={CAPTURE_BOUNDS.eye.y}
                width={CAPTURE_BOUNDS.eye.w}
                height={CAPTURE_BOUNDS.eye.h}
                rx="16"
                fill="rgba(139,92,246,0.16)"
                stroke="rgba(139,92,246,0.82)"
                strokeWidth="1.8"
                strokeDasharray="6 4"
            />
            <path
                d={`M${CAPTURE_BOUNDS.eye.x + 12} ${CAPTURE_BOUNDS.eye.y + CAPTURE_BOUNDS.eye.h / 2 + 5} Q${eyeCenterX} ${
                    CAPTURE_BOUNDS.eye.y + 10
                } ${CAPTURE_BOUNDS.eye.x + CAPTURE_BOUNDS.eye.w - 12} ${CAPTURE_BOUNDS.eye.y + CAPTURE_BOUNDS.eye.h / 2 + 5}`}
                fill="none"
                stroke="rgba(255,255,255,0.52)"
                strokeWidth="1.6"
                strokeLinecap="round"
            />
            <circle
                cx={eyeCenterX}
                cy={eyeCenterY}
                r="8"
                fill="rgba(255,255,255,0.08)"
                stroke="rgba(255,255,255,0.7)"
                strokeWidth="1.4"
            />
            <path
                d={`M${eyeCenterX - 14} ${eyeCenterY} H${eyeCenterX + 14}`}
                fill="none"
                stroke="rgba(255,255,255,0.78)"
                strokeWidth="1.2"
                strokeLinecap="round"
            />
            <path
                d={`M${eyeCenterX} ${eyeCenterY - 14} V${eyeCenterY + 14}`}
                fill="none"
                stroke="rgba(255,255,255,0.78)"
                strokeWidth="1.2"
                strokeLinecap="round"
            />
            <text x={eyeCenterX} y="132" textAnchor="middle" fill="rgba(139,92,246,0.95)" fontSize="11" fontWeight="700">
                黒目中心
            </text>
            <text x="145" y="350" textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="10">
                右目を紫枠へ入れ、黒目の中心を中央マーカーに合わせてください
            </text>
            <text x="145" y="368" textAnchor="middle" fill="rgba(139,92,246,0.95)" fontSize="10" fontWeight="700">
                顔全体は外側の楕円へ、比較用には右目だけを高画質で切り出します
            </text>
        </GuideShell>
    );
}

function ContourGuideOverlay({ className }: { className?: string }) {
    const scaleX = GUIDE_VIEWBOX.w / REAL_FACE_GUIDE_VIEWBOX.w;
    const scaleY = GUIDE_VIEWBOX.h / REAL_FACE_GUIDE_VIEWBOX.h;
    return (
        <GuideShell className={className}>
            <defs>
                <mask id="contour-real-face-mask">
                    <rect width={GUIDE_VIEWBOX.w} height={GUIDE_VIEWBOX.h} fill="white" />
                    <path
                        d={REAL_FACE_BUST_SILHOUETTE_PATH}
                        fill="black"
                        transform={`scale(${scaleX} ${scaleY})`}
                    />
                </mask>
            </defs>
            <rect
                width={GUIDE_VIEWBOX.w}
                height={GUIDE_VIEWBOX.h}
                fill="rgba(15,23,42,0.42)"
                mask="url(#contour-real-face-mask)"
            />
            <g transform={`scale(${scaleX} ${scaleY})`}>
                <path
                    d={REAL_FACE_BUST_SILHOUETTE_PATH}
                    fill="none"
                    stroke="rgba(255,255,255,0.96)"
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                <path
                    d={`M${REAL_FACE_MIDDLE_GUIDE.x1} ${REAL_FACE_MIDDLE_GUIDE.y} L${REAL_FACE_MIDDLE_GUIDE.x2} ${REAL_FACE_MIDDLE_GUIDE.y}`}
                    stroke="rgba(255,255,255,0.75)"
                    strokeWidth="4"
                    strokeDasharray="14 12"
                    strokeLinecap="round"
                />
                <path
                    d={`M${REAL_FACE_LOWER_GUIDE.x1} ${REAL_FACE_LOWER_GUIDE.y} L${REAL_FACE_LOWER_GUIDE.x2} ${REAL_FACE_LOWER_GUIDE.y}`}
                    stroke="rgba(255,255,255,0.65)"
                    strokeWidth="4"
                    strokeDasharray="14 12"
                    strokeLinecap="round"
                />
            </g>
            <text x="145" y="58" textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize="11" fontWeight="700">
                こめかみ・頬骨・エラ・顎先の骨格ラインに合わせてください
            </text>
            <text x="145" y="308" textAnchor="middle" fill="rgba(251,191,36,0.9)" fontSize="10" fontWeight="700">
                髪の外側ではなく骨格の輪郭を見る
            </text>
        </GuideShell>
    );
}

function BrowGuideOverlay({ className }: { className?: string }) {
    return (
        <GuideShell className={className}>
            <ellipse
                cx="145"
                cy="178"
                rx="76"
                ry="102"
                fill="none"
                stroke="rgba(255,255,255,0.28)"
                strokeWidth="1.5"
                strokeDasharray="7 5"
            />
            <rect
                x={CAPTURE_BOUNDS.brow.x}
                y={CAPTURE_BOUNDS.brow.y}
                width={CAPTURE_BOUNDS.brow.w}
                height={CAPTURE_BOUNDS.brow.h}
                rx="18"
                fill="rgba(139,92,246,0.16)"
                stroke="rgba(139,92,246,0.86)"
                strokeWidth="1.8"
                strokeDasharray="6 4"
            />
            <path
                d={`M145 ${CAPTURE_BOUNDS.brow.y + 6} V${CAPTURE_BOUNDS.brow.y + CAPTURE_BOUNDS.brow.h - 6}`}
                fill="none"
                stroke="rgba(255,255,255,0.48)"
                strokeWidth="1.4"
                strokeDasharray="6 4"
            />
            <text
                x="145"
                y="100"
                textAnchor="middle"
                fill="rgba(139,92,246,0.95)"
                fontSize="10"
                fontWeight="700"
            >
                両眉を1つの枠へ
            </text>
            <text x="145" y="352" textAnchor="middle" fill="rgba(255,255,255,0.78)" fontSize="10">
                眉頭から眉尻までを入れ、眉の上にも少し余白を残してください
            </text>
            <text x="145" y="370" textAnchor="middle" fill="rgba(139,92,246,0.95)" fontSize="10" fontWeight="700">
                詰め込まず自然な距離で合わせると比較しやすくなります
            </text>
        </GuideShell>
    );
}

function EyeFallbackOverlay({ type }: { type: string }) {
    const common = {
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 10,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
    };
    const irisCx = type === "tsurime" ? 156 : type === "tareme" ? 148 : 152;
    const irisCy = type === "marume" ? 82 : 80;
    const upperPath = {
        armond: "M24 88 Q80 34 152 40 Q228 46 286 86",
        kirenaga: "M18 92 Q92 56 154 54 Q224 52 292 88",
        tsurime: "M20 102 Q92 58 160 50 Q228 42 292 66",
        tareme: "M20 74 Q88 44 156 48 Q230 54 292 100",
        marume: "M28 96 Q84 24 152 24 Q220 24 278 96",
        yanagiba: "M14 96 Q88 62 152 60 Q222 58 298 90",
    }[type] ?? "M24 88 Q80 34 152 40 Q228 46 286 86";
    const lowerPath = {
        armond: "M24 88 Q86 136 152 136 Q220 136 286 86",
        kirenaga: "M18 92 Q92 118 154 118 Q222 116 292 88",
        tsurime: "M20 102 Q94 126 160 122 Q228 118 292 66",
        tareme: "M20 74 Q94 120 156 124 Q230 128 292 100",
        marume: "M28 96 Q84 152 152 154 Q220 152 278 96",
        yanagiba: "M14 96 Q90 122 152 122 Q224 120 298 90",
    }[type] ?? "M24 88 Q86 136 152 136 Q220 136 286 86";
    return (
        <svg viewBox="0 0 320 180" className="h-full w-full overflow-visible">
            <path d={upperPath} {...common} />
            <path d={lowerPath} {...common} />
            <circle cx={irisCx} cy={irisCy} r="28" fill="currentColor" opacity="0.2" />
            <circle cx={irisCx} cy={irisCy} r="12" fill="currentColor" opacity="0.35" />
        </svg>
    );
}

function FaceFallbackOverlay({ type }: { type: string }) {
    const common = {
        fill: "rgba(255,255,255,0.08)",
        stroke: "currentColor",
        strokeWidth: 10,
        strokeLinecap: "round" as const,
        strokeLinejoin: "round" as const,
    };
    const shape = {
        oval: <ellipse cx="130" cy="170" rx="78" ry="118" {...common} />,
        round: <ellipse cx="130" cy="174" rx="92" ry="102" {...common} />,
        oblong: <ellipse cx="130" cy="170" rx="72" ry="132" {...common} />,
        square: <rect x="48" y="56" width="164" height="224" rx="48" {...common} />,
        heart: <path d="M130 292 Q202 230 206 138 Q208 88 170 70 Q140 56 130 86 Q120 56 90 70 Q52 88 54 138 Q58 230 130 292 Z" {...common} />,
        inverted_triangle: <path d="M56 86 Q76 50 130 44 Q184 50 204 86 Q222 122 206 182 Q194 232 160 276 Q144 294 130 304 Q116 294 100 276 Q66 232 54 182 Q38 122 56 86 Z" {...common} />,
    }[type] ?? <ellipse cx="130" cy="170" rx="78" ry="118" {...common} />;
    return (
        <svg viewBox="0 0 260 340" className="h-full w-full overflow-visible">
            {shape}
        </svg>
    );
}

function BrowPair({ path, strokeWidth }: { path: string; strokeWidth: number }) {
    return (
        <>
            <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="translate(44 12)"
            />
            <path
                d={path}
                fill="none"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
                transform="translate(256 12) scale(-1 1)"
            />
        </>
    );
}

function BrowFallbackOverlay({ type }: { type: string }) {
    const config = {
        straight: { path: "M0 44 Q44 24 88 24 Q126 24 168 38", strokeWidth: 10 },
        soft_arch: { path: "M0 50 Q44 24 82 16 Q120 14 168 34", strokeWidth: 10 },
        high_arch: { path: "M0 58 Q42 24 78 8 Q102 10 168 40", strokeWidth: 10 },
        round: { path: "M0 52 Q42 18 84 18 Q126 20 168 44", strokeWidth: 11 },
        flat: { path: "M0 36 Q44 28 88 28 Q128 28 168 34", strokeWidth: 10 },
        ascending: { path: "M0 58 Q42 38 84 24 Q126 12 168 16", strokeWidth: 10 },
        thick_natural: { path: "M0 48 Q44 18 88 14 Q130 16 168 32", strokeWidth: 15 },
    }[type] ?? { path: "M0 44 Q44 24 88 24 Q126 24 168 38", strokeWidth: 10 };
    return (
        <svg viewBox="0 0 300 120" className="h-full w-full overflow-visible">
            <BrowPair path={config.path} strokeWidth={config.strokeWidth} />
        </svg>
    );
}

function buildEyeSamples(): GuidedFeatureSample[] {
    const eyeCategory = FACE_COMPARISON_CATEGORIES.find((item) => item.id === "eye_shape");
    const srcMap: Record<string, string | undefined> = {
        armond: "/samples/genome/eye/almond.png",
        kirenaga: "/samples/genome/eye/kirenaga.png",
        tsurime: "/samples/genome/eye/tsurime.png",
        tareme: "/samples/genome/eye/tare.png",
        marume: "/samples/genome/eye/marume.png",
        yanagiba: "/samples/genome/eye/yanagi.png",
    };
    return (eyeCategory?.options ?? []).map((option) => ({
        key: option.key,
        label: option.label,
        desc: option.desc,
        imageSrc: srcMap[option.key],
        fallback: <EyeFallbackOverlay type={option.key} />,
    }));
}

function buildFeatureSamples(feature: "face_shape" | "brow_shape"): GuidedFeatureSample[] {
    const category = FACE_COMPARISON_CATEGORIES.find((item) => item.id === feature);
    const browSrcMap: Record<string, string | undefined> = {
        straight: "/samples/genome/brow/heiko.png",
        soft_arch: "/samples/genome/brow/yuruyakaarch.png",
        high_arch: "/samples/genome/brow/takamearch.png",
        round: "/samples/genome/brow/marumi.png",
        flat: "/samples/genome/brow/heiko.png",
        ascending: "/samples/genome/brow/kakudo.png",
    };
    return (category?.options ?? []).map((option) => ({
        key: option.key,
        label: option.label,
        desc: option.desc,
        imageSrc:
            feature === "face_shape"
                ? FACE_CONTOUR_SAMPLE_SRC[option.key]
                : browSrcMap[option.key],
        fallback: feature === "face_shape" ? <FaceFallbackOverlay type={option.key} /> : <BrowFallbackOverlay type={option.key} />,
    }));
}

const GUIDED_CONFIGS: Record<GuidedFeatureId, GuidedFeatureConfig> = {
    eye: {
        id: "eye",
        label: "目",
        icon: "👁️",
        introTitle: "目の形を分析しましょう",
        introBody: "顔全体を外側ガイドに合わせつつ、右目を少し引き気味の専用枠に入れて撮影します。比較時は黒目の中心を基準にサンプルを重ねます。",
        introPoints: ["顔全体は楕円ガイドにゆるく入れる", "右目を紫枠へ入れ、黒目中心を中央マーカーへ合わせる", "比較画面でサンプルを前へ / 次へ で切り替え、位置とサイズを微調整する"],
        compareTitle: "右目アップとサンプルを比較",
        compareHint: "背景は右目だけを高画質で切り抜いた画像です。サンプルは前へ / 次へ で切り替え、ドラッグとスライダーで調整します。",
        compareAspect: "3 / 2",
        samples: buildEyeSamples(),
    },
    face: {
        id: "face",
        label: "輪郭",
        icon: "⬜",
        introTitle: "輪郭を比較しましょう",
        introBody: "髪の外周ではなく、こめかみ・頬骨・エラ・顎先の骨格ラインを基準に撮影し、輪郭サンプルを重ねて最も近い形を選びます。",
        introPoints: ["正面を向いて顔の傾きを抑える", "こめかみから顎先までの骨格ラインをガイドに寄せる", "比較画面で輪郭サンプルをサイズ調整できる"],
        compareTitle: "輪郭サンプルを重ねて比較",
        compareHint: "輪郭の背景画像は撮影結果です。縦横比は固定しているので、黒帯が出てもそのまま比較してください。",
        compareAspect: "3 / 4",
        samples: buildFeatureSamples("face_shape"),
    },
    brow: {
        id: "brow",
        label: "眉",
        icon: "🖊️",
        introTitle: "眉の形を比較しましょう",
        introBody: "両眉が同時に入る少しゆとりのある横長枠に合わせて 1 回だけ撮影し、その画像にペアの眉サンプルを重ねて比較します。",
        introPoints: ["左右の眉頭から眉尻までを一度に入れる", "眉上と眉尻側に少し余白を残す", "比較画面では両眉サンプルを重ねて全体の形を見る"],
        compareTitle: "眉サンプルを重ねて比較",
        compareHint: "背景は両眉をまとめて切り抜いた画像です。サンプルはドラッグ・サイズ変更・透明度変更ができます。",
        compareAspect: "5 / 2",
        samples: buildFeatureSamples("brow_shape"),
    },
};

function FeatureStepIndicator({ stage }: { stage: GuidedStage }) {
    const labels: GuidedStage[] = ["guide", "capture", "compare"];
    const index = labels.indexOf(stage);
    return (
        <div className="flex items-center gap-1">
            {labels.map((label, idx) => (
                <div
                    key={label}
                    className={cn(
                        "h-1.5 rounded-full transition-all",
                        idx <= index ? "w-24 bg-violet-500" : "w-16 bg-slate-200",
                    )}
                />
            ))}
        </div>
    );
}

function GuidedFeatureIntro({
    config,
    onStart,
    canResumeCompare = false,
    onResumeCompare,
    resumeLabel = "保存済み画像で比較する",
}: {
    config: GuidedFeatureConfig;
    onStart: () => void;
    canResumeCompare?: boolean;
    onResumeCompare?: () => void;
    resumeLabel?: string;
}) {
    return (
        <div className="space-y-6">
            <FeatureStepIndicator stage="guide" />
            <GlassCard className="border border-slate-200/80 bg-white/92 p-5">
                <div className="flex flex-col items-center text-center">
                    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-100 to-fuchsia-100 text-3xl">
                        {config.icon}
                    </div>
                    <div className="text-2xl font-black text-slate-900">{config.introTitle}</div>
                    <p className="mt-3 max-w-xl text-sm leading-7 text-slate-500">{config.introBody}</p>
                </div>
            </GlassCard>

            <GlassCard className="border border-slate-200/80 bg-white/92 p-5">
                <div className="text-sm font-black text-slate-900">進め方</div>
                <div className="mt-4 space-y-3 text-sm text-slate-500">
                    {config.introPoints.map((point) => (
                        <div key={point} className="flex items-start gap-3">
                            <span className="mt-0.5 text-base">•</span>
                            <span>{point}</span>
                        </div>
                    ))}
                </div>
            </GlassCard>

            <div className="flex flex-wrap gap-3">
                <GlassButton onClick={onStart} className="flex-1" variant="primary">
                    撮影をはじめる
                </GlassButton>
                {canResumeCompare && onResumeCompare ? (
                    <GlassButton onClick={onResumeCompare} className="flex-1" variant="default">
                        {resumeLabel}
                    </GlassButton>
                ) : null}
            </div>
        </div>
    );
}

function CameraCaptureStage({
    title,
    hint,
    captureButtonLabel,
    overlay,
    cropBounds,
    isFlipped,
    onToggleFlip,
    onCapture,
    onBack,
    badge,
}: {
    title: string;
    hint: string;
    captureButtonLabel: string;
    overlay: ReactNode;
    cropBounds: CaptureBounds;
    isFlipped: boolean;
    onToggleFlip: () => void;
    onCapture: (image: string) => Promise<void> | void;
    onBack: () => void;
    badge?: ReactNode;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [capturing, setCapturing] = useState(false);

    useEffect(() => {
        let stream: MediaStream | null = null;
        let active = true;

        (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: CAM_W }, height: { ideal: CAM_H }, facingMode: "user" },
                    audio: false,
                });
                if (!active || !videoRef.current) return;
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
                setReady(true);
            } catch (error) {
                console.error("camera error", error);
                if (active) setCameraError("カメラを起動できませんでした。ブラウザ権限を確認してください。");
            }
        })();

        return () => {
            active = false;
            stream?.getTracks().forEach((track) => track.stop());
        };
    }, []);

    const handleCapture = useCallback(async () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!video || !canvas || !container) return;

        const image = captureGuidedCrop({
            video,
            canvas,
            container,
            crop: cropBounds,
            isFlipped,
        });
        if (!image) return;

        setCapturing(true);
        try {
            await onCapture(image);
        } finally {
            setCapturing(false);
        }
    }, [cropBounds, isFlipped, onCapture]);

    return (
        <div className="space-y-4">
            <FeatureStepIndicator stage="capture" />
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <div className="text-xl font-black text-slate-900">{title}</div>
                    <div className="mt-1 text-sm text-slate-500">{hint}</div>
                </div>
                <div className="flex items-center gap-3">
                    {badge}
                    <button type="button" onClick={onToggleFlip} className="text-xs font-semibold text-violet-600 underline">
                        {isFlipped ? "反転あり" : "反転なし"}
                    </button>
                </div>
            </div>

            <div
                ref={containerRef}
                className="relative mx-auto w-full max-w-[440px] overflow-hidden rounded-[28px] border border-slate-200 bg-black lg:max-w-[500px]"
                style={{ aspectRatio: "3 / 4" }}
            >
                <video
                    ref={videoRef}
                    playsInline
                    muted
                    className="absolute inset-0 h-full w-full object-cover"
                    style={{ transform: isFlipped ? "scaleX(-1)" : "none" }}
                />
                {overlay}
            </div>

            {cameraError && <div className="rounded-2xl bg-rose-50 px-4 py-3 text-sm text-rose-700">{cameraError}</div>}
            <canvas ref={canvasRef} className="hidden" />

            <div className="flex flex-wrap gap-3">
                <GlassButton onClick={() => void handleCapture()} disabled={!ready || capturing} className="flex-1" loading={capturing}>
                    {ready ? captureButtonLabel : "カメラ起動中…"}
                </GlassButton>
                <GlassButton onClick={onBack} variant="default">
                    ガイドへ戻る
                </GlassButton>
            </div>
        </div>
    );
}

function GuidedFeatureCompare<T extends GuidedComparisonState>({
    config,
    baseUrl,
    session,
    saving,
    missingMessage,
    onReturnToCapture,
    onChangeSession,
    onConfirm,
    onRetake,
}: {
    config: GuidedFeatureConfig;
    baseUrl: string | null;
    session: T;
    saving: boolean;
    missingMessage: string;
    onReturnToCapture: () => void;
    onChangeSession: (updater: (prev: T) => T) => void;
    onConfirm: (key: string) => void;
    onRetake: () => void;
}) {
    const sample = config.samples[session.sampleIndex] ?? config.samples[0];

    const moveSample = useCallback(
        (direction: 1 | -1) => {
            onChangeSession((prev) => {
                const nextIndex = (prev.sampleIndex + direction + config.samples.length) % config.samples.length;
                return resetOverlayState({
                    ...prev,
                    sampleIndex: nextIndex,
                });
            });
        },
        [config.samples.length, onChangeSession],
    );

    if (!baseUrl) {
        return (
            <div className="space-y-4">
                <FeatureStepIndicator stage="compare" />
                <GlassCard className="border border-amber-200 bg-amber-50/90 p-5">
                    <div className="text-lg font-black text-slate-900">比較に必要な撮影データがありません</div>
                    <div className="mt-2 text-sm leading-7 text-slate-600">{missingMessage}</div>
                    <div className="mt-4">
                        <GlassButton onClick={onReturnToCapture}>撮影へ戻る</GlassButton>
                    </div>
                </GlassCard>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <FeatureStepIndicator stage="compare" />
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="text-xl font-black text-slate-900">{config.compareTitle}</div>
                    <div className="mt-1 text-sm text-slate-500">{config.compareHint}</div>
                </div>
                <GlassBadge variant="default">
                    {session.sampleIndex + 1} / {config.samples.length}
                </GlassBadge>
            </div>

            <div className="relative">
                <CompareFrame
                    baseUrl={baseUrl}
                    overlayUrl={sample.imageSrc}
                    overlayNode={<div className="h-full w-full text-violet-300">{sample.fallback}</div>}
                    aspect={config.compareAspect}
                    opacity={session.overlayOpacity}
                    scale={session.overlayScale}
                    dx={session.overlayOffset.x}
                    dy={session.overlayOffset.y}
                    onOverlayPositionChange={({ dx, dy }) =>
                        onChangeSession((prev) => ({
                            ...prev,
                            overlayOffset: {
                                x: clamp(dx, -220, 220),
                                y: clamp(dy, -180, 180),
                            },
                        }))
                    }
                />

                <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/92 px-3 py-1 text-xs font-black text-slate-700">
                    {sample.label}
                </div>
                {session.selectedKey === sample.key && (
                    <div className="pointer-events-none absolute right-4 top-4 rounded-full bg-emerald-500 px-3 py-1 text-xs font-black text-white">
                        保存済み
                    </div>
                )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <GlassCard className="border border-slate-200/80 bg-white/92 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Adjust Overlay</div>
                    <div className="mt-4 space-y-4">
                        <div>
                            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                                <span>透明度</span>
                                <span>{Math.round(session.overlayOpacity * 100)}%</span>
                            </div>
                            <input
                                type="range"
                                min={0.2}
                                max={1}
                                step={0.05}
                                value={session.overlayOpacity}
                                onChange={(e) =>
                                    onChangeSession((prev) => ({
                                        ...prev,
                                        overlayOpacity: Number(e.target.value),
                                    }))
                                }
                                className="w-full accent-violet-500"
                            />
                        </div>
                        <div>
                            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-slate-500">
                                <span>サイズ</span>
                                <span>{session.overlayScale.toFixed(2)}x</span>
                            </div>
                            <input
                                type="range"
                                min={0.65}
                                max={1.55}
                                step={0.05}
                                value={session.overlayScale}
                                onChange={(e) =>
                                    onChangeSession((prev) => ({
                                        ...prev,
                                        overlayScale: Number(e.target.value),
                                    }))
                                }
                                className="w-full accent-violet-500"
                            />
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <GlassButton
                                onClick={() => onChangeSession((prev) => resetOverlayState(prev))}
                                variant="default"
                                size="sm"
                            >
                                位置をリセット
                            </GlassButton>
                            <GlassButton onClick={onRetake} variant="default" size="sm">
                                撮り直す
                            </GlassButton>
                        </div>
                    </div>
                </GlassCard>

                <GlassCard className="border border-slate-200/80 bg-white/92 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">Sample</div>
                    <div className="mt-3 text-lg font-black text-slate-900">{sample.label}</div>
                    <p className="mt-2 text-sm leading-7 text-slate-500">{sample.desc}</p>
                    <div className="mt-4 flex items-center justify-between gap-3">
                        <GlassButton onClick={() => moveSample(-1)} variant="default" size="sm">
                            前へ
                        </GlassButton>
                        <div className="flex items-center gap-2">
                            {config.samples.map((item, index) => (
                                <span
                                    key={item.key}
                                    className={cn(
                                        "h-2.5 w-2.5 rounded-full transition-all",
                                        index === session.sampleIndex ? "bg-violet-500" : "bg-slate-200",
                                    )}
                                    aria-hidden="true"
                                />
                            ))}
                        </div>
                        <GlassButton onClick={() => moveSample(1)} variant="default" size="sm">
                            次へ
                        </GlassButton>
                    </div>
                    <div className="mt-4">
                        <GlassButton onClick={() => onConfirm(sample.key)} className="w-full" loading={saving}>
                            「{sample.label}」が一番近い
                        </GlassButton>
                    </div>
                </GlassCard>
            </div>
        </div>
    );
}

export default function EmbeddedFaceHub({
    defaultImage,
    avatarImage,
    initialPhenotype,
    initialEyeType,
    initialEyeColor,
    initialFeature = "eye",
    onPersisted,
    onEyePersisted,
    onLandmarksDetected,
}: Props) {
    const [activeFeature, setActiveFeature] = useState<FaceFeatureId>(initialFeature);
    const [selections, setSelections] = useState<FacePhenotypeData>(() => ({
        ...(initialPhenotype ?? {}),
        ...(initialEyeType ? { eye_shape: { primary: initialEyeType } } : {}),
    }));
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [saveMessage, setSaveMessage] = useState<string | null>(null);
    const didBootstrapFromPropsRef = useRef(false);
    const didLoadStoredCapturesRef = useRef(false);

    const [guidedSessions, setGuidedSessions] = useState<{
        eye: EyeSession;
        face: FaceSession;
        brow: BrowSession;
    }>(() => ({
        eye: buildEyeSession(initialEyeType ?? null, findSampleIndex(GUIDED_CONFIGS.eye.samples, initialEyeType)),
        face: buildFaceSession(initialPhenotype?.face_shape?.primary ?? null, findSampleIndex(GUIDED_CONFIGS.face.samples, initialPhenotype?.face_shape?.primary)),
        brow: buildBrowSession(initialPhenotype?.brow_shape?.primary ?? null, findSampleIndex(GUIDED_CONFIGS.brow.samples, initialPhenotype?.brow_shape?.primary)),
    }));

    useEffect(() => {
        if (didBootstrapFromPropsRef.current) return;
        const hasInitialSelections = Boolean(
            initialEyeType ||
                initialPhenotype?.eye_shape?.primary ||
                initialPhenotype?.face_shape?.primary ||
                initialPhenotype?.brow_shape?.primary ||
                initialPhenotype?.nose_impression ||
                initialPhenotype?.mouth_impression,
        );
        if (!hasInitialSelections) return;

        setSelections((prev) => ({
            ...prev,
            ...(initialPhenotype ?? {}),
            ...(prev.eye_shape?.primary ? {} : initialEyeType ? { eye_shape: { primary: initialEyeType } } : {}),
        }));
        setGuidedSessions((prev) => ({
            eye: {
                ...prev.eye,
                sampleIndex: prev.eye.selectedKey ? prev.eye.sampleIndex : findSampleIndex(GUIDED_CONFIGS.eye.samples, initialEyeType),
                selectedKey: prev.eye.selectedKey ?? initialEyeType ?? null,
            },
            face: {
                ...prev.face,
                sampleIndex: prev.face.selectedKey ? prev.face.sampleIndex : findSampleIndex(GUIDED_CONFIGS.face.samples, initialPhenotype?.face_shape?.primary),
                selectedKey: prev.face.selectedKey ?? initialPhenotype?.face_shape?.primary ?? null,
            },
            brow: {
                ...prev.brow,
                sampleIndex: prev.brow.selectedKey ? prev.brow.sampleIndex : findSampleIndex(GUIDED_CONFIGS.brow.samples, initialPhenotype?.brow_shape?.primary),
                selectedKey: prev.brow.selectedKey ?? initialPhenotype?.brow_shape?.primary ?? null,
            },
        }));
        didBootstrapFromPropsRef.current = true;
    }, [initialEyeType, initialPhenotype]);

    useEffect(() => {
        if (didLoadStoredCapturesRef.current) return;
        didLoadStoredCapturesRef.current = true;
        const eyeCrop = readStorage(STORAGE_KEYS.eyeCropRight);
        const faceCapture = readStorage(STORAGE_KEYS.faceCapture);
        const browCapture = readStorage(STORAGE_KEYS.browCapture);

        setGuidedSessions((prev) => ({
            eye: {
                ...prev.eye,
                baseUrl: eyeCrop ?? prev.eye.baseUrl,
            },
            face: {
                ...prev.face,
                baseUrl: faceCapture ?? prev.face.baseUrl,
            },
            brow: {
                ...prev.brow,
                baseUrl: browCapture ?? prev.brow.baseUrl,
            },
        }));
    }, []);

    // ── AI 自動分類 ──
    const [aiClassification, setAiClassification] = useState<FacePartsClassification | null>(null);
    const [aiClassifying, setAiClassifying] = useState(false);

    /** 保存済みの実顔画像 or defaultImage からランドマーク検出→顔パーツ分類 */
    const runAutoClassify = useCallback(async (imageUrl?: string | null) => {
        const src = imageUrl || defaultImage || avatarImage;
        if (!src) return null;
        setAiClassifying(true);
        try {
            // 画像をロード
            const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                const el = new Image();
                el.crossOrigin = "anonymous";
                el.onload = () => resolve(el);
                el.onerror = () => reject(new Error("画像の読み込みに失敗"));
                el.src = src;
            });
            const result = await detectLandmarks(img);
            if (!result || !result.landmarks || result.landmarks.length < 468) {
                return null;
            }
            const classification = classifyFaceParts(result.landmarks);
            setAiClassification(classification);

            // ランドマークを親コンポーネントに通知（パーソナルカラー分析等で使用）
            onLandmarksDetected?.(result.landmarks);

            // AI 推定値でセッションのデフォルト候補を設定（まだ手動選択していない場合のみ）
            setGuidedSessions((prev) => ({
                eye: prev.eye.selectedKey ? prev.eye : {
                    ...prev.eye,
                    sampleIndex: findSampleIndex(GUIDED_CONFIGS.eye.samples, classification.eyeShape.primary),
                },
                face: prev.face.selectedKey ? prev.face : {
                    ...prev.face,
                    sampleIndex: findSampleIndex(GUIDED_CONFIGS.face.samples, classification.faceShape.primary),
                },
                brow: prev.brow.selectedKey ? prev.brow : {
                    ...prev.brow,
                    sampleIndex: findSampleIndex(GUIDED_CONFIGS.brow.samples, classification.browShape.primary),
                },
            }));

            return classification;
        } catch {
            return null;
        } finally {
            setAiClassifying(false);
        }
    }, [defaultImage, avatarImage, onLandmarksDetected]);

    const completedCategories = useMemo(() => deriveCompletedCategories(selections), [selections]);
    const eyeLabel = selections.eye_shape?.primary
        ? EYE_TYPE_LABELS[selections.eye_shape.primary] ?? selections.eye_shape.primary
        : initialEyeType
          ? EYE_TYPE_LABELS[initialEyeType] ?? initialEyeType
          : "未設定";
    const faceLabel = completedCategories.length > 0 ? completedCategories.join(" / ") : "未入力";

    const updateGuidedSession = useCallback(
        function <K extends GuidedFeatureId>(feature: K, updater: (prev: { eye: EyeSession; face: FaceSession; brow: BrowSession }[K]) => { eye: EyeSession; face: FaceSession; brow: BrowSession }[K]) {
            didBootstrapFromPropsRef.current = true;
            setGuidedSessions((prev) => ({
                ...prev,
                [feature]: updater(prev[feature]),
            }));
        },
        [],
    );

    const persistPhenotypePatch = useCallback(
        async (patch: Partial<FacePhenotypeData>) => {
            const nextSelections = { ...selections, ...patch };
            setSelections(nextSelections);
            setSaving(true);
            setSaveError(null);
            setSaveMessage(null);
            try {
                const res = await fetch("/api/aneurasync/face-phenotype", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ phenotype: patch }),
                });
                const data = await res.json().catch(() => null);
                if (!res.ok || !data?.ok) {
                    throw new Error(data?.error ?? "顔まわり判定の保存に失敗しました");
                }
                const nextCompleted = deriveCompletedCategories(nextSelections);
                onPersisted?.(nextSelections, nextCompleted);
                return nextSelections;
            } catch (error) {
                const message = error instanceof Error ? error.message : "顔まわり判定の保存に失敗しました";
                setSaveError(message);
                return null;
            } finally {
                setSaving(false);
            }
        },
        [onPersisted, selections],
    );

    const saveEyeSelection = useCallback(
        async (eyeType: string, isFlipped: boolean) => {
            setSaving(true);
            setSaveError(null);
            setSaveMessage(null);
            try {
                const eyeRes = await fetch("/api/eye-profile", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        eyeType,
                        eyeColor: initialEyeColor ?? null,
                        isFlipped,
                    }),
                });
                const eyeData = await eyeRes.json().catch(() => null);
                if (!eyeRes.ok || !eyeData?.ok) {
                    throw new Error(eyeData?.error ?? "目の保存に失敗しました");
                }

                const nextSelections = await persistPhenotypePatch({ eye_shape: { primary: eyeType } });
                if (!nextSelections) throw new Error("目の保存に失敗しました");

                updateGuidedSession("eye", (prev) => ({
                    ...prev,
                    selectedKey: eyeType,
                }));
                onEyePersisted?.(eyeType, initialEyeColor ?? null);
                setSaveMessage("目の形を保存しました");
                return true;
            } catch (error) {
                setSaveError(error instanceof Error ? error.message : "目の保存に失敗しました");
                return false;
            } finally {
                setSaving(false);
            }
        },
        [initialEyeColor, onEyePersisted, persistPhenotypePatch, updateGuidedSession],
    );

    /** AIで全パーツを一括判定して保存 */
    const autoClassifyAndSaveAll = useCallback(async () => {
        const classification = await runAutoClassify();
        if (!classification) {
            setSaveError("AI判定に失敗しました。顔写真を設定してから再試行してください");
            return;
        }

        const patch: Partial<FacePhenotypeData> = {
            face_shape: { primary: classification.faceShape.primary, runner_up: classification.faceShape.runner_up },
            eye_shape: { primary: classification.eyeShape.primary, runner_up: classification.eyeShape.runner_up },
            brow_shape: { primary: classification.browShape.primary, runner_up: classification.browShape.runner_up },
            nose_impression: classification.noseImpression,
            mouth_impression: classification.mouthImpression,
            face_impression: classification.faceImpression,
        };

        await saveEyeSelection(classification.eyeShape.primary, false);

        const nextSelections = await persistPhenotypePatch(patch);
        if (nextSelections) {
            setGuidedSessions((prev) => ({
                eye: { ...prev.eye, selectedKey: classification.eyeShape.primary, sampleIndex: findSampleIndex(GUIDED_CONFIGS.eye.samples, classification.eyeShape.primary) },
                face: { ...prev.face, selectedKey: classification.faceShape.primary, sampleIndex: findSampleIndex(GUIDED_CONFIGS.face.samples, classification.faceShape.primary) },
                brow: { ...prev.brow, selectedKey: classification.browShape.primary, sampleIndex: findSampleIndex(GUIDED_CONFIGS.brow.samples, classification.browShape.primary) },
            }));
            setSaveMessage("AIで全パーツの判定を保存しました");
        }
    }, [runAutoClassify, persistPhenotypePatch, saveEyeSelection]);

    // 初回マウント時に顔画像があれば自動分類を試行
    useEffect(() => {
        if (defaultImage || avatarImage) {
            void runAutoClassify();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const saveGuidedFeature = useCallback(
        async (feature: GuidedFeatureId, key: string) => {
            if (feature === "eye") {
                const session = guidedSessions.eye;
                await saveEyeSelection(key, session.isFlipped);
                return;
            }

            const patchKey = FEATURE_TO_CATEGORY[feature];
            const nextSelections = await persistPhenotypePatch({ [patchKey]: { primary: key } as CategorySelection });
            if (!nextSelections) return;

            updateGuidedSession(feature, (prev) => ({
                ...prev,
                selectedKey: key,
            }));
            setSaveMessage(`${FEATURE_LABELS[feature]}を保存しました`);
        },
        [guidedSessions.eye, persistPhenotypePatch, saveEyeSelection, updateGuidedSession],
    );

    const handleImpressionComplete = useCallback(
        async (feature: "nose" | "mouth", scores: Record<string, number>) => {
            const patch =
                feature === "nose"
                    ? { nose_impression: scores as unknown as NoseImpression }
                    : { mouth_impression: scores as unknown as MouthImpression };
            const nextSelections = await persistPhenotypePatch(patch);
            if (!nextSelections) return;
            setSaveMessage(`${FEATURE_LABELS[feature]}を保存しました`);
        },
        [persistPhenotypePatch],
    );

    const beginFeatureCapture = useCallback(
        (feature: GuidedFeatureId) => {
            updateGuidedSession(feature, (prev) => ({
                ...prev,
                stage: "capture",
            }));
        },
        [updateGuidedSession],
    );

    const handleEyeCapture = useCallback(
        async (image: string) => {
            writeStorage(STORAGE_KEYS.eyeCropRight, image);
            updateGuidedSession("eye", (prev) =>
                resetOverlayState({
                    ...prev,
                    baseUrl: image,
                    stage: "compare",
                }),
            );
        },
        [updateGuidedSession],
    );

    const handleFaceCapture = useCallback(
        async (image: string) => {
            writeStorage(STORAGE_KEYS.faceCapture, image);
            updateGuidedSession("face", (prev) =>
                resetOverlayState({
                    ...prev,
                    baseUrl: image,
                    stage: "compare",
                }),
            );
        },
        [updateGuidedSession],
    );

    const handleBrowCapture = useCallback(
        async (image: string) => {
            writeStorage(STORAGE_KEYS.browCapture, image);
            updateGuidedSession("brow", (prev) =>
                resetOverlayState({
                    ...prev,
                    baseUrl: image,
                    stage: "compare",
                }),
            );
        },
        [updateGuidedSession],
    );

    const retakeGuidedFeature = useCallback(
        (feature: GuidedFeatureId) => {
            if (feature === "eye") {
                removeStorage(STORAGE_KEYS.eyeCropRight);
                updateGuidedSession("eye", (prev) => ({
                    ...resetOverlayState(prev),
                    baseUrl: null,
                    stage: "capture",
                }));
                return;
            }

            if (feature === "face") {
                removeStorage(STORAGE_KEYS.faceCapture);
                updateGuidedSession("face", (prev) => ({
                    ...resetOverlayState(prev),
                    baseUrl: null,
                    stage: "capture",
                }));
                return;
            }

            removeStorage(STORAGE_KEYS.browCapture);
            removeStorage(STORAGE_KEYS.browCaptureRightLegacy);
            removeStorage(STORAGE_KEYS.browCaptureLeftLegacy);
            updateGuidedSession("brow", (prev) => ({
                ...resetOverlayState(prev),
                baseUrl: null,
                stage: "capture",
            }));
        },
        [updateGuidedSession],
    );

    const renderGuidedFeature = (feature: GuidedFeatureId) => {
        const config = GUIDED_CONFIGS[feature];

        if (feature === "eye") {
            const session = guidedSessions.eye;
            if (session.stage === "guide") {
                return (
                    <GuidedFeatureIntro
                        config={config}
                        onStart={() => beginFeatureCapture("eye")}
                        canResumeCompare={Boolean(session.baseUrl)}
                        onResumeCompare={() => updateGuidedSession("eye", (prev) => ({ ...prev, stage: "compare" }))}
                        resumeLabel="保存済みの右目で比較する"
                    />
                );
            }
            if (session.stage === "capture") {
                return (
                    <CameraCaptureStage
                        title="目を撮影"
                        hint="顔全体は外側ガイドへ、右目は紫枠へ合わせてください。黒目の中心が中央マーカーに来ると比較しやすくなります。"
                        captureButtonLabel="右目を撮影する"
                        overlay={<EyeGuideOverlay className="absolute inset-0 h-full w-full" />}
                        cropBounds={CAPTURE_BOUNDS.eye}
                        isFlipped={session.isFlipped}
                        onToggleFlip={() => updateGuidedSession("eye", (prev) => ({ ...prev, isFlipped: !prev.isFlipped }))}
                        onCapture={handleEyeCapture}
                        onBack={() => updateGuidedSession("eye", (prev) => ({ ...prev, stage: "guide" }))}
                    />
                );
            }
            return (
                <GuidedFeatureCompare
                    config={config}
                    baseUrl={session.baseUrl}
                    session={session}
                    saving={saving}
                    missingMessage="右目クロップが見つかりません。比較画面は必ず右目クロップを背景に使うため、撮影からやり直してください。"
                    onReturnToCapture={() => retakeGuidedFeature("eye")}
                    onChangeSession={(updater) => updateGuidedSession("eye", updater)}
                    onConfirm={(key) => void saveGuidedFeature("eye", key)}
                    onRetake={() => retakeGuidedFeature("eye")}
                />
            );
        }

        if (feature === "face") {
            const session = guidedSessions.face;
            if (session.stage === "guide") {
                return (
                    <GuidedFeatureIntro
                        config={config}
                        onStart={() => beginFeatureCapture("face")}
                        canResumeCompare={Boolean(session.baseUrl)}
                        onResumeCompare={() => updateGuidedSession("face", (prev) => ({ ...prev, stage: "compare" }))}
                        resumeLabel="保存済みの輪郭で比較する"
                    />
                );
            }
            if (session.stage === "capture") {
                return (
                    <CameraCaptureStage
                        title="輪郭を撮影"
                        hint="髪の外側ではなく、こめかみ・頬骨・エラ・顎先の骨格ラインがガイドに沿うように合わせてください。"
                        captureButtonLabel="輪郭を撮影する"
                        overlay={<ContourGuideOverlay className="absolute inset-0 h-full w-full" />}
                        cropBounds={CAPTURE_BOUNDS.face}
                        isFlipped={session.isFlipped}
                        onToggleFlip={() => updateGuidedSession("face", (prev) => ({ ...prev, isFlipped: !prev.isFlipped }))}
                        onCapture={handleFaceCapture}
                        onBack={() => updateGuidedSession("face", (prev) => ({ ...prev, stage: "guide" }))}
                    />
                );
            }
            return (
                <GuidedFeatureCompare
                    config={config}
                    baseUrl={session.baseUrl}
                    session={session}
                    saving={saving}
                    missingMessage="輪郭比較用の撮影画像がありません。輪郭ガイドに合わせて撮影してください。"
                    onReturnToCapture={() => retakeGuidedFeature("face")}
                    onChangeSession={(updater) => updateGuidedSession("face", updater)}
                    onConfirm={(key) => void saveGuidedFeature("face", key)}
                    onRetake={() => retakeGuidedFeature("face")}
                />
            );
        }

        const session = guidedSessions.brow;
        if (session.stage === "guide") {
            return (
                <GuidedFeatureIntro
                    config={config}
                    onStart={() => beginFeatureCapture("brow")}
                    canResumeCompare={Boolean(session.baseUrl)}
                    onResumeCompare={() => updateGuidedSession("brow", (prev) => ({ ...prev, stage: "compare" }))}
                    resumeLabel="保存済みの両眉で比較する"
                />
            );
        }
        if (session.stage === "capture") {
            return (
                <CameraCaptureStage
                    title="眉を撮影"
                    hint="両眉を1つの枠へ入れ、眉上と眉尻側に少し余白を残して合わせてください。"
                    captureButtonLabel="両眉を撮影する"
                    overlay={<BrowGuideOverlay className="absolute inset-0 h-full w-full" />}
                    cropBounds={CAPTURE_BOUNDS.brow}
                    isFlipped={session.isFlipped}
                    onToggleFlip={() => updateGuidedSession("brow", (prev) => ({ ...prev, isFlipped: !prev.isFlipped }))}
                    onCapture={handleBrowCapture}
                    onBack={() => updateGuidedSession("brow", (prev) => ({ ...prev, stage: "guide" }))}
                />
            );
        }
        return (
            <GuidedFeatureCompare
                config={config}
                baseUrl={session.baseUrl}
                session={session}
                saving={saving}
                missingMessage="両眉を同時に撮影したキャプチャが必要です。比較に入る前に 1 枚撮影してください。"
                onReturnToCapture={() => retakeGuidedFeature("brow")}
                onChangeSession={(updater) => updateGuidedSession("brow", updater)}
                onConfirm={(key) => void saveGuidedFeature("brow", key)}
                onRetake={() => retakeGuidedFeature("brow")}
            />
        );
    };

    const renderFeatureContent = () => {
        if (isGuidedFeature(activeFeature)) {
            return renderGuidedFeature(activeFeature);
        }

        if (activeFeature === "nose") {
            return (
                <ImpressionStep
                    title="鼻"
                    icon="👃"
                    axes={NOSE_AXES}
                    referenceImages={[...STATIC_IMPRESSION_REFERENCES.nose.images]}
                    referenceCaptions={[...STATIC_IMPRESSION_REFERENCES.nose.captions]}
                    previewLabel={STATIC_IMPRESSION_REFERENCES.nose.previewLabel}
                    focusArea="nose"
                    existing={selections.nose_impression as Record<string, number> | undefined}
                    onComplete={(scores) => void handleImpressionComplete("nose", scores)}
                />
            );
        }

        return (
            <ImpressionStep
                title="口"
                icon="👄"
                axes={MOUTH_AXES}
                referenceImages={[...STATIC_IMPRESSION_REFERENCES.mouth.images]}
                referenceCaptions={[...STATIC_IMPRESSION_REFERENCES.mouth.captions]}
                previewLabel={STATIC_IMPRESSION_REFERENCES.mouth.previewLabel}
                focusArea="mouth"
                existing={selections.mouth_impression as Record<string, number> | undefined}
                onComplete={(scores) => void handleImpressionComplete("mouth", scores)}
            />
        );
    };

    const activeGuidedConfig = isGuidedFeature(activeFeature) ? GUIDED_CONFIGS[activeFeature] : null;

    return (
        <section id="face-analysis" className="space-y-6">
            <div className="flex items-center gap-3">
                <div className="text-xs font-black uppercase tracking-[0.34em] text-violet-400">Genome Analysis</div>
                <div className="h-px flex-1 bg-gradient-to-r from-violet-200 via-fuchsia-100 to-transparent" />
            </div>

            <GlassCard className="p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <div className="text-xl font-black text-slate-900">顔まわり判定</div>
                        <div className="mt-1 text-sm text-slate-500">目・輪郭・眉・鼻・口をこの画面で順番に更新します。</div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <GlassBadge variant="default">{completedCategories.length}/5 入力済み</GlassBadge>
                        <GlassBadge variant="default">eye {eyeLabel}</GlassBadge>
                    </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                    {FEATURE_ORDER.map((feature) => {
                        const done = completedCategories.includes(FEATURE_LABELS[feature.id]);
                        const active = activeFeature === feature.id;
                        return (
                            <button
                                key={feature.id}
                                type="button"
                                onClick={() => {
                                    didBootstrapFromPropsRef.current = true;
                                    setActiveFeature(feature.id);
                                    setSaveError(null);
                                    setSaveMessage(null);
                                }}
                                className={cn(
                                    "inline-flex items-center gap-2 rounded-2xl border px-4 py-3 text-sm font-black transition-all",
                                    active
                                        ? "border-violet-300 bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20"
                                        : done
                                          ? "border-violet-200 bg-violet-50/90 text-violet-700"
                                          : "border-slate-200 bg-white/80 text-slate-600 hover:border-violet-200 hover:text-slate-900",
                                )}
                            >
                                <span>{feature.icon}</span>
                                <span>{feature.label}</span>
                                {done && <span className={cn("text-xs", active ? "text-white/80" : "text-violet-500")}>✓</span>}
                            </button>
                        );
                    })}
                </div>

                {(saveMessage || saveError) && (
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                        {saveMessage && <div className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700">{saveMessage}</div>}
                        {saveError && <div className="rounded-full bg-rose-50 px-3 py-1 text-rose-700">{saveError}</div>}
                    </div>
                )}
            </GlassCard>

            <GlassCard className="p-6 sm:p-8">
                    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <div className="text-sm font-black uppercase tracking-[0.22em] text-slate-400">Active Part</div>
                            <div className="mt-2 text-2xl font-black text-slate-900">
                                {FEATURE_ORDER.find((item) => item.id === activeFeature)?.icon}{" "}
                                {FEATURE_ORDER.find((item) => item.id === activeFeature)?.label}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <GlassBadge variant="default">進捗 {faceLabel}</GlassBadge>
                                <GlassBadge variant="default">eye {eyeLabel}</GlassBadge>
                                {activeGuidedConfig && <GlassBadge variant="default">{activeGuidedConfig.label}フロー</GlassBadge>}
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <GlassBadge variant="secondary">
                                {FEATURE_ORDER.findIndex((item) => item.id === activeFeature) + 1} / {FEATURE_ORDER.length}
                            </GlassBadge>
                            {isGuidedFeature(activeFeature) ? (
                                <GlassButton
                                    onClick={() =>
                                        updateGuidedSession(activeFeature, (prev) => ({
                                            ...prev,
                                            stage:
                                                activeFeature === "brow"
                                                    ? prev.baseUrl
                                                        ? "compare"
                                                        : "capture"
                                                    : prev.baseUrl
                                                      ? "compare"
                                                      : "guide",
                                        }))
                                    }
                                    variant="default"
                                    size="sm"
                                >
                                    {activeFeature === "brow"
                                        ? activeGuidedConfig && guidedSessions.brow.baseUrl
                                            ? "比較に戻る"
                                            : "撮影に戻る"
                                        : activeGuidedConfig &&
                                            ((activeFeature === "eye" && guidedSessions.eye.baseUrl) ||
                                                (activeFeature === "face" && guidedSessions.face.baseUrl))
                                          ? "比較に戻る"
                                          : "ガイドへ戻る"}
                                </GlassButton>
                            ) : (
                                <GlassBadge variant="default">平均画像を参照中</GlassBadge>
                            )}
                        </div>
                    </div>

                    {saving && <div className="mb-4 text-xs font-semibold text-violet-600">保存中…</div>}

                    {/* AI 自動判定セクション */}
                    {(defaultImage || avatarImage) && (
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <GlassButton
                                onClick={() => void autoClassifyAndSaveAll()}
                                variant="gradient"
                                size="sm"
                                loading={aiClassifying}
                                disabled={aiClassifying || saving}
                            >
                                AIで全パーツ一括判定
                            </GlassButton>
                            {aiClassification && (
                                <GlassBadge variant="info">
                                    AI判定済み: {aiClassification.faceShape.primary} / {aiClassification.eyeShape.primary} / {aiClassification.browShape.primary}
                                </GlassBadge>
                            )}
                        </div>
                    )}

                    {/* AI 提案バッジ（個別フィーチャー） */}
                    {aiClassification && isGuidedFeature(activeFeature) && (
                        <div className="mb-3 rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-2 text-sm text-cyan-800">
                            AI提案: <span className="font-bold">
                                {activeFeature === "eye" && aiClassification.eyeShape.primary}
                                {activeFeature === "face" && aiClassification.faceShape.primary}
                                {activeFeature === "brow" && aiClassification.browShape.primary}
                            </span>
                            {" "}(信頼度: {(
                                (activeFeature === "eye" ? aiClassification.eyeShape.confidence :
                                 activeFeature === "face" ? aiClassification.faceShape.confidence :
                                 aiClassification.browShape.confidence) * 100
                            ).toFixed(0)}%)
                            {activeFeature === "eye" && aiClassification.eyeShape.runner_up && (
                                <span className="ml-2 text-xs text-cyan-600">次点: {aiClassification.eyeShape.runner_up}</span>
                            )}
                            {activeFeature === "face" && aiClassification.faceShape.runner_up && (
                                <span className="ml-2 text-xs text-cyan-600">次点: {aiClassification.faceShape.runner_up}</span>
                            )}
                            {activeFeature === "brow" && aiClassification.browShape.runner_up && (
                                <span className="ml-2 text-xs text-cyan-600">次点: {aiClassification.browShape.runner_up}</span>
                            )}
                        </div>
                    )}

                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`${activeFeature}-${isGuidedFeature(activeFeature) ? guidedSessions[activeFeature].stage : "impression"}`}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -12 }}
                            transition={{ duration: 0.22 }}
                        >
                            {renderFeatureContent()}
                        </motion.div>
                    </AnimatePresence>
                </GlassCard>
        </section>
    );
}
