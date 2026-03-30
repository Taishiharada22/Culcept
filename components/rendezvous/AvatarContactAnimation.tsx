"use client";

/**
 * AvatarContactAnimation
 * 2つのアバターオーブが軌道上で交差するアニメーション
 * 新しいcandidateが初めて表示される時に再生される
 */

import { motion } from "framer-motion";
import type { RendezvousCategory } from "@/lib/rendezvous/types";

const CATEGORY_COLORS: Record<RendezvousCategory, string> = {
  romantic: "#FF6B9D",
  friendship: "#4AEAFF",
  cocreation: "#D4A017",
  community: "#8B5CF6",
  partner: "#D4776B",
};

type Props = {
  category: RendezvousCategory;
  crossingOrigin?: string;
  onComplete: () => void;
};

export default function AvatarContactAnimation({
  category,
  crossingOrigin,
  onComplete,
}: Props) {
  const color = CATEGORY_COLORS[category] ?? "#6366F1";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(180deg, #0D0D1A 0%, #1A1A2E 100%)",
        fontFamily: "'Noto Sans JP', sans-serif",
      }}
    >
      {/* Orbital paths */}
      <div style={{ position: "relative", width: 240, height: 240, marginBottom: 32 }}>
        {/* Orbit ring */}
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          style={{
            position: "absolute",
            inset: 0,
            border: `1px solid ${color}20`,
            borderRadius: "50%",
          }}
        />

        {/* Orb A (left → center) */}
        <motion.div
          initial={{ x: -100, y: 0, scale: 0.5, opacity: 0 }}
          animate={{
            x: [-100, -20, 0],
            y: [0, -10, 0],
            scale: [0.5, 0.8, 1],
            opacity: [0, 0.8, 1],
          }}
          transition={{ duration: 2, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 48,
            height: 48,
            marginTop: -24,
            marginLeft: -50,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${color}AA 0%, ${color}44 70%, transparent 100%)`,
            boxShadow: `0 0 30px ${color}66`,
          }}
        />

        {/* Orb B (right → center) */}
        <motion.div
          initial={{ x: 100, y: 0, scale: 0.5, opacity: 0 }}
          animate={{
            x: [100, 20, 0],
            y: [0, 10, 0],
            scale: [0.5, 0.8, 1],
            opacity: [0, 0.8, 1],
          }}
          transition={{ duration: 2, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 48,
            height: 48,
            marginTop: -24,
            marginLeft: 2,
            borderRadius: "50%",
            background: `radial-gradient(circle, rgba(255,255,255,0.7) 0%, rgba(255,255,255,0.2) 70%, transparent 100%)`,
            boxShadow: "0 0 30px rgba(255,255,255,0.3)",
          }}
        />

        {/* Sync ring (appears at convergence) */}
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.5, 1.2], opacity: [0, 0.8, 0.5] }}
          transition={{ delay: 1.8, duration: 1.2 }}
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            width: 80,
            height: 80,
            marginTop: -40,
            marginLeft: -40,
            borderRadius: "50%",
            border: `2px solid ${color}`,
            boxShadow: `0 0 40px ${color}44`,
          }}
        />

        {/* Particles */}
        {Array.from({ length: 8 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 1, 0],
              opacity: [0, 0.7, 0],
              x: Math.cos((i / 8) * Math.PI * 2) * 60,
              y: Math.sin((i / 8) * Math.PI * 2) * 60,
            }}
            transition={{ delay: 2 + i * 0.1, duration: 1 }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 4,
              height: 4,
              marginTop: -2,
              marginLeft: -2,
              borderRadius: "50%",
              background: color,
            }}
          />
        ))}
      </div>

      {/* Text */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 2.5, duration: 0.8 }}
        style={{ textAlign: "center" }}
      >
        <p
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "rgba(255,255,255,0.9)",
            marginBottom: 8,
          }}
        >
          軌道の交差を検出
        </p>
        {crossingOrigin && (
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
            {crossingOrigin}
          </p>
        )}
      </motion.div>

      {/* Tap to continue */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3.5 }}
        onClick={onComplete}
        style={{
          position: "absolute",
          bottom: 60,
          padding: "12px 32px",
          borderRadius: 12,
          border: `1px solid ${color}44`,
          background: `${color}15`,
          color: "rgba(255,255,255,0.7)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        交差を見る
      </motion.button>
    </motion.div>
  );
}
