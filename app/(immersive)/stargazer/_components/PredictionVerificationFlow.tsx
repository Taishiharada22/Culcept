// app/stargazer/_components/PredictionVerificationFlow.tsx
// 予測検証フロー — 過去の予測を検証し、精度を追跡するコンポーネント
// "予言が当たった瞬間、ユーザーはこのアプリを「怖い」と感じる"
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
} from "@/components/ui/glassmorphism-design";
import type {
  Prediction,
  PredictionFeedback,
} from "@/lib/stargazer/predictionEngine";

// ── Props ────────────────────────────────────────────

interface Props {
  predictions: Prediction[];
  onVerify: (id: string, feedback: PredictionFeedback) => void;
  accuracyRate: number;
}

// ── Celebration Particles ────────────────────────────

function CelebrationParticles() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    x: Math.cos((i / 12) * Math.PI * 2) * 60 + (Math.random() - 0.5) * 20,
    y: Math.sin((i / 12) * Math.PI * 2) * 60 + (Math.random() - 0.5) * 20,
    scale: 0.5 + Math.random() * 0.8,
    delay: i * 0.03,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none flex items-center justify-center overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{ background: "rgba(234,179,8,0.8)" }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
          animate={{
            x: p.x,
            y: p.y,
            opacity: 0,
            scale: p.scale,
          }}
          transition={{
            duration: 0.4,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

// ── Learning Pulse Animation ─────────────────────────

function LearningPulse() {
  return (
    <motion.div
      className="absolute inset-0 rounded-3xl pointer-events-none"
      style={{
        background:
          "radial-gradient(ellipse at center, rgba(99,102,241,0.08), transparent 70%)",
      }}
      animate={{ opacity: [0, 0.6, 0] }}
      transition={{ duration: 1.2, ease: "easeInOut" }}
    />
  );
}

// ── Trend Arrow ──────────────────────────────────────

function TrendArrow({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "stable") return null;

  return (
    <motion.span
      initial={{ opacity: 0, y: trend === "up" ? 4 : -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex ml-1"
      style={{
        color: trend === "up" ? "rgba(16,185,129,0.9)" : "rgba(239,68,68,0.7)",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
        {trend === "up" ? (
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        )}
      </svg>
    </motion.span>
  );
}

// ── Animated Counter ─────────────────────────────────

function AnimatedAccuracy({
  rate,
  previousRate,
}: {
  rate: number;
  previousRate?: number;
}) {
  const displayRate = Math.round(rate * 100);
  const trend: "up" | "down" | "stable" =
    previousRate === undefined
      ? "stable"
      : rate > previousRate + 0.02
        ? "up"
        : rate < previousRate - 0.02
          ? "down"
          : "stable";

  return (
    <div className="flex items-center gap-2">
      <span
        className="text-xs font-medium"
        style={{ color: "rgba(100,116,139,0.7)" }}
      >
        現在の的中率
      </span>
      <motion.span
        key={displayRate}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-sm font-bold tabular-nums"
        style={{ color: "rgba(139,92,246,0.9)" }}
      >
        {displayRate}%
      </motion.span>
      <TrendArrow trend={trend} />
    </div>
  );
}

// ── Result Message ───────────────────────────────────

const RESULT_MESSAGES: Record<
  PredictionFeedback,
  { message: string; sub: string; color: string }
> = {
  correct: {
    message: "的中！",
    sub: "あなたの理解度が +2% 上がりました",
    color: "rgba(16,185,129,0.9)",
  },
  partially: {
    message: "惜しい。",
    sub: "次の予測はより精度が上がります",
    color: "rgba(245,158,11,0.9)",
  },
  wrong: {
    message: "外れました。",
    sub: "でもこの結果が次の予測を賢くします",
    color: "rgba(148,163,184,0.7)",
  },
};

// ── Main Component ───────────────────────────────────

export default function PredictionVerificationFlow({
  predictions,
  onVerify,
  accuracyRate,
}: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [submittedFeedback, setSubmittedFeedback] = useState<
    Record<string, PredictionFeedback>
  >({});
  const [previousRate, setPreviousRate] = useState<number | undefined>(
    undefined,
  );

  const pending = predictions.filter(
    (p) => !p.verified && !submittedFeedback[p.id],
  );

  const handleVerify = useCallback(
    (id: string, feedback: PredictionFeedback) => {
      setPreviousRate(accuracyRate);
      setSubmittedFeedback((prev) => ({ ...prev, [id]: feedback }));
      onVerify(id, feedback);

      // Auto-advance after delay
      setTimeout(() => {
        setCurrentIndex((prev) => prev + 1);
      }, 2500);
    },
    [onVerify, accuracyRate],
  );

  if (pending.length === 0 && Object.keys(submittedFeedback).length === 0) {
    return null;
  }

  const currentPrediction = pending[0];
  const justSubmitted =
    currentPrediction && submittedFeedback[currentPrediction?.id];
  const allDone = pending.length === 0;

  // Show recently submitted results
  const recentlySubmitted = predictions.filter(
    (p) => submittedFeedback[p.id] && !pending.includes(p),
  );

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[11px]"
            style={{
              background: "rgba(139,92,246,0.1)",
              color: "rgba(139,92,246,0.8)",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          </div>
          <span
            className="text-sm font-semibold"
            style={{ color: "rgba(15,23,42,0.85)" }}
          >
            予測の検証
          </span>
          {pending.length > 0 && (
            <GlassBadge variant="warning" size="sm">
              {pending.length}件
            </GlassBadge>
          )}
        </div>
        <AnimatedAccuracy rate={accuracyRate} previousRate={previousRate} />
      </div>

      {/* Current verification card */}
      <AnimatePresence mode="wait">
        {currentPrediction && !allDone && (
          <motion.div
            key={currentPrediction.id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
          >
            <GlassCard
              variant="gradient"
              padding="none"
              hoverEffect={false}
              className="relative overflow-hidden"
            >
              {/* Celebration particles on correct */}
              {submittedFeedback[currentPrediction.id] === "correct" && (
                <CelebrationParticles />
              )}

              {/* Learning pulse on wrong */}
              {submittedFeedback[currentPrediction.id] === "wrong" && (
                <LearningPulse />
              )}

              <div className="relative p-5 space-y-4">
                {/* Prompt */}
                <p
                  className="text-xs font-semibold"
                  style={{ color: "rgba(139,92,246,0.7)" }}
                >
                  昨日の予測を検証しましょう
                </p>

                {/* Prediction text with quotation styling */}
                <div
                  className="relative pl-4 py-1"
                  style={{
                    borderLeft: "2px solid rgba(139,92,246,0.3)",
                  }}
                >
                  <p
                    className="text-sm leading-relaxed font-medium italic"
                    style={{ color: "rgba(15,23,42,0.85)" }}
                  >
                    &ldquo;{currentPrediction.prediction}&rdquo;
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <GlassBadge variant="info" size="sm">
                      {currentPrediction.category}
                    </GlassBadge>
                    <span
                      className="text-[10px]"
                      style={{ color: "rgba(100,116,139,0.5)" }}
                    >
                      {new Date(currentPrediction.createdAt).toLocaleDateString(
                        "ja-JP",
                        { month: "short", day: "numeric" },
                      )}
                    </span>
                  </div>
                </div>

                {/* Confidence bar */}
                <div>
                  <div
                    className="h-1 rounded-full overflow-hidden"
                    style={{ background: "rgba(148,163,184,0.1)" }}
                  >
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${currentPrediction.confidence * 100}%`,
                        background: "rgba(139,92,246,0.4)",
                      }}
                    />
                  </div>
                  <p
                    className="text-[10px] mt-1"
                    style={{ color: "rgba(148,163,184,0.5)" }}
                  >
                    確信度 {Math.round(currentPrediction.confidence * 100)}%
                  </p>
                </div>

                {/* Verification buttons or result */}
                <AnimatePresence mode="wait">
                  {!submittedFeedback[currentPrediction.id] ? (
                    <motion.div
                      key="buttons"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      className="space-y-2"
                    >
                      <p
                        className="text-xs font-semibold"
                        style={{ color: "rgba(15,23,42,0.7)" }}
                      >
                        この予測、当たりましたか？
                      </p>
                      <div className="flex gap-2">
                        <VerifyButton
                          label="当たった"
                          icon="check"
                          color="rgba(16,185,129,0.12)"
                          textColor="rgba(5,150,105,1)"
                          onClick={() =>
                            handleVerify(currentPrediction.id, "correct")
                          }
                        />
                        <VerifyButton
                          label="まあまあ"
                          icon="triangle"
                          color="rgba(245,158,11,0.10)"
                          textColor="rgba(180,120,0,1)"
                          onClick={() =>
                            handleVerify(currentPrediction.id, "partially")
                          }
                        />
                        <VerifyButton
                          label="外れた"
                          icon="cross"
                          color="rgba(239,68,68,0.08)"
                          textColor="rgba(220,38,38,0.8)"
                          onClick={() =>
                            handleVerify(currentPrediction.id, "wrong")
                          }
                        />
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="result"
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 25,
                      }}
                    >
                      <ResultMessage
                        feedback={submittedFeedback[currentPrediction.id]}
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* All done message */}
        {allDone && Object.keys(submittedFeedback).length > 0 && (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GlassCard variant="default" padding="sm" hoverEffect={false}>
              <div className="flex items-center gap-3">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: "rgba(16,185,129,0.1)" }}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="rgba(16,185,129,0.8)"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "rgba(15,23,42,0.85)" }}
                  >
                    検証完了
                  </p>
                  <p
                    className="text-xs"
                    style={{ color: "rgba(100,116,139,0.6)" }}
                  >
                    {Object.keys(submittedFeedback).length}件の予測を検証しました
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Result Message ───────────────────────────────────

function ResultMessage({ feedback }: { feedback: PredictionFeedback }) {
  const config = RESULT_MESSAGES[feedback];
  return (
    <div
      className="flex items-center gap-3 rounded-xl px-4 py-3"
      style={{
        background: config.color.replace(/[\d.]+\)$/, "0.06)"),
      }}
    >
      <motion.div
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        <FeedbackIcon feedback={feedback} />
      </motion.div>
      <div>
        <p className="text-sm font-bold" style={{ color: config.color }}>
          {config.message}
        </p>
        <p
          className="text-xs mt-0.5"
          style={{ color: "rgba(100,116,139,0.7)" }}
        >
          {config.sub}
        </p>
      </div>
    </div>
  );
}

// ── Feedback Icon ────────────────────────────────────

function FeedbackIcon({ feedback }: { feedback: PredictionFeedback }) {
  const color = RESULT_MESSAGES[feedback].color;

  if (feedback === "correct") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <polyline points="20 6 9 17 4 12" />
      </svg>
    );
  }
  if (feedback === "partially") {
    return (
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2L2 22h20L12 2z" />
      </svg>
    );
  }
  return (
    <svg
      width="20"
      height="20"
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
  );
}

// ── Verify Button ────────────────────────────────────

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
      className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs font-semibold transition-colors"
      style={{ background: color, color: textColor }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      {icons[icon]}
      {label}
    </motion.button>
  );
}
