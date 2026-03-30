"use client";

import Link from "next/link";
import { motion } from "framer-motion";

interface Props {
  onScrollToDepth?: () => void;
}

export default function DeepDiveEntry({ onScrollToDepth }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6, duration: 0.4 }}
      className="px-4 flex gap-3"
    >
      <Link
        href="/stargazer"
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all"
        style={{
          background: "rgba(99,102,241,0.08)",
          color: "rgba(99,102,241,0.85)",
          border: "1px solid rgba(99,102,241,0.12)",
        }}
      >
        🔭 深層観測を続ける
      </Link>
      <button
        onClick={onScrollToDepth}
        className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold transition-all"
        style={{
          background: "rgba(139,92,246,0.08)",
          color: "rgba(139,92,246,0.85)",
          border: "1px solid rgba(139,92,246,0.12)",
        }}
      >
        🪞 自分を深く見る
      </button>
    </motion.div>
  );
}
