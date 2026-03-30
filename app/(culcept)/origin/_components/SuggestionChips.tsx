"use client";

import { motion } from "framer-motion";
import type { Suggestion } from "@/lib/origin/v7/assistedFill";

type Props = {
  suggestions: Suggestion<string | string[]>[];
  onAccept: (value: string | string[]) => void;
};

export default function SuggestionChips({ suggestions, onAccept }: Props) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-1.5">
      <p className="mb-1 text-[10px] text-amber-500/70">💡 推測</p>
      <div className="flex flex-wrap gap-1">
        {suggestions.map((s, i) => (
          <motion.button
            key={`${s.label}-${i}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => onAccept(s.value)}
            className="group rounded-lg border border-amber-200/50 bg-amber-100/50 px-2 py-1 text-left transition-all hover:border-amber-300/60 hover:bg-amber-100/70"
          >
            <span className="text-[11px] text-amber-700/80">{s.label}</span>
            <p className="text-[9px] text-amber-500/50 group-hover:text-amber-500/70">
              {s.reason}
            </p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
