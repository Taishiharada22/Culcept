"use client";

/**
 * MatchRevealCeremony
 * Full-screen, 3-phase celebration overlay for mutual_liked.
 * Replaces RendezvousConversationPrompt with a dramatic emotional peak.
 *
 * Phase 1 (0-1.5s): Dark backdrop + two converging orbs
 * Phase 2 (1.5-3s): Convergence burst + golden particles + title
 * Phase 3 (3s+):    Action buttons slide up
 */

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { hapticSuccess } from "@/lib/rendezvous/haptics";
import {
  generateEncounterNarrative,
  generateRevealSubtext,
} from "@/lib/rendezvous/encounterNarrative";
import type { RendezvousCategory, EncounterTriggerType } from "@/lib/rendezvous/types";

type Props = {
  candidateId: string;
  onStartChat: () => void;
  onLater: () => void;
  /** Optional metadata for narrative generation */
  category?: RendezvousCategory;
  triggerType?: EncounterTriggerType;
  syncPercent?: number;
};

// Generate stable random particles on mount
function useParticles(count: number) {
  return useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      angle: (360 / count) * i + Math.random() * 30 - 15,
      distance: 80 + Math.random() * 120,
      size: 3 + Math.random() * 5,
      delay: Math.random() * 0.3,
      duration: 0.8 + Math.random() * 0.6,
      hue: 35 + Math.random() * 25, // golden range
    }));
  }, [count]);
}

export default function MatchRevealCeremony({
  candidateId,
  onStartChat,
  onLater,
  category = "romantic",
  triggerType = "system_retest",
  syncPercent = 70,
}: Props) {
  const [phase, setPhase] = useState(0);
  const particles = useParticles(24);

  // Generate encounter narrative from lib
  const narrative = useMemo(
    () => generateEncounterNarrative({ category, triggerType, syncPercent }),
    [category, triggerType, syncPercent],
  );
  const subtext = useMemo(
    () => generateRevealSubtext(category, syncPercent),
    [category, syncPercent],
  );

  useEffect(() => {
    // Phase transitions
    const t1 = setTimeout(() => setPhase(1), 100); // start immediately
    const t2 = setTimeout(() => {
      setPhase(2);
      hapticSuccess();
    }, 1600);
    const t3 = setTimeout(() => setPhase(3), 3200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Background: dark to glassmorphism transition */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          background:
            phase >= 3
              ? "rgba(248,247,255,0.95)"
              : "rgba(15,15,35,0.88)",
        }}
        transition={{ duration: phase >= 3 ? 0.8 : 0.6 }}
        style={{
          position: "absolute",
          inset: 0,
          backdropFilter: "blur(20px)",
        }}
      />

      {/* Phase 1-2: Converging orbs */}
      <AnimatePresence>
        {phase >= 1 && phase < 3 && (
          <>
            {/* Left orb (indigo) */}
            <motion.div
              initial={{ x: -200, y: -60, opacity: 0, scale: 0.3 }}
              animate={{
                x: phase >= 2 ? 0 : -40,
                y: phase >= 2 ? 0 : -20,
                opacity: phase >= 2 ? 0 : 1,
                scale: phase >= 2 ? 2 : 1,
              }}
              exit={{ opacity: 0, scale: 3 }}
              transition={{
                type: "spring",
                stiffness: 80,
                damping: 15,
                duration: 1.2,
              }}
              style={{
                position: "absolute",
                width: 40,
                height: 40,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(99,102,241,0.9), rgba(99,102,241,0.3))",
                boxShadow: "0 0 40px rgba(99,102,241,0.6), 0 0 80px rgba(99,102,241,0.3)",
                zIndex: 2,
              }}
            />

            {/* Right orb (violet) */}
            <motion.div
              initial={{ x: 200, y: 60, opacity: 0, scale: 0.3 }}
              animate={{
                x: phase >= 2 ? 0 : 40,
                y: phase >= 2 ? 0 : 20,
                opacity: phase >= 2 ? 0 : 1,
                scale: phase >= 2 ? 2 : 1,
              }}
              exit={{ opacity: 0, scale: 3 }}
              transition={{
                type: "spring",
                stiffness: 80,
                damping: 15,
                duration: 1.2,
              }}
              style={{
                position: "absolute",
                width: 40,
                height: 40,
                borderRadius: "50%",
                background:
                  "radial-gradient(circle, rgba(139,92,246,0.9), rgba(139,92,246,0.3))",
                boxShadow: "0 0 40px rgba(139,92,246,0.6), 0 0 80px rgba(139,92,246,0.3)",
                zIndex: 2,
              }}
            />
          </>
        )}
      </AnimatePresence>

      {/* Phase 2: Central burst glow */}
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: [0, 1, 0.3], scale: [0, 1.5, 0.8] }}
            transition={{ duration: 1.2, ease: "easeOut" }}
            style={{
              position: "absolute",
              width: 200,
              height: 200,
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(251,191,36,0.4), rgba(99,102,241,0.15), transparent)",
              zIndex: 1,
            }}
          />
        )}
      </AnimatePresence>

      {/* Phase 2: Golden particles */}
      <AnimatePresence>
        {phase >= 2 && phase < 3 && (
          <>
            {particles.map((p) => {
              const rad = (p.angle * Math.PI) / 180;
              const tx = Math.cos(rad) * p.distance;
              const ty = Math.sin(rad) * p.distance;
              return (
                <motion.div
                  key={p.id}
                  initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
                  animate={{
                    x: tx,
                    y: ty,
                    opacity: 0,
                    scale: 0.2,
                  }}
                  transition={{
                    duration: p.duration,
                    delay: p.delay,
                    ease: "easeOut",
                  }}
                  style={{
                    position: "absolute",
                    width: p.size,
                    height: p.size,
                    borderRadius: "50%",
                    background: `hsl(${p.hue}, 90%, 65%)`,
                    boxShadow: `0 0 ${p.size * 2}px hsl(${p.hue}, 90%, 65%)`,
                    zIndex: 3,
                  }}
                />
              );
            })}
          </>
        )}
      </AnimatePresence>

      {/* Phase 2+: Title text */}
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3, ease: "easeOut" }}
            style={{
              position: "relative",
              zIndex: 10,
              textAlign: "center",
              marginBottom: phase >= 3 ? 40 : 0,
            }}
          >
            <motion.h2
              animate={{
                color: phase >= 3 ? "#6366F1" : "#FFFFFF",
              }}
              transition={{ duration: 0.6 }}
              style={{
                fontSize: 22,
                fontWeight: 800,
                letterSpacing: 2,
                marginBottom: 8,
                textShadow:
                  phase < 3
                    ? "0 0 30px rgba(251,191,36,0.5)"
                    : "none",
              }}
            >
              {narrative}
            </motion.h2>
            <motion.p
              animate={{
                color:
                  phase >= 3
                    ? "rgba(30,30,60,0.55)"
                    : "rgba(255,255,255,0.6)",
              }}
              transition={{ duration: 0.6 }}
              style={{
                fontSize: 12,
                lineHeight: 1.7,
              }}
            >
              {subtext}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Phase 3: Action buttons */}
      <AnimatePresence>
        {phase >= 3 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: "easeOut" }}
            style={{
              position: "relative",
              zIndex: 10,
              width: "100%",
              maxWidth: 320,
              padding: "0 20px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <button
              onClick={onStartChat}
              style={{
                width: "100%",
                padding: "14px 0",
                borderRadius: 12,
                border: "none",
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                background: "linear-gradient(135deg, #6366F1, #8B5CF6)",
                boxShadow: "0 2px 20px rgba(99,102,241,0.3)",
                letterSpacing: 0.5,
              }}
            >
              会話を始める
            </button>
            <button
              onClick={onLater}
              style={{
                width: "100%",
                padding: "12px 0",
                borderRadius: 12,
                border: "1px solid rgba(30,30,60,0.08)",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(30,30,60,0.4)",
                background: "rgba(255,255,255,0.6)",
              }}
            >
              あとで開く
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ambient floating particles (Phase 3 - subtle) */}
      <AnimatePresence>
        {phase >= 3 && (
          <>
            {[0, 1, 2, 3, 4].map((i) => (
              <motion.div
                key={`ambient-${i}`}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0, 0.4, 0],
                  y: [-20, -80],
                  x: [0, (i % 2 === 0 ? 1 : -1) * (10 + i * 8)],
                }}
                transition={{
                  duration: 3 + i * 0.5,
                  repeat: Infinity,
                  delay: i * 0.6,
                  ease: "easeInOut",
                }}
                style={{
                  position: "absolute",
                  bottom: 100 + i * 30,
                  left: `${20 + i * 15}%`,
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  background: "rgba(99,102,241,0.3)",
                  zIndex: 1,
                }}
              />
            ))}
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
