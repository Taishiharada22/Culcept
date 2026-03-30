"use client";

import { motion } from "framer-motion";
import type { NextChallenge } from "@/lib/origin/v7/retention";

interface Props {
  challenge: NextChallenge;
  onAccept: () => void;
}

/**
 * 次のチャレンジ提案カード
 */
export default function NextChallengeCard({ challenge, onAccept }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-indigo-200/30 bg-gradient-to-r from-indigo-50/30 to-purple-50/20 px-4 py-3 backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg shrink-0">{challenge.emoji}</span>
          <div className="min-w-0">
            <p className="text-xs font-semibold" style={{ color: "#3a2a1a" }}>
              {challenge.title}
            </p>
            <p className="mt-0.5 text-[10px] leading-relaxed text-gray-500 truncate">
              {challenge.description}
            </p>
          </div>
        </div>

        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={onAccept}
          className="shrink-0 rounded-full bg-indigo-400/80 px-3 py-1.5 text-[10px] font-semibold text-white shadow-sm min-h-[36px]"
        >
          挑戦する
        </motion.button>
      </div>
    </motion.div>
  );
}
