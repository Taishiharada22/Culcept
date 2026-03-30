// app/stargazer/_components/CelebrationOverlay.tsx
// 星粒子によるマイルストーン達成のセレブレーションオーバーレイ
// 用途: ストリークレベルアップ, 予測的中, マイルストーン到達
// スタイル: 宇宙的・瞑想的・大人向け（子供っぽいconfettiではない）
"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CelebrationOverlayProps {
  /** 表示するか */
  visible: boolean;
  /** タイトル（例: 「輪郭の兆候」マイルストーン到達） */
  title: string;
  /** サブテキスト */
  subtitle?: string;
  /** 自動消去までのミリ秒 (default: 3000) */
  duration?: number;
  /** 消去後のコールバック */
  onDismiss?: () => void;
  /** 粒子の色テーマ */
  theme?: "gold" | "silver" | "aurora";
  /** サウンドトリガー関数（外部から渡す） */
  onSoundTrigger?: () => void;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Particle definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface StarParticle {
  id: number;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  size: number;
  color: string;
  delay: number;
  duration: number;
  rotation: number;
  type: "dot" | "cross" | "ring";
}

const THEME_COLORS = {
  gold: [
    "rgba(220,200,120,0.9)",
    "rgba(190,170,110,0.8)",
    "rgba(240,220,140,0.7)",
    "rgba(200,180,100,0.6)",
    "rgba(255,240,180,0.5)",
  ],
  silver: [
    "rgba(180,190,210,0.9)",
    "rgba(160,170,200,0.8)",
    "rgba(200,210,230,0.7)",
    "rgba(150,165,195,0.6)",
    "rgba(220,225,240,0.5)",
  ],
  aurora: [
    "rgba(120,180,220,0.8)",
    "rgba(160,120,200,0.7)",
    "rgba(190,170,110,0.8)",
    "rgba(100,200,180,0.6)",
    "rgba(200,140,180,0.5)",
  ],
};

function generateParticles(theme: "gold" | "silver" | "aurora"): StarParticle[] {
  const colors = THEME_COLORS[theme];
  const particles: StarParticle[] = [];
  const count = 35;

  for (let i = 0; i < count; i++) {
    // Burst from center
    const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
    const distance = 80 + Math.random() * 180;
    const startX = 50;
    const startY = 50;
    const endX = startX + Math.cos(angle) * distance * (0.6 + Math.random() * 0.8);
    const endY = startY + Math.sin(angle) * distance * (0.6 + Math.random() * 0.8);

    particles.push({
      id: i,
      startX,
      startY,
      endX,
      endY,
      size: 1.5 + Math.random() * 3,
      color: colors[i % colors.length],
      delay: Math.random() * 0.3,
      duration: 1.2 + Math.random() * 1.0,
      rotation: Math.random() * 360,
      type: i % 7 === 0 ? "cross" : i % 5 === 0 ? "ring" : "dot",
    });
  }

  return particles;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single particle renderer
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ParticleElement({ particle }: { particle: StarParticle }) {
  if (particle.type === "cross") {
    return (
      <motion.div
        className="absolute"
        style={{
          left: `${particle.startX}%`,
          top: `${particle.startY}%`,
          width: particle.size * 2,
          height: particle.size * 2,
        }}
        initial={{
          x: 0,
          y: 0,
          opacity: 0,
          scale: 0,
          rotate: 0,
        }}
        animate={{
          x: particle.endX - particle.startX + "%",
          y: particle.endY - particle.startY + "%",
          opacity: [0, 1, 1, 0],
          scale: [0, 1.2, 1, 0.3],
          rotate: particle.rotation,
        }}
        transition={{
          duration: particle.duration,
          delay: particle.delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <svg
          width={particle.size * 2}
          height={particle.size * 2}
          viewBox="0 0 10 10"
        >
          <line
            x1="5" y1="1" x2="5" y2="9"
            stroke={particle.color}
            strokeWidth="1"
            strokeLinecap="round"
          />
          <line
            x1="1" y1="5" x2="9" y2="5"
            stroke={particle.color}
            strokeWidth="1"
            strokeLinecap="round"
          />
        </svg>
      </motion.div>
    );
  }

  if (particle.type === "ring") {
    return (
      <motion.div
        className="absolute rounded-full"
        style={{
          left: `${particle.startX}%`,
          top: `${particle.startY}%`,
          width: particle.size * 2.5,
          height: particle.size * 2.5,
          border: `1px solid ${particle.color}`,
        }}
        initial={{
          x: 0,
          y: 0,
          opacity: 0,
          scale: 0,
        }}
        animate={{
          x: particle.endX - particle.startX + "%",
          y: particle.endY - particle.startY + "%",
          opacity: [0, 0.8, 0.6, 0],
          scale: [0, 1.5, 1.2, 0.5],
        }}
        transition={{
          duration: particle.duration,
          delay: particle.delay,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
    );
  }

  // Default: dot
  return (
    <motion.div
      className="absolute rounded-full"
      style={{
        left: `${particle.startX}%`,
        top: `${particle.startY}%`,
        width: particle.size,
        height: particle.size,
        background: particle.color,
        boxShadow: `0 0 ${particle.size * 2}px ${particle.color}`,
      }}
      initial={{
        x: 0,
        y: 0,
        opacity: 0,
        scale: 0,
      }}
      animate={{
        x: particle.endX - particle.startX + "%",
        y: particle.endY - particle.startY + "%",
        opacity: [0, 1, 0.8, 0],
        scale: [0, 1.3, 1, 0.2],
      }}
      transition={{
        duration: particle.duration,
        delay: particle.delay,
        ease: [0.22, 1, 0.36, 1],
      }}
    />
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function CelebrationOverlay({
  visible,
  title,
  subtitle,
  duration = 3000,
  onDismiss,
  theme = "gold",
  onSoundTrigger,
}: CelebrationOverlayProps) {
  const [show, setShow] = useState(false);
  const particles = useMemo(() => generateParticles(theme), [theme]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- sync internal show state with visible prop */
    if (!visible) {
      setShow(false);
      return;
    }

    setShow(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    onSoundTrigger?.();

    const timer = setTimeout(() => {
      setShow(false);
      setTimeout(() => onDismiss?.(), 500); // wait for exit animation
    }, duration);

    return () => clearTimeout(timer);
  }, [visible, duration, onDismiss, onSoundTrigger]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
        >
          {/* Subtle backdrop glow */}
          <motion.div
            className="absolute inset-0"
            style={{
              background:
                theme === "gold"
                  ? "radial-gradient(circle at 50% 50%, rgba(220,200,120,0.08) 0%, transparent 60%)"
                  : theme === "silver"
                    ? "radial-gradient(circle at 50% 50%, rgba(180,190,220,0.08) 0%, transparent 60%)"
                    : "radial-gradient(circle at 50% 50%, rgba(160,140,200,0.08) 0%, transparent 60%)",
            }}
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.5, opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
          />

          {/* Particle burst */}
          <div className="absolute inset-0 overflow-hidden">
            {particles.map((p) => (
              <ParticleElement key={p.id} particle={p} />
            ))}
          </div>

          {/* Central glow ring */}
          <motion.div
            className="absolute rounded-full"
            style={{
              width: 120,
              height: 120,
              background:
                theme === "gold"
                  ? "radial-gradient(circle, rgba(220,200,120,0.15) 0%, transparent 70%)"
                  : theme === "silver"
                    ? "radial-gradient(circle, rgba(180,190,220,0.15) 0%, transparent 70%)"
                    : "radial-gradient(circle, rgba(160,140,200,0.15) 0%, transparent 70%)",
              filter: "blur(20px)",
            }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{
              scale: [0, 2.5, 2],
              opacity: [0, 0.8, 0],
            }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />

          {/* Text overlay */}
          <motion.div
            className="relative z-10 text-center px-6"
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{
              delay: 0.3,
              duration: 0.25,
              type: "spring",
              stiffness: 200,
              damping: 20,
            }}
          >
            <p
              className="font-display text-lg font-semibold"
              style={{ color: "rgba(30,35,55,0.9)" }}
            >
              {title}
            </p>
            {subtitle && (
              <motion.p
                className="text-sm mt-2"
                style={{ color: "rgba(60,65,85,0.6)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                {subtitle}
              </motion.p>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
