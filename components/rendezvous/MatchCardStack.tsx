"use client";

import { useState, useCallback } from "react";
import {
  motion,
  useMotionValue,
  useTransform,
  AnimatePresence,
  type PanInfo,
} from "framer-motion";
import MatchCard, { type MatchCardCandidate } from "./MatchCard";
import { hapticLight, hapticMedium, hapticHeavy } from "@/lib/rendezvous/haptics";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

// ---------- Constants ----------

const SWIPE_THRESHOLD_X = 100;
const SWIPE_THRESHOLD_Y = -100;
const EXIT_VELOCITY = 800;
const CARD_OFFSETS = [
  { y: 0, scale: 1, opacity: 1 },
  { y: 10, scale: 0.95, opacity: 0.7 },
  { y: 20, scale: 0.90, opacity: 0.4 },
];

type SwipeDirection = "right" | "left" | "up";

// ---------- Swipe Action Overlay (感情的フィードバック) ----------

function SwipeOverlay({ x, y }: { x: any; y: any }) {
  return (
    <>
      {/* Right = Interest — ワインレッドのオーラ */}
      <motion.div
        className="absolute inset-0 rounded-3xl z-30 flex items-center justify-center pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${RV_COLORS.primary}20 0%, transparent 70%)`,
          opacity: useTransform(x, [0, 60, SWIPE_THRESHOLD_X], [0, 0, 1]),
        }}
      >
        <motion.div
          className="flex flex-col items-center gap-2"
          style={{
            opacity: useTransform(x, [0, 60, SWIPE_THRESHOLD_X], [0, 0, 1]),
            scale: useTransform(x, [60, SWIPE_THRESHOLD_X + 40], [0.5, 1]),
          }}
        >
          <span className="text-5xl">
            ✨
          </span>
          <span
            className="text-sm font-bold tracking-wider"
            style={{
              color: RV_COLORS.primary,
            }}
          >
            興味あり
          </span>
        </motion.div>
      </motion.div>

      {/* Left = Pass — 静かなフェードアウト */}
      <motion.div
        className="absolute inset-0 rounded-3xl z-30 flex items-center justify-center pointer-events-none"
        style={{
          backgroundColor: "rgba(245,243,240,0.6)",
          opacity: useTransform(x, [0, -60, -SWIPE_THRESHOLD_X], [0, 0, 0.8]),
        }}
      >
        <motion.span
          className="text-lg font-medium tracking-wider"
          style={{
            color: RV_COLORS.textMuted,
            opacity: useTransform(x, [0, -60, -SWIPE_THRESHOLD_X], [0, 0, 1]),
          }}
        >
          スキップ
        </motion.span>
      </motion.div>

      {/* Up = Super Resonance — オレンジの光 */}
      <motion.div
        className="absolute inset-0 rounded-3xl z-30 flex items-center justify-center pointer-events-none"
        style={{
          background: `radial-gradient(circle at center, ${RV_COLORS.accent}18 0%, ${RV_COLORS.primary}08 40%, transparent 70%)`,
          opacity: useTransform(y, [0, -60, SWIPE_THRESHOLD_Y], [0, 0, 1]),
        }}
      >
        <motion.div
          className="flex flex-col items-center gap-2"
          style={{
            opacity: useTransform(y, [0, -60, SWIPE_THRESHOLD_Y], [0, 0, 1]),
            scale: useTransform(y, [-60, SWIPE_THRESHOLD_Y - 40], [0.5, 1]),
          }}
        >
          <span className="text-5xl">
            ⚡
          </span>
          <span
            className="text-sm font-bold tracking-wider"
            style={{
              color: RV_COLORS.accent,
            }}
          >
            超共鳴
          </span>
        </motion.div>
      </motion.div>
    </>
  );
}

// ---------- Draggable Card Wrapper ----------

function DraggableCard({
  candidate,
  onSwipe,
}: {
  candidate: MatchCardCandidate;
  onSwipe: (direction: SwipeDirection) => void;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useTransform(x, [-200, 200], [-12, 12]);

  const handleDragEnd = useCallback(
    (_: any, info: PanInfo) => {
      const { offset, velocity } = info;
      if (offset.y < SWIPE_THRESHOLD_Y || velocity.y < -EXIT_VELOCITY) {
        onSwipe("up");
        return;
      }
      if (offset.x > SWIPE_THRESHOLD_X || velocity.x > EXIT_VELOCITY) {
        onSwipe("right");
        return;
      }
      if (offset.x < -SWIPE_THRESHOLD_X || velocity.x < -EXIT_VELOCITY) {
        onSwipe("left");
        return;
      }
    },
    [onSwipe],
  );

  return (
    <motion.div
      className="absolute inset-0 touch-none cursor-grab active:cursor-grabbing"
      style={{ x, y, rotate, zIndex: 10 }}
      drag
      dragConstraints={{ top: 0, left: 0, right: 0, bottom: 0 }}
      dragElastic={1}
      dragSnapToOrigin
      onDragEnd={handleDragEnd}
      exit={{
        opacity: 0,
        transition: { duration: 0.3 },
      }}
      whileDrag={{ scale: 1.02 }}
    >
      <MatchCard candidate={candidate} className="h-full" />
      <SwipeOverlay x={x} y={y} />
    </motion.div>
  );
}

// ---------- MatchCardStack ----------

interface MatchCardStackProps {
  candidates: MatchCardCandidate[];
  onSwipeRight: (candidateId: string) => void;
  onSwipeLeft: (candidateId: string) => void;
  onSwipeUp: (candidateId: string) => void;
}

export default function MatchCardStack({
  candidates,
  onSwipeRight,
  onSwipeLeft,
  onSwipeUp,
}: MatchCardStackProps) {
  const [stack, setStack] = useState(candidates);

  const handleSwipe = useCallback(
    (direction: SwipeDirection) => {
      if (stack.length === 0) return;
      const top = stack[0];
      setStack((prev) => prev.slice(1));

      switch (direction) {
        case "right":
          onSwipeRight(top.candidateId);
          break;
        case "left":
          onSwipeLeft(top.candidateId);
          break;
        case "up":
          onSwipeUp(top.candidateId);
          break;
      }

      if (direction === "right") hapticMedium();
      else if (direction === "left") hapticLight();
      else if (direction === "up") hapticHeavy();
    },
    [stack, onSwipeRight, onSwipeLeft, onSwipeUp],
  );

  const visible = stack.slice(0, 3);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[540px] gap-5">
        <motion.div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: `radial-gradient(circle, ${RV_COLORS.primary}15 0%, transparent 70%)`,
          }}
          animate={{ scale: [1, 1.15, 1], opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="text-3xl">
            🔭
          </span>
        </motion.div>
        <p className="text-sm font-medium" style={{ color: RV_COLORS.textSub }}>
          新しい候補を探しています...
        </p>
        <p className="text-xs" style={{ color: RV_COLORS.textMuted }}>
          あなたの分身が宇宙を巡っています
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative w-full mx-auto"
      style={{ maxWidth: 360, height: 540 }}
    >
      {visible
        .slice()
        .reverse()
        .map((c, reverseIdx) => {
          const idx = visible.length - 1 - reverseIdx;
          const offset = CARD_OFFSETS[idx] ?? CARD_OFFSETS[2];

          if (idx === 0) {
            return (
              <AnimatePresence key={c.candidateId}>
                <DraggableCard
                  candidate={c}
                  onSwipe={handleSwipe}
                />
              </AnimatePresence>
            );
          }

          return (
            <motion.div
              key={c.candidateId}
              className="absolute inset-0 pointer-events-none"
              animate={{
                y: offset.y,
                scale: offset.scale,
                opacity: offset.opacity,
              }}
              transition={{
                type: "spring",
                stiffness: 300,
                damping: 25,
              }}
            >
              <MatchCard candidate={c} className="h-full" />
            </motion.div>
          );
        })}
    </div>
  );
}
