// app/stargazer/_components/UnderstandingMeterDisplay.tsx
// 理解度メーター — ユーザー理解度を視覚的に表示
"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useSpring, useTransform } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type {
  UnderstandingLevel,
  DimensionKey,
} from "@/lib/stargazer/understandingMeter";
import {
  DIMENSION_LABELS,
  getUnderstandingStatus,
  getAllMilestones,
  getReachedMilestones,
  getDecayInfo,
} from "@/lib/stargazer/understandingMeter";

// ── Props ────────────────────────────────────────────

interface Props {
  level: UnderstandingLevel;
  compact?: boolean;
  showDimensions?: boolean;
  showMilestone?: boolean;
  animated?: boolean;
}

// ── トレンドアイコン ─────────────────────────────────

function TrendIcon({ trend }: { trend: UnderstandingLevel["trend"] }) {
  const icons: Record<UnderstandingLevel["trend"], string> = {
    rising: "\u2197",    // ↗
    stable: "\u2192",    // →
    declining: "\u2198", // ↘
  };
  const colors: Record<UnderstandingLevel["trend"], string> = {
    rising: "text-emerald-600",
    stable: "text-slate-500",
    declining: "text-red-500",
  };
  const labels: Record<UnderstandingLevel["trend"], string> = {
    rising: "上昇中",
    stable: "安定",
    declining: "低下中",
  };

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${colors[trend]}`}>
      <span className="text-sm">{icons[trend]}</span>
      {labels[trend]}
    </span>
  );
}

// ── アニメーション付きカウンター ─────────────────────

function AnimatedCounter({
  value,
  className,
}: {
  value: number;
  className?: string;
}) {
  const spring = useSpring(0, { stiffness: 60, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v));
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    const unsubscribe = display.on("change", (v) => setDisplayValue(v));
    return unsubscribe;
  }, [display]);

  return <span className={className}>{displayValue}</span>;
}

// ── SVG リングゲージ ─────────────────────────────────

function RingGauge({
  value,
  size,
  strokeWidth = 6,
  isDecaying = false,
}: {
  value: number;
  size: number;
  strokeWidth?: number;
  isDecaying?: boolean;
}) {
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - progress / 100);

  // ゴールド→レッドのグラデーション（減衰時は赤寄り）
  const gradientId = `understanding-gauge-${size}`;

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      {/* グロー */}
      <motion.div
        className="absolute inset-1 rounded-full"
        style={{
          background: isDecaying
            ? "radial-gradient(circle, rgba(239,68,68,0.08) 0%, transparent 70%)"
            : "radial-gradient(circle, rgba(201,169,110,0.1) 0%, transparent 70%)",
          filter: "blur(6px)",
        }}
        animate={
          isDecaying
            ? { opacity: [0.5, 1, 0.5] }
            : { opacity: 1 }
        }
        transition={
          isDecaying
            ? { duration: 2, repeat: Infinity, ease: "easeInOut" }
            : {}
        }
      />

      <svg
        width={size}
        height={size}
        className="relative z-10"
        style={{ transform: "rotate(-90deg)" }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            {isDecaying ? (
              <>
                <stop offset="0%" stopColor="#ef4444" />
                <stop offset="100%" stopColor="#f59e0b" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#c9a96e" />
                <stop offset="50%" stopColor="#d4b896" />
                <stop offset="100%" stopColor="#a78b5a" />
              </>
            )}
          </linearGradient>
        </defs>

        {/* トラック */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={strokeWidth}
        />

        {/* プログレス */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
    </div>
  );
}

// ── 次元プログレスバー ───────────────────────────────

function DimensionBar({
  label,
  value,
  delay = 0,
}: {
  label: string;
  value: number;
  delay?: number;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <span className="text-xs tabular-nums text-slate-500">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              value >= 60
                ? "linear-gradient(90deg, #c9a96e, #d4b896)"
                : value >= 30
                  ? "linear-gradient(90deg, #94a3b8, #c9a96e)"
                  : "linear-gradient(90deg, #cbd5e1, #94a3b8)",
          }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value)}%` }}
          transition={{
            duration: 1,
            delay: delay * 0.06 + 0.3,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      </div>
    </div>
  );
}

// ── コンパクト版 ─────────────────────────────────────

function CompactMeter({ level }: { level: UnderstandingLevel }) {
  const { daysSinceLastObservation } = getDecayInfo(level);
  const isDecaying = daysSinceLastObservation >= 1;

  return (
    <div className="relative inline-flex items-center gap-2">
      <div className="relative">
        <RingGauge
          value={level.overall}
          size={32}
          strokeWidth={3}
          isDecaying={isDecaying}
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={`text-[9px] font-bold tabular-nums ${
              isDecaying ? "text-red-500" : "text-slate-700"
            }`}
          >
            {level.overall}
          </span>
        </div>
      </div>
      {isDecaying && (
        <motion.div
          className="w-1.5 h-1.5 rounded-full bg-red-400"
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      )}
    </div>
  );
}

// ── フル版 ───────────────────────────────────────────

function FullMeter({
  level,
  showDimensions = true,
  showMilestone = true,
  animated = true,
}: Omit<Props, "compact">) {
  const status = getUnderstandingStatus(level);
  const { daysSinceLastObservation, percentageLost } = getDecayInfo(level);
  const isDecaying = daysSinceLastObservation >= 1 && percentageLost > 0;

  const dimensionEntries = Object.entries(level.dimensions) as [
    DimensionKey,
    number,
  ][];

  const milestones = getAllMilestones();
  const reached = getReachedMilestones(level.overall);

  return (
    <GlassCard variant="default" padding="lg" hoverEffect={false}>
      <div className="space-y-6">
        {/* ヘッダー */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              理解度メーター
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              観測{level.observationCount}回
            </p>
          </div>
          <TrendIcon trend={level.trend} />
        </div>

        {/* メインゲージ */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <RingGauge
              value={level.overall}
              size={140}
              strokeWidth={8}
              isDecaying={isDecaying}
            />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {animated ? (
                <AnimatedCounter
                  value={level.overall}
                  className={`text-3xl font-bold tabular-nums ${
                    isDecaying ? "text-red-500" : "text-slate-900"
                  }`}
                />
              ) : (
                <span
                  className={`text-3xl font-bold tabular-nums ${
                    isDecaying ? "text-red-500" : "text-slate-900"
                  }`}
                >
                  {level.overall}
                </span>
              )}
              <span className="text-xs text-slate-400 mt-0.5">%</span>
            </div>
          </div>

          {/* ステータスメッセージ */}
          <p className="text-sm text-slate-600 text-center leading-relaxed">
            {status.message}
          </p>
        </div>

        {/* 減衰警告 */}
        <AnimatePresence>
          {isDecaying && status.warning && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50/80 border border-red-200/50">
                <motion.span
                  className="text-red-500 text-sm mt-0.5"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  !
                </motion.span>
                <p className="text-xs text-red-600 leading-relaxed">
                  {status.warning}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 提案 */}
        {status.suggestion && !isDecaying && (
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50/60 border border-amber-200/40">
            <span className="text-amber-500 text-sm mt-0.5">*</span>
            <p className="text-xs text-amber-700 leading-relaxed">
              {status.suggestion}
            </p>
          </div>
        )}

        {/* 次元別スコア */}
        {showDimensions && (
          <FadeInView delay={0.2}>
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                次元別スコア
              </h4>
              <div className="space-y-2.5">
                {dimensionEntries
                  .sort((a, b) => b[1] - a[1])
                  .map(([key, value], i) => (
                    <DimensionBar
                      key={key}
                      label={DIMENSION_LABELS[key]}
                      value={value}
                      delay={i}
                    />
                  ))}
              </div>
            </div>
          </FadeInView>
        )}

        {/* マイルストーン */}
        {showMilestone && (
          <FadeInView delay={0.4}>
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                マイルストーン
              </h4>

              {/* 次のマイルストーンティーザー */}
              <div className="px-3 py-2.5 rounded-xl bg-gradient-to-r from-amber-50/60 to-orange-50/40 border border-amber-200/30">
                <p className="text-xs text-amber-800">
                  <span className="font-bold">
                    {status.nextMilestone.percentage}%
                  </span>
                  に到達すると
                  <span className="font-semibold">
                    「{status.nextMilestone.label}」
                  </span>
                  が解放されます
                </p>
                {/* ミニプログレス */}
                <div className="mt-2 h-1 rounded-full bg-amber-100 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-orange-400"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${Math.min(
                        100,
                        (level.overall / status.nextMilestone.percentage) * 100
                      )}%`,
                    }}
                    transition={{
                      duration: 1.2,
                      delay: 0.5,
                      ease: [0.22, 1, 0.36, 1],
                    }}
                  />
                </div>
              </div>

              {/* 到達済みマイルストーン一覧 */}
              {reached.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {reached.map((m) => (
                    <GlassBadge key={m.percentage} variant="success" size="sm">
                      {m.percentage}% {m.label}
                    </GlassBadge>
                  ))}
                </div>
              )}
            </div>
          </FadeInView>
        )}

        {/* 信頼度 */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
          <span className="text-[10px] text-slate-400">
            信頼度: {Math.round(level.confidence * 100)}%
          </span>
          <span className="text-[10px] text-slate-400">
            {level.lastObservationAt
              ? `最終観測: ${formatRelativeTime(level.lastObservationAt)}`
              : "未観測"}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}

// ── ヘルパー ─────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return "たった今";
  if (diffMinutes < 60) return `${diffMinutes}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays < 7) return `${diffDays}日前`;
  return new Date(timestamp).toLocaleDateString("ja-JP", {
    month: "short",
    day: "numeric",
  });
}

// ── エクスポート ─────────────────────────────────────

export default function UnderstandingMeterDisplay({
  level,
  compact = false,
  showDimensions = true,
  showMilestone = true,
  animated = true,
}: Props) {
  if (compact) {
    return <CompactMeter level={level} />;
  }

  return (
    <FullMeter
      level={level}
      showDimensions={showDimensions}
      showMilestone={showMilestone}
      animated={animated}
    />
  );
}
