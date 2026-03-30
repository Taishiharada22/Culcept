"use client";

import { motion } from "framer-motion";
import type { MemoryChapter } from "@/lib/origin/v7/types";
import { deriveBridgeText } from "@/lib/origin/v7/bridgeDerivation";

type Props = {
  fromChapter: MemoryChapter;
  toChapter: MemoryChapter;
};

export default function FormationBridge({ fromChapter, toChapter }: Props) {
  const text = deriveBridgeText(fromChapter, toChapter);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className="flex items-center gap-3 py-1 pl-1"
    >
      <div className="flex h-6 w-6 items-center justify-center">
        <div className="h-1 w-1 rounded-full bg-amber-300/40" />
      </div>
      <p className="text-[10px] italic text-gray-400">
        {text}
      </p>
    </motion.div>
  );
}
