"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import {
  LEARNED_PATTERN_OPTIONS,
  PATTERN_RATINGS,
  PHASE6_COPY,
  type PatternRating,
} from "@/lib/origin/v7/deepFlowQuestions";

type Props = {
  initialRatings?: Record<string, PatternRating>;
  onComplete: (ratings: Record<string, PatternRating>) => void;
};

export default function LearnedPatternStep({
  initialRatings,
  onComplete,
}: Props) {
  const [ratings, setRatings] = useState<Record<string, PatternRating>>(
    initialRatings ?? {},
  );

  const handleRate = (patternId: string, rating: PatternRating) => {
    setRatings((prev) => ({ ...prev, [patternId]: rating }));
  };

  const ratedCount = Object.keys(ratings).length;
  const hasEnough = ratedCount >= 3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Phase 6</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {PHASE6_COPY.heading}
        </h2>
        <p className="mt-1 text-xs text-gray-400">{PHASE6_COPY.sub}</p>
      </div>

      <p className="text-center text-[10px] text-gray-400">
        それぞれについて「近い / 少し近い / 違う」で答えてください（最低3つ）
      </p>

      <div className="flex flex-col gap-2">
        {LEARNED_PATTERN_OPTIONS.map((pattern) => {
          const current = ratings[pattern.id];
          return (
            <div
              key={pattern.id}
              className="flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2.5 ring-1 ring-gray-200/20"
            >
              <span className="text-sm">{pattern.icon}</span>
              <span className="flex-1 text-xs text-gray-700">
                {pattern.label}
              </span>
              <div className="flex gap-1">
                {PATTERN_RATINGS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => handleRate(pattern.id, r.id)}
                    className={`rounded-lg px-2 py-1 text-[10px] transition-all ${
                      current === r.id
                        ? "bg-amber-400/80 text-white shadow-sm"
                        : "bg-gray-100/50 text-gray-400 hover:bg-gray-100"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onComplete(ratings)}
        disabled={!hasEnough}
        className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90 disabled:opacity-40"
      >
        次へ（{ratedCount}/{LEARNED_PATTERN_OPTIONS.length}）
      </motion.button>
    </motion.div>
  );
}
