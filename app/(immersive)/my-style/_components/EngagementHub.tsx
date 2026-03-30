"use client";

import { useMemo, useState, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassBadge, FadeInView } from "@/components/ui/glassmorphism-design";
import type { SavedState } from "../_lib/types";
import type { SwipeLearningState } from "../_lib/swipeLearningAxes";
import { computeStyleDna } from "../_lib/styleDna";
import { detectContradictions } from "../_lib/contradictionDetector";
import { generateAssertions, type AssertionInsight } from "../_lib/assertionEngine";
import { computeRevealStatus, type RevealableInsight } from "../_lib/progressiveReveal";
import { computeRarity, type RarityProfile } from "../_lib/dnaRarity";
import { buildAllPersonaProfiles, findCrossPersonaCommon, type PersonaProfile } from "../_lib/personaEngine";

import TodaysMirror from "./TodaysMirror";
import WeatherOutfitPanel from "./WeatherOutfitPanel";
import AssertionInsightCard from "./AssertionInsightCard";
import RevelationNotice from "./RevelationNotice";
import DnaRarityBadge from "./DnaRarityBadge";
import StargazerInsightPanel from "./StargazerInsightPanel";
import ContradictionDialogue from "./ContradictionDialogue";

/* ── Time-of-day ── */

type DayPhase = "morning" | "afternoon" | "evening" | "night";

function getDayPhase(): DayPhase {
    const h = new Date().getHours();
    if (h >= 5 && h < 12) return "morning";
    if (h >= 12 && h < 17) return "afternoon";
    if (h >= 17 && h < 21) return "evening";
    return "night";
}

function getGreeting(phase: DayPhase): string {
    switch (phase) {
        case "morning": return "おはようございます。今日のあなたを映します。";
        case "afternoon": return "午後の自分に、少しだけ目を向けてみませんか。";
        case "evening": return "今日の自分を振り返る時間です。";
        case "night": return "静かな夜に、内面を眺める。";
    }
}

const PHASE_ACCENTS: Record<DayPhase, { gradient: string; dotColor: string }> = {
    morning: { gradient: "from-amber-50/60 via-orange-50/30 to-white/80", dotColor: "bg-amber-400" },
    afternoon: { gradient: "from-sky-50/50 via-blue-50/30 to-white/80", dotColor: "bg-sky-400" },
    evening: { gradient: "from-violet-50/50 via-indigo-50/30 to-white/80", dotColor: "bg-violet-400" },
    night: { gradient: "from-slate-100/60 via-indigo-50/40 to-white/80", dotColor: "bg-indigo-500" },
};

/* ── Last-visit & streak ── */

const LAST_VISIT_KEY = "culcept_my_style_last_visit";
const STREAK_KEY = "culcept_my_style_streak";

interface StreakData { count: number; lastDate: string; }

function getLastVisit(): Date | null {
    if (typeof window === "undefined") return null;
    try { const r = localStorage.getItem(LAST_VISIT_KEY); return r ? new Date(r) : null; } catch { return null; }
}
function recordVisit() { try { localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString()); } catch { /* */ } }

function getStreak(): StreakData {
    if (typeof window === "undefined") return { count: 0, lastDate: "" };
    try { const r = localStorage.getItem(STREAK_KEY); return r ? JSON.parse(r) : { count: 0, lastDate: "" }; } catch { return { count: 0, lastDate: "" }; }
}
function updateStreak(): StreakData {
    const today = new Date().toISOString().slice(0, 10);
    const cur = getStreak();
    if (cur.lastDate === today) return cur;
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const ns: StreakData = { count: cur.lastDate === yesterday ? cur.count + 1 : 1, lastDate: today };
    try { localStorage.setItem(STREAK_KEY, JSON.stringify(ns)); } catch { /* */ }
    return ns;
}

/* ── Safe wrapper ── */

function SafeSection({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
    try { return <>{children}</>; } catch { return <>{fallback}</>; }
}

/* ── Main Component ── */

type Props = {
    state: SavedState;
    swipeState: SwipeLearningState | null;
};

export default function EngagementHub({ state, swipeState }: Props) {
    const [phase, setPhase] = useState<DayPhase>("morning");
    const [streak, setStreak] = useState<StreakData>({ count: 0, lastDate: "" });
    const [lastVisit, setLastVisit] = useState<Date | null>(null);
    const [mounted, setMounted] = useState(false);
    const [showContradictionDialogue, setShowContradictionDialogue] = useState(false);

    useEffect(() => {
        /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
        setPhase(getDayPhase());
        setLastVisit(getLastVisit());
        setStreak(updateStreak());
        recordVisit();
        setMounted(true);
        /* eslint-enable react-hooks/set-state-in-effect */
    }, []);

    // Compute engines
    const styleDna = useMemo(() => computeStyleDna(state, swipeState), [state, swipeState]);
    const contradictions = useMemo(() => detectContradictions(swipeState, state), [state, swipeState]);
    const personas = useMemo(() => buildAllPersonaProfiles(state), [state]);
    const crossPersona = useMemo(() => findCrossPersonaCommon(personas), [personas]);

    const assertions: AssertionInsight[] = useMemo(() => {
        try {
            return generateAssertions({ state, swipeState, styleDna, contradictions, personas, crossPersonaAnalysis: crossPersona });
        } catch { return []; }
    }, [state, swipeState, styleDna, contradictions, personas, crossPersona]);

    const revealStatus: RevealableInsight[] = useMemo(() => {
        try { return computeRevealStatus(state, swipeState); } catch { return []; }
    }, [state, swipeState]);

    const rarityProfile: RarityProfile | null = useMemo(() => {
        try { return computeRarity(styleDna, state.styleSelections, contradictions); } catch { return null; }
    }, [styleDna, state.styleSelections, contradictions]);

    const newItemsSinceLastVisit = useMemo(() => {
        if (!lastVisit) return 0;
        const t = lastVisit.getTime();
        return state.wardrobe.filter((i) => i.addedAt && new Date(i.addedAt).getTime() > t).length;
    }, [state, lastVisit]);

    const todayObservations = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10);
        return state.wardrobe.filter((i) => i.addedAt?.startsWith(today)).length;
    }, [state]);

    const accent = PHASE_ACCENTS[phase];

    if (!mounted) {
        return (
            <div className="space-y-3 animate-pulse">
                <div className="h-24 rounded-2xl bg-slate-100/50" />
                <div className="h-16 rounded-2xl bg-slate-100/50" />
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* 1. Today's Mirror */}
            <FadeInView delay={0}>
                <div className={`relative rounded-2xl border border-slate-200/30 bg-gradient-to-br ${accent.gradient} p-4 overflow-hidden`}>
                    <div className="flex items-center gap-2 mb-3">
                        <motion.div className={`w-2 h-2 rounded-full ${accent.dotColor}`} animate={{ opacity: [0.5, 1, 0.5] }} transition={{ duration: 2, repeat: Infinity }} />
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Daily Briefing</p>
                        {newItemsSinceLastVisit > 0 && (
                            <span className="ml-auto flex items-center gap-1">
                                <motion.span className="inline-flex items-center rounded-full bg-rose-500 px-1.5 py-0.5 text-[8px] font-bold text-white uppercase tracking-wider" animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 1.5, repeat: Infinity }}>New</motion.span>
                                <span className="text-[10px] text-slate-500">{newItemsSinceLastVisit}件の更新</span>
                            </span>
                        )}
                    </div>
                    <p className="text-[13px] text-slate-600 leading-relaxed">{getGreeting(phase)}</p>
                    <SafeSection>
                        <div className="mt-3">
                            <TodaysMirror wardrobeItems={state.wardrobe} styleSelections={state.styleSelections} />
                        </div>
                    </SafeSection>
                </div>
            </FadeInView>

            {/* 2. Weather + Outfit */}
            <FadeInView delay={0.08}>
                <SafeSection fallback={<div className="rounded-xl border border-slate-200/30 bg-white/60 p-3 text-center text-[11px] text-slate-400">天気データ取得中...</div>}>
                    <WeatherOutfitPanel wardrobeItems={state.wardrobe} />
                </SafeSection>
            </FadeInView>

            {/* 3. Assertion Spotlight */}
            {assertions.length > 0 && (
                <FadeInView delay={0.16}>
                    <SafeSection>
                        <AssertionInsightCard insights={assertions} />
                    </SafeSection>
                </FadeInView>
            )}

            {/* 4. Progressive Revelation */}
            {revealStatus.length > 0 && (
                <FadeInView delay={0.24}>
                    <SafeSection fallback={
                        <div className="rounded-xl border border-slate-200/30 bg-white/60 p-3">
                            <div className="flex items-center justify-between text-[10px]">
                                <span className="text-slate-400 font-bold uppercase tracking-widest">Progress</span>
                                <span className="font-mono text-slate-500">{revealStatus.filter(r => r.isUnlocked).length}/{revealStatus.length}</span>
                            </div>
                            <div className="mt-1.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <motion.div className="h-full rounded-full bg-gradient-to-r from-violet-400 to-rose-400" initial={{ width: 0 }} animate={{ width: `${(revealStatus.filter(r => r.isUnlocked).length / revealStatus.length) * 100}%` }} transition={{ duration: 0.8, ease: "easeOut" }} />
                            </div>
                        </div>
                    }>
                        <RevelationNotice status={revealStatus} />
                    </SafeSection>
                </FadeInView>
            )}

            {/* 5. Contradiction Alert */}
            {contradictions.length > 0 && (
                <FadeInView delay={0.32}>
                    <motion.div className="rounded-xl border border-amber-200/50 bg-amber-50/50 p-3 cursor-pointer" whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }} onClick={() => setShowContradictionDialogue(true)}>
                        <div className="flex items-center gap-2">
                            <GlassBadge variant="warning" size="sm">{contradictions.length}個の矛盾</GlassBadge>
                            <p className="text-[11px] text-amber-700 flex-1">あなたの中にある矛盾が発見されています</p>
                            <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                        </div>
                    </motion.div>
                </FadeInView>
            )}

            {/* 6. Quick Stats Row */}
            <FadeInView delay={0.4}>
                <div className="flex items-stretch gap-2">
                    {rarityProfile && (
                        <div className="flex-1">
                            <SafeSection fallback={<div className="rounded-xl border border-slate-200/40 bg-white/60 p-3 text-center"><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">DNA Rarity</p><p className="text-xs text-slate-500 mt-1">--</p></div>}>
                                <DnaRarityBadge profile={rarityProfile} />
                            </SafeSection>
                        </div>
                    )}
                    <div className="flex-1 rounded-xl border border-slate-200/40 bg-white/60 p-3 text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Streak</p>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">{streak.count}<span className="text-[10px] font-normal text-slate-400 ml-0.5">日</span></p>
                    </div>
                    <div className="flex-1 rounded-xl border border-slate-200/40 bg-white/60 p-3 text-center">
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Today</p>
                        <p className="text-lg font-bold text-slate-800 mt-0.5">{todayObservations}<span className="text-[10px] font-normal text-slate-400 ml-0.5">件</span></p>
                    </div>
                </div>
            </FadeInView>

            {/* 7. Stargazer Bridge */}
            <FadeInView delay={0.48}>
                <SafeSection fallback={null}>
                    <StargazerInsightPanel myStyleState={state} compact />
                </SafeSection>
            </FadeInView>

            {/* Contradiction Dialogue Modal */}
            <AnimatePresence>
                {showContradictionDialogue && contradictions.length > 0 && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={() => setShowContradictionDialogue(false)}
                    >
                        <motion.div
                            className="w-full max-w-lg max-h-[85vh] overflow-auto rounded-2xl bg-white shadow-2xl"
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
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
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
