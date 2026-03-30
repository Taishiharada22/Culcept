"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassButton,
  GlassBadge,
  GlassInput,
  ProgressRing,
  FadeInView,
  Skeleton,
} from "@/components/ui/glassmorphism-design";
import { trackFeatureView, trackProphecyVerify } from "@/lib/stargazer/trackClient";
import StargazerLoading from "../_shared/StargazerLoading";
import EmptyState from "../_shared/EmptyState";
import type {
  DailyProphecy,
  ProphecyCategory,
  ProphecyVerification,
  PredictionAccuracy,
  VerificationLevel,
} from "@/lib/stargazer/dailyProphecy";
import {
  generateDailyProphecy,
  calculateAccuracy,
} from "@/lib/stargazer/dailyProphecy";
import {
  mapToVerificationLevel,
  getAllMilestones,
  type AccuracyStats,
  type AccuracyMilestone,
} from "@/lib/stargazer/prophecyAccuracy";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const STORAGE_KEY_PROPHECIES = "sg_prophecies_v1";
const STORAGE_KEY_VERIFICATIONS = "sg_verifications_v1";

const CATEGORY_META: Record<
  ProphecyCategory,
  { label: string; emoji: string; color: string; bgClass: string }
> = {
  decision: {
    label: "決断",
    emoji: "\u2696\uFE0F",
    color: "#6366f1",
    bgClass: "from-indigo-500/10 to-violet-500/10",
  },
  emotion: {
    label: "感情",
    emoji: "\uD83C\uDF0A",
    color: "#ec4899",
    bgClass: "from-pink-500/10 to-rose-500/10",
  },
  social: {
    label: "社交",
    emoji: "\uD83E\uDD1D",
    color: "#14b8a6",
    bgClass: "from-teal-500/10 to-emerald-500/10",
  },
  energy: {
    label: "エネルギー",
    emoji: "\u26A1",
    color: "#f59e0b",
    bgClass: "from-amber-500/10 to-yellow-500/10",
  },
  avoidance: {
    label: "回避",
    emoji: "\uD83C\uDF2B\uFE0F",
    color: "#8b5cf6",
    bgClass: "from-purple-500/10 to-fuchsia-500/10",
  },
  impulse: {
    label: "衝動",
    emoji: "\uD83D\uDD25",
    color: "#ef4444",
    bgClass: "from-red-500/10 to-orange-500/10",
  },
};

const QUICK_ANSWERS: Record<ProphecyCategory, string[]> = {
  decision: [
    "まさにその通りだった",
    "似た場面はあったが違う選択をした",
    "そもそもそういう場面がなかった",
    "部分的に当たっていた",
  ],
  emotion: [
    "その感情を確かに感じた",
    "別の感情が強かった",
    "特に感情の動きはなかった",
    "似た感覚だが少し違った",
  ],
  social: [
    "対人関係でまさにそうなった",
    "人とは会ったが予測とは違った",
    "今日はあまり人と関わらなかった",
    "部分的に当てはまった",
  ],
  energy: [
    "エネルギーの流れがその通りだった",
    "逆のパターンだった",
    "特に変化を感じなかった",
    "少し違うが近いものがあった",
  ],
  avoidance: [
    "確かに回避してしまった",
    "今回は向き合えた",
    "回避するような場面自体なかった",
    "回避したが理由が違った",
  ],
  impulse: [
    "衝動に動かされた",
    "衝動を感じたが抑えた",
    "特に衝動は感じなかった",
    "違う形の衝動があった",
  ],
};

// Verification level -> UI feedback config
const VERIFICATION_FEEDBACK: Record<
  VerificationLevel,
  {
    label: string;
    message: string;
    color: string;
    bgGradient: string;
    glowColor: string;
  }
> = {
  exact: {
    label: "的中",
    message: "あなたの判断パターンを正確に捉えていた",
    color: "#b09050",
    bgGradient: "from-amber-100/80 to-yellow-50/60",
    glowColor: "rgba(176,144,80,0.3)",
  },
  close: {
    label: "惜しい！近かった",
    message: "核心に近い。精度はさらに上がっていく",
    color: "#d97706",
    bgGradient: "from-amber-50/80 to-orange-50/60",
    glowColor: "rgba(217,119,6,0.2)",
  },
  partial: {
    label: "部分的に当たった",
    message: "部分的に当たった。精度は上がっていく",
    color: "#6366f1",
    bgGradient: "from-indigo-50/80 to-violet-50/60",
    glowColor: "rgba(99,102,241,0.15)",
  },
  off: {
    label: "外れ",
    message: "今回は外れた。でもこのデータが次の精度を上げる",
    color: "#64748b",
    bgGradient: "from-slate-100/80 to-slate-50/60",
    glowColor: "rgba(100,116,139,0.1)",
  },
  opposite: {
    label: "正反対",
    message: "正反対。面白い。あなたの中で何かが変わった？",
    color: "#8b5cf6",
    bgGradient: "from-purple-50/80 to-fuchsia-50/60",
    glowColor: "rgba(139,92,246,0.15)",
  },
};

// Milestone icon map
const MILESTONE_ICONS: Record<string, string> = {
  eye: "\uD83D\uDC41\uFE0F",
  flame: "\uD83D\uDD25",
  telescope: "\uD83D\uDD2D",
  moon: "\uD83C\uDF19",
  target: "\uD83C\uDFAF",
  star: "\u2B50",
  layers: "\uD83D\uDCDA",
  infinity: "\u267E\uFE0F",
  calendar: "\uD83D\uDCC5",
  award: "\uD83C\uDFC6",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Persistence helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface StoredProphecy extends DailyProphecy {
  verified: boolean;
  verification?: ProphecyVerification;
}

function loadProphecies(): StoredProphecy[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_PROPHECIES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveProphecies(items: StoredProphecy[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_PROPHECIES, JSON.stringify(items));
  } catch {
    // QuotaExceededError – ignore; prophecy cache is best-effort
  }
}

function loadVerifications(): ProphecyVerification[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_VERIFICATIONS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveVerifications(items: ProphecyVerification[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY_VERIFICATIONS, JSON.stringify(items));
  } catch {
    // QuotaExceededError – ignore; verification cache is best-effort
  }
}

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function isEvening(): boolean {
  return new Date().getHours() >= 17;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-xs font-medium font-body"
          style={{ color: "rgba(100,105,130,0.7)" }}
        >
          確信度
        </span>
        <span
          className="text-xs font-mono-sg font-semibold"
          style={{ color: "rgba(30,35,55,0.8)" }}
        >
          {pct}%
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-200/60 overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background:
              "linear-gradient(90deg, rgba(139,92,246,0.6), rgba(99,102,241,0.8))",
          }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </div>
    </div>
  );
}

// ── Accuracy Ring: custom SVG donut ──
function AccuracyRing({
  hitRate,
  size = 100,
  strokeWidth = 7,
}: {
  hitRate: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const pct = Math.round(hitRate * 100);

  // Color based on accuracy
  const strokeColor =
    hitRate >= 0.8
      ? "#b09050"
      : hitRate >= 0.6
        ? "#d97706"
        : "#94a3b8";

  const gradientId = `accuracyGrad-${size}`;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.2)"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (hitRate * circumference) }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.2 }}
          style={{ strokeDasharray: circumference }}
        />
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={strokeColor} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0.6} />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl font-bold font-mono-sg"
          style={{ color: strokeColor }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, type: "spring", stiffness: 200 }}
        >
          {pct}%
        </motion.span>
        <span
          className="text-[10px] font-body"
          style={{ color: "rgba(100,105,130,0.5)" }}
        >
          的中率
        </span>
      </div>
    </div>
  );
}

// ── Verification Result Animation ──
function VerificationResultView({
  level,
  accuracyScore,
  stats,
  newMilestones,
  onDone,
}: {
  level: VerificationLevel;
  accuracyScore: number;
  stats: AccuracyStats | null;
  newMilestones: AccuracyMilestone[];
  onDone: () => void;
}) {
  const feedback = VERIFICATION_FEEDBACK[level];
  const isExact = level === "exact";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="space-y-4"
    >
      {/* Result card */}
      <div
        className={`relative rounded-2xl bg-gradient-to-br ${feedback.bgGradient} border border-white/80 p-6 text-center overflow-hidden`}
      >
        {/* Glow for exact hits */}
        {isExact && (
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none"
            style={{
              boxShadow: `inset 0 0 40px ${feedback.glowColor}, 0 0 60px ${feedback.glowColor}`,
            }}
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <motion.div
          className="relative"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 250, damping: 15 }}
        >
          <AccuracyRing hitRate={accuracyScore} size={90} strokeWidth={6} />
        </motion.div>

        <motion.p
          className="mt-4 text-xl font-bold font-display"
          style={{ color: feedback.color }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          {feedback.label}
        </motion.p>

        <motion.p
          className="mt-2 text-sm font-body"
          style={{ color: "rgba(100,105,130,0.7)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {feedback.message}
        </motion.p>

        {/* Streak badge */}
        {stats && stats.streak > 0 && (
          <motion.div
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ background: "rgba(176,144,80,0.1)" }}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, type: "spring", stiffness: 200 }}
          >
            <span className="text-sm">{"\uD83D\uDD25"}</span>
            <span
              className="text-xs font-bold font-mono-sg"
              style={{ color: "#b09050" }}
            >
              {stats.streak}日連続的中
            </span>
          </motion.div>
        )}

        {/* Trend indicator */}
        {stats && stats.totalVerified >= 5 && (
          <motion.div
            className="mt-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
          >
            <span
              className="text-xs font-body"
              style={{ color: "rgba(100,105,130,0.5)" }}
            >
              精度トレンド:{" "}
              {stats.recentTrend === "improving"
                ? "\u2191 上昇中"
                : stats.recentTrend === "declining"
                  ? "\u2193 低下中"
                  : "\u2192 安定"}
            </span>
          </motion.div>
        )}
      </div>

      {/* New milestones */}
      <AnimatePresence>
        {newMilestones.map((m, i) => (
          <motion.div
            key={m.id}
            initial={{ opacity: 0, scale: 0, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{
              delay: 1.2 + i * 0.3,
              type: "spring",
              stiffness: 200,
              damping: 15,
            }}
            className="rounded-2xl bg-gradient-to-br from-amber-50/80 to-yellow-50/60 border border-amber-200/40 p-4 flex items-center gap-3"
          >
            <motion.span
              className="text-2xl"
              animate={{ rotate: [0, -10, 10, -10, 0] }}
              transition={{ delay: 1.5 + i * 0.3, duration: 0.22 }}
            >
              {MILESTONE_ICONS[m.icon] ?? "\u2728"}
            </motion.span>
            <div>
              <p
                className="text-sm font-bold font-display"
                style={{ color: "#b09050" }}
              >
                {m.label}
              </p>
              <p
                className="text-xs font-body"
                style={{ color: "rgba(100,105,130,0.6)" }}
              >
                {m.description}
              </p>
            </div>
            <GlassBadge variant="warning" size="sm">
              解除
            </GlassBadge>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="text-center space-y-3"
      >
        <p
          className="text-sm font-body"
          style={{ color: "rgba(100,105,130,0.5)" }}
        >
          明日の予言が気になる？
        </p>
        <GlassButton variant="ghost" size="sm" onClick={onDone}>
          閉じる
        </GlassButton>
      </motion.div>
    </motion.div>
  );
}

// ── Accuracy Dashboard ──
function AccuracyDashboard({ stats }: { stats: AccuracyStats }) {
  const allMilestones = useMemo(() => getAllMilestones(), []);
  const unlockedIds = useMemo(
    () => new Set(stats.milestones.map((m) => m.id)),
    [stats.milestones],
  );

  const WEEKDAY_ORDER = ["月", "火", "水", "木", "金", "土", "日"];

  if (stats.totalVerified === 0) return null;

  return (
    <GlassCard variant="default" padding="md" hoverEffect={false}>
      <div className="space-y-5">
        {/* Main stats row */}
        <div className="flex items-center gap-5">
          <div className="flex-shrink-0">
            <AccuracyRing hitRate={stats.hitRate} size={90} strokeWidth={6} />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className="text-xs font-body"
                style={{ color: "rgba(100,105,130,0.6)" }}
              >
                累計的中率
              </span>
              {stats.recentTrend === "improving" && (
                <GlassBadge variant="success" size="sm">
                  上昇中
                </GlassBadge>
              )}
              {stats.recentTrend === "declining" && (
                <GlassBadge variant="warning" size="sm">
                  低下中
                </GlassBadge>
              )}
            </div>
            <div className="flex items-baseline gap-4">
              {stats.streak > 0 && (
                <motion.div
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <span
                    className="text-2xl font-bold font-mono-sg"
                    style={{ color: "#b09050" }}
                  >
                    {stats.streak}
                  </span>
                  <span
                    className="text-xs font-body ml-1"
                    style={{ color: "rgba(100,105,130,0.5)" }}
                  >
                    連続的中
                  </span>
                </motion.div>
              )}
              <div>
                <span
                  className="text-sm font-mono-sg"
                  style={{ color: "rgba(30,35,55,0.6)" }}
                >
                  {stats.totalVerified}
                </span>
                <span
                  className="text-xs font-body ml-1"
                  style={{ color: "rgba(100,105,130,0.5)" }}
                >
                  回検証
                </span>
              </div>
            </div>
            {stats.bestStreak > stats.streak && (
              <p
                className="text-[10px] font-body"
                style={{ color: "rgba(100,105,130,0.4)" }}
              >
                最高記録: {stats.bestStreak}連続
              </p>
            )}
          </div>
        </div>

        {/* Category breakdown bars */}
        {Object.keys(stats.categoryAccuracy).length > 0 && (
          <div className="space-y-2">
            <p
              className="text-xs font-body font-semibold"
              style={{ color: "rgba(30,35,55,0.6)" }}
            >
              カテゴリ別精度
            </p>
            {Object.entries(stats.categoryAccuracy)
              .filter(([, val]) => val > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, val]) => {
                const meta = CATEGORY_META[cat as ProphecyCategory];
                if (!meta) return null;
                const pct = Math.round(val * 100);
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <span
                      className="text-xs font-body w-20 text-right"
                      style={{ color: meta.color }}
                    >
                      {meta.emoji} {meta.label}
                    </span>
                    <div className="flex-1 h-1.5 rounded-full bg-slate-200/50 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: meta.color, opacity: 0.7 }}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.4, ease: "easeOut" }}
                      />
                    </div>
                    <span
                      className="text-xs font-mono-sg w-10"
                      style={{ color: "rgba(30,35,55,0.6)" }}
                    >
                      {pct}%
                    </span>
                  </div>
                );
              })}
          </div>
        )}

        {/* Weekday heatmap */}
        {Object.keys(stats.weekdayAccuracy).length > 0 && (
          <div>
            <p
              className="text-xs font-body font-semibold mb-2"
              style={{ color: "rgba(30,35,55,0.6)" }}
            >
              曜日別精度
            </p>
            <div className="flex items-center justify-between gap-1">
              {WEEKDAY_ORDER.map((day) => {
                const rate = stats.weekdayAccuracy[day] ?? -1;
                const hasData = rate >= 0;
                const bg = !hasData
                  ? "rgba(148,163,184,0.1)"
                  : rate >= 0.8
                    ? "rgba(176,144,80,0.5)"
                    : rate >= 0.6
                      ? "rgba(217,119,6,0.35)"
                      : rate >= 0.4
                        ? "rgba(99,102,241,0.25)"
                        : "rgba(148,163,184,0.15)";
                return (
                  <div key={day} className="flex flex-col items-center gap-1">
                    <motion.div
                      className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: bg }}
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.1 * WEEKDAY_ORDER.indexOf(day) }}
                    >
                      <span
                        className="text-[10px] font-mono-sg font-bold"
                        style={{
                          color: hasData && rate >= 0.6
                            ? "rgba(30,35,55,0.8)"
                            : "rgba(100,105,130,0.4)",
                        }}
                      >
                        {hasData ? `${Math.round(rate * 100)}` : "-"}
                      </span>
                    </motion.div>
                    <span
                      className="text-[10px] font-body"
                      style={{ color: "rgba(100,105,130,0.4)" }}
                    >
                      {day}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Milestones grid */}
        <div>
          <p
            className="text-xs font-body font-semibold mb-2"
            style={{ color: "rgba(30,35,55,0.6)" }}
          >
            マイルストーン
          </p>
          <div className="grid grid-cols-5 gap-2">
            {allMilestones.map((m) => {
              const unlocked = unlockedIds.has(m.id);
              return (
                <motion.div
                  key={m.id}
                  className="flex flex-col items-center gap-0.5 p-1.5 rounded-xl"
                  style={{
                    background: unlocked
                      ? "rgba(176,144,80,0.08)"
                      : "rgba(148,163,184,0.05)",
                    opacity: unlocked ? 1 : 0.35,
                  }}
                  whileHover={{ scale: 1.05 }}
                  title={`${m.label}: ${m.description}`}
                >
                  <span className="text-base">
                    {MILESTONE_ICONS[m.icon] ?? "\u2728"}
                  </span>
                  <span
                    className="text-[8px] font-body text-center leading-tight"
                    style={{
                      color: unlocked
                        ? "rgba(30,35,55,0.7)"
                        : "rgba(100,105,130,0.4)",
                    }}
                  >
                    {m.label}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Insight */}
        <p
          className="text-xs font-body text-center pt-2"
          style={{ color: "rgba(100,105,130,0.5)" }}
        >
          予言精度が上がるほど、あなたの理解が深まっている証拠です
        </p>
      </div>
    </GlassCard>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function ProphecyClient() {
  const [loading, setLoading] = useState(true);
  const [prophecies, setProphecies] = useState<StoredProphecy[]>([]);
  const [verifications, setVerifications] = useState<ProphecyVerification[]>([]);
  const [todayProphecy, setTodayProphecy] = useState<StoredProphecy | null>(null);

  // Verification state
  const [verifyMode, setVerifyMode] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [customNote, setCustomNote] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const [lastScore, setLastScore] = useState(0);
  const [lastLevel, setLastLevel] = useState<VerificationLevel>("off");
  const [newMilestones, setNewMilestones] = useState<AccuracyMilestone[]>([]);

  // Server-side detailed stats
  const [serverStats, setServerStats] = useState<AccuracyStats | null>(null);

  // Expand past prophecy for verification
  const [expandedPast, setExpandedPast] = useState<string | null>(null);

  // Analytics: track page view
  useEffect(() => { trackFeatureView("prophecy"); }, []);

  // ── Init: load or generate today's prophecy ──
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    const stored = loadProphecies();
    const storedV = loadVerifications();
    setProphecies(stored);
    setVerifications(storedV);

    const today = todayStr();
    const existing = stored.find((p) => p.prophecyDate === today);

    if (existing) {
      setTodayProphecy(existing);
      if (existing.verified) {
        setShowResult(true);
        setLastScore(existing.verification?.accuracyScore ?? 0);
        setLastLevel(existing.verification?.verificationLevel ?? "off");
      }
    } else {
      // Generate new prophecy
      const now = new Date();
      const recentProphecies = stored
        .filter((p) => p.verified && p.verification)
        .slice(-10)
        .map((p) => ({
          category: p.category,
          wasCorrect:
            p.verification!.status === "correct" ||
            p.verification!.status === "partially_correct",
        }));

      const prophecy = generateDailyProphecy({
        userId: "local_user",
        archetypeCode: "PBA",
        axisScores: {},
        dayOfWeek: now.getDay(),
        recentProphecies,
        observationDepth: Math.min(stored.length / 30, 1),
      });

      const newEntry: StoredProphecy = { ...prophecy, verified: false };
      const updated = [newEntry, ...stored].slice(0, 60);
      setProphecies(updated);
      setTodayProphecy(newEntry);
      saveProphecies(updated);
    }

    setLoading(false);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // ── Accuracy stats (local fallback) ──
  const accuracy = useMemo(
    () => calculateAccuracy(verifications),
    [verifications],
  );

  // ── Build a combined stats object (prefer server, fallback to local) ──
  const displayStats: AccuracyStats | null = useMemo(() => {
    if (serverStats) return serverStats;
    // Build a minimal AccuracyStats from the local accuracy for display
    if (accuracy.totalPredictions > 0) {
      return {
        totalVerified: accuracy.totalPredictions,
        exactHits: accuracy.correctPredictions,
        closeHits: accuracy.partiallyCorrect,
        partialHits: 0,
        misses: accuracy.totalPredictions - accuracy.correctPredictions - accuracy.partiallyCorrect,
        hitRate: accuracy.accuracyPercentage / 100,
        streak: accuracy.currentStreak,
        bestStreak: accuracy.bestStreak,
        recentTrend: accuracy.trend,
        weekdayAccuracy: {},
        categoryAccuracy: accuracy.categoryAccuracy as Record<string, number>,
        milestones: [],
      };
    }
    return null;
  }, [serverStats, accuracy]);

  // ── Verification handler ──
  const handleVerify = useCallback(
    (prophecyId: string, answer: string, note: string) => {
      setVerifying(true);

      // Map answer to 5-level verification
      const level = mapToVerificationLevel(answer);

      // Map level to score
      const levelScoreMap: Record<VerificationLevel, number> = {
        exact: 0.9 + Math.random() * 0.1,
        close: 0.65 + Math.random() * 0.1,
        partial: 0.35 + Math.random() * 0.1,
        off: 0.05 + Math.random() * 0.1,
        opposite: 0.02 + Math.random() * 0.03,
      };
      const accuracyScore = levelScoreMap[level];

      // Map level to old status
      let status: ProphecyVerification["status"];
      if (level === "exact" || level === "close") {
        status = "correct";
      } else if (level === "partial") {
        status = "partially_correct";
      } else {
        status = "wrong";
      }

      const verification: ProphecyVerification = {
        prophecyId,
        status,
        userNote: note || undefined,
        accuracyScore,
        verificationLevel: level,
      };

      // Update prophecy
      const updatedProphecies = prophecies.map((p) =>
        p.id === prophecyId ? { ...p, verified: true, verification } : p,
      );
      setProphecies(updatedProphecies);
      saveProphecies(updatedProphecies);

      if (todayProphecy?.id === prophecyId) {
        setTodayProphecy({
          ...todayProphecy,
          verified: true,
          verification,
        });
      }

      const updatedV = [...verifications, verification];
      setVerifications(updatedV);
      saveVerifications(updatedV);

      setLastScore(accuracyScore);
      setLastLevel(level);
      trackProphecyVerify(prophecyId, status, accuracyScore);

      // Try to send to server
      fetch("/api/stargazer/prophecy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prophecyId,
          verificationAnswer: answer,
          actualBehavior: note || undefined,
        }),
      })
        .then((r) => r.json())
        .then((data) => {
          if (data.detailedStats) {
            setServerStats(data.detailedStats);
          }
          if (data.newMilestones && data.newMilestones.length > 0) {
            setNewMilestones(data.newMilestones);
          }
        })
        .catch(() => {
          // Server call failed; local data is fine
        });

      setTimeout(() => {
        setVerifying(false);
        setShowResult(true);
        setVerifyMode(false);
      }, 600);
    },
    [prophecies, verifications, todayProphecy],
  );

  // ── Past prophecies (last 7) ──
  const pastProphecies = useMemo(
    () =>
      prophecies
        .filter((p) => p.prophecyDate !== todayStr())
        .slice(0, 7),
    [prophecies],
  );

  // ── Loading ──
  if (loading) {
    return <StargazerLoading variant="prophecy" />;
  }

  const cat = todayProphecy ? CATEGORY_META[todayProphecy.category] : null;
  const evening = isEvening();
  const canVerify =
    todayProphecy && !todayProphecy.verified && evening;

  return (
    <div className="max-w-lg mx-auto px-4 pt-8 pb-32">
      {/* ── Back button ── */}
      <FadeInView>
        <Link
          href="/stargazer"
          className="inline-flex items-center gap-2 text-sm font-body hover:opacity-70 transition-opacity mb-6"
          style={{ color: "rgba(100,105,130,0.7)" }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          深層観測に戻る
        </Link>
      </FadeInView>

      {/* ── Page title ── */}
      <FadeInView delay={0.05}>
        <h1
          className="text-2xl font-display font-bold mb-1"
          style={{ color: "rgba(30,35,55,0.88)" }}
        >
          今日の予言
        </h1>
        <p
          className="text-sm font-body mb-8"
          style={{ color: "rgba(100,105,130,0.6)" }}
        >
          あなたの判断パターンから、今日の行動を1つ予測する
        </p>
      </FadeInView>

      {/* ━━━ Section 1: Today's Prophecy ━━━ */}
      {todayProphecy && cat && (
        <FadeInView delay={0.1}>
          <GlassCard
            variant="gradient"
            padding="none"
            className="relative overflow-hidden"
            hoverEffect={false}
          >
            {/* Glow effect for active (unverified) prophecy */}
            {!todayProphecy.verified && (
              <motion.div
                className="absolute inset-0 rounded-3xl pointer-events-none"
                style={{
                  background: `radial-gradient(ellipse at 50% 30%, ${cat.color}10 0%, transparent 60%)`,
                }}
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            <div className="relative p-6 sm:p-8">
              {/* Category badge + date */}
              <div className="flex items-center justify-between mb-6">
                <GlassBadge
                  variant="default"
                  size="sm"
                  className="font-body"
                >
                  {cat.emoji} {cat.label}
                </GlassBadge>
                <span
                  className="text-xs font-mono-sg"
                  style={{ color: "rgba(100,105,130,0.5)" }}
                >
                  {todayProphecy.prophecyDate}
                </span>
              </div>

              {/* Prediction text */}
              <motion.p
                className="text-lg sm:text-xl font-display font-semibold leading-relaxed mb-6"
                style={{ color: "rgba(30,35,55,0.9)" }}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4, ease: "easeOut" }}
              >
                {todayProphecy.prediction}
              </motion.p>

              {/* Confidence meter */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <ConfidenceBar value={todayProphecy.confidence} />
              </motion.div>

              {/* Reasoning / trigger */}
              <motion.div
                className="mt-4 pt-4 border-t"
                style={{ borderColor: "rgba(160,170,200,0.15)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.8 }}
              >
                <p
                  className="text-xs font-body leading-relaxed"
                  style={{ color: "rgba(100,105,130,0.55)" }}
                >
                  <span className="font-semibold">発動条件:</span>{" "}
                  {todayProphecy.basis.triggerCondition}
                </p>
                {todayProphecy.basis.primaryAxes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {todayProphecy.basis.primaryAxes.map((a) => (
                      <span
                        key={a}
                        className="text-[10px] font-mono-sg px-2 py-0.5 rounded-full"
                        style={{
                          background: "rgba(139,92,246,0.08)",
                          color: "rgba(100,105,130,0.6)",
                        }}
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>

              {/* Verified result */}
              <AnimatePresence>
                {showResult && todayProphecy.verified && (
                  <motion.div
                    className="mt-6"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <VerificationResultView
                      level={lastLevel}
                      accuracyScore={lastScore}
                      stats={displayStats}
                      newMilestones={newMilestones}
                      onDone={() => {
                        setShowResult(false);
                        setNewMilestones([]);
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </GlassCard>
        </FadeInView>
      )}

      {/* ━━━ Section 2: Verification UI ━━━ */}
      {canVerify && !showResult && (
        <FadeInView delay={0.2}>
          <div className="mt-6">
            {!verifyMode ? (
              <GlassCard variant="bordered" padding="md" hoverEffect={false}>
                <p
                  className="text-sm font-body mb-3"
                  style={{ color: "rgba(30,35,55,0.75)" }}
                >
                  一日が終わりに近づいています。予言を検証しましょう。
                </p>
                <GlassButton
                  variant="gradient"
                  fullWidth
                  onClick={() => setVerifyMode(true)}
                >
                  検証する
                </GlassButton>
              </GlassCard>
            ) : (
              <GlassCard variant="elevated" padding="lg" hoverEffect={false}>
                <h3
                  className="text-base font-display font-bold mb-1"
                  style={{ color: "rgba(30,35,55,0.85)" }}
                >
                  予言の検証
                </h3>
                <p
                  className="text-sm font-body mb-5"
                  style={{ color: "rgba(100,105,130,0.65)" }}
                >
                  {todayProphecy?.verificationPrompt}
                </p>

                {/* Quick-select answers */}
                <div className="space-y-2 mb-4">
                  {QUICK_ANSWERS[todayProphecy!.category].map((answer) => (
                    <button
                      key={answer}
                      onClick={() => setSelectedAnswer(answer)}
                      className={`w-full text-left text-sm font-body px-4 py-3 rounded-2xl border transition-all duration-200 ${
                        selectedAnswer === answer
                          ? "bg-indigo-50 border-indigo-300 text-indigo-800"
                          : "bg-white/60 border-slate-200/60 text-slate-600 hover:bg-white/80 hover:border-slate-300"
                      }`}
                    >
                      {answer}
                    </button>
                  ))}
                </div>

                {/* Optional text note */}
                <GlassInput
                  placeholder="補足メモ（任意）"
                  value={customNote}
                  onChange={(v) => setCustomNote(v)}
                  size="sm"
                  className="mb-4"
                />

                <div className="flex gap-3">
                  <GlassButton
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setVerifyMode(false);
                      setSelectedAnswer(null);
                      setCustomNote("");
                    }}
                  >
                    キャンセル
                  </GlassButton>
                  <GlassButton
                    variant="primary"
                    size="sm"
                    fullWidth
                    disabled={!selectedAnswer}
                    loading={verifying}
                    onClick={() => {
                      if (selectedAnswer && todayProphecy) {
                        handleVerify(
                          todayProphecy.id,
                          selectedAnswer,
                          customNote,
                        );
                      }
                    }}
                  >
                    検証する
                  </GlassButton>
                </div>
              </GlassCard>
            )}
          </div>
        </FadeInView>
      )}

      {/* Not evening yet message */}
      {todayProphecy && !todayProphecy.verified && !evening && (
        <FadeInView delay={0.2}>
          <div className="mt-6">
            <GlassCard variant="default" padding="md" hoverEffect={false}>
              <p
                className="text-sm font-body text-center"
                style={{ color: "rgba(100,105,130,0.6)" }}
              >
                検証は夕方 17:00 以降に行えます。
                <br />
                予言を心に留めて、一日を過ごしてください。
              </p>
            </GlassCard>
          </div>
        </FadeInView>
      )}

      {/* ━━━ Section 3: Accuracy Dashboard ━━━ */}
      <FadeInView delay={0.3}>
        <div className="mt-8">
          <h2
            className="text-lg font-display font-bold mb-4"
            style={{ color: "rgba(30,35,55,0.85)" }}
          >
            予測精度
          </h2>

          {displayStats ? (
            <AccuracyDashboard stats={displayStats} />
          ) : (
            <GlassCard variant="default" padding="md" hoverEffect={false}>
              <EmptyState
                variant="prophecy"
                message="まだ予測データがありません。明日の予測を検証してみましょう。"
                submessage="予言を検証するとここに精度が表示されます"
                compact
              />
            </GlassCard>
          )}
        </div>
      </FadeInView>

      {/* ━━━ Section 4: Past Prophecies ━━━ */}
      {pastProphecies.length > 0 && (
        <FadeInView delay={0.4}>
          <div className="mt-8">
            <h2
              className="text-lg font-display font-bold mb-4"
              style={{ color: "rgba(30,35,55,0.85)" }}
            >
              最近の予言
            </h2>

            <div className="space-y-3">
              {pastProphecies.map((p) => {
                const pCat = CATEGORY_META[p.category];
                const isExpanded = expandedPast === p.id;

                return (
                  <GlassCard
                    key={p.id}
                    variant="default"
                    padding="sm"
                    hoverEffect={false}
                    onClick={() =>
                      setExpandedPast(isExpanded ? null : p.id)
                    }
                    className="cursor-pointer"
                  >
                    <div className="flex items-start gap-3">
                      {/* Date column */}
                      <div className="flex-shrink-0 text-center w-12">
                        <div
                          className="text-xs font-mono-sg"
                          style={{ color: "rgba(100,105,130,0.5)" }}
                        >
                          {p.prophecyDate.slice(5)}
                        </div>
                        <div className="text-base mt-0.5">{pCat.emoji}</div>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="text-sm font-body leading-relaxed line-clamp-2"
                          style={{ color: "rgba(30,35,55,0.75)" }}
                        >
                          {p.prediction}
                        </p>
                      </div>

                      {/* Status */}
                      <div className="flex-shrink-0">
                        {p.verified && p.verification ? (
                          <GlassBadge
                            variant={
                              p.verification.verificationLevel === "exact"
                                ? "success"
                                : p.verification.verificationLevel === "close"
                                  ? "success"
                                  : p.verification.status === "correct"
                                    ? "success"
                                    : p.verification.status === "partially_correct"
                                      ? "info"
                                      : "default"
                            }
                            size="sm"
                          >
                            {p.verification.verificationLevel === "exact"
                              ? "的中"
                              : p.verification.verificationLevel === "close"
                                ? "惜しい"
                                : p.verification.verificationLevel === "partial"
                                  ? "部分"
                                  : p.verification.verificationLevel === "opposite"
                                    ? "正反対"
                                    : `${Math.round(p.verification.accuracyScore * 100)}%`}
                          </GlassBadge>
                        ) : (
                          <GlassBadge variant="warning" size="sm">
                            未検証
                          </GlassBadge>
                        )}
                      </div>
                    </div>

                    {/* Expanded: verify past prophecy */}
                    <AnimatePresence>
                      {isExpanded && !p.verified && (
                        <PastProphecyVerifier
                          prophecy={p}
                          onVerify={(answer, note) =>
                            handleVerify(p.id, answer, note)
                          }
                        />
                      )}
                      {isExpanded && p.verified && p.verification && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="mt-3 pt-3 border-t"
                          style={{ borderColor: "rgba(160,170,200,0.15)" }}
                        >
                          <p
                            className="text-xs font-body"
                            style={{ color: "rgba(100,105,130,0.6)" }}
                          >
                            {p.verification.verificationLevel === "exact"
                              ? "的中しました"
                              : p.verification.verificationLevel === "close"
                                ? "惜しかった。かなり近い"
                                : p.verification.verificationLevel === "partial"
                                  ? "部分的に当たりました"
                                  : p.verification.verificationLevel === "opposite"
                                    ? "正反対でした。あなたの中で何かが変わった？"
                                    : p.verification.status === "correct"
                                      ? "的中しました"
                                      : p.verification.status === "partially_correct"
                                        ? "部分的に当たりました"
                                        : "外れましたが、それもデータです"}
                          </p>
                          {p.verification.userNote && (
                            <p
                              className="text-xs font-body mt-1 italic"
                              style={{ color: "rgba(100,105,130,0.5)" }}
                            >
                              {p.verification.userNote}
                            </p>
                          )}
                          <p
                            className="text-xs font-body mt-2"
                            style={{ color: "rgba(100,105,130,0.45)" }}
                          >
                            {p.alternativeOutcome}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </GlassCard>
                );
              })}
            </div>
          </div>
        </FadeInView>
      )}

      {/* Bottom spacer for safe area */}
      <div className="h-16" />
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Past prophecy inline verifier
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function PastProphecyVerifier({
  prophecy,
  onVerify,
}: {
  prophecy: StoredProphecy;
  onVerify: (answer: string, note: string) => void;
}) {
  const [answer, setAnswer] = useState<string | null>(null);
  const [note, setNote] = useState("");

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mt-3 pt-3 border-t"
      style={{ borderColor: "rgba(160,170,200,0.15)" }}
      onClick={(e) => e.stopPropagation()}
    >
      <p
        className="text-xs font-body mb-3"
        style={{ color: "rgba(100,105,130,0.6)" }}
      >
        この予言を検証できます
      </p>
      <div className="space-y-1.5 mb-3">
        {QUICK_ANSWERS[prophecy.category].map((a) => (
          <button
            key={a}
            onClick={(e) => {
              e.stopPropagation();
              setAnswer(a);
            }}
            className={`w-full text-left text-xs font-body px-3 py-2 rounded-xl border transition-all ${
              answer === a
                ? "bg-indigo-50 border-indigo-300 text-indigo-800"
                : "bg-white/50 border-slate-200/50 text-slate-500 hover:bg-white/70"
            }`}
          >
            {a}
          </button>
        ))}
      </div>
      <GlassInput
        placeholder="補足メモ（任意）"
        value={note}
        onChange={(v) => setNote(v)}
        size="sm"
        className="mb-3"
      />
      <GlassButton
        variant="primary"
        size="sm"
        fullWidth
        disabled={!answer}
        onClick={() => {
          if (answer) onVerify(answer, note);
        }}
      >
        検証する
      </GlassButton>
    </motion.div>
  );
}
