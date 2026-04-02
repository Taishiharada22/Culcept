"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";

type ReelItem = {
  icon: string;
  text: string;
  href?: string;
  category: "insight" | "change" | "rendezvous" | "status";
};

type Props = {
  /** Stargazer observation count */
  observationCount?: number;
  /** Archetype name */
  archetype?: string | null;
  /** Sync percentage (0-100) */
  syncPercent?: number;
  /** Blind spot message */
  blindSpot?: string | null;
  /** Convergent insight */
  convergentInsight?: string | null;
  /** Temporal mirror delta narrative */
  temporalDelta?: string | null;
  /** Prophecy prediction */
  prophecy?: string | null;
  /** Streak days */
  streakDays?: number;
  /** Percentile label */
  percentileLabel?: string | null;
  /** Identity insights */
  identityInsights?: { zone: string; insight: string }[];
  /** Interval between rotations (ms) */
  intervalMs?: number;
};

export default function ContextReel({
  observationCount = 0,
  archetype,
  syncPercent = 0,
  blindSpot,
  convergentInsight,
  temporalDelta,
  prophecy,
  streakDays = 0,
  percentileLabel,
  identityInsights = [],
  intervalMs = 5000,
}: Props) {
  const items = useMemo(() => {
    const list: ReelItem[] = [];

    // ─── Insight category ───
    if (blindSpot) {
      list.push({ icon: "👁", text: blindSpot, category: "insight" });
    }
    if (convergentInsight) {
      list.push({ icon: "✦", text: convergentInsight, category: "insight", href: "/stargazer" });
    }
    if (prophecy) {
      list.push({ icon: "🔮", text: prophecy, category: "insight" });
    }

    // ─── Change category ───
    if (temporalDelta) {
      list.push({ icon: "📈", text: temporalDelta, category: "change" });
    }

    // ─── Status category ───
    if (archetype && observationCount >= 30) {
      list.push({
        icon: "🧬",
        text: `${archetype}型 — ${observationCount}回の観測で構築中`,
        category: "status",
        href: "/stargazer",
      });
    }
    if (percentileLabel) {
      list.push({ icon: "📊", text: percentileLabel, category: "status" });
    }
    if (streakDays >= 3) {
      list.push({ icon: "🔥", text: `${streakDays}日連続で観測中`, category: "status" });
    }

    // ─── Identity insights ───
    for (const item of identityInsights) {
      if (item.insight) {
        const iconMap: Record<string, string> = {
          origin: "📓", genome: "🧬", presence: "🪞", style: "◆",
        };
        list.push({
          icon: iconMap[item.zone] ?? "✦",
          text: item.insight,
          category: "insight",
        });
      }
    }

    // ─── Rendezvous teaser (always show one if nothing else) ───
    if (observationCount >= 10) {
      list.push({
        icon: "∞",
        text: "あなたの観測データから、相性の合う人を探せます",
        category: "rendezvous",
        href: "/rendezvous",
      });
    }

    // Fallback
    if (list.length === 0) {
      list.push({
        icon: "✦",
        text: "観測を重ねると、ここにあなたの発見が表示されます",
        category: "status",
        href: "/stargazer",
      });
    }

    return list;
  }, [observationCount, archetype, syncPercent, blindSpot, convergentInsight, temporalDelta, prophecy, streakDays, percentileLabel, identityInsights]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = setInterval(() => {
      setIdx((i) => (i + 1) % items.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [items.length, intervalMs]);

  const current = items[idx % items.length];
  if (!current) return null;

  const inner = (
    <div className="flex items-start gap-2.5 px-6 py-3">
      <span className="text-sm leading-none flex-shrink-0 mt-0.5">{current.icon}</span>
      <p className="text-[13px] text-text1 leading-relaxed line-clamp-2 flex-1">
        {current.text}
      </p>
      {items.length > 1 && (
        <span className="text-[8px] text-text4 flex-shrink-0 mt-1 font-mono">
          {(idx % items.length) + 1}/{items.length}
        </span>
      )}
    </div>
  );

  return (
    <div className="relative overflow-hidden" style={{ minHeight: 52 }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={idx}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        >
          {current.href ? (
            <Link href={current.href} className="block transition-opacity active:opacity-70">
              {inner}
            </Link>
          ) : (
            inner
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
