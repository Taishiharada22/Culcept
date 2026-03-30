// app/stargazer/_components/PostOnboardingFeedback.tsx
// 初回オンボーディング完了後のフィードバック回収（3問）
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface FeedbackData {
  impression: string;
  surprise: string;
  discomfort: string;
  submittedAt: string;
}

const FEEDBACK_STORAGE_KEY = "culcept_sg_onboarding_feedback_v1";

function saveFeedbackToLocal(data: FeedbackData) {
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(data));
  } catch { /* silent */ }
}

export function hasSubmittedFeedback(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(FEEDBACK_STORAGE_KEY);
  } catch {
    return false;
  }
}

interface PostOnboardingFeedbackProps {
  onComplete: () => void;
}

export default function PostOnboardingFeedback({ onComplete }: PostOnboardingFeedbackProps) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({ impression: "", surprise: "", discomfort: "" });
  const [submitted, setSubmitted] = useState(false);

  const questions = [
    {
      key: "impression" as const,
      label: "初めて自分の観測結果を見て、どう感じましたか？",
      placeholder: "自由に感じたことを書いてください",
    },
    {
      key: "surprise" as const,
      label: "「意外だ」と思ったことはありましたか？",
      placeholder: "驚きや発見があれば教えてください",
    },
    {
      key: "discomfort" as const,
      label: "しっくりこなかった部分はありますか？",
      placeholder: "違和感やズレがあれば教えてください",
    },
  ];

  const handleSubmit = useCallback(() => {
    const data: FeedbackData = {
      ...answers,
      submittedAt: new Date().toISOString(),
    };
    saveFeedbackToLocal(data);

    // Also try to send to API (best-effort)
    fetch("/api/stargazer/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ type: "post_onboarding", data }),
    }).catch(() => { /* silent - localStorage has it */ });

    setSubmitted(true);
    setTimeout(() => onComplete(), 2000);
  }, [answers, onComplete]);

  const handleSkip = useCallback(() => {
    saveFeedbackToLocal({
      impression: "",
      surprise: "",
      discomfort: "",
      submittedAt: new Date().toISOString(),
    });
    onComplete();
  }, [onComplete]);

  if (submitted) {
    return (
      <motion.div
        className="text-center space-y-4 py-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <motion.div
          className="text-3xl"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", damping: 10 }}
        >
          🙏
        </motion.div>
        <p
          className="font-display text-base"
          style={{ color: "rgba(22,28,48,0.85)" }}
        >
          ありがとうございます
        </p>
        <p
          className="text-sm"
          style={{ color: "rgba(100,105,130,0.55)" }}
        >
          あなたの声が、観測をより深いものにします。
        </p>
      </motion.div>
    );
  }

  const currentQ = questions[step];

  return (
    <motion.div
      className="space-y-6 py-4"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* Header */}
      <div className="text-center space-y-2">
        <span
          className="font-mono-sg text-xs tracking-[0.15em] block"
          style={{ color: "rgba(100,105,130,0.45)" }}
        >
          フィードバック — {step + 1} / {questions.length}
        </span>
        <h3
          className="font-display text-base font-medium"
          style={{ color: "rgba(22,28,48,0.85)" }}
        >
          初めての観測を振り返って
        </h3>
        <p
          className="text-xs"
          style={{ color: "rgba(100,105,130,0.45)" }}
        >
          率直な感想が、観測の精度を上げる力になります
        </p>
      </div>

      {/* Progress */}
      <div className="flex gap-1.5 px-4">
        {questions.map((_, i) => (
          <div
            key={i}
            className="flex-1 h-0.5 rounded-full transition-all duration-300"
            style={{
              background: i <= step
                ? "rgba(170,150,90,0.5)"
                : "rgba(160,170,200,0.15)",
            }}
          />
        ))}
      </div>

      {/* Question */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          <p
            className="font-display text-sm leading-7 px-1"
            style={{ color: "rgba(22,28,48,0.82)" }}
          >
            {currentQ.label}
          </p>
          <textarea
            value={answers[currentQ.key]}
            onChange={(e) =>
              setAnswers((prev) => ({ ...prev, [currentQ.key]: e.target.value }))
            }
            placeholder={currentQ.placeholder}
            rows={3}
            className="w-full rounded-xl px-4 py-3 text-sm resize-none focus:outline-none transition-all"
            style={{
              background: "rgba(248,250,255,0.7)",
              border: "1px solid rgba(160,170,200,0.15)",
              color: "rgba(22,28,48,0.85)",
            }}
          />
        </motion.div>
      </AnimatePresence>

      {/* Actions */}
      <div className="flex gap-3">
        {step < questions.length - 1 ? (
          <>
            <button
              onClick={handleSkip}
              className="flex-1 py-3 rounded-xl text-sm transition-all"
              style={{
                color: "rgba(100,105,130,0.5)",
              }}
            >
              スキップ
            </button>
            <button
              onClick={() => setStep(step + 1)}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "rgba(22,28,48,0.06)",
                border: "1px solid rgba(22,28,48,0.08)",
                color: "rgba(22,28,48,0.8)",
              }}
            >
              次へ →
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSkip}
              className="flex-1 py-3 rounded-xl text-sm transition-all"
              style={{
                color: "rgba(100,105,130,0.5)",
              }}
            >
              スキップ
            </button>
            <button
              onClick={handleSubmit}
              className="flex-1 py-3 rounded-xl text-sm font-medium transition-all"
              style={{
                background: "rgba(22,28,48,0.9)",
                color: "rgba(255,255,255,0.95)",
              }}
            >
              送信する
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}
