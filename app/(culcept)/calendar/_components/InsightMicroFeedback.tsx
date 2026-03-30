"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Insight } from "../_lib/types";
import { recordInsightFeedback } from "../_lib/bidirectionalFeedback";

interface InsightMicroFeedbackProps {
  insight: Insight;
  date: string;
}

export default function InsightMicroFeedback({ insight, date }: InsightMicroFeedbackProps) {
  const [reaction, setReaction] = React.useState<"agree" | "disagree" | null>(null);
  const [showThanks, setShowThanks] = React.useState(false);

  const handleReaction = (r: "agree" | "disagree") => {
    setReaction(r);
    recordInsightFeedback({
      date,
      insightType: insight.type,
      insightText: insight.text,
      reaction: r,
      timestamp: Date.now(),
    });
    setShowThanks(true);
    setTimeout(() => setShowThanks(false), 1500);
  };

  return (
    <div className="flex items-center gap-1 mt-1">
      <AnimatePresence mode="wait">
        {showThanks ? (
          <motion.span
            key="thanks"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="text-[8px] text-emerald-500 font-medium"
          >
            学習に反映します
          </motion.span>
        ) : reaction ? (
          <motion.span
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-[8px] text-gray-400"
          >
            {reaction === "agree" ? "👍 同意" : "👎 不同意"}
          </motion.span>
        ) : (
          <motion.div key="buttons" className="flex items-center gap-1">
            <span className="text-[7px] text-gray-300 mr-0.5">この分析は？</span>
            <motion.button
              onClick={() => handleReaction("agree")}
              className="text-[8px] text-gray-400 hover:text-emerald-500 bg-white/40 hover:bg-emerald-50/60 rounded-full px-1.5 py-0.5 border border-gray-200/30 hover:border-emerald-200/50 transition-all"
              whileTap={{ scale: 0.9 }}
            >
              👍
            </motion.button>
            <motion.button
              onClick={() => handleReaction("disagree")}
              className="text-[8px] text-gray-400 hover:text-red-400 bg-white/40 hover:bg-red-50/60 rounded-full px-1.5 py-0.5 border border-gray-200/30 hover:border-red-200/50 transition-all"
              whileTap={{ scale: 0.9 }}
            >
              👎
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
