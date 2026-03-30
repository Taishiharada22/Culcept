"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  FACT_GATHERING_QUESTIONS,
  PHASE4_COPY,
  type FlowQuestion,
} from "@/lib/origin/v7/deepFlowQuestions";

type Props = {
  initialAnswers?: Record<string, string>;
  onComplete: (answers: Record<string, string>) => void;
  questions?: FlowQuestion[];
};

export default function FactGatheringStep({
  initialAnswers,
  onComplete,
  questions,
}: Props) {
  const qs = questions ?? FACT_GATHERING_QUESTIONS;
  const [answers, setAnswers] = useState<Record<string, string>>(
    initialAnswers ?? {},
  );

  const handleChange = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const hasContent = Object.values(answers).some((v) => v.trim().length > 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Phase 4</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {PHASE4_COPY.heading}
        </h2>
        <p className="mt-1 text-xs text-gray-400">{PHASE4_COPY.sub}</p>
      </div>

      <div className="flex flex-col gap-4">
        {qs.map((q) => (
          <div key={q.id} className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-gray-700">
              {q.question}
            </p>
            {q.type === "short_text" ? (
              <input
                type="text"
                value={answers[q.id] ?? ""}
                onChange={(e) => handleChange(q.id, e.target.value)}
                placeholder={q.placeholder}
                className="rounded-xl bg-white/70 px-4 py-2.5 text-sm text-gray-700 ring-1 ring-gray-200/40 placeholder:text-gray-300 focus:outline-none focus:ring-amber-300/50"
              />
            ) : q.type === "select" ? (
              <div className="flex flex-wrap gap-1.5">
                {q.options.map((opt) => {
                  const sel = answers[q.id] === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleChange(q.id, opt.id)}
                      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs transition-all ${
                        sel
                          ? "bg-amber-100/70 ring-1 ring-amber-300/40 shadow-sm text-amber-800"
                          : "bg-white/60 ring-1 ring-gray-200/30 text-gray-600 hover:bg-white/80"
                      }`}
                    >
                      <span>{opt.icon}</span>
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onComplete(answers)}
        disabled={!hasContent}
        className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90 disabled:opacity-40"
      >
        次へ
      </motion.button>

      <button
        onClick={() => onComplete(answers)}
        className="mx-auto text-[11px] text-gray-400 hover:text-gray-500"
      >
        スキップする
      </button>
    </motion.div>
  );
}
