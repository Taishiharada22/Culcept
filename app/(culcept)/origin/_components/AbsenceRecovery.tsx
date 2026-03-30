"use client";

import { motion } from "framer-motion";

interface Props {
  emoji: string;
  title: string;
  body: string;
  onDismiss: () => void;
}

/**
 * 3日以上不在時の「お帰りなさい」メッセージ
 */
export default function AbsenceRecovery({
  emoji,
  title,
  body,
  onDismiss,
}: Props) {
  return (
    <motion.div
      className="fixed inset-0 z-[55] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
    >
      <div className="absolute inset-0 bg-black/10" onClick={onDismiss} />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-4 rounded-3xl border border-amber-200/40 bg-white/90 px-8 py-8 shadow-xl backdrop-blur-lg"
        initial={{ scale: 0.9, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
      >
        <span className="text-4xl">{emoji}</span>
        <h3
          className="text-lg font-semibold"
          style={{ color: "#3a2a1a" }}
        >
          {title}
        </h3>
        <p className="max-w-xs text-center text-sm leading-relaxed text-gray-600">
          {body}
        </p>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onDismiss}
          className="mt-2 rounded-2xl bg-gradient-to-r from-amber-400 to-orange-400 px-6 py-2.5 text-sm font-semibold text-white shadow-md shadow-amber-500/20"
        >
          続ける
        </motion.button>
      </motion.div>
    </motion.div>
  );
}
