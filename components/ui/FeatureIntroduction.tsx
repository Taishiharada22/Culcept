"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";
import { safeLSSet } from "@/lib/safeLocalStorage";

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
  const [phase, setPhase] = useState<Phase>(() => {
    if (typeof window === "undefined") return "idle";
    if (!hasSeenIntro(sectionKey)) return "intro";
    if (tabs.length > 0 && !hasDoneTour(sectionKey)) return "tour";
    return "done";
  });
  const [tourStep, setTourStep] = useState(0);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleDismissIntro = useCallback(() => {
    markIntroSeen(sectionKey);
    if (tabs.length > 0) {
      setPhase("tour");
      setTourStep(0);
    } else {
      setPhase("done");
      onComplete(startingTab);
    }
  }, [sectionKey, tabs.length, onComplete, startingTab]);

  const handleSkipIntro = useCallback(() => {
    markIntroSeen(sectionKey);
    if (tabs.length > 0) {
      markTourDone(sectionKey);
    }
    setPhase("done");
    onComplete(startingTab);
  }, [sectionKey, tabs.length, onComplete, startingTab]);

  const handleTourNext = useCallback(() => {
    if (tourStep < tabs.length - 1) {
      setTourStep((s) => s + 1);
    } else {
      // Last step — complete
      markTourDone(sectionKey);
      setPhase("done");
      onComplete(startingTab ?? tabs[tabs.length - 1]?.key);
    }
  }, [tourStep, tabs, sectionKey, onComplete, startingTab]);

  const handleTourSkip = useCallback(() => {
    markTourDone(sectionKey);
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
        className="fixed inset-0 z-[60]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
      >
        {/* Dark overlay */}
        <div className="absolute inset-0 bg-black/65 pointer-events-auto" onClick={handleTourNext} />

        {/* Tab icon highlight */}
        <TabHighlight
          tabBarRef={tabBarRef}
          tabIndex={tourStep}
          totalTabs={tabs.length}
        />

        {/* Explanation card — positioned below tab bar */}
        <motion.div
          key={`explanation-${tourStep}`}
          className="absolute left-0 right-0 z-[62] flex justify-center px-5 pointer-events-none"
          style={{ top: tabBarRef?.current ? Math.min(tabBarRef.current.getBoundingClientRect().bottom + 20, window.innerHeight * 0.35) : 80 }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ type: "spring", damping: 24, stiffness: 280 }}
        >
          <div className="w-full max-w-xs rounded-xl border border-white/40 bg-white/95 px-4 py-3.5 shadow-2xl backdrop-blur-xl ring-1 ring-slate-200/50 pointer-events-auto">
            {/* Step indicators */}
            <div className="mb-2 flex items-center gap-1">
              {tabs.map((_, i) => (
                <span
                  key={i}
                  className={`inline-block h-1 w-1 rounded-full transition-colors ${
                    i === tourStep
                      ? "bg-indigo-500"
                      : i < tourStep
                        ? "bg-indigo-300"
                        : "bg-slate-200"
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
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// TabHighlight — タブバー内の対象アイコンだけを光らせる
// ---------------------------------------------------------------------------

function TabHighlight({
  tabBarRef,
  tabIndex,
  totalTabs,
}: {
  tabBarRef?: React.RefObject<HTMLElement | null>;
  tabIndex: number;
  totalTabs: number;
}) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const rafRef = useRef(0);
  const stableCountRef = useRef(0);
  const prevRectRef = useRef<{ left: number; top: number } | null>(null);

  useEffect(() => {
    stableCountRef.current = 0;
    prevRectRef.current = null;

    const measure = () => {
      if (!tabBarRef?.current) {
        rafRef.current = requestAnimationFrame(measure);
        return;
      }
      // Scroll the tab bar to ensure target button is visible
      const buttons = tabBarRef.current.querySelectorAll("button");
      const btn = buttons[tabIndex];
      if (btn) {
        // Ensure button is scrolled into view within the tab bar
        btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
        const newRect = btn.getBoundingClientRect();
        // Wait until position stabilizes (sticky positioning + scroll settle)
        const prev = prevRectRef.current;
        if (prev && Math.abs(prev.left - newRect.left) < 1 && Math.abs(prev.top - newRect.top) < 1) {
          stableCountRef.current++;
        } else {
          stableCountRef.current = 0;
        }
        prevRectRef.current = { left: newRect.left, top: newRect.top };
        // Only update state after position has been stable for a few frames
        if (stableCountRef.current >= 3) {
          setRect(newRect);
        }
      }
      rafRef.current = requestAnimationFrame(measure);
    };
    // Delay initial measurement to let sticky positioning settle
    const timer = setTimeout(() => {
      measure();
    }, 100);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(rafRef.current);
    };
  }, [tabBarRef, tabIndex, totalTabs]);

  if (!rect) return null;

  const pad = 8;

  return (
    <>
      {/* Spotlight cutout — タブアイコンだけ切り抜き */}
      <div
        className="fixed inset-0 z-[61] pointer-events-none"
        style={{
          background: `radial-gradient(
            ellipse ${rect.width / 2 + pad + 8}px ${rect.height / 2 + pad + 8}px
            at ${rect.left + rect.width / 2}px ${rect.top + rect.height / 2}px,
            transparent ${Math.max(rect.width, rect.height) / 2 + pad - 4}px,
            rgba(0,0,0,0.01) ${Math.max(rect.width, rect.height) / 2 + pad + 4}px
          )`,
        }}
      />

      {/* Glow ring */}
      <motion.div
        className="pointer-events-none"
        style={{
          position: "fixed",
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
          borderRadius: 16,
          border: "2px solid rgba(99,102,241,0.6)",
          zIndex: 61,
          transition: "left 0.3s ease, top 0.3s ease, width 0.3s ease, height 0.3s ease",
        }}
        animate={{
          boxShadow: [
            "0 0 16px rgba(99,102,241,0.4), 0 0 40px rgba(99,102,241,0.15)",
            "0 0 28px rgba(99,102,241,0.6), 0 0 60px rgba(99,102,241,0.25)",
            "0 0 16px rgba(99,102,241,0.4), 0 0 40px rgba(99,102,241,0.15)",
          ],
        }}
        transition={{ duration: 1.6, repeat: Infinity }}
      />

      {/* Arrow pointing down from glow to card */}
      <div
        className="pointer-events-none"
        style={{
          position: "fixed",
          left: rect.left + rect.width / 2 - 1,
          top: rect.bottom + pad + 2,
          width: 2,
          height: 12,
          background: "linear-gradient(180deg, rgba(99,102,241,0.6), rgba(99,102,241,0.1))",
          zIndex: 62,
        }}
      />
    </>
  );
}
