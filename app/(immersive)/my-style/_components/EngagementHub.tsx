"use client";

import { useMemo, useState, useEffect, type ReactNode } from "react";
import { AnimatePresence } from "framer-motion";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";
import { computeStyleDna } from "../_lib/styleDna";
import { detectContradictions } from "../_lib/contradictionDetector";
import { generateAssertions, type AssertionInsight } from "../_lib/assertionEngine";
import { computeRevealStatus, type RevealableInsight } from "../_lib/progressiveReveal";
import { buildAllPersonaProfiles, findCrossPersonaCommon } from "../_lib/personaEngine";

import FormationLine from "./FormationLine";
import TodaysMirror from "./TodaysMirror";
import WeatherOutfitPanel from "./WeatherOutfitPanel";
import AssertionInsightCard from "./AssertionInsightCard";
import StargazerInsightPanel from "./StargazerInsightPanel";
import ContradictionDialogue from "./ContradictionDialogue";

/* ── Safe wrapper ── */

function SafeSection({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
    try { return <>{children}</>; } catch { return <>{fallback}</>; }
}

/* ── Main Component ── */

type Props = {
    state: SavedState;
    swipeState: SwipeLearningState | null;
    onFirstAction?: () => void;
};

export default function EngagementHub({ state, swipeState, onFirstAction }: Props) {
    const [mounted, setMounted] = useState(false);
    const [showContradictionDialogue, setShowContradictionDialogue] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    const styleDna = useMemo(() => computeStyleDna(state, swipeState), [state, swipeState]);
    const contradictions = useMemo(() => detectContradictions(swipeState, state), [state, swipeState]);
    const personas = useMemo(() => buildAllPersonaProfiles(state), [state]);
    const crossPersona = useMemo(() => findCrossPersonaCommon(personas), [personas]);

    const assertions: AssertionInsight[] = useMemo(() => {
        try {
            return generateAssertions({ state, swipeState, styleDna, contradictions, personas, crossPersonaAnalysis: crossPersona });
        } catch { return []; }
    }, [state, swipeState, styleDna, contradictions, personas, crossPersona]);

    if (!mounted) {
        return (
            <div className="space-y-3 animate-pulse">
                <div className="h-16 rounded-2xl bg-slate-100/50" />
                <div className="h-48 rounded-2xl bg-slate-100/50" />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* 1. Formation Line — dynamic stage headline */}
            <FormationLine state={state} swipeState={swipeState} onFirstAction={onFirstAction} />

            {/* 2. Weather + Outfit (HERO) */}
            <SafeSection fallback={<div className="rounded-xl border border-slate-200/30 bg-white/60 p-3 text-center text-[11px] text-slate-400">天気データ取得中...</div>}>
                <WeatherOutfitPanel wardrobeItems={state.wardrobe} />
            </SafeSection>

            {/* 3. Today's Mirror (collapsed) */}
            <SafeSection>
                <TodaysMirror wardrobeItems={state.wardrobe} styleSelections={state.styleSelections} />
            </SafeSection>

            {/* 4. Assertion Spotlight (collapsed) */}
            {assertions.length > 0 && (
                <SafeSection>
                    <AssertionInsightCard insights={assertions} />
                </SafeSection>
            )}

            {/* 5. Contradiction Alert (collapsed) */}
            {contradictions.length > 0 && (
                <button
                    type="button"
                    className="w-full rounded-xl border border-amber-200/50 bg-amber-50/50 p-3 text-left"
                    onClick={() => setShowContradictionDialogue(true)}
                >
                    <div className="flex items-center gap-2">
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">{contradictions.length}個の矛盾</span>
                        <p className="text-[11px] text-amber-700 flex-1">あなたの中にある矛盾が発見されています</p>
                        <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </div>
                </button>
            )}

            {/* 6. Stargazer Bridge (collapsed) */}
            <SafeSection fallback={null}>
                <StargazerInsightPanel myStyleState={state} compact />
            </SafeSection>

            {/* Contradiction Dialogue Modal */}
            <AnimatePresence>
                {showContradictionDialogue && contradictions.length > 0 && (
                    <div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        onClick={() => setShowContradictionDialogue(false)}
                    >
                        <div
                            className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-2xl bg-white shadow-2xl"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex items-center justify-between p-4 border-b border-slate-100">
                                <h3 className="text-lg font-bold text-slate-900">矛盾の探究</h3>
                                <button onClick={() => setShowContradictionDialogue(false)} className="rounded-full bg-slate-100 p-2 text-slate-500 transition hover:bg-slate-200">
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                                </button>
                            </div>
                            <div className="p-4">
                                <ContradictionDialogue contradictions={contradictions} />
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
