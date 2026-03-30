"use client";

import { motion } from "framer-motion";
import type { AvatarEmotion } from "@/lib/rendezvous/avatarVitality";

// =============================================================================
// AvatarEmotionIndicator — 分身の感情状態を示す小型インジケーター
// =============================================================================

const EMOTION_CONFIG: Record<AvatarEmotion, { icon: string; color: string; label: string }> = {
  curious:        { icon: "\uD83D\uDD0D", color: "#06B6D4", label: "好奇心" },
  excited:        { icon: "\u2728",       color: "#F59E0B", label: "高揚" },
  hesitant:       { icon: "\uD83E\uDD14", color: "#6366F1", label: "逡巡" },
  contemplative:  { icon: "\uD83D\uDCAD", color: "#8B5CF6", label: "瞑想" },
  delighted:      { icon: "\uD83D\uDC9D", color: "#EC4899", label: "歓喜" },
  resting:        { icon: "\uD83D\uDE34", color: "#94A3B8", label: "休息" },
};

interface AvatarEmotionIndicatorProps {
  emotion: AvatarEmotion;
  pulse: number; // 0..1
}

export default function AvatarEmotionIndicator({ emotion, pulse }: AvatarEmotionIndicatorProps) {
  const config = EMOTION_CONFIG[emotion] ?? EMOTION_CONFIG.resting;
  // Animation duration inversely related to pulse
  const pulseDuration = Math.max(0.8, 2.5 - pulse * 1.5);

  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="relative flex items-center justify-center"
      style={{ width: 40, height: 40 }}
    >
      {/* Pulsing ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: `${config.color}22`,
          animation: `emotionPulse ${pulseDuration}s ease-in-out infinite`,
        }}
      />

      {/* Glassmorphism backdrop */}
      <div
        className="relative w-10 h-10 rounded-full flex items-center justify-center"
        style={{
          background: `rgba(255,255,255,0.6)`,
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `2px solid ${config.color}44`,
          boxShadow: `0 0 12px ${config.color}30`,
        }}
      >
        <span className="text-base leading-none">{config.icon}</span>
      </div>

      {/* CSS keyframes injected via style tag (only once) */}
      <style jsx>{`
        @keyframes emotionPulse {
          0%, 100% { transform: scale(1); opacity: 0.5; }
          50% { transform: scale(1.3); opacity: 0; }
        }
      `}</style>
    </motion.div>
  );
}
