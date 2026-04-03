"use client";

import React, { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
    GlassCard,
    GlassButton,
} from "@/components/ui/glassmorphism-design";
import type { WardrobeItem } from "../_lib/types";
import type { SavedState } from "../_lib/types";
import { createDemoState } from "../_lib/demoData";
import { resizeImage, uid, CATEGORIES, COLOR_OPTIONS } from "../_lib/constants";
import { classifyItemFromImage, type ClassificationResult } from "../_lib/inferItemHints";

/* ── Types ── */

type Step = "capture" | "processing" | "confirm" | "done";

interface PhotoOnboardingProps {
    onSave: (item: WardrobeItem) => void;
    onLoadDemo: (demoState: Partial<SavedState>) => void;
    onDismiss: () => void;
}

/* ── Analytics helper (fire-and-forget) ── */

function trackEvent(event: string, metadata?: Record<string, unknown>) {
    try {
        const payload = JSON.stringify({
            event,
            feature: "my-style",
            metadata: { ...metadata, ts: Date.now() },
        });
        if (typeof navigator !== "undefined" && navigator.sendBeacon) {
            navigator.sendBeacon("/api/stargazer/analytics", payload);
        }
    } catch { /* ignore */ }
}

/* ── Component ── */

export default function PhotoOnboarding({
    onSave,
    onLoadDemo,
    onDismiss,
}: PhotoOnboardingProps) {
    const [step, setStep] = useState<Step>("capture");
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [classification, setClassification] = useState<ClassificationResult | null>(null);
    const [editCategory, setEditCategory] = useState<WardrobeItem["category"] | null>(null);
    const [editColor, setEditColor] = useState<string | null>(null);
    const [editName, setEditName] = useState("");
    const [showColorGrid, setShowColorGrid] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [savedCount, setSavedCount] = useState(0);
    const [processingStart, setProcessingStart] = useState(0);

    const cameraRef = useRef<HTMLInputElement>(null);
    const galleryRef = useRef<HTMLInputElement>(null);

    /* ── Photo capture ── */

    const handleFile = useCallback(async (file: File) => {
        if (!file.type.startsWith("image/")) return;
        setError(null);
        setStep("processing");
        const t0 = Date.now();
        setProcessingStart(t0);
        trackEvent("mystyle_onboarding_start");

        try {
            const base64 = await resizeImage(file, 640, 960);
            setImageUrl(base64);

            const result = await classifyItemFromImage(base64);
            setClassification(result);
            setEditCategory(result.category);
            setEditColor(result.color);
            setEditName(result.suggestedName);
            setStep("confirm");
            const durationMs = Date.now() - t0;
            console.log(`[PhotoOnboarding] classify duration: ${durationMs}ms`);
            trackEvent("mystyle_onboarding_photo_taken", {
                category: result.category,
                confidence: result.confidence,
                duration_ms: durationMs,
            });
        } catch (err) {
            const isTimeout = err instanceof Error && err.message.includes("timeout");
            setError(isTimeout
                ? "画像の読み込みに時間がかかりすぎました。別の写真を試してください。"
                : "画像の処理に失敗しました。もう一度お試しください。");
            setStep("capture");
            trackEvent("mystyle_failure", { phase: "classify", reason: isTimeout ? "timeout" : "error" });
        }
    }, []);

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
        },
        [handleFile],
    );

    /* ── Save item ── */

    const handleSave = useCallback(() => {
        if (!imageUrl || !editCategory || !editColor) return;

        const colorOpt = COLOR_OPTIONS.find((c) => c.value === editColor);
        const catOpt = CATEGORIES.find((c) => c.value === editCategory);
        const wasChanged = classification
            ? editCategory !== classification.category || editColor !== classification.color
            : false;

        const item: WardrobeItem = {
            id: uid(),
            name: editName || `${colorOpt?.label ?? ""}${catOpt?.label ?? "アイテム"}`,
            category: editCategory,
            color: editColor,
            colorName: colorOpt?.label,
            colorHex: colorOpt?.hex,
            imageUrl,
            season: "all",
            formality: "casual",
            addedAt: new Date().toISOString(),
        };

        onSave(item);
        const newCount = savedCount + 1;
        setSavedCount(newCount);
        setStep("done");

        trackEvent("mystyle_onboarding_item_confirmed", {
            category: editCategory,
            color: editColor,
            corrected: wasChanged,
            item_number: newCount,
        });
        if (wasChanged) {
            trackEvent("mystyle_photo_ai_correction", {
                from_category: classification?.category,
                to_category: editCategory,
                from_color: classification?.color,
                to_color: editColor,
            });
        }
    }, [imageUrl, editCategory, editColor, editName, classification, savedCount, onSave]);

    /* ── Reset for another photo ── */

    const handleAddAnother = useCallback(() => {
        setImageUrl(null);
        setClassification(null);
        setEditCategory(null);
        setEditColor(null);
        setEditName("");
        setShowColorGrid(false);
        setError(null);
        setStep("capture");
    }, []);

    /* ── Retake ── */

    const handleRetake = useCallback(() => {
        handleAddAnother();
        trackEvent("mystyle_onboarding_start");
    }, [handleAddAnother]);

    /* ── Demo ── */

    const handleLoadDemo = useCallback(() => {
        trackEvent("mystyle_onboarding_complete", { method: "demo" });
        onLoadDemo(createDemoState());
    }, [onLoadDemo]);

    /* ── Finish ── */

    const handleFinish = useCallback(() => {
        trackEvent("mystyle_onboarding_complete", { total_items: savedCount });
        onDismiss();
    }, [savedCount, onDismiss]);

    return (
        <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 backdrop-blur-sm">
            <div className="relative w-full max-w-lg mx-auto px-4 py-8">
                {/* Skip */}
                <div className="relative z-10 flex justify-end mb-2">
                    <button
                        onClick={onDismiss}
                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors px-2 py-1"
                    >
                        スキップ
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {/* ── Step: Capture ── */}
                    {step === "capture" && (
                        <motion.div
                            key="capture"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="relative z-10"
                        >
                            <div className="text-center mb-6">
                                <h1 className="text-2xl font-bold text-slate-900">
                                    {savedCount === 0
                                        ? "服を撮って始めよう"
                                        : `${savedCount}着登録済み！次の1着は？`}
                                </h1>
                                <p className="mt-2 text-sm text-slate-500">
                                    1着ずつ撮影するだけ。AIが自動で分類します
                                </p>
                            </div>

                            {/* Camera area */}
                            <GlassCard variant="elevated" padding="lg" hoverEffect={false}>
                                <div className="flex flex-col items-center gap-4">
                                    <div className="w-32 h-32 rounded-2xl bg-gradient-to-br from-violet-100 to-pink-100 flex items-center justify-center">
                                        <span className="text-5xl">📷</span>
                                    </div>

                                    <div className="flex flex-col gap-2 w-full">
                                        <GlassButton
                                            variant="gradient"
                                            size="lg"
                                            fullWidth
                                            onClick={() => cameraRef.current?.click()}
                                        >
                                            カメラで撮影
                                        </GlassButton>

                                        <GlassButton
                                            variant="secondary"
                                            size="lg"
                                            fullWidth
                                            onClick={() => galleryRef.current?.click()}
                                        >
                                            写真を選ぶ
                                        </GlassButton>
                                    </div>

                                    {/* Hidden file inputs */}
                                    <input
                                        ref={cameraRef}
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleInputChange}
                                        className="hidden"
                                    />
                                    <input
                                        ref={galleryRef}
                                        type="file"
                                        accept="image/*"
                                        onChange={handleInputChange}
                                        className="hidden"
                                    />
                                </div>

                                {error && (
                                    <p className="mt-3 text-center text-xs text-red-500">{error}</p>
                                )}
                            </GlassCard>

                            {/* Demo option */}
                            {savedCount === 0 && (
                                <div className="mt-4 text-center">
                                    <button
                                        onClick={handleLoadDemo}
                                        className="text-sm text-slate-400 hover:text-slate-600 underline transition-colors"
                                    >
                                        デモデータで体験する
                                    </button>
                                </div>
                            )}

                            {/* Finish if already added some */}
                            {savedCount > 0 && (
                                <div className="mt-4">
                                    <GlassButton
                                        variant="secondary"
                                        size="lg"
                                        fullWidth
                                        onClick={handleFinish}
                                    >
                                        {savedCount}着で始める
                                    </GlassButton>
                                </div>
                            )}
                        </motion.div>
                    )}

                    {/* ── Step: Processing ── */}
                    {step === "processing" && (
                        <motion.div
                            key="processing"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="relative z-10"
                        >
                            <GlassCard variant="elevated" padding="lg" hoverEffect={false}>
                                <div className="flex flex-col items-center gap-4 py-8">
                                    <div className="h-8 w-8 animate-spin rounded-full border-3 border-slate-300 border-t-violet-600" />
                                    <p className="text-sm font-bold text-slate-700">分析中...</p>
                                    <p className="text-xs text-slate-400">カテゴリと色を自動判定しています</p>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}

                    {/* ── Step: Confirm + Correct ── */}
                    {step === "confirm" && imageUrl && (
                        <motion.div
                            key="confirm"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -20 }}
                            transition={{ duration: 0.3 }}
                            className="relative z-10"
                        >
                            <div className="text-center mb-4">
                                <h2 className="text-xl font-bold text-slate-900">これで合ってる？</h2>
                                <p className="mt-1 text-xs text-slate-400">
                                    違ったらタップして修正してください
                                </p>
                            </div>

                            <GlassCard variant="elevated" padding="md" hoverEffect={false}>
                                {/* Photo preview */}
                                <div className="flex gap-4">
                                    <div className="w-28 h-28 shrink-0 rounded-xl overflow-hidden border border-slate-200/60">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={imageUrl}
                                            alt="撮影した服"
                                            className="w-full h-full object-cover"
                                        />
                                    </div>

                                    <div className="flex-1 space-y-3">
                                        {/* Category selector */}
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                カテゴリ
                                            </label>
                                            <div className="mt-1 flex flex-wrap gap-1">
                                                {CATEGORIES.map((cat) => (
                                                    <button
                                                        key={cat.value}
                                                        type="button"
                                                        onClick={() => setEditCategory(cat.value)}
                                                        className={cn(
                                                            "rounded-full px-2.5 py-1 text-[11px] font-bold transition",
                                                            editCategory === cat.value
                                                                ? "bg-slate-900 text-white"
                                                                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                                                        )}
                                                    >
                                                        {cat.icon} {cat.label}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Color selector */}
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                                                色
                                            </label>
                                            <div className="mt-1">
                                                <button
                                                    type="button"
                                                    onClick={() => setShowColorGrid(!showColorGrid)}
                                                    className="flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-700 hover:bg-slate-200 transition"
                                                >
                                                    <span
                                                        className="w-4 h-4 rounded-full border border-slate-300"
                                                        style={{
                                                            backgroundColor:
                                                                COLOR_OPTIONS.find((c) => c.value === editColor)
                                                                    ?.hex ?? "#9e9e9e",
                                                        }}
                                                    />
                                                    {COLOR_OPTIONS.find((c) => c.value === editColor)
                                                        ?.label ?? "色を選択"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Color grid (expandable) */}
                                <AnimatePresence>
                                    {showColorGrid && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.2 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="mt-3 pt-3 border-t border-slate-100">
                                                <div className="grid grid-cols-7 gap-2">
                                                    {COLOR_OPTIONS.map((c) => (
                                                        <button
                                                            key={c.value}
                                                            type="button"
                                                            onClick={() => {
                                                                setEditColor(c.value);
                                                                setShowColorGrid(false);
                                                            }}
                                                            className={cn(
                                                                "flex flex-col items-center gap-0.5",
                                                            )}
                                                        >
                                                            <span
                                                                className={cn(
                                                                    "w-7 h-7 rounded-full border-2 transition",
                                                                    editColor === c.value
                                                                        ? "border-slate-900 scale-110"
                                                                        : "border-slate-200",
                                                                )}
                                                                style={{ backgroundColor: c.hex }}
                                                            />
                                                            <span className="text-[8px] text-slate-400 leading-none">
                                                                {c.label}
                                                            </span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Name input */}
                                <div className="mt-3 pt-3 border-t border-slate-100">
                                    <input
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        placeholder="アイテム名（任意）"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-200"
                                    />
                                </div>

                                {/* Confidence indicator */}
                                {classification && classification.confidence < 0.6 && (
                                    <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-1.5">
                                        <span className="text-amber-500 text-xs">⚠️</span>
                                        <span className="text-[11px] text-amber-700">
                                            認識精度が低めです。正しいカテゴリ・色を確認してください
                                        </span>
                                    </div>
                                )}

                                {/* Action buttons */}
                                <div className="mt-4 flex gap-2">
                                    <GlassButton
                                        variant="gradient"
                                        size="lg"
                                        fullWidth
                                        onClick={handleSave}
                                    >
                                        これで追加
                                    </GlassButton>
                                    <button
                                        type="button"
                                        onClick={handleRetake}
                                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-500 hover:bg-slate-50 transition"
                                    >
                                        撮り直す
                                    </button>
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}

                    {/* ── Step: Done ── */}
                    {step === "done" && (
                        <motion.div
                            key="done"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.3 }}
                            className="relative z-10"
                        >
                            <GlassCard variant="elevated" padding="lg" hoverEffect={false}>
                                <div className="text-center py-4">
                                    <motion.div
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.1 }}
                                        className="text-4xl mb-3"
                                    >
                                        {savedCount >= 3 ? "🎉" : "✓"}
                                    </motion.div>
                                    <h2 className="text-xl font-bold text-slate-900">
                                        {savedCount}着目を登録しました
                                    </h2>
                                    <p className="mt-2 text-sm text-slate-500">
                                        {savedCount >= 3
                                            ? "コーデ提案の準備が整いました！"
                                            : `あと${3 - savedCount}着追加すると提案が始まります`}
                                    </p>
                                </div>

                                <div className="flex flex-col gap-2 mt-4">
                                    <GlassButton
                                        variant={savedCount >= 3 ? "secondary" : "gradient"}
                                        size="lg"
                                        fullWidth
                                        onClick={handleAddAnother}
                                    >
                                        もう1着撮る
                                    </GlassButton>

                                    {savedCount >= 1 && (
                                        <GlassButton
                                            variant={savedCount >= 3 ? "gradient" : "secondary"}
                                            size="lg"
                                            fullWidth
                                            onClick={handleFinish}
                                        >
                                            {savedCount >= 3
                                                ? "始める"
                                                : `${savedCount}着で始める`}
                                        </GlassButton>
                                    )}
                                </div>
                            </GlassCard>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
