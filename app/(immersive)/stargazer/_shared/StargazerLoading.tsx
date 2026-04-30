// app/stargazer/_shared/StargazerLoading.tsx
// Stargazer -- Thematic loading states that feel like "the system is reading you"
"use client";

import { motion } from "framer-motion";

// ── Variant types ──

type LoadingVariant =
  | "observe"     // Main hub: archetype forming
  | "prophecy"    // Prophecy: crystal ball scanning
  | "alter"       // Alter: shadow awakening
  | "signature"   // Signature: fingerprint forming
  | "generic";    // Minimal breathing dot

interface LoadingConfig {
  label: string;
  sublabel?: string;
}

const VARIANT_CONFIG: Record<LoadingVariant, LoadingConfig> = {
  observe: {
    label: "あなたのアーキタイプを読み込んでいます",
    sublabel: "アーキタイプを読み込み中",
  },
  prophecy: {
    label: "予言を読み解いています",
    sublabel: "予言を解読中",
  },
  alter: {
    label: "もうひとりの自分が形を成しています",
    sublabel: "影が浮かび上がっています",
  },
  signature: {
    label: "心の指紋を生成中",
    sublabel: "指紋を生成中",
  },
  generic: {
    label: "観測中",
  },
};

// ── Orbit dots for the animation ──
// Pre-computed positions to avoid SSR/client hydration mismatch from Math.sin/cos
const ORBIT_DOT_POSITIONS: Array<{ x: number; y: number; r: number }> = [
  { x: 88,    y: 50,    r: 1.5 },  // 0°
  { x: 61.76, y: 86.18, r: 2.3 },  // 72°
  { x: 12.24, y: 72.36, r: 1.5 },  // 144°
  { x: 12.24, y: 27.64, r: 2.3 },  // 216°
  { x: 61.76, y: 13.82, r: 1.5 },  // 288°
];

function OrbitDots({ color }: { color: string }) {
  return (
    <>
      {ORBIT_DOT_POSITIONS.map((dot, i) => (
        <motion.circle
          key={i}
          cx={dot.x}
          cy={dot.y}
          r={dot.r}
          fill={color}
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.8, 0.2, 0.8, 0],
            scale: [0.5, 1.2, 0.8, 1.2, 0.5],
          }}
          transition={{
            duration: 3,
            delay: i * 0.4,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}
    </>
  );
}

// ── Observe variant: archetype forming ──

function ObserveLoading() {
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full" viewBox="0 0 100 100">
        {/* Outer ring - slow orbit */}
        <motion.circle
          cx={50} cy={50} r={42}
          fill="none"
          stroke="rgba(160,150,200,0.12)"
          strokeWidth={0.5}
          strokeDasharray="3 4"
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "50px 50px" }}
        />

        {/* Inner ring */}
        <motion.circle
          cx={50} cy={50} r={28}
          fill="none"
          stroke="rgba(160,150,200,0.08)"
          strokeWidth={0.5}
          strokeDasharray="2 3"
          animate={{ rotate: -360 }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "50px 50px" }}
        />

        {/* Orbiting dots */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "50px 50px" }}
        >
          <OrbitDots color="rgba(160,150,200,0.6)" />
        </motion.g>

        {/* Center pulsing core */}
        <motion.circle
          cx={50} cy={50} r={4}
          fill="rgba(176,144,80,0.3)"
          animate={{
            r: [4, 6, 4],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.circle
          cx={50} cy={50} r={2}
          fill="rgba(176,144,80,0.5)"
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
}

// ── Prophecy variant: crystal ball scanning lines ──

function ProphecyLoading() {
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full" viewBox="0 0 100 100">
        {/* Crystal sphere outline */}
        <motion.circle
          cx={50} cy={50} r={36}
          fill="none"
          stroke="rgba(99,102,241,0.15)"
          strokeWidth={1}
          animate={{ opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 3, repeat: Infinity }}
        />

        {/* Scanning line that sweeps */}
        <motion.line
          x1={50} y1={14} x2={50} y2={86}
          stroke="rgba(99,102,241,0.25)"
          strokeWidth={0.8}
          animate={{ rotate: [0, 180] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
          style={{ transformOrigin: "50px 50px" }}
        />

        {/* Orbiting dots at varied radii */}
        {[28, 22, 16].map((r, i) => (
          <motion.circle
            key={i}
            cx={50 + r}
            cy={50}
            r={1.5 - i * 0.3}
            fill="rgba(99,102,241,0.5)"
            animate={{ rotate: (i % 2 === 0 ? 1 : -1) * 360 }}
            transition={{
              duration: 6 + i * 2,
              repeat: Infinity,
              ease: "linear",
            }}
            style={{ transformOrigin: "50px 50px" }}
          />
        ))}

        {/* Center glow */}
        <motion.circle
          cx={50} cy={50} r={8}
          fill="rgba(99,102,241,0.08)"
          initial={{ r: 8 }}
          animate={{ r: [8, 12, 8], opacity: [0.08, 0.2, 0.08] }}
          transition={{ duration: 2.5, repeat: Infinity }}
        />
        <circle cx={50} cy={50} r={2} fill="rgba(99,102,241,0.4)" />
      </svg>
    </div>
  );
}

// ── Alter variant: dual presence forming ──

function AlterLoading() {
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full" viewBox="0 0 100 100">
        {/* Left presence */}
        <motion.circle
          cx={38} cy={50} r={14}
          fill="none"
          stroke="rgba(168,85,247,0.2)"
          strokeWidth={0.8}
          animate={{
            cx: [38, 42, 38],
            opacity: [0.2, 0.4, 0.2],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Right presence (shadow) */}
        <motion.circle
          cx={62} cy={50} r={14}
          fill="none"
          stroke="rgba(168,85,247,0.15)"
          strokeWidth={0.8}
          strokeDasharray="2 2"
          animate={{
            cx: [62, 58, 62],
            opacity: [0.15, 0.3, 0.15],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Connecting thread */}
        <motion.line
          x1={42} y1={50} x2={58} y2={50}
          stroke="rgba(168,85,247,0.2)"
          strokeWidth={0.5}
          animate={{
            opacity: [0.1, 0.35, 0.1],
            strokeWidth: [0.5, 1, 0.5],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Left core */}
        <motion.circle
          cx={38} cy={50} r={3}
          fill="rgba(168,85,247,0.4)"
          animate={{
            cx: [38, 42, 38],
            r: [3, 4, 3],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Right core (dimmer) */}
        <motion.circle
          cx={62} cy={50} r={3}
          fill="rgba(168,85,247,0.2)"
          animate={{
            cx: [62, 58, 62],
            r: [3, 4, 3],
          }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Floating particles between the two */}
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            cx={50}
            cy={50}
            r={1}
            fill="rgba(168,85,247,0.5)"
            animate={{
              cx: [42 + i * 2, 58 - i * 2, 42 + i * 2],
              cy: [47 + i * 3, 53 - i * 3, 47 + i * 3],
              opacity: [0, 0.6, 0],
            }}
            transition={{
              duration: 2 + i * 0.5,
              delay: i * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        ))}
      </svg>
    </div>
  );
}

// ── Signature variant: fingerprint rings forming ──

function SignatureLoading() {
  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full" viewBox="0 0 100 100">
        {/* Concentric fingerprint rings that draw in sequence */}
        {[12, 18, 24, 30, 36].map((r, i) => (
          <motion.circle
            key={i}
            cx={50} cy={50} r={r}
            fill="none"
            stroke="rgba(236,72,153,0.2)"
            strokeWidth={0.7}
            strokeDasharray={`${r * 0.6} ${r * 0.4}`}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{
              pathLength: [0, 1, 0],
              opacity: [0, 0.4, 0],
              rotate: [0, i % 2 === 0 ? 60 : -60, 0],
            }}
            transition={{
              duration: 4,
              delay: i * 0.3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
            style={{ transformOrigin: "50px 50px" }}
          />
        ))}

        {/* Center pulse */}
        <motion.circle
          cx={50} cy={50} r={5}
          fill="rgba(236,72,153,0.1)"
          initial={{ r: 5 }}
          animate={{ r: [5, 8, 5], opacity: [0.1, 0.25, 0.1] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <motion.circle
          cx={50} cy={50} r={2}
          fill="rgba(236,72,153,0.4)"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.5, repeat: Infinity }}
        />
      </svg>
    </div>
  );
}

// ── Generic minimal dot ──

function GenericLoading() {
  return (
    <motion.div
      className="w-3 h-3 rounded-full"
      style={{ background: "rgba(160,150,200,0.4)" }}
      animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.8, 0.4] }}
      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

// ── Variant renderer map ──

function LoadingVisual({ variant }: { variant: LoadingVariant }) {
  switch (variant) {
    case "observe":
      return <ObserveLoading />;
    case "prophecy":
      return <ProphecyLoading />;
    case "alter":
      return <AlterLoading />;
    case "signature":
      return <SignatureLoading />;
    case "generic":
    default:
      return <GenericLoading />;
  }
}

// ── Props ──

interface StargazerLoadingProps {
  variant?: LoadingVariant;
  /** Override the default label text */
  label?: string;
  /** Show in a full-screen centered layout */
  fullScreen?: boolean;
}

export default function StargazerLoading({
  variant = "generic",
  label,
  fullScreen = true,
}: StargazerLoadingProps) {
  const config = VARIANT_CONFIG[variant];
  const displayLabel = label ?? config.label;

  const content = (
    <div className="flex flex-col items-center justify-center gap-5">
      <LoadingVisual variant={variant} />

      <div className="text-center">
        <motion.p
          className="text-sm font-body"
          style={{ color: "rgba(100,105,130,0.6)" }}
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
        >
          {displayLabel}
        </motion.p>
        {config.sublabel && (
          <motion.p
            className="text-[10px] font-mono-sg tracking-[0.15em] mt-1.5"
            style={{ color: "rgba(160,150,200,0.4)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
          >
            {config.sublabel}
          </motion.p>
        )}
      </div>
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
}
