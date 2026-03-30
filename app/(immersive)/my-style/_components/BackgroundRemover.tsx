"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GlassCard,
    GlassButton,
    GlassBadge,
    GlassModal,
    FadeInView,
} from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";
import {
    removeBackground,
    applyCleanBackground,
    cropToSubject,
    eraseRegion,
    type RemovalResult,
} from "../_lib/backgroundRemoval";

/* ── Types ── */

type BgOption = "transparent" | "white" | "gray";

interface BackgroundRemoverProps {
    /** The image file to process */
    imageFile?: File;
    /** If provided instead of imageFile, use this data URL directly */
    imageUrl?: string;
    /** Called when user confirms the processed image */
    onApply: (processedDataUrl: string) => void;
    /** Called when user skips background removal */
    onSkip: () => void;
    /** Called when user cancels entirely */
    onCancel?: () => void;
}

/* ── Constants ── */

const BG_OPTIONS: { value: BgOption; label: string; color: string }[] = [
    { value: "white", label: "白背景", color: "#ffffff" },
    { value: "transparent", label: "透明背景", color: "transparent" },
    { value: "gray", label: "グレー背景", color: "#e5e7eb" },
];

/* ── Main Component ── */

export default function BackgroundRemover({
    imageFile,
    imageUrl: externalImageUrl,
    onApply,
    onSkip,
    onCancel,
}: BackgroundRemoverProps) {
    /* ── State ── */
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [originalUrl, setOriginalUrl] = useState<string | null>(null);
    const [processedUrl, setProcessedUrl] = useState<string | null>(null);
    const [confidence, setConfidence] = useState(0);
    const [selectedBg, setSelectedBg] = useState<BgOption>("white");
    const [autoCrop, setAutoCrop] = useState(true);
    const [showComparison, setShowComparison] = useState(false);
    const [comparePosition, setComparePosition] = useState(50);
    const [eraserMode, setEraserMode] = useState(false);
    const [eraserSize, setEraserSize] = useState(20);
    const [error, setError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDrawingRef = useRef(false);

    /* ── Load original image ── */
    useEffect(() => {
        if (externalImageUrl) {
            setOriginalUrl(externalImageUrl);
        } else if (imageFile) {
            const reader = new FileReader();
            reader.onload = () => setOriginalUrl(reader.result as string);
            reader.readAsDataURL(imageFile);
        }
    }, [imageFile, externalImageUrl]);

    /* ── Process image ── */
    const processImage = useCallback(async () => {
        if (!imageFile && !originalUrl) return;

        setProcessing(true);
        setProgress(10);
        setError(null);

        try {
            let result: RemovalResult;

            // Determine background color
            const bgColorMap: Record<BgOption, string | undefined> = {
                white: "#ffffff",
                gray: "#e5e7eb",
                transparent: undefined,
            };
            const bgColor = bgColorMap[selectedBg];

            setProgress(30);

            if (imageFile) {
                result = await removeBackground(imageFile, {
                    tolerance: 50,
                    bgColor,
                });
            } else if (originalUrl) {
                // Reconstruct a File from data URL for the removeBackground API
                const resp = await fetch(originalUrl);
                const blob = await resp.blob();
                const file = new File([blob], "image.png", {
                    type: blob.type,
                });
                result = await removeBackground(file, {
                    tolerance: 50,
                    bgColor,
                });
            } else {
                throw new Error("No image provided");
            }

            setProgress(70);

            let finalUrl = result.processedUrl;

            // Auto crop if enabled
            if (autoCrop) {
                finalUrl = await cropToSubject(finalUrl, 0.08);
            }

            setProgress(100);
            setProcessedUrl(finalUrl);
            setOriginalUrl(result.originalUrl);
            setConfidence(result.confidence);
        } catch (err) {
            console.error("Background removal failed:", err);
            setError("背景除去に失敗しました。別の画像をお試しください。");
        } finally {
            setProcessing(false);
        }
    }, [imageFile, originalUrl, selectedBg, autoCrop]);

    /* ── Auto-process on mount ── */
    useEffect(() => {
        if ((imageFile || originalUrl) && !processedUrl && !processing) {
            processImage();
        }
        // Only run once when image is available
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [imageFile, originalUrl]);

    /* ── Re-process when options change ── */
    const handleReprocess = useCallback(() => {
        setProcessedUrl(null);
        processImage();
    }, [processImage]);

    /* ── Eraser drawing ── */
    const handleEraserStart = useCallback(
        (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
            if (!eraserMode || !processedUrl) return;
            isDrawingRef.current = true;
        },
        [eraserMode, processedUrl]
    );

    const handleEraserMove = useCallback(
        async (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
            if (!isDrawingRef.current || !eraserMode || !processedUrl) return;

            const canvas = canvasRef.current;
            if (!canvas) return;

            const rect = canvas.getBoundingClientRect();
            let clientX: number;
            let clientY: number;

            if ("touches" in e) {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            // Scale coordinates to actual canvas size
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (clientX - rect.left) * scaleX;
            const y = (clientY - rect.top) * scaleY;

            const bgColorMap: Record<BgOption, string | undefined> = {
                white: "#ffffff",
                gray: "#e5e7eb",
                transparent: undefined,
            };

            const newUrl = await eraseRegion(
                processedUrl,
                x,
                y,
                eraserSize * scaleX,
                bgColorMap[selectedBg]
            );
            setProcessedUrl(newUrl);
        },
        [eraserMode, processedUrl, eraserSize, selectedBg]
    );

    const handleEraserEnd = useCallback(() => {
        isDrawingRef.current = false;
    }, []);

    /* ── Comparison slider ── */
    const handleCompareMove = useCallback(
        (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
            if (!showComparison) return;
            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
            let clientX: number;
            if ("touches" in e) {
                clientX = e.touches[0].clientX;
            } else {
                clientX = e.clientX;
            }
            const pct = Math.max(
                0,
                Math.min(100, ((clientX - rect.left) / rect.width) * 100)
            );
            setComparePosition(pct);
        },
        [showComparison]
    );

    /* ── Render eraser canvas ── */
    useEffect(() => {
        if (!eraserMode || !processedUrl || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;

            // Checkerboard for transparent bg
            if (selectedBg === "transparent") {
                const size = 10;
                for (let y = 0; y < img.height; y += size) {
                    for (let x = 0; x < img.width; x += size) {
                        ctx.fillStyle =
                            (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0
                                ? "#ffffff"
                                : "#e5e7eb";
                        ctx.fillRect(x, y, size, size);
                    }
                }
            }

            ctx.drawImage(img, 0, 0);
        };
        img.src = processedUrl;
    }, [eraserMode, processedUrl, selectedBg]);

    /* ── Determine displayed image ── */
    const displayUrl = processedUrl ?? originalUrl;

    return (
        <div className="space-y-4">
            <FadeInView>
                <GlassCard padding="md">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-base font-bold text-slate-900">
                            背景処理
                        </h3>
                        {confidence > 0 && (
                            <GlassBadge
                                variant={
                                    confidence >= 0.7 ? "success" : confidence >= 0.5 ? "warning" : "danger"
                                }
                                size="sm"
                            >
                                精度: {Math.round(confidence * 100)}%
                            </GlassBadge>
                        )}
                    </div>

                    {/* ── Image Preview ── */}
                    <div
                        ref={containerRef}
                        className="relative w-full aspect-[4/5] rounded-2xl overflow-hidden bg-slate-100 mb-4"
                    >
                        {/* Processing overlay */}
                        <AnimatePresence>
                            {processing && (
                                <motion.div
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm"
                                >
                                    <motion.div
                                        className="w-16 h-16 rounded-full border-4 border-violet-200 border-t-violet-600"
                                        animate={{ rotate: 360 }}
                                        transition={{
                                            duration: 1,
                                            repeat: Infinity,
                                            ease: "linear",
                                        }}
                                    />
                                    <p className="mt-4 text-sm font-medium text-slate-600">
                                        背景を処理中...
                                    </p>
                                    <div className="mt-2 w-40 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                                        <motion.div
                                            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500"
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 0.3 }}
                                        />
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        {/* Error state */}
                        {error && (
                            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white/90">
                                <p className="text-3xl mb-2">⚠</p>
                                <p className="text-sm text-red-600 text-center px-4">
                                    {error}
                                </p>
                                <GlassButton
                                    variant="secondary"
                                    size="sm"
                                    onClick={handleReprocess}
                                    className="mt-3"
                                >
                                    再試行
                                </GlassButton>
                            </div>
                        )}

                        {/* Comparison mode */}
                        {showComparison && originalUrl && processedUrl ? (
                            <div
                                className="relative w-full h-full cursor-ew-resize"
                                onMouseMove={handleCompareMove}
                                onTouchMove={handleCompareMove}
                            >
                                {/* Processed (full) */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={processedUrl}
                                    alt="処理後"
                                    className="absolute inset-0 w-full h-full object-contain"
                                    style={{
                                        backgroundColor:
                                            selectedBg === "transparent"
                                                ? undefined
                                                : selectedBg === "white"
                                                  ? "#ffffff"
                                                  : "#e5e7eb",
                                    }}
                                />

                                {/* Original (clipped) */}
                                <div
                                    className="absolute inset-0 overflow-hidden"
                                    style={{
                                        clipPath: `inset(0 ${100 - comparePosition}% 0 0)`,
                                    }}
                                >
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={originalUrl}
                                        alt="元画像"
                                        className="w-full h-full object-contain"
                                    />
                                </div>

                                {/* Slider line */}
                                <div
                                    className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-10"
                                    style={{ left: `${comparePosition}%` }}
                                >
                                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
                                        <svg
                                            width="16"
                                            height="16"
                                            viewBox="0 0 16 16"
                                            fill="none"
                                        >
                                            <path
                                                d="M5 3L2 8L5 13"
                                                stroke="#64748b"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                            <path
                                                d="M11 3L14 8L11 13"
                                                stroke="#64748b"
                                                strokeWidth="2"
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                            />
                                        </svg>
                                    </div>
                                </div>

                                {/* Labels */}
                                <div className="absolute top-3 left-3 z-10">
                                    <GlassBadge size="sm">元画像</GlassBadge>
                                </div>
                                <div className="absolute top-3 right-3 z-10">
                                    <GlassBadge variant="success" size="sm">
                                        処理後
                                    </GlassBadge>
                                </div>
                            </div>
                        ) : eraserMode && processedUrl ? (
                            /* Eraser canvas mode */
                            <canvas
                                ref={canvasRef}
                                className="w-full h-full object-contain cursor-crosshair"
                                onMouseDown={handleEraserStart}
                                onMouseMove={handleEraserMove}
                                onMouseUp={handleEraserEnd}
                                onMouseLeave={handleEraserEnd}
                                onTouchStart={handleEraserStart}
                                onTouchMove={handleEraserMove}
                                onTouchEnd={handleEraserEnd}
                            />
                        ) : displayUrl ? (
                            /* Normal preview */
                            <div
                                className="w-full h-full flex items-center justify-center"
                                style={{
                                    backgroundColor:
                                        processedUrl && selectedBg === "gray"
                                            ? "#e5e7eb"
                                            : processedUrl && selectedBg === "white"
                                              ? "#ffffff"
                                              : processedUrl && selectedBg === "transparent"
                                                ? undefined
                                                : undefined,
                                    backgroundImage:
                                        processedUrl && selectedBg === "transparent"
                                            ? "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 16px 16px"
                                            : undefined,
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={displayUrl}
                                    alt="プレビュー"
                                    className="max-w-full max-h-full object-contain"
                                />
                            </div>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <p className="text-sm text-slate-400">
                                    画像を読み込み中...
                                </p>
                            </div>
                        )}
                    </div>

                    {/* ── Background Options ── */}
                    <div className="mb-4">
                        <p className="text-[12px] font-medium text-slate-600 mb-2">
                            背景色
                        </p>
                        <div className="flex gap-2">
                            {BG_OPTIONS.map((opt) => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => setSelectedBg(opt.value)}
                                    className={cn(
                                        "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition",
                                        selectedBg === opt.value
                                            ? "border-violet-400 bg-violet-50 text-violet-700"
                                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                    )}
                                >
                                    <span
                                        className={cn(
                                            "w-4 h-4 rounded-full border",
                                            opt.value === "transparent"
                                                ? "border-slate-300"
                                                : "border-slate-200"
                                        )}
                                        style={{
                                            backgroundColor:
                                                opt.value === "transparent"
                                                    ? undefined
                                                    : opt.color,
                                            backgroundImage:
                                                opt.value === "transparent"
                                                    ? "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 6px 6px"
                                                    : undefined,
                                        }}
                                    />
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* ── Options Row ── */}
                    <div className="flex flex-wrap items-center gap-3 mb-4">
                        {/* Auto crop toggle */}
                        <label className="flex items-center gap-2 text-[12px] font-medium text-slate-600 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={autoCrop}
                                onChange={(e) => setAutoCrop(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
                            />
                            自動クロップ
                        </label>

                        {/* Eraser toggle */}
                        {processedUrl && (
                            <button
                                type="button"
                                onClick={() => setEraserMode(!eraserMode)}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition",
                                    eraserMode
                                        ? "border-violet-400 bg-violet-50 text-violet-700"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                )}
                            >
                                <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <path d="M7 21h10" />
                                    <path d="M5.5 11.5L17 3l3.5 3.5L9 18H5.5v-6.5z" />
                                </svg>
                                消しゴム
                            </button>
                        )}

                        {/* Eraser size */}
                        {eraserMode && (
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-500">
                                    サイズ
                                </span>
                                <input
                                    type="range"
                                    min={5}
                                    max={50}
                                    value={eraserSize}
                                    onChange={(e) =>
                                        setEraserSize(parseInt(e.target.value, 10))
                                    }
                                    className="w-20 accent-violet-600"
                                />
                                <span className="text-[11px] text-slate-500 w-6 text-right">
                                    {eraserSize}
                                </span>
                            </div>
                        )}

                        {/* Comparison toggle */}
                        {processedUrl && originalUrl && (
                            <button
                                type="button"
                                onClick={() => {
                                    setShowComparison(!showComparison);
                                    setEraserMode(false);
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition",
                                    showComparison
                                        ? "border-violet-400 bg-violet-50 text-violet-700"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                )}
                            >
                                比較
                            </button>
                        )}
                    </div>

                    {/* ── Reprocess Button ── */}
                    {processedUrl && (
                        <div className="mb-4">
                            <button
                                type="button"
                                onClick={handleReprocess}
                                className="text-[12px] text-violet-600 font-medium hover:underline"
                            >
                                設定を変更して再処理
                            </button>
                        </div>
                    )}

                    {/* ── Action Buttons ── */}
                    <div className="flex gap-2">
                        <GlassButton
                            variant="primary"
                            size="sm"
                            disabled={!processedUrl || processing}
                            onClick={() => processedUrl && onApply(processedUrl)}
                            className="flex-1"
                        >
                            適用
                        </GlassButton>
                        <GlassButton
                            variant="secondary"
                            size="sm"
                            disabled={!processedUrl || processing}
                            onClick={() => {
                                setProcessedUrl(null);
                                setEraserMode(false);
                                setShowComparison(false);
                            }}
                            className="flex-1"
                        >
                            元に戻す
                        </GlassButton>
                        <GlassButton
                            variant="ghost"
                            size="sm"
                            onClick={onSkip}
                            className="flex-1"
                        >
                            スキップ
                        </GlassButton>
                    </div>

                    {onCancel && (
                        <div className="mt-2 text-center">
                            <button
                                type="button"
                                onClick={onCancel}
                                className="text-[12px] text-slate-400 hover:text-slate-600 transition"
                            >
                                キャンセル
                            </button>
                        </div>
                    )}
                </GlassCard>
            </FadeInView>
        </div>
    );
}
