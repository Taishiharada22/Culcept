"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";
import { buildEcosystemSnapshot, type EcosystemInsight } from "../_lib/ecosystem";

type Props = {
    state: SavedState;
    swipeState: SwipeLearningState | null;
};

const TYPE_COLORS: Record<EcosystemInsight["type"], string> = {
    discovery: "border-violet-200 bg-violet-50/60",
    growth: "border-emerald-200 bg-emerald-50/60",
    contradiction: "border-amber-200 bg-amber-50/60",
    connection: "border-sky-200 bg-sky-50/60",
    prediction: "border-rose-200 bg-rose-50/60",
};

const TYPE_LABELS: Record<EcosystemInsight["type"], string> = {
    discovery: "発見",
    growth: "成長のヒント",
    contradiction: "矛盾",
    connection: "つながり",
    prediction: "予測",
};

const MOMENTUM_LABELS: Record<string, { label: string; emoji: string; color: string }> = {
    accelerating: { label: "加速中", emoji: "🚀", color: "text-emerald-600" },
    stable: { label: "安定", emoji: "⚖️", color: "text-sky-600" },
    exploring: { label: "探索中", emoji: "🧭", color: "text-amber-600" },
    dormant: { label: "静観", emoji: "🌙", color: "text-slate-500" },
};

export default function EcosystemInsightsPanel({ state, swipeState }: Props) {
    const snapshot = useMemo(
        () => buildEcosystemSnapshot(state, swipeState),
        [state, swipeState],
    );

    const momentum = MOMENTUM_LABELS[snapshot.journeyMomentum] ?? MOMENTUM_LABELS.dormant;

    return (
        <div className="space-y-4">
            {/* Ecosystem status bar */}
            <GlassCard className="p-4">
                <div className="flex items-center justify-between mb-3">
                    <div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                            ECOSYSTEM STATUS
                        </p>
                        <p className="text-sm font-bold text-slate-800 mt-1">
                            9機能がつながる全体像
                        </p>
                    </div>
                    <div className="text-right">
                        <span className={`text-lg ${momentum.color}`}>{momentum.emoji}</span>
                        <p className={`text-[10px] font-bold ${momentum.color}`}>{momentum.label}</p>
                    </div>
                </div>

                {/* Alignment meter */}
                <div className="flex items-center gap-3">
                    <div className="flex-1">
                        <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span>DNA × ペルソナ整合性</span>
                            <span className="font-mono">{Math.round(snapshot.dnaPersonaAlignment * 100)}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full rounded-full bg-gradient-to-r from-violet-400 to-rose-400"
                                initial={{ width: 0 }}
                                animate={{ width: `${snapshot.dnaPersonaAlignment * 100}%` }}
                                transition={{ duration: 0.8, ease: "easeOut" }}
                            />
                        </div>
                    </div>
                </div>

                {/* Material-DNA connection */}
                {snapshot.materialDnaConnection && (
                    <p className="mt-3 text-[11px] text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
                        🧬 {snapshot.materialDnaConnection}
                    </p>
                )}
            </GlassCard>

            {/* Insights stream */}
            <AnimatePresence>
                {snapshot.insights.slice(0, 5).map((insight, i) => (
                    <motion.div
                        key={`${insight.type}-${i}`}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1, duration: 0.3 }}
                    >
                        <div className={`rounded-xl border p-3 ${TYPE_COLORS[insight.type]}`}>
                            <div className="flex items-start gap-2">
                                <span className="text-base mt-0.5">{insight.emoji}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">
                                            {TYPE_LABELS[insight.type]}
                                        </span>
                                        <div className="flex gap-0.5">
                                            {insight.relatedFeatures.slice(0, 3).map((f) => (
                                                <span
                                                    key={f}
                                                    className="rounded-full bg-white/60 px-1.5 py-0.5 text-[8px] text-slate-400"
                                                >
                                                    {f}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <p className="text-xs font-bold text-slate-800 mt-0.5">
                                        {insight.title}
                                    </p>
                                    <p className="text-[11px] text-slate-600 leading-relaxed mt-0.5">
                                        {insight.description}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                ))}
            </AnimatePresence>

            {snapshot.insights.length === 0 && (
                <div className="text-center py-8">
                    <p className="text-slate-400 text-sm">
                        データが蓄積されると、機能間の洞察がここに流れます
                    </p>
                </div>
            )}
        </div>
    );
}
