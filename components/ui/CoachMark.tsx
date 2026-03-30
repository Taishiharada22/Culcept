"use client";

import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoachMarkProps {
  title: string;
  description: string;
  onNext: () => void;
  onSkip: () => void;
  step: number;
  totalSteps: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function CoachMark({
  title,
  description,
  onNext,
  onSkip,
  step,
  totalSteps,
}: CoachMarkProps) {
  const isLast = step >= totalSteps;

  return (
    <AnimatePresence>
      <motion.div
        key="coachmark-overlay"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      >
        {/* Card */}
        <motion.div
          className="mx-6 w-full max-w-sm rounded-2xl border border-white/40 bg-white/95 px-6 py-5 shadow-2xl backdrop-blur-xl ring-1 ring-slate-200/50"
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          transition={{ type: "spring", damping: 24, stiffness: 280 }}
        >
          {/* Step dots */}
          <div className="mb-4 flex items-center gap-1.5">
            {Array.from({ length: totalSteps }, (_, i) => (
              <span
                key={i}
                className={`inline-block h-2 w-2 rounded-full transition-colors ${
                  i + 1 === step
                    ? "bg-indigo-500"
                    : i + 1 < step
                      ? "bg-indigo-300"
                      : "bg-slate-200"
                }`}
              />
            ))}
            <span className="ml-auto text-xs text-slate-400">
              {step} / {totalSteps}
            </span>
          </div>

          {/* Content */}
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            {description}
          </p>

          {/* Actions */}
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={onSkip}
              className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
            >
              スキップ
            </button>
            <div className="flex-1" />
            <GlassButton variant="primary" size="md" onClick={onNext}>
              {isLast ? "完了" : "次へ"}
            </GlassButton>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
