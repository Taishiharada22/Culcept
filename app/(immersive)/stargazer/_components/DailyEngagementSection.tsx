// app/stargazer/_components/DailyEngagementSection.tsx
// 毎日のエンゲージメントセクション — 朝の一問 + 消えるインサイト + 精度低下警告
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MorningQuestion from "./MorningQuestion";
import VanishingInsight from "./VanishingInsight";
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface DailyEngagementSectionProps {
  axisScores: Record<string, number>;
  totalObservations: number;
}

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

function getDaysSinceLastObservation(): number {
  const last = safeGetItem(LAST_OBSERVATION_KEY);
  if (!last) return 999; // never observed
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
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function DailyEngagementSection({
  axisScores,
  totalObservations,
}: DailyEngagementSectionProps) {
  const [activeInsight, setActiveInsight] = useState<VanishingInsightData | null>(null);
  const [daysSinceObservation, setDaysSinceObservation] = useState(0);
  const [mounted, setMounted] = useState(false);

  // Initialize on mount
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    setMounted(true);
    setDaysSinceObservation(getDaysSinceLastObservation());

    // Check for existing vanishing insight
    const existing = getActiveVanishingInsight();
    if (existing) {
      setActiveInsight(existing);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Handle morning question answer -> generate vanishing insight
  // 優先度: AI生成 > テンプレート
  const handleMorningAnswer = useCallback(
    (questionId: string, answer: string, _responseTimeMs: number) => {
      // Record observation
      recordObservationToday();
      setDaysSinceObservation(0);

      // Generate vanishing insight if none active
      if (!getActiveVanishingInsight()) {
        // まず AI 生成を試行（非同期）
        (async () => {
          let insight: VanishingInsightData | null = null;

          try {
            // 前回のインサイト情報を取得
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
                // AI 生成のインサイトを VanishingInsightData 形式に変換
                insight = {
                  id: data.insight.id,
                  insight: data.insight.insight,
                  category: mapDepthToCategory(data.insight.depth),
                  expiresAt: data.insight.expiresAt,
                  generatedAt: data.insight.generatedAt,
                  basedOn: data.insight.basedOn,
                };
                console.info("[DailyEngagement] AI インサイト生成成功", {
                  depth: data.insight.depth,
                  surpriseScore: data.insight.surpriseScore,
                });
              }
            }
          } catch (err) {
            console.warn("[DailyEngagement] AI インサイト生成失敗、テンプレートへフォールバック:", err);
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
            // Delay showing it for dramatic effect
            setTimeout(() => {
              setActiveInsight(insight);
            }, 1500);
          }
        })();
      }
    },
    [axisScores, totalObservations],
  );

  const handleInsightExpire = useCallback(() => {
    setActiveInsight(null);
  }, []);

  if (!mounted) return null;

  const showDecayWarning = daysSinceObservation >= 3 && totalObservations > 0;
  const decayPercent = Math.min(20, (daysSinceObservation - 2) * 4);

  return (
    <div className="space-y-4">
      {/* Section header */}
      <div className="flex items-center gap-2 px-1">
        <motion.div
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "rgba(190,170,110,0.7)" }}
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
        <span className="text-xs font-medium text-slate-500 tracking-wider uppercase">
          毎日の観測
        </span>
      </div>

      {/* Accuracy decay warning */}
      <AnimatePresence>
        {showDecayWarning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
          >
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
                  {daysSinceObservation}日間観測がありません。観測を再開しましょう
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Morning Question */}
      <MorningQuestion
        onAnswer={handleMorningAnswer}
        totalObservations={totalObservations}
      />

      {/* Vanishing Insight */}
      <AnimatePresence>
        {activeInsight && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.22 }}
          >
            <VanishingInsight
              insightId={activeInsight.id}
              insight={activeInsight.insight}
              category={activeInsight.category}
              expiresAt={activeInsight.expiresAt}
              basedOn={activeInsight.basedOn}
              onExpire={handleInsightExpire}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
