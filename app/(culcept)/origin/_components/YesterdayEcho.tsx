"use client";

import { motion } from "framer-motion";

interface Props {
  date: string;
  answer: string;
  onDismiss: () => void;
}

/**
 * 昨日のエコー — 昨日の記録を表示するカード
 */
export default function YesterdayEcho({ date, answer, onDismiss }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.4 }}
      className="mb-4 rounded-2xl border border-amber-200/40 bg-gradient-to-r from-amber-50/40 to-orange-50/20 px-4 py-3 backdrop-blur-sm"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-[10px] font-medium text-amber-600/60">
            💭 昨日のあなた — {date}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-gray-700">
            {answer}
          </p>
        </div>
        <button
          onClick={onDismiss}
          className="ml-2 text-[10px] text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
