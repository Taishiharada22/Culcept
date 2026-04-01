"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";
import { safeLSSet } from "@/lib/safeLocalStorage";
import { hydrateTourStates, isTourSeen, markTourSeen as markTourSeenDB } from "@/lib/tour/tourState";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TabTourItem {
  key: string;
  icon: string;
  label: string;
  title: string;
  description: string;
}

export interface FeatureIntroductionProps {
  sectionKey: string;
  // Phase 1: Intro Card
  introTitle: string;
  introIcon: string;
  introDescription: string;
  introActions: string;
  introBenefit: string;
  // Phase 2: Tab Tour
  tabs: TabTourItem[];
  startingTab?: string;
  onComplete: (startingTab?: string) => void;
  tabBarRef?: React.RefObject<HTMLElement | null>;
}

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

function introSeenKey(sectionKey: string) {
  return `aneurasync_guide_${sectionKey}_seen`;
}

function tourDoneKey(sectionKey: string) {
  return `aneurasync_tabtour_${sectionKey}_done`;
}

function hasSeenIntro(sectionKey: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(introSeenKey(sectionKey)) === "1";
}

function markIntroSeen(sectionKey: string) {
  if (typeof window === "undefined") return;
  safeLSSet(introSeenKey(sectionKey), "1");
}

function hasDoneTour(sectionKey: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(tourDoneKey(sectionKey)) === "1";
}

function markTourDone(sectionKey: string) {
  if (typeof window === "undefined") return;
  safeLSSet(tourDoneKey(sectionKey), "1");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

type Phase = "idle" | "intro" | "tour" | "done";

export default function FeatureIntroduction({
  sectionKey,
  introTitle,
  introIcon,
  introDescription,
  introActions,
  introBenefit,
  tabs,
  startingTab,
  onComplete,
  tabBarRef,
}: FeatureIntroductionProps) {
  // Start idle — wait for DB hydrate before deciding phase
  const [phase, setPhase] = useState<Phase>("idle");
  const [tourStep, setTourStep] = useState(0);

  // Hydrate tour state from DB, then decide phase
  useEffect(() => {
    let cancelled = false;
    hydrateTourStates().then(() => {
      if (cancelled) return;
      // DB-backed check: isTourSeen checks seen_version >= current_version
      const seen = isTourSeen(sectionKey);
      if (seen) {
        setPhase("done");
        return;
      }
      // Not seen — check if intro part was seen (localStorage legacy)
      if (!hasSeenIntro(sectionKey)) {
        setPhase("intro");
      } else if (tabs.length > 0 && !hasDoneTour(sectionKey)) {
        setPhase("tour");
      } else {
        // Legacy localStorage says seen but DB doesn't — show intro
        setPhase("intro");
      }
    });
    return () => { cancelled = true; };
  }, [sectionKey, tabs.length]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleDismissIntro = useCallback(async () => {
    markIntroSeen(sectionKey);
    if (tabs.length > 0) {
      setPhase("tour");
      setTourStep(0);
    } else {
      markTourDone(sectionKey);
      await markTourSeenDB(sectionKey);
      setPhase("done");
      onComplete(startingTab);
    }
  }, [sectionKey, tabs.length, onComplete, startingTab]);

  const handleSkipIntro = useCallback(async () => {
    markIntroSeen(sectionKey);
    if (tabs.length > 0) {
      markTourDone(sectionKey);
    }
    await markTourSeenDB(sectionKey);
    setPhase("done");
    onComplete(startingTab);
  }, [sectionKey, tabs.length, onComplete, startingTab]);

  const handleTourNext = useCallback(async () => {
    if (tourStep < tabs.length - 1) {
      setTourStep((s) => s + 1);
    } else {
      // Last step — complete
      markTourDone(sectionKey);
      await markTourSeenDB(sectionKey);
      setPhase("done");
      onComplete(startingTab ?? tabs[tabs.length - 1]?.key);
    }
  }, [tourStep, tabs, sectionKey, onComplete, startingTab]);

  const handleTourSkip = useCallback(async () => {
    markTourDone(sectionKey);
    await markTourSeenDB(sectionKey);
    setPhase("done");
    onComplete(startingTab);
  }, [sectionKey, onComplete, startingTab]);

  // -----------------------------------------------------------------------
  // Render nothing if done
  // -----------------------------------------------------------------------

  if (phase === "idle" || phase === "done") return null;

  // -----------------------------------------------------------------------
  // Phase 1: Intro Card
  // -----------------------------------------------------------------------

  if (phase === "intro") {
    return (
      <AnimatePresence>
        <motion.div
          key="intro-overlay"
          className="fixed inset-0 z-[60] flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={handleSkipIntro}
          />

          {/* Card */}
          <motion.div
            className="relative mx-5 w-full max-w-xs rounded-xl border border-white/40 bg-white/95 shadow-2xl backdrop-blur-xl ring-1 ring-slate-200/50"
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 24 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
          >
            {/* Close button */}
            <button
              type="button"
              onClick={handleSkipIntro}
              className="absolute right-2.5 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-slate-100/80 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
              aria-label="閉じる"
            >
              <span className="text-xs">✕</span>
            </button>

            <div className="px-4 pb-4 pt-3.5 space-y-2.5">
              {/* Header */}
              <div className="flex items-center gap-2">
                <span className="text-2xl">{introIcon}</span>
                <h2 className="text-base font-bold text-slate-800">
                  {introTitle}
                </h2>
              </div>

              {/* Sections */}
              <div className="space-y-2">
                <div className="rounded-lg bg-slate-50/80 p-2.5 space-y-0.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    ここには何が？
                  </p>
                  <p className="text-xs leading-relaxed text-slate-700">
                    {introDescription}
                  </p>
                </div>

                <div className="rounded-lg bg-slate-50/80 p-2.5 space-y-0.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    できること
                  </p>
                  <p className="text-xs leading-relaxed text-slate-700">
                    {introActions}
                  </p>
                </div>

                <div className="rounded-lg bg-gradient-to-br from-indigo-50/80 to-violet-50/80 p-2.5 space-y-0.5">
                  <p className="text-[9px] font-bold uppercase tracking-wider text-indigo-400">
                    入力するとどうなる？
                  </p>
                  <p className="text-xs leading-relaxed text-slate-700">
                    {introBenefit}
                  </p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-0.5">
                <button
                  type="button"
                  onClick={handleSkipIntro}
                  className="text-xs text-slate-400 transition-colors hover:text-slate-600"
                >
                  スキップ
                </button>
                <div className="flex-1" />
                {tabs.length > 0 ? (
                  <GlassButton
                    variant="primary"
                    size="sm"
                    onClick={handleDismissIntro}
                  >
                    タブツアーへ →
                  </GlassButton>
                ) : (
                  <GlassButton
                    variant="primary"
                    size="sm"
                    onClick={handleSkipIntro}
                  >
                    はじめる
                  </GlassButton>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  // -----------------------------------------------------------------------
  // Phase 2: Tab Tour — タブアイコンをハイライトしながら説明
  // -----------------------------------------------------------------------

  const currentTab = tabs[tourStep];
  if (!currentTab) return null;

  const isLast = tourStep === tabs.length - 1;

  return (
    <AnimatePresence>
      <motion.div
        key="tour-overlay"
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100dvh",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Dark overlay — 薄め背景 */}
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleTourSkip} />

        {/* Explanation card — viewport 中央固定 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`card-${tourStep}`}
            className="relative z-[62] mx-5 w-full max-w-xs rounded-xl border border-white/40 bg-white/95 px-4 py-4 shadow-2xl backdrop-blur-xl ring-1 ring-slate-200/50"
            initial={{ opacity: 0, scale: 0.92, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -10 }}
            transition={{ type: "spring", damping: 24, stiffness: 280 }}
          >
            {/* Step indicators */}
            <div className="mb-2.5 flex items-center gap-1">
              {tabs.map((_, i) => (
                <span
                  key={i}
                  className={`inline-block h-1 rounded-full transition-colors ${
                    i === tourStep
                      ? "w-4 bg-indigo-500"
                      : i < tourStep
                        ? "w-1 bg-indigo-300"
                        : "w-1 bg-slate-200"
                  }`}
                />
              ))}
              <span className="ml-auto text-[9px] text-slate-400">
                {tourStep + 1}/{tabs.length}
              </span>
            </div>

            {/* Tab icon + label */}
            <div className="flex items-center gap-2 mb-1.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-lg">
                {currentTab.icon}
              </span>
              <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">
                {currentTab.label}
              </span>
            </div>

            <h3 className="text-sm font-bold text-slate-800 mb-1">
              {currentTab.title}
            </h3>
            <p className="text-xs leading-relaxed text-slate-600">
              {currentTab.description}
            </p>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={handleTourSkip}
                className="text-xs text-slate-400 transition-colors hover:text-slate-600"
              >
                スキップ
              </button>
              <div className="flex-1" />
              <GlassButton variant="primary" size="sm" onClick={handleTourNext}>
                {isLast ? "はじめる" : "次へ"}
              </GlassButton>
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
