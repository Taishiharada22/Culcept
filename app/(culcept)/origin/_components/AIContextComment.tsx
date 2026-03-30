"use client";

import { motion } from "framer-motion";

interface Props {
  emoji: string;
  text: string;
}

/**
 * 探索ステップ中のインラインAI吹き出し
 */
export default function AIContextComment({ emoji, text }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="mt-3 flex items-start gap-2 rounded-xl bg-indigo-50/40 px-3 py-2"
    >
      <span className="mt-0.5 text-xs">{emoji}</span>
      <p className="text-xs leading-relaxed text-indigo-600/70">{text}</p>
    </motion.div>
  );
}
