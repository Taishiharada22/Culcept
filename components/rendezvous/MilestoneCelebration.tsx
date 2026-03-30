"use client";

/**
 * MilestoneCelebration
 * Celebratory overlay shown in chat when conversation milestones are reached.
 * Golden gradient border pulse + particles + auto-dismiss.
 */

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { hapticMedium } from "@/lib/rendezvous/haptics";

type Props = {
  milestone: string;
  onDismiss: () => void;
};

const MILESTONE_DISPLAY: Record<string, { icon: string; text: string }> = {
  first_reply: { icon: "💬", text: "最初の返信！会話が始まった" },
  ten_messages: { icon: "🎯", text: "10通達成！いい調子" },
  fifty_messages: { icon: "🌟", text: "50通突破！深まる会話" },
  three_day_streak: { icon: "🔥", text: "3日間連続会話" },
  seven_day_streak: { icon: "💫", text: "1週間の軌跡" },
  first_image: { icon: "📸", text: "初めての写真共有" },
  first_voice: { icon: "🎵", text: "初めてのボイスメッセージ" },
};

const PARTICLES = Array.from({ length: 8 }, (_, i) => ({
  id: i,
  angle: (360 / 8) * i,
  delay: i * 0.05,
}));

export default function MilestoneCelebration({
  milestone,
  onDismiss,
}: Props) {
  const display = MILESTONE_DISPLAY[milestone] ?? {
    icon: "✨",
    text: "マイルストーン達成！",
  };

  useEffect(() => {
    hapticMedium();
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.8, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.8, y: -20 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        onClick={onDismiss}
        style={{
          position: "relative",
          alignSelf: "center",
          margin: "16px auto",
          padding: "14px 24px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(12px)",
          cursor: "pointer",
          textAlign: "center",
          maxWidth: 280,
          overflow: "visible",
        }}
      >
        {/* Animated golden border */}
        <motion.div
          animate={{
            boxShadow: [
              "0 0 0 2px rgba(251,191,36,0.3), 0 0 16px rgba(251,191,36,0.1)",
              "0 0 0 2px rgba(251,191,36,0.6), 0 0 24px rgba(251,191,36,0.2)",
              "0 0 0 2px rgba(251,191,36,0.3), 0 0 16px rgba(251,191,36,0.1)",
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: 16,
            pointerEvents: "none",
          }}
        />

        {/* Particles burst */}
        {PARTICLES.map((p) => {
          const rad = (p.angle * Math.PI) / 180;
          const tx = Math.cos(rad) * 50;
          const ty = Math.sin(rad) * 50;
          return (
            <motion.div
              key={p.id}
              initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
              animate={{ x: tx, y: ty, opacity: 0, scale: 0 }}
              transition={{ duration: 0.6, delay: p.delay, ease: "easeOut" }}
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: 4,
                height: 4,
                borderRadius: "50%",
                background: "#FBB024",
                pointerEvents: "none",
              }}
            />
          );
        })}

        {/* Content */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <span style={{ fontSize: 28, display: "block", marginBottom: 6 }}>
            {display.icon}
          </span>
          <p
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#D97706",
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {display.text}
          </p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
