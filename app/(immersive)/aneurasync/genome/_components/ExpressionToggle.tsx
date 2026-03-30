"use client";

import { motion } from "framer-motion";
import type { ExpressionMode } from "../hooks/useGenomeExpression";

interface ExpressionToggleProps {
  mode: ExpressionMode;
  onToggle: () => void;
  expressedCount: number;
  dormantCount: number;
}

/**
 * Toggle between viewing all genes vs only expressed (active) genes.
 * Shows counts for each mode.
 */
export default function ExpressionToggle({
  mode,
  onToggle,
  expressedCount,
  dormantCount,
}: ExpressionToggleProps) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onToggle}
        className="relative flex h-8 w-[140px] items-center rounded-full border border-white/60 bg-white/50 p-0.5 backdrop-blur-sm transition"
      >
        <motion.div
          className="absolute h-7 w-[68px] rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
          animate={{ x: mode === "all" ? 0 : 68 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        />
        <span
          className={`relative z-10 flex-1 text-center text-[11px] font-bold ${
            mode === "all" ? "text-white" : "text-slate-500"
          }`}
        >
          全遺伝子
        </span>
        <span
          className={`relative z-10 flex-1 text-center text-[11px] font-bold ${
            mode === "expressed" ? "text-white" : "text-slate-500"
          }`}
        >
          発現中
        </span>
      </button>

      <div className="flex items-center gap-2 text-[10px]">
        <span className="text-violet-500 font-semibold">{expressedCount} 発現</span>
        <span className="text-slate-400">/</span>
        <span className="text-slate-400">{dormantCount} 休眠</span>
      </div>
    </div>
  );
}
