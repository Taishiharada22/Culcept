"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import HomeCard, { CardLabel } from "@/components/ui/HomeCard";
import {
  synthesizeNarrative,
  markShownToday,
  type NarrativeSynthesisResult,
} from "@/lib/stargazer/narrativeSynthesis";

/* ── Props ── */

interface NarrativeSynthesisCardProps {
  convergentInsight: any;
  temporalMirror: any;
  blindSpot: any;
  prophecyAccuracy: number;
  prophecyAccuracyPrevWeek?: number | null;
  coreValue: string | null;
  dilemma: string | null;
  observationCount: number;
  streakDays: number;
}

/* ── Source label map ── */

const SOURCE_LABELS: Record<string, string> = {
  contradiction: "矛盾検知",
  temporal: "時間変化",
  blindspot: "盲点",
  prophecy: "予言精度",
  pattern: "パターン",
};

/* ── Font size by weight ── */

const WEIGHT_TEXT: Record<NarrativeSynthesisResult["weight"], string> = {
  heavy: "text-[18px]",
  medium: "text-[16px]",
  light: "text-[15px]",
};

/* ── Component ── */

export default function NarrativeSynthesisCard({
  convergentInsight,
  temporalMirror,
  blindSpot,
  prophecyAccuracy,
  prophecyAccuracyPrevWeek = null,
  coreValue,
  dilemma,
  observationCount,
  streakDays,
}: NarrativeSynthesisCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const hidden = observationCount < 10;

  const result = useMemo(
    () =>
      hidden
        ? null
        : synthesizeNarrative({
            convergentInsight,
            temporalMirror,
            blindSpot,
            prophecyAccuracy,
            prophecyAccuracyPrevWeek,
            coreValue,
            dilemma,
            observationCount,
            streakDays,
          }),
    [
      hidden,
      convergentInsight,
      temporalMirror,
      blindSpot,
      prophecyAccuracy,
      prophecyAccuracyPrevWeek,
      coreValue,
      dilemma,
      observationCount,
      streakDays,
    ],
  );

  const lines = result?.narrative.split("\n").filter(Boolean) ?? [];
  const shouldAnimate = result?.isNew ?? false;

  // Mark as shown on mount
  useEffect(() => {
    if (hidden) return;
    markShownToday();
    if (!shouldAnimate) setRevealed(true);
  }, [hidden, shouldAnimate]);

  // After stagger completes, mark revealed
  const totalDelay = lines.length * 0.6 + 0.4;
  useEffect(() => {
    if (hidden || !shouldAnimate) return;
    const timer = setTimeout(() => setRevealed(true), totalDelay * 1000);
    return () => clearTimeout(timer);
  }, [hidden, shouldAnimate, totalDelay]);

  if (hidden || !result) return null;

  const textSize = WEIGHT_TEXT[result.weight];

  const firstLine = lines[0] ?? "";
  const preview = firstLine.length > 40 ? firstLine.slice(0, 40) + "…" : firstLine;

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      className="w-full text-left"
      style={{ background: "none", border: "none", padding: 0, cursor: "pointer" }}
    >
      <HomeCard tier="primary">
        {/* Header — always visible */}
        <div className="flex items-center justify-between">
          <CardLabel tier="primary">YOUR MIRROR</CardLabel>
          <span className="text-[10px] text-text3 transition-transform" style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>
            ▼
          </span>
        </div>

        {/* Collapsed: one-line preview */}
        {!isOpen && (
          <p className="mt-1.5 text-[13px] text-text2 truncate">{preview}</p>
        )}

        {/* Expanded: full narrative */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="mt-3 space-y-1">
                {lines.map((line, i) => (
                  <p
                    key={i}
                    className={`${textSize} leading-[2.0] font-medium text-text1`}
                  >
                    {line}
                  </p>
                ))}
              </div>

              <p className="mt-4 text-[11px] text-text3 tracking-wide">
                これはあなたの鏡です
              </p>

              {result.sources.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {result.sources.map((src) => (
                    <span
                      key={src}
                      className="px-2 py-0.5 rounded-full bg-indigo/[0.08] text-indigo text-[10px] font-medium tracking-wide"
                    >
                      {SOURCE_LABELS[src] ?? src}
                    </span>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </HomeCard>
    </button>
  );
}
