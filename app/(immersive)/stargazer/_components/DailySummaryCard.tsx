// app/stargazer/_components/DailySummaryCard.tsx
// 一日のまとめカード — 今日の観測成果と明日への橋渡し
"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  getStreakData,
  getTeaser,
  getTodaySummary,
  buildDailySummary,
  type DailySummary,
} from "@/lib/stargazer/retentionHooks";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DailySummaryCardProps {
  totalObservationsToday: number;
  patternChangeDetected?: string | null;
  prophecyVerified?: boolean | null;
  className?: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Streak Visual
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function StreakDots({ recentDays }: { recentDays: string[] }) {
  const today = new Date();
  const dots: { date: string; active: boolean }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dots.push({
      date: dateStr,
      active: recentDays.includes(dateStr),
    });
  }

  const dayLabels = ["日", "月", "火", "水", "木", "金", "土"];

  return (
    <div className="flex items-center gap-1.5">
      {dots.map((dot, i) => {
        const d = new Date(dot.date + "T00:00:00");
        const label = dayLabels[d.getDay()];
        return (
          <div key={dot.date} className="flex flex-col items-center gap-0.5">
            <motion.div
              className="w-4 h-4 rounded-full"
              style={{
                background: dot.active
                  ? "linear-gradient(135deg, rgba(168,85,247,0.7), rgba(236,72,153,0.6))"
                  : "rgba(200,200,210,0.2)",
                border: dot.active
                  ? "1.5px solid rgba(168,85,247,0.3)"
                  : "1px solid rgba(200,200,210,0.15)",
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: i * 0.05, type: "spring" }}
            />
            <span
              className="text-[8px]"
              style={{ color: dot.active ? "rgba(168,85,247,0.7)" : "rgba(160,170,200,0.5)" }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prophecy Status Badge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ProphecyStatusBadge({ status, label }: { status: DailySummary["prophecyStatus"]; label: string }) {
  const variants: Record<DailySummary["prophecyStatus"], { variant: "default" | "success" | "warning" | "info"; icon: string }> = {
    none: { variant: "default", icon: "" },
    pending: { variant: "warning", icon: "\u{1F52E}" },
    verified_hit: { variant: "success", icon: "\u{2713}" },
    verified_miss: { variant: "info", icon: "\u{2717}" },
  };

  const v = variants[status];
  if (status === "none") return null;

  return (
    <GlassBadge size="sm" variant={v.variant}>
      {v.icon && <span className="mr-0.5">{v.icon}</span>}
      {label}
    </GlassBadge>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function DailySummaryCard({
  totalObservationsToday,
  patternChangeDetected,
  prophecyVerified,
  className,
}: DailySummaryCardProps) {
  const [expanded, setExpanded] = useState(false);

  const summary = useMemo(
    () =>
      buildDailySummary({
        totalObservationsToday,
        patternChangeDetected,
        prophecyVerified,
      }),
    [totalObservationsToday, patternChangeDetected, prophecyVerified],
  );

  const streak = useMemo(() => getStreakData(), []);
  const teaser = useMemo(() => getTeaser(), []);

  // 観測が0件なら表示しない
  if (totalObservationsToday === 0 && streak.currentStreak === 0) return null;

  return (
    <FadeInView delay={0.1} className={className}>
      <GlassCard
        variant="gradient"
        className="relative overflow-hidden"
        padding="none"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Subtle gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.03) 0%, rgba(56,189,248,0.02) 100%)",
          }}
        />

        <div className="relative z-10 p-5">
          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <motion.div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, rgba(168,85,247,0.15), rgba(236,72,153,0.1))",
                }}
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              >
                <span className="text-xs">{"\u{2726}"}</span>
              </motion.div>
              <h3
                className="font-display text-sm font-medium"
                style={{ color: "rgba(24,30,50,0.9)" }}
              >
                今日のまとめ
              </h3>
            </div>
            <div className="flex items-center gap-2">
              {summary.streak > 0 && (
                <GlassBadge size="sm" variant="warning">
                  {summary.streak}日連続
                </GlassBadge>
              )}
              <ProphecyStatusBadge
                status={summary.prophecyStatus}
                label={summary.prophecyLabel}
              />
            </div>
          </div>

          {/* Observation summary */}
          <p
            className="text-sm leading-relaxed mb-3"
            style={{ color: "rgba(24,30,50,0.8)" }}
          >
            {summary.observationSummary}
          </p>

          {/* Pattern change */}
          {summary.patternChange && (
            <motion.div
              className="rounded-lg px-3 py-2 mb-3"
              style={{
                background: "rgba(168,85,247,0.05)",
                border: "1px solid rgba(168,85,247,0.1)",
              }}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div className="flex items-center gap-2">
                <motion.div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ background: "rgba(168,85,247,0.6)" }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "rgba(168,85,247,0.8)" }}
                >
                  パターン変化検出: {summary.patternChange}
                </p>
              </div>
            </motion.div>
          )}

          {/* Streak dots */}
          <div className="flex items-center justify-between mb-3">
            <StreakDots recentDays={streak.recentDays} />
          </div>

          {/* Expandable teaser */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden"
              >
                <div
                  className="rounded-xl p-3 mt-1"
                  style={{
                    background: "linear-gradient(135deg, rgba(24,30,50,0.03), rgba(168,85,247,0.03))",
                    border: "1px dashed rgba(168,85,247,0.1)",
                  }}
                >
                  <p
                    className="text-xs font-medium mb-1"
                    style={{ color: "rgba(168,85,247,0.6)" }}
                  >
                    明日の予感
                  </p>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "rgba(24,30,50,0.75)" }}
                  >
                    {teaser.message}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tomorrow teaser (always visible, compact) */}
          {!expanded && (
            <motion.div
              className="flex items-center gap-2 pt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
            >
              <motion.span
                className="text-[10px]"
                style={{ color: "rgba(168,85,247,0.5)" }}
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                {"\u{2026}"}
              </motion.span>
              <p
                className="text-[11px] truncate"
                style={{ color: "rgba(72,78,100,0.5)" }}
              >
                {teaser.message}
              </p>
            </motion.div>
          )}
        </div>
      </GlassCard>
    </FadeInView>
  );
}
