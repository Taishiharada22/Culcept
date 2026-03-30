"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { CurrentPosition } from "@/lib/origin/v7/types";
import {
  generateBridgeText,
  inferRecommendedEntry,
  ENTRY_META,
} from "@/lib/origin/v7/currentPositionData";

type Props = {
  position: CurrentPosition;
  onProceed: () => void;
};

export default function CurrentPositionBridge({ position, onProceed }: Props) {
  const bridgeText = useMemo(
    () => generateBridgeText(position.remains, position.seeking),
    [position],
  );

  const recommended = useMemo(
    () => inferRecommendedEntry(position.remains, position.seeking),
    [position],
  );

  const recMeta = ENTRY_META[recommended];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="flex flex-col items-center gap-6 py-4"
    >
      {/* Bridge text — 接続文 */}
      <div className="max-w-xs text-center">
        {bridgeText.split("\n").map((line, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.4, duration: 0.6 }}
            className="mt-2 text-[13px] leading-[1.8] text-gray-600"
          >
            {line}
          </motion.p>
        ))}
      </div>

      {/* Recommended entry hint */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1.2, duration: 0.4 }}
        className="flex items-center gap-2.5 rounded-xl bg-white/60 px-4 py-3 shadow-sm ring-1 ring-amber-200/20"
      >
        <span className="text-lg">{recMeta.icon}</span>
        <div>
          <p className="text-xs font-medium text-gray-700">{recMeta.label}</p>
          <p className="text-[10px] text-gray-400">{recMeta.guide}</p>
        </div>
      </motion.div>

      {/* Proceed button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        whileTap={{ scale: 0.97 }}
        onClick={onProceed}
        className="rounded-2xl bg-amber-400/80 px-8 py-3 text-sm font-medium text-white shadow-sm hover:bg-amber-400/90"
      >
        断片を探しに行く
      </motion.button>
    </motion.div>
  );
}
