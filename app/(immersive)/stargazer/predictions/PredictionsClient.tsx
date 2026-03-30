// app/stargazer/predictions/PredictionsClient.tsx
// 予測履歴クライアント — ダッシュボード + 検証フロー + 時系列リスト
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  loadPredictions,
  updatePredictionVerification,
  getPendingVerifications,
  calculateAccuracy,
  type Prediction,
  type PredictionAccuracy,
  type PredictionFeedback,
} from "@/lib/stargazer/predictionEngine";
import AccuracyDashboard from "../_components/AccuracyDashboard";
import PredictionVerificationFlow from "../_components/PredictionVerificationFlow";

// ── Feedback Colors/Labels ───────────────────────────

const FEEDBACK_CONFIG: Record<
  PredictionFeedback,
  { label: string; color: string; bg: string }
> = {
  correct: {
    label: "的中",
    color: "rgba(16,185,129,0.9)",
    bg: "rgba(16,185,129,0.08)",
  },
  partially: {
    label: "部分的",
    color: "rgba(245,158,11,0.9)",
    bg: "rgba(245,158,11,0.08)",
  },
  wrong: {
    label: "外れ",
    color: "rgba(239,68,68,0.75)",
    bg: "rgba(239,68,68,0.06)",
  },
};

// ── Filter tabs ──────────────────────────────────────

type FilterKey = "all" | "correct" | "partially" | "wrong" | "pending";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "correct", label: "的中" },
  { key: "partially", label: "部分的" },
  { key: "wrong", label: "外れ" },
  { key: "pending", label: "未検証" },
];

// ── Main Component ───────────────────────────────────

export default function PredictionsClient() {
  const [allPredictions, setAllPredictions] = useState<Prediction[]>([]);
  const [pendingVerifications, setPendingVerifications] = useState<
    Prediction[]
  >([]);
  const [accuracy, setAccuracy] = useState<PredictionAccuracy | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [loaded, setLoaded] = useState(false);

  // Load data from localStorage
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    const preds = loadPredictions();
    setAllPredictions(preds);
    setPendingVerifications(getPendingVerifications());
    setAccuracy(calculateAccuracy(preds));
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // Handle verification
  const handleVerify = useCallback(
    (id: string, feedback: PredictionFeedback) => {
      try {
        updatePredictionVerification(id, feedback);
        const updated = loadPredictions();
        setAllPredictions(updated);
        setPendingVerifications(getPendingVerifications());
        setAccuracy(calculateAccuracy(updated));
      } catch {
        /* silent */
      }
    },
    [],
  );

  // Filter predictions
  const filteredPredictions = allPredictions
    .filter((p) => {
      if (filter === "all") return true;
      if (filter === "pending") return !p.verified;
      return p.userFeedback === filter;
    })
    .sort((a, b) => b.createdAt - a.createdAt);

  if (!loaded) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
          className="text-sm"
          style={{ color: "rgba(100,116,139,0.6)" }}
        >
          読み込み中...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-6 pb-24 space-y-6">
      {/* Header */}
      <FadeInView>
        <div className="flex items-center justify-between">
          <div>
            <Link
              href="/stargazer"
              className="text-xs font-medium flex items-center gap-1 mb-2"
              style={{ color: "rgba(139,92,246,0.7)" }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              深層観測に戻る
            </Link>
            <h1
              className="text-xl font-bold"
              style={{ color: "rgba(15,23,42,0.9)" }}
            >
              予測履歴
            </h1>
            <p
              className="text-xs mt-1"
              style={{ color: "rgba(100,116,139,0.6)" }}
            >
              過去の予測と的中率
            </p>
          </div>
        </div>
      </FadeInView>

      {/* Accuracy Dashboard */}
      {accuracy && accuracy.totalPredictions > 0 && (
        <AccuracyDashboard
          accuracy={accuracy}
          recentPredictions={allPredictions}
        />
      )}

      {/* Pending Verifications */}
      {pendingVerifications.length > 0 && (
        <FadeInView delay={0.1}>
          <PredictionVerificationFlow
            predictions={pendingVerifications}
            onVerify={handleVerify}
            accuracyRate={accuracy?.accuracyRate ?? 0}
          />
        </FadeInView>
      )}

      {/* Filter tabs */}
      <FadeInView delay={0.15}>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {FILTERS.map((f) => {
            const isActive = filter === f.key;
            const count =
              f.key === "all"
                ? allPredictions.length
                : f.key === "pending"
                  ? allPredictions.filter((p) => !p.verified).length
                  : allPredictions.filter(
                      (p) => p.userFeedback === f.key,
                    ).length;

            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className="relative px-3 py-1.5 rounded-xl text-xs font-medium transition-all duration-200 shrink-0"
                style={{
                  background: isActive
                    ? "rgba(139,92,246,0.1)"
                    : "rgba(148,163,184,0.05)",
                  color: isActive
                    ? "rgba(139,92,246,0.9)"
                    : "rgba(100,116,139,0.6)",
                }}
              >
                {f.label}
                {count > 0 && (
                  <span className="ml-1 tabular-nums">({count})</span>
                )}
              </button>
            );
          })}
        </div>
      </FadeInView>

      {/* Chronological list */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {filteredPredictions.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="py-12 text-center"
            >
              <p
                className="text-sm"
                style={{ color: "rgba(100,116,139,0.5)" }}
              >
                {filter === "all"
                  ? "まだ予測がありません"
                  : "該当する予測がありません"}
              </p>
            </motion.div>
          ) : (
            filteredPredictions.map((prediction, index) => (
              <motion.div
                key={prediction.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: Math.min(index * 0.03, 0.3) }}
              >
                <PredictionListItem prediction={prediction} />
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Empty state — no predictions at all */}
      {allPredictions.length === 0 && (
        <FadeInView delay={0.2}>
          <GlassCard variant="default" padding="lg" hoverEffect={false}>
            <div className="text-center space-y-3">
              <div
                className="w-12 h-12 mx-auto rounded-full flex items-center justify-center"
                style={{ background: "rgba(139,92,246,0.08)" }}
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(139,92,246,0.5)"
                  strokeWidth={1.5}
                >
                  <circle cx="12" cy="12" r="10" />
                  <path
                    strokeLinecap="round"
                    d="M12 6v6l4 2"
                  />
                </svg>
              </div>
              <p
                className="text-sm font-semibold"
                style={{ color: "rgba(15,23,42,0.8)" }}
              >
                予測はまだありません
              </p>
              <p
                className="text-xs"
                style={{ color: "rgba(100,116,139,0.6)" }}
              >
                深層観測を続けると、あなたの行動パターンに基づいた予測が生成されます
              </p>
              <GlassButton
                variant="primary"
                size="sm"
                href="/stargazer"
              >
                観測を始める
              </GlassButton>
            </div>
          </GlassCard>
        </FadeInView>
      )}
    </div>
  );
}

// ── Prediction List Item ─────────────────────────────

function PredictionListItem({ prediction }: { prediction: Prediction }) {
  const isVerified = prediction.verified && prediction.userFeedback;
  const isPending = !prediction.verified && Date.now() > prediction.expiresAt;
  const isActive = !prediction.verified && Date.now() <= prediction.expiresAt;

  return (
    <GlassCard
      variant="default"
      padding="none"
      hoverEffect={false}
    >
      <div className="px-4 py-3 space-y-2">
        {/* Top row: badges + date */}
        <div className="flex items-center gap-2">
          <GlassBadge
            variant={
              prediction.type === "weekly_pattern" ? "info" : "default"
            }
            size="sm"
          >
            {prediction.type === "weekly_pattern" ? "週間" : "日次"}
          </GlassBadge>
          <GlassBadge variant="secondary" size="sm">
            {prediction.category}
          </GlassBadge>

          {/* Status */}
          {isVerified && prediction.userFeedback && (
            <span
              className="ml-auto text-xs font-bold"
              style={{
                color: FEEDBACK_CONFIG[prediction.userFeedback].color,
              }}
            >
              {FEEDBACK_CONFIG[prediction.userFeedback].label}
            </span>
          )}
          {isPending && (
            <GlassBadge variant="warning" size="sm" className="ml-auto">
              検証待ち
            </GlassBadge>
          )}
          {isActive && (
            <GlassBadge variant="info" size="sm" className="ml-auto">
              進行中
            </GlassBadge>
          )}
        </div>

        {/* Prediction text */}
        <p
          className="text-[13px] leading-relaxed"
          style={{ color: "rgba(15,23,42,0.8)" }}
        >
          {prediction.prediction}
        </p>

        {/* Bottom row: confidence + date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="h-1 w-12 rounded-full overflow-hidden"
              style={{ background: "rgba(148,163,184,0.1)" }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${prediction.confidence * 100}%`,
                  background: "rgba(139,92,246,0.4)",
                }}
              />
            </div>
            <span
              className="text-[10px] tabular-nums"
              style={{ color: "rgba(148,163,184,0.5)" }}
            >
              {Math.round(prediction.confidence * 100)}%
            </span>
          </div>
          <span
            className="text-[10px]"
            style={{ color: "rgba(100,116,139,0.4)" }}
          >
            {new Date(prediction.createdAt).toLocaleDateString("ja-JP", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}
