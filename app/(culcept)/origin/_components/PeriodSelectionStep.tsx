"use client";

import { motion } from "framer-motion";
import { useCallback } from "react";
import { PERIOD_DEFS } from "@/lib/origin/v7/periods";
import type { DraftChapter, LifePeriod } from "@/lib/origin/v7/types";

type Props = {
  draft: DraftChapter;
  onComplete: (update: Partial<DraftChapter>) => void;
};

export default function PeriodSelectionStep({ draft, onComplete }: Props) {
  const handleSelect = useCallback(
    (id: LifePeriod) => {
      onComplete({ period: id });
    },
    [onComplete],
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-6"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Step 1</p>
        <h2 className="text-lg font-semibold text-gray-800">
          どの時期を探索しますか？
        </h2>
        <p className="mt-1 text-xs text-gray-400">
          ざっくりで大丈夫。思い出しやすい時期を選んでください
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {PERIOD_DEFS.map((period, i) => {
          const isSelected = draft.period === period.id;
          return (
            <motion.button
              key={period.id}
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
                delay: i * 0.04,
              }}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleSelect(period.id)}
              className={`
                flex flex-col items-center gap-1 rounded-2xl px-3 py-4
                text-center transition-all duration-200 select-none
                ${
                  isSelected
                    ? "bg-white/90 shadow-lg ring-2 ring-amber-400/60"
                    : "bg-white/60 backdrop-blur-md hover:bg-white/75"
                }
              `}
            >
              <span className="text-2xl">{period.icon}</span>
              <span className="text-sm font-medium text-gray-800">
                {period.label}
              </span>
              <span className="text-[10px] text-gray-400">
                {period.ageHint}
              </span>
            </motion.button>
          );
        })}
      </div>
    </motion.div>
  );
}
