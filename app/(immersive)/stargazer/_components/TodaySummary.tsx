// app/stargazer/_components/TodaySummary.tsx
// 今日のサマリー — Apple Health風に情報を優先度順で圧縮表示する
// 個別コンポーネント（DailyEngagement, PredictionCard, UnderstandingMeter等）を
// 1画面に統合し、情報過多を防止する
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";

// Existing sub-components — delegate rendering to them

import VanishingInsight from "./VanishingInsight";
import PredictionCard from "./PredictionCard";
import RevisionDeclarationCard from "./RevisionDeclarationCard";
import AlterAfterglowCard from "./AlterAfterglowCard";
import UnderstandingMeterDisplay from "./UnderstandingMeterDisplay";

import {
  generateVanishingInsight,
  getActiveVanishingInsight,
  saveVanishingInsight,
  getPreviousInsights,
  type VanishingInsightData,
} from "@/lib/stargazer/vanishingInsightGenerator";
import { safeSetItem } from "@/lib/stargazer/localStorageHelper";

// AI vanishing insight のサーバー呼び出し用
const AI_INSIGHT_ENDPOINT = "/api/stargazer/vanishing-insight";

/** AI インサイトの深度カテゴリを旧 InsightCategory にマッピング */
function mapDepthToCategory(depth: string): "矛盾発見" | "行動パターン" | "深層の兆候" | "盲点" | "予感" {
  switch (depth) {
    case "核心": return "盲点";
    case "深層": return "深層の兆候";
    case "中層": return "矛盾発見";
    case "表層": return "行動パターン";
    default: return "予感";
  }
}
import type { Prediction, PredictionFeedback } from "@/lib/stargazer/predictionEngine";
import type { Revision } from "@/lib/stargazer/revisionEngine";
import type { AfterglowMessage } from "@/lib/stargazer/alterAfterglowEngine";
import type { UnderstandingLevel } from "@/lib/stargazer/understandingMeter";
import { getEnhancedStreakData, type EnhancedStreakData } from "@/lib/stargazer/retentionHooks";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface TodaySummaryProps {
  // Data sources
  todayPrediction: Prediction | null;
  pendingVerifications: Prediction[];
  understandingLevel: UnderstandingLevel | null;
  totalObservations: number;
  afterglowMessage: AfterglowMessage | null;
  revisions: Revision[];
  predictionAccuracy: number;
  axisScores: Record<string, number>;

  // Callbacks
  onMorningAnswer: (questionId: string, answer: string, responseTimeMs: number) => void;
  onVerifyPrediction: (id: string, feedback: PredictionFeedback) => void;
  onAcknowledgeRevision: (id: string) => void;
  onDismissAfterglow: () => void;
  onReplyAfterglow: () => void;
}

// Priority item definition
type ItemPriority = "urgent" | "action" | "time_limited" | "info" | "status";

interface PriorityItem {
  id: string;
  priority: ItemPriority;
  /** Deterministic sort order within same priority */
  order: number;
  icon: string;
  label: string;
  /** Color indicator: green=positive, red=urgent, gold=new, blue=info */
  indicator: "green" | "red" | "gold" | "blue" | "slate";
  render: () => React.ReactNode;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Priority ordering
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const PRIORITY_ORDER: Record<ItemPriority, number> = {
  urgent: 0,
  action: 1,
  time_limited: 2,
  info: 3,
  status: 4,
};

const INDICATOR_COLORS: Record<string, string> = {
  green: "rgba(16,185,129,0.9)",
  red: "rgba(239,68,68,0.9)",
  gold: "rgba(201,169,110,0.9)",
  blue: "rgba(99,102,241,0.8)",
  slate: "rgba(148,163,184,0.6)",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const LAST_OBSERVATION_KEY = "sg_last_observation_date";

function safeGetItem(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function getDaysSinceLastObservation(): number {
  const last = safeGetItem(LAST_OBSERVATION_KEY);
  if (!last) return 999;
  const lastDate = new Date(last);
  const now = new Date();
  const diffMs = now.getTime() - lastDate.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function recordObservationToday(): void {
  const today = new Date().toISOString().slice(0, 10);
  safeSetItem(LAST_OBSERVATION_KEY, today);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mini Card (compact card for secondary items)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function MiniCard({
  icon,
  label,
  indicator,
  onClick,
}: {
  icon: string;
  label: string;
  indicator: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      onClick={onClick}
      className="shrink-0 flex flex-col items-center gap-1.5 rounded-2xl p-3"
      style={{
        width: 80,
        minHeight: 80,
        background: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(255,255,255,0.9)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
      }}
      whileHover={{ scale: 1.04, y: -2 }}
      whileTap={{ scale: 0.96 }}
    >
      {/* Indicator dot */}
      <div className="relative">
        <span className="text-xl leading-none">{icon}</span>
        <div
          className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full"
          style={{ background: INDICATOR_COLORS[indicator] ?? INDICATOR_COLORS.slate }}
        />
      </div>
      <span
        className="text-[11px] font-medium leading-tight text-center line-clamp-2"
        style={{ color: "rgba(22,28,48,0.8)" }}
      >
        {label}
      </span>
    </motion.button>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Helper: check if morning question is already answered today
function isMorningAnsweredToday(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const now = new Date();
    const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const key = `sg_morning_${dateKey}`;
    return localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

export default function TodaySummary({
  todayPrediction,
  pendingVerifications,
  understandingLevel,
  totalObservations,
  afterglowMessage,
  revisions,
  predictionAccuracy,
  axisScores,
  onMorningAnswer,
  onVerifyPrediction,
  onAcknowledgeRevision,
  onDismissAfterglow,
  onReplyAfterglow,
}: TodaySummaryProps) {
  const [mounted, setMounted] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [expandedMiniId, setExpandedMiniId] = useState<string | null>(null);
  const [morningAnswered, setMorningAnswered] = useState(false);
  const [activeInsight, setActiveInsight] = useState<VanishingInsightData | null>(null);
  const [daysSince, setDaysSince] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [streakData, setStreakData] = useState<EnhancedStreakData | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    setMounted(true);
    setDaysSince(getDaysSinceLastObservation());
    setMorningAnswered(isMorningAnsweredToday());

    // Load enhanced streak data
    try {
      const sd = getEnhancedStreakData();
      setStreakData(sd);
      setStreakDays(sd.currentStreak);
    } catch {
      // non-critical
    }

    // Check for existing vanishing insight from localStorage
    const existing = getActiveVanishingInsight();
    if (existing) setActiveInsight(existing);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Handle morning answer with vanishing insight generation
  // 優先度: AI生成 > テンプレート
  const handleMorningAnswer = useCallback(
    (questionId: string, answer: string, responseTimeMs: number) => {
      recordObservationToday();
      setDaysSince(0);
      setMorningAnswered(true);
      // Persist morning answer to localStorage so it survives page refresh
      try {
        const now = new Date();
        const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
        localStorage.setItem(`sg_morning_${dateKey}`, JSON.stringify({ questionId, answer, responseTimeMs, answeredAt: now.toISOString() }));
      } catch { /* silent */ }

      // Generate vanishing insight if none active
      if (!getActiveVanishingInsight()) {
        (async () => {
          let insight: VanishingInsightData | null = null;

          // まず AI 生成を試行
          try {
            const previous = getPreviousInsights();
            const previousInsightText = previous.length > 0 ? previous[previous.length - 1] : null;

            const res = await fetch(AI_INSIGHT_ENDPOINT, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                axisScores,
                observationCount: totalObservations,
                previousInsight: previousInsightText,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              if (data.ok && data.insight) {
                insight = {
                  id: data.insight.id,
                  insight: data.insight.insight,
                  category: mapDepthToCategory(data.insight.depth),
                  expiresAt: data.insight.expiresAt,
                  generatedAt: data.insight.generatedAt,
                  basedOn: data.insight.basedOn,
                };
              }
            }
          } catch {
            // AI 失敗 — テンプレートにフォールバック
          }

          // AI が失敗した場合はテンプレートにフォールバック
          if (!insight) {
            const previous = getPreviousInsights();
            insight = generateVanishingInsight(
              axisScores,
              totalObservations,
              previous,
              { questionId, answer },
            );
          }

          if (insight) {
            saveVanishingInsight(insight);
            setTimeout(() => setActiveInsight(insight), 1500);
          }
        })();
      }

      onMorningAnswer(questionId, answer, responseTimeMs);
    },
    [axisScores, totalObservations, onMorningAnswer],
  );

  const handleInsightExpire = useCallback(() => {
    setActiveInsight(null);
  }, []);

  // ── Build priority items ──

  const priorityItems = useMemo<PriorityItem[]>(() => {
    const items: PriorityItem[] = [];

    // 1. URGENT: Revision declarations
    for (const rev of revisions) {
      items.push({
        id: `revision-${rev.id}`,
        priority: "urgent",
        order: 1,
        icon: "\uD83D\uDCDC", // scroll
        label: "\u7406\u89E3\u306E\u4FEE\u6B63",
        indicator: "red",
        render: () => (
          <RevisionDeclarationCard
            revision={rev}
            onAcknowledge={() => onAcknowledgeRevision(rev.id)}
          />
        ),
      });
    }

    // 2. URGENT: Alter afterglow
    if (afterglowMessage) {
      items.push({
        id: "afterglow",
        priority: "urgent",
        order: 2,
        icon: "\uD83D\uDCAC", // speech bubble
        label: "Alter\u304B\u3089",
        indicator: "gold",
        render: () => (
          <AlterAfterglowCard
            message={afterglowMessage}
            onDismiss={onDismissAfterglow}
            onReply={onReplyAfterglow}
          />
        ),
      });
    }

    // 3. ACTION: Pending verifications
    for (const pv of pendingVerifications) {
      items.push({
        id: `verify-${pv.id}`,
        priority: "action",
        order: 3,
        icon: "\u2753", // question mark
        label: "\u4E88\u6E2C\u306E\u691C\u8A3C",
        indicator: "blue",
        render: () => (
          <PredictionCard
            prediction={pv}
            onVerify={onVerifyPrediction}
          />
        ),
      });
    }

    // 4. Morning question — ObserveTabShell 最上部に移動済み。ここでは表示しない。

    // 5. TIME_LIMITED: Vanishing insight
    if (activeInsight) {
      items.push({
        id: "vanishing-insight",
        priority: "time_limited",
        order: 5,
        icon: "\u2728", // sparkles
        label: "\u6D88\u3048\u308B\u6D1E\u5BDF",
        indicator: "gold",
        render: () => (
          <VanishingInsight
            insightId={activeInsight.id}
            insight={activeInsight.insight}
            category={activeInsight.category}
            expiresAt={activeInsight.expiresAt}
            basedOn={activeInsight.basedOn}
            onExpire={handleInsightExpire}
          />
        ),
      });
    }

    // 6. INFO: Today's prediction
    if (todayPrediction && !todayPrediction.verified) {
      items.push({
        id: "today-prediction",
        priority: "info",
        order: 6,
        icon: "\uD83D\uDD2E", // crystal ball
        label: "\u4ECA\u65E5\u306E\u4E88\u6E2C",
        indicator: "blue",
        render: () => (
          <PredictionCard
            prediction={todayPrediction}
            onVerify={onVerifyPrediction}
            showAccuracy
            accuracyRate={predictionAccuracy}
          />
        ),
      });
    }

    // 7. STATUS: Understanding meter (compact)
    if (understandingLevel) {
      items.push({
        id: "understanding",
        priority: "status",
        order: 7,
        icon: "\uD83C\uDFAF", // dart
        label: `\u7406\u89E3\u5EA6 ${understandingLevel.overall}%`,
        indicator: understandingLevel.trend === "declining" ? "red" : "green",
        render: () => (
          <UnderstandingMeterDisplay
            level={understandingLevel}
            compact={false}
            showDimensions
            showMilestone
          />
        ),
      });
    }

    // 8. STATUS: Streak
    if (streakDays > 0) {
      items.push({
        id: "streak",
        priority: "status",
        order: 8,
        icon: "\uD83D\uDD25", // fire
        label: `${streakDays}\u65E5\u9023\u7D9A`,
        indicator: streakDays >= 7 ? "gold" : "green",
        render: () => (
          <StreakMiniDetail days={streakDays} streakData={streakData} />
        ),
      });
    }

    // Decay warning as a status item
    if (daysSince >= 3 && totalObservations > 0) {
      const decayPercent = Math.min(20, (daysSince - 2) * 4);
      items.push({
        id: "decay-warning",
        priority: "action",
        order: 2.5,
        icon: "\u26A0\uFE0F", // warning
        label: `\u7CBE\u5EA6-${decayPercent}%`,
        indicator: "red",
        render: () => (
          <DecayWarningCard days={daysSince} decayPercent={decayPercent} />
        ),
      });
    }

    // Sort by priority then order
    items.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      return a.order - b.order;
    });

    return items;
  }, [
    revisions,
    afterglowMessage,
    pendingVerifications,
    morningAnswered,
    activeInsight,
    todayPrediction,
    understandingLevel,
    streakDays,
    streakData,
    daysSince,
    totalObservations,
    predictionAccuracy,
    axisScores,
    onAcknowledgeRevision,
    onDismissAfterglow,
    onReplyAfterglow,
    onVerifyPrediction,
    handleMorningAnswer,
    handleInsightExpire,
  ]);

  if (!mounted) return null;

  // Nothing to show
  if (priorityItems.length === 0) {
    return null;
  }

  // Featured = top 2 items, rest = mini cards
  const FEATURED_COUNT = 2;
  const featuredItems = priorityItems.slice(0, FEATURED_COUNT);
  const secondaryItems = priorityItems.slice(FEATURED_COUNT);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <motion.div
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: "rgba(190,170,110,0.7)" }}
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 3, repeat: Infinity }}
          />
          <span className="text-xs font-medium text-slate-600 tracking-wider uppercase">
            Today&apos;s Summary
          </span>
        </div>
        {priorityItems.length > FEATURED_COUNT && (
          <span
            className="text-[11px] font-medium tabular-nums"
            style={{ color: "rgba(100,116,139,0.7)" }}
          >
            {priorityItems.length} items
          </span>
        )}
      </div>

      {/* Featured cards (full width, prominent) */}
      <AnimatePresence mode="popLayout">
        {featuredItems.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8, height: 0 }}
            transition={{ delay: idx * 0.06, duration: 0.2 }}
          >
            {item.render()}
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Secondary items as horizontal scroll of mini cards */}
      {secondaryItems.length > 0 && (
        <div className="space-y-3">
          {/* Mini cards horizontal scroll */}
          <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
            <div className="flex gap-2.5 pb-1">
              {secondaryItems.map((item) => (
                <MiniCard
                  key={item.id}
                  icon={item.icon}
                  label={item.label}
                  indicator={item.indicator}
                  onClick={() =>
                    setExpandedMiniId(
                      expandedMiniId === item.id ? null : item.id,
                    )
                  }
                />
              ))}
            </div>
          </div>

          {/* Expanded mini card content */}
          <AnimatePresence mode="wait">
            {expandedMiniId && (() => {
              const item = secondaryItems.find((i) => i.id === expandedMiniId);
              if (!item) return null;
              return (
                <motion.div
                  key={expandedMiniId}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                  className="overflow-hidden"
                >
                  <div className="relative">
                    {/* Close button */}
                    <button
                      onClick={() => setExpandedMiniId(null)}
                      className="absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-colors"
                      style={{
                        background: "rgba(0,0,0,0.04)",
                      }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="rgba(100,116,139,0.6)"
                        strokeWidth={2.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                    {item.render()}
                  </div>
                </motion.div>
              );
            })()}
          </AnimatePresence>

          {/* Show all link */}
          {!showAll && secondaryItems.length > 3 && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full py-2 text-center text-xs font-medium transition-colors"
              style={{ color: "rgba(139,92,246,0.7)" }}
            >
              すべて見る ({secondaryItems.length}件)
            </button>
          )}

          {/* Expanded all items */}
          <AnimatePresence>
            {showAll && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18 }}
                className="space-y-3 overflow-hidden"
              >
                {secondaryItems.map((item, idx) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 }}
                  >
                    {item.render()}
                  </motion.div>
                ))}
                <button
                  onClick={() => setShowAll(false)}
                  className="w-full py-2 text-center text-xs font-medium transition-colors"
                  style={{ color: "rgba(100,116,139,0.5)" }}
                >
                  閉じる
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function DecayWarningCard({
  days,
  decayPercent,
}: {
  days: number;
  decayPercent: number;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{
        background: "rgba(245,158,11,0.08)",
        border: "1px solid rgba(245,158,11,0.2)",
      }}
    >
      <motion.div
        animate={{ opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 1.5, repeat: Infinity }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          className="text-amber-500"
        >
          <path
            d="M8 1L1 14h14L8 1z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path
            d="M8 6v4M8 11.5v.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </motion.div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-700">
          理解度が低下しています（-{decayPercent}%）
        </p>
        <p className="text-xs text-amber-600/70 mt-0.5">
          {days}日間観測がありません。観測を再開しましょう
        </p>
      </div>
    </div>
  );
}

function StreakMiniDetail({
  days,
  streakData,
}: {
  days: number;
  streakData: EnhancedStreakData | null;
}) {
  return (
    <GlassCard variant="default" padding="md" hoverEffect={false}>
      <div className="flex items-center gap-3">
        <div
          className="w-12 h-12 rounded-2xl flex items-center justify-center"
          style={{
            background: days >= 7
              ? "linear-gradient(135deg, rgba(201,169,110,0.15), rgba(201,169,110,0.05))"
              : "rgba(16,185,129,0.08)",
          }}
        >
          <span className="text-xl">{days >= 7 ? "\uD83C\uDF1F" : "\uD83D\uDD25"}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-bold"
            style={{ color: "rgba(22,28,48,0.9)" }}
          >
            {days}日連続観測中
          </p>
          {streakData && (
            <p
              className="text-xs mt-0.5"
              style={{ color: "rgba(100,116,139,0.6)" }}
            >
              {streakData.levelDescription}
            </p>
          )}
        </div>
        {/* Mini progress to next level */}
        {streakData && streakData.nextLevelDays > 0 && (
          <div className="shrink-0 text-right">
            <span
              className="text-[11px] font-medium tabular-nums"
              style={{ color: "rgba(100,116,139,0.7)" }}
            >
              次まで {streakData.nextLevelDays}日
            </span>
          </div>
        )}
      </div>
    </GlassCard>
  );
}
