"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { SavedState } from "../_lib/types";
import { deriveMyStyleSignals } from "../_lib/state";
import { mineStyleLogic } from "../_lib/styleLogicMiner";

/* ── Types ── */

type AIMood = "encouraging" | "curious" | "affirming" | "challenging";

interface AIInsight {
    coreReading: string;
    hiddenPotential: string;
    nextMove: string;
    mood: AIMood;
}

type LoadState = "idle" | "loading" | "loaded" | "error";

/* ── Constants ── */

const MOOD_META: Record<AIMood, { icon: string; label: string; border: string; bg: string }> = {
    encouraging: { icon: "🌟", label: "応援", border: "border-amber-200/60", bg: "from-amber-50/50 to-white/80" },
    curious: { icon: "🔍", label: "探究", border: "border-indigo-200/60", bg: "from-indigo-50/50 to-white/80" },
    affirming: { icon: "✨", label: "肯定", border: "border-emerald-200/60", bg: "from-emerald-50/50 to-white/80" },
    challenging: { icon: "🚀", label: "挑戦", border: "border-rose-200/60", bg: "from-rose-50/50 to-white/80" },
};

const CACHE_KEY = "culcept_ai_insight_v1";
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/* ── Helpers ── */

interface CachedInsight {
    insight: AIInsight;
    timestamp: number;
    fallback: boolean;
}

function loadCached(): CachedInsight | null {
    try {
        const raw = localStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedInsight;
        if (Date.now() - parsed.timestamp > CACHE_TTL_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveCached(insight: AIInsight, fallback: boolean) {
    try {
        const data: CachedInsight = { insight, timestamp: Date.now(), fallback };
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
        // ignore
    }
}

/* ── Sub-components ── */

function InsightSection({
    icon,
    label,
    text,
    delay,
}: {
    icon: string;
    label: string;
    text: string;
    delay: number;
}) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay, ease: "easeOut" }}
            className="rounded-2xl border border-white/70 bg-white/60 p-4 backdrop-blur-lg"
        >
            <div className="mb-2 flex items-center gap-2">
                <span className="text-lg leading-none">{icon}</span>
                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400">
                    {label}
                </span>
            </div>
            <p className="text-[14px] leading-7 text-slate-700">{text}</p>
        </motion.div>
    );
}

function SkeletonPanel() {
    return (
        <div className="space-y-3">
            {[1, 2, 3].map((i) => (
                <div
                    key={i}
                    className="rounded-2xl border border-white/70 bg-white/50 p-4 backdrop-blur-lg"
                >
                    <div className="mb-3 flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-slate-200/80 animate-pulse" />
                        <div className="h-3 w-16 rounded-full bg-slate-200/60 animate-pulse" />
                    </div>
                    <div className="space-y-2">
                        <div className="h-4 w-full rounded-full bg-slate-200/50 animate-pulse" />
                        <div className="h-4 w-3/4 rounded-full bg-slate-200/40 animate-pulse" />
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ── Main Component ── */

interface Props {
    state: SavedState;
    pcSeason?: string | null;
    bodyType?: string | null;
    archetypeCode?: string | null;
}

export default function AIInsightPanel({
    state,
    pcSeason,
    bodyType,
    archetypeCode,
}: Props) {
    const [loadState, setLoadState] = useState<LoadState>("idle");
    const [insight, setInsight] = useState<AIInsight | null>(null);
    const [isFallback, setIsFallback] = useState(false);

    // Build the payload from current state
    const buildPayload = useCallback(() => {
        const derived = deriveMyStyleSignals(state);
        const logicProfile = mineStyleLogic(state, []);
        const confirmedRules = logicProfile.rules
            .filter((r) => r.confidence >= 0.5)
            .map((r) => r.description);

        const wardrobeColors = state.wardrobe
            .map((i) => i.colorName ?? i.color)
            .filter(Boolean);
        const wardrobeCategories = state.wardrobe
            .map((i) => i.category)
            .filter(Boolean);

        return {
            coreLanes: derived.coreLanes,
            rareLanes: derived.rareLanes,
            secretLanes: derived.secretLanes,
            dominantColors: [...new Set(wardrobeColors)].slice(0, 8),
            dominantImpressions: derived.dominantImpressions,
            wardrobeCategories: [...new Set(wardrobeCategories)],
            wardrobeCount: state.wardrobe.length,
            setupCount: state.setups.length,
            currentContour: derived.currentContourText,
            discoveries: derived.discoveries.slice(0, 5),
            pcSeason: pcSeason ?? undefined,
            bodyType: bodyType ?? undefined,
            archetypeCode: archetypeCode ?? undefined,
            styleRules: confirmedRules.slice(0, 5),
        };
    }, [state, pcSeason, bodyType, archetypeCode]);

    // Auto-load cached insight on mount
    useEffect(() => {
        const cached = loadCached();
        if (cached) {
            setInsight(cached.insight);
            setIsFallback(cached.fallback);
            setLoadState("loaded");
        }
    }, []);

    const fetchInsight = useCallback(async () => {
        setLoadState("loading");
        try {
            const payload = buildPayload();
            const res = await fetch("/api/my-style/ai-insight", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });

            if (!res.ok) {
                if (res.status === 401) {
                    // Not logged in — show offline fallback
                    setInsight({
                        coreReading: "ログインすると、AIがあなたのスタイル傾向を深く読み取ります。",
                        hiddenPotential: "ワードローブとセットアップのデータから、無意識の好みが見えてきます。",
                        nextMove: "まずはログインして、AIインサイトを有効にしてみてください。",
                        mood: "encouraging",
                    });
                    setIsFallback(true);
                    setLoadState("loaded");
                    return;
                }
                throw new Error(`HTTP ${res.status}`);
            }

            const json = await res.json();
            if (json.ok && json.insight) {
                setInsight(json.insight);
                setIsFallback(json.fallback ?? false);
                saveCached(json.insight, json.fallback ?? false);
                setLoadState("loaded");
            } else {
                throw new Error("Invalid response");
            }
        } catch {
            setLoadState("error");
        }
    }, [buildPayload]);

    const moodMeta = insight ? MOOD_META[insight.mood] ?? MOOD_META.encouraging : null;

    return (
        <div className="space-y-3">
            {/* Header */}
            <GlassCard className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="mb-1 flex items-center gap-2">
                            <span className="text-xl">🤖</span>
                            <h3 className="text-[15px] font-black tracking-tight text-slate-800">
                                AIインサイト
                            </h3>
                        </div>
                        <p className="text-[12px] leading-relaxed text-slate-500">
                            AIがあなたのスタイルデータを深く読み解く
                        </p>
                    </div>
                    {loadState === "loaded" && moodMeta && (
                        <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold ${moodMeta.border} bg-gradient-to-r ${moodMeta.bg}`}>
                            {moodMeta.icon} {moodMeta.label}
                        </span>
                    )}
                </div>

                {/* Generate / refresh button */}
                {(loadState === "idle" || loadState === "error" || (loadState === "loaded" && isFallback)) && (
                    <div className="mt-3">
                        <GlassButton
                            variant="primary"
                            size="sm"
                            fullWidth
                            onClick={fetchInsight}
                        >
                            {loadState === "error" ? "再試行する" : loadState === "loaded" ? "AIに再分析させる" : "AIに分析してもらう"}
                        </GlassButton>
                    </div>
                )}

                {loadState === "loaded" && !isFallback && (
                    <button
                        type="button"
                        onClick={fetchInsight}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200/70 bg-white/60 py-2 text-[12px] font-semibold text-slate-500 transition hover:bg-white/80 active:scale-[0.98]"
                    >
                        <span>🔄</span> 再分析
                    </button>
                )}
            </GlassCard>

            {/* Loading state */}
            {loadState === "loading" && <SkeletonPanel />}

            {/* Error state */}
            {loadState === "error" && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="rounded-2xl border border-dashed border-red-200/60 bg-red-50/30 p-4 text-center"
                >
                    <p className="text-[13px] font-bold text-red-600 mb-1">分析に失敗しました</p>
                    <p className="text-[11px] text-red-400">ネットワーク接続を確認して再試行してください</p>
                </motion.div>
            )}

            {/* Insight display */}
            <AnimatePresence>
                {loadState === "loaded" && insight && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-3"
                    >
                        <InsightSection
                            icon="💎"
                            label="Core Reading"
                            text={insight.coreReading}
                            delay={0}
                        />
                        <InsightSection
                            icon="🔮"
                            label="Hidden Potential"
                            text={insight.hiddenPotential}
                            delay={0.12}
                        />
                        <InsightSection
                            icon="🎯"
                            label="Next Move"
                            text={insight.nextMove}
                            delay={0.24}
                        />

                        {isFallback && (
                            <motion.p
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.4 }}
                                className="text-center text-[10px] text-slate-400 px-4"
                            >
                                ※ デフォルトメッセージです。AIに再分析させるとパーソナライズされます
                            </motion.p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Idle state — no insight yet */}
            {loadState === "idle" && !insight && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-2xl border border-dashed border-slate-200/70 bg-white/40 p-6 text-center"
                >
                    <div className="text-4xl mb-3">🧠</div>
                    <p className="text-[14px] font-bold text-slate-600 mb-1">
                        AIがあなたのスタイルを読み解く
                    </p>
                    <p className="text-[12px] text-slate-400 leading-relaxed">
                        ワードローブ・セットアップ・スタイル選択から<br />
                        深層的な傾向を分析します
                    </p>
                </motion.div>
            )}
        </div>
    );
}
