"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// =============================================================================
// WelcomeBackOverlay
// おかえりなさい演出 - 不在帰還時のフルスクリーンオーバーレイ
// =============================================================================

interface WelcomeBackOverlayProps {
  greeting: string;
  journalSummary: string;
  animationType: "wave" | "bow" | "sparkle";
  onComplete: () => void;
}

// Sparkle particle component
function SparkleParticle({ delay, x, y }: { delay: number; x: number; y: number }) {
  return (
    <motion.div
      className="absolute w-1.5 h-1.5 rounded-full bg-amber-300"
      style={{ left: `${x}%`, top: `${y}%` }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{
        opacity: [0, 1, 0],
        scale: [0, 1.5, 0],
        y: [0, -30],
      }}
      transition={{
        duration: 1.5,
        delay,
        ease: "easeOut",
      }}
    />
  );
}

export default function WelcomeBackOverlay({
  greeting,
  journalSummary,
  animationType,
  onComplete,
}: WelcomeBackOverlayProps) {
  const [visible, setVisible] = useState(true);

  // Auto-dismiss after 6s
  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
    }, 6000);
    return () => clearTimeout(timer);
  }, []);

  // Call onComplete after exit animation
  const handleExitComplete = () => {
    onComplete();
  };

  const handleTap = () => {
    setVisible(false);
  };

  // Animation variants based on animationType
  const greetingVariants = {
    wave: {
      initial: { opacity: 0, x: -20 },
      animate: {
        opacity: 1,
        x: [0, 8, -8, 4, 0],
        transition: {
          opacity: { duration: 0.6 },
          x: { duration: 1.5, ease: "easeInOut" as const },
        },
      },
    },
    bow: {
      initial: { opacity: 0, scale: 0.8 },
      animate: {
        opacity: 1,
        scale: [0.8, 0.75, 1.05, 1],
        transition: {
          duration: 1.2,
          ease: "easeInOut" as const,
        },
      },
    },
    sparkle: {
      initial: { opacity: 0, scale: 0.9 },
      animate: {
        opacity: 1,
        scale: 1,
        transition: {
          duration: 0.8,
          ease: [0.22, 1, 0.36, 1] as const,
        },
      },
    },
  };

  const variant = greetingVariants[animationType];

  // Generate sparkle positions
  const sparkles = Array.from({ length: 12 }, (_, i) => ({
    delay: 0.2 + i * 0.15,
    x: 20 + Math.sin(i * 1.3) * 30 + 30,
    y: 30 + Math.cos(i * 1.7) * 20 + 20,
  }));

  return (
    <AnimatePresence onExitComplete={handleExitComplete}>
      {visible && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center cursor-pointer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          onClick={handleTap}
        >
          {/* Dark glassmorphism backdrop */}
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />

          {/* Content */}
          <div className="relative z-10 text-center px-8 max-w-md">
            {/* Sparkle particles (only for sparkle animation) */}
            {animationType === "sparkle" && (
              <div className="absolute inset-0 pointer-events-none">
                {sparkles.map((s, i) => (
                  <SparkleParticle key={i} delay={s.delay} x={s.x} y={s.y} />
                ))}
              </div>
            )}

            {/* Greeting */}
            <motion.h1
              className="text-3xl font-bold text-white mb-6 leading-relaxed"
              initial={variant.initial}
              animate={variant.animate}
            >
              {greeting}
            </motion.h1>

            {/* Journal summary */}
            <motion.p
              className="text-base text-white/70 leading-relaxed"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
            >
              {journalSummary}
            </motion.p>

            {/* Tap hint */}
            <motion.p
              className="mt-8 text-xs text-white/40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5, duration: 0.5 }}
            >
              タップでスキップ
            </motion.p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
