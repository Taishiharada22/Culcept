"use client";

import { useEffect, useRef, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Crystal } from "@/lib/rendezvous/memoryCrystal";
import CrystalVisualizer from "@/components/rendezvous/CrystalVisualizer";

type Props = {
  crystal: Crystal;
  onView: () => void;
  onDismiss: () => void;
};

// ────────────────────────────────────────────
// Sparkle particles for the entrance animation
// ────────────────────────────────────────────

function Sparkles({ color }: { color: string }) {
  const particles = [
    { x: -18, y: -12, delay: 0, size: 3 },
    { x: 22, y: -8, delay: 0.1, size: 2.5 },
    { x: -10, y: 14, delay: 0.2, size: 2 },
    { x: 16, y: 10, delay: 0.15, size: 3.5 },
    { x: 0, y: -18, delay: 0.05, size: 2 },
  ];

  return (
    <>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 0, x: 0, y: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.2, 0],
            x: p.x,
            y: p.y,
          }}
          transition={{
            duration: 0.8,
            delay: p.delay + 0.2,
            ease: "easeOut",
          }}
          style={{
            position: "absolute",
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: color,
            left: "50%",
            top: "50%",
            pointerEvents: "none",
          }}
        />
      ))}
    </>
  );
}

const CrystalDetectionToast = memo(function CrystalDetectionToast({
  crystal,
  onView,
  onDismiss,
}: Props) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      onDismiss();
    }, 5000);

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 60, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.95 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        style={{
          position: "fixed",
          bottom: 80,
          left: 16,
          right: 16,
          zIndex: 50,
          maxWidth: 400,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 16px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px)",
          border: "1px solid rgba(99,102,241,0.1)",
          boxShadow: "0 8px 32px rgba(30,30,60,0.12), 0 2px 8px rgba(99,102,241,0.08)",
        }}
      >
        {/* Crystal icon with sparkles */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <CrystalVisualizer crystal={crystal} size="sm" />
          <Sparkles color={crystal.colorHex} />
        </div>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#1E1E3C",
              marginBottom: 2,
            }}
          >
            記憶の結晶が生まれました
          </div>
          <div
            style={{
              fontSize: 10,
              color: crystal.colorHex,
              fontWeight: 600,
            }}
          >
            {crystal.name}
          </div>
        </div>

        {/* View button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (timerRef.current) {
              clearTimeout(timerRef.current);
              timerRef.current = null;
            }
            onView();
          }}
          style={{
            padding: "6px 14px",
            borderRadius: 10,
            border: "none",
            background: `linear-gradient(135deg, ${crystal.colorHex}20, ${crystal.colorHex}10)`,
            color: crystal.colorHex,
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
            flexShrink: 0,
            whiteSpace: "nowrap",
          }}
        >
          見る
        </button>
      </motion.div>
    </AnimatePresence>
  );
});

export default CrystalDetectionToast;
