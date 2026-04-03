"use client";

import { useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { deriveMyStyleSignals } from "../_lib/state";
import { getStyleLaneLabel } from "../_lib/catalog";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";

/* ── Stage computation ── */

interface FormationStage {
    level: number;
    headline: string;
    sub: string;
}

function computeStage(state: SavedState, swipeState: SwipeLearningState | null): FormationStage {
    const items = state.wardrobe.length;
    const styles = state.styleSelections.length;
    const setups = state.setups.length;

    if (items === 0 && styles === 0) {
        return { level: 0, headline: "今日の自分を、ここから始めよう", sub: "最初の一着を登録してみよう" };
    }
    if (items <= 2 && styles === 0) {
        return { level: 1, headline: "最初の色が見えてきた", sub: "あと数着で傾向が浮かぶ" };
    }
    if (items >= 3 && styles === 0) {
        return { level: 2, headline: `${items}着から傾向が動き出した`, sub: "「わたし」タブで好みを選んでみよう" };
    }

    const derived = deriveMyStyleSignals(state);
    const core = derived.coreLanes[0] ? getStyleLaneLabel(derived.coreLanes[0]) : null;

    if (items >= 3 && styles >= 1 && setups === 0) {
        return { level: 3, headline: core ? `${core}を軸に、方向が見えてきた` : "好みの方向が見えてきた", sub: "コーデを組むと着回しの法則が浮かぶ" };
    }
    if (items >= 5 && styles >= 2) {
        const rare = derived.rareLanes[0] ? getStyleLaneLabel(derived.rareLanes[0]) : null;
        const headline = core && rare ? `${core}を軸に、${rare}で揺らす` : "あなたらしさが見えている";
        return { level: 4, headline, sub: "日々の記録で、さらに鮮明になる" };
    }
    return { level: 5, headline: "あなたのスタイルが見えている", sub: "記録が深い理解につながる" };
}

/* ── Component ── */

export default function TodayHero({ state, swipeState, onFirstAction }: {
    state: SavedState;
    swipeState: SwipeLearningState | null;
    onFirstAction?: () => void;
}) {
    const stage = useMemo(() => computeStage(state, swipeState), [state, swipeState]);
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
                <div className="flex gap-1">
                    {dots.map((filled, i) => (
                        <motion.div
                            key={i}
                            className={`h-1.5 rounded-full ${filled ? "bg-slate-900" : "bg-slate-200"}`}
                            animate={{ width: filled ? 16 : 6 }}
                            transition={{ duration: 0.4 }}
                        />
                    ))}
                </div>

                {stage.level === 0 && onFirstAction ? (
                    <button
                        type="button"
                        onClick={onFirstAction}
                        className="text-[12px] font-bold text-slate-900 underline underline-offset-2 decoration-slate-300 transition hover:decoration-slate-900"
                    >
                        {stage.sub}
                    </button>
                ) : stage.level < 5 ? (
                    <span className="text-[12px] text-slate-400">{stage.sub}</span>
                ) : null}
            </div>
        </div>
    );
}
