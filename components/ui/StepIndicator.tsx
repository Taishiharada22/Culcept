"use client";

import { motion } from "framer-motion";

/**
 * ステップインジケーター
 *
 * オンボーディングや複数ステップフローで使用。
 * 現在のステップと全体の進捗を視覚的に表示。
 */

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  labels?: string[];
}

export function StepIndicator({
  currentStep,
  totalSteps,
  labels,
}: StepIndicatorProps) {
  const progress = (currentStep / totalSteps) * 100;

  return (
    <div
      className="w-full"
      role="progressbar"
      aria-valuenow={currentStep}
      aria-valuemin={0}
      aria-valuemax={totalSteps}
      aria-label="進捗"
    >
      {/* Progress bar */}
      <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-2">
        <motion.div
          className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      {/* Step label */}
      <div className="flex justify-between items-center text-xs">
        <span className="text-white/50">
          {labels?.[currentStep - 1] ?? `ステップ ${currentStep}`}
        </span>
        <span className="text-white/30">
          {currentStep} / {totalSteps}
        </span>
      </div>
    </div>
  );
}
