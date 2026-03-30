"use client";

// app/stargazer/_components/MicroEMAPrompt.tsx
// Micro-EMA フルスクリーンオーバーレイ — 瞬間的状態観測プロンプト
// 15秒で自動消滅、5点タップで回答

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { recordResponse, type MicroEMAQuestion } from "@/lib/stargazer/microEMA";

interface MicroEMAPromptProps {
  question: MicroEMAQuestion;
  onComplete: () => void;
  onDismiss: () => void;
}

const SCORE_VALUES = [-1.0, -0.5, 0, 0.5, 1.0] as const;
const AUTO_DISMISS_SECONDS = 15;

export default function MicroEMAPrompt({ question, onComplete, onDismiss }: MicroEMAPromptProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [recorded, setRecorded] = useState(false);
  const [timeLeft, setTimeLeft] = useState(AUTO_DISMISS_SECONDS);

  // Auto-dismiss countdown
  useEffect(() => {
    if (recorded) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => t - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [recorded]);

  // Trigger dismiss when timer runs out (outside of setState)
  useEffect(() => {
    if (timeLeft <= 0 && !recorded) {
      onDismiss();
    }
  }, [timeLeft, recorded, onDismiss]);

  const handleSelect = useCallback((score: number) => {
    if (recorded) return;
    setSelected(score);
    setRecorded(true);
    recordResponse(question.axis, score);
    // Brief feedback then dismiss
    setTimeout(() => {
      onComplete();
    }, 800);
  }, [recorded, question.axis, onComplete]);

  const progressPercent = (timeLeft / AUTO_DISMISS_SECONDS) * 100;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", background: "rgba(8, 10, 22, 0.82)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onDismiss}
      >
        {/* Progress bar at top */}
        <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: "rgba(255,255,255,0.06)" }}>
          <motion.div
            className="h-full"
            style={{ background: "linear-gradient(90deg, rgba(212,175,90,0.7), rgba(180,140,60,0.4))", width: `${progressPercent}%` }}
            animate={{ width: `${progressPercent}%` }}
            transition={{ duration: 0.9, ease: "linear" }}
          />
        </div>

        {/* Card */}
        <motion.div
          className="relative mx-5 w-full max-w-sm rounded-2xl overflow-hidden"
          style={{
            background: "rgba(14, 18, 38, 0.92)",
            border: "1px solid rgba(212,175,90,0.18)",
            boxShadow: "0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(212,175,90,0.08)",
          }}
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 8 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center gap-2 mb-4">
              <span style={{ fontSize: "0.6rem", letterSpacing: "0.15em", color: "rgba(212,175,90,0.7)", textTransform: "uppercase", fontWeight: 600 }}>
                瞬間観測
              </span>
              <span style={{ width: 1, height: 10, background: "rgba(212,175,90,0.2)", display: "inline-block" }} />
              <span style={{ fontSize: "0.6rem", letterSpacing: "0.1em", color: "rgba(255,255,255,0.3)" }}>
                Micro-EMA
              </span>
            </div>

            {/* Question */}
            <AnimatePresence mode="wait">
              {recorded ? (
                <motion.p
                  key="recorded"
                  className="text-center"
                  style={{ fontSize: "1rem", color: "rgba(212,175,90,0.9)", fontWeight: 500, lineHeight: 1.6 }}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  記録しました
                </motion.p>
              ) : (
                <motion.p
                  key="question"
                  className="text-center"
                  style={{ fontSize: "1.05rem", color: "rgba(255,255,255,0.9)", fontWeight: 400, lineHeight: 1.7 }}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: 0.1 }}
                >
                  {question.question}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Response area */}
          {!recorded && (
            <div className="px-6 pb-6 pt-2">
              {/* Labels */}
              <div className="flex justify-between mb-3">
                <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", maxWidth: "38%", lineHeight: 1.4 }}>
                  {question.leftLabel}
                </span>
                <span style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.4)", maxWidth: "38%", lineHeight: 1.4, textAlign: "right" }}>
                  {question.rightLabel}
                </span>
              </div>

              {/* 5 circles */}
              <div className="flex justify-between items-center gap-2">
                {SCORE_VALUES.map((score, i) => {
                  const isCenter = i === 2;
                  const size = isCenter ? 40 : 36;
                  return (
                    <motion.button
                      key={score}
                      onClick={() => handleSelect(score)}
                      className="flex items-center justify-center rounded-full focus:outline-none"
                      style={{
                        width: size,
                        height: size,
                        background: selected === score
                          ? "rgba(212,175,90,0.9)"
                          : isCenter
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(255,255,255,0.04)",
                        border: selected === score
                          ? "1.5px solid rgba(212,175,90,1)"
                          : isCenter
                            ? "1.5px solid rgba(255,255,255,0.15)"
                            : "1px solid rgba(255,255,255,0.08)",
                        flexShrink: 0,
                      }}
                      whileHover={{ scale: 1.1, background: "rgba(212,175,90,0.3)" }}
                      whileTap={{ scale: 0.95 }}
                      transition={{ duration: 0.12 }}
                    >
                      {isCenter && (
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.3)", display: "block" }} />
                      )}
                    </motion.button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dismiss button */}
          {!recorded && (
            <div className="px-6 pb-5 flex justify-center">
              <button
                onClick={onDismiss}
                style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.25)", letterSpacing: "0.08em" }}
                className="hover:text-white/40 transition-colors"
              >
                後で ({timeLeft}秒)
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
