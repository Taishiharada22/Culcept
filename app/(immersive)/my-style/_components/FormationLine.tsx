"use client";

import { useMemo, useRef, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { deriveMyStyleSignals } from "../_lib/state";
import { getStyleLaneLabel } from "../_lib/catalog";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";

/* ── Formation stages ── */

interface FormationStage {
    level: number;        // 0-5
    headline: string;
    nextAction: string;
    /** Brief "what just changed" — shown momentarily after stage advance */
    delta?: string;
}

function computeFormationStage(state: SavedState, swipeState: SwipeLearningState | null): FormationStage {
    const itemCount = state.wardrobe.length;
    const styleCount = state.styleSelections.length;
    const setupCount = state.setups.length;
    const hasSwipe = !!swipeState;

    if (itemCount === 0 && styleCount === 0) {
        return { level: 0, headline: "あなたのスタイルが、ここから形になる", nextAction: "最初の一着を入れてみよう" };
    }
    if (itemCount <= 2 && styleCount === 0) {
        return { level: 1, headline: "最初の色が見えてきた", nextAction: "あと数着で、傾向が浮かび上がる" };
    }
    if (itemCount >= 3 && styleCount === 0) {
        return { level: 2, headline: `${itemCount}着の色と素材から、輪郭が動き出している`, nextAction: "「わたし」タブでスタイルの軸を選んでみよう" };
    }
    if (itemCount >= 3 && styleCount >= 1 && !hasSwipe && setupCount === 0) {
        return { level: 3, headline: "軸が定まり始めた — 服との接続が見えてきた", nextAction: "セットアップを組むと、着回しの法則が浮かぶ" };
    }
    if (itemCount >= 5 && styleCount >= 2) {
        return { level: 4, headline: "あなたのスタイルDNAが形成されている", nextAction: setupCount === 0 ? "セットアップで着こなしを試そう" : "毎日の着用記録で、さらに鮮明になる" };
    }
    return { level: 5, headline: "スタイルの輪郭がくっきり見えている", nextAction: "日々の記録が、さらに深い自己理解につながる" };
}

/* ── Reflection headline (for わたし tab) ── */

function computeReflectionHeadline(state: SavedState, swipeState: SwipeLearningState | null): string {
    const derived = deriveMyStyleSignals(state);
    const coreLabel = derived.coreLanes[0] ? getStyleLaneLabel(derived.coreLanes[0]) : null;
    const itemCount = state.wardrobe.length;
    const styleCount = state.styleSelections.length;

    if (itemCount === 0) return "まだ輪郭はない — ここから始まる";
    if (styleCount === 0) return `${itemCount}着のデータだけが見えている`;
    if (coreLabel && derived.rareLanes[0]) {
        const rareLabel = getStyleLaneLabel(derived.rareLanes[0]);
        return `${coreLabel}を軸に、${rareLabel}で揺らす人`;
    }
    if (coreLabel) return `${coreLabel}を中心に、輪郭が見えてきた`;
    return `${styleCount}つの軸が交差している`;
}

/* ── Delta detection ── */

function computeDelta(prev: number, current: number, state: SavedState): string | null {
    if (prev === current) return null;
    if (current > prev) {
        // Stage advanced
        const itemCount = state.wardrobe.length;
        const styleCount = state.styleSelections.length;
        if (current === 1) return `+1着 → 色の傾向が浮かんだ`;
        if (current === 2) return `${itemCount}着 → 素材の輪郭が動いた`;
        if (current === 3) return `スタイル軸を選択 → 接続が生まれた`;
        if (current === 4) return `DNAが形成段階に入った`;
        return `輪郭が鮮明になった`;
    }
    return null;
}

/* ── Promotion variant (今日 tab) ── */

export default function FormationLine({ state, swipeState, onFirstAction }: {
    state: SavedState;
    swipeState: SwipeLearningState | null;
    onFirstAction?: () => void;
}) {
    const stage = useMemo(() => computeFormationStage(state, swipeState), [state, swipeState]);
    const prevLevelRef = useRef(stage.level);
    const [deltaText, setDeltaText] = useState<string | null>(null);
    const [pulsing, setPulsing] = useState(false);

    // Detect stage advancement → show delta + pulse
    useEffect(() => {
        const delta = computeDelta(prevLevelRef.current, stage.level, state);
        if (delta) {
            setDeltaText(delta);
            setPulsing(true);
            const t1 = setTimeout(() => setDeltaText(null), 3000);
            const t2 = setTimeout(() => setPulsing(false), 600);
            prevLevelRef.current = stage.level;
            return () => { clearTimeout(t1); clearTimeout(t2); };
        }
        prevLevelRef.current = stage.level;
    }, [stage.level, state]);

    const dots = Array.from({ length: 5 }, (_, i) => i < stage.level);

    return (
        <div className="space-y-2">
            <AnimatePresence mode="wait">
                <motion.h2
                    key={stage.headline}
                    className="text-[18px] font-black leading-snug tracking-[-0.03em] text-slate-900"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                >
                    {stage.headline}
                </motion.h2>
            </AnimatePresence>

            <div className="flex items-center gap-3">
                {/* Progress dots with pulse effect */}
                <div className="flex gap-1">
                    {dots.map((filled, i) => (
                        <motion.div
                            key={i}
                            className={`h-1.5 rounded-full ${filled ? "bg-slate-900" : "bg-slate-200"}`}
                            animate={{
                                width: filled ? 16 : 6,
                                scale: pulsing && filled && i === stage.level - 1 ? [1, 1.8, 1] : 1,
                            }}
                            transition={{ duration: 0.4 }}
                        />
                    ))}
                </div>

                {/* Delta flash (briefly shows what changed) */}
                <AnimatePresence>
                    {deltaText ? (
                        <motion.span
                            className="text-[11px] font-bold text-slate-900"
                            initial={{ opacity: 0, x: -4 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                        >
                            {deltaText}
                        </motion.span>
                    ) : (
                        /* Next action hint (steady state) */
                        stage.level < 5 ? (
                            stage.level === 0 && onFirstAction ? (
                                <motion.button
                                    key="first-action"
                                    type="button"
                                    onClick={onFirstAction}
                                    className="text-[12px] font-bold text-slate-900 underline underline-offset-2 decoration-slate-300 hover:decoration-slate-900 transition"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    {stage.nextAction}
                                </motion.button>
                            ) : (
                                <motion.span
                                    key="next-action"
                                    className="text-[12px] text-slate-400"
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                >
                                    {stage.nextAction}
                                </motion.span>
                            )
                        ) : null
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

/* ── Reflection variant (わたし tab) ── */

export function FormationReflection({ state, swipeState }: {
    state: SavedState;
    swipeState: SwipeLearningState | null;
}) {
    const headline = useMemo(() => computeReflectionHeadline(state, swipeState), [state, swipeState]);
    const stage = useMemo(() => computeFormationStage(state, swipeState), [state, swipeState]);
    const derived = useMemo(() => deriveMyStyleSignals(state), [state]);

    // Summary stats that change with data
    const itemCount = state.wardrobe.length;
    const styleCount = state.styleSelections.length;
    const signalCount = derived.discoveries.length + derived.timelineTrend.length;

    return (
        <div className="space-y-3">
            <AnimatePresence mode="wait">
                <motion.h2
                    key={headline}
                    className="text-[18px] font-black leading-snug tracking-[-0.03em] text-slate-900"
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3 }}
                >
                    {headline}
                </motion.h2>
            </AnimatePresence>

            {/* Live formation stats — changes with every input */}
            {itemCount > 0 && (
                <motion.div
                    className="flex gap-4"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.1 }}
                >
                    <div className="flex items-baseline gap-1">
                        <motion.span
                            key={itemCount}
                            className="text-[20px] font-black text-slate-900"
                            initial={{ scale: 1.2 }}
                            animate={{ scale: 1 }}
                        >
                            {itemCount}
                        </motion.span>
                        <span className="text-[10px] text-slate-400">着</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <motion.span
                            key={styleCount}
                            className="text-[20px] font-black text-slate-900"
                            initial={{ scale: 1.2 }}
                            animate={{ scale: 1 }}
                        >
                            {styleCount}
                        </motion.span>
                        <span className="text-[10px] text-slate-400">軸</span>
                    </div>
                    {signalCount > 0 && (
                        <div className="flex items-baseline gap-1">
                            <motion.span
                                key={signalCount}
                                className="text-[20px] font-black text-slate-900"
                                initial={{ scale: 1.2 }}
                                animate={{ scale: 1 }}
                            >
                                {signalCount}
                            </motion.span>
                            <span className="text-[10px] text-slate-400">発見</span>
                        </div>
                    )}
                </motion.div>
            )}
        </div>
    );
}
