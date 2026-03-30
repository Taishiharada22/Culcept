"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// =============================================================================
// AvatarBirthCeremony
// Full-screen takeover with framer-motion animations:
// 1. Dark screen -> single light point appears
// 2. Light expands -> avatar silhouette forms
// 3. Avatar opens eyes -> name appears
// 4. "あなたの分身が生まれました" with sparkle effects
// 5. "分身を世界に放つ" large CTA button
// Duration: ~5 seconds of animation, then CTA
// =============================================================================

type Props = {
  avatarName?: string;
  onComplete: () => void;
};

type Phase = "dark" | "light" | "silhouette" | "eyes" | "born" | "ready";

const PHASE_TIMINGS: Record<Phase, number> = {
  dark: 800,
  light: 1200,
  silhouette: 1000,
  eyes: 800,
  born: 1200,
  ready: 0, // stays until user clicks
};

export default function AvatarBirthCeremony({ avatarName = "分身", onComplete }: Props) {
  const [phase, setPhase] = useState<Phase>("dark");

  useEffect(() => {
    const phases: Phase[] = ["dark", "light", "silhouette", "eyes", "born", "ready"];
    let currentIndex = 0;
    let timer: ReturnType<typeof setTimeout>;

    function advance() {
      if (currentIndex >= phases.length - 1) return;
      const currentPhase = phases[currentIndex];
      timer = setTimeout(() => {
        currentIndex++;
        setPhase(phases[currentIndex]);
        advance();
      }, PHASE_TIMINGS[currentPhase]);
    }

    advance();

    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ background: "#0A0A12" }}
    >
      {/* Phase 1: Dark -- subtle stars */}
      <AnimatePresence>
        {(phase === "dark" || phase === "light") && (
          <>
            {[...Array(20)].map((_, i) => (
              <motion.div
                key={`star-${i}`}
                className="absolute w-0.5 h-0.5 rounded-full bg-white"
                style={{
                  top: `${Math.random() * 100}%`,
                  left: `${Math.random() * 100}%`,
                }}
                initial={{ opacity: 0 }}
                animate={{ opacity: [0, 0.6, 0] }}
                transition={{
                  duration: 2 + Math.random() * 2,
                  repeat: Infinity,
                  delay: Math.random() * 2,
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Phase 2: Light point appears and expands */}
      <AnimatePresence>
        {phase !== "dark" && (
          <motion.div
            className="absolute"
            initial={{ width: 4, height: 4, opacity: 0 }}
            animate={
              phase === "light"
                ? { width: 4, height: 4, opacity: 1 }
                : phase === "silhouette"
                ? { width: 120, height: 120, opacity: 0.6 }
                : { width: 200, height: 200, opacity: 0.3 }
            }
            transition={{ duration: 1, ease: "easeOut" }}
            style={{
              borderRadius: "50%",
              background: `radial-gradient(circle, ${RV_COLORS.primary}90 0%, ${RV_COLORS.accent}40 40%, transparent 70%)`,
              filter: "blur(20px)",
            }}
          />
        )}
      </AnimatePresence>

      {/* Phase 3: Avatar silhouette forms */}
      <AnimatePresence>
        {(phase === "silhouette" ||
          phase === "eyes" ||
          phase === "born" ||
          phase === "ready") && (
          <motion.div
            className="relative flex items-center justify-center"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.div
              className="w-28 h-28 rounded-full flex items-center justify-center"
              style={{
                background:
                  phase === "silhouette"
                    ? "rgba(255,255,255,0.05)"
                    : `linear-gradient(135deg, ${RV_COLORS.primary}30, ${RV_COLORS.accent}30)`,
                border: `2px solid rgba(255,255,255,${phase === "silhouette" ? "0.1" : "0.2"})`,
                boxShadow:
                  phase === "eyes" || phase === "born" || phase === "ready"
                    ? `0 0 40px ${RV_COLORS.primaryGlow}`
                    : "none",
              }}
              animate={
                phase === "born" || phase === "ready"
                  ? { scale: [1, 1.05, 1] }
                  : {}
              }
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            >
              {/* Eyes appearing */}
              {(phase === "eyes" || phase === "born" || phase === "ready") && (
                <motion.span
                  className="text-5xl"
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                >
                  &#x1F47B;
                </motion.span>
              )}
              {phase === "silhouette" && (
                <motion.div
                  className="w-16 h-16 rounded-full"
                  style={{
                    background: "rgba(255,255,255,0.08)",
                  }}
                  animate={{ opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.div>

            {/* Orbiting particles */}
            {(phase === "born" || phase === "ready") &&
              [0, 1, 2, 3, 4, 5].map((i) => (
                <motion.div
                  key={`orbit-${i}`}
                  className="absolute w-2 h-2 rounded-full"
                  style={{
                    background: i % 2 === 0 ? RV_COLORS.primary : RV_COLORS.accent,
                  }}
                  animate={{
                    x: [
                      Math.cos((i * 60 * Math.PI) / 180) * 60,
                      Math.cos(((i * 60 + 360) * Math.PI) / 180) * 60,
                    ],
                    y: [
                      Math.sin((i * 60 * Math.PI) / 180) * 60,
                      Math.sin(((i * 60 + 360) * Math.PI) / 180) * 60,
                    ],
                    opacity: [0, 0.8, 0],
                    scale: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 3,
                    repeat: Infinity,
                    delay: i * 0.5,
                    ease: "linear",
                  }}
                />
              ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 5: Name and message */}
      <AnimatePresence>
        {(phase === "born" || phase === "ready") && (
          <motion.div
            className="absolute text-center"
            style={{ top: "60%" }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
          >
            <p
              className="text-lg font-bold"
              style={{ color: "rgba(255,255,255,0.9)" }}
            >
              あなたの分身が生まれました
            </p>
            <motion.p
              className="text-xs mt-2"
              style={{ color: "rgba(255,255,255,0.5)" }}
              animate={{ opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              世界を探索する準備ができています
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 6: CTA button */}
      <AnimatePresence>
        {phase === "ready" && (
          <motion.div
            className="absolute"
            style={{ bottom: 80 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <motion.button
              onClick={onComplete}
              className="px-10 py-4 rounded-full text-base font-bold text-white border-none cursor-pointer"
              style={{
                background: RV_COLORS.gradient,
                boxShadow: `0 4px 30px ${RV_COLORS.primaryGlow}`,
              }}
              whileTap={{ scale: 0.95 }}
              whileHover={{ scale: 1.03 }}
              animate={{
                boxShadow: [
                  `0 4px 30px ${RV_COLORS.primaryGlow}`,
                  `0 4px 50px ${RV_COLORS.primaryGlow}`,
                  `0 4px 30px ${RV_COLORS.primaryGlow}`,
                ],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              分身を世界に放つ
            </motion.button>

            {/* Sound suggestion */}
            <motion.div
              className="flex items-center justify-center gap-2 mt-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
            >
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                &#x266A;
              </span>
              <p className="text-[10px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                サウンドをオンにすると体験が向上します
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sparkle effects */}
      {(phase === "born" || phase === "ready") &&
        [...Array(12)].map((_, i) => (
          <motion.div
            key={`sparkle-${i}`}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: "white",
              top: `${20 + Math.random() * 60}%`,
              left: `${10 + Math.random() * 80}%`,
            }}
            animate={{
              opacity: [0, 1, 0],
              scale: [0, 1.5, 0],
            }}
            transition={{
              duration: 1.5 + Math.random(),
              repeat: Infinity,
              delay: Math.random() * 3,
            }}
          />
        ))}
    </motion.div>
  );
}
