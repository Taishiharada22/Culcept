"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  DAILY_STRUCTURE_QUESTIONS,
  PHASE3_COPY,
  type SelectQuestion,
} from "@/lib/origin/v7/deepFlowQuestions";

type Props = {
  initialAnswers?: Record<string, string>;
  onComplete: (answers: Record<string, string>) => void;
  questions?: SelectQuestion[];
};

export default function DailyStructureStep({
  initialAnswers,
  onComplete,
  questions,
}: Props) {
  const qs = questions ?? DAILY_STRUCTURE_QUESTIONS;
  const [answers, setAnswers] = useState<Record<string, string>>(
    initialAnswers ?? {},
  );
  const [currentQ, setCurrentQ] = useState(0);

  const question = qs[currentQ];
  const isLast = currentQ === qs.length - 1;
  const allAnswered = Object.keys(answers).length === qs.length;

  const handleSelect = (optionId: string) => {
    const updated = { ...answers, [question.id]: optionId };
    setAnswers(updated);

    if (isLast) {
      // All questions answered
      onComplete(updated);
    } else {
      // Auto-advance after selection
      setTimeout(() => setCurrentQ((p) => p + 1), 300);
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
        <p className="mb-1 text-sm text-gray-500">Phase 3</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {PHASE3_COPY.heading}
        </h2>
        <p className="mt-1 text-xs text-gray-400">{PHASE3_COPY.sub}</p>
      </div>

      {/* Progress */}
      <div className="flex gap-1 mx-auto">
        {qs.map((_, i) => (
          <div
            key={i}
            className={`h-1 w-6 rounded-full transition-colors ${
              i <= currentQ ? "bg-amber-400/70" : "bg-gray-200/50"
            }`}
          />
        ))}
      </div>

      {/* Question */}
      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="flex flex-col gap-3"
      >
        <p className="text-sm font-medium text-gray-700 text-center">
          {question.question}
        </p>

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
      </motion.div>

      {/* Back button */}
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
