"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface EvidenceTooltipProps {
  /** What data source contributed to this trait */
  sources: Array<{
    type: "stargazer" | "bodycolor" | "swipe" | "match" | "calendar";
    label: string;
    count: number;
  }>;
  /** Total observations */
  totalObservations: number;
  children: React.ReactNode;
}

const SOURCE_ICONS: Record<string, string> = {
  stargazer: "✦",
  bodycolor: "🎨",
  swipe: "👆",
  match: "💫",
  calendar: "📅",
};

/**
 * Wraps a trait element with a tap-to-reveal evidence breakdown.
 * Shows "why this value" — the observation sources behind each base pair.
 */
export default function EvidenceTooltip({
  sources,
  totalObservations,
  children,
}: EvidenceTooltipProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <div
        onClick={() => setOpen(!open)}
        className="cursor-pointer"
        role="button"
        aria-expanded={open}
        aria-label="観測根拠を表示"
      >
        {children}
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute left-0 right-0 top-full z-20 mt-2 rounded-[20px] border border-white/90 bg-white/95 p-4 shadow-[0_12px_36px_rgba(0,0,0,0.1)] backdrop-blur-xl"
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2 }}
          >
            <div className="text-xs font-semibold text-slate-700">
              なぜこの値？
            </div>
            <div className="mt-1 text-[11px] text-slate-400">
              {totalObservations}件の観測に基づく推定
            </div>

            <div className="mt-3 space-y-2">
              {sources.map((src) => (
                <div
                  key={src.type}
                  className="flex items-center gap-2 text-xs"
                >
                  <span>{SOURCE_ICONS[src.type] ?? "📊"}</span>
                  <span className="flex-1 text-slate-600">{src.label}</span>
                  <span className="font-semibold text-slate-500">
                    {src.count}件
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setOpen(false); }}
              className="mt-3 w-full rounded-xl bg-slate-50 py-2 text-center text-xs text-slate-400 transition hover:bg-slate-100"
            >
              閉じる
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
