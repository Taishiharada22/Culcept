// app/stargazer/_components/AILearningIndicator.tsx
// AI学習可視化コンポーネント — Stargazer の知性の学習プロセスを表示
"use client";

import { useMemo, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LearningEvent {
  type:
    | "pattern_detected"
    | "accuracy_improved"
    | "new_contradiction"
    | "model_adjusted";
  description: string;
  timestamp: number;
}

interface CategoryStat {
  accuracy: number;
  totalPredictions: number;
  trend: "improving" | "stable" | "declining";
}

export interface AILearningIndicatorProps {
  mode: "compact" | "pulse" | "detailed";
  /** カテゴリ別精度 */
  categoryAccuracy?: Record<string, CategoryStat>;
  /** 最近の学習イベント */
  recentLearnings?: LearningEvent[];
  /** 全体精度 (0-100) */
  overallAccuracy?: number;
  /** 観測回数 */
  observationCount?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TREND_COLOR: Record<string, string> = {
  improving: "#22c55e",
  stable: "#eab308",
  declining: "#f59e0b",
};

const TREND_LABEL: Record<string, string> = {
  improving: "向上中",
  stable: "安定",
  declining: "低下傾向",
};

const EVENT_ICON: Record<LearningEvent["type"], string> = {
  pattern_detected: "🔍",
  accuracy_improved: "📈",
  new_contradiction: "⚡",
  model_adjusted: "🧠",
};

const EVENT_LABEL: Record<LearningEvent["type"], string> = {
  pattern_detected: "パターン検出",
  accuracy_improved: "精度向上",
  new_contradiction: "矛盾発見",
  model_adjusted: "モデル調整",
};

function accuracyColor(v: number): string {
  if (v >= 75) return "#22c55e";
  if (v >= 50) return "#eab308";
  return "#f59e0b";
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** 脳アイコン (SVG) */
function BrainIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M12 2a5 5 0 0 1 4.5 2.82A4 4 0 0 1 20 9a4 4 0 0 1-1.5 3.11A5 5 0 0 1 12 22" />
      <path d="M12 2a5 5 0 0 0-4.5 2.82A4 4 0 0 0 4 9a4 4 0 0 0 1.5 3.11A5 5 0 0 0 12 22" />
      <path d="M12 2v20" />
      <path d="M8 6.5h3" />
      <path d="M13 6.5h3" />
      <path d="M7 10h4" />
      <path d="M13 10h4" />
      <path d="M8 14h3" />
      <path d="M13 14h3" />
    </svg>
  );
}

/** カテゴリ別ミニバー */
function CategoryBar({
  name,
  stat,
  delay,
}: {
  name: string;
  stat: CategoryStat;
  delay: number;
}) {
  const color = accuracyColor(stat.accuracy);
  const trendColor = TREND_COLOR[stat.trend];

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-slate-500 w-20 truncate flex-shrink-0">{name}</span>
      <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(stat.accuracy, 100)}%` }}
          transition={{ duration: 0.4, delay, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <span className="text-xs font-mono tabular-nums text-slate-700 w-10 text-right">
        {Math.round(stat.accuracy)}%
      </span>
      <span
        className="text-[10px] font-medium w-14 text-right"
        style={{ color: trendColor }}
      >
        {TREND_LABEL[stat.trend]}
      </span>
    </div>
  );
}

/** ミニスパークライン (精度推移の簡易表示) */
function MiniSparkline({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  const w = 80;
  const h = 24;
  const pad = 2;

  const path = useMemo(() => {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => {
      const x = pad + (i / (data.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (v - min) / range) * (h - pad * 2);
      return `${x},${y}`;
    });
    return `M ${pts.join(" L ")}`;
  }, [data]);

  if (data.length < 2) return null;

  return (
    <svg width={w} height={h} className="overflow-visible">
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </svg>
  );
}

/** パルスモードの粒子 */
function SparkParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => ({
        id: i,
        angle: (i / 8) * Math.PI * 2,
        distance: 30 + Math.random() * 20,
        size: 2 + Math.random() * 2,
        delay: Math.random() * 0.3,
      })),
    [],
  );

  return (
    <>
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            width: p.size,
            height: p.size,
            background: `hsl(${180 + p.id * 30}, 80%, 65%)`,
            left: "50%",
            top: "50%",
          }}
          initial={{ x: 0, y: 0, opacity: 0, scale: 0 }}
          animate={{
            x: Math.cos(p.angle) * p.distance,
            y: Math.sin(p.angle) * p.distance,
            opacity: [0, 1, 0],
            scale: [0, 1.2, 0],
          }}
          transition={{
            duration: 1.2,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Compact Mode
// ---------------------------------------------------------------------------

function CompactMode({
  overallAccuracy = 0,
  observationCount = 0,
}: Pick<AILearningIndicatorProps, "overallAccuracy" | "observationCount">) {
  const color = accuracyColor(overallAccuracy);

  return (
    <motion.div
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/80 backdrop-blur-lg border border-slate-200/60 shadow-sm"
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      {/* 呼吸するパルスドット */}
      <motion.div
        className="relative flex items-center justify-center"
        animate={{ scale: [1, 1.15, 1] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      >
        <BrainIcon size={14} className="text-violet-500" />
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{ background: "rgba(139, 92, 246, 0.2)" }}
          animate={{ scale: [1, 1.6, 1], opacity: [0.4, 0, 0.4] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      <span className="text-xs text-slate-500">AIが学習中...</span>

      <span
        className="text-xs font-semibold font-mono tabular-nums"
        style={{ color }}
      >
        精度{Math.round(overallAccuracy)}%
      </span>

      {observationCount > 0 && (
        <GlassBadge variant="info" size="sm">
          {observationCount}回観測
        </GlassBadge>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Pulse Mode
// ---------------------------------------------------------------------------

function PulseMode({
  recentLearnings = [],
}: Pick<AILearningIndicatorProps, "recentLearnings">) {
  const [visible, setVisible] = useState(true);
  const latest = recentLearnings[0];

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!latest) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="fixed top-20 left-1/2 z-50 -translate-x-1/2"
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
        >
          <div className="relative flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/90 backdrop-blur-2xl border border-violet-200/60 shadow-xl shadow-violet-500/10">
            {/* 粒子エフェクト */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
              <SparkParticles />
            </div>

            {/* グローバックグラウンド */}
            <motion.div
              className="absolute inset-0 rounded-2xl"
              style={{
                background:
                  "radial-gradient(circle at center, rgba(139,92,246,0.08) 0%, transparent 70%)",
              }}
              animate={{ opacity: [0.5, 1, 0.5] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />

            <motion.div
              className="relative z-10 text-lg"
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.25, ease: "easeOut" }}
            >
              {EVENT_ICON[latest.type]}
            </motion.div>

            <div className="relative z-10">
              <p className="text-xs font-semibold text-violet-700">
                {EVENT_LABEL[latest.type]}
              </p>
              <p className="text-sm text-slate-700">{latest.description}</p>
            </div>

            {/* プログレスバー (自動消滅) */}
            <motion.div
              className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-violet-400 to-cyan-400 rounded-full"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 3, ease: "linear" }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Detailed Mode
// ---------------------------------------------------------------------------

function DetailedMode({
  categoryAccuracy = {},
  recentLearnings = [],
  overallAccuracy = 0,
  observationCount = 0,
}: Omit<AILearningIndicatorProps, "mode">) {
  const categories = Object.entries(categoryAccuracy);

  // 精度推移のデモデータ (実際には props から渡す)
  const sparkData = useMemo(() => {
    const base = overallAccuracy;
    return Array.from({ length: 10 }, (_, i) => {
      const noise = (Math.sin(i * 1.5) * 8 + Math.cos(i * 0.7) * 4);
      return Math.max(0, Math.min(100, base - 15 + (i / 9) * 15 + noise));
    });
  }, [overallAccuracy]);

  const color = accuracyColor(overallAccuracy);

  return (
    <GlassCard variant="gradient" padding="md" hoverEffect={false}>
      {/* ヘッダー */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          >
            <BrainIcon size={20} className="text-violet-600" />
          </motion.div>
          <h3 className="text-base font-bold text-slate-800">AI学習ステータス</h3>
        </div>
        <GlassBadge variant="info" size="sm">
          {observationCount}回観測
        </GlassBadge>
      </div>

      {/* 全体精度 + スパークライン */}
      <div className="flex items-end justify-between mb-6 pb-4 border-b border-slate-200/40">
        <div>
          <p className="text-xs text-slate-500 mb-1">全体精度</p>
          <div className="flex items-baseline gap-1">
            <motion.span
              className="text-3xl font-bold font-mono tabular-nums"
              style={{ color }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.22 }}
            >
              {Math.round(overallAccuracy)}
            </motion.span>
            <span className="text-sm text-slate-400">%</span>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] text-slate-400">精度推移</span>
          <MiniSparkline data={sparkData} color={color} />
        </div>
      </div>

      {/* カテゴリ別精度 */}
      {categories.length > 0 && (
        <div className="mb-5">
          <p className="text-xs font-semibold text-slate-600 mb-3">
            カテゴリ別精度
          </p>
          <div className="space-y-2.5">
            {categories.map(([name, stat], i) => (
              <CategoryBar key={name} name={name} stat={stat} delay={i * 0.1} />
            ))}
          </div>
        </div>
      )}

      {/* 学習タイムライン */}
      {recentLearnings.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-600 mb-3">
            学習タイムライン
          </p>
          <div className="space-y-2">
            {recentLearnings.slice(0, 5).map((event, i) => (
              <motion.div
                key={`${event.type}-${event.timestamp}`}
                className="flex items-start gap-2.5 py-1.5"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.22 }}
              >
                <span className="text-sm flex-shrink-0 mt-0.5">
                  {EVENT_ICON[event.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-700">
                      {EVENT_LABEL[event.type]}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {relativeTime(event.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {event.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {/* 空状態 */}
      {categories.length === 0 && recentLearnings.length === 0 && (
        <div className="text-center py-6">
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <BrainIcon size={32} className="text-slate-300 mx-auto" />
          </motion.div>
          <p className="text-sm text-slate-400 mt-3">
            観測データを収集中です...
          </p>
          <p className="text-xs text-slate-300 mt-1">
            質問に答えるほど精度が上がります
          </p>
        </div>
      )}
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Main Export
// ---------------------------------------------------------------------------

export default function AILearningIndicator(props: AILearningIndicatorProps) {
  const { mode, ...rest } = props;

  switch (mode) {
    case "compact":
      return (
        <CompactMode
          overallAccuracy={rest.overallAccuracy}
          observationCount={rest.observationCount}
        />
      );
    case "pulse":
      return <PulseMode recentLearnings={rest.recentLearnings} />;
    case "detailed":
      return <DetailedMode {...rest} />;
    default:
      return null;
  }
}
