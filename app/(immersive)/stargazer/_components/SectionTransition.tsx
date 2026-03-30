// app/stargazer/_components/SectionTransition.tsx
// セクション間・タブ間の映画的トランジション
// 3種のプリセット: fade / slide / cosmic（星が流れるような効果）
"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import React, { useMemo } from "react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Direction = "up" | "down" | "left" | "right";
type Preset = "fade" | "slide" | "cosmic";

export interface SectionTransitionProps {
  children: React.ReactNode;
  /** トランジションプリセット */
  preset?: Preset;
  /** スライド方向（slide / cosmic プリセット用） */
  direction?: Direction;
  /** 遅延 (秒) */
  delay?: number;
  /** AnimatePresence の key — 切り替え対象の識別子 */
  transitionKey: string;
  /** アニメーション完了時コールバック */
  onComplete?: () => void;
  className?: string;
}

// ---------------------------------------------------------------------------
// Direction → offset mapping
// ---------------------------------------------------------------------------

function getDirectionOffset(direction: Direction): { x: number; y: number } {
  switch (direction) {
    case "up":
      return { x: 0, y: 60 };
    case "down":
      return { x: 0, y: -60 };
    case "left":
      return { x: 60, y: 0 };
    case "right":
      return { x: -60, y: 0 };
  }
}

// ---------------------------------------------------------------------------
// Preset variants
// ---------------------------------------------------------------------------

function buildFadeVariants(delay: number): Variants {
  return {
    initial: {
      opacity: 0,
      filter: "blur(8px)",
    },
    animate: {
      opacity: 1,
      filter: "blur(0px)",
      transition: {
        duration: 0.25,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
    exit: {
      opacity: 0,
      filter: "blur(6px)",
      transition: {
        duration: 0.2,
        ease: [0.55, 0.06, 0.68, 0.19],
      },
    },
  };
}

function buildSlideVariants(direction: Direction, delay: number): Variants {
  const offset = getDirectionOffset(direction);
  return {
    initial: {
      opacity: 0,
      x: offset.x,
      y: offset.y,
      filter: "blur(6px)",
      scale: 0.97,
    },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
      transition: {
        duration: 0.25,
        delay,
        ease: [0.25, 0.46, 0.45, 0.94],
      },
    },
    exit: {
      opacity: 0,
      x: -offset.x * 0.5,
      y: -offset.y * 0.5,
      filter: "blur(4px)",
      scale: 0.98,
      transition: {
        duration: 0.2,
        ease: [0.55, 0.06, 0.68, 0.19],
      },
    },
  };
}

function buildCosmicVariants(direction: Direction, delay: number): Variants {
  const offset = getDirectionOffset(direction);
  return {
    initial: {
      opacity: 0,
      x: offset.x * 1.5,
      y: offset.y * 1.5,
      filter: "blur(12px)",
      scale: 0.92,
    },
    animate: {
      opacity: 1,
      x: 0,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
      transition: {
        duration: 0.2,
        delay,
        ease: [0.22, 1, 0.36, 1],
      },
    },
    exit: {
      opacity: 0,
      x: -offset.x,
      y: -offset.y,
      filter: "blur(10px)",
      scale: 0.9,
      transition: {
        duration: 0.18,
        ease: [0.55, 0.06, 0.68, 0.19],
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Star particles for cosmic preset
// ---------------------------------------------------------------------------

function CosmicStars({ direction }: { direction: Direction }) {
  const particles = useMemo(() => {
    const offset = getDirectionOffset(direction);
    return Array.from({ length: 8 }, (_, i) => ({
      id: i,
      // ランダムな開始位置
      startX: Math.random() * 100,
      startY: Math.random() * 100,
      // 流れる方向
      endX: offset.x > 0 ? -20 : offset.x < 0 ? 120 : Math.random() * 100,
      endY: offset.y > 0 ? -20 : offset.y < 0 ? 120 : Math.random() * 100,
      size: 1 + Math.random() * 2,
      delay: Math.random() * 0.3,
      duration: 0.22 + Math.random() * 0.3,
    }));
  }, [direction]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full bg-white"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.startX}%`,
            top: `${p.startY}%`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0, 1.5, 0],
            left: `${p.endX}%`,
            top: `${p.endY}%`,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            ease: "easeOut",
          }}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SectionTransition({
  children,
  preset = "fade",
  direction = "up",
  delay = 0,
  transitionKey,
  onComplete,
  className,
}: SectionTransitionProps) {
  const variants = useMemo(() => {
    switch (preset) {
      case "fade":
        return buildFadeVariants(delay);
      case "slide":
        return buildSlideVariants(direction, delay);
      case "cosmic":
        return buildCosmicVariants(direction, delay);
    }
  }, [preset, direction, delay]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={transitionKey}
        variants={variants}
        initial="initial"
        animate="animate"
        exit="exit"
        onAnimationComplete={() => onComplete?.()}
        className={`relative ${className ?? ""}`}
      >
        {preset === "cosmic" && <CosmicStars direction={direction} />}
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
