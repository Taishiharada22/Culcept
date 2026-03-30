"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

type Props = {
  /** 表示テキスト（なければデフォルトの「...」） */
  text?: string;
  /** 遷移時間(ms) */
  durationMs?: number;
  /** 完了コールバック */
  onComplete: () => void;
};

export default function MemoryTransition({
  text,
  durationMs = 1200,
  onComplete,
}: Props) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 300); // exit animation
    }, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, onComplete]);

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex h-full min-h-[200px] items-center justify-center"
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        className="flex flex-col items-center gap-3"
      >
        {/* Breathing dot */}
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="h-3 w-3 rounded-full bg-amber-400/70"
        />
        {text && (
          <p className="text-sm text-gray-500 italic">{text}</p>
        )}
      </motion.div>
    </motion.div>
  );
}
