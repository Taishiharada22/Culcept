"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface Props {
  /** How long the silence lasts in milliseconds (default 3000) */
  durationMs?: number;
  /** Callback when the entire sequence (silence + typewriter) completes */
  onComplete: () => void;
  /** What Alter says after the silence */
  followUpText: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Ellipsis Animation Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DOT_DELAY_MS = 800;
const DOT_COUNT = 3;
const TYPEWRITER_CHAR_DELAY = 35;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function AlterSilence({
  durationMs = 3000,
  onComplete,
  followUpText,
}: Props) {
  const [phase, setPhase] = useState<"dots" | "darken" | "typing" | "done">(
    "dots",
  );
  const [visibleDots, setVisibleDots] = useState(0);
  const [typedChars, setTypedChars] = useState(0);

  // Phase 1: Slowly reveal dots
  useEffect(() => {
    if (phase !== "dots") return;

    let dotIndex = 0;
    const timer = setInterval(() => {
      dotIndex++;
      setVisibleDots(dotIndex);
      if (dotIndex >= DOT_COUNT) {
        clearInterval(timer);
        // Transition to darken phase
        setTimeout(() => setPhase("darken"), 400);
      }
    }, DOT_DELAY_MS);

    return () => clearInterval(timer);
  }, [phase]);

  // Phase 2: Brief darkening pause, then typing
  useEffect(() => {
    if (phase !== "darken") return;

    const pauseDuration = Math.max(durationMs - DOT_COUNT * DOT_DELAY_MS, 500);
    const timer = setTimeout(() => {
      setPhase("typing");
    }, pauseDuration);

    return () => clearTimeout(timer);
  }, [phase, durationMs]);

  // Phase 3: Typewriter effect for follow-up text
  useEffect(() => {
    if (phase !== "typing") return;

    let index = 0;
    const timer = setInterval(() => {
      index++;
      setTypedChars(index);
      if (index >= followUpText.length) {
        clearInterval(timer);
        setPhase("done");
      }
    }, TYPEWRITER_CHAR_DELAY);

    return () => clearInterval(timer);
  }, [phase, followUpText]);

  // Phase 4: Signal completion
  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    if (phase !== "done") return;
    const timer = setTimeout(handleComplete, 800);
    return () => clearTimeout(timer);
  }, [phase, handleComplete]);

  return (
    <motion.div
      className="relative w-full"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
    >
      {/* Subtle background darkening during silence */}
      <AnimatePresence>
        {(phase === "dots" || phase === "darken") && (
          <motion.div
            className="fixed inset-0 z-10 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{
              opacity: phase === "darken" ? 0.15 : 0.05,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            style={{ background: "rgba(20, 0, 40, 1)" }}
          />
        )}
      </AnimatePresence>

      <div className="relative z-20">
        {/* Dots phase */}
        {(phase === "dots" || phase === "darken") && (
          <div className="flex items-center gap-1 px-4 py-3 min-h-[48px]">
            {Array.from({ length: DOT_COUNT }).map((_, i) => (
              <motion.span
                key={i}
                className="text-lg text-purple-400/70 font-light"
                initial={{ opacity: 0, y: 4 }}
                animate={
                  i < visibleDots
                    ? { opacity: 1, y: 0 }
                    : { opacity: 0, y: 4 }
                }
                transition={{ duration: 0.22, ease: "easeOut" }}
              >
                .
              </motion.span>
            ))}

            {/* Breathing pulse during silence */}
            {phase === "darken" && (
              <motion.div
                className="ml-2 w-1.5 h-1.5 rounded-full bg-purple-400/40"
                animate={{
                  opacity: [0.2, 0.6, 0.2],
                  scale: [0.8, 1.2, 0.8],
                }}
                transition={{ duration: 2, repeat: Infinity }}
              />
            )}
          </div>
        )}

        {/* Typing phase */}
        {(phase === "typing" || phase === "done") && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.18 }}
            className="px-4 py-3 min-h-[48px]"
          >
            <p className="text-sm leading-relaxed text-slate-800 whitespace-pre-line">
              {followUpText.slice(0, typedChars)}
              {phase === "typing" && (
                <motion.span
                  className="inline-block w-[2px] h-[14px] bg-purple-500/50 ml-0.5 align-middle"
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.6, repeat: Infinity }}
                />
              )}
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
