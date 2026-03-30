"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import { safeLSSet } from "@/lib/safeLocalStorage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TabInfo {
  icon: string;
  label: string;
  description: string;
}

interface SectionInfoSheetProps {
  sectionKey: string;
  title: string;
  tabs: TabInfo[];
  action: string;
  benefit: string;
  progress?: { current: number; total: number; nextMilestone?: string };
  isOpen: boolean;
  onClose: () => void;
  onStart?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function storageKey(sectionKey: string) {
  return `aneurasync_guide_${sectionKey}_seen`;
}

export function hasSeenSection(sectionKey: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(storageKey(sectionKey)) === "1";
}

export function markSectionSeen(sectionKey: string) {
  if (typeof window === "undefined") return;
  safeLSSet(storageKey(sectionKey), "1");
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SectionInfoSheet({
  sectionKey,
  title,
  tabs,
  action,
  benefit,
  progress,
  isOpen,
  onClose,
  onStart,
}: SectionInfoSheetProps) {
  const [isFirstVisit, setIsFirstVisit] = useState(false);

  useEffect(() => {
    if (isOpen && !hasSeenSection(sectionKey)) {
      setIsFirstVisit(true);
    }
  }, [isOpen, sectionKey]);

  const handleClose = () => {
    markSectionSeen(sectionKey);
    setIsFirstVisit(false);
    onClose();
  };

  const handleStart = () => {
    markSectionSeen(sectionKey);
    setIsFirstVisit(false);
    onStart?.();
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.current / progress.total) * 100)
      : 0;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="sheet-backdrop"
            className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={handleClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet-panel"
            className="fixed inset-x-0 bottom-0 z-50 max-h-[70vh] overflow-y-auto rounded-t-2xl bg-white/95 backdrop-blur-xl shadow-xl ring-1 ring-slate-200/60"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          >
            {/* Drag handle */}
            <div className="sticky top-0 z-10 flex justify-center bg-white/95 pt-3 pb-1">
              <div className="h-1 w-10 rounded-full bg-slate-300" />
            </div>

            <div className="px-5 pb-8 pt-2 space-y-5">
              {/* Title */}
              <h2 className="text-lg font-bold text-slate-800">{title}</h2>

              {/* Tab grid */}
              <div className="grid grid-cols-2 gap-3">
                {tabs.map((tab) => (
                  <GlassCard
                    key={tab.label}
                    padding="sm"
                    hoverEffect={false}
                    className="flex flex-col gap-1"
                  >
                    <span className="text-xl leading-none">{tab.icon}</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {tab.label}
                    </span>
                    <span className="text-xs text-slate-500 leading-snug">
                      {tab.description}
                    </span>
                  </GlassCard>
                ))}
              </div>

              {/* Action */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  やること
                </p>
                <p className="text-sm text-slate-700">{action}</p>
              </div>

              {/* Benefit */}
              <div className="space-y-1">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  得られるもの
                </p>
                <p className="text-sm text-slate-700">{benefit}</p>
              </div>

              {/* Progress */}
              {progress && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span>進捗</span>
                    <span>
                      {progress.current} / {progress.total}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-violet-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPct}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  </div>
                  {progress.nextMilestone && (
                    <p className="text-xs text-slate-400">
                      次のマイルストーン: {progress.nextMilestone}
                    </p>
                  )}
                </div>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-2">
                {isFirstVisit && onStart ? (
                  <>
                    <GlassButton
                      variant="default"
                      size="md"
                      onClick={handleClose}
                      className="flex-1"
                    >
                      あとで
                    </GlassButton>
                    <GlassButton
                      variant="primary"
                      size="md"
                      onClick={handleStart}
                      className="flex-1"
                    >
                      はじめる
                    </GlassButton>
                  </>
                ) : (
                  <GlassButton
                    variant="default"
                    size="md"
                    onClick={handleClose}
                    fullWidth
                  >
                    閉じる
                  </GlassButton>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
