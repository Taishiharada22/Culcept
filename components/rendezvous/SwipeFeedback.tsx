"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ---------- Types ----------

export type SwipeFeedbackType =
  | "good_match"
  | "unexpected"
  | "pattern_break"
  | "neutral";

export type SwipeFeedbackData = {
  type: SwipeFeedbackType;
  message: string;
};

// ---------- Config ----------

const FEEDBACK_CONFIG: Record<
  SwipeFeedbackType,
  { bg: string; border: string; textColor: string }
> = {
  good_match: {
    bg: "bg-emerald-50/90",
    border: "border-emerald-200",
    textColor: "text-emerald-800",
  },
  unexpected: {
    bg: "bg-amber-50/90",
    border: "border-amber-200",
    textColor: "text-amber-800",
  },
  pattern_break: {
    bg: "bg-purple-50/90",
    border: "border-purple-200",
    textColor: "text-purple-800",
  },
  neutral: {
    bg: "bg-white/90",
    border: "border-slate-200",
    textColor: "text-slate-700",
  },
};

const DISPLAY_DURATION = 2000; // ms

// ---------- Component ----------

interface SwipeFeedbackProps {
  feedback: SwipeFeedbackData | null;
  onDismiss: () => void;
}

export default function SwipeFeedback({
  feedback,
  onDismiss,
}: SwipeFeedbackProps) {
  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(onDismiss, DISPLAY_DURATION);
    return () => clearTimeout(timer);
  }, [feedback, onDismiss]);

  return (
    <AnimatePresence>
      {feedback && (
        <motion.div
          key={feedback.message}
          className="fixed bottom-24 left-1/2 z-50 w-[90vw] max-w-sm -translate-x-1/2"
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <div
            className={`
              ${FEEDBACK_CONFIG[feedback.type].bg}
              ${FEEDBACK_CONFIG[feedback.type].border}
              backdrop-blur-xl border rounded-2xl px-5 py-3.5 shadow-lg
            `}
          >
            <p
              className={`text-sm font-medium text-center leading-relaxed ${FEEDBACK_CONFIG[feedback.type].textColor}`}
            >
              {feedback.message}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
