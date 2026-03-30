"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { HumanMoment, HumanMomentRarity, HumanMomentType } from "@/lib/rendezvous/humanProof";

// =============================================================================
// Visual Config
// =============================================================================

const TYPE_EMOJI: Record<HumanMomentType, string> = {
  unpredictable_sync: "\u{1F300}",      // cyclone
  beautiful_contradiction: "\u{1F30A}",  // wave
  meaningful_silence: "\u{1F311}",       // new moon
  spontaneous_vulnerability: "\u{1F49B}",// yellow heart
  mutual_growth: "\u{1F331}",           // seedling
  creative_misunderstanding: "\u{1F308}",// rainbow
  rhythm_resonance: "\u{1F3B6}",        // musical notes
  surprise_recognition: "\u{2728}",      // sparkles
};

const RARITY_COLORS: Record<HumanMomentRarity, string> = {
  common: "#94A3B8",
  uncommon: "#8B5CF6",
  rare: "#F59E0B",
  legendary: "#EF4444",
};

const RARITY_LABELS: Record<HumanMomentRarity, string> = {
  common: "\u666E\u901A",
  uncommon: "\u5E0C\u5C11",
  rare: "\u30EC\u30A2",
  legendary: "\u4F1D\u8AAC",
};

const RARITY_BG: Record<HumanMomentRarity, string> = {
  common: "bg-slate-100/80",
  uncommon: "bg-violet-100/80",
  rare: "bg-amber-100/80",
  legendary: "bg-red-100/80",
};

// =============================================================================
// Rarity visual effects
// =============================================================================

function RarityGlow({ rarity }: { rarity: HumanMomentRarity }) {
  const color = RARITY_COLORS[rarity];

  if (rarity === "common") {
    // Subtle border glow
    return (
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          boxShadow: `0 0 8px 1px ${color}30`,
        }}
      />
    );
  }

  if (rarity === "uncommon") {
    // Animated border shimmer
    return (
      <motion.div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        animate={{
          boxShadow: [
            `0 0 8px 2px ${color}20`,
            `0 0 16px 4px ${color}40`,
            `0 0 8px 2px ${color}20`,
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    );
  }

  if (rarity === "rare") {
    // Particle effect around card
    return (
      <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
        <motion.div
          className="absolute inset-0 rounded-2xl"
          animate={{
            boxShadow: [
              `0 0 12px 3px ${color}30`,
              `0 0 24px 6px ${color}50`,
              `0 0 12px 3px ${color}30`,
            ],
          }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        />
        {Array.from({ length: 5 }).map((_, i) => (
          <RareParticle key={i} index={i} color={color} />
        ))}
      </div>
    );
  }

  // legendary: full aurora background animation
  return (
    <div className="absolute inset-0 rounded-2xl pointer-events-none overflow-hidden">
      <motion.div
        className="absolute -inset-4"
        style={{
          background: `conic-gradient(from 0deg, ${color}10, #8B5CF620, #3B82F620, ${color}10)`,
          filter: "blur(20px)",
        }}
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
      />
      <motion.div
        className="absolute inset-0 rounded-2xl"
        animate={{
          boxShadow: [
            `0 0 20px 4px ${color}30, 0 0 40px 8px #8B5CF620`,
            `0 0 30px 8px ${color}50, 0 0 60px 12px #3B82F630`,
            `0 0 20px 4px ${color}30, 0 0 40px 8px #8B5CF620`,
          ],
        }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
      {Array.from({ length: 8 }).map((_, i) => (
        <AuroraParticle key={i} index={i} />
      ))}
    </div>
  );
}

function RareParticle({ index, color }: { index: number; color: string }) {
  const angle = (index / 5) * Math.PI * 2;
  const radius = 45 + (index % 3) * 5;

  return (
    <motion.div
      className="absolute w-1.5 h-1.5 rounded-full"
      style={{
        backgroundColor: color,
        left: "50%",
        top: "50%",
        opacity: 0.6,
      }}
      animate={{
        x: [
          Math.cos(angle) * radius,
          Math.cos(angle + Math.PI) * radius,
          Math.cos(angle) * radius,
        ],
        y: [
          Math.sin(angle) * radius,
          Math.sin(angle + Math.PI) * radius,
          Math.sin(angle) * radius,
        ],
        opacity: [0.2, 0.7, 0.2],
        scale: [0.5, 1.2, 0.5],
      }}
      transition={{
        duration: 4 + index * 0.5,
        repeat: Infinity,
        ease: "easeInOut",
        delay: index * 0.3,
      }}
    />
  );
}

function AuroraParticle({ index }: { index: number }) {
  const colors = ["#EF4444", "#8B5CF6", "#3B82F6", "#10B981", "#F59E0B"];
  const color = colors[index % colors.length];
  const startX = 10 + ((index * 29) % 80);

  return (
    <motion.div
      className="absolute w-1 h-1 rounded-full"
      style={{
        backgroundColor: color,
        left: `${startX}%`,
        top: "50%",
      }}
      animate={{
        y: [-30, 30, -30],
        x: [-15, 15, -15],
        opacity: [0, 0.8, 0],
        scale: [0.3, 1.5, 0.3],
      }}
      transition={{
        duration: 3 + index * 0.4,
        repeat: Infinity,
        ease: "easeInOut",
        delay: index * 0.4,
      }}
    />
  );
}

// =============================================================================
// Timestamp formatter
// =============================================================================

function formatDetectedAt(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffH = (now.getTime() - d.getTime()) / (1000 * 60 * 60);

  if (diffH < 1) return "\u305F\u3063\u305F\u4ECA"; // "just now"
  if (diffH < 24) return `${Math.round(diffH)}\u6642\u9593\u524D`;
  if (diffH < 48) return "\u6628\u65E5";
  const diffD = Math.round(diffH / 24);
  if (diffD < 30) return `${diffD}\u65E5\u524D`;
  return `${d.getMonth() + 1}\u6708${d.getDate()}\u65E5`;
}

// =============================================================================
// Component
// =============================================================================

type HumanMomentCardProps = {
  moment: HumanMoment;
  compact?: boolean;
};

export default function HumanMomentCard({ moment, compact = false }: HumanMomentCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });

  const emoji = TYPE_EMOJI[moment.type];
  const rarityColor = RARITY_COLORS[moment.rarity];
  const rarityLabel = RARITY_LABELS[moment.rarity];
  const rarityBg = RARITY_BG[moment.rarity];

  if (compact) {
    return (
      <motion.div
        ref={ref}
        initial={{ opacity: 0, x: -8 }}
        animate={isInView ? { opacity: 1, x: 0 } : {}}
        transition={{ duration: 0.3 }}
        className="flex items-center gap-2.5 px-3 py-2 rounded-xl bg-white/60 backdrop-blur-sm border border-white/50"
      >
        <span className="text-lg flex-shrink-0">{emoji}</span>
        <span className="text-sm text-slate-700 font-medium truncate flex-1">
          {moment.title}
        </span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rarityBg}`}
          style={{ color: rarityColor }}
        >
          {rarityLabel}
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.95, rotate: -1 }}
      animate={isInView ? { opacity: 1, scale: 1, rotate: 0 } : {}}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="relative"
    >
      <RarityGlow rarity={moment.rarity} />
      <GlassCard variant="elevated" padding="md" hoverEffect={false}>
        <div className="relative z-10">
          {/* Rarity badge - top right */}
          <div className="absolute -top-1 -right-1">
            <GlassBadge
              variant="default"
              size="sm"
            >
              <span style={{ color: rarityColor }} className="font-semibold text-[10px]">
                {rarityLabel}
              </span>
            </GlassBadge>
          </div>

          {/* Type icon + title */}
          <div className="flex items-start gap-3 mb-2 pr-14">
            <motion.span
              className="text-2xl flex-shrink-0 mt-0.5"
              animate={
                moment.rarity === "legendary"
                  ? { scale: [1, 1.15, 1], rotate: [0, 5, -5, 0] }
                  : moment.rarity === "rare"
                    ? { scale: [1, 1.08, 1] }
                    : {}
              }
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            >
              {emoji}
            </motion.span>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-slate-800 leading-tight">
                {moment.title}
              </h3>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-600 leading-relaxed mb-3">
            {moment.description}
          </p>

          {/* Evidence */}
          <div className="px-3 py-2 rounded-xl bg-white/40 border border-white/50">
            <p className="text-xs text-slate-500">
              <span className="font-medium text-slate-600">
                {"\u{1F50D}"} {moment.evidence}
              </span>
            </p>
          </div>

          {/* Detected at */}
          <div className="mt-2 text-right">
            <span className="text-[10px] text-slate-400">
              {formatDetectedAt(moment.detectedAt)}
            </span>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
