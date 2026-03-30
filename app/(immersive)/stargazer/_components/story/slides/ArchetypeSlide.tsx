// Slide 1: ARCHETYPE — あなたのアーキタイプ
"use client";

import { motion } from "framer-motion";
import type { ArchetypeSlideData } from "../storyDataBuilder";
import { useTypingReveal } from "../useTypingReveal";

interface Props {
  data: ArchetypeSlideData;
  onReady: () => void;
}

export default function ArchetypeSlide({ data, onReady }: Props) {
  const label = useTypingReveal(data.archetypeLabel, 80, onReady);

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      {/* Archetype emoji — main visual */}
      <motion.div
        className="text-7xl mb-8"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.15, 1], opacity: 1 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden="true"
      >
        {data.emoji}
      </motion.div>

      {/* Archetype label — main text, typing reveal */}
      <div className="min-h-[2.5rem]">
        <span
          className="text-2xl font-semibold tracking-wide"
          style={{ color: "rgba(255,255,255,0.95)" }}
        >
          {label}
          <motion.span
            className="inline-block w-[2px] h-[1.2em] ml-0.5 align-text-bottom"
            style={{ background: "rgba(255,255,255,0.6)" }}
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse" }}
          />
        </span>
      </div>

      {/* Family info — secondary, always shown even if family is null */}
      <motion.div
        className="mt-5 space-y-1"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.6 }}
      >
        {data.familyName && (
          <p
            className="text-xs tracking-widest uppercase"
            style={{ color: "rgba(255,255,255,0.4)" }}
          >
            {data.familyName}
          </p>
        )}
        {data.familyTagline && (
          <p
            className="text-sm leading-relaxed max-w-[260px]"
            style={{ color: "rgba(255,255,255,0.55)" }}
          >
            {data.familyTagline}
          </p>
        )}
        {/* Fallback when no family info */}
        {!data.familyName && !data.familyTagline && (
          <p
            className="text-sm"
            style={{ color: "rgba(255,255,255,0.45)" }}
          >
            観測から見えたあなたの輪郭
          </p>
        )}
      </motion.div>
    </div>
  );
}
