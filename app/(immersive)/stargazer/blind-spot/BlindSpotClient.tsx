"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import { trackFeatureView, trackInteraction } from "@/lib/stargazer/trackClient";
import { safeLSSet } from "@/lib/safeLocalStorage";
import {
  generateBlindSpotDrop,
  type BlindSpotDrop,
  type DropCategory,
  type DropTone,
} from "@/lib/stargazer/blindSpotDrop";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_LABELS: Record<DropCategory, string> = {
  mirror_gap: "鏡のズレ",
  contradiction: "矛盾",
  pattern_blind: "パターン盲点",
  shadow_leak: "内在する自分の漏出",
  defense_exposure: "防衛の露出",
  stability_illusion: "安定の幻想",
  condition_blind: "条件盲点",
};

const CATEGORY_ICONS: Record<DropCategory, string> = {
  mirror_gap: "\uD83E\uDE9E",
  contradiction: "\u26A1",
  pattern_blind: "\uD83C\uDF00",
  shadow_leak: "\uD83C\uDF11",
  defense_exposure: "\uD83D\uDEE1\uFE0F",
  stability_illusion: "\uD83C\uDFE0",
  condition_blind: "\uD83D\uDD0D",
};

const TONE_GRADIENTS: Record<DropTone, string> = {
  warm: "from-amber-400/30 via-yellow-300/20 to-orange-400/30",
  harsh: "from-red-500/30 via-purple-600/20 to-rose-500/30",
  neutral: "from-slate-400/30 via-blue-300/20 to-indigo-400/30",
  poetic: "from-violet-400/30 via-fuchsia-300/20 to-purple-400/30",
  clinical: "from-cyan-400/30 via-teal-300/20 to-sky-400/30",
};

const TONE_BORDER_COLORS: Record<DropTone, string> = {
  warm: "border-amber-300/50",
  harsh: "border-red-400/40",
  neutral: "border-blue-300/40",
  poetic: "border-violet-300/50",
  clinical: "border-cyan-300/40",
};

const TONE_GLOW: Record<DropTone, string> = {
  warm: "rgba(217,169,81,0.15)",
  harsh: "rgba(180,60,100,0.12)",
  neutral: "rgba(120,140,200,0.12)",
  poetic: "rgba(167,100,220,0.15)",
  clinical: "rgba(80,180,200,0.12)",
};

type Reaction = "resonated" | "surprised" | "denied" | "reflected";

const REACTIONS: { key: Reaction; emoji: string; label: string }[] = [
  { key: "resonated", emoji: "\uD83D\uDCAB", label: "響いた" },
  { key: "surprised", emoji: "\uD83D\uDE2E", label: "驚いた" },
  { key: "denied", emoji: "\uD83D\uDEE1\uFE0F", label: "否定したい" },
  { key: "reflected", emoji: "\uD83E\uDE9E", label: "考えさせられた" },
];

const STORAGE_KEY = "aneurasync_blind_spot_reaction";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Storage helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface StoredReaction {
  date: string;
  dropId: string;
  reaction: Reaction;
}

function getTodayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function loadReaction(): StoredReaction | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredReaction;
    if (parsed.date === getTodayStr()) return parsed;
    return null;
  } catch {
    return null;
  }
}

function saveReaction(dropId: string, reaction: Reaction) {
  if (typeof window === "undefined") return;
  const data: StoredReaction = {
    date: getTodayStr(),
    dropId,
    reaction,
  };
  safeLSSet(STORAGE_KEY, JSON.stringify(data));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Demo drop generator
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateDemoDrop(): BlindSpotDrop {
  const demoUserId = "demo-user-blind-spot";
  return generateBlindSpotDrop({
    userId: demoUserId,
    axisScores: {
      openness: 0.7,
      conscientiousness: -0.3,
      extraversion: 0.1,
      agreeableness: 0.6,
      neuroticism: -0.5,
      dominance: 0.4,
      warmth: 0.8,
      risk_tolerance: -0.6,
    },
    mirrorScores: {
      openness: { self: 0.7, footprint: 0.2, shadow: 0.1 },
      warmth: { self: 0.8, footprint: 0.3, shadow: 0.4 },
    },
    contradictions: [
      {
        axisId: "openness",
        divergenceType: "self_vs_footprint" as const,
        magnitude: 0.72,
        meaning: "ideal_gap" as const,
        scores: { selfPortrait: 0.7, footprint: 0.2, shadowPlay: 0.1 },
        insight: "開放性において自己申告と行動に乖離がある",
      },
    ],
    recentDropCategories: [],
    observationDepth: 0.45,
    totalSessions: 5,
    archetypeCode: "PEA",
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SVG Fog Clearing Animation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function FogClearingAnimation({ phase }: { phase: "closed" | "clearing" | "clear" }) {
  return (
    <svg width="100%" height="100%" viewBox="0 0 400 300" className="absolute inset-0 pointer-events-none z-20">
      <defs>
        <radialGradient id="fogReveal" cx="50%" cy="50%" r="50%">
          <motion.stop
            offset="0%"
            stopColor="transparent"
            animate={{
              offset: phase === "closed" ? "0%" : phase === "clearing" ? "30%" : "100%",
            }}
            transition={{ duration: 2.5, ease: "easeOut" }}
          />
          <motion.stop
            offset="100%"
            stopColor="rgba(8,10,24,0.92)"
            animate={{
              stopColor: phase === "clear" ? "transparent" : "rgba(8,10,24,0.92)",
            }}
            transition={{ duration: 2.5, ease: "easeOut" }}
          />
        </radialGradient>
        <filter id="fogBlur">
          <feGaussianBlur stdDeviation="8" />
        </filter>
      </defs>

      {/* Fog layers that dissolve */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.rect
          key={i}
          x="0"
          y={i * 60}
          width="400"
          height="80"
          rx="40"
          fill={`rgba(${180 + i * 10}, ${185 + i * 8}, ${200 + i * 5}, ${0.15 - i * 0.02})`}
          filter="url(#fogBlur)"
          animate={{
            opacity: phase === "closed" ? 0.8 : phase === "clearing" ? [0.8, 0.3, 0] : 0,
            x: phase === "clearing" ? [0, i % 2 === 0 ? 60 : -60] : 0,
            scaleY: phase === "clearing" ? [1, 0.3] : phase === "closed" ? 1 : 0,
          }}
          transition={{
            duration: 2 + i * 0.3,
            delay: i * 0.2,
            ease: "easeOut",
          }}
        />
      ))}

      {/* Swirling fog particles */}
      {phase !== "clear" && Array.from({ length: 8 }).map((_, i) => (
        <motion.circle
          key={`particle-${i}`}
          cx={50 + i * 45}
          cy={80 + (i % 3) * 80}
          r={3 + i % 3}
          fill={`rgba(200, 205, 220, ${0.2 + (i % 4) * 0.05})`}
          filter="url(#fogBlur)"
          animate={{
            cx: [50 + i * 45, 70 + i * 40, 50 + i * 45],
            cy: [80 + (i % 3) * 80, 60 + (i % 3) * 70, 80 + (i % 3) * 80],
            opacity: phase === "clearing" ? [0.3, 0] : [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: phase === "clearing" ? 1.5 : 5 + i,
            delay: phase === "clearing" ? i * 0.1 : 0,
            repeat: phase === "clearing" ? 0 : Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Confidence Visualization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ConfidenceReveal({ intensity }: { intensity: number }) {
  const rings = 5;
  const filled = Math.round(intensity * rings);

  return (
    <div className="flex items-center gap-2" aria-label={`確信度: ${Math.round(intensity * 100)}%`}>
      <div className="flex items-center gap-1">
        {Array.from({ length: rings }).map((_, i) => (
          <motion.div
            key={i}
            className="relative"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5 + i * 0.06, duration: 0.22, type: "spring" }}
          >
            <div
              className="w-2 h-2 rounded-full transition-all duration-700"
              style={{
                background: i < filled
                  ? `rgba(176,144,80,${0.5 + (i / rings) * 0.5})`
                  : "rgba(160,170,200,0.15)",
                boxShadow: i < filled
                  ? `0 0 ${4 + i * 2}px rgba(176,144,80,${0.2 + (i / rings) * 0.3})`
                  : "none",
              }}
            />
            {/* Glow ring for active dots */}
            {i < filled && (
              <motion.div
                className="absolute inset-[-2px] rounded-full"
                style={{ border: "1px solid rgba(176,144,80,0.2)" }}
                animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0, 0.3] }}
                transition={{ duration: 2, delay: i * 0.3, repeat: Infinity }}
              />
            )}
          </motion.div>
        ))}
      </div>
      <motion.span
        className="text-xs font-mono-sg"
        style={{ color: `rgba(176,144,80,${0.4 + intensity * 0.4})` }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.4 }}
      >
        {Math.round(intensity * 100)}%
      </motion.span>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Phases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type Phase = "loading" | "pre-reveal" | "fog-clearing" | "reveal" | "reacted" | "already-seen";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sub-components
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Breathing dark overlay with fog metaphor for pre-reveal */
function PreRevealOverlay({ onComplete }: { onComplete: () => void }) {
  const [fogPhase, setFogPhase] = useState<"closed" | "clearing" | "clear">("closed");

  useEffect(() => {
    const t1 = setTimeout(() => setFogPhase("clearing"), 1800);
    const t2 = setTimeout(onComplete, 4000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.22 } }}
      style={{ background: "rgba(8,10,24,0.92)" }}
    >
      {/* Breathing pulse ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 200,
          height: 200,
          border: "1px solid rgba(176,144,80,0.15)",
        }}
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.5, 0.2],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Secondary ring */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 280,
          height: 280,
          border: "1px solid rgba(176,144,80,0.06)",
        }}
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.1, 0.3, 0.1],
        }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
      />

      {/* Fog particles floating */}
      {Array.from({ length: 6 }).map((_, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{
            width: 4 + i * 2,
            height: 4 + i * 2,
            background: `rgba(176,144,80,${0.1 + i * 0.03})`,
            filter: "blur(2px)",
          }}
          animate={{
            x: [Math.cos(i) * 60, Math.cos(i + 2) * 100, Math.cos(i) * 60],
            y: [Math.sin(i) * 50, Math.sin(i + 1) * 80, Math.sin(i) * 50],
            opacity: fogPhase === "clearing" ? [0.3, 0] : [0.1, 0.3, 0.1],
          }}
          transition={{
            duration: fogPhase === "clearing" ? 1.5 : 4 + i,
            repeat: fogPhase === "clearing" ? 0 : Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* Center text */}
      <div className="relative text-center px-8 z-10">
        <motion.p
          className="font-display text-lg tracking-widest"
          style={{ color: "rgba(200,185,150,0.7)" }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.25 }}
        >
          {fogPhase === "clearing" ? "霧が晴れていく..." : "今日の気づきにくい一面..."}
        </motion.p>
        <motion.div
          className="mt-6 mx-auto"
          style={{
            width: 40,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(176,144,80,0.4), transparent)",
          }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ delay: 0.8, duration: 0.4 }}
        />
        {fogPhase === "clearing" && (
          <motion.p
            className="mt-4 text-xs tracking-wider"
            style={{ color: "rgba(200,185,150,0.4)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.22 }}
          >
            見えないものが、見えてくる
          </motion.p>
        )}
      </div>
    </motion.div>
  );
}

/** The main insight card with dramatic reveal */
function DropCard({
  drop,
  selectedReaction,
  onReact,
  isNewReveal,
}: {
  drop: BlindSpotDrop;
  selectedReaction: Reaction | null;
  onReact: (r: Reaction) => void;
  isNewReveal: boolean;
}) {
  const [showThankYou, setShowThankYou] = useState(false);

  const handleReact = (r: Reaction) => {
    onReact(r);
    setShowThankYou(true);
    setTimeout(() => setShowThankYou(false), 2000);
  };

  return (
    <motion.div
      initial={isNewReveal ? { opacity: 0, scale: 0.92, y: 40, filter: "blur(8px)" } : { opacity: 0, scale: 0.95, y: 20 }}
      animate={{ opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }}
      transition={isNewReveal
        ? { duration: 0.25, ease: [0.22, 1, 0.36, 1] }
        : { duration: 0.18, ease: [0.22, 1, 0.36, 1] }
      }
    >
      <GlassCard
        variant="elevated"
        padding="none"
        hoverEffect={false}
        className="relative overflow-hidden"
        style={{
          boxShadow: `0 0 80px ${TONE_GLOW[drop.tone]}, 0 8px 32px rgba(0,0,0,0.06)`,
        }}
      >
        {/* Gradient border overlay */}
        <div
          className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${TONE_GRADIENTS[drop.tone]} pointer-events-none`}
          style={{ opacity: 0.5 }}
        />

        {/* Inner border */}
        <div
          className={`absolute inset-[1px] rounded-3xl border ${TONE_BORDER_COLORS[drop.tone]} pointer-events-none`}
        />

        {/* Revelation glow effect for new reveals */}
        {isNewReveal && (
          <motion.div
            className="absolute inset-0 rounded-3xl pointer-events-none"
            style={{
              background: `radial-gradient(ellipse at 50% 30%, ${TONE_GLOW[drop.tone]}, transparent 70%)`,
            }}
            initial={{ opacity: 0.8 }}
            animate={{ opacity: [0.8, 0.2, 0] }}
            transition={{ duration: 2.5, ease: "easeOut" }}
          />
        )}

        {/* Content */}
        <div className="relative p-6 sm:p-8">
          {/* Category badge + confidence */}
          <div className="flex items-center justify-between mb-6">
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: isNewReveal ? 0.4 : 0.15, duration: 0.22 }}
            >
              <GlassBadge variant="default" size="sm" className="font-body">
                <span className="mr-1">
                  {CATEGORY_ICONS[drop.category]}
                </span>
                {CATEGORY_LABELS[drop.category]}
              </GlassBadge>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: isNewReveal ? 0.5 : 0.25, duration: 0.22 }}
            >
              <ConfidenceReveal intensity={drop.intensity} />
            </motion.div>
          </div>

          {/* Title with reveal animation */}
          <motion.h2
            className="font-display text-2xl sm:text-3xl font-semibold mb-4 leading-tight"
            style={{ color: "rgba(30,35,55,0.92)" }}
            initial={isNewReveal ? { opacity: 0, y: 20, filter: "blur(4px)" } : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ delay: isNewReveal ? 0.7 : 0.4, duration: isNewReveal ? 0.9 : 0.7 }}
          >
            {drop.title}
          </motion.h2>

          {/* Divider -- golden line reveal */}
          <motion.div
            className="mb-5"
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, transparent, rgba(176,144,80,0.25), transparent)",
            }}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: isNewReveal ? 0.9 : 0.6, duration: isNewReveal ? 1.2 : 0.8 }}
          />

          {/* Body text with staggered word reveal feel */}
          <motion.p
            className="font-body text-base sm:text-lg leading-relaxed mb-6"
            style={{ color: "rgba(40,45,65,0.82)", lineHeight: 1.85 }}
            initial={isNewReveal ? { opacity: 0, filter: "blur(3px)" } : { opacity: 0 }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            transition={{ delay: isNewReveal ? 1.0 : 0.7, duration: isNewReveal ? 1.0 : 0.8 }}
          >
            {drop.body}
          </motion.p>

          {/* Evidence hint */}
          <motion.div
            className="mb-8 p-3 rounded-xl"
            style={{
              background: "rgba(176,144,80,0.04)",
              border: "1px solid rgba(176,144,80,0.1)",
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: isNewReveal ? 0.8 : 0.5, duration: 0.25 }}
          >
            <p
              className="font-body text-sm"
              style={{ color: "rgba(100,110,140,0.6)", fontStyle: "italic" }}
            >
              {drop.unlockHint}
            </p>
          </motion.div>

          {/* Reactions */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: isNewReveal ? 1.0 : 0.7, duration: 0.25 }}
          >
            <AnimatePresence mode="wait">
              {showThankYou ? (
                <motion.div
                  key="thanks"
                  className="text-center py-4"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <motion.div
                    className="w-12 h-12 mx-auto mb-2 rounded-full flex items-center justify-center"
                    style={{
                      background: "rgba(176,144,80,0.08)",
                      border: "1px solid rgba(176,144,80,0.15)",
                    }}
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.25 }}
                  >
                    <span className="text-lg">&#x2728;</span>
                  </motion.div>
                  <p
                    className="font-display text-lg"
                    style={{ color: "rgba(176,144,80,0.8)" }}
                  >
                    観測を記録しました
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "rgba(176,144,80,0.4)" }}
                  >
                    この反応自体が、あなたの一部を語っている
                  </p>
                </motion.div>
              ) : selectedReaction ? (
                <motion.div
                  key="selected"
                  className="flex items-center justify-center gap-3 py-3"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {REACTIONS.map((r) => (
                    <div
                      key={r.key}
                      className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all"
                      style={{
                        opacity: r.key === selectedReaction ? 1 : 0.3,
                        background:
                          r.key === selectedReaction
                            ? "rgba(176,144,80,0.08)"
                            : "transparent",
                        border:
                          r.key === selectedReaction
                            ? "1px solid rgba(176,144,80,0.2)"
                            : "1px solid transparent",
                      }}
                    >
                      <span className="text-xl">{r.emoji}</span>
                      <span
                        className="text-xs font-body"
                        style={{ color: "rgba(80,85,110,0.7)" }}
                      >
                        {r.label}
                      </span>
                    </div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="buttons"
                  className="grid grid-cols-4 gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {REACTIONS.map((r, i) => (
                    <motion.button
                      key={r.key}
                      onClick={() => handleReact(r.key)}
                      className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-2xl transition-all
                        bg-white/50 backdrop-blur-sm border border-slate-200/50
                        hover:bg-white/80 hover:border-slate-300/60 hover:shadow-md
                        active:scale-95"
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: (isNewReveal ? 1.1 : 0.8) + i * 0.06, duration: 0.22 }}
                    >
                      <span className="text-xl">{r.emoji}</span>
                      <span
                        className="text-xs font-body font-medium"
                        style={{ color: "rgba(60,65,90,0.75)" }}
                      >
                        {r.label}
                      </span>
                    </motion.button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </GlassCard>
    </motion.div>
  );
}

/** Post-reaction footer */
function PostReactionFooter({ deliveryHour }: { deliveryHour: number }) {
  const nextHourStr = `${String(deliveryHour).padStart(2, "0")}:00`;
  return (
    <FadeInView delay={0.3}>
      <div className="text-center mt-8 space-y-3">
        <motion.div
          className="mx-auto"
          style={{
            width: 60,
            height: 1,
            background:
              "linear-gradient(90deg, transparent, rgba(176,144,80,0.3), transparent)",
          }}
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 4, repeat: Infinity }}
        />
        <p
          className="font-display text-sm"
          style={{ color: "rgba(120,130,160,0.7)" }}
        >
          明日も、気づきにくい一面を照らします
        </p>
        <p
          className="font-mono-sg text-xs"
          style={{ color: "rgba(140,150,180,0.5)" }}
        >
          明日の一滴は {nextHourStr} に届きます
        </p>
      </div>
    </FadeInView>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function BlindSpotClient() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [drop, setDrop] = useState<BlindSpotDrop | null>(null);
  const [selectedReaction, setSelectedReaction] = useState<Reaction | null>(null);

  useEffect(() => { trackFeatureView("blind_spot"); }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- mount-time hydration from localStorage */
    const generated = generateDemoDrop();
    setDrop(generated);

    const existing = loadReaction();
    if (existing && existing.dropId === generated.id) {
      setSelectedReaction(existing.reaction);
      setPhase("already-seen");
    } else {
      setPhase("pre-reveal");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const handleRevealComplete = useCallback(() => {
    setPhase("fog-clearing");
    // Short delay for fog-clearing visual, then reveal
    setTimeout(() => setPhase("reveal"), 300);
  }, []);

  const handleReact = useCallback(
    (r: Reaction) => {
      if (!drop) return;
      setSelectedReaction(r);
      saveReaction(drop.id, r);
      trackInteraction("blind_spot", "reaction", { reaction: r, dropId: drop.id });

      fetch("/api/stargazer/blind-spot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dropId: drop.id,
          reaction: r,
          date: drop.date,
        }),
      }).catch(() => {});

      setTimeout(() => setPhase("reacted"), 2200);
    },
    [drop],
  );

  if (phase === "loading" || !drop) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <motion.div
          className="text-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="w-8 h-8 mx-auto rounded-full"
            style={{ border: "2px solid rgba(176,144,80,0.3)" }}
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          />
          <p
            className="mt-4 font-display text-sm tracking-widest"
            style={{ color: "rgba(120,130,160,0.6)" }}
          >
            観測中...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative">
      {/* Pre-reveal overlay */}
      <AnimatePresence>
        {phase === "pre-reveal" && (
          <PreRevealOverlay onComplete={handleRevealComplete} />
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="max-w-lg mx-auto px-4 pt-6 pb-20">
        {/* Back navigation */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: phase === "already-seen" ? 0 : 0.3 }}
        >
          <Link
            href="/stargazer"
            className="inline-flex items-center gap-2 text-sm font-body transition-colors hover:opacity-70"
            style={{ color: "rgba(120,130,160,0.7)" }}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M10 12L6 8l4-4" />
            </svg>
            深層観測に戻る
          </Link>
        </motion.div>

        {/* Page title */}
        <motion.div
          className="mb-8 text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: phase === "already-seen" ? 0.05 : 0.3,
            duration: 0.25,
          }}
        >
          <h1
            className="font-display text-xl sm:text-2xl tracking-wide"
            style={{ color: "rgba(30,35,55,0.85)" }}
          >
            見えない自分
          </h1>
          <p
            className="mt-1 font-mono-sg text-xs tracking-wider"
            style={{ color: "rgba(140,150,180,0.5)" }}
          >
            盲点の発見 &mdash; {drop.date}
          </p>
        </motion.div>

        {/* Drop card */}
        {(phase === "reveal" ||
          phase === "fog-clearing" ||
          phase === "reacted" ||
          phase === "already-seen") && (
          <DropCard
            drop={drop}
            selectedReaction={selectedReaction}
            onReact={handleReact}
            isNewReveal={phase === "reveal" || phase === "fog-clearing"}
          />
        )}

        {/* Post-reaction footer */}
        {(phase === "reacted" || phase === "already-seen") && (
          <PostReactionFooter deliveryHour={drop.deliveryHour} />
        )}
      </div>
    </div>
  );
}
