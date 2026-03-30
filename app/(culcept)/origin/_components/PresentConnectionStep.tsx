"use client";

import { motion } from "framer-motion";
import { useState, useCallback } from "react";
import {
  PRESENT_CONNECTION_QUESTIONS,
  PHASE7_COPY,
  type FlowQuestion,
} from "@/lib/origin/v7/deepFlowQuestions";

type Props = {
  initialAnswers?: Record<string, string>;
  onComplete: (answers: Record<string, string>) => void;
};

export default function PresentConnectionStep({
  initialAnswers,
  onComplete,
}: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>(
    initialAnswers ?? {},
  );
  const [currentQ, setCurrentQ] = useState(0);

  const question = PRESENT_CONNECTION_QUESTIONS[currentQ];
  const isLast = currentQ === PRESENT_CONNECTION_QUESTIONS.length - 1;

  const handleSelect = useCallback(
    (optionId: string) => {
      const updated = { ...answers, [question.id]: optionId };
      setAnswers(updated);
      if (!isLast) {
        setTimeout(() => setCurrentQ((p) => p + 1), 300);
      }
    },
    [answers, question, isLast],
  );

  const handleTextChange = useCallback(
    (value: string) => {
      setAnswers((prev) => ({ ...prev, [question.id]: value }));
    },
    [question],
  );

  const handleNext = () => {
    if (isLast) {
      onComplete(answers);
    } else {
      setCurrentQ((p) => p + 1);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Phase 7</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {PHASE7_COPY.heading}
        </h2>
        <p className="mt-1 text-xs text-gray-400">{PHASE7_COPY.sub}</p>
      </div>

      {/* Progress */}
      <div className="flex gap-1 mx-auto">
        {PRESENT_CONNECTION_QUESTIONS.map((_, i) => (
          <div
            key={i}
            className={`h-1 w-6 rounded-full transition-colors ${
              i <= currentQ ? "bg-amber-400/70" : "bg-gray-200/50"
            }`}
          />
        ))}
      </div>

      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm font-medium text-gray-700 text-center">
          {question.question}
        </p>

        {question.type === "short_text" ? (
          <>
            <input
              type="text"
              value={answers[question.id] ?? ""}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder={question.placeholder}
              className="rounded-xl bg-white/70 px-4 py-2.5 text-sm text-gray-700 ring-1 ring-gray-200/40 placeholder:text-gray-300 focus:outline-none focus:ring-amber-300/50"
            />
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={handleNext}
              className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
            >
              {isLast ? "次へ — 仮説を見る" : "次の質問へ"}
            </motion.button>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            {question.options.map((opt) => {
              const isSelected = answers[question.id] === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelect(opt.id)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                    isSelected
                      ? "bg-amber-100/70 ring-1 ring-amber-300/40 shadow-sm"
                      : "bg-white/60 ring-1 ring-gray-200/30 hover:bg-white/80"
                  }`}
                >
                  <span className="text-base">{opt.icon}</span>
                  <span className="text-xs text-gray-700">{opt.label}</span>
                </motion.button>
              );
            })}
          </div>
        )}
      </motion.div>

      {currentQ > 0 && (
        <button
          onClick={() => setCurrentQ((p) => p - 1)}
          className="mx-auto text-[11px] text-gray-400 hover:text-gray-500"
        >
          ← 前の質問に戻る
        </button>
      )}
    </motion.div>
  );
}
