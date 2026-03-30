"use client";

/**
 * MetamorphosisWhisper
 * Animaからの関係変態シグナルを、底部からスライドアップする囁きカードとして表示。
 * ユーザーが「気づいた」ボタンを押すまで表示し続ける（熟考の瞬間）。
 */

import { motion, AnimatePresence } from "framer-motion";
import type { MetamorphosisSignal } from "@/lib/rendezvous/metamorphosis";
import { GlassButton } from "@/components/ui/glassmorphism-design";

type Props = {
  signal: MetamorphosisSignal;
  onAcknowledge: () => void;
};

const DIRECTION_GRADIENTS: Record<
  MetamorphosisSignal["direction"],
  { border: string; bg: string }
> = {
  rising: {
    border: "linear-gradient(135deg, #F59E0B, #EC4899)",
    bg: "rgba(245, 158, 11, 0.04)",
  },
  cooling: {
    border: "linear-gradient(135deg, #6366F1, #94A3B8)",
    bg: "rgba(99, 102, 241, 0.04)",
  },
  shifting: {
    border: "linear-gradient(135deg, #8B5CF6, #06B6D4)",
    bg: "rgba(139, 92, 246, 0.04)",
  },
};

export default function MetamorphosisWhisper({ signal, onAcknowledge }: Props) {
  const style = DIRECTION_GRADIENTS[signal.direction];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 120, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 120, opacity: 0 }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          padding: "0 16px 24px",
          paddingBottom: "max(24px, env(safe-area-inset-bottom))",
          pointerEvents: "auto",
        }}
      >
        {/* Glassmorphism backdrop */}
        <div
          style={{
            maxWidth: 440,
            margin: "0 auto",
            position: "relative",
            borderRadius: 24,
            overflow: "hidden",
          }}
        >
          {/* Gradient border effect — wrapper with gradient bg + inset solid bg */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: 24,
              background: style.border,
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: 1.5,
              borderRadius: 22.5,
              background: style.bg || "rgba(255,255,255,0.95)",
            }}
          />

          {/* Card content */}
          <div
            style={{
              background: style.bg,
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              borderRadius: 24,
              padding: "28px 24px 20px",
              border: "1px solid rgba(255,255,255,0.6)",
              boxShadow: "0 -8px 40px rgba(0,0,0,0.08)",
            }}
          >
            {/* Anima icon */}
            <div
              style={{
                textAlign: "center",
                marginBottom: 16,
                fontSize: 24,
              }}
            >
              🌙
            </div>

            {/* Whisper text */}
            <p
              style={{
                fontSize: 15,
                lineHeight: 1.8,
                color: "rgba(30, 30, 60, 0.75)",
                fontWeight: 400,
                fontStyle: "italic",
                textAlign: "center",
                marginBottom: 20,
                letterSpacing: "0.02em",
              }}
            >
              {signal.whisperJa}
            </p>

            {/* Magnitude indicator — subtle dots */}
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 4,
                marginBottom: 20,
              }}
            >
              {[0.25, 0.5, 0.75, 1.0].map((threshold) => (
                <motion.div
                  key={threshold}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background:
                      signal.magnitude >= threshold
                        ? signal.direction === "rising"
                          ? "#F59E0B"
                          : signal.direction === "cooling"
                            ? "#6366F1"
                            : "#8B5CF6"
                        : "rgba(30,30,60,0.08)",
                  }}
                  animate={
                    signal.magnitude >= threshold
                      ? { scale: [1, 1.3, 1] }
                      : {}
                  }
                  transition={{
                    duration: 2,
                    repeat: Infinity,
                    delay: threshold * 0.3,
                  }}
                />
              ))}
            </div>

            {/* Acknowledge button */}
            <div style={{ display: "flex", justifyContent: "center" }}>
              <GlassButton
                variant="secondary"
                size="sm"
                onClick={onAcknowledge}
              >
                気づいた
              </GlassButton>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
