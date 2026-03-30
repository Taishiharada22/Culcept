// app/stargazer/_components/StateLinkedBackground.tsx
// 感情状態に連動する背景 — UIが鏡になる瞬間
"use client";

import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EmotionalState =
  | "calm"
  | "stressed"
  | "curious"
  | "conflicted"
  | "reflective";

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

interface Props {
  emotionalState?: EmotionalState;
  observationDepth?: number; // 0-1
  contradictionsDetected?: number;
  timeOfDay?: TimeOfDay;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// Deterministic star positions (never re-randomised)
// ---------------------------------------------------------------------------

interface StarDef {
  id: string;
  x: number; // %
  y: number; // %
  size: number; // px
  baseOpacity: number;
  layer: "distant" | "mid" | "bright";
}

const STARS: StarDef[] = Array.from({ length: 42 }, (_, i) => {
  const layer: StarDef["layer"] =
    i < 20 ? "distant" : i < 35 ? "mid" : "bright";
  return {
    id: `sl-${i}`,
    x: ((i * 41 + 17) % 97) + 1,
    y: ((i * 59 + 11) % 93) + 2,
    size:
      layer === "distant"
        ? 1 + (i % 3) * 0.4
        : layer === "mid"
          ? 1.5 + (i % 3) * 0.5
          : 2.2 + (i % 2) * 0.6,
    baseOpacity:
      layer === "distant"
        ? 0.15 + (i % 5) * 0.05
        : layer === "mid"
          ? 0.25 + (i % 4) * 0.06
          : 0.4 + (i % 3) * 0.08,
    layer,
  };
});

// ---------------------------------------------------------------------------
// State-dependent palette
// ---------------------------------------------------------------------------

interface StatePalette {
  starColor: string;
  accentColor: string;
  pulseDuration: number; // seconds
  glowIntensity: number; // 0-1
  driftSpeed: number; // seconds per cycle
  bgGradient: string;
}

const STATE_PALETTES: Record<EmotionalState, StatePalette> = {
  calm: {
    starColor: "190,200,230",
    accentColor: "200,210,240",
    pulseDuration: 4,
    glowIntensity: 0.3,
    driftSpeed: 30,
    bgGradient:
      "radial-gradient(ellipse 120% 80% at 50% 30%, rgba(210,220,245,0.25) 0%, transparent 60%)",
  },
  stressed: {
    starColor: "220,170,170",
    accentColor: "230,150,140",
    pulseDuration: 2,
    glowIntensity: 0.5,
    driftSpeed: 18,
    bgGradient:
      "radial-gradient(ellipse 120% 80% at 50% 30%, rgba(240,210,210,0.2) 0%, transparent 60%)",
  },
  curious: {
    starColor: "220,200,140",
    accentColor: "240,210,120",
    pulseDuration: 3,
    glowIntensity: 0.55,
    driftSpeed: 22,
    bgGradient:
      "radial-gradient(ellipse 120% 80% at 50% 30%, rgba(245,235,200,0.25) 0%, transparent 60%)",
  },
  conflicted: {
    starColor: "210,180,170",
    accentColor: "230,160,130",
    pulseDuration: 2.5,
    glowIntensity: 0.45,
    driftSpeed: 20,
    bgGradient:
      "radial-gradient(ellipse 120% 80% at 50% 30%, rgba(235,215,210,0.22) 0%, transparent 60%)",
  },
  reflective: {
    starColor: "180,170,210",
    accentColor: "170,160,220",
    pulseDuration: 5,
    glowIntensity: 0.35,
    driftSpeed: 35,
    bgGradient:
      "radial-gradient(ellipse 120% 80% at 50% 30%, rgba(210,205,235,0.25) 0%, transparent 60%)",
  },
};

// ---------------------------------------------------------------------------
// Time-of-day overlays
// ---------------------------------------------------------------------------

const TIME_OVERLAYS: Record<TimeOfDay, string> = {
  morning: "rgba(255,200,100,0.03)",
  afternoon: "rgba(0,0,0,0)",
  evening: "rgba(200,150,80,0.04)",
  night: "rgba(30,20,60,0.06)",
};

// ---------------------------------------------------------------------------
// Contradiction lines (connecting specific star pairs)
// ---------------------------------------------------------------------------

const CONTRADICTION_PAIRS: [number, number][] = [
  [2, 25],
  [7, 30],
  [12, 38],
  [18, 34],
  [5, 40],
  [10, 28],
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StateLinkedBackground({
  emotionalState = "calm",
  observationDepth = 0,
  contradictionsDetected = 0,
  timeOfDay = "afternoon",
  children,
}: Props) {
  const palette = STATE_PALETTES[emotionalState];
  const timeOverlay = TIME_OVERLAYS[timeOfDay];

  // Depth darkening: 0 -> base, 1 -> significantly darker
  const depthDarken = observationDepth * 0.15;

  // How many contradiction lines to show (max 6)
  const visibleContradictions = Math.min(contradictionsDetected, CONTRADICTION_PAIRS.length);

  // Reflective state: stars drift downward
  const isReflective = emotionalState === "reflective";

  // Memoize star rendering data to avoid recalculation
  const starRenderData = useMemo(() => {
    return STARS.map((star) => {
      const finalOpacity = star.baseOpacity * (1 - observationDepth * 0.3);
      const sizeMultiplier =
        star.layer === "bright" ? 1 + observationDepth * 0.3 : 1;
      return { ...star, finalOpacity, finalSize: star.size * sizeMultiplier };
    });
  }, [observationDepth]);

  return (
    <div className="relative min-h-screen">
      {/* Base background with state gradient */}
      <motion.div
        className="fixed inset-0 z-[0] pointer-events-none"
        animate={{
          background: `
            ${palette.bgGradient},
            linear-gradient(180deg,
              rgba(250,251,254,${1 - depthDarken}) 0%,
              rgba(245,247,252,${1 - depthDarken}) 30%,
              rgba(242,244,251,${1 - depthDarken}) 60%,
              rgba(247,248,252,${1 - depthDarken}) 100%
            )
          `,
        }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />

      {/* Depth darkening overlay */}
      <motion.div
        className="fixed inset-0 z-[1] pointer-events-none"
        animate={{ opacity: depthDarken }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
        style={{ background: "rgba(15,15,30,1)" }}
      />

      {/* Time-of-day tint */}
      <div
        className="fixed inset-0 z-[1] pointer-events-none"
        style={{ background: timeOverlay }}
      />

      {/* Stars layer */}
      <div
        className="fixed inset-0 z-[2] pointer-events-none"
        style={{
          maskImage:
            "linear-gradient(180deg, black 0%, black 60%, transparent 85%)",
          WebkitMaskImage:
            "linear-gradient(180deg, black 0%, black 60%, transparent 85%)",
        }}
      >
        {starRenderData.map((star) => (
          <motion.div
            key={star.id}
            className="absolute rounded-full"
            style={{
              left: `${star.x}%`,
              top: `${star.y}%`,
              width: star.finalSize,
              height: star.finalSize,
            }}
            animate={{
              opacity: [
                star.finalOpacity * 0.4,
                star.finalOpacity,
                star.finalOpacity * 0.4,
              ],
              scale: [1, 1.15, 1],
              y: isReflective ? [0, 3, 0] : [0, -1, 0],
              background: `rgba(${palette.starColor},${star.finalOpacity})`,
              boxShadow:
                star.layer === "bright"
                  ? `0 0 ${star.finalSize * 4}px rgba(${palette.accentColor},${palette.glowIntensity * star.finalOpacity})`
                  : "none",
            }}
            transition={{
              duration: palette.pulseDuration + (star.layer === "distant" ? 2 : 0),
              repeat: Infinity,
              ease: "easeInOut",
              delay: (parseInt(star.id.replace("sl-", ""), 10) % 7) * 0.4,
            }}
          />
        ))}

        {/* Contradiction connection lines */}
        {emotionalState === "conflicted" && visibleContradictions > 0 && (
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ overflow: "visible" }}
          >
            {CONTRADICTION_PAIRS.slice(0, visibleContradictions).map(
              ([a, b], idx) => {
                const starA = STARS[a];
                const starB = STARS[b];
                if (!starA || !starB) return null;
                return (
                  <motion.line
                    key={`contra-${idx}`}
                    x1={`${starA.x}%`}
                    y1={`${starA.y}%`}
                    x2={`${starB.x}%`}
                    y2={`${starB.y}%`}
                    stroke={`rgba(${palette.accentColor},0.15)`}
                    strokeWidth={0.5}
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{
                      pathLength: 1,
                      opacity: [0.08, 0.2, 0.08],
                    }}
                    transition={{
                      pathLength: { duration: 1.5, delay: idx * 0.3 },
                      opacity: {
                        duration: 2.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: idx * 0.5,
                      },
                    }}
                  />
                );
              },
            )}
          </svg>
        )}
      </div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}
