// app/(immersive)/stargazer/_components/PersistentStreakBar.tsx
// 常時表示のストリーク・エンゲージメントバー
// StargazerHome の最上部に sticky で配置し、毎日のリテンションを可視化する
"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  getEnhancedStreakData,
  type EnhancedStreakData,
} from "@/lib/stargazer/retentionHooks";
import {
  loadTodayEngagement,
  calculateDailyScore,
  getScoreLevel,
  type DailyEngagement,
  type AccuracyTrend,
  getTrendIndicator,
} from "@/lib/stargazer/engagementScore";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Props
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface PersistentStreakBarProps {
  /** Prediction accuracy percentage (0-100) */
  predictionAccuracy: number;
  /** Accuracy trend direction */
  accuracyTrend: AccuracyTrend;
  /** Whether observation was done today (if provided, overrides internal check) */
  observedToday?: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Streak Level Emoji
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getStreakEmoji(level: string): string {
  switch (level) {
    case "galaxy":
      return "\u{1F30C}"; // 🌌
    case "constellation":
      return "\u2728"; // ✨
    case "bloom":
      return "\u{1F338}"; // 🌸
    case "sprout":
      return "\u{1F331}"; // 🌱
    case "seed":
    default:
      return "\u{1F525}"; // 🔥
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function PersistentStreakBar({
  predictionAccuracy,
  accuracyTrend,
  observedToday: observedTodayProp,
}: PersistentStreakBarProps) {
  const [streakData, setStreakData] = useState<EnhancedStreakData | null>(null);
  const [engagement, setEngagement] = useState<DailyEngagement | null>(null);
  const [prevScore, setPrevScore] = useState<number>(0);
  const [scoreAnimating, setScoreAnimating] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load streak data + engagement on mount, and poll for updates
  useEffect(() => {
    function refresh() {
      try {
        const sd = getEnhancedStreakData();
        setStreakData(sd);
      } catch {
        // silent
      }
      try {
        const eng = loadTodayEngagement();
        setEngagement(eng);
      } catch {
        // silent
      }
    }

    refresh();

    // Poll every 10 seconds to pick up engagement updates from other components
    intervalRef.current = setInterval(refresh, 10_000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Animate score changes
  const score = engagement ? calculateDailyScore(engagement) : 0;
  useEffect(() => {
    if (score !== prevScore && prevScore > 0) {
      setScoreAnimating(true);
      const t = setTimeout(() => setScoreAnimating(false), 600);
      return () => clearTimeout(t);
    }
    setPrevScore(score);
  }, [score, prevScore]);

  const scoreLevel = getScoreLevel(score);
  const observedToday = observedTodayProp ?? streakData?.observedToday ?? false;
  const currentStreak = streakData?.currentStreak ?? 0;
  const levelLabel = streakData?.levelDescription ?? "";
  const levelKey = streakData?.level ?? "seed";
  const trendArrow = getTrendIndicator(accuracyTrend);
  const accuracyPercent = Math.round(predictionAccuracy);

  return (
    <div
      className="sticky top-0 z-40 w-full select-none"
      style={{ height: 44 }}
    >
      <div
        className="flex h-[44px] items-center justify-between px-4 sm:px-6"
        style={{
          background: "rgba(255,255,255,0.95)",
          borderBottom: "1px solid rgba(160,170,200,0.12)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        }}
      >
        {/* ── Left: Streak ── */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base leading-none" aria-hidden="true">
            {getStreakEmoji(levelKey)}
          </span>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: "rgba(22,28,48,0.85)" }}
          >
            {currentStreak > 0 ? `${currentStreak}日連続` : "今日が初日"}
          </span>
          {levelLabel && currentStreak > 0 && (
            <span
              className="hidden sm:inline text-[11px] font-medium rounded-full px-2 py-0.5"
              style={{
                background: "rgba(139,92,246,0.08)",
                color: "rgba(139,92,246,0.8)",
              }}
            >
              {levelLabel}
            </span>
          )}
        </div>

        {/* ── Center: Today's score ── */}
        <div className="flex items-center gap-1.5">
          {/* Pulsing dot when observation not done today */}
          {!observedToday && (
            <span className="relative flex h-2 w-2 mr-0.5">
              <span
                className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                style={{ background: scoreLevel.color }}
              />
              <span
                className="relative inline-flex rounded-full h-2 w-2"
                style={{ background: scoreLevel.color }}
              />
            </span>
          )}
          <span
            className="text-[11px] font-medium"
            style={{ color: "rgba(100,105,130,0.7)" }}
          >
            今日
          </span>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={score}
              initial={scoreAnimating ? { y: -8, opacity: 0 } : false}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="text-sm font-bold tabular-nums"
              style={{ color: scoreLevel.color }}
            >
              {score}pt
            </motion.span>
          </AnimatePresence>
        </div>

        {/* ── Right: Accuracy ── */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="text-[11px] font-medium"
            style={{ color: "rgba(100,105,130,0.7)" }}
          >
            精度
          </span>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: "rgba(22,28,48,0.85)" }}
          >
            {accuracyPercent}%
          </span>
          <span
            className="text-xs font-medium"
            style={{
              color:
                accuracyTrend === "improving"
                  ? "#10b981"
                  : accuracyTrend === "declining"
                    ? "#ef4444"
                    : "rgba(100,105,130,0.5)",
            }}
            aria-label={
              accuracyTrend === "improving"
                ? "上昇中"
                : accuracyTrend === "declining"
                  ? "下降中"
                  : "安定"
            }
          >
            {trendArrow}
          </span>
        </div>
      </div>
    </div>
  );
}
