// app/stargazer/_components/DailyHookBanner.tsx
// 今日アプリを開く理由を提示するバナー — StargazerHome の観測タブ上部に表示
// Daily Anchor + Enhanced Streak + Progressive Insight Teaser
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  getDailyHook,
  getDailyAnchor,
  getEnhancedStreakData,
  getNextProgressiveInsight,
  type EnhancedStreakData,
  type StreakLevel,
} from "@/lib/stargazer/retentionHooks";
import { getStreakState, clearFreezeNotice } from "@/lib/stargazer/streakIntelligence";

interface DailyHookBannerProps {
  className?: string;
  totalObservations?: number;
}

const LEVEL_COLORS: Record<StreakLevel, string> = {
  seed: "rgba(120,180,100,0.6)",
  sprout: "rgba(100,200,140,0.6)",
  bloom: "rgba(200,140,220,0.6)",
  constellation: "rgba(100,160,240,0.6)",
  galaxy: "rgba(200,180,100,0.6)",
};

const LEVEL_ICONS: Record<StreakLevel, string> = {
  seed: "\u2727",        // small star
  sprout: "\u2726",      // star
  bloom: "\u273F",       // flower
  constellation: "\u2734", // eight-pointed star
  galaxy: "\u2738",      // heavy star
};

export default function DailyHookBanner({ className, totalObservations = 0 }: DailyHookBannerProps) {
  const hook = useMemo(() => getDailyHook(), []);
  const anchor = useMemo(() => getDailyAnchor(), []);
  const streak = useMemo(() => getEnhancedStreakData(), []);
  const nextInsight = useMemo(() => getNextProgressiveInsight(totalObservations), [totalObservations]);
  const streakState = useMemo(() => getStreakState(), []);
  const hasFreezes = (streakState.freezesAvailable ?? 0) > 0;
  const freezeJustUsed = streakState.pendingFreezeNotice ?? false;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15, duration: 0.22 }}
    >
      <div className="space-y-3">
        {/* ストリーク保護発動通知 */}
        {freezeJustUsed && (
          <motion.div
            className="rounded-xl px-4 py-3"
            style={{
              background: "linear-gradient(135deg, rgba(201,169,110,0.08), rgba(201,169,110,0.04))",
              border: "1px solid rgba(201,169,110,0.15)",
            }}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            onClick={() => clearFreezeNotice()}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <div className="flex-1">
                <p className="text-xs font-medium" style={{ color: "rgba(201,169,110,0.9)" }}>
                  ストリーク保護が発動しました
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "rgba(201,169,110,0.5)" }}>
                  {streak.currentStreak}日連続を守りました（残り{streakState.freezesAvailable ?? 0}回）
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Daily Anchor — 今日の核心質問 */}
        <div
          className="rounded-xl px-4 py-4"
          style={{
            background: "linear-gradient(135deg, rgba(168,85,247,0.06), rgba(56,189,248,0.04))",
            border: "1px solid rgba(168,85,247,0.10)",
          }}
        >
          <div className="flex items-start gap-3">
            <motion.div
              className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ background: "rgba(168,85,247,0.55)" }}
              animate={{ opacity: [1, 0.3, 1], scale: [1, 1.3, 1] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <div className="flex-1 min-w-0">
              <p
                className="text-[11px] font-medium uppercase tracking-wider mb-1.5"
                style={{ color: "rgba(168,85,247,0.5)" }}
              >
                今日の核心
              </p>
              <p
                className="text-sm leading-relaxed font-medium"
                style={{ color: "rgba(24,30,50,0.88)" }}
              >
                {anchor.coreQuestion}
              </p>
              <p
                className="text-xs mt-2 leading-relaxed"
                style={{ color: "rgba(24,30,50,0.5)" }}
              >
                {anchor.context}
              </p>
              {anchor.lastSimilarDate && anchor.expectedShift && (
                <p
                  className="text-xs mt-1.5"
                  style={{ color: "rgba(168,85,247,0.55)" }}
                >
                  {anchor.expectedShift}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Enhanced Streak + Daily Hook (横並び) */}
        <div className="flex gap-3">
          {/* Streak Visualization */}
          <div
            className="rounded-xl px-3 py-3 flex-shrink-0"
            style={{
              background: "rgba(255,255,255,0.4)",
              border: "1px solid rgba(168,85,247,0.06)",
              minWidth: "110px",
            }}
          >
            <div className="text-center">
              <div
                className="text-xl font-bold tabular-nums"
                style={{ color: LEVEL_COLORS[streak.level] }}
              >
                {streak.currentStreak > 0
                  ? `${LEVEL_ICONS[streak.level]} ${streak.currentStreak}`
                  : "--"}
              </div>
              <p
                className="text-[10px] mt-0.5"
                style={{ color: "rgba(24,30,50,0.45)" }}
              >
                {streak.currentStreak > 0 ? streak.levelDescription : "観測を始めよう"}
              </p>
              {/* Weekly Heatmap */}
              <div className="flex justify-center gap-1 mt-2">
                {streak.weeklyHeatmap.map((observed, i) => (
                  <div
                    key={i}
                    className="w-2 h-2 rounded-full"
                    style={{
                      background: observed
                        ? LEVEL_COLORS[streak.level]
                        : "rgba(24,30,50,0.08)",
                    }}
                  />
                ))}
              </div>
              {streak.nextLevelDays > 0 && streak.currentStreak > 0 && (
                <p
                  className="text-[9px] mt-1.5"
                  style={{ color: "rgba(24,30,50,0.35)" }}
                >
                  次の段階まで {streak.nextLevelDays}日
                </p>
              )}
              {/* ストリーク保護シールド */}
              {hasFreezes && (
                <p
                  className="text-[9px] mt-1"
                  style={{ color: "rgba(201,169,110,0.55)" }}
                >
                  🛡️ 保護 ×{streakState.freezesAvailable}
                </p>
              )}
            </div>
          </div>

          {/* Daily Hook + Progressive Insight */}
          <div className="flex-1 min-w-0 space-y-2">
            {/* Daily Hook (未観測時のみ) */}
            {!streak.observedToday && (
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: "rgba(255,255,255,0.3)",
                  border: "1px solid rgba(56,189,248,0.06)",
                }}
              >
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "rgba(24,30,50,0.72)" }}
                >
                  {hook.message}
                </p>
                {hook.featureLink && (
                  <Link
                    href={hook.featureLink}
                    className="inline-block mt-1 text-[10px] font-medium transition-colors hover:opacity-80"
                    style={{ color: "rgba(168,85,247,0.6)" }}
                  >
                    {"\u2192"} 確認する
                  </Link>
                )}
              </div>
            )}

            {/* Progressive Insight Teaser */}
            {nextInsight && (
              <div
                className="rounded-xl px-3 py-2.5"
                style={{
                  background: "linear-gradient(135deg, rgba(56,189,248,0.03), rgba(168,85,247,0.03))",
                  border: "1px dashed rgba(168,85,247,0.10)",
                }}
              >
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-4 h-4 rounded-full flex items-center justify-center text-[8px]"
                    style={{
                      background: "rgba(168,85,247,0.08)",
                      color: "rgba(168,85,247,0.5)",
                    }}
                  >
                    ?
                  </div>
                  <p
                    className="text-[10px] font-medium"
                    style={{ color: "rgba(24,30,50,0.55)" }}
                  >
                    あと{nextInsight.remaining}回の観測で解放
                  </p>
                </div>
                <p
                  className="text-xs mt-1 leading-relaxed"
                  style={{ color: "rgba(24,30,50,0.45)" }}
                >
                  {nextInsight.teaserText}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
