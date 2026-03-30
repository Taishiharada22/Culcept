"use client";

import { motion } from "framer-motion";
import { useState, useCallback } from "react";
import {
  INNER_STATE_QUESTIONS,
  PHASE5_COPY,
  type FlowQuestion,
} from "@/lib/origin/v7/deepFlowQuestions";

type Props = {
  initialAnswers?: Record<string, string | string[]>;
  onComplete: (answers: Record<string, string | string[]>) => void;
  questions?: FlowQuestion[];
};

export default function InnerStateStep({ initialAnswers, onComplete, questions }: Props) {
  const qs = questions ?? INNER_STATE_QUESTIONS;
  const [answers, setAnswers] = useState<Record<string, string | string[]>>(
    initialAnswers ?? {},
  );
  const [currentQ, setCurrentQ] = useState(0);

  const question = qs[currentQ];
  const isLast = currentQ === qs.length - 1;

  const handleSelect = useCallback(
    (q: FlowQuestion, optionId: string) => {
      if (q.type === "multi_select") {
        const prev = (answers[q.id] as string[]) ?? [];
        const updated = prev.includes(optionId)
          ? prev.filter((x) => x !== optionId)
          : [...prev, optionId];
        setAnswers((a) => ({ ...a, [q.id]: updated }));
      } else {
        const updated = { ...answers, [q.id]: optionId };
        setAnswers(updated);
        if (!isLast) {
          setTimeout(() => setCurrentQ((p) => p + 1), 300);
        }
      }
    },
    [answers, isLast],
  );

  const handleTextChange = useCallback(
    (id: string, value: string) => {
      setAnswers((prev) => ({ ...prev, [id]: value }));
    },
    [],
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
        <p className="mb-1 text-sm text-gray-500">Phase 5</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {PHASE5_COPY.heading}
        </h2>
        <p className="mt-1 text-xs text-gray-400">{PHASE5_COPY.sub}</p>
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
          <input
            type="text"
            value={(answers[question.id] as string) ?? ""}
            onChange={(e) => handleTextChange(question.id, e.target.value)}
            placeholder={question.placeholder}
            className="rounded-xl bg-white/70 px-4 py-2.5 text-sm text-gray-700 ring-1 ring-gray-200/40 placeholder:text-gray-300 focus:outline-none focus:ring-amber-300/50"
          />
        ) : (
          <div className="flex flex-col gap-2">
            {question.options.map((opt) => {
              const sel =
                question.type === "multi_select"
                  ? ((answers[question.id] as string[]) ?? []).includes(opt.id)
                  : answers[question.id] === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => handleSelect(question, opt.id)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                    sel
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

      {/* Next / Submit button for multi_select or short_text */}
      {(question.type === "multi_select" || question.type === "short_text") && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleNext}
          className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
        >
          {isLast ? "次へ" : "次の質問へ"}
        </motion.button>
      )}

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
