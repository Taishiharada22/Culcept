// app/stargazer/_components/PostObservationProgress.tsx
// 観測完了後のリッチな進捗表示
"use client";

import React, { useMemo, useState, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import type { TypeDefLike } from "@/lib/stargazer/dailyInsightEngine";
import type { ObservationCompletionInsight } from "@/lib/stargazer/dailyInsightEngine";
import type { ObservationState } from "@/lib/stargazer/fluctuationEngine";
import {
  computeTouchedAxes,
  computeObservationStreak,
} from "@/lib/stargazer/observationProgressUtils";
import {
  ENERGY_OPTIONS,
  EMOTION_OPTIONS,
  SOCIAL_OPTIONS,
} from "@/lib/stargazer/fluctuationEngine";
import {
  STREAK_LEVELS,
  getStreakState,
  type StreakLevelInfo,
} from "@/lib/stargazer/streakIntelligence";
import {
  SignalCollector,
  type SessionSignals,
} from "@/lib/stargazer/behavioralSignalCollector";
import {
  generateBehavioralInsights,
  getInsightImportanceLabel,
  type BehavioralInsight,
  type BehavioralSignal as EngineSignal,
  type BehavioralInsightInput,
} from "@/lib/stargazer/behavioralInsightEngine";
import {
  runContradictionDetection,
  type ContradictionResult,
  type ContradictionDetectorInput,
} from "@/lib/stargazer/contradictionDetector";
import {
  extractImplicitValues,
  type ImplicitValuesResult,
} from "@/lib/stargazer/implicitValuesExtractor";
import {
  analyzeStressCascade,
  type StressCascadeResult,
} from "@/lib/stargazer/stressResponseCascade";
import {
  generateMultipleResonances,
  type GhostResonanceEntry,
  type GhostResonanceInput,
} from "@/lib/stargazer/ghostResonance";

/** Local-time date key (YYYY-MM-DD) for consistent daily locking */
function localDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface Props {
  todayAnswers: {
    questionId: string;
    optionId: string;
    responseTimeMs: number;
    axisId?: TraitAxisKey;
  }[];
  axisScores: Partial<Record<TraitAxisKey, number>>;
  totalObservations: number;
  typeDef: TypeDefLike | null;
  capturedState: ObservationState | null;
  completionInsight: ObservationCompletionInsight;
}

function PostObservationProgress({
  todayAnswers,
  axisScores,
  totalObservations,
  typeDef,
  capturedState,
  completionInsight,
}: Props) {
  const touchedAxes = useMemo(
    () => computeTouchedAxes(todayAnswers),
    [todayAnswers]
  );
  const { streak, totalDays } = useMemo(() => computeObservationStreak(), []);
  const totalObservationCount = totalObservations + todayAnswers.length;
  const averageResponseTimeSeconds = useMemo(() => {
    if (todayAnswers.length === 0) return 0;
    return todayAnswers.reduce((sum, answer) => sum + answer.responseTimeMs, 0) / todayAnswers.length / 1000;
  }, [todayAnswers]);
  const fastestResponseTimeSeconds = useMemo(() => {
    if (todayAnswers.length === 0) return 0;
    return Math.min(...todayAnswers.map((answer) => answer.responseTimeMs)) / 1000;
  }, [todayAnswers]);
  const observedAxisCount = useMemo(
    () => Object.values(axisScores).filter((value) => typeof value === "number").length,
    [axisScores]
  );

  return (
    <motion.div
      className="space-y-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
    >
      <motion.div
        className="card-hero-star"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <span className="text-section-header">今日の観測</span>
            <p
              className="font-display text-[1.9rem] leading-[1.15]"
              style={{ color: "rgba(20,26,46,0.97)" }}
            >
              {completionInsight.primary}
            </p>
            {completionInsight.revealed && (
              <p
                className="max-w-2xl text-sm leading-7"
                style={{ color: "rgba(62,68,92,0.82)" }}
              >
                {completionInsight.revealed}
              </p>
            )}
          </div>

          <div
            className="rounded-2xl px-4 py-3"
            style={{
              background: "rgba(255,255,255,0.66)",
              border: "1px solid rgba(186,166,110,0.2)",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.8)",
            }}
          >
            <span className="text-section-header">分析の進み具合</span>
            <p
              className="mt-2 font-display text-xl leading-tight"
              style={{ color: "rgba(28,34,56,0.94)" }}
            >
              {observedAxisCount > 0 ? `観測済み: ${observedAxisCount}軸` : "観測中"}
            </p>
            <p
              className="mt-1 text-sm"
              style={{ color: "rgba(80,86,110,0.72)" }}
            >
              回答をもとに更新
            </p>
          </div>
        </div>
      </motion.div>

      <motion.div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.16 }}
      >
        <div className="sg-stat-card" aria-label={`${streak}日連続観測`}>
          <span className="sg-stat-value" style={{ color: "rgba(138,116,66,0.92)" }}>
            {streak}
          </span>
          <span className="sg-stat-label">日連続観測</span>
        </div>
        <div className="sg-stat-card" aria-label={`累計${totalObservationCount}回観測`}>
          <span className="sg-stat-value" style={{ color: "rgba(112,78,210,0.9)" }}>
            {totalObservationCount}
          </span>
          <span className="sg-stat-label">累計観測</span>
        </div>
        <div className="sg-stat-card" aria-label={`今日${touchedAxes.length}項目を観測`}>
          <span className="sg-stat-value" style={{ color: "rgba(48,160,110,0.9)" }}>
            {touchedAxes.length}
          </span>
          <span className="sg-stat-label">今日の項目</span>
        </div>
        <div className="sg-stat-card" aria-label={`${todayAnswers.length}問に回答`}>
          <span className="sg-stat-value" style={{ color: "rgba(58,74,108,0.9)" }}>
            {todayAnswers.length}
          </span>
          <span className="sg-stat-label">回答数</span>
        </div>
      </motion.div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {touchedAxes.length > 0 && (
            <div className="card-section">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-section-header">今日観測された軸</span>
                  <p
                    className="mt-2 text-sm leading-7"
                    style={{ color: "rgba(58,64,88,0.82)" }}
                  >
                    今日の回答で特に変化が見られた項目です。どの場面で答えが変わったか確認できます。
                  </p>
                </div>
                <span
                  className="rounded-full px-3 py-1 text-xs"
                  style={{
                    background: "rgba(112,78,210,0.1)",
                    border: "1px solid rgba(112,78,210,0.16)",
                    color: "rgba(96,68,176,0.86)",
                  }}
                >
                  {touchedAxes.length} 軸
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {touchedAxes.slice(0, 8).map((axis, i) => (
                  <motion.span
                    key={axis.key}
                    className="rounded-full px-3 py-1.5 text-xs"
                    style={{
                      background: `rgba(112,78,210,${Math.min(0.18, axis.totalWeight * 0.05 + 0.05)})`,
                      border: `1px solid rgba(112,78,210,${Math.min(0.28, axis.totalWeight * 0.08 + 0.08)})`,
                      color: "rgba(36,42,66,0.9)",
                    }}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.36 + i * 0.05 }}
                  >
                    {axis.label}
                  </motion.span>
                ))}
              </div>
            </div>
          )}

          {todayAnswers.length > 0 && (
            <div className="card-section">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-section-header">応答パターン</span>
                  <p
                    className="mt-2 text-sm leading-7"
                    style={{ color: "rgba(58,64,88,0.82)" }}
                  >
                    回答にかかった時間も記録しています。すぐ答えた質問と、迷った質問の違いが見えます。
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-right">
                  <div>
                    <span
                      className="font-mono-sg block text-[0.72rem]"
                      style={{ color: "rgba(98,104,130,0.72)" }}
                    >
                      平均
                    </span>
                    <span
                      className="font-display text-base"
                      style={{ color: "rgba(30,35,55,0.92)" }}
                    >
                      {averageResponseTimeSeconds.toFixed(1)}s
                    </span>
                  </div>
                  <div>
                    <span
                      className="font-mono-sg block text-[0.72rem]"
                      style={{ color: "rgba(98,104,130,0.72)" }}
                    >
                      最速
                    </span>
                    <span
                      className="font-display text-base"
                      style={{ color: "rgba(30,35,55,0.92)" }}
                    >
                      {fastestResponseTimeSeconds.toFixed(1)}s
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex h-16 items-end gap-1">
                  {todayAnswers.slice(0, 12).map((answer, i) => {
                    const maxTime = Math.max(...todayAnswers.map((entry) => entry.responseTimeMs));
                    const height = Math.max(10, (answer.responseTimeMs / maxTime) * 100);
                    const isQuick = answer.responseTimeMs < 3000;
                    return (
                      <motion.div
                        key={i}
                        className="flex-1 rounded-t-md"
                        style={{
                          background: isQuick
                            ? "rgba(48,160,110,0.32)"
                            : answer.responseTimeMs > 8000
                              ? "rgba(186,166,110,0.36)"
                              : "rgba(112,78,210,0.32)",
                        }}
                        initial={{ height: 0 }}
                        animate={{ height: `${height}%` }}
                        transition={{ delay: 0.44 + i * 0.03, duration: 0.2 }}
                      />
                    );
                  })}
                </div>
                <div className="flex justify-between">
                  <span className="text-xs" style={{ color: "rgba(98,104,130,0.72)" }}>
                    Q1
                  </span>
                  <span className="text-xs" style={{ color: "rgba(98,104,130,0.72)" }}>
                    Q{Math.min(todayAnswers.length, 12)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </motion.div>

        <motion.div
          className="space-y-4"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          <div className="card-mystery">
            <span className="text-section-header">まだ見えていないこと</span>
            <p
              className="mt-3 text-sm leading-7"
              style={{ color: "rgba(68,74,98,0.82)" }}
            >
              {completionInsight.mystery}
            </p>
          </div>

          {capturedState && (
            <div className="card-section">
              <span className="text-section-header">観測時の状態</span>
              <p
                className="mt-2 text-sm leading-7"
                style={{ color: "rgba(58,64,88,0.82)" }}
              >
                今日の回答時の状態です。同じ質問でも状態によって答えが変わることがあります。
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    background: "rgba(186,166,110,0.09)",
                    border: "1px solid rgba(186,166,110,0.16)",
                    color: "rgba(132,112,66,0.9)",
                  }}
                >
                  {ENERGY_OPTIONS.find((e) => e.value === capturedState.energy)?.icon}{" "}
                  {ENERGY_OPTIONS.find((e) => e.value === capturedState.energy)?.label}
                </span>
                <span
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    background: "rgba(112,78,210,0.09)",
                    border: "1px solid rgba(112,78,210,0.16)",
                    color: "rgba(96,68,176,0.9)",
                  }}
                >
                  {EMOTION_OPTIONS.find((e) => e.value === capturedState.emotion)?.icon}{" "}
                  {EMOTION_OPTIONS.find((e) => e.value === capturedState.emotion)?.label}
                </span>
                <span
                  className="text-xs px-3 py-1.5 rounded-lg"
                  style={{
                    background: "rgba(84,120,220,0.09)",
                    border: "1px solid rgba(84,120,220,0.16)",
                    color: "rgba(62,96,188,0.9)",
                  }}
                >
                  {SOCIAL_OPTIONS.find((e) => e.value === capturedState.social)?.icon}{" "}
                  {SOCIAL_OPTIONS.find((e) => e.value === capturedState.social)?.label}
                </span>
              </div>
            </div>
          )}

          <div
            className="rounded-2xl p-4 text-center"
            style={{
              background: "rgba(255,255,255,0.58)",
              border: "1px solid rgba(160,170,200,0.16)",
            }}
          >
            <span className="text-section-header">次の観測へ</span>
            <p
              className="mt-2 text-sm leading-7"
              style={{ color: "rgba(62,68,92,0.82)" }}
            >
              {completionInsight.returnPrompt}
            </p>
          </div>
        </motion.div>
      </div>

      {/* ── Contradiction Insights: 内面の矛盾検出 ── */}
      <ContradictionInsightsSection axisScores={axisScores} />

      {/* ── Cross-System Contradictions: 横断矛盾検出 ── */}
      <CrossSystemContradictionsSection />

      {/* ── Implicit Values: 深層価値観マップ ── */}
      <ImplicitValuesSection axisScores={axisScores} />

      {/* ── Stress Cascade: ストレス下の崩壊予測 ── */}
      <StressCascadeSection axisScores={axisScores} />

      {/* ── Ghost Resonance: 匿名パターン共鳴 ── */}
      <GhostResonanceSection axisScores={axisScores} totalObservations={totalObservationCount} />

      {/* ── B2: Level Roadmap ── */}
      <LevelRoadmap streak={streak} />

      {/* ── C1: Calendar Heatmap (30 days) ── */}
      <CalendarHeatmap />

      {/* ── B4: Tomorrow Teaser ── */}
      <TomorrowTeaser streak={streak} totalObservations={totalObservationCount} />

      {/* ── D1: Insight Resonance Check ── */}
      <InsightResonanceCheck />

      {/* ── B2: Observation Depth Meter ── */}
      <ObservationDepthMeter totalObservations={totalObservationCount} />

      {/* Meta-Observation: 結果へのリアクション収集 */}
      <MetaReactionCollector
        touchedAxes={touchedAxes}
        axisScores={axisScores}
      />

      {/* ── A2: Data Safety Message ── */}
      <motion.div
        className="flex items-center gap-2 px-4 py-3 rounded-xl"
        style={{
          background: "rgba(255,255,255,0.5)",
          border: "1px solid rgba(160,170,200,0.1)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        <span style={{ fontSize: "0.75rem" }}>🔒</span>
        <p className="text-xs leading-relaxed" style={{ color: "rgba(120,125,140,0.5)" }}>
          このデータはあなただけのものです。観測データはデバイスに保存され、あなた以外には公開されません。
        </p>
      </motion.div>

      <div
        className="card-section text-center"
        style={{
          borderTop: "1px solid rgba(160,170,200,0.12)",
          background: "rgba(255,255,255,0.62)",
        }}
      >
        <span className="font-mono-sg text-xs block mb-1" style={{ color: "rgba(48,160,110,0.86)" }}>
          ✓ 本日の観測完了
        </span>
        <p className="text-sm leading-6" style={{ color: "rgba(72,78,102,0.8)" }}>
          {streak > 1
            ? `${streak}日連続で観測中です。累計 ${totalDays} 日の観測履歴をもとに、明日また新しい場面が用意されます。`
            : "今日の観測は完了しています。次の開始は明日です。"}
        </p>
      </div>
    </motion.div>
  );
}

// ── Unlock reasoning helper ──
function getUnlockReason(featureName: string, requiredDays: number): string | null {
  const reasons: Record<string, string> = {
    "週間パターンの検出": `${requiredDays}日分のデータで初めて曜日の傾向が見えます`,
    "Alter との基本対話": "矛盾を検出するには複数回の観測が必要です",
    "応答時間分析の表示": "反応速度の傾向は一定の蓄積で正確になります",
    "周期パターンの検出": "2週間分の変動データから周期性を検出します",
    "深層予測の解放": "十分な観測履歴があって初めて信頼できる予測が可能になります",
    "矛盾マップの全体表示": "矛盾の検出には多面的な観測の蓄積が不可欠です",
    "盲点検出の解放": "あなたが見落としがちなパターンは長期観測で浮かびます",
  };
  // Partial match
  for (const [key, reason] of Object.entries(reasons)) {
    if (featureName.includes(key.slice(0, 6))) return reason;
  }
  return null;
}

// ── B2: Level Roadmap ──

function LevelRoadmap({ streak }: { streak: number }) {
  const state = useMemo(() => {
    try { return getStreakState(); } catch { return null; }
  }, []);

  const currentLevelIdx = STREAK_LEVELS.findIndex(
    (l) => l.level === (state?.currentLevel ?? "observer")
  );
  const currentLevel = STREAK_LEVELS[Math.max(0, currentLevelIdx)];
  const nextLevel = STREAK_LEVELS[currentLevelIdx + 1];

  if (!nextLevel) {
    // Max level reached
    return (
      <motion.div
        className="card-section text-center"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        <span className="text-section-header">レベル</span>
        <p className="mt-2 font-display text-base" style={{ color: "rgba(170,150,90,0.85)" }}>
          🌌 {currentLevel.nameJa} — 最高レベル到達
        </p>
      </motion.div>
    );
  }

  const daysProgress = Math.min(streak / nextLevel.requiredDays, 1);
  const daysRemaining = Math.max(0, nextLevel.requiredDays - streak);

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-section-header">レベル進捗</span>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{
            background: "rgba(170,150,90,0.08)",
            color: "rgba(170,150,90,0.7)",
          }}
        >
          {currentLevel.nameJa}
        </span>
      </div>

      {/* Progress bar to next level */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: "rgba(60,65,85,0.6)" }}>
            次: {nextLevel.nameJa}
          </span>
          <span className="font-mono-sg text-xs" style={{ color: "rgba(170,150,90,0.5)" }}>
            あと {daysRemaining} 日
          </span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden"
          style={{ background: "rgba(160,170,200,0.1)" }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, rgba(170,150,90,0.5), rgba(190,170,110,0.3))" }}
            initial={{ width: 0 }}
            animate={{ width: `${daysProgress * 100}%` }}
            transition={{ delay: 0.7, duration: 0.4, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* Next level unlocks preview with reasoning */}
      <div className="mt-3 space-y-2">
        <p className="text-[10px] uppercase tracking-wider" style={{ color: "rgba(120,125,140,0.45)" }}>
          解放される機能
        </p>
        {nextLevel.unlocks.slice(0, 3).map((unlock, i) => {
          const reason = getUnlockReason(unlock, nextLevel.requiredDays);
          return (
            <div key={i} className="space-y-0.5">
              <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(100,105,130,0.55)" }}>
                <span style={{ color: "rgba(160,170,200,0.3)" }}>🔒</span>
                {unlock}
              </div>
              {reason && (
                <p className="text-[10px] ml-6" style={{ color: "rgba(120,125,140,0.35)" }}>
                  {reason}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── C1: Calendar Heatmap (30 days) ──

function CalendarHeatmap() {
  const [dbDates, setDbDates] = useState<Set<string>>(new Set());

  // Fetch observation dates from DB to backfill calendar
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/stargazer/daily-observation?dates=30", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.observationDates && Array.isArray(data.observationDates)) {
            const dateSet = new Set<string>(data.observationDates);
            setDbDates(dateSet);
            // Backfill localStorage markers for future reads
            dateSet.forEach((d) => {
              try { localStorage.setItem(`culcept_sg_observed_${d}`, "1"); } catch { /* */ }
            });
          }
        }
      } catch { /* silent */ }
    })();
  }, []);

  const days = useMemo(() => {
    const result: { date: string; hasObservation: boolean; isToday: boolean }[] = [];
    const today = new Date();
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      let hasObservation = false;
      try {
        if (typeof window !== "undefined") {
          hasObservation = !!localStorage.getItem(`culcept_sg_observe_v1_${dateStr}`)
            || !!localStorage.getItem(`culcept_sg_observed_${dateStr}`);
        }
      } catch { /* */ }
      // Also check DB dates
      if (dbDates.has(dateStr)) hasObservation = true;
      result.push({ date: dateStr, hasObservation, isToday: i === 0 });
    }
    return result;
  }, [dbDates]);

  const observedCount = days.filter((d) => d.hasObservation).length;

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.65 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-section-header">30日間のアクティビティ</span>
        <span className="font-mono-sg text-xs" style={{ color: "rgba(170,150,90,0.5)" }}>
          {observedCount}/30日
        </span>
      </div>

      <div className="grid grid-cols-10 gap-1">
        {days.map((day, i) => (
          <motion.div
            key={day.date}
            className="aspect-square rounded-sm relative"
            style={{
              background: day.hasObservation
                ? day.isToday
                  ? "rgba(170,150,90,0.5)"
                  : "rgba(170,150,90,0.25)"
                : "rgba(160,170,200,0.08)",
            }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.7 + i * 0.01 }}
            title={day.date}
          >
            {day.isToday && (
              <motion.div
                className="absolute inset-0 rounded-sm"
                style={{ border: "1px solid rgba(170,150,90,0.6)" }}
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </motion.div>
        ))}
      </div>

      <div className="flex items-center gap-3 mt-2">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ background: "rgba(160,170,200,0.08)" }} />
          <span className="text-[10px]" style={{ color: "rgba(120,125,140,0.4)" }}>未観測</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ background: "rgba(170,150,90,0.25)" }} />
          <span className="text-[10px]" style={{ color: "rgba(120,125,140,0.4)" }}>観測済み</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ background: "rgba(170,150,90,0.5)", border: "1px solid rgba(170,150,90,0.6)" }} />
          <span className="text-[10px]" style={{ color: "rgba(120,125,140,0.4)" }}>今日</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── B4: Tomorrow Teaser ──

function TomorrowTeaser({ streak, totalObservations }: { streak: number; totalObservations: number }) {
  const teaser = useMemo(() => {
    // Dynamic teasers based on streak and observation count
    if (streak < 3) return "3日連続で観測すると、基本パターンが検出されます";
    if (streak < 7) return `あと${7 - streak}日で週間パターン分析が解放されます`;
    if (streak < 14) return `あと${14 - streak}日で周期パターンの検出が始まります`;
    if (streak < 21) return `あと${21 - streak}日で矛盾マップが完成します`;
    if (totalObservations < 50) return "観測を重ねるほど、予測精度が向上します";
    return "明日の観測で、新しいパターンが見えてくるかもしれません";
  }, [streak, totalObservations]);

  return (
    <motion.div
      className="rounded-2xl p-4"
      style={{
        background: "linear-gradient(135deg, rgba(170,150,90,0.04), rgba(139,92,246,0.03))",
        border: "1px solid rgba(170,150,90,0.1)",
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.75 }}
    >
      <div className="flex items-start gap-3">
        <span className="text-lg mt-0.5">🔮</span>
        <div>
          <p
            className="font-mono-sg text-[10px] tracking-[0.15em] uppercase mb-1"
            style={{ color: "rgba(170,150,90,0.45)" }}
          >
            Tomorrow&apos;s Preview
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "rgba(60,65,85,0.7)" }}>
            {teaser}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── D1: Insight Resonance Check ──

function InsightResonanceCheck() {
  const [todayKey] = useState(() => `sg_resonance_${localDateKey()}`);
  const [selected, setSelected] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try { return localStorage.getItem(`sg_resonance_${localDateKey()}`); } catch { return null; }
  });

  const handleSelect = (value: string) => {
    setSelected(value);
    try { localStorage.setItem(todayKey, value); } catch { /* */ }
  };

  if (selected) {
    return (
      <motion.div
        className="card-section text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <p className="text-xs" style={{ color: "rgba(170,150,90,0.6)" }}>
          ✓ 記録しました — この反応も観測データです
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <p className="text-xs mb-3" style={{ color: "rgba(80,85,105,0.55)" }}>
        今日のインサイトを読んで、どう感じましたか？
      </p>
      <div className="flex flex-wrap gap-2">
        {[
          { value: "resonated", label: "当たってる" },
          { value: "surprised", label: "意外だ" },
          { value: "curious", label: "もっと知りたい" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => handleSelect(opt.value)}
            className="text-xs px-3 py-2 rounded-xl transition-all"
            style={{
              background: "rgba(255,255,255,0.5)",
              border: "1px solid rgba(160,170,200,0.14)",
              color: "rgba(80,85,105,0.6)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}

// ── B2: Observation Depth Meter ──

function ObservationDepthMeter({ totalObservations }: { totalObservations: number }) {
  const depths = [
    { label: "表層", sublabel: "傾向の輪郭", min: 1, max: 5, color: "rgba(190,170,110,0.6)" },
    { label: "中層", sublabel: "判断パターン", min: 6, max: 15, color: "rgba(160,150,210,0.6)" },
    { label: "深層", sublabel: "無自覚な法則", min: 16, max: 30, color: "rgba(120,130,180,0.6)" },
    { label: "核心", sublabel: "変化の法則", min: 31, max: 999, color: "rgba(170,150,90,0.7)" },
  ];

  const currentDepthIdx = depths.findIndex(
    (d) => totalObservations >= d.min && totalObservations <= d.max
  );
  const activeIdx = currentDepthIdx >= 0 ? currentDepthIdx : 0;
  const currentDepth = depths[activeIdx];
  const nextDepth = depths[activeIdx + 1];
  const progressInLevel = nextDepth
    ? (totalObservations - currentDepth.min) / (nextDepth.min - currentDepth.min)
    : 1;

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-section-header">観測の深度</span>
        <span className="font-mono-sg text-xs" style={{ color: currentDepth.color }}>
          {currentDepth.label}
        </span>
      </div>

      <div className="flex items-center gap-1">
        {depths.map((d, i) => (
          <div
            key={d.label}
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ background: "rgba(160,170,200,0.08)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: d.color }}
              initial={{ width: 0 }}
              animate={{
                width: i < activeIdx ? "100%" : i === activeIdx ? `${Math.min(progressInLevel, 1) * 100}%` : "0%",
              }}
              transition={{ delay: 0.7 + i * 0.1, duration: 0.25 }}
            />
          </div>
        ))}
      </div>

      <div className="flex justify-between mt-1.5">
        {depths.map((d, i) => (
          <span
            key={d.label}
            className="text-[9px]"
            style={{ color: i <= activeIdx ? d.color : "rgba(160,170,200,0.25)" }}
          >
            {d.label}
          </span>
        ))}
      </div>

      {nextDepth && (
        <p className="text-[10px] mt-2 text-center" style={{ color: "rgba(120,125,140,0.4)" }}>
          あと {nextDepth.min - totalObservations} 回の観測で「{nextDepth.label}」に到達
        </p>
      )}
    </motion.div>
  );
}

// ── Meta-Observation リアクション収集 ──

type ReactionType = "surprised" | "validated" | "denied" | "curious" | "indifferent";

const REACTION_OPTIONS: { value: ReactionType; icon: string; label: string }[] = [
  { value: "surprised", icon: "😮", label: "意外だった" },
  { value: "validated", icon: "✓", label: "納得した" },
  { value: "curious", icon: "?", label: "もっと知りたい" },
  { value: "denied", icon: "✗", label: "違うと思う" },
  { value: "indifferent", icon: "—", label: "特に感じない" },
];

function MetaReactionCollector({
  touchedAxes,
  axisScores,
}: {
  touchedAxes: { key: string; label: string; totalWeight: number }[];
  axisScores: Partial<Record<TraitAxisKey, number>>;
}) {
  const [metaTodayKey] = useState(() => `sg_meta_reaction_${localDateKey()}`);
  const [selectedReaction, setSelectedReaction] = useState<ReactionType | null>(null);
  const [submitted, setSubmitted] = useState(() => {
    if (typeof window === "undefined") return false;
    try { return !!localStorage.getItem(`sg_meta_reaction_${localDateKey()}`); } catch { return false; }
  });

  const topAxes = useMemo(
    () => touchedAxes.slice(0, 3).map((a) => a.key as TraitAxisKey),
    [touchedAxes],
  );

  const handleSubmit = useCallback(async () => {
    if (!selectedReaction || topAxes.length === 0) return;
    setSubmitted(true);
    try { localStorage.setItem(metaTodayKey, selectedReaction); } catch { /* */ }

    const reactions = topAxes.map((axisId) => ({
      axisId,
      reaction: selectedReaction,
      score: axisScores[axisId] ?? 0,
    }));

    // localStorage にも保存（既存のMetaObservationCard読み取り用）
    try {
      const key = "culcept_sg_meta_observations_v1";
      const existing = JSON.parse(localStorage.getItem(key) || "[]");
      for (const r of reactions) {
        existing.push({
          ...r,
          date: new Date().toISOString().split("T")[0],
          timestamp: new Date().toISOString(),
        });
      }
      while (existing.length > 200) existing.shift();
      localStorage.setItem(key, JSON.stringify(existing));
    } catch { /* silent */ }

    // DB に永続化
    try {
      await fetch("/api/stargazer/observations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: "meta_observation",
          reactions,
          sessionDate: new Date().toISOString().split("T")[0],
        }),
      });
    } catch { /* non-critical */ }
  }, [selectedReaction, topAxes, axisScores]);

  if (topAxes.length === 0) return null;

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <span className="text-section-header">メタ観測</span>
      <p
        className="mt-2 text-sm leading-7 mb-4"
        style={{ color: "rgba(58,64,88,0.82)" }}
      >
        今日の結果を見て、どう感じましたか？この反応自体が、自己認識の深さを示すデータになります。
      </p>

      {!submitted ? (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {REACTION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setSelectedReaction(opt.value)}
                className="text-xs px-3 py-2 rounded-xl transition-all"
                style={{
                  background: selectedReaction === opt.value
                    ? "rgba(112,78,210,0.12)"
                    : "rgba(255,255,255,0.5)",
                  border: selectedReaction === opt.value
                    ? "1px solid rgba(112,78,210,0.3)"
                    : "1px solid rgba(160,170,200,0.14)",
                  color: selectedReaction === opt.value
                    ? "rgba(30,35,55,0.88)"
                    : "rgba(100,105,130,0.6)",
                }}
              >
                {opt.icon} {opt.label}
              </button>
            ))}
          </div>
          {selectedReaction && (
            <motion.button
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              onClick={handleSubmit}
              className="text-xs px-5 py-2 rounded-lg transition-all"
              style={{
                background: "rgba(112,78,210,0.15)",
                border: "1px solid rgba(112,78,210,0.25)",
                color: "rgba(30,35,55,0.82)",
              }}
            >
              記録する
            </motion.button>
          )}
        </div>
      ) : (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-xs"
          style={{ color: "rgba(48,160,110,0.7)" }}
        >
          ✓ メタ観測を記録しました
        </motion.p>
      )}
    </motion.div>
  );
}

// ── Behavioral Insights Section: 行動パターン分析 ──

const INSIGHT_CATEGORY_META: Record<string, { icon: string; label: string; color: string }> = {
  hesitation_pattern: { icon: "⏳", label: "迷いのパターン", color: "rgba(190,170,110,0.85)" },
  avoidance_zone: { icon: "🚫", label: "回避ゾーン", color: "rgba(220,120,80,0.85)" },
  emotional_trigger: { icon: "⚡", label: "感情トリガー", color: "rgba(200,160,60,0.85)" },
  decision_style: { icon: "🎯", label: "判断スタイル", color: "rgba(112,78,210,0.85)" },
  self_deception: { icon: "🪞", label: "自己欺瞞", color: "rgba(139,92,246,0.85)" },
};

/** Convert collector sessions to engine signal format */
function convertToEngineSignals(sessions: SessionSignals[]): EngineSignal[] {
  const signals: EngineSignal[] = [];
  for (const session of sessions) {
    for (const s of session.signals) {
      signals.push({
        type: "response_time",
        value: s.responseTimeMs,
        questionId: s.questionId,
        axisId: s.questionId.split("-")[0] ?? "unknown",
        timestamp: new Date(s.timestamp).toISOString(),
      });
      if (s.answerChanged) {
        signals.push({
          type: "answer_change",
          value: 1,
          questionId: s.questionId,
          axisId: s.questionId.split("-")[0] ?? "unknown",
          timestamp: new Date(s.timestamp).toISOString(),
        });
      }
      if (s.scrollbackCount > 0) {
        signals.push({
          type: "back_navigation",
          value: s.scrollbackCount,
          questionId: s.questionId,
          axisId: s.questionId.split("-")[0] ?? "unknown",
          timestamp: new Date(s.timestamp).toISOString(),
        });
      }
      for (const [opt, dur] of Object.entries(s.hoverDurations)) {
        if (dur > 500 && opt !== s.selectedOption) {
          signals.push({
            type: "option_hover",
            value: dur,
            questionId: s.questionId,
            axisId: s.questionId.split("-")[0] ?? "unknown",
            timestamp: new Date(s.timestamp).toISOString(),
          });
        }
      }
    }
  }
  return signals;
}

function BehavioralInsightsSection({
  axisScores,
}: {
  axisScores: Partial<Record<string, number>>;
}) {
  const insights = useMemo(() => {
    try {
      const sessions = SignalCollector.loadPastSessions(10);
      if (sessions.length === 0) return [];
      const engineSignals = convertToEngineSignals(sessions);
      if (engineSignals.length < 5) return [];
      const input: BehavioralInsightInput = {
        signals: engineSignals,
        axisScores: axisScores as Record<string, number>,
        archetypeCode: "HCW",
      };
      return generateBehavioralInsights(input).slice(0, 3);
    } catch {
      return [];
    }
  }, [axisScores]);

  if (insights.length === 0) return null;

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.35 }}
    >
      <span className="text-section-header">行動パターン</span>
      <p
        className="mt-2 text-sm leading-7 mb-4"
        style={{ color: "rgba(58,64,88,0.82)" }}
      >
        回答の行動パターンから検出された無自覚な傾向です。口で言うことと、実際の行動は違うことがあります。
      </p>

      <div className="space-y-3">
        {insights.map((insight, i) => {
          const meta = INSIGHT_CATEGORY_META[insight.category] ?? {
            icon: "💡",
            label: insight.category,
            color: "rgba(100,100,100,0.85)",
          };
          const importance = getInsightImportanceLabel(insight);
          return (
            <motion.div
              key={`${insight.category}-${i}`}
              className="rounded-xl p-3"
              style={{
                background: "rgba(255,255,255,0.6)",
                border: "1px solid rgba(139,92,246,0.12)",
              }}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.1 }}
            >
              <div className="flex items-start gap-3">
                <span className="text-lg shrink-0">{meta.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs font-medium"
                      style={{ color: meta.color }}
                    >
                      {meta.label}
                    </span>
                    {importance.level === "critical" && (
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: "rgba(220,80,80,0.1)",
                          color: "rgba(200,60,60,0.8)",
                        }}
                      >
                        {importance.label}
                      </span>
                    )}
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "rgba(30,35,55,0.88)" }}
                  >
                    {insight.description}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "rgba(100,105,130,0.55)" }}
                  >
                    {insight.evidence}
                  </p>
                  {/* Confidence bar */}
                  <div className="flex items-center gap-2 mt-2">
                    <div
                      className="h-1 flex-1 rounded-full overflow-hidden"
                      style={{ background: "rgba(160,170,200,0.12)" }}
                    >
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${insight.confidence * 100}%`,
                          background: meta.color,
                          opacity: 0.6,
                        }}
                      />
                    </div>
                    <span
                      className="font-mono-sg text-[10px]"
                      style={{ color: "rgba(100,105,130,0.45)" }}
                    >
                      {Math.round(insight.confidence * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Contradiction Insights Section: 矛盾検出 ──

function ContradictionInsightsSection({
  axisScores,
}: {
  axisScores: Partial<Record<string, number>>;
}) {
  const contradictions = useMemo(() => {
    try {
      const scores = axisScores as Record<string, number>;
      if (Object.keys(scores).length < 3) return [];

      const input: ContradictionDetectorInput = {
        axisScores: scores,
        scoreHistory: [],
        behaviorSignals: [],
        scenarioResponses: [],
      };
      return runContradictionDetection(input).slice(0, 3);
    } catch {
      return [];
    }
  }, [axisScores]);

  if (contradictions.length === 0) return null;

  const SEVERITY_STYLES: Record<string, { bg: string; border: string; label: string }> = {
    high: {
      bg: "rgba(220,80,80,0.06)",
      border: "rgba(220,80,80,0.15)",
      label: "強い矛盾",
    },
    medium: {
      bg: "rgba(200,160,60,0.06)",
      border: "rgba(200,160,60,0.15)",
      label: "中程度の揺れ",
    },
    low: {
      bg: "rgba(139,92,246,0.04)",
      border: "rgba(139,92,246,0.12)",
      label: "微かな緊張",
    },
  };

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
    >
      <span className="text-section-header">内なる矛盾</span>
      <p
        className="mt-2 text-sm leading-7 mb-4"
        style={{ color: "rgba(58,64,88,0.82)" }}
      >
        矛盾は弱さではなく、複雑さの証拠です。あなたの中の対立する力を観測しています。
      </p>

      <div className="space-y-3">
        {contradictions.map((c, i) => {
          const severityKey = c.severity > 0.7 ? "high" : c.severity > 0.4 ? "medium" : "low";
          const style = SEVERITY_STYLES[severityKey];
          return (
            <motion.div
              key={`${c.type}-${c.axisA}-${c.axisB}-${i}`}
              className="rounded-xl p-3"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
              }}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.1 }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: style.bg,
                    border: `1px solid ${style.border}`,
                    color: "rgba(80,85,105,0.7)",
                  }}
                >
                  {style.label}
                </span>
                <span
                  className="font-mono-sg text-[10px]"
                  style={{ color: "rgba(100,105,130,0.45)" }}
                >
                  {c.type.replace("_", " ")}
                </span>
              </div>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "rgba(30,35,55,0.88)" }}
              >
                {c.description}
              </p>
              {c.insightPotential && (
                <p
                  className="text-xs mt-1.5"
                  style={{ color: "rgba(100,105,130,0.6)" }}
                >
                  {c.insightPotential}
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Implicit Values Section: 深層価値観 ──

function ImplicitValuesSection({
  axisScores,
}: {
  axisScores: Partial<Record<string, number>>;
}) {
  const result = useMemo(() => {
    try {
      return extractImplicitValues(axisScores as Partial<Record<import("@/lib/stargazer/traitAxes").TraitAxisKey, number>>);
    } catch {
      return null;
    }
  }, [axisScores]);

  if (!result || result.values.length === 0) return null;

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
    >
      <span className="text-section-header">深層の価値観</span>
      <p
        className="mt-2 text-sm leading-7 mb-4"
        style={{ color: "rgba(58,64,88,0.82)" }}
      >
        回答パターンから推定された、あなたが無意識に優先している価値観です。
      </p>

      {/* Core theme */}
      <div
        className="rounded-xl p-3 mb-4"
        style={{
          background: "linear-gradient(135deg, rgba(139,92,246,0.06), rgba(190,170,110,0.06))",
          border: "1px solid rgba(139,92,246,0.12)",
        }}
      >
        <span className="sg-text-micro">CORE THEME</span>
        <p
          className="mt-1 text-sm leading-relaxed font-medium"
          style={{ color: "rgba(30,35,55,0.9)" }}
        >
          {result.coreTheme}
        </p>
      </div>

      {/* Top values */}
      <div className="space-y-2 mb-4">
        {result.values.slice(0, 5).map((v, i) => (
          <motion.div
            key={v.name}
            className="flex items-center gap-3"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.55 + i * 0.06 }}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-medium" style={{ color: "rgba(30,35,55,0.85)" }}>
                  {v.name}
                </span>
                <span className="font-mono-sg text-[10px]" style={{ color: "rgba(100,105,130,0.5)" }}>
                  {Math.round(v.confidence * 100)}%
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: "rgba(160,170,200,0.1)" }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, rgba(139,92,246,${0.3 + v.confidence * 0.4}), rgba(190,170,110,${0.2 + v.confidence * 0.3}))`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${v.confidence * 100}%` }}
                  transition={{ delay: 0.6 + i * 0.06, duration: 0.22 }}
                />
              </div>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(100,105,130,0.5)" }}>
                {v.manifestation}
              </p>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Value conflicts */}
      {result.conflicts.length > 0 && (
        <div>
          <span
            className="text-[10px] uppercase tracking-wider block mb-2"
            style={{ color: "rgba(120,125,140,0.45)" }}
          >
            内面の緊張
          </span>
          {result.conflicts.slice(0, 2).map((c, i) => (
            <div
              key={i}
              className="rounded-lg p-2.5 mb-2"
              style={{
                background: "rgba(200,160,60,0.04)",
                border: "1px solid rgba(200,160,60,0.1)",
              }}
            >
              <p className="text-xs" style={{ color: "rgba(30,35,55,0.8)" }}>
                <span style={{ color: "rgba(200,160,60,0.85)" }}>{c.valueA}</span>
                {" ↔ "}
                <span style={{ color: "rgba(139,92,246,0.85)" }}>{c.valueB}</span>
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: "rgba(100,105,130,0.6)" }}>
                {c.description}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Summary */}
      <p
        className="text-xs mt-3 leading-relaxed"
        style={{ color: "rgba(80,85,105,0.55)" }}
      >
        {result.summary}
      </p>
    </motion.div>
  );
}

// ── Stress Cascade Section: ストレス崩壊予測 ──

function StressCascadeSection({
  axisScores,
}: {
  axisScores: Partial<Record<string, number>>;
}) {
  const result = useMemo(() => {
    try {
      return analyzeStressCascade(axisScores as Partial<Record<import("@/lib/stargazer/traitAxes").TraitAxisKey, number>>);
    } catch {
      return null;
    }
  }, [axisScores]);

  if (!result || result.cascade.length === 0) return null;

  const STAGE_COLORS = {
    1: { bg: "rgba(220,80,80,0.06)", border: "rgba(220,80,80,0.15)", label: "最初に崩れる" },
    2: { bg: "rgba(200,160,60,0.06)", border: "rgba(200,160,60,0.15)", label: "次に崩れる" },
    3: { bg: "rgba(48,160,110,0.06)", border: "rgba(48,160,110,0.15)", label: "最後まで残る" },
  };

  const DIRECTION_LABELS: Record<string, string> = {
    regress_left: "← 反対側に退行",
    regress_right: "→ 極端に強化",
    amplify: "↑ 過剰に増幅",
    freeze: "■ 凍結・停止",
  };

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55 }}
    >
      <span className="text-section-header">ストレス連鎖予測</span>
      <p
        className="mt-2 text-sm leading-7 mb-4"
        style={{ color: "rgba(58,64,88,0.82)" }}
      >
        ストレス下であなたの特性がどの順番で崩れるかの予測です。これは予測であり、確定した未来ではありません。
      </p>

      {/* Cascade steps */}
      <div className="space-y-2 mb-4">
        {result.cascade.slice(0, 6).map((step, i) => {
          const stageColor = STAGE_COLORS[step.stage] ?? STAGE_COLORS[2];
          return (
            <motion.div
              key={`${step.axis}-${step.stage}`}
              className="rounded-xl p-3"
              style={{
                background: stageColor.bg,
                border: `1px solid ${stageColor.border}`,
              }}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.6 + i * 0.08 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: stageColor.bg,
                    border: `1px solid ${stageColor.border}`,
                    color: "rgba(80,85,105,0.7)",
                  }}
                >
                  Stage {step.stage}
                </span>
                <span className="text-xs font-medium" style={{ color: "rgba(30,35,55,0.85)" }}>
                  {step.axisLabel}
                </span>
                <span className="font-mono-sg text-[10px] ml-auto" style={{ color: "rgba(100,105,130,0.45)" }}>
                  {DIRECTION_LABELS[step.stressDirection] ?? step.stressDirection}
                </span>
              </div>
              <p className="text-xs" style={{ color: "rgba(80,85,105,0.65)" }}>
                {step.description}
              </p>
            </motion.div>
          );
        })}
      </div>

      {/* Last Standing */}
      {result.lastStanding && (
        <div
          className="rounded-xl p-3 mb-3"
          style={{
            background: "linear-gradient(135deg, rgba(48,160,110,0.06), rgba(139,92,246,0.04))",
            border: "1px solid rgba(48,160,110,0.15)",
          }}
        >
          <span className="sg-text-micro" style={{ color: "rgba(48,160,110,0.7)" }}>最後まで残る自分</span>
          <p className="mt-1 text-sm font-medium" style={{ color: "rgba(30,35,55,0.9)" }}>
            {result.lastStanding.axisLabel}
          </p>
          <p className="text-xs mt-0.5" style={{ color: "rgba(80,85,105,0.6)" }}>
            {result.lastStanding.description}
          </p>
        </div>
      )}

      {/* Early warnings */}
      {result.earlyWarnings.length > 0 && (
        <div>
          <span
            className="text-[10px] uppercase tracking-wider block mb-1.5"
            style={{ color: "rgba(120,125,140,0.45)" }}
          >
            早期警告サイン
          </span>
          <ul className="space-y-1">
            {result.earlyWarnings.slice(0, 3).map((w, i) => (
              <li
                key={i}
                className="text-xs leading-relaxed"
                style={{ color: "rgba(80,85,105,0.6)" }}
              >
                ・{w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Resilience profile */}
      <p
        className="text-xs mt-3 leading-relaxed"
        style={{ color: "rgba(80,85,105,0.5)" }}
      >
        {result.resilienceProfile}
      </p>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// Ghost Resonance Section: 匿名パターン共鳴
// ═══════════════════════════════════════════════════════════

const GHOST_CATEGORY_META: Record<string, { icon: string; label: string }> = {
  discovery: { icon: "🔭", label: "発見" },
  struggle: { icon: "🌊", label: "格闘" },
  breakthrough: { icon: "⚡", label: "突破" },
  pattern: { icon: "🔄", label: "反復" },
  mirror: { icon: "🪞", label: "鏡像" },
  wound: { icon: "🩹", label: "傷痕" },
  season: { icon: "🍂", label: "季節" },
  echo: { icon: "🔮", label: "残響" },
};

function GhostResonanceSection({
  axisScores,
  totalObservations,
}: {
  axisScores: Partial<Record<string, number>>;
  totalObservations: number;
}) {
  const resonances = useMemo(() => {
    try {
      const scores = axisScores as Record<string, number>;
      const scoreEntries = Object.entries(scores);
      if (scoreEntries.length < 3) return [];

      // 軸スコアからアーキタイプコードを推定
      const sorted = scoreEntries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
      const top3 = sorted.slice(0, 3).map(([, v]) => (v > 0 ? "P" : v < -0.2 ? "H" : "B"));
      const archetypeCode = top3.slice(0, 3).join("").padEnd(3, "W").slice(0, 3);

      // 影コードは逆
      const shadowMap: Record<string, string> = { P: "H", H: "P", B: "B", W: "W" };
      const shadowCode = archetypeCode.split("").map((c) => shadowMap[c] ?? "B").join("");

      // 矛盾ペアを検出
      const contradictions: { axisA: string; axisB: string; tension: number }[] = [];
      for (let i = 0; i < scoreEntries.length; i++) {
        for (let j = i + 1; j < Math.min(scoreEntries.length, i + 5); j++) {
          const diff = Math.abs(scoreEntries[i][1] - scoreEntries[j][1]);
          if (diff > 0.5) {
            contradictions.push({
              axisA: scoreEntries[i][0],
              axisB: scoreEntries[j][0],
              tension: diff,
            });
          }
        }
      }

      const observationDepth = Math.min(100, Math.round((totalObservations / 100) * 100));
      const today = new Date().toISOString().split("T")[0];

      const input: GhostResonanceInput = {
        archetypeCode,
        shadowCode,
        axisScores: scores,
        contradictions,
        observationDepth,
        dateSeed: today,
      };

      return generateMultipleResonances(input, 3);
    } catch {
      return [];
    }
  }, [axisScores, totalObservations]);

  if (resonances.length === 0) return null;

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
    >
      <span className="text-section-header">似た星の共鳴</span>
      <p
        className="mt-2 text-sm leading-7 mb-4"
        style={{ color: "rgba(58,64,88,0.82)" }}
      >
        あなたと同じもうひとりのパターンを持つ「誰か」の存在。実在するかもしれないし、しないかもしれない。
      </p>

      <div className="space-y-3">
        {resonances.map((ghost, i) => {
          const meta = GHOST_CATEGORY_META[ghost.category] ?? { icon: "👤", label: ghost.category };
          return (
            <motion.div
              key={ghost.id}
              className="rounded-xl p-3"
              style={{
                background: "linear-gradient(135deg, rgba(139,92,246,0.04), rgba(190,170,110,0.03))",
                border: "1px solid rgba(139,92,246,0.1)",
              }}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.65 + i * 0.1 }}
            >
              {/* Header: category + pattern name */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm">{meta.icon}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    background: "rgba(139,92,246,0.08)",
                    border: "1px solid rgba(139,92,246,0.15)",
                    color: "rgba(139,92,246,0.8)",
                  }}
                >
                  {meta.label}
                </span>
                <span
                  className="font-mono-sg text-[10px] ml-auto"
                  style={{ color: "rgba(139,92,246,0.35)" }}
                >
                  {ghost.patternName}
                </span>
              </div>

              {/* Insight message */}
              <p
                className="text-sm leading-relaxed mb-2"
                style={{ color: "rgba(30,35,55,0.85)" }}
              >
                {ghost.insight}
              </p>

              {/* Resonance context */}
              <p
                className="text-xs leading-relaxed mb-2"
                style={{ color: "rgba(80,85,105,0.55)" }}
              >
                {ghost.resonanceContext}
              </p>

              {/* Similarity bar + pattern hash */}
              <div className="flex items-center gap-2">
                <div
                  className="h-1 flex-1 rounded-full overflow-hidden"
                  style={{ background: "rgba(139,92,246,0.08)" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(ghost.similarity * 100)}%`,
                      background: "linear-gradient(90deg, rgba(139,92,246,0.4), rgba(190,170,110,0.3))",
                    }}
                  />
                </div>
                <span
                  className="font-mono-sg text-[9px]"
                  style={{ color: "rgba(120,125,140,0.4)" }}
                >
                  {Math.round(ghost.similarity * 100)}% ・ #{ghost.patternHash.slice(0, 8)}
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── Cross-System Contradictions Section: 横断矛盾検出 ──

interface CrossSystemContradiction {
  id: string;
  headline: string;
  description: string;
  sources: string[];
  relatedAxes: string[];
  severity: "whisper" | "notable" | "profound";
  severityScore: number;
  reflectionPrompt: string;
  category: string;
}

interface CrossSystemSyncResponse {
  ok: boolean;
  contradictions: CrossSystemContradiction[];
  feedback: {
    origin: { axis: string; adjustment: number; confidence: number }[];
    rendezvous: { axis: string; adjustment: number; confidence: number }[];
  };
  meta: {
    systemsConnected: Record<string, boolean>;
    totalObservations: number;
  };
}

const CROSS_SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: string; label: string }> = {
  profound: {
    bg: "rgba(220,80,80,0.06)",
    border: "rgba(220,80,80,0.15)",
    icon: "⚡",
    label: "深い横断矛盾",
  },
  notable: {
    bg: "rgba(200,160,60,0.06)",
    border: "rgba(200,160,60,0.15)",
    icon: "🔀",
    label: "システム間の揺れ",
  },
  whisper: {
    bg: "rgba(139,92,246,0.04)",
    border: "rgba(139,92,246,0.12)",
    icon: "🌊",
    label: "微かな不一致",
  },
};

const SOURCE_LABELS: Record<string, string> = {
  stargazer: "深層観測",
  origin: "Origin",
  presence: "Presence",
  style: "スタイル",
  rendezvous: "Rendezvous",
};

function CrossSystemContradictionsSection() {
  const [data, setData] = useState<CrossSystemSyncResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/stargazer/cross-system-sync", { credentials: "include" });
        if (res.ok && !cancelled) {
          const json = await res.json();
          if (json.ok) setData(json);
        }
      } catch { /* silent */ }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;
  if (!data || data.contradictions.length === 0) {
    // Show connected systems summary even without contradictions
    if (data?.meta?.systemsConnected) {
      const connected = Object.entries(data.meta.systemsConnected).filter(([, v]) => v);
      if (connected.length < 2) return null;
      return (
        <motion.div
          className="card-section"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.47 }}
        >
          <span className="text-section-header">システム横断同期</span>
          <p className="mt-2 text-sm leading-7" style={{ color: "rgba(58,64,88,0.82)" }}>
            {connected.length}つのシステムが接続されています。観測を続けると、システム間の矛盾が検出されます。
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {connected.map(([sys]) => (
              <span
                key={sys}
                className="text-[10px] px-2 py-1 rounded-full"
                style={{
                  background: "rgba(48,160,110,0.08)",
                  border: "1px solid rgba(48,160,110,0.15)",
                  color: "rgba(48,140,100,0.8)",
                }}
              >
                {SOURCE_LABELS[sys] ?? sys}
              </span>
            ))}
          </div>
        </motion.div>
      );
    }
    return null;
  }

  const connectedCount = Object.values(data.meta.systemsConnected).filter(Boolean).length;
  const hasFeedback = (data.feedback.origin.length + data.feedback.rendezvous.length) > 0;

  return (
    <motion.div
      className="card-section"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.47 }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-section-header">システム横断の矛盾</span>
        <span
          className="text-[10px] px-2 py-0.5 rounded-full"
          style={{
            background: "rgba(112,78,210,0.06)",
            border: "1px solid rgba(112,78,210,0.12)",
            color: "rgba(96,68,176,0.7)",
          }}
        >
          {connectedCount} systems
        </span>
      </div>
      <p
        className="text-sm leading-7 mb-4"
        style={{ color: "rgba(58,64,88,0.82)" }}
      >
        異なるシステムがあなたについて語る「食い違い」。それは矛盾ではなく、あなたの多面性の証拠です。
      </p>

      <div className="space-y-3">
        {data.contradictions.slice(0, 4).map((c, i) => {
          const style = CROSS_SEVERITY_STYLES[c.severity] ?? CROSS_SEVERITY_STYLES.whisper;
          const isExpanded = expanded === c.id;
          return (
            <motion.div
              key={c.id}
              className="rounded-xl overflow-hidden cursor-pointer"
              style={{
                background: style.bg,
                border: `1px solid ${style.border}`,
              }}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.52 + i * 0.08 }}
              onClick={() => setExpanded(isExpanded ? null : c.id)}
            >
              <div className="p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs">{style.icon}</span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                      color: "rgba(80,85,105,0.7)",
                    }}
                  >
                    {style.label}
                  </span>
                  <div className="flex gap-1 ml-auto">
                    {c.sources.map((src) => (
                      <span
                        key={src}
                        className="font-mono-sg text-[9px] px-1 py-0.5 rounded"
                        style={{
                          background: "rgba(112,78,210,0.06)",
                          color: "rgba(100,105,130,0.5)",
                        }}
                      >
                        {SOURCE_LABELS[src] ?? src}
                      </span>
                    ))}
                  </div>
                </div>

                <p
                  className="text-sm font-medium leading-relaxed"
                  style={{ color: "rgba(30,35,55,0.9)" }}
                >
                  {c.headline}
                </p>
                <p
                  className="text-xs mt-1"
                  style={{ color: "rgba(80,85,105,0.65)" }}
                >
                  {c.description}
                </p>
              </div>

              {isExpanded && (
                <motion.div
                  className="px-3 pb-3 pt-0 space-y-2"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.2 }}
                >
                  <div
                    className="rounded-lg p-2.5"
                    style={{
                      background: "rgba(255,255,255,0.5)",
                      border: "1px solid rgba(160,170,200,0.1)",
                    }}
                  >
                    <p
                      className="text-[10px] uppercase tracking-wider mb-1"
                      style={{ color: "rgba(120,125,140,0.5)" }}
                    >
                      内省の問い
                    </p>
                    <p
                      className="text-xs leading-relaxed italic"
                      style={{ color: "rgba(50,55,75,0.8)" }}
                    >
                      {c.reflectionPrompt}
                    </p>
                  </div>
                  {c.relatedAxes.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {c.relatedAxes.map((axis) => (
                        <span
                          key={axis}
                          className="font-mono-sg text-[9px] px-1.5 py-0.5 rounded-full"
                          style={{
                            background: "rgba(139,92,246,0.06)",
                            border: "1px solid rgba(139,92,246,0.1)",
                            color: "rgba(120,125,140,0.5)",
                          }}
                        >
                          {axis}
                        </span>
                      ))}
                    </div>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Reverse feedback summary */}
      {hasFeedback && (
        <motion.div
          className="mt-4 rounded-xl p-3"
          style={{
            background: "linear-gradient(135deg, rgba(48,160,110,0.04), rgba(112,78,210,0.03))",
            border: "1px solid rgba(48,160,110,0.1)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.7 }}
        >
          <p
            className="text-[10px] uppercase tracking-wider mb-2"
            style={{ color: "rgba(48,140,100,0.6)" }}
          >
            REVERSE FEEDBACK
          </p>
          <p
            className="text-xs leading-relaxed"
            style={{ color: "rgba(58,64,88,0.75)" }}
          >
            {data.feedback.origin.length > 0 && (
              <>Origin記憶から {data.feedback.origin.length} 軸にフィードバック。</>
            )}
            {data.feedback.rendezvous.length > 0 && (
              <>Rendezvousから {data.feedback.rendezvous.length} 軸にフィードバック。</>
            )}
            他のシステムの観察があなたの自己理解を補正しています。
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

export default React.memo(PostObservationProgress);
