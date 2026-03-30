"use client";

import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    GlassCard,
    GlassButton,
    GlassBadge,
} from "@/components/ui/glassmorphism-design";
import type {
    SeasonChoice,
    UndertoneChoice,
    ColorSubtypeOption,
    FusedColorResult,
    FusionHistoryEntry,
    ColorPaletteInputs,
} from "./shared/types";
import { SEASON_VISUAL, UNDERTONE_VISUAL, SEASON_RECOMMENDATIONS } from "./shared/constants";
import {
    seasonLabelJa,
    undertoneLabelJa,
    formatPercent,
    clamp01,
} from "./shared/colorUtils";
import {
    ConstellationChart,
    ScoreCounter,
    SwatchGallery,
    AnimatedGauge,
    RadarChart,
    SeasonWheel,
} from "./shared/charts";
import { ScrollReveal, ColorHarmonyWheel } from "./shared/visuals";

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface ColorDetailViewProps {
    // Color state
    activeSeason: SeasonChoice | null;
    activeUndertone: UndertoneChoice | null;
    activeSubtype: ColorSubtypeOption | null;
    subtypeOptions: ColorSubtypeOption[];
    colorSeasonLabel: string;
    fusionPreview: FusedColorResult | null;
    fusionStatusLabel: string;
    axisMetrics: { undertone: number; value_L: number; chroma_C: number; contrast: number };
    aiConfidence: number;
    colorPaletteInputs: ColorPaletteInputs;
    colorFusionHistory: FusionHistoryEntry[];
    hasUnifiedColorDiagnosis: boolean;
    colorRediagnosisMode: boolean;
    canSaveUnifiedColor: boolean;
    realFaceDiagnosis: any;
    heroRealFaceImage: string | null;
    eyeColorLabel: string;
    derivedSeason12: string | undefined;
    derivedSeason16: string | undefined;
    // Handlers
    onSeasonSelect: (season: SeasonChoice) => void;
    onSubtypeSelect: (subtypeId: string) => void;
    onUndertoneSelect: (undertone: UndertoneChoice) => void;
    onBeginRediagnosis: () => void;
    onColorSave: () => void;
    // State
    error: string | null;
    message: string | null;
    saving: boolean;
    // Setup section (passed as JSX)
    colorSetupSection: React.ReactNode;
    onNavigateBack: () => void;
}

/* ------------------------------------------------------------------ */
/*  Slide transition                                                   */
/* ------------------------------------------------------------------ */

const slideTransition = { duration: 0.4, ease: [0.22, 1, 0.36, 1] as const };

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function ColorDetailView({
    activeSeason,
    activeUndertone,
    activeSubtype,
    subtypeOptions,
    colorSeasonLabel,
    fusionPreview,
    fusionStatusLabel,
    axisMetrics,
    aiConfidence,
    colorPaletteInputs,
    colorFusionHistory,
    hasUnifiedColorDiagnosis,
    colorRediagnosisMode,
    canSaveUnifiedColor,
    realFaceDiagnosis,
    heroRealFaceImage,
    eyeColorLabel,
    derivedSeason12,
    derivedSeason16,
    onSeasonSelect,
    onSubtypeSelect,
    onUndertoneSelect,
    onBeginRediagnosis,
    onColorSave,
    error,
    message,
    saving,
    colorSetupSection,
    onNavigateBack,
}: ColorDetailViewProps) {
    const undertoneLabel = undertoneLabelJa(activeUndertone);
    const showSetupAtTop = !hasUnifiedColorDiagnosis || colorRediagnosisMode;

    /* Harmony wheel fallback swatches */
    const harmonySwatches = useMemo(() => {
        if (activeSubtype?.swatches?.length) return activeSubtype.swatches;
        if (activeSeason) {
            return SEASON_RECOMMENDATIONS[activeSeason].recommended.map((n, i) => ({
                name: n,
                hex: ["#8b5cf6", "#ec4899", "#f59e0b", "#10b981"][i] ?? "#8b5cf6",
            }));
        }
        return [];
    }, [activeSubtype, activeSeason]);

    return (
        <motion.div
            key="color-detail"
            className="mx-auto max-w-6xl space-y-3 px-3 py-2 pb-28 sm:space-y-4 sm:px-5 sm:py-3 sm:pb-32"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={slideTransition}
        >
            {/* ── Back button ── */}
            <button
                type="button"
                onClick={onNavigateBack}
                className="group flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-violet-600 transition-colors"
            >
                <motion.span
                    className="inline-block"
                    whileHover={{ x: -3 }}
                    transition={{ type: "spring", stiffness: 400 }}
                >
                    &larr;
                </motion.span>
                戻る
            </button>

            {/* ── Login error ── */}
            {error === "ログインが必要です" && (
                <GlassCard className="p-4 sm:p-6">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <div className="text-base font-bold text-slate-900 sm:text-lg">ログインが必要です</div>
                            <div className="text-sm text-slate-500">カラー入力はログイン後に利用できます。</div>
                        </div>
                        <GlassButton href="/login?next=/body-color/avatar?tab=color" variant="gradient">ログイン</GlassButton>
                    </div>
                </GlassCard>
            )}

            {/* ── 0. Color setup section (top while diagnosis is unfinished) ── */}
            {showSetupAtTop ? colorSetupSection : null}

            {/* ── 1. Unified diagnosis result ── */}
            {hasUnifiedColorDiagnosis && fusionPreview && !colorRediagnosisMode && (
                <ScrollReveal>
                    <div id="color-unified-result">
                        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                            <GlassCard className="relative overflow-hidden p-3 sm:p-4 ring-2 ring-violet-200/60 shadow-lg shadow-violet-100/40">
                                <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: SEASON_VISUAL[fusionPreview.season].background }} />
                                <div className="relative grid gap-3 md:grid-cols-[minmax(0,1fr),100px] md:items-start lg:grid-cols-[minmax(0,1fr),120px]">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <GlassBadge variant="gradient">統合診断結果</GlassBadge>
                                            <GlassBadge variant="default">{fusionPreview.sources.length} ソース統合</GlassBadge>
                                            <GlassBadge variant="default">{formatPercent(fusionPreview.confidence)}</GlassBadge>
                                        </div>
                                        <div className="mt-2 flex items-center gap-2 sm:mt-3">
                                            <span className="text-2xl sm:text-3xl">{SEASON_VISUAL[fusionPreview.season].emoji}</span>
                                            <div>
                                                <div className="text-base font-black text-slate-900 sm:text-lg">{seasonLabelJa(fusionPreview.season)}</div>
                                                <div className="mt-0.5 text-xs text-slate-500">{fusionPreview.summary}</div>
                                            </div>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5 sm:mt-3">
                                            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-black text-violet-700">
                                                season16 {fusionPreview.season16 ?? "未算出"}
                                            </span>
                                            <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-black text-slate-700">
                                                undertone {undertoneLabelJa(fusionPreview.undertone)}
                                            </span>
                                            {realFaceDiagnosis && (
                                                <span className="rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-black text-slate-700">
                                                    Drape {formatPercent(realFaceDiagnosis.confidence)}
                                                </span>
                                            )}
                                        </div>
                                        <div className="mt-3 grid gap-2 sm:mt-3 sm:grid-cols-2">
                                            <div className="rounded-xl border border-emerald-100 bg-emerald-50/70 p-2.5 sm:p-3">
                                                <div className="text-xs font-black text-emerald-800">おすすめカラー</div>
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {fusionPreview.recommendedColors.slice(0, 6).map((item) => (
                                                        <span key={item} className="rounded-full border border-emerald-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">{item}</span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="rounded-xl border border-rose-100 bg-rose-50/70 p-2.5 sm:p-3">
                                                <div className="text-xs font-black text-rose-800">避けたい傾向</div>
                                                <div className="mt-1.5 flex flex-wrap gap-1.5">
                                                    {fusionPreview.avoidColors.slice(0, 6).map((item) => (
                                                        <span key={item} className="rounded-full border border-rose-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-rose-700">{item}</span>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-2 md:block md:space-y-2">
                                        {heroRealFaceImage ? (
                                            <div className="w-16 shrink-0 overflow-hidden rounded-xl border border-white/70 bg-white/90 shadow-sm sm:w-20 md:w-full">
                                                <img
                                                    src={heroRealFaceImage}
                                                    alt="統合カラー診断"
                                                    className="aspect-square w-full object-cover"
                                                />
                                            </div>
                                        ) : null}
                                        <div className="min-w-0 rounded-xl border border-white/70 bg-white/85 p-2 text-[11px] leading-4 text-slate-600">
                                            実顔写真のAI診断とドレープ比較を統合した現在の結果です。再診断すると、この結果は下の履歴へ移ります。
                                        </div>
                                    </div>
                                </div>
                            </GlassCard>
                        </motion.div>
                    </div>
                </ScrollReveal>
            )}

            {/* ── 2. Fusion history ── */}
            {colorFusionHistory.length > 0 && (
                <div className="rounded-2xl border border-slate-200/60 bg-slate-50/50 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.28em] text-slate-400">History</div>
                            <div className="mt-0.5 text-xs font-black text-slate-600">統合診断の履歴</div>
                        </div>
                        <div className="text-[11px] text-slate-500">直前の結果を比較用に保持しています</div>
                    </div>
                    <div className="mt-2 grid gap-2 md:mt-3 md:grid-cols-2">
                        {colorFusionHistory.slice(0, 4).map((entry) => (
                            <div key={entry.id} className="rounded-xl border border-slate-200 bg-white/85 p-2.5 shadow-sm sm:rounded-2xl sm:p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <div className="text-sm font-black text-slate-900">{seasonLabelJa(entry.result.season)}</div>
                                        <div className="mt-1 text-xs text-slate-500">{entry.result.summary}</div>
                                    </div>
                                    <GlassBadge variant="default">{formatPercent(entry.result.confidence)}</GlassBadge>
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                                        season16 {entry.result.season16 ?? "未算出"}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold text-slate-600">
                                        undertone {undertoneLabelJa(entry.result.undertone)}
                                    </span>
                                </div>
                                <div className="mt-3 text-[11px] text-slate-400">
                                    {new Date(entry.recordedAt).toLocaleString("ja-JP")}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── 3. Main Color Card ── */}
            <ScrollReveal>
                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                    <GlassCard className="overflow-hidden p-0">
                        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr),minmax(280px,0.9fr)]">
                            {/* Left: Season Result Display */}
                            <div className="p-3 sm:p-4 lg:p-5">
                                <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
                                    <div>
                                        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400">AI Personal Color</div>
                                        <div className="mt-1.5 text-base font-black text-slate-900 sm:mt-2 sm:text-lg">
                                            {activeSubtype?.nameJa ?? "カラー診断を開始"}
                                        </div>
                                        <div className="mt-0.5 text-xs font-semibold text-slate-500">
                                            {activeSubtype?.label ?? "季節とアンダートーンを確定すると表示されます"}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <ScoreCounter value={Math.round(aiConfidence * 100)} label="マッチ度" size="sm" />
                                    </div>
                                </div>

                                {/* Season detail panel */}
                                <div className="mt-3 sm:mt-4">
                                    <div className="overflow-hidden rounded-xl border border-slate-100 bg-white/90 shadow-sm sm:rounded-2xl">
                                        <div
                                            className="px-3 py-2 text-white sm:px-4 sm:py-2.5"
                                            style={{ background: activeSeason ? SEASON_VISUAL[activeSeason].background : "linear-gradient(135deg, #c4b5fd 0%, #d946ef 50%, #6366f1 100%)" }}
                                        >
                                            <div className="flex flex-wrap items-center gap-2">
                                                {activeSeason && (
                                                    <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-black text-amber-600">
                                                        {SEASON_VISUAL[activeSeason].emoji} {SEASON_VISUAL[activeSeason].label}
                                                    </span>
                                                )}
                                                <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-black text-violet-600">{undertoneLabel}</span>
                                                {realFaceDiagnosis && (
                                                    <span className="rounded-full bg-white/85 px-3 py-1 text-xs font-black text-slate-700">
                                                        Drape {formatPercent(realFaceDiagnosis.confidence)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="space-y-3 p-3 sm:space-y-3.5 sm:p-4">
                                            <div className="grid gap-2 sm:grid-cols-[72px_minmax(0,1fr)]">
                                                <div className="text-[10px] font-black uppercase tracking-[0.22em] text-slate-400">Profile</div>
                                                <div className="space-y-1.5 text-xs text-slate-600">
                                                    <div className="flex items-center justify-between gap-3"><span>Color</span><span className="font-black text-slate-900">{activeSubtype?.nameJa ?? colorSeasonLabel}</span></div>
                                                    <div className="flex items-center justify-between gap-3"><span>Undertone</span><span className="font-black text-slate-900">{undertoneLabel}</span></div>
                                                    <div className="flex items-center justify-between gap-3"><span>Eye</span><span className="font-black text-slate-900">{eyeColorLabel}</span></div>
                                                    <div className="flex items-center justify-between gap-3"><span>Fusion</span><span className="font-black text-slate-900">{fusionStatusLabel}</span></div>
                                                </div>
                                            </div>
                                            <div>
                                                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.22em] text-slate-400 sm:mb-2.5">Best Color</div>
                                                <SwatchGallery swatches={activeSubtype?.swatches ?? []} season={activeSeason} />
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {(activeSubtype?.keywords ?? []).map((keyword) => (
                                                    <span key={keyword} className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{keyword}</span>
                                                ))}
                                            </div>
                                            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:rounded-2xl sm:px-3.5 sm:py-2.5">
                                                {activeSubtype?.description ?? "AI診断の season と subtype を選択すると解説が表示されます。"}
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {(activeSubtype?.avoid ?? []).map((item) => (
                                                    <span key={item} className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-black text-rose-600">NG: {item}</span>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Right: Season selector + Undertone + Palette */}
                            <div className="border-t border-slate-100 bg-slate-50/80 p-3 sm:p-4 lg:border-l lg:border-t-0">
                                <div className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400 mb-0.5">SEASON SELECT</div>
                                <div className="text-xs font-black text-slate-900">季節タイプを選択</div>
                                <div className="mt-0.5 text-[11px] text-slate-500">4シーズン x 4サブタイプから絞り込めます</div>

                                {/* Season Wheel */}
                                <div className="mt-3 sm:mt-4">
                                    <SeasonWheel
                                        active={activeSeason}
                                        onSelect={onSeasonSelect}
                                    />
                                </div>

                                {/* Subtype cards */}
                                {activeSeason && (
                                    <motion.div
                                        className="mt-3 rounded-xl border border-white/80 bg-white/85 p-2.5 sm:mt-4 sm:rounded-2xl sm:p-3"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: "auto" }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-2">
                                            <div>
                                                <div className="text-sm font-black text-slate-900">{seasonLabelJa(activeSeason)}</div>
                                                <div className="mt-0.5 text-xs text-slate-500">{SEASON_VISUAL[activeSeason].description}</div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <GlassBadge variant="default">season12 {derivedSeason12 ?? "未算出"}</GlassBadge>
                                                <GlassBadge variant="default">season16 {derivedSeason16 ?? "未算出"}</GlassBadge>
                                            </div>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2">
                                            {subtypeOptions.map((option) => {
                                                const selected = option.id === activeSubtype?.id;
                                                return (
                                                    <motion.button
                                                        key={option.id}
                                                        type="button"
                                                        onClick={() => onSubtypeSelect(option.id)}
                                                        className={`rounded-xl border p-2 text-left transition-all sm:rounded-2xl sm:p-2.5 ${
                                                            selected ? "border-violet-300 bg-violet-50/80 shadow-md ring-2 ring-violet-200" : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:shadow-sm"
                                                        }`}
                                                        whileHover={{ y: -1 }}
                                                        whileTap={{ scale: 0.98 }}
                                                    >
                                                        <div className="text-xs font-black text-slate-900">{option.nameJa}</div>
                                                        <div className="mt-0.5 text-[11px] font-semibold text-slate-500">{option.label}</div>
                                                        <div className="mt-1 text-[11px] text-slate-500">{option.subtitle}</div>
                                                        <div className="mt-1.5 flex gap-1.5">
                                                            {option.swatches.map((swatch) => (
                                                                <div key={swatch.name} className="text-center">
                                                                    <div className="h-4 w-4 rounded-full border border-white shadow-sm sm:h-5 sm:w-5" style={{ backgroundColor: swatch.hex }} />
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </motion.button>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}

                                {/* Undertone selector */}
                                <div className="mt-3 rounded-xl border border-white/80 bg-white/85 p-2.5 sm:mt-4 sm:rounded-2xl sm:p-3">
                                    <div className="text-xs font-black text-slate-900">Undertone</div>
                                    <div className="mt-2 grid grid-cols-3 gap-2 sm:gap-2">
                                        {(Object.entries(UNDERTONE_VISUAL) as Array<[UndertoneChoice, (typeof UNDERTONE_VISUAL)[UndertoneChoice]]>).map(([tone, visual]) => (
                                            <motion.button
                                                key={tone}
                                                type="button"
                                                onClick={() => onUndertoneSelect(tone)}
                                                className={`rounded-lg border-2 p-2 text-left transition-all sm:rounded-xl sm:p-2.5 ${
                                                    activeUndertone === tone ? "border-violet-300 bg-violet-50/70 shadow-md" : "border-slate-200 bg-white hover:border-slate-300"
                                                }`}
                                                whileHover={{ y: -1 }}
                                                whileTap={{ scale: 0.97 }}
                                            >
                                                <div className="flex items-center gap-1.5">
                                                    <div className="h-5 w-5 rounded-full border-2 border-white shadow-sm" style={{ backgroundColor: visual.color }} />
                                                    <div className="text-[11px] font-black text-slate-900">{visual.label}</div>
                                                </div>
                                                <div className="mt-1 text-[10px] leading-3.5 text-slate-500">{visual.description}</div>
                                            </motion.button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </GlassCard>
                </motion.div>
            </ScrollReveal>

            {/* ── 4. 4-Axis Radar + Gauges + Color Harmony ── */}
            <div className="grid gap-3 sm:gap-4 lg:grid-cols-[1.05fr_0.95fr]">
                <div className="rounded-2xl border border-slate-200/50 bg-white/60 backdrop-blur-sm p-3 sm:p-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                        <div>
                            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-violet-400">COLOR GENOME</div>
                            <div className="mt-0.5 text-sm font-black text-slate-900">4軸レーダー</div>
                            <div className="mt-0.5 text-[11px] text-slate-500">AI season + CPV の現在値をビジュアル化</div>
                        </div>
                        <GlassBadge variant="gradient">{activeSeason ? seasonLabelJa(activeSeason) : "未判定"}</GlassBadge>
                    </div>
                    {/* Constellation chart */}
                    <div className="flex justify-center py-1">
                        <ConstellationChart axes={axisMetrics} size={172} season={activeSeason} />
                    </div>
                    {/* Gauges row */}
                    <div className="grid grid-cols-4 gap-1.5 mt-2">
                        <AnimatedGauge
                            value={Math.round(((axisMetrics.undertone + 1) / 2) * 100)}
                            label="Warm/Cool"
                            colorFrom="#F59E0B"
                            colorTo="#60A5FA"
                        />
                        <AnimatedGauge
                            value={Math.round(axisMetrics.value_L)}
                            label="明度"
                            colorFrom="#fef3c7"
                            colorTo="#78350f"
                        />
                        <AnimatedGauge
                            value={Math.round(Math.min(axisMetrics.chroma_C / 1.2, 100))}
                            label="彩度"
                            colorFrom="#e879f9"
                            colorTo="#94a3b8"
                        />
                        <AnimatedGauge
                            value={Math.round(axisMetrics.contrast * 100)}
                            label="コントラスト"
                            colorFrom="#1e1b4b"
                            colorTo="#e2e8f0"
                        />
                    </div>
                </div>

                {/* Color Harmony Wheel */}
                <div className="rounded-2xl border border-slate-200/50 bg-white/60 backdrop-blur-sm p-3 sm:p-4">
                    <div className="text-[10px] font-black uppercase tracking-[0.3em] text-fuchsia-400 mb-0.5">Color Harmony</div>
                    <div className="text-xs font-black text-slate-900 mb-0.5">カラーハーモニーホイール</div>
                    <div className="text-[11px] text-slate-400 mb-2">あなたのベストカラーを色環上にマッピング</div>
                    <ColorHarmonyWheel
                        swatches={harmonySwatches}
                        season={activeSeason}
                    />
                </div>
            </div>

            {/* ── 5. Fusion detail: source comparison + axes (from old Fusion tab) ── */}
            {fusionPreview && (
                <div className="grid gap-3 sm:gap-4 lg:grid-cols-[0.9fr_1.1fr]">
                    <div className="rounded-2xl border border-slate-200/40 bg-slate-50/40 p-3 sm:p-4">
                        <div className="text-xs font-black text-slate-700">ソース比較</div>
                        <div className="mt-2 space-y-2 sm:mt-3">
                            {fusionPreview.sources.map((source, i) => (
                                <motion.div
                                    key={source.name}
                                    className="rounded-lg border border-slate-100 bg-gradient-to-br from-white to-slate-50 p-2.5 shadow-sm sm:rounded-xl sm:p-3"
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="text-sm font-black text-slate-900">{source.name}</div>
                                        <GlassBadge variant="default">{formatPercent(source.confidence)}</GlassBadge>
                                    </div>
                                    <div className="mt-2 text-sm text-slate-700">{seasonLabelJa(source.season)} / {undertoneLabelJa(source.undertone)}</div>
                                    <div className="mt-1 text-xs text-slate-500">{source.detail}</div>
                                </motion.div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200/40 bg-slate-50/40 p-3 sm:p-4">
                        <div className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-400 mb-0.5">FUSION AXES</div>
                        <div className="text-xs font-black text-slate-700">統合後の4軸</div>
                        {/* Radar chart for fusion */}
                        <div className="flex justify-center py-2 sm:py-3">
                            <RadarChart axes={fusionPreview.axes} size={140} season={fusionPreview.season} />
                        </div>
                        {/* Bar chart supplement */}
                        <div className="space-y-3 mt-2">
                            {[
                                { key: "undertone", label: "Warm / Cool", value: (fusionPreview.axes.undertone + 1) / 2, colorFrom: "#F59E0B", colorTo: "#60A5FA" },
                                { key: "value_L", label: "Light / Deep", value: fusionPreview.axes.value_L / 100, colorFrom: "#fef3c7", colorTo: "#78350f" },
                                { key: "chroma_C", label: "Clear / Soft", value: fusionPreview.axes.chroma_C / 120, colorFrom: "#e879f9", colorTo: "#94a3b8" },
                                { key: "contrast", label: "Contrast", value: fusionPreview.axes.contrast, colorFrom: "#1e1b4b", colorTo: "#e2e8f0" },
                            ].map((axis) => {
                                const normalizedValue = clamp01(axis.value);
                                return (
                                    <div key={axis.key}>
                                        <div className="mb-1 flex items-center justify-between text-xs font-black text-slate-600">
                                            <span>{axis.label}</span>
                                            <span>{Math.round(normalizedValue * 100)}%</span>
                                        </div>
                                        <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                                            <motion.div
                                                className="h-full rounded-full"
                                                style={{ background: `linear-gradient(90deg, ${axis.colorFrom}, ${axis.colorTo})` }}
                                                initial={{ width: 0 }}
                                                animate={{ width: `${Math.round(normalizedValue * 100)}%` }}
                                                transition={{ duration: 0.8, ease: "easeOut" }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Held colors */}
                        <div className="mt-3 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-2.5 sm:mt-3.5 sm:rounded-2xl sm:p-3">
                            <div className="text-xs font-black text-slate-900">保持している色</div>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {[
                                    { hex: colorPaletteInputs.selectedHex, label: "肌" },
                                    { hex: colorPaletteInputs.hairHex, label: "髪" },
                                    { hex: colorPaletteInputs.irisHex, label: "虹彩" },
                                ].map((swatch) => (
                                    <motion.div key={swatch.hex} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm" whileHover={{ scale: 1.05 }}>
                                        <div className="h-4 w-4 rounded-full border-2 border-white shadow-md" style={{ backgroundColor: swatch.hex }} />
                                        <div>
                                            <span className="text-[9px] font-bold text-slate-400 block">{swatch.label}</span>
                                            <span className="text-[11px] font-semibold text-slate-600">{swatch.hex}</span>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 6. Re-diagnosis button ── */}
            {hasUnifiedColorDiagnosis && fusionPreview && (
                <div className="rounded-2xl border border-slate-200/40 bg-slate-50/40 p-3 sm:p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <div className="text-xs font-black text-slate-900">再診断</div>
                            <div className="mt-0.5 text-xs text-slate-500">
                                実顔写真のセットアップからやり直して、統合診断を更新できます。
                            </div>
                        </div>
                        <GlassButton onClick={onBeginRediagnosis} variant="default" size="sm">
                            再診断する
                        </GlassButton>
                    </div>
                </div>
            )}

            {/* ── 7. Color save bar ── */}
            <div className="rounded-2xl border border-slate-200/50 bg-white/50 p-3 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                        <div className="text-xs font-black text-slate-900">カラー情報を保存</div>
                        {message && <div className="mt-1 text-xs text-emerald-600">{message}</div>}
                        {error && error !== "ログインが必要です" && <div className="mt-1 text-xs text-rose-600">{error}</div>}
                    </div>
                    <GlassButton onClick={onColorSave} loading={saving} disabled={!canSaveUnifiedColor} variant="gradient" size="sm">
                        {canSaveUnifiedColor ? "保存する" : "再診断完了後に保存"}
                    </GlassButton>
                </div>
            </div>

            {/* ── 8. Color setup section (moves to bottom after diagnosis) ── */}
            {!showSetupAtTop ? colorSetupSection : null}

        </motion.div>
    );
}
