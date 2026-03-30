"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";
import { computeStyleDna } from "../_lib/styleDna";

type Props = {
    state: SavedState;
    swipeState: SwipeLearningState | null;
};

type ResonanceResult = {
    matchCount: number;
    totalUsers: number;
    avgMatchedVector: number[] | null;
    similarity: number | null;
};

export default function ResonanceFeed({ state, swipeState }: Props) {
    const [optedIn, setOptedIn] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<ResonanceResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    const dna = useMemo(() => computeStyleDna(state, swipeState), [state, swipeState]);

    const vector = useMemo(
        () => dna.points.map((p) => p.value),
        [dna.points],
    );

    const submit = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetch("/api/my-style/resonance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ vector }),
            });
            if (!res.ok) throw new Error("Failed");
            const data: ResonanceResult = await res.json();
            setResult(data);
        } catch {
            setError("共鳴データの取得に失敗しました");
        } finally {
            setLoading(false);
        }
    }, [vector]);

    // Opt-in consent card
    if (!optedIn) {
        return (
            <GlassCard className="p-5 space-y-3 text-center">
                <div className="text-3xl">🌌</div>
                <h3 className="text-sm font-bold text-slate-800">スタイル共鳴</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                    あなたのスタイルDNAを匿名化し、
                    <br />
                    似た感性を持つ人がどれくらいいるか分析します。
                </p>
                <div className="bg-slate-50 rounded-lg p-3 text-left">
                    <p className="text-[10px] text-slate-500 space-y-1">
                        <span className="block">🔒 個人情報は一切送信されません</span>
                        <span className="block">🔢 数値ベクトルのみを匿名保存</span>
                        <span className="block">🗑️ いつでも削除可能</span>
                    </p>
                </div>
                <GlassButton
                    onClick={() => {
                        setOptedIn(true);
                        submit();
                    }}
                    className="w-full"
                >
                    共鳴を探す
                </GlassButton>
            </GlassCard>
        );
    }

    return (
        <div className="space-y-4">
            {/* Loading state */}
            {loading && (
                <GlassCard className="p-6 text-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="text-3xl inline-block"
                    >
                        🌀
                    </motion.div>
                    <p className="text-xs text-slate-500 mt-2">共鳴を探しています...</p>
                </GlassCard>
            )}

            {/* Error */}
            {error && (
                <GlassCard className="p-4 text-center">
                    <p className="text-xs text-red-500">{error}</p>
                    <button
                        onClick={submit}
                        className="mt-2 text-xs text-orange-500 underline"
                    >
                        再試行
                    </button>
                </GlassCard>
            )}

            {/* Results */}
            <AnimatePresence>
                {result && !loading && (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="space-y-3"
                    >
                        {/* Match count hero */}
                        <GlassCard className="p-5 text-center space-y-2">
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                Style Twins
                            </p>
                            {result.matchCount > 0 ? (
                                <motion.div
                                    initial={{ scale: 0.8, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    transition={{ type: "spring", stiffness: 200, damping: 15 }}
                                    className="text-center py-4"
                                >
                                    <motion.div
                                        animate={{ scale: [1, 1.05, 1] }}
                                        transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                                        className="text-4xl font-black text-slate-900"
                                    >
                                        {result.matchCount}
                                    </motion.div>
                                    <p className="text-sm text-slate-600 mt-1">人のスタイル双子</p>
                                </motion.div>
                            ) : (
                                <motion.p
                                    className="text-4xl font-bold text-orange-500"
                                    initial={{ scale: 0 }}
                                    animate={{ scale: 1 }}
                                    transition={{ type: "spring", delay: 0.2 }}
                                >
                                    {result.matchCount}
                                </motion.p>
                            )}
                            <p className="text-xs text-slate-500">
                                {result.totalUsers}人中、あなたと共鳴するスタイル双子
                            </p>
                        </GlassCard>

                        {/* Similarity details */}
                        {result.similarity !== null && (
                            <GlassCard className="p-4">
                                <div className="flex items-center gap-3">
                                    <div className="flex-1">
                                        <p className="text-[10px] text-slate-400 mb-1">共鳴度</p>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <motion.div
                                                className="h-full rounded-full bg-gradient-to-r from-orange-400 to-amber-400"
                                                initial={{ width: 0 }}
                                                animate={{ width: `${result.similarity * 100}%` }}
                                                transition={{ duration: 0.8, delay: 0.3 }}
                                            />
                                        </div>
                                    </div>
                                    <span className="text-lg font-bold text-orange-500 font-mono">
                                        {Math.round(result.similarity * 100)}%
                                    </span>
                                </div>
                            </GlassCard>
                        )}

                        {/* Matched group tendency */}
                        {result.avgMatchedVector && (
                            <GlassCard className="p-4 space-y-2">
                                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                                    双子たちの傾向
                                </p>
                                <div className="space-y-1.5">
                                    {dna.points.map((point, i) => {
                                        const matchedVal = result.avgMatchedVector?.[i] ?? 0;
                                        return (
                                            <div key={point.label} className="flex items-center gap-2">
                                                <span className="text-[9px] text-slate-500 w-20 shrink-0 truncate">
                                                    {point.label.split("↔")[0]}
                                                </span>
                                                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden relative">
                                                    {/* Your value */}
                                                    <div
                                                        className="absolute top-0 h-full rounded-full bg-orange-400 opacity-50"
                                                        style={{
                                                            left: `${((point.value + 1) / 2) * 100 - 1}%`,
                                                            width: "3px",
                                                        }}
                                                    />
                                                    {/* Matched average */}
                                                    <div
                                                        className="absolute top-0 h-full rounded-full bg-blue-400"
                                                        style={{
                                                            left: `${((matchedVal + 1) / 2) * 100 - 1}%`,
                                                            width: "3px",
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex gap-3 text-[9px] text-slate-400 justify-center mt-1">
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-orange-400 inline-block" /> あなた
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" /> 双子の平均
                                    </span>
                                </div>
                            </GlassCard>
                        )}

                        {result.matchCount === 0 && (
                            <GlassCard className="p-4 text-center">
                                <p className="text-sm text-slate-500 text-center py-4">
                                    まだ共鳴する人は見つかっていません。<br />
                                    あなたのスタイルはそれだけユニークということ。
                                </p>
                            </GlassCard>
                        )}

                        {/* Refresh */}
                        <button
                            onClick={submit}
                            className="w-full text-center text-xs text-orange-500 py-2"
                        >
                            🔄 再検索
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
