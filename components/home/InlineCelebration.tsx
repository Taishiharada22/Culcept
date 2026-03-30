"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo } from "react";
// @ts-expect-error -- canvas-confetti has no type declarations
import confetti from "canvas-confetti";

type Props = {
  type: "weather" | "observation";
  streakDays?: number;
  onDismiss: () => void;
};

const MESSAGES: Record<Props["type"], string> = {
  weather: "内面天気を記録しました",
  observation: "観測を完了しました",
};

const CONFETTI_COLORS = [
  "#34d399",
  "#6ee7b7",
  "#fbbf24",
  "#f472b6",
  "#60a5fa",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
];

function ConfettiParticle({ index }: { index: number }) {
  const style = useMemo(() => {
    const angle = (index / 8) * 360;
    const rad = (angle * Math.PI) / 180;
    const distance = 40 + (index % 3) * 20;
    return {
      x: Math.cos(rad) * distance,
      y: Math.sin(rad) * distance - 30,
      rotate: angle + 90,
      color: CONFETTI_COLORS[index],
      size: 4 + (index % 2) * 2,
    };
  }, [index]);

  return (
    <motion.div
      initial={{ opacity: 1, x: 0, y: 0, scale: 1 }}
      animate={{
        opacity: 0,
        x: style.x,
        y: style.y,
        scale: 0.3,
        rotate: style.rotate,
      }}
      transition={{ duration: 1.2, ease: "easeOut", delay: 0.1 }}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        width: style.size,
        height: style.size,
        borderRadius: style.size > 5 ? 1 : "50%",
        backgroundColor: style.color,
        pointerEvents: "none",
      }}
    />
  );
}

export default function InlineCelebration({
  type,
  streakDays,
  onDismiss,
}: Props) {
  useEffect(() => {
    // Full-screen confetti burst for observation completion
    if (type === "observation") {
      confetti({
        particleCount: 60,
        spread: 80,
        origin: { y: 0.15 },
        colors: CONFETTI_COLORS,
        disableForReducedMotion: true,
      });
    }
    const timer = setTimeout(onDismiss, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss, type]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -80, opacity: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
        style={{
          position: "fixed",
          top: 16,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 200,
        }}
        className="pointer-events-auto"
      >
        <div
          className="relative flex items-center gap-3 rounded-2xl border px-5 py-3"
          style={{
            background: "rgba(220, 252, 231, 0.65)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
            borderColor: "rgba(52, 211, 153, 0.35)",
            boxShadow:
              "0 4px 24px rgba(16, 185, 129, 0.15), 0 1px 3px rgba(0,0,0,0.06)",
            minWidth: 240,
          }}
        >
          {/* Confetti particles */}
          <div className="absolute inset-0 overflow-visible pointer-events-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <ConfettiParticle key={i} index={i} />
            ))}
          </div>

          {/* Checkmark */}
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.15 }}
            className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full"
            style={{ background: "rgba(16, 185, 129, 0.2)" }}
          >
            <span className="text-emerald-600 text-lg font-bold">✓</span>
          </motion.span>

          {/* Message */}
          <span className="text-sm font-medium text-emerald-800 whitespace-nowrap">
            {MESSAGES[type]}
          </span>

          {/* Streak badge */}
          {streakDays != null && streakDays > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 350, damping: 18, delay: 0.3 }}
              className="ml-1 flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{
                background: "rgba(251, 191, 36, 0.2)",
                color: "#b45309",
              }}
            >
              🔥 {streakDays}日連続
            </motion.span>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
