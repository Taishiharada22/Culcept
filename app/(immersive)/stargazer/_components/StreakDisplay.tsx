"use client";

// StreakDisplay — 観測ストリークの状態を表示するコンパクトなコンポーネント
// GlassBadge を使用し、現在のストリーク日数・レベル・次レベルへの進捗を表示
// ストリーク危機時にはパルスアニメーションで警告

import { useState } from "react";
import { motion } from "framer-motion";
import { GlassBadge } from "@/components/ui/glassmorphism-design";
import {
  getStreakState,
  getStreakUrgency,
  STREAK_LEVELS,
  type StreakState,
} from "@/lib/stargazer/streakIntelligence";

const LEVEL_ICONS: Record<string, string> = {
  observer: "🔭",
  seeker: "🔍",
  introspector: "🪞",
  contradiction_witness: "⚡",
  abyss_traveler: "🌌",
};

interface StreakDisplayProps {
  /** コンパクトモード: 日数とレベルアイコンのみ */
  compact?: boolean;
  className?: string;
}

export default function StreakDisplay({
  compact = false,
  className = "",
}: StreakDisplayProps) {
  const [streak] = useState<StreakState | null>(() => getStreakState());
  const [urgency] = useState<{
    isAtRisk: boolean;
    hoursRemaining: number;
    message: string;
  } | null>(() => getStreakUrgency());

  if (!streak || streak.currentStreak === 0) {
    if (compact) return null;
    return (
      <div className={`text-center py-2 ${className}`}>
        <p className="sg-text-caption opacity-60">
          観測を始めてストリークを築こう
        </p>
      </div>
    );
  }

  const levelInfo = STREAK_LEVELS.find((l) => l.level === streak.currentLevel);
  const icon = LEVEL_ICONS[streak.currentLevel] || "🔭";
  const isAtRisk = urgency?.isAtRisk ?? false;

  if (compact) {
    return (
      <motion.div
        className={`inline-flex items-center gap-1.5 ${className}`}
        animate={isAtRisk ? { scale: [1, 1.05, 1] } : undefined}
        transition={isAtRisk ? { repeat: Infinity, duration: 2 } : undefined}
      >
        <GlassBadge
          variant={isAtRisk ? "warning" : "default"}
          size="sm"
        >
          <span className="text-xs">
            {icon} {streak.currentStreak}日
          </span>
        </GlassBadge>
      </motion.div>
    );
  }

  // フルモード: 日数 + レベル名 + 進捗バー + 次レベル情報
  return (
    <motion.div
      className={`space-y-2 ${className}`}
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* ヘッダー: ストリーク日数 + レベル */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <motion.span
            className="text-lg"
            animate={isAtRisk ? { scale: [1, 1.1, 1] } : undefined}
            transition={isAtRisk ? { repeat: Infinity, duration: 1.5 } : undefined}
          >
            {icon}
          </motion.span>
          <div>
            <span className="sg-text-subtitle font-semibold">
              {streak.currentStreak}日連続
            </span>
            {levelInfo && (
              <span className="sg-text-caption ml-2 opacity-70">
                {levelInfo.nameJa}
              </span>
            )}
          </div>
        </div>
        {streak.longestStreak > streak.currentStreak && (
          <span className="sg-text-caption opacity-50">
            最長: {streak.longestStreak}日
          </span>
        )}
      </div>

      {/* 進捗バー: 次のレベルまで */}
      {streak.nextLevelName && (
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <span className="sg-text-caption opacity-60">
              次: {streak.nextLevelName}
            </span>
            <span className="sg-text-caption opacity-60">
              {Math.round(streak.nextLevelProgress * 100)}%
            </span>
          </div>
          <div
            className="h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: isAtRisk
                  ? "linear-gradient(90deg, #f59e0b, #ef4444)"
                  : "linear-gradient(90deg, rgba(139,92,246,0.6), rgba(190,170,110,0.6))",
              }}
              initial={{ width: 0 }}
              animate={{ width: `${Math.round(streak.nextLevelProgress * 100)}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          {/* 残り条件 */}
          {streak.nextLevelRequirements.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {streak.nextLevelRequirements.map((req, i) => (
                <GlassBadge key={i} size="sm" variant="default">
                  <span className="text-[10px] opacity-70">{req}</span>
                </GlassBadge>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ストリーク危機警告 */}
      {isAtRisk && urgency && (
        <motion.div
          className="rounded-lg px-3 py-2 text-center"
          style={{
            background: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.2)",
          }}
          animate={{ opacity: [0.7, 1, 0.7] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <p className="text-xs" style={{ color: "rgba(239,68,68,0.9)" }}>
            {urgency.message}
          </p>
        </motion.div>
      )}

      {/* 品質スコア */}
      {streak.recentQualityAvg > 0 && (
        <div className="flex items-center gap-2">
          <span className="sg-text-caption opacity-50">観測品質:</span>
          <span className="sg-text-caption font-medium">
            {Math.round(streak.recentQualityAvg * 100)}%
          </span>
        </div>
      )}
    </motion.div>
  );
}
