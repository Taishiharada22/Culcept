// app/stargazer/_components/AccuracyDecayWarning.tsx
// 理解度低下の警告バナー — 非活動期間に応じた緊急度表示
"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";

// ── Props ────────────────────────────────────────────

interface Props {
  daysSinceLastObservation: number;
  percentageLost: number;
  currentLevel: number;
  onResumeObservation?: () => void;
}

// ── 緊急度レベル ─────────────────────────────────────

type UrgencyLevel = "low" | "medium" | "high";

function getUrgency(days: number): UrgencyLevel {
  if (days >= 6) return "high";
  if (days >= 3) return "medium";
  return "low";
}

const URGENCY_STYLES: Record<
  UrgencyLevel,
  {
    bg: string;
    border: string;
    text: string;
    accent: string;
    icon: string;
    ringColor: string;
  }
> = {
  low: {
    bg: "bg-amber-50/80",
    border: "border-amber-200/60",
    text: "text-amber-800",
    accent: "text-amber-500",
    icon: "!",
    ringColor: "#f59e0b",
  },
  medium: {
    bg: "bg-orange-50/80",
    border: "border-orange-300/60",
    text: "text-orange-800",
    accent: "text-orange-500",
    icon: "!!",
    ringColor: "#f97316",
  },
  high: {
    bg: "bg-red-50/80",
    border: "border-red-300/60",
    text: "text-red-800",
    accent: "text-red-500",
    icon: "!!!",
    ringColor: "#ef4444",
  },
};

// ── 減少リングアニメーション ─────────────────────────

function DecayRing({
  currentLevel,
  percentageLost,
  urgency,
}: {
  currentLevel: number;
  percentageLost: number;
  urgency: UrgencyLevel;
}) {
  const size = 56;
  const strokeWidth = 4;
  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;

  // 元のレベル（減衰前）
  const originalLevel = Math.min(95, currentLevel + percentageLost);
  const originalOffset = circumference * (1 - originalLevel / 100);
  const currentOffset = circumference * (1 - currentLevel / 100);

  const style = URGENCY_STYLES[urgency];

  return (
    <div
      className="relative inline-flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        style={{ transform: "rotate(-90deg)" }}
      >
        {/* トラック */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={strokeWidth}
        />

        {/* 失われた部分（ゴースト） */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={style.ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeOpacity={0.2}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: originalOffset }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />

        {/* 現在の値（逆アニメーション: 元のレベル → 現在のレベルへ縮小） */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={style.ringColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: originalOffset }}
          animate={{ strokeDashoffset: currentOffset }}
          transition={{ duration: 2, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>

      {/* 中央パーセント */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="text-xs font-bold tabular-nums"
          style={{ color: style.ringColor }}
        >
          -{percentageLost}
        </span>
      </div>
    </div>
  );
}

// ── メインコンポーネント ─────────────────────────────

export default function AccuracyDecayWarning({
  daysSinceLastObservation,
  percentageLost,
  currentLevel,
  onResumeObservation,
}: Props) {
  // 減衰がなければ表示しない
  if (daysSinceLastObservation < 1 || percentageLost <= 0) return null;

  const urgency = getUrgency(daysSinceLastObservation);
  const style = URGENCY_STYLES[urgency];

  // メッセージ
  const getMessage = (): string => {
    if (urgency === "high") {
      return `${daysSinceLastObservation}日間の未観測により、理解精度が大幅に低下しています`;
    }
    if (urgency === "medium") {
      return `理解度が${percentageLost}%低下しました。このままでは観測精度が失われます`;
    }
    return `${daysSinceLastObservation}日間未観測。理解度が緩やかに低下しています`;
  };

  // シェイクアニメーション (high urgency)
  const shakeAnimation =
    urgency === "high"
      ? {
          x: [0, -3, 3, -2, 2, 0],
          transition: {
            duration: 0.22,
            delay: 1,
            repeat: 2,
            repeatDelay: 3,
          },
        }
      : {};

  // パルスアニメーション (medium urgency)
  const pulseAnimation =
    urgency === "medium"
      ? {
          boxShadow: [
            "0 0 0 0 rgba(249, 115, 22, 0)",
            "0 0 0 4px rgba(249, 115, 22, 0.15)",
            "0 0 0 0 rgba(249, 115, 22, 0)",
          ],
          transition: { duration: 2, repeat: Infinity },
        }
      : {};

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{
          opacity: 1,
          y: 0,
          ...shakeAnimation,
          ...pulseAnimation,
        }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className={`rounded-2xl border backdrop-blur-sm overflow-hidden ${style.bg} ${style.border}`}
      >
        <div className="px-4 py-3.5">
          <div className="flex items-center gap-3">
            {/* 減少リング */}
            <DecayRing
              currentLevel={currentLevel}
              percentageLost={percentageLost}
              urgency={urgency}
            />

            {/* テキスト */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <motion.span
                  className={`text-sm font-bold ${style.accent}`}
                  animate={
                    urgency !== "low"
                      ? { opacity: [1, 0.4, 1] }
                      : {}
                  }
                  transition={
                    urgency !== "low"
                      ? { duration: 1.5, repeat: Infinity }
                      : {}
                  }
                >
                  {style.icon}
                </motion.span>
                <span className={`text-sm font-bold ${style.text}`}>
                  理解度が低下しています
                </span>
              </div>
              <p className={`text-xs leading-relaxed ${style.text} opacity-80`}>
                {getMessage()}
              </p>
            </div>
          </div>

          {/* CTA ボタン */}
          <div className="mt-3">
            <GlassButton
              variant="primary"
              size="sm"
              fullWidth
              onClick={onResumeObservation}
              className="!rounded-xl"
            >
              観測を再開して精度を回復する
            </GlassButton>
          </div>

          {/* 追加の緊急メッセージ (high) */}
          {urgency === "high" && (
            <motion.p
              className="mt-2 text-[10px] text-red-500/70 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 2 }}
            >
              * 放置すると最低10%まで低下します。早期の回復をお勧めします
            </motion.p>
          )}
        </div>

        {/* 底部プログレス（減衰の深刻度を視覚化） */}
        <div className="h-1 bg-black/5">
          <motion.div
            className="h-full"
            style={{
              background:
                urgency === "high"
                  ? "linear-gradient(90deg, #ef4444, #dc2626)"
                  : urgency === "medium"
                    ? "linear-gradient(90deg, #f97316, #ea580c)"
                    : "linear-gradient(90deg, #f59e0b, #d97706)",
            }}
            initial={{ width: 0 }}
            animate={{
              width: `${Math.min(100, (percentageLost / 30) * 100)}%`,
            }}
            transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
