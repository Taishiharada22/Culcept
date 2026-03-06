"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
    LightBackground,
    GlassNavbar,
    GlassCard,
    GlassBadge,
    FloatingNavLight,
    FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
    buildPresenceSummary,
    buildIAmMirror,
    buildISeekRelations,
    buildPerceptionGap,
    buildGrowthVector,
    buildPresenceAura,
    buildImpressionEvolution,
    buildPersonalityRadar,
    buildStrengthAnalysis,
    buildPotentialMap,
    buildCompanionVoice,
    buildGenomeSummary,
    toPresenceInput,
    DEMO_DATA,
} from "./_lib/presenceInterpret";
import type {
    PresenceSummary,
    IAmMirrorResult,
    ISeekRelationsResult,
    PerceptionGap,
    GrowthVector,
    PresenceAura,
    ImpressionEvolution,
    PersonalityRadar,
    StrengthAnalysis,
    PotentialMap,
    CompanionVoice,
    GenomeSummary,
} from "./_lib/presenceInterpret";

/* ════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════ */

type SeekBlock = {
    hard_include: string[];
    soft_include: string[];
    hard_exclude: string[];
    soft_exclude: string[];
    handshake_rules: string[];
};
type IAm = {
    lanes: string[];
    likes: string[];
    avoid: string[];
    silhouette_pref: string | null;
    material_pref: string | null;
    tags: string[];
};
type TasteLayer = Record<string, number>;
type StyleDna = {
    body_type: string | null;
    body_subtype: string | null;
    pc_season: string | null;
    pc_base: string | null;
    top_lanes: string[];
    style_score: number;
};
type SeekResponse = {
    ok?: boolean;
    enabled?: boolean;
    seek?: {
        seek_people: SeekBlock;
        seek_market: SeekBlock;
        is_public: boolean;
        handshake_people: string[];
        handshake_market: string[];
        updated_at: string | null;
    };
    i_am?: IAm;
    taste_layers?: {
        layer_7d: TasteLayer;
        layer_30d: TasteLayer;
        layer_180d: TasteLayer;
        updated_at: string | null;
    };
    style_dna?: StyleDna;
};

type MatchCandidate = {
    id: string;
    name: string;
    avatar_url: string | null;
    score: number;
    people_fit_to_me: number;
    people_fit_to_them: number;
    lane_tags: string[];
    reasons: {
        people_fit_to_me: { line: string };
        people_fit_to_them: { line: string };
    };
};

/* ════════════════════════════════════════════════════════
   Constants
   ════════════════════════════════════════════════════════ */

const NAV_ITEMS = [
    { href: "/", label: "ホーム", icon: <span>🏠</span> },
    { href: "/sns/trends/v2", label: "Pulse+", icon: <span>🔥</span> },
    { href: "/match", label: "Match", icon: <span>💫</span> },
    { href: "/sns/profile", label: "Presence", icon: <span>🪞</span>, active: true },
    { href: "/my", label: "マイ", icon: <span>⚙️</span> },
];

type Tab = "presence" | "i_am" | "i_seek";

const LANE_COLORS: Record<string, string> = {
    minimal: "from-slate-600 to-slate-800",
    street: "from-orange-500 to-red-500",
    vintage: "from-amber-500 to-yellow-600",
    sporty: "from-green-500 to-emerald-600",
    luxury: "from-purple-500 to-pink-500",
    daily: "from-blue-500 to-cyan-500",
    elegant: "from-rose-400 to-pink-500",
    workwear: "from-amber-700 to-yellow-700",
    outdoor: "from-lime-600 to-green-700",
};

const LANE_ICONS: Record<string, string> = {
    minimal: "▫️", street: "🧢", vintage: "🎸", sporty: "🏃",
    luxury: "💎", daily: "👕", elegant: "✨", workwear: "🔧", outdoor: "🏕️",
};

const BODY_TYPE_MAP: Record<string, { icon: string; label: string }> = {
    straight: { icon: "📐", label: "ストレート" },
    wave: { icon: "🌊", label: "ウェーブ" },
    natural: { icon: "🌿", label: "ナチュラル" },
};

const PC_SEASON_MAP: Record<string, { icon: string; label: string }> = {
    spring: { icon: "🌸", label: "Spring" },
    summer: { icon: "🌊", label: "Summer" },
    autumn: { icon: "🍂", label: "Autumn" },
    winter: { icon: "❄️", label: "Winter" },
};

/* ════════════════════════════════════════════════════════
   Sub Components
   ════════════════════════════════════════════════════════ */

/* ─── Aura Ring ─── */
function AuraRing({ aura }: { aura: PresenceAura }) {
    return (
        <div className="relative mx-auto flex h-28 w-28 items-center justify-center">
            {/* Animated gradient ring */}
            <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                    background: `conic-gradient(from 0deg, ${aura.primaryColor}, ${aura.secondaryColor}, ${aura.primaryColor})`,
                    opacity: 0.25,
                }}
                animate={{ rotate: 360 }}
                transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
            />
            <motion.div
                className="absolute inset-1.5 rounded-full"
                style={{
                    background: `conic-gradient(from 180deg, ${aura.primaryColor}60, ${aura.secondaryColor}80, ${aura.primaryColor}60)`,
                }}
                animate={{ rotate: -360 }}
                transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            />
            {/* Inner content */}
            <div className="relative z-10 flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white/90 backdrop-blur-sm">
                <motion.span
                    className="text-lg font-black"
                    style={{ color: aura.primaryColor }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.5 }}
                >
                    {aura.keyword}
                </motion.span>
                <span className="text-[9px] font-bold text-slate-400">AURA</span>
            </div>
            {/* Pulse effect */}
            <motion.div
                className="absolute inset-0 rounded-full"
                style={{ border: `2px solid ${aura.primaryColor}30` }}
                animate={{ scale: [1, 1.15, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 3, repeat: Infinity }}
            />
        </div>
    );
}

/* ─── Perception Gap Visual ─── */
function PerceptionGapCard({ gap }: { gap: PerceptionGap }) {
    if (gap.gapLevel === 0) return null;
    return (
        <GlassCard className="overflow-hidden p-0">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400/5 via-transparent to-rose-400/5" />
            <div className="relative p-5">
                <div className="mb-4 flex items-center gap-2">
                    <span className="text-base">🔍</span>
                    <span className="text-xs font-black text-slate-900">認知ギャップ</span>
                    <span className="text-[10px] text-slate-400">自分が思う自分 vs 他者から見た自分</span>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 p-3">
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-indigo-400">
                            自分が思う自分
                        </div>
                        <p className="text-[12px] font-bold leading-relaxed text-indigo-800">
                            {gap.selfImage}
                        </p>
                    </div>
                    <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-3">
                        <div className="mb-1 text-[9px] font-bold uppercase tracking-wide text-violet-400">
                            他者から見た自分
                        </div>
                        <p className="text-[12px] font-bold leading-relaxed text-violet-800">
                            {gap.othersImage}
                        </p>
                    </div>
                </div>

                {/* Gap bar */}
                <div className="mb-3">
                    <div className="mb-1 flex items-center justify-between">
                        <span className="text-[9px] font-bold text-slate-400">ギャップ度</span>
                        <span className="text-[10px] font-black text-amber-600">{gap.gapLevel}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <motion.div
                            className="h-full rounded-full bg-gradient-to-r from-amber-400 to-rose-400"
                            initial={{ width: 0 }}
                            animate={{ width: `${gap.gapLevel}%` }}
                            transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                        />
                    </div>
                </div>

                <p className="text-[12px] leading-[1.8] text-slate-600">{gap.gapInsight}</p>

                {gap.gapLevel >= 40 && (
                    <div className="mt-3 flex items-center gap-2 rounded-lg border border-amber-100 bg-amber-50/50 px-3 py-2">
                        <span className="text-xs">💡</span>
                        <span className="text-[10px] text-amber-800">ギャップが大きい = 未知の魅力がある証拠。プロフィールを充実させてギャップを縮めよう</span>
                    </div>
                )}
            </div>
        </GlassCard>
    );
}

/* ─── Growth Vector Card ─── */
function GrowthVectorCard({ growth }: { growth: GrowthVector }) {
    return (
        <GlassCard className="overflow-hidden p-0">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 via-transparent to-cyan-400/5" />
            <div className="relative p-5">
                <div className="mb-4 flex items-center gap-2">
                    <span className="text-base">🌱</span>
                    <span className="text-xs font-black text-slate-900">成長ベクトル</span>
                    <span className="text-[10px] text-slate-400">次に開ける扉</span>
                </div>
                <div className="space-y-3">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                        <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-sm">💎</span>
                            <span className="text-[10px] font-black text-emerald-700">今の強み</span>
                        </div>
                        <p className="text-[12px] leading-[1.8] text-emerald-800">{growth.currentStrength}</p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                        <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-sm">🔮</span>
                            <span className="text-[10px] font-black text-amber-700">気づいていない可能性</span>
                        </div>
                        <p className="text-[12px] leading-[1.8] text-amber-800">{growth.blindSpot}</p>
                    </div>
                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/50 p-3">
                        <div className="mb-1 flex items-center gap-1.5">
                            <span className="text-sm">🚀</span>
                            <span className="text-[10px] font-black text-cyan-700">次のステップ</span>
                        </div>
                        <p className="text-[12px] leading-[1.8] text-cyan-800">{growth.nextStep}</p>
                    </div>
                </div>
            </div>
        </GlassCard>
    );
}

/* ─── Impression Evolution Card ─── */
function ImpressionEvolutionCard({ evolution }: { evolution: ImpressionEvolution }) {
    const TREND_META: Record<string, { icon: string; label: string; color: string }> = {
        deepening: { icon: "⬇️", label: "深化中", color: "text-indigo-600" },
        shifting: { icon: "↗️", label: "変化の兆し", color: "text-amber-600" },
        stable: { icon: "➡️", label: "安定", color: "text-emerald-600" },
        emerging: { icon: "🌅", label: "形成中", color: "text-violet-600" },
    };
    const meta = TREND_META[evolution.trend] ?? TREND_META.emerging;

    const TimelineRow = ({ label, color, items }: { label: string; color: string; items: { keyword: string; signal: string }[] }) => (
        <div className="flex items-start gap-3">
            <div className="flex w-12 shrink-0 flex-col items-center pt-1">
                <div className={`h-2.5 w-2.5 rounded-full ${color}`} />
                <div className="h-full w-px bg-slate-200" />
            </div>
            <div className="min-w-0 flex-1 pb-3">
                <div className="mb-1 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="flex flex-wrap gap-1">
                    {items.map((it) => (
                        <span key={it.keyword} className="inline-flex items-center rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] font-bold text-slate-600" title={it.signal}>
                            {it.keyword}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <GlassCard className="overflow-hidden p-0">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-400/5 via-transparent to-indigo-400/5" />
            <div className="relative p-5">
                <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-base">📊</span>
                        <span className="text-xs font-black text-slate-900">印象の変遷</span>
                    </div>
                    <span className={`rounded-full border border-slate-200 bg-white/80 px-2 py-0.5 text-[10px] font-black ${meta.color}`}>
                        {meta.icon} {meta.label}
                    </span>
                </div>

                <div className="mb-4">
                    {evolution.recent.length > 0 && <TimelineRow label="直近7日" color="bg-indigo-500" items={evolution.recent} />}
                    {evolution.medium.length > 0 && <TimelineRow label="30日" color="bg-violet-400" items={evolution.medium} />}
                    {evolution.longTerm.length > 0 && <TimelineRow label="180日" color="bg-slate-300" items={evolution.longTerm} />}
                </div>

                <p className="text-[12px] leading-[1.8] text-slate-600">{evolution.narrative}</p>
            </div>
        </GlassCard>
    );
}

/* ─── Presence Radar Chart (8軸パーソナリティ) ─── */
function PresenceRadarChart({ radar }: { radar: PersonalityRadar }) {
    const size = 300;
    const center = size / 2;
    const maxRadius = 110;
    const axisCount = radar.dimensions.length;
    const angleStep = (Math.PI * 2) / axisCount;

    const gridLevels = [25, 50, 75, 100];

    const getPoint = (angle: number, radius: number) => ({
        x: center + radius * Math.cos(angle - Math.PI / 2),
        y: center + radius * Math.sin(angle - Math.PI / 2),
    });

    const scorePoints = radar.dimensions.map((d, i) => {
        const r = (d.score / 100) * maxRadius;
        return getPoint(i * angleStep, r);
    });
    const polygonPoints = scorePoints.map((p) => `${p.x},${p.y}`).join(" ");

    const AXIS_COLORS = ["#6366f1", "#8b5cf6", "#a855f7", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#22c55e"];

    return (
        <GlassCard className="overflow-hidden p-0 ring-1 ring-indigo-100/50">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/5 via-transparent to-violet-400/5" />
            <div className="relative p-5 lg:p-6">
                <div className="mb-4 flex items-center gap-2">
                    <span className="text-lg">🧬</span>
                    <span className="text-sm font-black text-slate-900 lg:text-base">パーソナリティ・レーダー</span>
                    <span className="text-[10px] text-slate-400 lg:text-[11px]">8軸で見るあなたの人物像</span>
                </div>

                <div className="flex justify-center">
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="lg:h-[340px] lg:w-[340px]">
                        <defs>
                            <linearGradient id="presence-radar-fill" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#6366f1" stopOpacity="0.12" />
                                <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.08" />
                                <stop offset="100%" stopColor="#ec4899" stopOpacity="0.12" />
                            </linearGradient>
                            <linearGradient id="presence-radar-stroke" x1="0" y1="0" x2="1" y2="1">
                                <stop offset="0%" stopColor="#6366f1" />
                                <stop offset="50%" stopColor="#a855f7" />
                                <stop offset="100%" stopColor="#ec4899" />
                            </linearGradient>
                        </defs>

                        {/* Grid polygons */}
                        {gridLevels.map((level) => {
                            const r = (level / 100) * maxRadius;
                            const pts = Array.from({ length: axisCount }, (_, i) => {
                                const p = getPoint(i * angleStep, r);
                                return `${p.x},${p.y}`;
                            }).join(" ");
                            return <polygon key={level} points={pts} fill="none" stroke="#e2e8f0" strokeWidth="0.8" />;
                        })}

                        {/* Axis lines */}
                        {radar.dimensions.map((_, i) => {
                            const end = getPoint(i * angleStep, maxRadius);
                            return <line key={i} x1={center} y1={center} x2={end.x} y2={end.y} stroke="#e2e8f0" strokeWidth="0.8" />;
                        })}

                        {/* Score polygon */}
                        <motion.polygon
                            points={polygonPoints}
                            fill="url(#presence-radar-fill)"
                            stroke="url(#presence-radar-stroke)"
                            strokeWidth="2.5"
                            initial={{ opacity: 0, scale: 0 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.8, delay: 0.2, type: "spring", stiffness: 100 }}
                            style={{ transformOrigin: `${center}px ${center}px` }}
                        />

                        {/* Score points */}
                        {scorePoints.map((p, i) => (
                            <motion.circle
                                key={i}
                                cx={p.x}
                                cy={p.y}
                                r="4.5"
                                fill={AXIS_COLORS[i % AXIS_COLORS.length]}
                                stroke="white"
                                strokeWidth="2"
                                initial={{ opacity: 0, scale: 0 }}
                                animate={{ opacity: 1, scale: 1 }}
                                transition={{ duration: 0.4, delay: 0.5 + i * 0.06 }}
                            />
                        ))}

                        {/* Labels + scores */}
                        {radar.dimensions.map((d, i) => {
                            const labelR = maxRadius + 28;
                            const p = getPoint(i * angleStep, labelR);
                            return (
                                <g key={i}>
                                    <text x={p.x} y={p.y - 6} textAnchor="middle" dominantBaseline="middle" fill="#475569" fontSize="10" fontWeight="700">
                                        {d.axis}
                                    </text>
                                    <text x={p.x} y={p.y + 8} textAnchor="middle" dominantBaseline="middle" fill={AXIS_COLORS[i % AXIS_COLORS.length]} fontSize="12" fontWeight="800">
                                        {d.score}
                                    </text>
                                </g>
                            );
                        })}
                    </svg>
                </div>

                <p className="mt-3 text-center text-[12px] leading-[1.8] text-slate-600">{radar.overallShape}</p>

                {/* Action hints for low dimensions */}
                {radar.dimensions.filter((d) => d.actionHint).length > 0 && (
                    <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                        <div className="mb-2 text-[9px] font-black uppercase tracking-wide text-amber-600">伸ばせるポイント</div>
                        <div className="space-y-1.5">
                            {radar.dimensions.filter((d) => d.actionHint).slice(0, 3).map((d) => (
                                <div key={d.axis} className="flex items-start gap-2">
                                    <span className="mt-0.5 text-[10px] text-amber-400">▸</span>
                                    <div>
                                        <span className="text-[10px] font-bold text-amber-700">{d.axis}</span>
                                        <span className="ml-1 text-[10px] text-amber-600">({d.score})</span>
                                        <span className="ml-1 text-[10px] text-amber-800">→ {d.actionHint}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </GlassCard>
    );
}

/* ─── Strength Analysis Card (強み・弱み分析) ─── */
function StrengthAnalysisCard({ analysis }: { analysis: StrengthAnalysis }) {
    const GRADE_COLORS: Record<string, { bg: string; text: string; bar: string }> = {
        S: { bg: "bg-gradient-to-r from-amber-400 to-yellow-400", text: "text-amber-900", bar: "from-amber-400 to-yellow-400" },
        A: { bg: "bg-gradient-to-r from-indigo-500 to-violet-500", text: "text-white", bar: "from-indigo-500 to-violet-500" },
        B: { bg: "bg-gradient-to-r from-blue-400 to-cyan-400", text: "text-white", bar: "from-blue-400 to-cyan-400" },
        C: { bg: "bg-gradient-to-r from-slate-300 to-slate-400", text: "text-white", bar: "from-slate-400 to-slate-500" },
        D: { bg: "bg-gradient-to-r from-slate-200 to-slate-300", text: "text-slate-600", bar: "from-slate-300 to-slate-400" },
    };

    return (
        <GlassCard className="overflow-hidden p-0">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-400/5 via-transparent to-amber-400/5" />
            <div className="relative p-5">
                <div className="mb-4 flex items-center gap-2">
                    <span className="text-base">📊</span>
                    <span className="text-xs font-black text-slate-900">強み・弱み分析</span>
                    <span className="text-[10px] text-slate-400">客観的な力の分布</span>
                </div>

                <div className="space-y-3">
                    {analysis.axes.map((axis, i) => {
                        const gc = GRADE_COLORS[axis.grade] ?? GRADE_COLORS.C;
                        return (
                            <motion.div
                                key={axis.label}
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.08 }}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm">{axis.icon}</span>
                                    <span className="text-[11px] font-black text-slate-700">{axis.label}</span>
                                    <span className={`ml-auto flex h-5 w-5 items-center justify-center rounded-md text-[9px] font-black ${gc.bg} ${gc.text}`}>
                                        {axis.grade}
                                    </span>
                                </div>
                                <div className="mb-1 flex items-center gap-2">
                                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                        <motion.div
                                            className={`h-full rounded-full bg-gradient-to-r ${gc.bar}`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${axis.score}%` }}
                                            transition={{ duration: 0.8, delay: 0.2 + i * 0.08, ease: "easeOut" }}
                                        />
                                    </div>
                                    <span className="w-8 text-right text-[10px] font-black text-slate-600">{axis.score}</span>
                                </div>
                                <p className="text-[10px] leading-[1.6] text-slate-500">{axis.insight}</p>
                                {axis.actionHint && (
                                    <div className="mt-1 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1">
                                        <span className="text-[9px] text-amber-400">💡</span>
                                        <span className="text-[9px] font-medium text-amber-700">{axis.actionHint}</span>
                                    </div>
                                )}
                            </motion.div>
                        );
                    })}
                </div>

                <div className="mt-4 space-y-2 border-t border-slate-100 pt-3">
                    <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3">
                        <div className="mb-1 text-[9px] font-black uppercase tracking-wide text-emerald-600">最大の武器</div>
                        <p className="text-[11px] leading-[1.7] text-emerald-800">{analysis.topStrength}</p>
                    </div>
                    <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3">
                        <div className="mb-1 text-[9px] font-black uppercase tracking-wide text-amber-600">成長の余白</div>
                        <p className="text-[11px] leading-[1.7] text-amber-800">{analysis.topGrowthArea}</p>
                    </div>
                    <Link href="/wardrobe-diagnosis" className="block no-underline">
                        <div className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-2.5 text-white shadow-sm transition hover:shadow-md">
                            <span className="text-xs">🧬</span>
                            <span className="text-[11px] font-black">診断で深掘りする</span>
                            <span className="text-[10px]">→</span>
                        </div>
                    </Link>
                </div>
            </div>
        </GlassCard>
    );
}

/* ─── Potential Map Card ─── */
function PotentialMapCard({ potentialMap }: { potentialMap: PotentialMap }) {
    const FIT_COLORS: { threshold: number; bg: string; border: string; text: string }[] = [
        { threshold: 70, bg: "bg-gradient-to-br from-indigo-50 to-violet-50", border: "border-indigo-200", text: "text-indigo-700" },
        { threshold: 50, bg: "bg-gradient-to-br from-blue-50 to-cyan-50", border: "border-blue-200", text: "text-blue-700" },
        { threshold: 30, bg: "bg-gradient-to-br from-slate-50 to-gray-50", border: "border-slate-200", text: "text-slate-600" },
        { threshold: 0, bg: "bg-white/60", border: "border-slate-100", text: "text-slate-500" },
    ];

    const getColors = (fit: number) => FIT_COLORS.find((c) => fit >= c.threshold) ?? FIT_COLORS[FIT_COLORS.length - 1];

    return (
        <GlassCard className="overflow-hidden p-0">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-400/5 via-transparent to-rose-400/5" />
            <div className="relative p-5">
                <div className="mb-4 flex items-center gap-2">
                    <span className="text-base">🗺️</span>
                    <span className="text-xs font-black text-slate-900">ポテンシャルマップ</span>
                    <span className="text-[10px] text-slate-400">あなたが力を発揮できる場</span>
                </div>

                <div className="space-y-2">
                    {potentialMap.thriveIn.map((field, i) => {
                        const colors = getColors(field.fit);
                        return (
                            <motion.div
                                key={field.field}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className={`rounded-xl border ${colors.border} ${colors.bg} p-3`}
                            >
                                <div className="mb-1 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="text-lg">{field.icon}</span>
                                        <span className={`text-[12px] font-black ${colors.text}`}>{field.field}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <div className="h-1.5 w-12 overflow-hidden rounded-full bg-slate-200">
                                            <motion.div
                                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${field.fit}%` }}
                                                transition={{ duration: 0.6, delay: 0.3 + i * 0.1 }}
                                            />
                                        </div>
                                        <span className="text-[10px] font-black text-indigo-600">{field.fit}%</span>
                                    </div>
                                </div>
                                <p className="text-[10px] leading-[1.6] text-slate-600">{field.reason}</p>
                            </motion.div>
                        );
                    })}
                </div>

                <div className="mt-4 rounded-xl border border-violet-100 bg-violet-50/30 p-3">
                    <p className="text-[11px] leading-[1.8] text-violet-800">{potentialMap.coreMessage}</p>
                </div>
                <Link href="/style-drive" className="block no-underline">
                    <div className="mt-3 flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-violet-700 transition hover:bg-violet-100">
                        <span className="text-xs">🚀</span>
                        <span className="text-[11px] font-bold">ポテンシャルを活かすDriveへ</span>
                    </div>
                </Link>
            </div>
        </GlassCard>
    );
}

/* ─── Companion Voice Card ─── */
function CompanionVoiceCard({ companion }: { companion: CompanionVoice }) {
    const CATEGORY_STYLE: Record<string, { border: string; bg: string; titleColor: string }> = {
        strength: { border: "border-emerald-200", bg: "from-emerald-50/50 to-teal-50/30", titleColor: "text-emerald-700" },
        encouragement: { border: "border-indigo-200", bg: "from-indigo-50/50 to-violet-50/30", titleColor: "text-indigo-700" },
        warning: { border: "border-amber-200", bg: "from-amber-50/50 to-yellow-50/30", titleColor: "text-amber-700" },
        direction: { border: "border-cyan-200", bg: "from-cyan-50/50 to-blue-50/30", titleColor: "text-cyan-700" },
    };

    return (
        <GlassCard className="overflow-hidden p-0">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/8 via-transparent to-violet-400/8" />
            <div className="relative p-5">
                {/* Header */}
                <div className="mb-4 flex items-center gap-3">
                    <motion.div
                        className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-500 shadow-lg"
                        animate={{ scale: [1, 1.05, 1] }}
                        transition={{ duration: 3, repeat: Infinity }}
                    >
                        <span className="text-xl text-white">🤍</span>
                    </motion.div>
                    <div>
                        <div className="text-sm font-black text-slate-900">Companion Voice</div>
                        <div className="text-[10px] text-slate-400">あなたを知る存在からの言葉</div>
                    </div>
                </div>

                {/* Greeting */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    className="mb-4 rounded-2xl border border-slate-200 bg-white/80 p-4"
                >
                    <p className="text-[13px] font-bold leading-[1.9] text-slate-800">{companion.greeting}</p>
                </motion.div>

                {/* Deep Understanding */}
                <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mb-4 rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50/50 to-indigo-50/30 p-4"
                >
                    <div className="mb-2 text-[9px] font-black uppercase tracking-wide text-violet-500">あなたについて分かっていること</div>
                    <p className="text-[12px] leading-[1.9] text-violet-800">{companion.deepUnderstanding}</p>
                </motion.div>

                {/* Messages */}
                <div className="space-y-3">
                    {companion.messages.map((msg, i) => {
                        const style = CATEGORY_STYLE[msg.category] ?? CATEGORY_STYLE.strength;
                        return (
                            <motion.div
                                key={msg.title}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.4 + i * 0.1 }}
                                className={`rounded-2xl border ${style.border} bg-gradient-to-br ${style.bg} p-4`}
                            >
                                <div className="mb-2 flex items-center gap-2">
                                    <span className="text-base">{msg.icon}</span>
                                    <span className={`text-[11px] font-black ${style.titleColor}`}>{msg.title}</span>
                                </div>
                                <p className="text-[11px] leading-[1.9] text-slate-700">{msg.message}</p>
                            </motion.div>
                        );
                    })}
                </div>

                {/* Closing */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.8 }}
                    className="mt-4 border-t border-slate-100 pt-4"
                >
                    <p className="text-center text-[12px] font-bold italic leading-[1.8] text-slate-500">&ldquo;{companion.closingWords}&rdquo;</p>
                </motion.div>
            </div>
        </GlassCard>
    );
}

/* ─── Genome Summary Card (結論カード) ─── */
function GenomeSummaryCard({ genome, compact = false }: { genome: GenomeSummary; compact?: boolean }) {
    const STATUS_STYLES: Record<string, { ring: string; badge: string; glow: string }> = {
        high: { ring: "from-emerald-400 to-teal-400", badge: "bg-emerald-50 border-emerald-200 text-emerald-700", glow: "shadow-emerald-200/40" },
        mid: { ring: "from-indigo-400 to-violet-500", badge: "bg-indigo-50 border-indigo-200 text-indigo-700", glow: "shadow-indigo-200/40" },
        forming: { ring: "from-amber-400 to-yellow-400", badge: "bg-amber-50 border-amber-200 text-amber-700", glow: "shadow-amber-200/40" },
        collecting: { ring: "from-slate-300 to-slate-400", badge: "bg-slate-50 border-slate-200 text-slate-500", glow: "shadow-slate-200/40" },
    };
    const st = STATUS_STYLES[genome.statusLevel] ?? STATUS_STYLES.collecting;

    if (compact) {
        return (
            <GlassCard className="overflow-hidden p-0">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/5 via-transparent to-violet-400/5" />
                <div className="relative p-4">
                    <div className="mb-3 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Genome</span>
                        <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${st.badge}`}>{genome.statusLabel}</span>
                    </div>
                    <div className="mb-3 flex items-center gap-3">
                        <div className="relative h-12 w-12 shrink-0">
                            <svg viewBox="0 0 48 48" className="h-full w-full -rotate-90">
                                <circle cx="24" cy="24" r="20" fill="none" stroke="#e2e8f0" strokeWidth="4" />
                                <motion.circle
                                    cx="24" cy="24" r="20" fill="none"
                                    className={`stroke-current`}
                                    style={{ color: genome.completionPct >= 60 ? "#6366f1" : "#f59e0b" }}
                                    strokeWidth="4" strokeLinecap="round"
                                    strokeDasharray={`${2 * Math.PI * 20}`}
                                    initial={{ strokeDashoffset: 2 * Math.PI * 20 }}
                                    animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - genome.completionPct / 100) }}
                                    transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
                                />
                            </svg>
                            <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-slate-800">{genome.completionPct}%</span>
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                                <span className="text-[9px] font-bold text-emerald-600">強み</span>
                                {genome.strongAxes.map((a) => (
                                    <span key={a.axis} className="rounded bg-emerald-50 px-1.5 py-px text-[9px] font-black text-emerald-700">{a.axis}</span>
                                ))}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5">
                                <span className="text-[9px] font-bold text-amber-600">課題</span>
                                <span className="rounded bg-amber-50 px-1.5 py-px text-[9px] font-black text-amber-700">{genome.weakAxis.axis}</span>
                            </div>
                        </div>
                    </div>
                    {genome.missingDataHints.length > 0 && (
                        <div className="mb-2 space-y-1">
                            {genome.missingDataHints.slice(0, 2).map((h) => (
                                <div key={h} className="flex items-start gap-1.5">
                                    <span className="mt-0.5 text-[8px] text-amber-400">●</span>
                                    <span className="text-[9px] leading-relaxed text-slate-500">{h}</span>
                                </div>
                            ))}
                        </div>
                    )}
                    <Link href={genome.nextActionHref} className="block rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 px-3 py-2 text-center text-[10px] font-black text-white no-underline shadow-sm transition hover:shadow-md">
                        {genome.nextActionCta}
                    </Link>
                </div>
            </GlassCard>
        );
    }

    return (
        <GlassCard className={`overflow-hidden p-0 shadow-lg ${st.glow}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/6 via-transparent to-violet-400/6" />
            <div className="relative p-5">
                <div className="flex items-start gap-5">
                    {/* Completion Ring */}
                    <div className="relative h-20 w-20 shrink-0">
                        <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
                            <circle cx="40" cy="40" r="34" fill="none" stroke="#e2e8f0" strokeWidth="5" />
                            <motion.circle
                                cx="40" cy="40" r="34" fill="none"
                                stroke="url(#genome-ring-gradient)"
                                strokeWidth="5" strokeLinecap="round"
                                strokeDasharray={`${2 * Math.PI * 34}`}
                                initial={{ strokeDashoffset: 2 * Math.PI * 34 }}
                                animate={{ strokeDashoffset: 2 * Math.PI * 34 * (1 - genome.completionPct / 100) }}
                                transition={{ duration: 1.5, ease: "easeOut", delay: 0.2 }}
                            />
                            <defs>
                                <linearGradient id="genome-ring-gradient" x1="0" y1="0" x2="1" y2="1">
                                    <stop offset="0%" stopColor="#6366f1" />
                                    <stop offset="100%" stopColor="#a855f7" />
                                </linearGradient>
                            </defs>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-lg font-black text-slate-900">{genome.completionPct}%</span>
                            <span className="text-[7px] font-bold uppercase text-slate-400">GENOME</span>
                        </div>
                    </div>

                    {/* Summary Content */}
                    <div className="min-w-0 flex-1">
                        <div className="mb-2 flex items-center gap-2">
                            <span className="text-xs font-black text-slate-900">Presence 分析精度</span>
                            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-black ${st.badge}`}>{genome.statusLabel}</span>
                        </div>

                        <div className="mb-2 grid grid-cols-2 gap-2">
                            <div className="rounded-lg border border-emerald-100 bg-emerald-50/50 px-2.5 py-1.5">
                                <div className="mb-0.5 text-[8px] font-bold text-emerald-500">強み</div>
                                <div className="flex flex-wrap gap-1">
                                    {genome.strongAxes.map((a) => (
                                        <span key={a.axis} className="text-[11px] font-black text-emerald-800">{a.axis}<span className="ml-0.5 text-[9px] font-bold text-emerald-500">{a.score}</span></span>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-lg border border-amber-100 bg-amber-50/50 px-2.5 py-1.5">
                                <div className="mb-0.5 text-[8px] font-bold text-amber-500">成長余白</div>
                                <span className="text-[11px] font-black text-amber-800">{genome.weakAxis.axis}<span className="ml-0.5 text-[9px] font-bold text-amber-500">{genome.weakAxis.score}</span></span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/40 px-2.5 py-1.5">
                            <span className="text-sm">💡</span>
                            <span className="flex-1 text-[10px] leading-relaxed text-indigo-700">{genome.nextAction}</span>
                            <Link href={genome.nextActionHref} className="shrink-0 rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-2.5 py-1 text-[9px] font-black text-white no-underline shadow-sm transition hover:shadow-md">
                                {genome.nextActionCta}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </GlassCard>
    );
}

/* ─── Insight Card ─── */
function InsightCard({
    icon, title, text, accentColor = "indigo",
}: {
    icon: string; title: string; text: string;
    accentColor?: "indigo" | "violet" | "emerald" | "rose" | "amber" | "cyan" | "slate";
}) {
    const bc: Record<string, string> = { indigo: "border-indigo-100", violet: "border-violet-100", emerald: "border-emerald-100", rose: "border-rose-100", amber: "border-amber-100", cyan: "border-cyan-100", slate: "border-slate-100" };
    const bg: Record<string, string> = { indigo: "from-indigo-50/50 to-violet-50/30", violet: "from-violet-50/50 to-purple-50/30", emerald: "from-emerald-50/50 to-teal-50/30", rose: "from-rose-50/50 to-pink-50/30", amber: "from-amber-50/50 to-yellow-50/30", cyan: "from-cyan-50/50 to-blue-50/30", slate: "from-slate-50/50 to-gray-50/30" };
    const tc: Record<string, string> = { indigo: "text-indigo-700", violet: "text-violet-700", emerald: "text-emerald-700", rose: "text-rose-700", amber: "text-amber-700", cyan: "text-cyan-700", slate: "text-slate-700" };
    return (
        <div className={`rounded-2xl border ${bc[accentColor]} bg-gradient-to-br ${bg[accentColor]} p-4`}>
            <div className="mb-2 flex items-center gap-2">
                <span className="text-base">{icon}</span>
                <span className={`text-xs font-black ${tc[accentColor]}`}>{title}</span>
            </div>
            <p className="text-[12px] leading-[1.9] text-slate-700">{text}</p>
        </div>
    );
}

function SectionTitle({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
    return (
        <div className="mb-3 flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-slate-100 to-slate-200 text-sm">{icon}</div>
            <div>
                <div className="text-sm font-black text-slate-900">{title}</div>
                {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
            </div>
        </div>
    );
}

function LaneBadge({ lane }: { lane: string }) {
    const grad = LANE_COLORS[lane] || "from-slate-500 to-slate-600";
    const icon = LANE_ICONS[lane] || "🏷️";
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r ${grad} px-3 py-1.5 text-white shadow-sm`}>
            <span className="text-sm">{icon}</span>
            <span className="text-[11px] font-black">{lane}</span>
        </span>
    );
}

function TagBadge({ tag, variant }: { tag: string; variant: "like" | "avoid" | "must" | "nice" | "ng" | "default" }) {
    const s = {
        like: "border-emerald-200 bg-emerald-50 text-emerald-800",
        avoid: "border-rose-200 bg-rose-50 text-rose-700",
        must: "border-indigo-200 bg-indigo-50 text-indigo-800",
        nice: "border-sky-200 bg-sky-50 text-sky-800",
        ng: "border-red-200 bg-red-50 text-red-800",
        default: "border-slate-200 bg-white text-slate-600",
    };
    return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${s[variant]}`}>{tag}</span>;
}

/* ─── Collapsible ─── */
function EvidenceSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="rounded-xl border border-slate-100 bg-white/40">
            <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                <span className="text-[11px] font-black text-slate-500">{title}</span>
                <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="text-xs text-slate-400">▼</motion.span>
            </button>
            <AnimatePresence>
                {open && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                        <div className="px-4 pb-4">{children}</div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

/* ─── AI Match Preview ─── */
function AIMatchPreview({ candidates, loading }: { candidates: MatchCandidate[]; loading: boolean }) {
    if (loading) {
        return (
            <GlassCard className="overflow-hidden p-0">
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/8 via-transparent to-violet-400/8" />
                <div className="relative flex items-center justify-center gap-2 py-8">
                    <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} className="h-5 w-5 rounded-full border-2 border-indigo-200 border-t-indigo-500" />
                    <span className="text-xs text-slate-400">AIがマッチ候補を分析中...</span>
                </div>
            </GlassCard>
        );
    }
    if (candidates.length === 0) return null;
    return (
        <GlassCard className="overflow-hidden p-0">
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-400/8 via-transparent to-violet-400/8" />
            <div className="relative p-4">
                <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 text-sm text-white shadow-sm">🤖</div>
                        <div>
                            <div className="text-xs font-black text-slate-900">相性の近い人</div>
                            <div className="text-[9px] text-slate-400">あなたの人物像から自動検出</div>
                        </div>
                    </div>
                    <Link href="/match" className="rounded-lg bg-indigo-50 px-2.5 py-1 text-[10px] font-black text-indigo-600 no-underline transition hover:bg-indigo-100">もっと見る →</Link>
                </div>
                <div className="space-y-2">
                    {candidates.slice(0, 3).map((c, i) => {
                        const fitToMe = Math.round(c.people_fit_to_me * 100);
                        const overallScore = Math.round(c.score * 100);
                        return (
                            <motion.div key={c.id} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}>
                                <Link href={`/match/${c.id}`} className="group block no-underline">
                                    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white/60 p-2.5 transition-all hover:bg-white hover:shadow-sm">
                                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-gradient-to-br from-indigo-100 to-violet-100">
                                            {c.avatar_url ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img src={c.avatar_url} alt="" className="h-full w-full object-cover" />
                                            ) : (
                                                <div className="flex h-full w-full items-center justify-center text-lg">👤</div>
                                            )}
                                            <div className={`absolute -bottom-0.5 -right-0.5 flex h-4.5 w-4.5 items-center justify-center rounded-full text-[7px] font-black text-white ${overallScore >= 80 ? "bg-emerald-500" : overallScore >= 60 ? "bg-blue-500" : "bg-slate-400"}`}>
                                                {overallScore}
                                            </div>
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                <span className="truncate text-xs font-black text-slate-900">{c.name}</span>
                                                {c.lane_tags.slice(0, 2).map((t) => (
                                                    <span key={t} className="rounded bg-slate-100 px-1 py-px text-[8px] font-bold text-slate-500">{t}</span>
                                                ))}
                                            </div>
                                            <div className="mt-1 flex items-center gap-1">
                                                <span className="text-[8px] font-bold text-indigo-500">相性</span>
                                                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                                                    <motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500" initial={{ width: 0 }} animate={{ width: `${fitToMe}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.6 }} />
                                                </div>
                                                <span className="text-[8px] font-black text-indigo-600">{fitToMe}%</span>
                                            </div>
                                        </div>
                                        <div className="text-slate-300 transition group-hover:text-indigo-500">→</div>
                                    </div>
                                </Link>
                            </motion.div>
                        );
                    })}
                </div>
            </div>
        </GlassCard>
    );
}

/* ════════════════════════════════════════════════════════
   Main Page
   ════════════════════════════════════════════════════════ */

export default function SNSProfilePage() {
    const searchParams = useSearchParams();
    const isDemo = searchParams.get("demo") === "1";

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [seekData, setSeekData] = useState<SeekResponse | null>(null);
    const [tab, setTab] = useState<Tab>("presence");
    const [matchCandidates, setMatchCandidates] = useState<MatchCandidate[]>([]);
    const [matchLoading, setMatchLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const loadProfile = useCallback(async () => {
        if (isDemo) {
            setSeekData({
                ok: true, enabled: true,
                i_am: DEMO_DATA.i_am,
                style_dna: DEMO_DATA.style_dna,
                seek: DEMO_DATA.seek,
                taste_layers: DEMO_DATA.taste_layers,
            });
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/sns/insights/seek", { cache: "no-store" });
            const json: SeekResponse = await res.json().catch(() => ({}));
            if (!res.ok || !json?.ok) throw new Error("プロフィールの取得に失敗しました");
            setSeekData(json);
        } catch (e: unknown) {
            setError(String(e instanceof Error ? e.message : e));
        } finally {
            setLoading(false);
        }
    }, [isDemo]);

    const loadMatches = useCallback(async () => {
        if (isDemo) return;
        setMatchLoading(true);
        try {
            const res = await fetch("/api/match/overview?mode=people&limit=3", { cache: "no-store" });
            const json = await res.json().catch(() => ({}));
            if (json?.ok && json.top_candidates) {
                setMatchCandidates((json.top_candidates as MatchCandidate[]).slice(0, 3));
            }
        } catch { /* silent */ } finally { setMatchLoading(false); }
    }, [isDemo]);

    const handleAutoSync = useCallback(async () => {
        setSyncing(true);
        try {
            const res = await fetch("/api/style-profile/sync", { method: "POST" });
            if (res.ok) await loadProfile();
        } catch { /* silent */ } finally { setSyncing(false); }
    }, [loadProfile]);

    useEffect(() => {
        void loadProfile();
        void loadMatches();
    }, [loadProfile, loadMatches]);

    const iAm = seekData?.i_am;
    const seek = seekData?.seek;
    const styleDna = seekData?.style_dna;
    const layers = seekData?.taste_layers;

    /* ── Build Interpretations ── */
    const presenceInput = useMemo(
        () => toPresenceInput(iAm, styleDna, seek?.seek_people),
        [iAm, styleDna, seek?.seek_people],
    );
    const summary: PresenceSummary = useMemo(() => buildPresenceSummary(presenceInput), [presenceInput]);
    const mirror: IAmMirrorResult = useMemo(() => buildIAmMirror(presenceInput), [presenceInput]);
    const relations: ISeekRelationsResult = useMemo(() => buildISeekRelations(presenceInput), [presenceInput]);
    const gap: PerceptionGap = useMemo(() => buildPerceptionGap(presenceInput), [presenceInput]);
    const growth: GrowthVector = useMemo(() => buildGrowthVector(presenceInput), [presenceInput]);
    const aura: PresenceAura = useMemo(() => buildPresenceAura(presenceInput), [presenceInput]);
    const evolution: ImpressionEvolution = useMemo(() => buildImpressionEvolution(layers), [layers]);
    const radar: PersonalityRadar = useMemo(() => buildPersonalityRadar(presenceInput), [presenceInput]);
    const strengthAnalysis: StrengthAnalysis = useMemo(() => buildStrengthAnalysis(presenceInput), [presenceInput]);
    const potentialMap: PotentialMap = useMemo(() => buildPotentialMap(presenceInput), [presenceInput]);
    const companion: CompanionVoice = useMemo(() => buildCompanionVoice(presenceInput, radar, strengthAnalysis), [presenceInput, radar, strengthAnalysis]);
    const genome: GenomeSummary = useMemo(() => buildGenomeSummary(presenceInput, radar, strengthAnalysis), [presenceInput, radar, strengthAnalysis]);

    const hasAnyData = (iAm?.lanes?.length ?? 0) > 0 || (iAm?.likes?.length ?? 0) > 0 || styleDna?.body_type || styleDna?.pc_season;

    const TABS: { key: Tab; label: string; sub: string; desc: string; icon: string }[] = [
        { key: "presence", label: "Presence", sub: "客観ミラー", desc: "グラフと分析であなたの全体像を把握", icon: "🪞" },
        { key: "i_am", label: "I AM", sub: "見え方", desc: "他者の目に映るあなたの姿と深層", icon: "👁️" },
        { key: "i_seek", label: "I SEEK", sub: "関係性", desc: "引き寄せる相手、すれ違うパターン", icon: "🫂" },
    ];

    return (
        <LightBackground>
            <GlassNavbar>
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <Link href="/social" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/60 bg-white/50 text-slate-500 no-underline transition-all hover:bg-white/80">←</Link>
                        <div>
                            <h1 className="text-xl font-black tracking-tight text-slate-900">Presence</h1>
                            <p className="text-[11px] font-semibold text-slate-400">他者から見た、あなたの人物像</p>
                        </div>
                    </div>
                    <Link href="/my-style" className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 no-underline transition hover:bg-slate-200">編集 →</Link>
                </div>
            </GlassNavbar>

            <main className="mx-auto max-w-5xl px-4 pb-28 pt-24">
                {loading ? (
                    <div className="flex flex-col items-center gap-3 py-20">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} className="h-6 w-6 rounded-full border-2 border-indigo-200 border-t-indigo-500" />
                        <span className="text-xs text-slate-400">Presenceを読み込み中...</span>
                    </div>
                ) : error ? (
                    <GlassCard className="p-5 text-center">
                        <div className="text-sm font-bold text-rose-600">{error}</div>
                        <button type="button" onClick={loadProfile} className="mt-2 text-xs font-bold text-indigo-600">再試行 →</button>
                    </GlassCard>
                ) : (
                    <div className="space-y-4">
                        {/* ═══════════════════════════════════
                            Hero — Presence Aura + Summary
                           ═══════════════════════════════════ */}
                        <FadeInView>
                            <GlassCard className="overflow-hidden p-0">
                                <div className="absolute inset-0 bg-gradient-to-br from-indigo-400/4 via-transparent to-violet-400/4" />
                                <div className="relative px-5 pb-5 pt-6">
                                    {hasAnyData ? (
                                        <>
                                            {/* Aura Ring */}
                                            <AuraRing aura={aura} />

                                            <motion.p
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.4 }}
                                                className="mt-5 text-center text-[15px] font-black leading-[1.9] text-slate-900"
                                            >
                                                {summary.headline}
                                            </motion.p>
                                            <motion.p
                                                initial={{ opacity: 0, y: 8 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                transition={{ delay: 0.6 }}
                                                className="mt-2 text-center text-[12px] leading-[1.8] text-slate-500"
                                            >
                                                {summary.subline}
                                            </motion.p>

                                            {/* DNA chips */}
                                            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 border-t border-slate-100 pt-3">
                                                {styleDna?.body_type && (
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">
                                                        {BODY_TYPE_MAP[styleDna.body_type.toLowerCase()]?.icon}{" "}
                                                        {BODY_TYPE_MAP[styleDna.body_type.toLowerCase()]?.label ?? styleDna.body_type}
                                                    </span>
                                                )}
                                                {styleDna?.pc_season && (
                                                    <span className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/80 px-2 py-1 text-[10px] font-bold text-slate-600">
                                                        {PC_SEASON_MAP[styleDna.pc_season.toLowerCase()]?.icon}{" "}
                                                        {PC_SEASON_MAP[styleDna.pc_season.toLowerCase()]?.label ?? styleDna.pc_season}
                                                    </span>
                                                )}
                                                {(styleDna?.style_score ?? 0) > 0 && (
                                                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-100 bg-indigo-50/50 px-2 py-1 text-[10px] font-bold text-indigo-600">
                                                        <span className="inline-block h-1.5 w-8 overflow-hidden rounded-full bg-indigo-100">
                                                            <span className="block h-full rounded-full bg-indigo-500" style={{ width: `${styleDna?.style_score ?? 0}%` }} />
                                                        </span>
                                                        {styleDna?.style_score}%
                                                    </span>
                                                )}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="py-4 text-center">
                                            <div className="text-3xl">🪞</div>
                                            <p className="mt-2 text-[13px] text-slate-500">スタイルデータがまだ少ないため、<br />あなたの人物像はこれから浮かび上がります</p>
                                            <div className="mt-3 flex items-center justify-center gap-2">
                                                <button type="button" onClick={handleAutoSync} disabled={syncing} className="rounded-lg bg-gradient-to-r from-indigo-500 to-violet-500 px-4 py-1.5 text-[10px] font-black text-white shadow-sm transition hover:shadow-md disabled:opacity-50">
                                                    {syncing ? "分析中..." : "🤖 AIデータから自動分析"}
                                                </button>
                                                <Link href="/my-style" className="rounded-lg bg-slate-100 px-3 py-1.5 text-[10px] font-black text-slate-600 no-underline transition hover:bg-slate-200">手動で設定 →</Link>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </GlassCard>
                        </FadeInView>

                        {/* ═══ Genome Summary ═══ */}
                        {hasAnyData && (
                            <FadeInView delay={0.05}>
                                <GenomeSummaryCard genome={genome} />
                            </FadeInView>
                        )}

                        {/* ═══ Tabs ═══ */}
                        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/80 backdrop-blur-sm">
                            <div className="flex p-1">
                                {TABS.map((t) => (
                                    <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`relative flex-1 rounded-xl py-2.5 text-center transition-colors ${tab === t.key ? "text-white" : "text-slate-400 hover:text-slate-700"}`}>
                                        {tab === t.key && <motion.div layoutId="profile-tab" className="absolute inset-0 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 shadow-lg shadow-indigo-500/25" transition={{ type: "spring", stiffness: 400, damping: 30 }} />}
                                        <span className="relative z-10 flex flex-col items-center gap-0.5">
                                            <span className="text-[13px] font-black">{t.icon} {t.label}</span>
                                            <span className="text-[8px] font-semibold opacity-70">{t.sub}</span>
                                        </span>
                                    </button>
                                ))}
                            </div>
                            {/* Active tab description */}
                            <AnimatePresence mode="wait">
                                <motion.div
                                    key={tab}
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: 4 }}
                                    className="border-t border-slate-100 px-4 py-2 text-center"
                                >
                                    <span className="text-[10px] text-slate-400">{TABS.find((t) => t.key === tab)?.desc}</span>
                                </motion.div>
                            </AnimatePresence>
                        </div>

                        {/* ═══ Tab Content ═══ */}
                        <AnimatePresence mode="wait">
                            {/* ── Presence ── */}
                            {tab === "presence" && (
                                <motion.div key="presence" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.2 }}>
                                    {/* Personality Radar — 最重要カード（フル幅） */}
                                    <FadeInView>
                                        <div className="mb-4 lg:mb-6">
                                            <PresenceRadarChart radar={radar} />
                                        </div>
                                    </FadeInView>

                                    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
                                        {/* ═══ Main Column ═══ */}
                                        <div className="space-y-4">
                                            {/* Strength-Weakness Analysis */}
                                            <FadeInView delay={0.05}>
                                                <StrengthAnalysisCard analysis={strengthAnalysis} />
                                            </FadeInView>

                                            {/* 人物像 */}
                                            <FadeInView delay={0.1}>
                                                <GlassCard className="p-4">
                                                    <SectionTitle icon="✨" title="あなたの人物像" sub="外から見たとき、こう映っている" />
                                                    <div className="space-y-3">
                                                        <InsightCard icon="👁️" title="第一印象" text={mirror.firstImpression} accentColor="indigo" />
                                                        <InsightCard icon="💎" title="伝わる魅力" text={mirror.charm} accentColor="emerald" />
                                                        <InsightCard icon="🔮" title="深く知ると見える本質" text={mirror.deeperTruth} accentColor="violet" />
                                                    </div>
                                                </GlassCard>
                                            </FadeInView>

                                            {/* Perception Gap */}
                                            <FadeInView delay={0.15}>
                                                <PerceptionGapCard gap={gap} />
                                            </FadeInView>

                                            {/* Quick relationship */}
                                            <FadeInView delay={0.2}>
                                                <GlassCard className="p-4">
                                                    <SectionTitle icon="🫂" title="関係性のかたち" sub="あなたが引き寄せやすい相手" />
                                                    <div className="space-y-3">
                                                        <InsightCard icon="💫" title="惹かれやすい相手" text={relations.attracted} accentColor="cyan" />
                                                        <InsightCard icon="🚧" title="起きやすいすれ違い" text={relations.commonMisunderstanding} accentColor="amber" />
                                                    </div>
                                                </GlassCard>
                                            </FadeInView>
                                        </div>

                                        {/* ═══ Sidebar ═══ */}
                                        <div className="mt-4 space-y-4 lg:mt-0">
                                            {/* Potential Map */}
                                            <FadeInView delay={0.1}>
                                                <PotentialMapCard potentialMap={potentialMap} />
                                            </FadeInView>

                                            {/* Impression Evolution */}
                                            {evolution.recent.length > 0 && (
                                                <FadeInView delay={0.15}>
                                                    <ImpressionEvolutionCard evolution={evolution} />
                                                </FadeInView>
                                            )}

                                            {/* AI Match */}
                                            <FadeInView delay={0.2}>
                                                <AIMatchPreview candidates={matchCandidates} loading={matchLoading} />
                                            </FadeInView>

                                            {/* Quick actions */}
                                            <FadeInView delay={0.25}>
                                                <div className="grid grid-cols-3 gap-2">
                                                    {[
                                                        { href: "/match", icon: "💫", label: "マッチ", gradient: "from-indigo-500 to-violet-500" },
                                                        { href: "/community", icon: "💬", label: "コミュニティ", gradient: "from-orange-500 to-red-500" },
                                                        { href: "/sns/trends/v2", icon: "🔥", label: "Pulse+", gradient: "from-amber-500 to-yellow-500" },
                                                    ].map((a) => (
                                                        <Link key={a.href} href={a.href} className="no-underline">
                                                            <GlassCard className="p-3 text-center transition hover:shadow-md">
                                                                <div className={`mx-auto mb-1 flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${a.gradient} text-lg text-white shadow-sm`}>{a.icon}</div>
                                                                <div className="text-[10px] font-black text-slate-700">{a.label}</div>
                                                            </GlassCard>
                                                        </Link>
                                                    ))}
                                                </div>
                                            </FadeInView>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ── I AM ── */}
                            {tab === "i_am" && (
                                <motion.div key="i_am" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                                    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
                                        {/* ═══ Main Column ═══ */}
                                        <div className="space-y-4">
                                    {/* Companion Voice — あなたに寄り添う存在 */}
                                    <FadeInView>
                                        <CompanionVoiceCard companion={companion} />
                                    </FadeInView>

                                    <FadeInView delay={0.05}>
                                        <GlassCard className="p-4">
                                            <SectionTitle icon="👁️" title="他者から見たあなた" sub="周囲にはこう映っている" />
                                            <div className="space-y-3">
                                                <InsightCard icon="🤝" title="第一印象" text={mirror.firstImpression} accentColor="indigo" />
                                                <InsightCard icon="🔮" title="深く知ると見える本質" text={mirror.deeperTruth} accentColor="violet" />
                                            </div>
                                        </GlassCard>
                                    </FadeInView>

                                    <FadeInView delay={0.1}>
                                        <GlassCard className="p-4">
                                            <SectionTitle icon="✨" title="魅力と誤解" sub="伝わるもの、伝わりにくいもの" />
                                            <div className="space-y-3">
                                                <InsightCard icon="💎" title="魅力として伝わる点" text={mirror.charm} accentColor="emerald" />
                                                <InsightCard icon="⚡" title="誤解されやすい点" text={mirror.misperception} accentColor="amber" />
                                            </div>
                                        </GlassCard>
                                    </FadeInView>

                                    <FadeInView delay={0.15}>
                                        <GlassCard className="p-4">
                                            <SectionTitle icon="🧭" title="価値観と距離感" sub="あなたの思考と対人傾向" />
                                            <div className="space-y-3">
                                                <InsightCard icon="🧠" title="価値観・思考の傾向" text={mirror.values} accentColor="cyan" />
                                                <InsightCard icon="📏" title="対人距離感" text={mirror.interpersonalDistance} accentColor="slate" />
                                            </div>
                                        </GlassCard>
                                    </FadeInView>

                                    {/* Growth Vector */}
                                    <FadeInView delay={0.2}>
                                        <GrowthVectorCard growth={growth} />
                                    </FadeInView>
                                        </div>

                                        {/* ═══ Sidebar ═══ */}
                                        <div className="mt-4 space-y-4 lg:mt-0">
                                            <GenomeSummaryCard genome={genome} compact />

                                    {/* Evidence */}
                                    <FadeInView delay={0.25}>
                                        <GlassCard className="p-2">
                                            <div className="mb-2 px-2 pt-2">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">根拠データ</span>
                                            </div>
                                            {iAm?.lanes && iAm.lanes.length > 0 && (
                                                <EvidenceSection title={`スタイルレーン (${iAm.lanes.length})`}>
                                                    <div className="flex flex-wrap gap-2">{iAm.lanes.map((l) => <LaneBadge key={l} lane={l} />)}</div>
                                                </EvidenceSection>
                                            )}
                                            <EvidenceSection title="好き / 苦手">
                                                <div className="space-y-2">
                                                    {iAm?.likes && iAm.likes.length > 0 && (
                                                        <div>
                                                            <span className="mb-1 inline-block rounded bg-emerald-500 px-1.5 py-px text-[8px] font-black text-white">LIKE</span>
                                                            <div className="mt-1 flex flex-wrap gap-1">{iAm.likes.map((t) => <TagBadge key={t} tag={t} variant="like" />)}</div>
                                                        </div>
                                                    )}
                                                    {iAm?.avoid && iAm.avoid.length > 0 && (
                                                        <div>
                                                            <span className="mb-1 inline-block rounded bg-rose-500 px-1.5 py-px text-[8px] font-black text-white">AVOID</span>
                                                            <div className="mt-1 flex flex-wrap gap-1">{iAm.avoid.map((t) => <TagBadge key={t} tag={t} variant="avoid" />)}</div>
                                                        </div>
                                                    )}
                                                    {(!iAm?.likes?.length && !iAm?.avoid?.length) && <span className="text-[10px] text-slate-400">未設定</span>}
                                                </div>
                                            </EvidenceSection>
                                            {(iAm?.silhouette_pref || iAm?.material_pref) && (
                                                <EvidenceSection title="プリファレンス">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="rounded-xl border border-slate-100 bg-white/60 p-3 text-center">
                                                            <div className="text-[9px] font-bold uppercase text-slate-400">Silhouette</div>
                                                            <div className="mt-1 text-sm font-black text-slate-800">{iAm?.silhouette_pref || "—"}</div>
                                                        </div>
                                                        <div className="rounded-xl border border-slate-100 bg-white/60 p-3 text-center">
                                                            <div className="text-[9px] font-bold uppercase text-slate-400">Material</div>
                                                            <div className="mt-1 text-sm font-black text-slate-800">{iAm?.material_pref || "—"}</div>
                                                        </div>
                                                    </div>
                                                </EvidenceSection>
                                            )}
                                            {layers?.layer_7d && Object.keys(layers.layer_7d).length > 0 && (
                                                <EvidenceSection title="テイストレーダー (7日)">
                                                    <div className="space-y-1.5">
                                                        {Object.entries(layers.layer_7d).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag, score]) => {
                                                            const maxVal = Math.max(...Object.values(layers.layer_7d), 1);
                                                            const pct = (score / maxVal) * 100;
                                                            return (
                                                                <div key={tag} className="flex items-center gap-2">
                                                                    <span className="w-16 truncate text-right text-[10px] font-bold text-slate-500">{tag}</span>
                                                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                                                                        <div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-500" style={{ width: `${pct}%` }} />
                                                                    </div>
                                                                    <span className="w-8 text-right text-[9px] font-black text-slate-600">{score.toFixed(1)}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </EvidenceSection>
                                            )}
                                            {iAm?.tags && iAm.tags.length > 0 && (
                                                <EvidenceSection title={`全タグ (${iAm.tags.length})`}>
                                                    <div className="flex flex-wrap gap-1">
                                                        {iAm.tags.slice(0, 40).map((t) => <TagBadge key={t} tag={t} variant="default" />)}
                                                        {iAm.tags.length > 40 && <span className="self-center text-[9px] font-bold text-slate-400">+{iAm.tags.length - 40}</span>}
                                                    </div>
                                                </EvidenceSection>
                                            )}
                                        </GlassCard>
                                    </FadeInView>
                                        </div>
                                    </div>
                                </motion.div>
                            )}

                            {/* ── I SEEK ── */}
                            {tab === "i_seek" && (
                                <motion.div key="i_seek" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }}>
                                    <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-6">
                                        {/* ═══ Main Column ═══ */}
                                        <div className="space-y-4">
                                    <FadeInView>
                                        <GlassCard className="p-4">
                                            <SectionTitle icon="🫂" title="関係性のダイナミクス" sub="あなたが引き寄せる相手、すれ違う相手" />
                                            <div className="space-y-3">
                                                <InsightCard icon="💫" title="惹かれやすい相手" text={relations.attracted} accentColor="indigo" />
                                                <InsightCard icon="🌱" title="相性が深まりやすい相手" text={relations.deepenWith} accentColor="emerald" />
                                            </div>
                                        </GlassCard>
                                    </FadeInView>

                                    <FadeInView delay={0.05}>
                                        <GlassCard className="p-4">
                                            <SectionTitle icon="⚡" title="注意したい関係性" sub="ズレや摩擦が起きやすいパターン" />
                                            <div className="space-y-3">
                                                <InsightCard icon="🔥" title="最初は惹かれても長続きしにくい相手" text={relations.initialButFade} accentColor="amber" />
                                                <InsightCard icon="🚧" title="ズレやすい相手" text={relations.clashWith} accentColor="rose" />
                                                <InsightCard icon="🌀" title="起きやすいすれ違い" text={relations.commonMisunderstanding} accentColor="slate" />
                                            </div>
                                        </GlassCard>
                                    </FadeInView>
                                        </div>

                                        {/* ═══ Sidebar ═══ */}
                                        <div className="mt-4 space-y-4 lg:mt-0">
                                            <GenomeSummaryCard genome={genome} compact />

                                    {/* AI Match Link */}
                                    <FadeInView delay={0.1}>
                                        <Link href="/match" className="block no-underline">
                                            <GlassCard className="overflow-hidden p-0 transition hover:shadow-lg">
                                                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/8 to-violet-500/8" />
                                                <div className="relative flex items-center gap-3 p-4">
                                                    <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 2, repeat: Infinity }} className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-xl text-white shadow-md">🤖</motion.div>
                                                    <div className="flex-1">
                                                        <div className="text-sm font-black text-slate-900">AIマッチを確認する</div>
                                                        <div className="text-[10px] text-slate-400">あなたの人物像に基づいて相性の近い人を発見</div>
                                                    </div>
                                                    <span className="text-slate-300">→</span>
                                                </div>
                                            </GlassCard>
                                        </Link>
                                    </FadeInView>

                                    {/* Evidence */}
                                    <FadeInView delay={0.15}>
                                        <GlassCard className="p-2">
                                            <div className="mb-2 px-2 pt-2">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">根拠データ</span>
                                            </div>
                                            {seek?.seek_people && (
                                                <EvidenceSection title="People — 求める条件">
                                                    <SeekConditionsList block={seek.seek_people} />
                                                </EvidenceSection>
                                            )}
                                            {seek?.seek_market && (
                                                <EvidenceSection title="Market — 求める条件">
                                                    <SeekConditionsList block={seek.seek_market} />
                                                </EvidenceSection>
                                            )}
                                            {((seek?.handshake_people?.length ?? 0) > 0 || (seek?.handshake_market?.length ?? 0) > 0) && (
                                                <EvidenceSection title="握手条件">
                                                    {seek?.handshake_people && seek.handshake_people.length > 0 && (
                                                        <div className="mb-3">
                                                            <div className="mb-1.5 flex items-center gap-2">
                                                                <span className="text-sm">🤝</span>
                                                                <span className="text-[11px] font-black text-indigo-700">People</span>
                                                                <GlassBadge size="sm" className="border-indigo-200 bg-indigo-100 text-indigo-600">{seek.handshake_people.length}条件</GlassBadge>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                {seek.handshake_people.map((rule, i) => (
                                                                    <div key={i} className="flex items-start gap-2">
                                                                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-[9px] font-black text-white shadow-sm">{i + 1}</div>
                                                                        <span className="text-[11px] leading-relaxed text-indigo-800">{rule}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {seek?.handshake_market && seek.handshake_market.length > 0 && (
                                                        <div>
                                                            <div className="mb-1.5 flex items-center gap-2">
                                                                <span className="text-sm">🤝</span>
                                                                <span className="text-[11px] font-black text-cyan-700">Market</span>
                                                                <GlassBadge size="sm" className="border-cyan-200 bg-cyan-100 text-cyan-600">{seek.handshake_market.length}条件</GlassBadge>
                                                            </div>
                                                            <div className="space-y-1.5">
                                                                {seek.handshake_market.map((rule, i) => (
                                                                    <div key={i} className="flex items-start gap-2">
                                                                        <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-[9px] font-black text-white shadow-sm">{i + 1}</div>
                                                                        <span className="text-[11px] leading-relaxed text-cyan-800">{rule}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </EvidenceSection>
                                            )}
                                            <EvidenceSection title="公開設定">
                                                <div className="flex items-center justify-between">
                                                    <div className="text-[11px] text-slate-500">Presenceプロフィール公開状態</div>
                                                    <div className={`rounded-full px-3 py-1 text-[10px] font-bold ${seek?.is_public ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "border border-slate-200 bg-slate-50 text-slate-500"}`}>
                                                        {seek?.is_public ? "公開中" : "非公開"}
                                                    </div>
                                                </div>
                                            </EvidenceSection>
                                        </GlassCard>
                                    </FadeInView>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                )}
            </main>

            <FloatingNavLight items={NAV_ITEMS} />
        </LightBackground>
    );
}

/* ─── SeekConditionsList ─── */
function SeekConditionsList({ block }: { block: SeekBlock }) {
    const categories = [
        { key: "must", label: "MUST", desc: "必須", items: block.hard_include, variant: "must" as const, bg: "bg-indigo-600" },
        { key: "nice", label: "NICE", desc: "あると嬉しい", items: block.soft_include, variant: "nice" as const, bg: "bg-sky-600" },
        { key: "ng", label: "NG", desc: "絶対NG", items: block.hard_exclude, variant: "ng" as const, bg: "bg-red-600" },
        { key: "avoid", label: "AVOID", desc: "できれば避けたい", items: block.soft_exclude, variant: "avoid" as const, bg: "bg-amber-600" },
    ].filter((c) => c.items.length > 0);
    if (categories.length === 0) return <span className="text-[10px] text-slate-400">未設定</span>;
    return (
        <div className="space-y-3">
            {categories.map((cat) => (
                <div key={cat.key}>
                    <div className="mb-1.5 flex items-center gap-1.5">
                        <span className={`rounded-md px-1.5 py-px text-[8px] font-black text-white ${cat.bg}`}>{cat.label}</span>
                        <span className="text-[10px] font-bold text-slate-500">{cat.desc}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">{cat.items.map((tag) => <TagBadge key={tag} tag={tag} variant={cat.variant} />)}</div>
                </div>
            ))}
        </div>
    );
}
