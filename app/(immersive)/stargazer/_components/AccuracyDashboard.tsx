// app/stargazer/_components/AccuracyDashboard.tsx
// 予測精度ダッシュボード — 的中率リング + カテゴリ別精度 + 履歴 + トレンド
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  ProgressRing,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import MiniSparkline from "./MiniSparkline";
import type {
  Prediction,
  PredictionAccuracy,
  PredictionFeedback,
} from "@/lib/stargazer/predictionEngine";

// ── Props ────────────────────────────────────────────

interface Props {
  accuracy: PredictionAccuracy;
  recentPredictions: Prediction[];
}

// ── Constants ────────────────────────────────────────

const FEEDBACK_ICONS: Record<PredictionFeedback, { symbol: string; color: string }> = {
  correct: { symbol: "\u2713", color: "rgba(16,185,129,0.9)" },
  partially: { symbol: "\u25B3", color: "rgba(245,158,11,0.9)" },
  wrong: { symbol: "\u2717", color: "rgba(239,68,68,0.75)" },
};

const TREND_LABELS: Record<PredictionAccuracy["trend"], { label: string; color: string }> = {
  improving: { label: "上昇中", color: "rgba(16,185,129,0.9)" },
  stable: { label: "安定", color: "rgba(100,116,139,0.7)" },
  declining: { label: "低下中", color: "rgba(239,68,68,0.75)" },
};

// ── TrendSparkline (simple inline SVG) ───────────────

function TrendSparkline({ predictions }: { predictions: Prediction[] }) {
  const points = useMemo(() => {
    // Group by week and compute weekly accuracy
    const verified = predictions
      .filter((p) => p.verified && p.userFeedback)
      .sort((a, b) => a.createdAt - b.createdAt);

    if (verified.length < 3) return null;

    // Split into chunks of ~7 for weekly grouping
    const chunkSize = Math.max(2, Math.floor(verified.length / 4));
    const weeks: number[] = [];

    for (let i = 0; i < verified.length; i += chunkSize) {
      const chunk = verified.slice(i, i + chunkSize);
      let score = 0;
      for (const p of chunk) {
        if (p.userFeedback === "correct") score += 1;
        else if (p.userFeedback === "partially") score += 0.5;
      }
      weeks.push(chunk.length > 0 ? score / chunk.length : 0);
    }

    if (weeks.length < 2) return null;

    const width = 120;
    const height = 32;
    const padding = 4;
    const w = width - padding * 2;
    const h = height - padding * 2;

    const pts = weeks.map((rate, i) => {
      const x = padding + (i / Math.max(1, weeks.length - 1)) * w;
      const y = padding + (1 - rate) * h;
      return `${x},${y}`;
    });

    const firstX = padding;
    const lastX = padding + ((weeks.length - 1) / Math.max(1, weeks.length - 1)) * w;
    const bottomY = height - padding;
    const areaPoints = `${firstX},${bottomY} ${pts.join(" ")} ${lastX},${bottomY}`;

    return { linePoints: pts.join(" "), areaPoints, width, height };
  }, [predictions]);

  if (!points) {
    return (
      <div className="flex items-center justify-center h-8">
        <span
          className="text-[10px]"
          style={{ color: "rgba(100,116,139,0.4)" }}
        >
          データ蓄積中...
        </span>
      </div>
    );
  }

  return (
    <svg
      width={points.width}
      height={points.height}
      viewBox={`0 0 ${points.width} ${points.height}`}
      className="block"
    >
      <polygon
        points={points.areaPoints}
        fill="rgba(139,92,246,0.06)"
      />
      <polyline
        points={points.linePoints}
        fill="none"
        stroke="rgba(139,92,246,0.5)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ── Category Breakdown ───────────────────────────────

function CategoryBreakdown({ predictions }: { predictions: Prediction[] }) {
  const categories = useMemo(() => {
    const verified = predictions.filter((p) => p.verified && p.userFeedback);
    const stats: Record<string, { correct: number; total: number }> = {};

    for (const p of verified) {
      if (!stats[p.category]) stats[p.category] = { correct: 0, total: 0 };
      stats[p.category].total++;
      if (p.userFeedback === "correct") stats[p.category].correct++;
      if (p.userFeedback === "partially") stats[p.category].correct += 0.5;
    }

    return Object.entries(stats)
      .map(([name, s]) => ({
        name,
        rate: s.total > 0 ? s.correct / s.total : 0,
        total: s.total,
      }))
      .sort((a, b) => b.rate - a.rate);
  }, [predictions]);

  if (categories.length === 0) return null;

  return (
    <div className="space-y-2">
      <p
        className="text-xs font-semibold"
        style={{ color: "rgba(15,23,42,0.7)" }}
      >
        カテゴリ別精度
      </p>
      <div className="space-y-1.5">
        {categories.map((cat) => (
          <div key={cat.name} className="flex items-center gap-2">
            <span
              className="text-[11px] font-medium w-24 truncate"
              style={{ color: "rgba(15,23,42,0.65)" }}
            >
              {cat.name}
            </span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(148,163,184,0.1)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{
                  background:
                    cat.rate >= 0.7
                      ? "rgba(16,185,129,0.6)"
                      : cat.rate >= 0.4
                        ? "rgba(245,158,11,0.5)"
                        : "rgba(148,163,184,0.3)",
                }}
                initial={{ width: 0 }}
                animate={{ width: `${cat.rate * 100}%` }}
                transition={{ duration: 0.25, ease: "easeOut" }}
              />
            </div>
            <span
              className="text-[11px] font-bold tabular-nums w-10 text-right"
              style={{ color: "rgba(100,116,139,0.7)" }}
            >
              {Math.round(cat.rate * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Recent History ───────────────────────────────────

function RecentHistory({ predictions }: { predictions: Prediction[] }) {
  const recent = useMemo(() => {
    return predictions
      .filter((p) => p.verified && p.userFeedback)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);
  }, [predictions]);

  if (recent.length === 0) return null;

  return (
    <div className="space-y-2">
      <p
        className="text-xs font-semibold"
        style={{ color: "rgba(15,23,42,0.7)" }}
      >
        直近の予測
      </p>
      <div className="space-y-1.5">
        {recent.map((p) => {
          const fb = p.userFeedback;
          if (!fb) return null;
          const icon = FEEDBACK_ICONS[fb];
          return (
            <div
              key={p.id}
              className="flex items-center gap-2 rounded-lg px-2 py-1.5"
              style={{ background: "rgba(148,163,184,0.04)" }}
            >
              <span
                className="text-xs font-bold w-5 text-center"
                style={{ color: icon.color }}
              >
                {icon.symbol}
              </span>
              <p
                className="text-[11px] flex-1 truncate"
                style={{ color: "rgba(15,23,42,0.7)" }}
              >
                {p.prediction}
              </p>
              <span
                className="text-[10px] shrink-0"
                style={{ color: "rgba(100,116,139,0.5)" }}
              >
                {new Date(p.createdAt).toLocaleDateString("ja-JP", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Best Hit Quote ───────────────────────────────────

function BestHitQuote({ predictions }: { predictions: Prediction[] }) {
  const bestHit = useMemo(() => {
    const correct = predictions.filter(
      (p) => p.verified && p.userFeedback === "correct",
    );
    if (correct.length === 0) return null;
    // Highest confidence correct prediction
    return correct.sort((a, b) => b.confidence - a.confidence)[0];
  }, [predictions]);

  if (!bestHit) return null;

  return (
    <div className="space-y-1.5">
      <p
        className="text-xs font-semibold"
        style={{ color: "rgba(15,23,42,0.7)" }}
      >
        最高の的中
      </p>
      <div
        className="relative pl-3 py-2 rounded-lg"
        style={{
          borderLeft: "2px solid rgba(234,179,8,0.5)",
          background: "rgba(234,179,8,0.03)",
        }}
      >
        <p
          className="text-[11px] leading-relaxed italic"
          style={{ color: "rgba(15,23,42,0.75)" }}
        >
          &ldquo;{bestHit.prediction}&rdquo;
        </p>
        <p
          className="text-[10px] mt-1"
          style={{ color: "rgba(100,116,139,0.5)" }}
        >
          確信度 {Math.round(bestHit.confidence * 100)}% で的中
        </p>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────

export default function AccuracyDashboard({
  accuracy,
  recentPredictions,
}: Props) {
  const trendInfo = TREND_LABELS[accuracy.trend];
  const displayRate = Math.round(accuracy.accuracyRate * 100);

  // Compute rolling accuracy values for the MiniSparkline
  const sparklineValues = useMemo(() => {
    const verified = recentPredictions
      .filter((p) => p.verified && p.userFeedback)
      .sort((a, b) => a.createdAt - b.createdAt);

    if (verified.length < 3) return [];

    const windowSize = Math.max(2, Math.floor(verified.length / 7));
    const values: number[] = [];
    for (let i = 0; i < verified.length; i += windowSize) {
      const chunk = verified.slice(i, i + windowSize);
      let score = 0;
      for (const p of chunk) {
        if (p.userFeedback === "correct") score += 1;
        else if (p.userFeedback === "partially") score += 0.5;
      }
      values.push(chunk.length > 0 ? score / chunk.length : 0);
    }
    return values;
  }, [recentPredictions]);

  if (accuracy.totalPredictions === 0) {
    return null;
  }

  return (
    <FadeInView>
      <GlassCard variant="default" padding="md" hoverEffect={false}>
        <div className="space-y-5">
          {/* Overall accuracy ring + trend */}
          <div className="flex items-center gap-5">
            <ProgressRing
              progress={displayRate}
              size={80}
              strokeWidth={6}
            >
              <div className="text-center">
                <motion.span
                  key={displayRate}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-lg font-bold tabular-nums block"
                  style={{ color: "rgba(15,23,42,0.9)" }}
                >
                  {displayRate}%
                </motion.span>
              </div>
            </ProgressRing>

            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <p
                  className="text-sm font-bold"
                  style={{ color: "rgba(15,23,42,0.85)" }}
                >
                  的中率
                </p>
                {sparklineValues.length >= 2 && (
                  <MiniSparkline
                    values={sparklineValues}
                    width={64}
                    height={20}
                    color={
                      accuracy.trend === "improving"
                        ? "rgba(16,185,129,0.7)"
                        : accuracy.trend === "declining"
                          ? "rgba(239,68,68,0.6)"
                          : "rgba(201,169,110,0.7)"
                    }
                  />
                )}
              </div>
              <div className="flex items-center gap-2">
                <GlassBadge
                  variant={
                    accuracy.trend === "improving"
                      ? "success"
                      : accuracy.trend === "declining"
                        ? "danger"
                        : "default"
                  }
                  size="sm"
                >
                  {trendInfo.label}
                </GlassBadge>
                <span
                  className="text-[11px]"
                  style={{ color: "rgba(100,116,139,0.6)" }}
                >
                  {accuracy.verified}件検証済み / {accuracy.totalPredictions}件
                </span>
              </div>

              {/* Inline stats */}
              <div className="flex gap-3">
                <MiniStat
                  label="的中"
                  value={accuracy.correct}
                  color="rgba(16,185,129,0.8)"
                />
                <MiniStat
                  label="部分的"
                  value={accuracy.partial}
                  color="rgba(245,158,11,0.8)"
                />
                <MiniStat
                  label="外れ"
                  value={accuracy.wrong}
                  color="rgba(239,68,68,0.7)"
                />
              </div>
            </div>
          </div>

          {/* Trend sparkline */}
          <div className="space-y-1">
            <p
              className="text-xs font-semibold"
              style={{ color: "rgba(15,23,42,0.7)" }}
            >
              精度トレンド
            </p>
            <TrendSparkline predictions={recentPredictions} />
          </div>

          {/* Category breakdown */}
          <CategoryBreakdown predictions={recentPredictions} />

          {/* Recent history */}
          <RecentHistory predictions={recentPredictions} />

          {/* Best hit */}
          <BestHitQuote predictions={recentPredictions} />
        </div>
      </GlassCard>
    </FadeInView>
  );
}

// ── Mini Stat ────────────────────────────────────────

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <span
        className="text-xs font-bold tabular-nums"
        style={{ color }}
      >
        {value}
      </span>
      <span
        className="text-[10px]"
        style={{ color: "rgba(100,116,139,0.5)" }}
      >
        {label}
      </span>
    </div>
  );
}
