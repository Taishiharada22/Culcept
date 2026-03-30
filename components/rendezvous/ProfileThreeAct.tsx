"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import ActOneSpark from "./profile/ActOneSpark";
import ActTwoBridge from "./profile/ActTwoBridge";
import ActThreeDepth from "./profile/ActThreeDepth";
import type { MatchingVector, RendezvousCategory } from "@/lib/rendezvous/types";

// ---------- Props ----------

export type ProfileThreeActData = {
  // Act 1
  name: string;
  age?: number;
  area?: string;
  photoUrl?: string | null;
  corePhrase: string;
  resonanceLevel: number; // 0..3

  // Act 2
  myVector: Partial<MatchingVector>;
  theirVector: Partial<MatchingVector>;
  avatarMessages?: { role: "avatar" | "their_avatar"; text: string }[];
  bridgePrediction?: string;
  bridgeDetail?: string;
  chemistryMap?: { resonance: number; complement: number; friction: number; unknown: number };

  // Act 3
  category?: RendezvousCategory;
  compatibilityAxes?: { axis: string; label: string; myValue: number; theirValue: number }[];
};

type Props = {
  data: ProfileThreeActData;
};

const ACTS = ["spark", "bridge", "depth"] as const;
type Act = (typeof ACTS)[number];

const SWIPE_THRESHOLD = 60;

export default function ProfileThreeAct({ data }: Props) {
  const [currentAct, setCurrentAct] = useState<Act>("spark");
  const currentIndex = ACTS.indexOf(currentAct);

  const goTo = useCallback((act: Act) => setCurrentAct(act), []);

  const handleDragEnd = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { offset } = info;
      if (Math.abs(offset.x) < SWIPE_THRESHOLD) return;

      if (offset.x < 0 && currentIndex < ACTS.length - 1) {
        setCurrentAct(ACTS[currentIndex + 1]);
      } else if (offset.x > 0 && currentIndex > 0) {
        setCurrentAct(ACTS[currentIndex - 1]);
      }
    },
    [currentIndex],
  );

  return (
    <div className="relative w-full overflow-hidden">
      {/* Dot indicators */}
      <div className="flex items-center justify-center gap-2 py-4">
        {ACTS.map((act, i) => (
          <button
            key={act}
            onClick={() => goTo(act)}
            className="p-1"
            aria-label={`Act ${i + 1}`}
          >
            <motion.div
              animate={{
                width: i === currentIndex ? 20 : 8,
                height: 8,
                backgroundColor:
                  i === currentIndex
                    ? "rgba(139,92,246,0.9)"
                    : "rgba(139,92,246,0.2)",
                borderRadius: 4,
              }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
            />
          </button>
        ))}
      </div>

      {/* Swipeable content */}
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        className="touch-pan-y"
      >
        <AnimatePresence mode="wait" initial={false}>
          {currentAct === "spark" && (
            <motion.div
              key="spark"
              initial={{ opacity: 0, x: -80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -80 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <ActOneSpark
                name={data.name}
                age={data.age}
                area={data.area}
                photoUrl={data.photoUrl}
                corePhrase={data.corePhrase}
                resonanceLevel={data.resonanceLevel}
              />
            </motion.div>
          )}

          {currentAct === "bridge" && (
            <motion.div
              key="bridge"
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <ActTwoBridge
                myVector={data.myVector}
                theirVector={data.theirVector}
                avatarMessages={data.avatarMessages}
                prediction={data.bridgePrediction}
                detail={data.bridgeDetail}
                chemistryMap={data.chemistryMap}
              />
            </motion.div>
          )}

          {currentAct === "depth" && (
            <motion.div
              key="depth"
              initial={{ opacity: 0, x: 80 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 80 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
            >
              <ActThreeDepth
                compatibilityAxes={data.compatibilityAxes}
                category={data.category}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
