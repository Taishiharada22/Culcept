// MicroRevealCard.tsx
// マイクロ・リヴィール — 数問ごとに「システムからの返し」を表示
// 段階的に深くなる: 仮説 → パターン確信 → 矛盾指摘 → 核心到達
// insightEmergenceAnimation で深度に応じたアニメーションを適用
"use client";

import { motion } from "framer-motion";
import {
  getEmergenceParams,
  toFramerVariants,
  toCrystallizeCharVariants,
  getGlowEffectCSS,
  getBreathingAnimation,
  type InsightDepth,
} from "@/lib/ui/insightEmergenceAnimation";

export type RevealPhase = "surface" | "pattern" | "contradiction" | "core";

interface Props {
  message: string;
  phase: RevealPhase;
  /** 任意: アーキタイプのほのめかし */
  archetypeHint?: string | null;
  onContinue: () => void;
}

/** RevealPhase → InsightDepth マッピング */
const PHASE_TO_DEPTH: Record<RevealPhase, InsightDepth> = {
  surface: "surface",
  pattern: "intermediate",
  contradiction: "deep",
  core: "core",
};

const PHASE_CONFIG: Record<RevealPhase, { badge: string; emoji: string; glowColor: string }> = {
  surface: {
    badge: "輪郭の発見",
    emoji: "✦",
    glowColor: "rgba(140,120,60,0.15)",
  },
  pattern: {
    badge: "パターン確信",
    emoji: "◈",
    glowColor: "rgba(140,120,60,0.20)",
  },
  contradiction: {
    badge: "矛盾の発見",
    emoji: "↔",
    glowColor: "rgba(180,100,60,0.18)",
  },
  core: {
    badge: "核心に接近",
    emoji: "◉",
    glowColor: "rgba(160,130,60,0.25)",
  },
};

export default function MicroRevealCard({ message, phase, archetypeHint, onContinue }: Props) {
  const config = PHASE_CONFIG[phase];
  const accent = "rgba(140,120,60,0.85)";
  const textPrimary = "rgba(20,25,40,0.90)";

  // Depth-aware animation parameters
  const depth = PHASE_TO_DEPTH[phase];
  const emergenceParams = getEmergenceParams(depth);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const variants = toFramerVariants(emergenceParams) as any;
  const glowCSS = getGlowEffectCSS(emergenceParams);
  const breathing = getBreathingAnimation(depth);

  // For "core" phase, use crystallize (character-by-character) animation
  const isCrystallize = emergenceParams.mode === "crystallize";

  // Button appears after message is readable
  const buttonDelay = emergenceParams.readableAtMs / 1000 + 0.3;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.22 }}
      className="flex flex-col items-center justify-center py-12 px-6 text-center relative"
    >
      {/* Breathing background glow (depth-aware) */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse at 50% 40%, ${config.glowColor}, transparent 70%)`,
        }}
        animate={{
          opacity: [0.5, ...breathing.opacity, 0.5],
          scale: [1, ...breathing.scale, 1],
        }}
        transition={{
          duration: breathing.durationMs / 1000,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Badge */}
      <motion.div
        className="flex items-center gap-2 mb-6"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <span className="text-sm">{config.emoji}</span>
        <span
          className="font-mono-sg text-xs tracking-[0.2em] uppercase"
          style={{ color: accent }}
        >
          {config.badge}
        </span>
      </motion.div>

      {/* Reveal message — depth-aware animation */}
      {isCrystallize ? (
        // Core: character-by-character crystallize
        <motion.p
          className="font-body text-base leading-[1.9] max-w-sm relative z-10"
          style={{ color: textPrimary, ...(glowCSS ?? {}) }}
          variants={variants}
          initial="hidden"
          animate="visible"
        >
          {message.split("").map((char, i) => (
            <motion.span
              key={i}
              variants={toCrystallizeCharVariants(emergenceParams, i) as any}
              initial="hidden"
              animate="visible"
              style={{ display: "inline-block", whiteSpace: char === " " ? "pre" : undefined }}
            >
              {char}
            </motion.span>
          ))}
        </motion.p>
      ) : (
        // Surface/Intermediate/Deep: fade or emerge
        <motion.p
          className="font-body text-base leading-[1.9] max-w-sm relative z-10"
          style={{ color: textPrimary }}
          variants={variants}
          initial="hidden"
          animate="visible"
        >
          {message}
        </motion.p>
      )}

      {/* Archetype hint (if provided) */}
      {archetypeHint && (
        <motion.div
          className="mt-5 px-4 py-2 rounded-xl"
          style={{
            background: "rgba(140,120,60,0.06)",
            border: "1px solid rgba(140,120,60,0.12)",
          }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: buttonDelay - 0.2 }}
        >
          <p
            className="font-display text-sm"
            style={{ color: "rgba(140,120,60,0.7)" }}
          >
            {archetypeHint}
          </p>
        </motion.div>
      )}

      {/* Continue button — appears after message is readable */}
      <motion.button
        onClick={onContinue}
        className="mt-8 px-6 py-3 rounded-xl font-body text-sm font-medium"
        style={{
          background: "rgba(140,120,60,0.08)",
          border: "1px solid rgba(140,120,60,0.18)",
          color: accent,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: buttonDelay }}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        観測を続ける
      </motion.button>
    </motion.div>
  );
}
