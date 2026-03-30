"use client";

/**
 * EncounterTheatre
 * マッチ初表示時のフルスクリーン「軌道観測所」演出
 * 3フェーズ: 接近(Approach) → 収束(Convergence) → 啓示(Revelation)
 *
 * AvatarContactAnimation の進化版。
 * 星座署名（constellation signature）が軌道上で接近・合流し、
 * カテゴリ固有の色で啓示される。
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  RendezvousCategory,
  EncounterTriggerType,
} from "@/lib/rendezvous/types";
import ConstellationMerge from "./ConstellationMerge";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  category: RendezvousCategory;
  triggerType: EncounterTriggerType;
  syncPercent: number;
  counterpartName: string;
  label: string;
  narrativeText: string;
  reasonCodes?: string[];
  onComplete: () => void;
};

type Phase = 1 | 2 | 3 | 4;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_COLORS: Record<RendezvousCategory, string> = {
  romantic: "#FF6B9D",
  friendship: "#4AEAFF",
  cocreation: "#D4A017",
  community: "#8B5CF6",
  partner: "#D4776B",
};

const TRIGGER_NARRATIVES: Record<EncounterTriggerType, string> = {
  physical_proximity: "同じ空気を吸っていた二つの軌道が、静かに交差する",
  event_overlap: "共鳴した感性が、互いを見つけ出した",
  community_overlap: "同じ世界観が、二つの星を引き合わせた",
  place_overlap: "同じ風景を見ていた視線が、ここで交わる",
  schedule_overlap: "時間のリズムが重なり、軌道が収束する",
  manual_seed: "特別な共鳴パターンが観測された",
  system_retest: "再観測が、新しい接続を発見した",
};

// ---------------------------------------------------------------------------
// Helpers: seeded random positions for particles & stars
// ---------------------------------------------------------------------------

type Particle = {
  x: number;
  y: number;
  size: number;
  delay: number;
  duration: number;
  driftX: number;
  driftY: number;
};

type Star = {
  cx: number;
  cy: number;
  r: number;
  delay: number;
};

function buildParticles(count: number): Particle[] {
  return Array.from({ length: count }, (_, i) => ({
    x: ((i * 37 + 13) % 100),
    y: ((i * 53 + 7) % 100),
    size: 1.5 + (i % 3),
    delay: (i * 0.15) % 3,
    duration: 4 + (i % 4),
    driftX: ((i % 2 === 0 ? 1 : -1) * ((i * 7) % 30)) + 5,
    driftY: ((i % 3 === 0 ? -1 : 1) * ((i * 11) % 20)) + 3,
  }));
}

function buildStarCluster(centerX: number, centerY: number, seed: number): Star[] {
  return Array.from({ length: 5 }, (_, i) => {
    const angle = ((seed + i) * 1.3) % (Math.PI * 2);
    const dist = 8 + ((seed + i) * 7) % 14;
    return {
      cx: centerX + Math.cos(angle) * dist,
      cy: centerY + Math.sin(angle) * dist,
      r: 2 + ((i * 3 + seed) % 4),
      delay: i * 0.12,
    };
  });
}

// ---------------------------------------------------------------------------
// Orbital SVG paths per triggerType
// ---------------------------------------------------------------------------

function getOrbitalPathD(
  trigger: EncounterTriggerType,
  side: "left" | "right",
  width: number,
  height: number,
): string {
  const cx = width / 2;
  const cy = height / 2;
  const isLeft = side === "left";

  switch (trigger) {
    case "physical_proximity":
      // convergent arcs
      return isLeft
        ? `M 0 ${cy - 40} Q ${cx * 0.5} ${cy + 30} ${cx} ${cy}`
        : `M ${width} ${cy + 40} Q ${cx * 1.5} ${cy - 30} ${cx} ${cy}`;
    case "event_overlap":
      // crossing X
      return isLeft
        ? `M 0 ${cy - 60} Q ${cx} ${cy} ${width} ${cy + 60}`
        : `M ${width} ${cy - 60} Q ${cx} ${cy} 0 ${cy + 60}`;
    case "community_overlap":
      // concentric curves
      return isLeft
        ? `M 0 ${cy} Q ${cx * 0.4} ${cy - 50} ${cx} ${cy}`
        : `M ${width} ${cy} Q ${cx * 1.6} ${cy + 50} ${cx} ${cy}`;
    case "place_overlap":
      // parallel approaching
      return isLeft
        ? `M 0 ${cy - 20} L ${cx} ${cy}`
        : `M ${width} ${cy + 20} L ${cx} ${cy}`;
    case "schedule_overlap":
      // spirals
      return isLeft
        ? `M 0 ${cy} Q ${cx * 0.3} ${cy - 60} ${cx * 0.6} ${cy - 20} T ${cx} ${cy}`
        : `M ${width} ${cy} Q ${cx * 1.7} ${cy + 60} ${cx * 1.4} ${cy + 20} T ${cx} ${cy}`;
    case "manual_seed":
    case "system_retest":
    default:
      return isLeft
        ? `M 0 ${cy} C ${cx * 0.4} ${cy - 80} ${cx * 0.8} ${cy + 40} ${cx} ${cy}`
        : `M ${width} ${cy} C ${cx * 1.6} ${cy + 80} ${cx * 1.2} ${cy - 40} ${cx} ${cy}`;
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Background particle field */
function ParticleField({ particles, color }: { particles: Particle[]; color: string }) {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
      {particles.map((p, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.4, 0],
            x: [0, p.driftX, p.driftX * 0.6],
            y: [0, p.driftY, p.driftY * 0.4],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            position: "absolute",
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: i % 5 === 0 ? color : "rgba(255,255,255,0.35)",
          }}
        />
      ))}
    </div>
  );
}

/** A cluster of 5 small stars with flicker / glow */
function StarCluster({
  stars,
  color,
  animate: targetPos,
}: {
  stars: Star[];
  color: string;
  animate: { x: number; y: number; scale: number; opacity: number };
}) {
  return (
    <motion.g
      initial={{ opacity: 0 }}
      animate={{
        x: targetPos.x,
        y: targetPos.y,
        scale: targetPos.scale,
        opacity: targetPos.opacity,
      }}
      transition={{ duration: 2.5, ease: "easeInOut" }}
    >
      {stars.map((s, i) => (
        <motion.circle
          key={i}
          cx={s.cx}
          cy={s.cy}
          r={s.r}
          fill={color}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 1, 0.5, 0.9, 0.3] }}
          transition={{
            duration: 2 + i * 0.3,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{
            filter: `drop-shadow(0 0 ${s.r + 2}px ${color})`,
          }}
        />
      ))}
    </motion.g>
  );
}

/** Convergence burst particles: 16 radiating outward */
function BurstParticles({ color }: { color: string }) {
  return (
    <>
      {Array.from({ length: 16 }, (_, i) => {
        const angle = (i / 16) * Math.PI * 2;
        const dist = 80;
        return (
          <motion.circle
            key={i}
            cx={0}
            cy={0}
            r={2}
            fill={color}
            initial={{ opacity: 0, cx: 0, cy: 0 }}
            animate={{
              opacity: [0, 0.9, 0],
              cx: [0, Math.cos(angle) * dist],
              cy: [0, Math.sin(angle) * dist],
            }}
            transition={{ duration: 1.2, delay: i * 0.04, ease: "easeOut" }}
            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
          />
        );
      })}
    </>
  );
}

/** Resonance lines radiating from center, one per reasonCode */
function ResonanceLines({
  count,
  color,
}: {
  count: number;
  color: string;
}) {
  const lines = Math.min(count, 3);
  return (
    <>
      {Array.from({ length: lines }, (_, i) => {
        const angle = ((i - (lines - 1) / 2) * 0.6) + Math.PI * 0.5;
        const length = 60;
        return (
          <motion.line
            key={i}
            x1={0}
            y1={0}
            x2={Math.cos(angle) * length}
            y2={-Math.sin(angle) * length}
            stroke={color}
            strokeWidth={1.5}
            strokeOpacity={0.7}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: [0, 0.8, 0.5] }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: "easeOut" }}
          />
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function EncounterTheatre({
  category,
  triggerType,
  syncPercent,
  counterpartName,
  label,
  narrativeText,
  reasonCodes = [],
  onComplete,
}: Props) {
  const [phase, setPhase] = useState<Phase>(1);
  const [showConstellation, setShowConstellation] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const color = CATEGORY_COLORS[category];
  const triggerNarrative = TRIGGER_NARRATIVES[triggerType];

  // Memoized random-ish positions
  const particles = useMemo(() => buildParticles(20), []);
  const starsA = useMemo(() => buildStarCluster(0, 0, 1), []);
  const starsB = useMemo(() => buildStarCluster(0, 0, 42), []);

  // Phase progression via timers
  // Phase 1→2→3 (reveal) → constellation merge → show action buttons
  useEffect(() => {
    const t1 = setTimeout(() => setPhase(2), 3000);
    const t2 = setTimeout(() => setPhase(3), 6000);
    // After reveal text appears, trigger constellation merge
    const t3 = setTimeout(() => setShowConstellation(true), 8000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const handleConstellationComplete = useCallback(() => {
    setShowConstellation(false);
    setShowActions(true);
  }, []);

  const handleComplete = useCallback(() => {
    onComplete();
  }, [onComplete]);

  // SVG viewBox dimensions
  const svgW = 320;
  const svgH = 260;
  const cx = svgW / 2;
  const cy = svgH / 2;

  // Star cluster positions per phase
  const clusterAPos = (() => {
    switch (phase) {
      case 1:
        return { x: -60, y: 0, scale: 1, opacity: 1 };
      case 2:
        return { x: 0, y: 0, scale: 0.7, opacity: 0.8 };
      case 3:
      case 4:
        return { x: 0, y: 0, scale: 0, opacity: 0 };
    }
  })();

  const clusterBPos = (() => {
    switch (phase) {
      case 1:
        return { x: 60, y: 0, scale: 1, opacity: 1 };
      case 2:
        return { x: 0, y: 0, scale: 0.7, opacity: 0.8 };
      case 3:
      case 4:
        return { x: 0, y: 0, scale: 0, opacity: 0 };
    }
  })();

  // Orbital path D strings
  const pathLeft = getOrbitalPathD(triggerType, "left", svgW, svgH);
  const pathRight = getOrbitalPathD(triggerType, "right", svgW, svgH);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.6 }}
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
        overflow: "hidden",
      }}
    >
      {/* ── Particle field (always visible) ── */}
      <ParticleField particles={particles} color={color} />

      {/* ── Phase 2/3: center radial brightening ── */}
      <AnimatePresence>
        {phase >= 2 && (
          <motion.div
            key="center-glow"
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 2 ? 0.25 : 0.4 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5 }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 400,
              height: 400,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color}30 0%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Phase 3: category color bloom ── */}
      <AnimatePresence>
        {phase === 3 && (
          <motion.div
            key="color-bloom"
            initial={{ opacity: 0, scale: 0.3 }}
            animate={{ opacity: 0.2, scale: 1.2 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              width: 600,
              height: 600,
              transform: "translate(-50%, -50%)",
              borderRadius: "50%",
              background: `radial-gradient(circle, ${color}25 0%, ${color}08 40%, transparent 70%)`,
              pointerEvents: "none",
            }}
          />
        )}
      </AnimatePresence>

      {/* ── SVG Layer: orbital paths + star clusters + convergence FX ── */}
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        style={{ overflow: "visible", flexShrink: 0 }}
      >
        {/* Orbital path lines */}
        <motion.path
          d={pathLeft}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
          strokeDasharray="4 6"
        />
        <motion.path
          d={pathRight}
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth={1}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
          strokeDasharray="4 6"
        />

        {/* Star cluster A (self) */}
        <g transform={`translate(${cx}, ${cy})`}>
          <StarCluster stars={starsA} color="rgba(255,255,255,0.85)" animate={clusterAPos} />
        </g>

        {/* Star cluster B (counterpart) */}
        <g transform={`translate(${cx}, ${cy})`}>
          <StarCluster stars={starsB} color={color} animate={clusterBPos} />
        </g>

        {/* Phase 2: sync ring pulse */}
        <AnimatePresence>
          {phase >= 2 && (
            <motion.circle
              key="sync-ring"
              cx={cx}
              cy={cy}
              r={20}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
              initial={{ r: 10, opacity: 0 }}
              animate={{
                r: [10, 50, 40],
                opacity: [0, 0.7, 0.3],
                strokeWidth: [2, 1, 0.5],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              style={{ filter: `drop-shadow(0 0 8px ${color})` }}
            />
          )}
        </AnimatePresence>

        {/* Phase 2: burst particles */}
        <AnimatePresence>
          {phase >= 2 && (
            <motion.g
              key="burst"
              initial={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <g transform={`translate(${cx}, ${cy})`}>
                <BurstParticles color={color} />
              </g>
            </motion.g>
          )}
        </AnimatePresence>

        {/* Phase 2: resonance lines per reasonCode */}
        <AnimatePresence>
          {phase >= 2 && reasonCodes.length > 0 && (
            <motion.g
              key="resonance"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.3 }}
            >
              <g transform={`translate(${cx}, ${cy})`}>
                <ResonanceLines count={reasonCodes.length} color={color} />
              </g>
            </motion.g>
          )}
        </AnimatePresence>
      </svg>

      {/* ── Text layer ── */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          textAlign: "center",
          marginTop: 24,
          maxWidth: 320,
          padding: "0 24px",
        }}
      >
        <AnimatePresence mode="wait">
          {/* Phase 1: trigger-type narrative */}
          {phase === 1 && (
            <motion.p
              key="phase1-narrative"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 0.55, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.8, delay: 0.5 }}
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "rgba(255,255,255,0.5)",
                letterSpacing: "1.5px",
                lineHeight: 1.8,
              }}
            >
              {triggerNarrative}
            </motion.p>
          )}

          {/* Phase 2: convergence label */}
          {phase === 2 && (
            <motion.p
              key="phase2-label"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 0.7, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.6 }}
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: color,
                letterSpacing: "2px",
                textTransform: "uppercase",
              }}
            >
              共鳴検出
            </motion.p>
          )}

          {/* Phase 3: revelation */}
          {phase === 3 && (
            <motion.div
              key="phase3-reveal"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              style={{ textAlign: "center" }}
            >
              {/* Counterpart name */}
              <motion.p
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, delay: 0.2 }}
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: "rgba(255,255,255,0.95)",
                  marginBottom: 8,
                  letterSpacing: "1px",
                }}
              >
                {counterpartName}
              </motion.p>

              {/* Sync percentage */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                style={{
                  display: "inline-flex",
                  alignItems: "baseline",
                  gap: 4,
                  marginBottom: 16,
                }}
              >
                <span
                  style={{
                    fontSize: 20,
                    fontWeight: 800,
                    color: color,
                    fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
                  }}
                >
                  synced {syncPercent}%
                </span>
              </motion.div>

              {/* Narrative text */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.8 }}
                transition={{ delay: 0.7 }}
                style={{
                  fontSize: 14,
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.7)",
                  lineHeight: 1.9,
                  marginBottom: 8,
                }}
              >
                {narrativeText}
              </motion.p>

              {/* Label */}
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.55 }}
                transition={{ delay: 0.9 }}
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: `${color}AA`,
                  letterSpacing: "1px",
                  marginBottom: 32,
                }}
              >
                {label}
              </motion.p>

              {/* CTA button — shown after constellation merge completes */}
              <AnimatePresence>
                {showActions && (
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.6 }}
                    onClick={handleComplete}
                    style={{
                      display: "inline-block",
                      padding: "12px 36px",
                      borderRadius: 12,
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#fff",
                      background: `linear-gradient(135deg, ${color}, ${color}BB)`,
                      border: "none",
                      cursor: "pointer",
                      boxShadow: `0 4px 20px ${color}40`,
                      letterSpacing: "0.5px",
                    }}
                  >
                    この交差を見る
                  </motion.button>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Constellation merge overlay — after revelation phase */}
      <AnimatePresence>
        {showConstellation && (
          <ConstellationMerge onComplete={handleConstellationComplete} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
