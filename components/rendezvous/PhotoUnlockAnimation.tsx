"use client";

/**
 * PhotoUnlockAnimation
 * Phase 1 写真が初めて解放されるときの演出ラッパー
 *
 * 1. ゴールドのグロー + ボーダーパルス
 * 2. ロックアイコンが開くアニメーション
 * 3. フロストガラス越しに写真がフェードイン
 * 4. 「新しい写真が解放されました」テキスト
 */

import { useState, useEffect, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface PhotoUnlockAnimationProps {
  children: ReactNode;
  isNewUnlock: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PhotoUnlockAnimation({
  children,
  isNewUnlock,
}: PhotoUnlockAnimationProps) {
  const [phase, setPhase] = useState<"glow" | "unlock" | "reveal" | "done">(
    isNewUnlock ? "glow" : "done",
  );

  useEffect(() => {
    if (!isNewUnlock) {
      setPhase("done");
      return;
    }

    // Glow phase: 0 - 1.2s
    const t1 = setTimeout(() => setPhase("unlock"), 1200);
    // Unlock phase: 1.2 - 2.4s
    const t2 = setTimeout(() => setPhase("reveal"), 2400);
    // Reveal phase: 2.4 - 4s → done
    const t3 = setTimeout(() => setPhase("done"), 4000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [isNewUnlock]);

  // Already done — just render children
  if (phase === "done") {
    return <>{children}</>;
  }

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* Children behind the overlay */}
      <div
        style={{
          opacity: phase === "reveal" ? 1 : 0.3,
          transition: "opacity 0.8s ease-out",
          filter: phase === "reveal" ? "none" : "blur(12px)",
        }}
      >
        {children}
      </div>

      {/* Overlay */}
      <AnimatePresence>
        {(phase as string) !== "done" && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 20,
              overflow: "hidden",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 16,
              zIndex: 10,
            }}
          >
            {/* Frosted background */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                background:
                  phase === "reveal"
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(255,255,255,0.7)",
                backdropFilter:
                  phase === "reveal" ? "blur(2px)" : "blur(16px)",
                WebkitBackdropFilter:
                  phase === "reveal" ? "blur(2px)" : "blur(16px)",
                transition:
                  "background 0.8s ease-out, backdrop-filter 0.8s ease-out",
              }}
            />

            {/* Golden glow border */}
            {phase === "glow" && (
              <motion.div
                animate={{
                  boxShadow: [
                    "inset 0 0 0px rgba(251,191,36,0)",
                    "inset 0 0 30px rgba(251,191,36,0.3)",
                    "inset 0 0 0px rgba(251,191,36,0)",
                  ],
                }}
                transition={{
                  duration: 1.2,
                  repeat: 1,
                  ease: "easeInOut",
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  borderRadius: 20,
                  border: "2px solid rgba(251,191,36,0.4)",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Lock icon — animates from locked to unlocked */}
            <motion.div
              style={{ position: "relative", zIndex: 2 }}
              animate={
                phase === "unlock"
                  ? {
                      scale: [1, 1.3, 0.8, 0],
                      rotate: [0, -15, 15, 0],
                      opacity: [1, 1, 1, 0],
                    }
                  : phase === "glow"
                    ? {
                        scale: [1, 1.05, 1],
                      }
                    : { opacity: 0 }
              }
              transition={{
                duration: phase === "glow" ? 1.2 : 1,
                repeat: phase === "glow" ? Infinity : 0,
                ease: "easeInOut",
              }}
            >
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 20,
                  background:
                    phase === "unlock"
                      ? "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(249,115,22,0.15))"
                      : "rgba(251,191,36,0.08)",
                  border: "2px solid rgba(251,191,36,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                }}
              >
                {phase === "unlock" ? "\u{1F513}" : "\u{1F512}"}
              </div>
            </motion.div>

            {/* Text */}
            {phase === "reveal" && (
              <motion.p
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6 }}
                style={{
                  position: "relative",
                  zIndex: 2,
                  fontSize: 13,
                  fontWeight: 700,
                  color: RV_COLORS.primary,
                  textAlign: "center",
                  padding: "6px 16px",
                  borderRadius: 12,
                  background: "rgba(255,255,255,0.8)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  boxShadow: `0 2px 12px ${RV_COLORS.primaryGlow}`,
                }}
              >
                新しい写真が解放されました
              </motion.p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
