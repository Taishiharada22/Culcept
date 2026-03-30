// app/(immersive)/stargazer/_components/MilestoneCelebration.tsx
// マイルストーン達成セレブレーション — フルスクリーンオーバーレイ
"use client";

import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassButton } from "@/components/ui/glassmorphism-design";
import { getMilestoneInfo, type MilestoneNumber } from "@/lib/stargazer/milestoneDetector";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MilestoneCelebrationProps {
  milestone: MilestoneNumber;
  onDismiss: () => void;
}

// ---------------------------------------------------------------------------
// Tier gradient definitions (CSS gradients, no images)
// ---------------------------------------------------------------------------

type TierStyle = {
  outer: string; // 外枠グラデーション
  inner: string; // バッジ本体グラデーション
  glow: string;  // グロー色
  particle: string; // パーティクル色
};

const TIER_STYLES: Record<string, TierStyle> = {
  bronze: {
    outer: "linear-gradient(135deg, #CD7F32 0%, #A0522D 50%, #CD7F32 100%)",
    inner: "linear-gradient(135deg, #E8A862 0%, #CD7F32 50%, #8B4513 100%)",
    glow: "rgba(205,127,50,0.4)",
    particle: "#CD7F32",
  },
  silver: {
    outer: "linear-gradient(135deg, #C0C0C0 0%, #808080 50%, #C0C0C0 100%)",
    inner: "linear-gradient(135deg, #E8E8E8 0%, #C0C0C0 50%, #A0A0A0 100%)",
    glow: "rgba(192,192,192,0.5)",
    particle: "#C0C0C0",
  },
  gold: {
    outer: "linear-gradient(135deg, #FFD700 0%, #DAA520 50%, #FFD700 100%)",
    inner: "linear-gradient(135deg, #FFF3B0 0%, #FFD700 50%, #B8860B 100%)",
    glow: "rgba(255,215,0,0.5)",
    particle: "#FFD700",
  },
  platinum: {
    outer: "linear-gradient(135deg, #E5E4E2 0%, #B0C4DE 50%, #E5E4E2 100%)",
    inner: "linear-gradient(135deg, #F0F0FF 0%, #B0C4DE 50%, #8899AA 100%)",
    glow: "rgba(176,196,222,0.5)",
    particle: "#B0C4DE",
  },
  diamond: {
    outer: "linear-gradient(135deg, #B9F2FF 0%, #7DF9FF 25%, #E0E7FF 50%, #7DF9FF 75%, #B9F2FF 100%)",
    inner: "linear-gradient(135deg, #FFFFFF 0%, #B9F2FF 30%, #7DF9FF 50%, #E0E7FF 70%, #FFFFFF 100%)",
    glow: "rgba(125,249,255,0.6)",
    particle: "#7DF9FF",
  },
};

// ---------------------------------------------------------------------------
// Star Particle component — small orbiting dots
// ---------------------------------------------------------------------------

function StarParticle({ index, total, color }: { index: number; total: number; color: string }) {
  const angle = (360 / total) * index;
  const radius = 70 + Math.random() * 30; // 70-100px from center
  const size = 3 + Math.random() * 4; // 3-7px
  const duration = 4 + Math.random() * 3; // 4-7s orbit
  const delay = (index / total) * 2; // stagger start

  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        background: color,
        boxShadow: `0 0 ${size * 2}px ${color}`,
        top: "50%",
        left: "50%",
      }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 0.7, 1, 0],
        scale: [0, 1, 0.8, 1, 0],
        x: [
          Math.cos((angle * Math.PI) / 180) * radius * 0.3,
          Math.cos(((angle + 90) * Math.PI) / 180) * radius,
          Math.cos(((angle + 180) * Math.PI) / 180) * radius * 1.1,
          Math.cos(((angle + 270) * Math.PI) / 180) * radius,
          Math.cos(((angle + 360) * Math.PI) / 180) * radius * 0.3,
        ],
        y: [
          Math.sin((angle * Math.PI) / 180) * radius * 0.3,
          Math.sin(((angle + 90) * Math.PI) / 180) * radius,
          Math.sin(((angle + 180) * Math.PI) / 180) * radius * 1.1,
          Math.sin(((angle + 270) * Math.PI) / 180) * radius,
          Math.sin(((angle + 360) * Math.PI) / 180) * radius * 0.3,
        ],
      }}
      transition={{
        duration,
        delay: 0.5 + delay,
        repeat: Infinity,
        ease: "easeInOut",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Badge icon — pure CSS gradient shape
// ---------------------------------------------------------------------------

function BadgeIcon({ tier }: { tier: string }) {
  const style = TIER_STYLES[tier] ?? TIER_STYLES.bronze;

  return (
    <div className="relative" style={{ width: 120, height: 120 }}>
      {/* Outer glow */}
      <div
        className="absolute inset-0 rounded-full blur-xl"
        style={{ background: style.glow }}
      />
      {/* Outer ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{ background: style.outer, padding: 4 }}
      >
        {/* Inner badge */}
        <div
          className="w-full h-full rounded-full flex items-center justify-center"
          style={{ background: style.inner }}
        >
          {/* Star symbol */}
          <span className="text-4xl select-none" style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))" }}>
            {tier === "diamond" ? "\u2666" : tier === "platinum" ? "\u2726" : tier === "gold" ? "\u2605" : tier === "silver" ? "\u2736" : "\u2734"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function MilestoneCelebration({ milestone, onDismiss }: MilestoneCelebrationProps) {
  const info = useMemo(() => getMilestoneInfo(milestone), [milestone]);
  const tierStyle = TIER_STYLES[info.tier] ?? TIER_STYLES.bronze;
  const particleCount = 10;

  // No body overflow lock — let the fixed overlay handle containment

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        role="dialog"
        aria-modal="true"
        aria-label={`マイルストーン達成: ${info.title}`}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0 bg-slate-900/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2 }}
          onClick={onDismiss}
        />

        {/* Content — scrollable on small screens */}
        <div className="relative flex flex-col items-center gap-5 px-6 max-h-[85vh] overflow-y-auto">
          {/* Badge with particles */}
          <div className="relative" style={{ width: 160, height: 160 }}>
            {/* Star particles */}
            <div className="absolute inset-0 flex items-center justify-center">
              {Array.from({ length: particleCount }, (_, i) => (
                <StarParticle
                  key={i}
                  index={i}
                  total={particleCount}
                  color={tierStyle.particle}
                />
              ))}
            </div>

            {/* Badge — spring scale in */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 260,
                damping: 20,
                delay: 0.1,
              }}
            >
              <BadgeIcon tier={info.tier} />
            </motion.div>
          </div>

          {/* Milestone number */}
          <motion.p
            className="text-sm font-medium tracking-widest uppercase"
            style={{ color: tierStyle.particle }}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.2 }}
          >
            {milestone} 観測達成
          </motion.p>

          {/* Title */}
          <motion.h2
            className="text-3xl font-bold text-white text-center"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.2 }}
          >
            {info.title}
          </motion.h2>

          {/* Subtitle */}
          <motion.p
            className="text-base text-slate-300 text-center max-w-xs leading-relaxed"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.2 }}
          >
            {info.subtitle}
          </motion.p>

          {/* Continue button */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.8, duration: 0.2 }}
          >
            <GlassButton
              variant="primary"
              size="lg"
              onClick={onDismiss}
              className="mt-2"
              style={{
                background: "rgba(255,255,255,0.15)",
                backdropFilter: "blur(12px)",
                border: "1px solid rgba(255,255,255,0.25)",
                color: "#fff",
              }}
            >
              続ける
            </GlassButton>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
