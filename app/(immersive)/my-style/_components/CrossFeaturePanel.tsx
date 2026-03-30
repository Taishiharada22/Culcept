"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { SavedState } from "../_lib/types";

/* ── Types for bridge cross-feature data ── */

type PersonalColorData = {
    cpv: Record<string, number> | null;
    labels: Record<string, string> | null;
    palette: string[] | null;
};

type BodyProfileData = {
    cfv: Record<string, number> | null;
    displayLabels: Record<string, string> | null;
};

type StargazerData = {
    typeKey: string | null;
    dimensions: Record<string, number> | null;
};

type StargazerTypesData = {
    archetypeCode: string | null;
    archetypeLabel: string | null;
    axisScores: Record<string, number> | null;
};

export type CrossFeatureData = {
    personalColor: PersonalColorData | null;
    bodyProfile: BodyProfileData | null;
    stargazer: StargazerData | null;
    stargazerTypes: StargazerTypesData | null;
};

type PulseData = {
    pcSeason: string | null;
    pcBase: string | null;
    bodyType: string | null;
    bodySubtype: string | null;
};

/* ── Season / type labels ── */

const PC_SEASON_LABELS: Record<string, string> = {
    spring: "スプリング",
    summer: "サマー",
    autumn: "オータム",
    winter: "ウィンター",
};

const PC_BASE_LABELS: Record<string, string> = {
    warm: "イエローベース",
    cool: "ブルーベース",
    neutral: "ニュートラル",
};

const BODY_TYPE_LABELS: Record<string, string> = {
    straight: "ストレート",
    wave: "ウェーブ",
    natural: "ナチュラル",
};

// NOTE: archetypeLabel は API (my-style/bridge) から直接返却されるため、
// ここではフォールバック不要。表示は archetypeLabel をそのまま使う。

/* ── Color harmony analysis ── */

function hexToHsl(hex: string): [number, number, number] {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h = 0;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
    return [h * 360, s, l];
}

function isWarmColor(hex: string): boolean {
    const [h] = hexToHsl(hex);
    return (h >= 0 && h <= 60) || (h >= 300 && h <= 360);
}

function isCoolColor(hex: string): boolean {
    return !isWarmColor(hex);
}

function analyzeColorAlignment(
    wardrobeColors: Array<{ hex: string }>,
    pcBase: string | null,
): { aligned: number; total: number; verdict: string } {
    if (!pcBase || wardrobeColors.length === 0) return { aligned: 0, total: 0, verdict: "" };
    const isWarm = pcBase === "warm";
    const total = wardrobeColors.filter(c => c.hex && c.hex.length === 7).length;
    const aligned = wardrobeColors.filter(c => {
        if (!c.hex || c.hex.length !== 7) return false;
        return isWarm ? isWarmColor(c.hex) : isCoolColor(c.hex);
    }).length;
    const ratio = total > 0 ? aligned / total : 0;
    const verdict = ratio >= 0.7
        ? "パーソナルカラーとワードローブの色調和が高い"
        : ratio >= 0.4
            ? "ベースカラーとの一致は中程度 — 反対色がアクセントになっている"
            : "パーソナルカラーと異なるトーンが多い — 意図的なら個性の表現";
    return { aligned, total, verdict };
}

/* ── Personality → style mapping ── */

const PERSONALITY_STYLE_MAP: Record<string, { lanes: string[]; mood: string }> = {
    openness: { lanes: ["mode", "vintage", "techwear"], mood: "冒険的で独創的" },
    conscientiousness: { lanes: ["clean", "minimal", "trad"], mood: "構造的で精緻" },
    extraversion: { lanes: ["street", "sporty", "americancasual"], mood: "活動的で外向き" },
    agreeableness: { lanes: ["natural", "frenchcasual", "feminine"], mood: "柔和で調和的" },
    neuroticism: { lanes: ["elegant", "luxury", "conservative"], mood: "洗練と安定を求める" },
    analytical: { lanes: ["minimal", "techwear", "mode"], mood: "論理的で機能重視" },
    creative: { lanes: ["vintage", "mode", "street"], mood: "表現的で実験的" },
    empathetic: { lanes: ["natural", "frenchcasual", "elegant"], mood: "共感的で繊細" },
    decisive: { lanes: ["clean", "smart-casual", "trad"], mood: "決断力のある堂々たる" },
    adaptable: { lanes: ["smart-casual", "koreanclean", "officecasual"], mood: "柔軟で場に合わせる" },
    introspective: { lanes: ["minimal", "natural", "vintage"], mood: "内省的で静か" },
    visionary: { lanes: ["mode", "luxury", "techwear"], mood: "先見的で革新的" },
};

function derivePersonalityStyleInsights(
    dimensions: Record<string, number> | null,
    userLanes: string[],
): { resonances: string[]; tensions: string[] } {
    if (!dimensions) return { resonances: [], tensions: [] };
    const resonances: string[] = [];
    const tensions: string[] = [];

    const topDimensions = Object.entries(dimensions)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

    for (const [dim, score] of topDimensions) {
        const mapping = PERSONALITY_STYLE_MAP[dim];
        if (!mapping) continue;
        const overlap = mapping.lanes.filter(l => userLanes.includes(l));
        if (overlap.length > 0 && score > 0.6) {
            resonances.push(`${dim}の高さが ${overlap.join("・")} に自然に表れている`);
        } else if (overlap.length === 0 && score > 0.7) {
            tensions.push(`${dim}は強いのに、服には反映されていない — 潜在的なスタイル進化の余地`);
        }
    }

    return { resonances: resonances.slice(0, 3), tensions: tensions.slice(0, 2) };
}

/* ── Component ── */

export default function CrossFeaturePanel({
    state,
    crossFeature,
    pulse,
}: {
    state: SavedState;
    crossFeature: CrossFeatureData | null;
    pulse: PulseData | null;
}) {
    const [expanded, setExpanded] = useState<string | null>(null);

    if (!crossFeature && !pulse) return null;

    const hasPC = !!(pulse?.pcSeason || crossFeature?.personalColor?.cpv);
    const hasBody = !!(pulse?.bodyType || crossFeature?.bodyProfile?.cfv);
    const hasStargazer = !!(crossFeature?.stargazer?.typeKey || crossFeature?.stargazerTypes?.archetypeCode);
    const featureCount = [hasPC, hasBody, hasStargazer].filter(Boolean).length;

    if (featureCount === 0) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-200/60 bg-white/40 p-6 text-center">
                <p className="text-4xl">🔗</p>
                <p className="mt-3 text-sm font-bold text-slate-700">クロス機能ブリッジ</p>
                <p className="mt-1 text-xs text-slate-500">
                    パーソナルカラー診断・骨格診断・Stargazer性格分析の結果がここに統合されます
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                    {[
                        { label: "パーソナルカラー", href: "/body-color/avatar", icon: "🎨" },
                        { label: "骨格診断", href: "/body-color/avatar", icon: "🦴" },
                        { label: "Stargazer", href: "/stargazer", icon: "⭐" },
                    ].map(f => (
                        <a
                            key={f.label}
                            href={f.href}
                            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/60 bg-white/70 px-3 py-1.5 text-xs font-medium text-slate-600 no-underline transition hover:border-violet-300 hover:bg-violet-50/50 hover:text-violet-700"
                        >
                            <span>{f.icon}</span> {f.label}を診断
                        </a>
                    ))}
                </div>
            </div>
        );
    }

    // Wardrobe color analysis
    const wardrobeColors = state.wardrobe
        .filter(i => i.colorHex && i.colorHex.length === 7)
        .map(i => ({ hex: i.colorHex! }));
    const colorAlignment = analyzeColorAlignment(wardrobeColors, pulse?.pcBase ?? null);

    // Personality ↔ style
    const userLanes = state.styleSelections.map(s => s.laneCode);
    const personalityInsights = derivePersonalityStyleInsights(
        crossFeature?.stargazer?.dimensions ?? null,
        userLanes,
    );

    const toggle = (id: string) => setExpanded(prev => prev === id ? null : id);

    return (
        <div className="space-y-3">
            {/* Header */}
            <div className="flex items-center gap-2">
                <span className="text-lg">🔗</span>
                <div>
                    <h3 className="text-sm font-bold text-slate-800">クロス機能ブリッジ</h3>
                    <p className="text-[11px] text-slate-500">{featureCount}つの機能が接続中</p>
                </div>
            </div>

            {/* Personal Color section */}
            {hasPC ? (
                <section className="overflow-hidden rounded-xl border border-pink-200/40 bg-gradient-to-br from-pink-50/30 to-white/90">
                    <button
                        type="button"
                        onClick={() => toggle("pc")}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-pink-50/40"
                    >
                        <div className="flex items-center gap-2.5">
                            <span className="text-xl">🎨</span>
                            <div>
                                <div className="text-[13px] font-bold text-slate-800">パーソナルカラー × ワードローブ</div>
                                <div className="text-[11px] text-slate-500">
                                    {PC_SEASON_LABELS[pulse?.pcSeason ?? ""] ?? pulse?.pcSeason ?? "未診断"} /
                                    {" "}{PC_BASE_LABELS[pulse?.pcBase ?? ""] ?? pulse?.pcBase ?? ""}
                                </div>
                            </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`transition-transform ${expanded === "pc" ? "rotate-180" : ""}`}>
                            <path d="M3.5 5.25L7 8.75l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <AnimatePresence>
                        {expanded === "pc" ? (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-3 px-4 pb-4">
                                    {/* Color palette */}
                                    {crossFeature?.personalColor?.palette ? (
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-pink-400">ベストカラーパレット</div>
                                            <div className="mt-2 flex flex-wrap gap-1.5">
                                                {crossFeature.personalColor.palette.slice(0, 8).map((hex, i) => (
                                                    <div
                                                        key={`${hex}-${i}`}
                                                        className="h-7 w-7 rounded-lg border border-white/80 shadow-sm"
                                                        style={{ backgroundColor: hex }}
                                                        title={hex}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Alignment score */}
                                    {colorAlignment.total > 0 ? (
                                        <div className="rounded-lg bg-white/70 p-3">
                                            <div className="flex items-center justify-between">
                                                <span className="text-[11px] font-bold text-slate-600">色調和スコア</span>
                                                <span className="text-sm font-black text-pink-600">
                                                    {Math.round((colorAlignment.aligned / colorAlignment.total) * 100)}%
                                                </span>
                                            </div>
                                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-pink-100">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(colorAlignment.aligned / colorAlignment.total) * 100}%` }}
                                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                                    className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-500"
                                                />
                                            </div>
                                            <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                                                {colorAlignment.verdict}
                                            </p>
                                        </div>
                                    ) : null}

                                    {/* Labels */}
                                    {crossFeature?.personalColor?.labels ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(crossFeature.personalColor.labels).slice(0, 6).map(([key, val]) => (
                                                <span key={key} className="rounded-full bg-pink-100/60 px-2.5 py-0.5 text-[10px] font-medium text-pink-700">
                                                    {String(val)}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </section>
            ) : null}

            {/* Body type section */}
            {hasBody ? (
                <section className="overflow-hidden rounded-xl border border-blue-200/40 bg-gradient-to-br from-blue-50/30 to-white/90">
                    <button
                        type="button"
                        onClick={() => toggle("body")}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-blue-50/40"
                    >
                        <div className="flex items-center gap-2.5">
                            <span className="text-xl">🦴</span>
                            <div>
                                <div className="text-[13px] font-bold text-slate-800">骨格タイプ × シルエット</div>
                                <div className="text-[11px] text-slate-500">
                                    {BODY_TYPE_LABELS[pulse?.bodyType ?? ""] ?? pulse?.bodyType ?? "未診断"}
                                    {pulse?.bodySubtype ? ` — ${pulse.bodySubtype}` : ""}
                                </div>
                            </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`transition-transform ${expanded === "body" ? "rotate-180" : ""}`}>
                            <path d="M3.5 5.25L7 8.75l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <AnimatePresence>
                        {expanded === "body" ? (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-3 px-4 pb-4">
                                    {/* Body → silhouette recommendation */}
                                    <div className="rounded-lg bg-white/70 p-3">
                                        <div className="text-[10px] font-bold uppercase tracking-widest text-blue-400">骨格からの推奨シルエット</div>
                                        <div className="mt-2 space-y-1.5">
                                            {pulse?.bodyType === "straight" ? (
                                                <>
                                                    <p className="text-[12px] text-slate-700">ストレート体型 → <strong>ジャストサイズ・Iライン</strong>が最適</p>
                                                    <p className="text-[11px] text-slate-500">ハリのある素材、直線的なシルエットで骨格の強さを活かす</p>
                                                </>
                                            ) : pulse?.bodyType === "wave" ? (
                                                <>
                                                    <p className="text-[12px] text-slate-700">ウェーブ体型 → <strong>ハイウエスト・コンパクト</strong>が最適</p>
                                                    <p className="text-[11px] text-slate-500">柔らかい素材、曲線を活かしたフィットでバランスを取る</p>
                                                </>
                                            ) : pulse?.bodyType === "natural" ? (
                                                <>
                                                    <p className="text-[12px] text-slate-700">ナチュラル体型 → <strong>リラックスフィット・オーバーサイズ</strong>が最適</p>
                                                    <p className="text-[11px] text-slate-500">ざっくりとした素材、ゆるやかなシルエットで骨格のフレームを活かす</p>
                                                </>
                                            ) : (
                                                <p className="text-[12px] text-slate-500">骨格タイプに基づくシルエット提案</p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Display labels from diagnosis */}
                                    {crossFeature?.bodyProfile?.displayLabels ? (
                                        <div className="flex flex-wrap gap-1.5">
                                            {Object.entries(crossFeature.bodyProfile.displayLabels).slice(0, 6).map(([key, val]) => (
                                                <span key={key} className="rounded-full bg-blue-100/60 px-2.5 py-0.5 text-[10px] font-medium text-blue-700">
                                                    {String(val)}
                                                </span>
                                            ))}
                                        </div>
                                    ) : null}
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </section>
            ) : null}

            {/* Stargazer personality section */}
            {hasStargazer ? (
                <section className="overflow-hidden rounded-xl border border-violet-200/40 bg-gradient-to-br from-violet-50/30 to-white/90">
                    <button
                        type="button"
                        onClick={() => toggle("stargazer")}
                        className="flex w-full items-center justify-between px-4 py-3 text-left transition hover:bg-violet-50/40"
                    >
                        <div className="flex items-center gap-2.5">
                            <span className="text-xl">⭐</span>
                            <div>
                                <div className="text-[13px] font-bold text-slate-800">Stargazer性格 × スタイル傾向</div>
                                <div className="text-[11px] text-slate-500">
                                    {crossFeature?.stargazerTypes?.archetypeCode
                                        ? crossFeature?.stargazerTypes?.archetypeLabel ?? crossFeature?.stargazerTypes?.archetypeCode
                                        : crossFeature?.stargazer?.typeKey ?? "性格分析済み"}
                                </div>
                            </div>
                        </div>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={`transition-transform ${expanded === "stargazer" ? "rotate-180" : ""}`}>
                            <path d="M3.5 5.25L7 8.75l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                    </button>
                    <AnimatePresence>
                        {expanded === "stargazer" ? (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: "auto", opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                            >
                                <div className="space-y-3 px-4 pb-4">
                                    {/* Personality ↔ style resonances */}
                                    {personalityInsights.resonances.length > 0 ? (
                                        <div className="rounded-lg bg-white/70 p-3">
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">共鳴ポイント</div>
                                            <div className="mt-2 space-y-1.5">
                                                {personalityInsights.resonances.map((r, i) => (
                                                    <p key={i} className="text-[12px] leading-relaxed text-slate-700">✦ {r}</p>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Tensions / growth areas */}
                                    {personalityInsights.tensions.length > 0 ? (
                                        <div className="rounded-lg bg-white/70 p-3">
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-amber-500">進化の余地</div>
                                            <div className="mt-2 space-y-1.5">
                                                {personalityInsights.tensions.map((t, i) => (
                                                    <p key={i} className="text-[12px] leading-relaxed text-slate-600">△ {t}</p>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Top personality dimensions */}
                                    {crossFeature?.stargazer?.dimensions ? (
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-widest text-violet-400">性格軸 上位</div>
                                            <div className="mt-2 space-y-1.5">
                                                {Object.entries(crossFeature.stargazer.dimensions)
                                                    .sort(([, a], [, b]) => b - a)
                                                    .slice(0, 4)
                                                    .map(([key, value]) => (
                                                        <div key={key} className="flex items-center gap-2">
                                                            <span className="min-w-[80px] text-[11px] font-medium text-slate-600">{key}</span>
                                                            <div className="flex-1 h-1.5 rounded-full bg-violet-100 overflow-hidden">
                                                                <motion.div
                                                                    initial={{ width: 0 }}
                                                                    animate={{ width: `${Math.min(value * 100, 100)}%` }}
                                                                    transition={{ duration: 0.6, ease: "easeOut" }}
                                                                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-purple-500"
                                                                />
                                                            </div>
                                                            <span className="text-[10px] font-bold text-violet-600">{Math.round(value * 100)}</span>
                                                        </div>
                                                    ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            </motion.div>
                        ) : null}
                    </AnimatePresence>
                </section>
            ) : null}

            {/* Integration insight */}
            {featureCount >= 2 ? (
                <div className="rounded-xl bg-gradient-to-r from-violet-50/50 via-pink-50/50 to-blue-50/50 p-3.5 border border-violet-200/20">
                    <div className="text-[10px] font-bold uppercase tracking-widest text-violet-500">統合インサイト</div>
                    <p className="mt-1.5 text-[12px] leading-relaxed text-slate-700">
                        {hasPC && hasBody
                            ? `${PC_SEASON_LABELS[pulse?.pcSeason ?? ""] ?? "あなた"}の色特性と${BODY_TYPE_LABELS[pulse?.bodyType ?? ""] ?? "骨格"}のシルエットが交差する地点に、最も自然なスタイルの核がある`
                            : hasPC && hasStargazer
                                ? "色の傾向と内面の性格が呼応するスタイルレーンが、あなたの最も自然な表現軸"
                                : hasBody && hasStargazer
                                    ? "骨格が得意とするシルエットと性格の方向性が重なるとき、服は最も自然に見える"
                                    : "複数の機能データが統合されることで、より深いスタイル理解が可能に"}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
