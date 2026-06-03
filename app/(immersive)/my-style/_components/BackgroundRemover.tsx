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
import { applyCleanBackground, cropToSubject } from "../_lib/backgroundRemoval";
import { interpolateStrokePoints } from "../_lib/brushStroke";
import { processImageCutout, resolveApplyDraft, type CutoutDraft } from "../_lib/cutoutBrowser";
import type { CutoutStatus } from "../_lib/backgroundRemovalV1";
// M3: 控えめ post-process（初期 auto cutout のみ適用）
import { applyCutoutPostProcess } from "../_lib/cutoutPostProcess";

/* ── Types ── */

type BgOption = "transparent" | "white" | "gray";

interface BackgroundRemoverProps {
    /** The image file to process */
    imageFile?: File;
    /** If provided instead of imageFile, use this data URL directly */
    imageUrl?: string;
    /** Called when user confirms — cutout draft（dataUrl/status/method/confidence）を返す */
    onApply: (draft: CutoutDraft) => void;
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
    // M4: 2-state 分離。
    //   editableUrl = post-process 後 / crop 前の uncropped 作業用（比較・消しゴム・復活ブラシ・stroke commit）。
    //   processedUrl = autoCrop 適用後の最終プレビュー / 保存候補。
    //   editableUrl + autoCrop の変化を監視して useEffect で processedUrl を同期する。
    const [editableUrl, setEditableUrl] = useState<string | null>(null);
    const [processedUrl, setProcessedUrl] = useState<string | null>(null);
    const [confidence, setConfidence] = useState(0);
    const [v1Status, setV1Status] = useState<CutoutStatus>("skipped"); // V1 初期処理の判定
    const [edited, setEdited] = useState(false); // 消しゴム等で手動編集したか
    const [selectedBg, setSelectedBg] = useState<BgOption>("white");
    const [autoCrop, setAutoCrop] = useState(true);
    const [showComparison, setShowComparison] = useState(false);
    const [comparePosition, setComparePosition] = useState(50);
    const [eraserMode, setEraserMode] = useState(false);
    const [eraserSize, setEraserSize] = useState(20);
    // M3-2: 復活ブラシ（消えすぎた服を、 元画像から戻す）。 消しゴムと排他。
    const [restoreMode, setRestoreMode] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const isDrawingRef = useRef(false);
    const prevPointRef = useRef<{ x: number; y: number } | null>(null); // C1L-4c-a: 直前の塗り点（線分補間用）
    // M3-2: 復活ブラシの drawImage source。 originalUrl を decode して保持（imageUrl は絶対に触らない）。
    const originalImgRef = useRef<HTMLImageElement | null>(null);

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

    /* ── Process image (C1L-4c-b1: V1 cutout 経路。 出力は透過 PNG) ── */
    const processImage = useCallback(async () => {
        const input: Blob | string | undefined = imageFile ?? externalImageUrl ?? originalUrl ?? undefined;
        if (!input) return;

        setProcessing(true);
        setProgress(30);
        setError(null);

        try {
            const result = await processImageCutout(input, { maxDimension: 768 });
            setProgress(70);
            setV1Status(result.status);
            setConfidence(result.confidence);
            setEdited(false);

            if (result.dataUrl && (result.status === "success" || result.status === "needs_review")) {
                let finalUrl = result.dataUrl;
                // M3-2: 控えめ post-process（defaults: closing 1 iter のみ・服 alpha 不変保証）。
                //   手動編集後の再適用なし（処理は processImage 内のみ。 stroke commit は別 path）。
                try {
                    finalUrl = await applyCutoutPostProcess(finalUrl);
                } catch {
                    /* keep finalUrl */
                }
                // M4: post-process 後（crop 前）の uncropped を editableUrl に保存。
                //   processedUrl は editableUrl/autoCrop の useEffect で同期される。
                setEditableUrl(finalUrl);
            } else {
                // failed / skipped → 自動 cutout なし。 原画表示（displayUrl が originalUrl にフォールバック）。
                setEditableUrl(null);
            }
            setProgress(100);
        } catch (err) {
            console.error("Background cutout failed:", err);
            setV1Status("failed");
            setError("背景除去に失敗しました。スキップして登録を続けられます。");
        } finally {
            setProcessing(false);
        }
    }, [imageFile, externalImageUrl, originalUrl]);

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
        setEditableUrl(null);
        setProcessedUrl(null);
        processImage();
    }, [processImage]);

    /* ── M4: editableUrl + autoCrop → processedUrl 同期（race-safe） ──
     *   editableUrl は uncropped 作業用、 processedUrl は cropped 最終プレビュー / 保存候補。
     *   editableUrl が null なら processedUrl も null。 autoCrop OFF なら editableUrl をそのまま反映。 */
    useEffect(() => {
        if (!editableUrl) {
            setProcessedUrl(null);
            return;
        }
        if (!autoCrop) {
            setProcessedUrl(editableUrl);
            return;
        }
        let alive = true;
        (async () => {
            try {
                const cropped = await cropToSubject(editableUrl, 0.08);
                if (alive) setProcessedUrl(cropped);
            } catch {
                if (alive) setProcessedUrl(editableUrl);
            }
        })();
        return () => { alive = false; };
    }, [editableUrl, autoCrop]);

    /* ── Eraser drawing (pointer-based, interpolated, canvas-direct) ── */
    // 1 ダブ分を canvas に直接消す（transparent=destination-out / 単色=その色で塗り）。
    const eraseDab = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
        // cutout の正本は透過 PNG なので、 消去は常に透過化（destination-out）。 背景色はプレビュー表示のみ。
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }, []);

    /* ── M3-2: 復活ブラシ。 元画像から透明部分のみ補充する（destination-over + clip）。 ── */
    // 既存の不透明前景は保持され、 円形クリップ領域内の透明画素のみ original が現れる（MDN 仕様確認済）。
    const restoreDab = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
        const originalImg = originalImgRef.current;
        if (!originalImg) return; // 元画像未 ready なら何もしない（fail-safe）
        const canvas = ctx.canvas;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.clip();
        ctx.globalCompositeOperation = "destination-over";
        ctx.drawImage(originalImg, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }, []);

    /** restoreMode が ON なら復活、 そうでなければ消しゴム（既定）。 排他は state 側で保証。 */
    const brushDab = useCallback((ctx: CanvasRenderingContext2D, x: number, y: number, radius: number) => {
        if (restoreMode) restoreDab(ctx, x, y, radius);
        else eraseDab(ctx, x, y, radius);
    }, [restoreMode, restoreDab, eraseDab]);

    // M3-2: originalUrl を Image() に decode して ref 保持（復活ブラシ source）。 imageUrl/originalUrl は読むだけ。
    useEffect(() => {
        if (!originalUrl) {
            originalImgRef.current = null;
            return;
        }
        const img = new Image();
        let alive = true;
        img.onload = () => { if (alive) originalImgRef.current = img; };
        img.onerror = () => { if (alive) originalImgRef.current = null; };
        img.src = originalUrl;
        return () => { alive = false; };
    }, [originalUrl]);

    // pointer の clientXY → canvas 座標 + ブラシ半径（canvas スケール）。
    const canvasPointFromEvent = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
            const canvas = canvasRef.current!;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * scaleX,
                y: (e.clientY - rect.top) * scaleY,
                radius: eraserSize * scaleX,
            };
        },
        [eraserSize]
    );

    const handleEraserPointerDown = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
            // M3-2: 消しゴム / 復活 どちらかが ON のときに反応（排他は state 側）
            if (!(eraserMode || restoreMode) || !processedUrl) return;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx) return;
            try {
                canvas.setPointerCapture(e.pointerId);
            } catch {
                /* noop */
            }
            isDrawingRef.current = true;
            const { x, y, radius } = canvasPointFromEvent(e);
            brushDab(ctx, x, y, radius);
            prevPointRef.current = { x, y };
        },
        [eraserMode, restoreMode, processedUrl, canvasPointFromEvent, brushDab]
    );

    const handleEraserPointerMove = useCallback(
        (e: React.PointerEvent<HTMLCanvasElement>) => {
            if (!isDrawingRef.current || !(eraserMode || restoreMode)) return;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (!canvas || !ctx) return;
            const { x, y, radius } = canvasPointFromEvent(e);
            const from = prevPointRef.current ?? { x, y };
            // 前回点 → 今回点を線分補間して連続的に処理（点々防止）。
            for (const p of interpolateStrokePoints(from, { x, y }, radius)) {
                brushDab(ctx, p.x, p.y, radius);
            }
            prevPointRef.current = { x, y };
        },
        [eraserMode, restoreMode, canvasPointFromEvent, brushDab]
    );

    // ストローク確定時に 1 回だけ dataURL へコミット（per-point の重い往復を避ける）。
    const handleEraserPointerEnd = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (canvas?.hasPointerCapture?.(e.pointerId)) {
            try {
                canvas.releasePointerCapture(e.pointerId);
            } catch {
                /* noop */
            }
        }
        if (!isDrawingRef.current) return;
        isDrawingRef.current = false;
        prevPointRef.current = null;
        setEdited(true); // 一度でも消したら manual 扱い
        if (!canvas) return;
        try {
            // M4: stroke commit は editableUrl（uncropped）を更新。
            //   processedUrl は editableUrl/autoCrop の useEffect で自動同期される（manual 編集後に post-process は再適用しない）。
            setEditableUrl(canvas.toDataURL("image/png"));
        } catch {
            /* keep canvas */
        }
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

    /* ── Render brush canvas (eraser / restore 共通) — M4: editableUrl=uncropped で描画 ── */
    useEffect(() => {
        if (!(eraserMode || restoreMode) || !editableUrl || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            // 画像のみ描画（transparent の市松模様は canvas 要素の CSS 背景で表示）。
            // destination-out 消去で市松まで消えないよう、 canvas には画像だけ載せる。
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0);
        };
        img.src = editableUrl;
    }, [eraserMode, restoreMode, editableUrl, selectedBg]);

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

                        {/* Comparison mode（M4: editableUrl=uncropped と originalUrl で同座標系比較） */}
                        {showComparison && originalUrl && editableUrl ? (
                            <div
                                className="relative w-full h-full cursor-ew-resize"
                                onMouseMove={handleCompareMove}
                                onTouchMove={handleCompareMove}
                            >
                                {/* Processed (full) — editableUrl: uncropped 同サイズ */}
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={editableUrl}
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
                        ) : (eraserMode || restoreMode) && editableUrl ? (
                            /* Brush canvas mode（eraser / restore 共通・M4: editableUrl=uncropped 基準） */
                            <canvas
                                ref={canvasRef}
                                className="w-full h-full object-contain cursor-crosshair"
                                style={{
                                    touchAction: "none",
                                    backgroundImage:
                                        selectedBg === "transparent"
                                            ? "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 16px 16px"
                                            : undefined,
                                }}
                                onPointerDown={handleEraserPointerDown}
                                onPointerMove={handleEraserPointerMove}
                                onPointerUp={handleEraserPointerEnd}
                                onPointerCancel={handleEraserPointerEnd}
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

                        {/* Eraser toggle（消しゴム） */}
                        {processedUrl && (
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !eraserMode;
                                    setEraserMode(next);
                                    if (next) setRestoreMode(false); // 排他
                                }}
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

                        {/* M3-2: Restore toggle（復活）— 消えすぎた服を元画像から戻す。 消しゴムと排他。 */}
                        {processedUrl && originalUrl && (
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !restoreMode;
                                    setRestoreMode(next);
                                    if (next) setEraserMode(false); // 排他
                                }}
                                className={cn(
                                    "flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[12px] font-medium transition",
                                    restoreMode
                                        ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                                )}
                                title="消えすぎた服の部分をなぞって戻す"
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
                                    <path d="M3 12a9 9 0 1 0 3-6.7" />
                                    <path d="M3 3v6h6" />
                                </svg>
                                復活
                            </button>
                        )}

                        {/* Brush size（消しゴム / 復活 共通） */}
                        {(eraserMode || restoreMode) && (
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
                                    setRestoreMode(false);
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
                            disabled={!editableUrl || processing}
                            onClick={async () => {
                                // M4: 適用は editableUrl(uncropped) を基準にし、 autoCrop ON なら保存直前に crop を当てる。
                                //   race（useEffect の crop 同期中）を回避し、 必ず最新の編集内容が反映される。
                                if (!editableUrl) return;
                                let finalUrl = editableUrl;
                                if (autoCrop) {
                                    try {
                                        finalUrl = await cropToSubject(editableUrl, 0.08);
                                    } catch {
                                        /* fallback to uncropped */
                                    }
                                }
                                onApply(
                                    resolveApplyDraft({
                                        edited,
                                        v1Status,
                                        currentDataUrl: finalUrl,
                                        confidence,
                                    }),
                                );
                            }}
                            className="flex-1"
                        >
                            適用
                        </GlassButton>
                        <GlassButton
                            variant="secondary"
                            size="sm"
                            disabled={!processedUrl || processing}
                            onClick={() => {
                                setEraserMode(false);
                                setRestoreMode(false);
                                setShowComparison(false);
                                setEdited(false);
                                handleReprocess(); // V1 を再実行して初期状態へ
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
