// app/stargazer/_components/PredictionCard.tsx
// 予測カード — アクティブ予測 / 検証待ち / 検証済みの3状態
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence, type PanInfo } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";
import type {
  Prediction,
  PredictionFeedback,
} from "@/lib/stargazer/predictionEngine";

interface PredictionCardProps {
  prediction: Prediction;
  onVerify?: (id: string, feedback: PredictionFeedback) => void;
  showAccuracy?: boolean;
  accuracyRate?: number;
}

// ── 状態判定 ────────────────────────────────────────

type CardState = "active" | "awaiting" | "verified";

function resolveState(p: Prediction): CardState {
  if (p.verified) return "verified";
  if (Date.now() > p.expiresAt) return "awaiting";
  return "active";
}

// ── ラベル / カラー ────────────────────────────────

const FEEDBACK_LABELS: Record<PredictionFeedback, string> = {
  correct: "的中",
  partially: "部分的",
  wrong: "外れ",
};

const FEEDBACK_COLORS: Record<PredictionFeedback, string> = {
  correct: "rgba(16,185,129,0.85)",
  partially: "rgba(245,158,11,0.85)",
  wrong: "rgba(239,68,68,0.75)",
};

function confidenceColor(c: number): string {
  if (c >= 0.7) return "rgba(139,92,246,0.9)";
  if (c >= 0.4) return "rgba(99,102,241,0.7)";
  return "rgba(148,163,184,0.6)";
}

function trendArrow(rate: number, prev?: number): string {
  if (prev === undefined) return "";
  if (rate > prev + 0.05) return " ↑";
  if (rate < prev - 0.05) return " ↓";
  return "";
}

// ── Component ───────────────────────────────────────

export default function PredictionCard({
  prediction,
  onVerify,
  showAccuracy = false,
  accuracyRate,
}: PredictionCardProps) {
  const [submitted, setSubmitted] = useState(false);
  const [swipeX, setSwipeX] = useState(0);
  const [swipeHint, setSwipeHint] = useState<"correct" | "wrong" | null>(null);
  const state = resolveState(prediction);

  const handleVerify = useCallback(
    (feedback: PredictionFeedback) => {
      setSubmitted(true);
      onVerify?.(prediction.id, feedback);
    },
    [onVerify, prediction.id],
  );

  const handleSwipeDrag = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setSwipeX(info.offset.x);
      if (info.offset.x > 40) {
        setSwipeHint("correct");
      } else if (info.offset.x < -40) {
        setSwipeHint("wrong");
      } else {
        setSwipeHint(null);
      }
    },
    [],
  );

  const handleSwipeEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      setSwipeX(0);
      setSwipeHint(null);
      if (info.offset.x > 80) {
        handleVerify("correct");
      } else if (info.offset.x < -80) {
        handleVerify("wrong");
      }
    },
    [handleVerify],
  );

  return (
    <GlassCard
      className="relative overflow-visible"
      variant="gradient"
      padding="none"
      hoverEffect={false}
    >
      {/* 微細なグロー */}
      <motion.div
        className="absolute -inset-px rounded-3xl pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 30% 20%, ${confidenceColor(prediction.confidence)}, transparent 70%)`,
          opacity: 0.08,
        }}
        animate={{ opacity: [0.06, 0.12, 0.06] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative p-5 space-y-4">
        {/* ヘッダー */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <GlassBadge variant="info" size="sm">
              {prediction.type === "weekly_pattern" ? "週間予測" : "今日の予測"}
            </GlassBadge>
            <span
              className="text-[11px] font-medium"
              style={{ color: "rgba(100,116,139,0.7)" }}
            >
              {prediction.category}
            </span>
          </div>

          {showAccuracy && accuracyRate !== undefined && (
            <div className="flex items-center gap-1 shrink-0">
              <span
                className="text-xs font-bold tabular-nums"
                style={{ color: confidenceColor(accuracyRate) }}
              >
                的中率: {Math.round(accuracyRate * 100)}%
              </span>
            </div>
          )}
        </div>

        {/* 予測テキスト */}
        <p
          className="text-sm leading-relaxed font-medium"
          style={{ color: "rgba(15,23,42,0.88)" }}
        >
          {prediction.prediction}
        </p>

        {/* 根拠 */}
        <p
          className="text-[11px] leading-snug"
          style={{ color: "rgba(100,116,139,0.6)" }}
        >
          根拠: {prediction.basedOn}
        </p>

        {/* ── 検証待ち ── */}
        <AnimatePresence mode="wait">
          {state === "awaiting" && !submitted && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-2"
            >
              <p
                className="text-xs font-semibold"
                style={{ color: "rgba(139,92,246,0.8)" }}
              >
                この予測、当たりましたか？
              </p>

              {/* Swipe-to-verify gesture area */}
              <motion.div
                className="relative rounded-xl overflow-hidden touch-pan-y"
                drag="x"
                dragConstraints={{ left: -100, right: 100 }}
                dragElastic={0.3}
                onDrag={handleSwipeDrag}
                onDragEnd={handleSwipeEnd}
                style={{
                  background: swipeHint === "correct"
                    ? "rgba(16,185,129,0.08)"
                    : swipeHint === "wrong"
                      ? "rgba(239,68,68,0.06)"
                      : "rgba(148,163,184,0.04)",
                  border: `1px solid ${
                    swipeHint === "correct"
                      ? "rgba(16,185,129,0.2)"
                      : swipeHint === "wrong"
                        ? "rgba(239,68,68,0.15)"
                        : "rgba(148,163,184,0.08)"
                  }`,
                  transition: "background 0.2s, border-color 0.2s",
                }}
              >
                <div className="flex items-center justify-between px-4 py-3">
                  <span
                    className="text-xs font-medium transition-opacity"
                    style={{
                      color: "rgba(16,185,129,0.7)",
                      opacity: swipeHint === "correct" ? 1 : 0.4,
                    }}
                  >
                    当たった
                  </span>
                  <span
                    className="text-[10px]"
                    style={{ color: "rgba(148,163,184,0.4)" }}
                  >
                    スワイプで検証
                  </span>
                  <span
                    className="text-xs font-medium transition-opacity"
                    style={{
                      color: "rgba(239,68,68,0.7)",
                      opacity: swipeHint === "wrong" ? 1 : 0.4,
                    }}
                  >
                    外れた
                  </span>
                </div>
              </motion.div>

              {/* Button fallback */}
              <div className="flex gap-2">
                <VerifyButton
                  label="当たった"
                  icon="check"
                  color="rgba(16,185,129,0.15)"
                  textColor="rgba(5,150,105,1)"
                  onClick={() => handleVerify("correct")}
                />
                <VerifyButton
                  label="まあまあ"
                  icon="triangle"
                  color="rgba(245,158,11,0.12)"
                  textColor="rgba(180,120,0,1)"
                  onClick={() => handleVerify("partially")}
                />
                <VerifyButton
                  label="外れた"
                  icon="cross"
                  color="rgba(239,68,68,0.10)"
                  textColor="rgba(220,38,38,1)"
                  onClick={() => handleVerify("wrong")}
                />
              </div>
            </motion.div>
          )}

          {/* ── 検証済み ── */}
          {(state === "verified" || submitted) && prediction.userFeedback && (
            <motion.div
              key="result"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            >
              <div
                className="flex items-center gap-2 rounded-xl px-3 py-2"
                style={{
                  background:
                    FEEDBACK_COLORS[prediction.userFeedback]
                      ? FEEDBACK_COLORS[prediction.userFeedback].replace("0.85", "0.08").replace("0.75", "0.08")
                      : "rgba(148,163,184,0.08)",
                }}
              >
                <VerifyIcon feedback={prediction.userFeedback} />
                <span
                  className="text-xs font-bold"
                  style={{
                    color: FEEDBACK_COLORS[prediction.userFeedback] ?? "rgba(100,116,139,0.8)",
                  }}
                >
                  {FEEDBACK_LABELS[prediction.userFeedback]}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 確信度バー */}
        <div className="pt-1">
          <div
            className="h-1 rounded-full overflow-hidden"
            style={{ background: "rgba(148,163,184,0.12)" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: confidenceColor(prediction.confidence) }}
              initial={{ width: 0 }}
              animate={{ width: `${prediction.confidence * 100}%` }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            />
          </div>
          <p
            className="text-[10px] mt-1"
            style={{ color: "rgba(148,163,184,0.5)" }}
          >
            確信度 {Math.round(prediction.confidence * 100)}%
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Sub-components ──────────────────────────────────

function VerifyButton({
  label,
  icon,
  color,
  textColor,
  onClick,
}: {
  label: string;
  icon: "check" | "triangle" | "cross";
  color: string;
  textColor: string;
  onClick: () => void;
}) {
  const icons = {
    check: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ),
    triangle: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2L2 22h20L12 2z" />
      </svg>
    ),
    cross: (
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ),
  };

  return (
    <motion.button
      onClick={onClick}
      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-colors"
      style={{ background: color, color: textColor }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      {icons[icon]}
      {label}
    </motion.button>
  );
}

function VerifyIcon({ feedback }: { feedback: PredictionFeedback }) {
  const color = FEEDBACK_COLORS[feedback] ?? "rgba(148,163,184,0.8)";

  if (feedback === "correct") {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </motion.div>
    );
  }

  if (feedback === "partially") {
    return (
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 22h20L12 2z" />
        </svg>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 15 }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </motion.div>
  );
}
