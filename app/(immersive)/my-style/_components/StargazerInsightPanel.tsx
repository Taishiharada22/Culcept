"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import type { SavedState } from "../_lib/types";
import {
    getStargazerProfile,
    generateCrossInsights,
    generateArchetypeLabel,
    type StargazerStyleInsight,
    type StargazerProfileSnapshot,
} from "../_lib/stargazerBridge";
import { loadStateBundle } from "../_lib/state";

/* ── Star Particles ── */

function StarParticles() {
    const particles = useMemo(() => {
        return Array.from({ length: 18 }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            y: Math.random() * 100,
            size: 1 + Math.random() * 2,
            delay: Math.random() * 4,
            duration: 2 + Math.random() * 3,
        }));
    }, []);

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
            {particles.map((p) => (
                <motion.div
                    key={p.id}
                    className="absolute rounded-full bg-indigo-300/40"
                    style={{
                        left: `${p.x}%`,
                        top: `${p.y}%`,
                        width: p.size,
                        height: p.size,
                    }}
                    animate={{
                        opacity: [0.2, 0.8, 0.2],
                        scale: [0.8, 1.3, 0.8],
                    }}
                    transition={{
                        duration: p.duration,
                        delay: p.delay,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                />
            ))}
        </div>
    );
}

/* ── Insight Type Config ── */

const TYPE_CONFIG: Record<
    StargazerStyleInsight["type"],
    { label: string; color: string; bgColor: string; borderColor: string }
> = {
    correlation: {
        label: "共鳴",
        color: "text-indigo-600",
        bgColor: "bg-indigo-50/60",
        borderColor: "border-indigo-200/50",
    },
    prediction: {
        label: "予測",
        color: "text-violet-600",
        bgColor: "bg-violet-50/60",
        borderColor: "border-violet-200/50",
    },
    contradiction: {
        label: "矛盾",
        color: "text-amber-600",
        bgColor: "bg-amber-50/60",
        borderColor: "border-amber-200/50",
    },
    growth: {
        label: "成長",
        color: "text-emerald-600",
        bgColor: "bg-emerald-50/60",
        borderColor: "border-emerald-200/50",
    },
    archetype: {
        label: "型",
        color: "text-rose-600",
        bgColor: "bg-rose-50/60",
        borderColor: "border-rose-200/50",
    },
};

/* ── Connection Arrow ── */

function ConnectionArrow() {
    return (
        <div className="flex items-center justify-center py-1">
            <motion.div
                className="flex flex-col items-center"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
            >
                <div className="h-3 w-px bg-gradient-to-b from-indigo-300 to-violet-300" />
                <svg
                    width="10"
                    height="6"
                    viewBox="0 0 10 6"
                    className="text-violet-400"
                >
                    <path d="M0 0 L5 6 L10 0" fill="currentColor" />
                </svg>
            </motion.div>
        </div>
    );
}

/* ── Insight Card ── */

function InsightCardItem({
    insight,
    index,
}: {
    insight: StargazerStyleInsight;
    index: number;
}) {
    const config = TYPE_CONFIG[insight.type];
    const [expanded, setExpanded] = useState(false);

    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.12, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        >
            <div
                className={`rounded-xl border p-4 ${config.bgColor} ${config.borderColor} cursor-pointer transition-all duration-200`}
                onClick={() => setExpanded(!expanded)}
            >
                {/* Header */}
                <div className="flex items-start gap-2">
                    <span
                        className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${config.color} ${config.bgColor} border ${config.borderColor}`}
                    >
                        {config.label}
                    </span>
                    <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-bold text-slate-800 leading-snug">
                            {insight.title}
                        </p>
                    </div>
                    <div className="shrink-0 text-[10px] font-mono text-slate-400">
                        {Math.round(insight.confidence * 100)}%
                    </div>
                </div>

                {/* Signals */}
                <div className="mt-3 space-y-0.5">
                    <div className="flex items-center gap-2">
                        <span className="shrink-0 text-[9px] font-bold text-indigo-400 uppercase tracking-widest w-16">
                            Stargazer
                        </span>
                        <span className="text-[11px] text-slate-600 truncate">
                            {insight.stargazerSignal}
                        </span>
                    </div>
                    <ConnectionArrow />
                    <div className="flex items-center gap-2">
                        <span className="shrink-0 text-[9px] font-bold text-violet-400 uppercase tracking-widest w-16">
                            My-Style
                        </span>
                        <span className="text-[11px] text-slate-600 truncate">
                            {insight.styleSignal}
                        </span>
                    </div>
                </div>

                {/* Body */}
                <AnimatePresence>
                    {expanded && (
                        <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden"
                        >
                            <div className="mt-3 pt-3 border-t border-white/50">
                                <p className="text-[12px] leading-relaxed text-slate-600">
                                    {insight.body}
                                </p>
                                {insight.connectionNarrative &&
                                    insight.connectionNarrative !== insight.body && (
                                        <p className="mt-2 text-[11px] leading-relaxed text-slate-500 italic">
                                            {insight.connectionNarrative}
                                        </p>
                                    )}
                                {insight.actionSuggestion && (
                                    <div className="mt-2 rounded-lg bg-white/60 p-2.5">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                            Next Action
                                        </p>
                                        <p className="text-[11px] text-slate-700 leading-relaxed">
                                            {insight.actionSuggestion}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
}

/* ── Empty State (Stargazer not used) ── */

/* StargazerCTA removed — using inline Link instead */

/* ── Main Component ── */

type Props = {
    myStyleState?: SavedState;
    compact?: boolean;
};

export default function StargazerInsightPanel({
    myStyleState,
    compact = false,
}: Props) {
    const state = useMemo(() => {
        if (myStyleState) return myStyleState;
        if (typeof window === "undefined") return null;
        return loadStateBundle().state;
    }, [myStyleState]);

    const profile = useMemo<StargazerProfileSnapshot | null>(() => {
        if (typeof window === "undefined") return null;
        return getStargazerProfile();
    }, []);

    const insights = useMemo<StargazerStyleInsight[]>(() => {
        if (!profile || !state) return [];
        return generateCrossInsights(profile, state);
    }, [profile, state]);

    const archetype = useMemo(() => {
        if (!profile || !state) return null;
        return generateArchetypeLabel(profile, state);
    }, [profile, state]);

    // No Stargazer data
    if (!profile) {
        if (compact) {
            return (
                <Link href="/stargazer" className="block">
                    <div className="rounded-xl border border-indigo-200/40 bg-gradient-to-r from-indigo-50/50 to-violet-50/50 p-3 transition-colors hover:bg-indigo-50/80">
                        <div className="flex items-center gap-2">
                            <span className="text-lg">&#x2B50;</span>
                            <div className="flex-1 min-w-0">
                                <p className="text-[11px] font-bold text-slate-700">
                                    Stargazer深層観測
                                </p>
                                <p className="text-[10px] text-slate-500 truncate">
                                    性格 x スタイルのインサイトを解放
                                </p>
                            </div>
                            <svg
                                className="w-4 h-4 text-slate-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 5l7 7-7 7"
                                />
                            </svg>
                        </div>
                    </div>
                </Link>
            );
        }
        return (
            <Link href="/stargazer" className="block rounded-xl border border-indigo-200/40 bg-indigo-50/40 p-3 transition hover:bg-indigo-50/80">
                <div className="flex items-center gap-2">
                    <span>⭐</span>
                    <div className="flex-1">
                        <p className="text-[11px] font-bold text-slate-700">Stargazer深層観測</p>
                        <p className="text-[10px] text-slate-500">性格 x スタイルのインサイトを解放</p>
                    </div>
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
            </Link>
        );
    }

    // Compact mode: abbreviated view
    if (compact && insights.length > 0) {
        const topInsight = insights[0];
        const config = TYPE_CONFIG[topInsight.type];

        return (
            <div className="space-y-2">
                {/* Archetype badge */}
                {archetype && (
                    <div
                        className="rounded-xl p-3 text-white relative overflow-hidden"
                        style={{
                            background: `linear-gradient(135deg, ${archetype.gradient[0]}, ${archetype.gradient[1]})`,
                        }}
                    >
                        <StarParticles />
                        <div className="relative z-10">
                            <p className="text-[9px] font-bold uppercase tracking-widest text-white/70">
                                Stargazer x My-Style
                            </p>
                            <p className="text-sm font-bold mt-0.5">
                                {archetype.label}
                            </p>
                            <p className="text-[10px] text-white/80 mt-1 leading-relaxed line-clamp-2">
                                {archetype.description}
                            </p>
                        </div>
                    </div>
                )}

                {/* Top insight preview */}
                <div
                    className={`rounded-xl border p-3 ${config.bgColor} ${config.borderColor}`}
                >
                    <div className="flex items-start gap-2">
                        <span
                            className={`shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase ${config.color} ${config.bgColor} border ${config.borderColor}`}
                        >
                            {config.label}
                        </span>
                        <p className="text-[11px] font-bold text-slate-800 leading-snug line-clamp-2">
                            {topInsight.title}
                        </p>
                    </div>
                </div>

                {insights.length > 1 && (
                    <Link
                        href="/my-style"
                        className="block text-center text-[10px] text-indigo-500 font-medium hover:text-indigo-700 transition-colors"
                    >
                        +{insights.length - 1}件のインサイトを見る
                    </Link>
                )}
            </div>
        );
    }

    // No insights generated (data exists but no matches)
    if (insights.length === 0) {
        return (
            <div className="rounded-xl border border-slate-200/40 bg-white/60 p-3 text-center">
                <p className="text-[11px] text-slate-500">⭐ Stargazerデータ検出 — スタイル選択を増やすとインサイトが生まれます</p>
            </div>
        );
    }

    // Full view
    return (
        <div className="space-y-4">
            {/* Section header */}
            <div className="relative overflow-hidden rounded-2xl border border-indigo-200/30 bg-gradient-to-br from-indigo-50/50 via-violet-50/30 to-white/90 p-5">
                <StarParticles />
                <div className="relative z-10">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">
                                Stargazer x My-Style Bridge
                            </p>
                            <p className="text-sm font-bold text-slate-800 mt-1">
                                性格 x スタイルの深層接続
                            </p>
                        </div>
                        <Link
                            href="/stargazer"
                            className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 transition-colors"
                        >
                            もっと深く知る &rarr;
                        </Link>
                    </div>

                    {/* Archetype badge */}
                    {archetype && (
                        <motion.div
                            className="mt-4 rounded-xl p-4 text-white relative overflow-hidden"
                            style={{
                                background: `linear-gradient(135deg, ${archetype.gradient[0]}, ${archetype.gradient[1]})`,
                            }}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                        >
                            <p className="text-[9px] font-bold uppercase tracking-widest text-white/60">
                                Your Archetype
                            </p>
                            <p className="text-lg font-bold mt-1">
                                {archetype.label}
                            </p>
                            <p className="text-[11px] text-white/80 mt-1 leading-relaxed">
                                {archetype.description}
                            </p>
                        </motion.div>
                    )}

                    {/* Observation stats */}
                    {profile.archetypeLabel && (
                        <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-600">
                                {profile.archetypeLabel}
                            </span>
                            <span>
                                / {profile.observationCount}回の観測
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Insight cards */}
            <div className="space-y-2.5">
                {insights.map((insight, i) => (
                    <InsightCardItem
                        key={insight.id}
                        insight={insight}
                        index={i}
                    />
                ))}
            </div>
        </div>
    );
}
