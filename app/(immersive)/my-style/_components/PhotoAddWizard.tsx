"use client";

import React, { useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { WardrobeItem } from "../_lib/types";
import type { CategoryMain, SeasonCode, FormalityCode } from "../_lib/taxonomy";
import {
    CATEGORY_MAIN_OPTIONS,
    getSubcategoryOptionsByMain,
    getSubcategoryLabel,
    getCategoryMainLabel,
    inferLegacyCategory,
    calcWardrobeQuality,
} from "../_lib/taxonomy";
import { COLOR_OPTIONS, uid, resizeImage } from "../_lib/constants";
import { extractDominantColors, hexToColorName } from "../_lib/imageColorExtract";
import type { DominantColor } from "../_lib/imageColorExtract";
import BackgroundRemover from "./BackgroundRemover";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PhotoAddWizardProps {
    onSave: (item: WardrobeItem) => void;
    onClose: () => void;
    itemCount: number;
}

type Step = 1 | 2 | 3 | 4 | 5;

type ColorOption = (typeof COLOR_OPTIONS)[number];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_ICONS: Record<CategoryMain, string> = {
    outer: "\u{1F9E5}",
    tops: "\u{1F455}",
    bottoms: "\u{1F456}",
    shoes: "\u{1F45F}",
    bag: "\u{1F45C}",
    accessory: "\u231A",
    other: "\u{1F4E6}",
};

const SEASON_CHOICES: { value: SeasonCode; label: string }[] = [
    { value: "ss", label: "春夏" },
    { value: "aw", label: "秋冬" },
    { value: "all", label: "通年" },
];

const FORMALITY_CHOICES: { value: FormalityCode; label: string }[] = [
    { value: "casual", label: "カジュアル" },
    { value: "smart", label: "スマート" },
    { value: "dress", label: "ドレス" },
];

// ---------------------------------------------------------------------------
// Animation variants
// ---------------------------------------------------------------------------

const slideVariants = {
    enter: (dir: number) => ({ x: dir > 0 ? 260 : -260, opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (dir: number) => ({ x: dir > 0 ? -260 : 260, opacity: 0 }),
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PhotoAddWizard({ onSave, onClose, itemCount }: PhotoAddWizardProps) {
    const [step, setStep] = useState<Step>(1);
    const [direction, setDirection] = useState(1);

    // Step 1 – photo
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);
    const [showBgRemover, setShowBgRemover] = useState(false);
    const cameraInputRef = useRef<HTMLInputElement>(null);
    const galleryInputRef = useRef<HTMLInputElement>(null);

    // Step 2 – color
    const [dominantColors, setDominantColors] = useState<DominantColor[]>([]);
    const [selectedColor, setSelectedColor] = useState<ColorOption | null>(null);
    const [showColorGrid, setShowColorGrid] = useState(false);

    // Step 3 – category
    const [categoryMain, setCategoryMain] = useState<CategoryMain | null>(null);
    const [subcategory, setSubcategory] = useState<string | null>(null);

    // Step 4 – details
    const [name, setName] = useState("");
    const [season, setSeason] = useState<SeasonCode>("all");
    const [formality, setFormality] = useState<FormalityCode>("casual");

    // Step 5 – post-save
    const [saved, setSaved] = useState(false);
    const [savedCount, setSavedCount] = useState(0);

    // Derived
    const subcategoryOptions = useMemo(
        () => (categoryMain ? getSubcategoryOptionsByMain(categoryMain) : []),
        [categoryMain],
    );

    const autoName = useMemo(() => {
        const colorPart = selectedColor?.label ?? "";
        const subPart = subcategory ? getSubcategoryLabel(subcategory) : "";
        return `${colorPart}${subPart}`;
    }, [selectedColor, subcategory]);

    const encourageMessage = useMemo(() => {
        if (savedCount === 1) return "最初の一歩！あと2着でDNAが動き出します";
        if (savedCount === 3) return "3着突破！スタイルの輪郭が見え始めます";
        if (savedCount === 5) return "5着達成！全機能が解放されました";
        return `${savedCount}着目を登録！`;
    }, [savedCount]);

    // Navigation helpers
    const goTo = useCallback((target: Step, dir: number) => {
        setDirection(dir);
        setStep(target);
    }, []);

    const goNext = useCallback(() => {
        const next = Math.min(5, step + 1) as Step;
        goTo(next, 1);
    }, [step, goTo]);

    const goBack = useCallback(() => {
        const prev = Math.max(1, step - 1) as Step;
        goTo(prev, -1);
    }, [step, goTo]);

    // ---------------------------------------------------------------------------
    // Image handling
    // ---------------------------------------------------------------------------

    const handleImageFile = useCallback(async (file: File) => {
        setImageFile(file);
        const objectUrl = URL.createObjectURL(file);
        setPreviewUrl(objectUrl);
        // Show background remover before proceeding
        setShowBgRemover(true);
    }, []);

    const proceedToColorStep = useCallback(async (imgUrl?: string) => {
        setShowBgRemover(false);
        const urlToExtract = imgUrl ?? previewUrl;
        if (urlToExtract) {
            setIsExtracting(true);
            try {
                // If we got a processed data URL, update preview
                if (imgUrl) setPreviewUrl(imgUrl);
                const colors = await extractDominantColors(imageFile!, 3);
                setDominantColors(colors);
                if (colors.length > 0) {
                    const matched = hexToColorName(colors[0].hex);
                    setSelectedColor(matched);
                }
            } catch {
                setDominantColors([]);
            } finally {
                setIsExtracting(false);
            }
        }
        setDirection(1);
        setStep(2);
    }, [previewUrl, imageFile]);

    const handleInputChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
            // Reset input so same file can be selected again
            e.target.value = "";
        },
        [handleImageFile],
    );

    // ---------------------------------------------------------------------------
    // Category
    // ---------------------------------------------------------------------------

    const handleCategorySelect = useCallback((cat: CategoryMain) => {
        setCategoryMain(cat);
        setSubcategory(null);
    }, []);

    const handleSubcategorySelect = useCallback((sub: string) => {
        setSubcategory(sub);
        setDirection(1);
        setStep(4);
    }, []);

    // ---------------------------------------------------------------------------
    // Save
    // ---------------------------------------------------------------------------

    const handleSave = useCallback(async () => {
        if (!categoryMain || !subcategory || !selectedColor) return;

        // Resize image to max 400px wide before storing
        let imageUrl: string | undefined;
        if (imageFile) {
            try {
                imageUrl = await resizeImage(imageFile, 400, 800);
            } catch {
                imageUrl = previewUrl ?? undefined;
            }
        }

        const quality = calcWardrobeQuality({
            imageUrl: imageUrl ?? null,
            categoryMain,
            subcategory,
            colorName: selectedColor.label,
            season,
            thickness: "mid",
            formality,
        });

        const item: WardrobeItem = {
            id: uid(),
            name: name.trim() || autoName || "新しいアイテム",
            category: inferLegacyCategory(categoryMain, subcategory),
            categoryMain,
            subcategory,
            color: selectedColor.value,
            colorName: selectedColor.label,
            colorHex: selectedColor.hex,
            imageUrl,
            season,
            formality,
            thickness: "mid",
            addedAt: new Date().toISOString(),
            qualityScore: quality.score,
            missingBadges: quality.badges,
        };

        onSave(item);
        setSavedCount(itemCount + 1);
        setSaved(true);
        setDirection(1);
        setStep(5);
    }, [
        categoryMain,
        subcategory,
        selectedColor,
        imageFile,
        previewUrl,
        name,
        autoName,
        season,
        formality,
        itemCount,
        onSave,
    ]);

    const handleRestart = useCallback(() => {
        setImageFile(null);
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
        setDominantColors([]);
        setSelectedColor(null);
        setShowColorGrid(false);
        setCategoryMain(null);
        setSubcategory(null);
        setName("");
        setSeason("all");
        setFormality("casual");
        setSaved(false);
        setDirection(-1);
        setStep(1);
    }, [previewUrl]);

    // ---------------------------------------------------------------------------
    // Shared UI helpers
    // ---------------------------------------------------------------------------

    const TOTAL_STEPS = 5;

    const renderStepDots = () => (
        <div className="flex items-center justify-center gap-2 mb-6">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s) => (
                <motion.div
                    key={s}
                    className="rounded-full"
                    animate={{
                        width: s === step ? 24 : 8,
                        height: 8,
                        backgroundColor:
                            s === step ? "#7c3aed" : s < step ? "#a78bfa" : "#e2e8f0",
                    }}
                    transition={{ type: "spring", stiffness: 300, damping: 25 }}
                />
            ))}
        </div>
    );

    const renderBackButton = () =>
        step > 1 && !saved ? (
            <button
                onClick={goBack}
                className="absolute top-4 left-4 z-10 flex items-center gap-1 text-slate-500 hover:text-slate-800 transition-colors text-sm font-medium"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                戻る
            </button>
        ) : null;

    // ---------------------------------------------------------------------------
    // Step 1: Photo capture / upload
    // ---------------------------------------------------------------------------

    const renderStep1 = () => (
        <motion.div
            key="step1"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col items-center w-full max-w-sm"
        >
            <h2 className="text-xl font-bold text-slate-900 mb-1">写真を追加</h2>
            <p className="text-sm text-slate-500 mb-6">服の写真を撮影またはアップロード</p>

            {/* Hidden inputs */}
            <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleInputChange}
            />
            <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleInputChange}
            />

            <div className="flex flex-col gap-3 w-full">
                {/* Camera */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex items-center gap-4 rounded-2xl bg-violet-600 text-white px-5 py-4 shadow-lg shadow-violet-500/25 hover:bg-violet-700 transition-colors"
                >
                    <span className="text-3xl">📷</span>
                    <div className="text-left">
                        <div className="font-semibold text-base">カメラで撮影</div>
                        <div className="text-xs text-violet-200 mt-0.5">今すぐ服を撮影する</div>
                    </div>
                </motion.button>

                {/* Gallery */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => galleryInputRef.current?.click()}
                    className="flex items-center gap-4 rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 px-5 py-4 shadow-sm hover:shadow-md hover:border-violet-300 transition-all"
                >
                    <span className="text-3xl">🖼️</span>
                    <div className="text-left">
                        <div className="font-semibold text-base text-slate-800">ギャラリーから選択</div>
                        <div className="text-xs text-slate-500 mt-0.5">保存済みの写真を使用する</div>
                    </div>
                </motion.button>
            </div>
        </motion.div>
    );

    // ---------------------------------------------------------------------------
    // Step 2: Color detection + override
    // ---------------------------------------------------------------------------

    const renderStep2 = () => (
        <motion.div
            key="step2"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col items-center w-full max-w-sm"
        >
            <h2 className="text-xl font-bold text-slate-900 mb-1">カラー確認</h2>
            <p className="text-sm text-slate-500 mb-4">写真から抽出した色を確認してください</p>

            {/* Preview thumbnail */}
            {previewUrl && (
                <div className="w-24 h-24 rounded-2xl overflow-hidden border border-slate-200 shadow-sm mb-5 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previewUrl} alt="プレビュー" className="w-full h-full object-cover" />
                </div>
            )}

            {isExtracting ? (
                <div className="flex flex-col items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-full border-2 border-violet-400 border-t-transparent animate-spin" />
                    <span className="text-sm text-slate-500">色を解析中…</span>
                </div>
            ) : (
                <>
                    {dominantColors.length > 0 && (
                        <div className="w-full mb-4">
                            <p className="text-xs font-medium text-slate-500 mb-2">検出された色（タップして選択）</p>
                            <div className="flex gap-3">
                                {dominantColors.map((dc, i) => {
                                    const mapped = hexToColorName(dc.hex);
                                    const isSelected = selectedColor?.value === mapped.value;
                                    return (
                                        <motion.button
                                            key={i}
                                            whileHover={{ scale: 1.1 }}
                                            whileTap={{ scale: 0.9 }}
                                            onClick={() => setSelectedColor(mapped)}
                                            className="flex flex-col items-center gap-1.5"
                                        >
                                            <span
                                                className="block w-14 h-14 rounded-2xl border-4 shadow-sm transition-all"
                                                style={{
                                                    backgroundColor: dc.hex,
                                                    borderColor: isSelected ? "#7c3aed" : "transparent",
                                                    boxShadow: isSelected ? "0 0 0 2px #7c3aed" : undefined,
                                                }}
                                            />
                                            <span className="text-[10px] text-slate-500 leading-tight text-center">
                                                {mapped.label}
                                                <br />
                                                <span className="text-slate-400">{dc.percentage}%</span>
                                            </span>
                                        </motion.button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Selected colour display */}
                    {selectedColor && !showColorGrid && (
                        <div className="flex items-center gap-3 mb-4 w-full">
                            <span
                                className="block w-8 h-8 rounded-full border border-slate-200 flex-shrink-0"
                                style={{ backgroundColor: selectedColor.hex }}
                            />
                            <span className="text-sm font-semibold text-slate-700">{selectedColor.label}</span>
                            <span className="text-xs text-slate-400 ml-auto">選択中</span>
                        </div>
                    )}

                    {/* Toggle full color grid */}
                    {!showColorGrid ? (
                        <button
                            onClick={() => setShowColorGrid(true)}
                            className="text-sm text-violet-600 font-medium hover:text-violet-800 transition-colors mb-4"
                        >
                            すべての色から選ぶ ▼
                        </button>
                    ) : (
                        <div className="w-full mb-4">
                            <button
                                onClick={() => setShowColorGrid(false)}
                                className="text-sm text-violet-600 font-medium hover:text-violet-800 transition-colors mb-3"
                            >
                                閉じる ▲
                            </button>
                            <div className="grid grid-cols-6 gap-3">
                                {COLOR_OPTIONS.map((c) => (
                                    <motion.button
                                        key={c.value}
                                        whileHover={{ scale: 1.15 }}
                                        whileTap={{ scale: 0.9 }}
                                        onClick={() => {
                                            setSelectedColor(c);
                                            setShowColorGrid(false);
                                        }}
                                        className="flex flex-col items-center gap-1"
                                        title={c.label}
                                    >
                                        <span
                                            className="block w-10 h-10 rounded-full border-2 shadow-sm transition-all"
                                            style={{
                                                backgroundColor: c.hex,
                                                borderColor:
                                                    selectedColor?.value === c.value
                                                        ? "#7c3aed"
                                                        : c.value === "white"
                                                          ? "#e2e8f0"
                                                          : "transparent",
                                            }}
                                        />
                                        <span className="text-[10px] text-slate-500 leading-tight">{c.label}</span>
                                    </motion.button>
                                ))}
                            </div>
                        </div>
                    )}

                    <GlassButton
                        variant="primary"
                        fullWidth
                        onClick={goNext}
                        disabled={!selectedColor}
                    >
                        次へ
                    </GlassButton>
                </>
            )}
        </motion.div>
    );

    // ---------------------------------------------------------------------------
    // Step 3: Category + subcategory
    // ---------------------------------------------------------------------------

    const renderStep3 = () => (
        <motion.div
            key="step3"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col items-center"
        >
            <h2 className="text-xl font-bold text-slate-900 mb-1">カテゴリ選択</h2>
            <p className="text-sm text-slate-500 mb-6">アイテムの種類を選んでください</p>

            {!categoryMain && (
                <div className="grid grid-cols-3 gap-3 w-full max-w-sm">
                    {CATEGORY_MAIN_OPTIONS.map((opt) => (
                        <motion.button
                            key={opt.value}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleCategorySelect(opt.value)}
                            className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 shadow-sm hover:shadow-md hover:border-violet-300 transition-all p-4 min-h-[100px] min-w-[100px]"
                        >
                            <span className="text-3xl">{CATEGORY_ICONS[opt.value]}</span>
                            <span className="text-sm font-semibold text-slate-700">{opt.label}</span>
                        </motion.button>
                    ))}
                </div>
            )}

            {categoryMain && (
                <div className="w-full max-w-sm">
                    <button
                        onClick={() => setCategoryMain(null)}
                        className="flex items-center gap-2 mb-4 text-sm text-violet-600 font-medium hover:text-violet-800 transition-colors"
                    >
                        <span className="text-xl">{CATEGORY_ICONS[categoryMain]}</span>
                        {getCategoryMainLabel(categoryMain)}
                        <span className="text-slate-400 ml-1">→ サブカテゴリ</span>
                    </button>
                    <div className="flex flex-wrap gap-2">
                        {subcategoryOptions.map((opt) => (
                            <motion.button
                                key={opt.value}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => handleSubcategorySelect(opt.value)}
                                className="px-4 py-2.5 rounded-full bg-white/80 backdrop-blur-lg border border-slate-200/80 text-sm font-medium text-slate-700 shadow-sm hover:shadow-md hover:border-violet-300 hover:text-violet-700 transition-all min-h-[48px]"
                            >
                                {opt.label}
                            </motion.button>
                        ))}
                    </div>
                </div>
            )}
        </motion.div>
    );

    // ---------------------------------------------------------------------------
    // Step 4: Name + season + formality
    // ---------------------------------------------------------------------------

    const renderStep4 = () => (
        <motion.div
            key="step4"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col items-center w-full max-w-sm"
        >
            <h2 className="text-xl font-bold text-slate-900 mb-1">詳細</h2>
            <p className="text-sm text-slate-500 mb-6">名前と属性を設定してください</p>

            {/* Name */}
            <label className="w-full mb-4">
                <span className="text-sm font-medium text-slate-600 mb-1 block">アイテム名</span>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={autoName || "例: ネイビーコート"}
                    className="w-full rounded-2xl bg-white/80 backdrop-blur-lg border border-slate-200/80 text-slate-800 placeholder-slate-400 focus:outline-none focus:border-violet-400 transition-all px-4 py-3 text-base"
                />
            </label>

            {/* Season */}
            <div className="w-full mb-4">
                <span className="text-sm font-medium text-slate-600 mb-2 block">シーズン</span>
                <div className="flex gap-2">
                    {SEASON_CHOICES.map((s) => (
                        <button
                            key={s.value}
                            onClick={() => setSeason(s.value)}
                            className={`flex-1 min-h-[48px] rounded-xl text-sm font-semibold transition-all border ${
                                season === s.value
                                    ? "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/25"
                                    : "bg-white/80 text-slate-600 border-slate-200/80 hover:border-violet-300"
                            }`}
                        >
                            {s.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Formality */}
            <div className="w-full mb-6">
                <span className="text-sm font-medium text-slate-600 mb-2 block">TPO</span>
                <div className="flex gap-2">
                    {FORMALITY_CHOICES.map((f) => (
                        <button
                            key={f.value}
                            onClick={() => setFormality(f.value)}
                            className={`flex-1 min-h-[48px] rounded-xl text-sm font-semibold transition-all border ${
                                formality === f.value
                                    ? "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-500/25"
                                    : "bg-white/80 text-slate-600 border-slate-200/80 hover:border-violet-300"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            <GlassButton variant="primary" fullWidth onClick={goNext}>
                確認へ
            </GlassButton>
        </motion.div>
    );

    // ---------------------------------------------------------------------------
    // Step 5: Preview + save / post-save
    // ---------------------------------------------------------------------------

    const renderStep5 = () => (
        <motion.div
            key="step5"
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="flex flex-col items-center w-full max-w-sm"
        >
            {!saved ? (
                <>
                    <h2 className="text-xl font-bold text-slate-900 mb-4">確認</h2>

                    <GlassCard className="w-full mb-6" padding="md" hoverEffect={false}>
                        <div className="flex items-center gap-4">
                            {/* Photo thumbnail or color swatch */}
                            {previewUrl ? (
                                <div className="w-16 h-16 rounded-2xl overflow-hidden border border-slate-200 shadow-inner flex-shrink-0">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={previewUrl}
                                        alt="アイテム"
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            ) : (
                                <div
                                    className="w-16 h-16 rounded-2xl border border-slate-200 shadow-inner flex-shrink-0"
                                    style={{ backgroundColor: selectedColor?.hex ?? "#ccc" }}
                                />
                            )}

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xl">
                                        {categoryMain ? CATEGORY_ICONS[categoryMain] : ""}
                                    </span>
                                    <span className="font-bold text-slate-900 truncate">
                                        {name.trim() || autoName || "新しいアイテム"}
                                    </span>
                                </div>
                                <div className="flex flex-wrap gap-1.5 text-xs">
                                    {categoryMain && (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                            {getCategoryMainLabel(categoryMain)}
                                        </span>
                                    )}
                                    {subcategory && (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                            {getSubcategoryLabel(subcategory)}
                                        </span>
                                    )}
                                    {selectedColor && (
                                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex items-center gap-1">
                                            <span
                                                className="inline-block w-3 h-3 rounded-full border border-slate-300"
                                                style={{ backgroundColor: selectedColor.hex }}
                                            />
                                            {selectedColor.label}
                                        </span>
                                    )}
                                    <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                                        {SEASON_CHOICES.find((s) => s.value === season)?.label}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-full bg-violet-50 text-violet-600">
                                        {FORMALITY_CHOICES.find((f) => f.value === formality)?.label}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </GlassCard>

                    <GlassButton variant="primary" fullWidth onClick={handleSave}>
                        保存する
                    </GlassButton>
                </>
            ) : (
                /* Post-save */
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center text-center"
                >
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.1 }}
                        className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mb-4"
                    >
                        <svg
                            className="w-8 h-8 text-emerald-600"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2.5}
                                d="M5 13l4 4L19 7"
                            />
                        </svg>
                    </motion.div>
                    <p className="text-lg font-bold text-slate-900 mb-1">{encourageMessage}</p>
                    <p className="text-sm text-slate-500 mb-6">ワードローブに追加されました</p>

                    <div className="flex gap-3 w-full">
                        <GlassButton variant="secondary" fullWidth onClick={handleRestart}>
                            もう1着追加
                        </GlassButton>
                        <GlassButton variant="primary" fullWidth onClick={onClose}>
                            完了
                        </GlassButton>
                    </div>
                </motion.div>
            )}
        </motion.div>
    );

    // ---------------------------------------------------------------------------
    // Main render
    // ---------------------------------------------------------------------------

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
        >
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Panel */}
            <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 24 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 24 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="relative z-10 w-full max-w-md mx-4 bg-white/92 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-black/10 border border-white overflow-hidden"
            >
                {/* Close button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 z-10 w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 transition-colors"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M6 18L18 6M6 6l12 12"
                        />
                    </svg>
                </button>

                {renderBackButton()}

                <div className="px-6 pt-14 pb-8 min-h-[440px] flex flex-col overflow-y-auto max-h-[90vh]">
                    {renderStepDots()}

                    <div className="flex-1 flex flex-col items-center justify-center overflow-hidden">
                        <AnimatePresence mode="wait" custom={direction}>
                            {step === 1 && renderStep1()}
                            {step === 2 && renderStep2()}
                            {step === 3 && renderStep3()}
                            {step === 4 && renderStep4()}
                            {step === 5 && renderStep5()}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>

            {/* Background Remover Overlay */}
            {showBgRemover && imageFile && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow-2xl max-h-[90vh] overflow-auto">
                        <h3 className="text-lg font-bold text-slate-900 mb-3">背景を整える</h3>
                        <BackgroundRemover
                            imageFile={imageFile}
                            onApply={(processedUrl) => void proceedToColorStep(processedUrl)}
                            onSkip={() => void proceedToColorStep()}
                            onCancel={() => setShowBgRemover(false)}
                        />
                    </div>
                </div>
            )}
        </motion.div>
    );
}
