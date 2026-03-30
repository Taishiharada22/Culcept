"use client";

import { motion } from "framer-motion";
import { getPeriodLabel } from "@/lib/origin/v7/periods";
import type { MemoryChapter } from "@/lib/origin/v7/types";

type Props = {
  chapter: MemoryChapter;
  isSelected: boolean;
  onClick: () => void;
  index: number;
};

export default function TimelineNode({
  chapter,
  isSelected,
  onClick,
  index,
}: Props) {
  const periodLabel = getPeriodLabel(chapter.fact.period);

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        type: "spring",
        stiffness: 250,
        damping: 22,
        delay: index * 0.08,
      }}
      className="w-full text-left"
    >
      <div
        className={`
          rounded-2xl px-4 py-3 transition-all duration-300 border-l-2
          ${isSelected
            ? "border-l-amber-300/40 bg-white/80 backdrop-blur-sm shadow-md ring-1 ring-amber-200/20"
            : "border-l-amber-200/20 bg-white/55 backdrop-blur-sm shadow-sm hover:bg-white/70 hover:border-l-amber-300/30 hover:shadow-md"}
        `}
      >
        {/* タイトル */}
        <p className="text-[13px] font-bold text-gray-800 leading-snug">
          {chapter.title || periodLabel}
        </p>

        {/* 時期 */}
        <p className="mt-0.5 text-[10px] text-gray-400">
          {periodLabel}
        </p>

        {/* echoes — 1行で軽く */}
        {chapter.echoes.length > 0 && (
          <p className="mt-1.5 text-[10px] text-amber-600/60 line-clamp-1">
            {chapter.echoes.join(" · ")}
          </p>
        )}
      </div>
    </motion.button>
  );
}
