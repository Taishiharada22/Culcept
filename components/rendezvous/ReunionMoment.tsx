"use client";

import { useEffect, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { ReunionExperience } from "@/lib/rendezvous/absenceDesign";

// =============================================================================
// Props
// =============================================================================

type ReunionMomentProps = {
  reunion: ReunionExperience;
  onContinue: () => void;
};

// =============================================================================
// Morning Dew Particles
// =============================================================================

function DewParticles() {
  const particles = useMemo(
    () =>
      Array.from({ length: 20 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 3,
        duration: 3 + Math.random() * 4,
      })),
    [],
  );

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background:
              "radial-gradient(circle, rgba(199,210,254,0.8) 0%, rgba(165,180,252,0.3) 100%)",
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0, 1, 0.5],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// =============================================================================
// Word-by-word Text Reveal
// =============================================================================

function WordReveal({
  text,
  delayMs = 200,
  startDelay = 800,
}: {
  text: string;
  delayMs?: number;
  startDelay?: number;
}) {
  const words = text.split("");
  // Use characters for Japanese text (no spaces between words)
  const chars = text.split("");

  return (
    <span className="inline">
      {chars.map((char, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            delay: (startDelay + i * delayMs) / 1000,
            duration: 0.3,
            ease: "easeOut",
          }}
          className="inline"
        >
          {char}
        </motion.span>
      ))}
    </span>
  );
}

// =============================================================================
// ReunionMoment
// =============================================================================

export default function ReunionMoment({
  reunion,
  onContinue,
}: ReunionMomentProps) {
  const [showSpark, setShowSpark] = useState(false);
  const [showButton, setShowButton] = useState(false);

  // Show spark question after greeting finishes
  useEffect(() => {
    const greetingDuration = 800 + reunion.greeting.length * 200 + 600;
    const t1 = setTimeout(() => setShowSpark(true), greetingDuration);
    const t2 = setTimeout(() => setShowButton(true), greetingDuration + 1200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reunion.greeting.length]);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
    >
      {/* Dark background */}
      <div className="absolute inset-0 bg-slate-950/90" />

      {/* Sunrise gradient from bottom */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(to top, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 30%, transparent 60%)",
        }}
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />

      {/* Dew particles */}
      <DewParticles />

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm mx-auto px-6 text-center">
        {/* Duration label */}
        <motion.p
          className="text-indigo-300/60 text-sm mb-8 tracking-wide"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.8 }}
        >
          {reunion.absenceDuration}の静寂の後——
        </motion.p>

        {/* Greeting (word-by-word reveal) */}
        <h2 className="text-xl font-medium text-indigo-100 leading-relaxed mb-10">
          <WordReveal text={reunion.greeting} delayMs={120} startDelay={800} />
        </h2>

        {/* Spark Question */}
        <AnimatePresence>
          {showSpark && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
            >
              <GlassCard className="!bg-white/5 !backdrop-blur-xl !border-white/10">
                <div className="p-5">
                  <p className="text-xs text-indigo-300/50 mb-2">
                    再会の問い
                  </p>
                  <p className="text-base text-indigo-100 leading-relaxed">
                    {reunion.sparkQuestion}
                  </p>
                </div>
              </GlassCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Continue Button */}
        <AnimatePresence>
          {showButton && (
            <motion.div
              className="mt-8"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <GlassButton onClick={onContinue}>
                会話を再開する
              </GlassButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
