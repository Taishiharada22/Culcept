// app/stargazer/_components/DepthLayerAccordion.tsx
// 深度レイヤーアコーディオン v2 — 世界最高水準の没入型深度ナビゲーション
// Apple Intelligence + Spotify Wrapped 級のビジュアルトランジション
"use client";

import { useState, useRef, useEffect, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  layerId: string;
  label: string;
  sublabel: string;
  description: string;
  depthLevel: 1 | 2 | 3 | 4;
  defaultOpen?: boolean;
  children: ReactNode;
}

// ── Depth Design Tokens ──

interface DepthDesign {
  color: string;
  colorSecondary: string;
  glowColor: string;
  icon: string;
  depthLabel: string;
  bgGradient: string;
  borderGradient: string;
  particleCount: number;
}

const DEPTH_DESIGNS: Record<number, DepthDesign> = {
  1: {
    color: "#6B9FD4",
    colorSecondary: "#93C5FD",
    glowColor: "rgba(107,159,212,0.15)",
    icon: "◎",
    depthLabel: "SURFACE",
    bgGradient:
      "linear-gradient(135deg, rgba(107,159,212,0.04) 0%, rgba(147,197,253,0.02) 50%, rgba(255,255,255,0) 100%)",
    borderGradient:
      "linear-gradient(180deg, rgba(107,159,212,0.25) 0%, rgba(107,159,212,0.08) 100%)",
    particleCount: 3,
  },
  2: {
    color: "#9F7AEA",
    colorSecondary: "#C4B5FD",
    glowColor: "rgba(159,122,234,0.15)",
    icon: "◈",
    depthLabel: "PATTERN",
    bgGradient:
      "linear-gradient(135deg, rgba(159,122,234,0.04) 0%, rgba(196,181,253,0.02) 50%, rgba(255,255,255,0) 100%)",
    borderGradient:
      "linear-gradient(180deg, rgba(159,122,234,0.25) 0%, rgba(159,122,234,0.08) 100%)",
    particleCount: 5,
  },
  3: {
    color: "#D4956B",
    colorSecondary: "#FBD38D",
    glowColor: "rgba(212,149,107,0.15)",
    icon: "◉",
    depthLabel: "STRUCTURE",
    bgGradient:
      "linear-gradient(135deg, rgba(212,149,107,0.04) 0%, rgba(251,211,141,0.02) 50%, rgba(255,255,255,0) 100%)",
    borderGradient:
      "linear-gradient(180deg, rgba(212,149,107,0.25) 0%, rgba(212,149,107,0.08) 100%)",
    particleCount: 7,
  },
  4: {
    color: "#CD6B6B",
    colorSecondary: "#FCA5A5",
    glowColor: "rgba(205,107,107,0.15)",
    icon: "◆",
    depthLabel: "ABYSS",
    bgGradient:
      "linear-gradient(135deg, rgba(205,107,107,0.04) 0%, rgba(252,165,165,0.02) 50%, rgba(255,255,255,0) 100%)",
    borderGradient:
      "linear-gradient(180deg, rgba(205,107,107,0.25) 0%, rgba(205,107,107,0.08) 100%)",
    particleCount: 9,
  },
};

// ── Depth Particles ──

function DepthParticles({
  count,
  color,
  isActive,
}: {
  count: number;
  color: string;
  isActive: boolean;
}) {
  if (!isActive) return null;
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {Array.from({ length: count }).map((_, i) => {
        const size = 2 + Math.random() * 3;
        const left = 10 + Math.random() * 80;
        const delay = Math.random() * 4;
        const duration = 6 + Math.random() * 8;
        return (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{
              width: size,
              height: size,
              left: `${left}%`,
              bottom: -10,
              background: color,
              opacity: 0,
              filter: `blur(${size > 3 ? 1 : 0}px)`,
            }}
            animate={{
              y: [0, -200 - Math.random() * 200],
              opacity: [0, 0.6, 0.3, 0],
              scale: [0.5, 1, 0.8],
            }}
            transition={{
              duration,
              delay,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        );
      })}
    </div>
  );
}

// ── Depth Progress Ring ──

function DepthRing({
  level,
  isOpen,
  color,
}: {
  level: number;
  isOpen: boolean;
  color: string;
}) {
  const size = 36;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const progress = level / 4;

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {/* Glow */}
      {isOpen && (
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${hexToRgba(color, 0.3)} 0%, transparent 70%)`,
            filter: "blur(6px)",
          }}
          animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0.8, 0.5] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      )}
      <svg width={size} height={size} className="relative z-10">
        {/* Background ring */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={hexToRgba(color, 0.08)}
          strokeWidth={stroke}
        />
        {/* Progress ring */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{
            strokeDashoffset: isOpen
              ? circumference * (1 - progress)
              : circumference * (1 - progress * 0.3),
            opacity: isOpen ? 1 : 0.4,
          }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          style={{
            transformOrigin: "center",
            transform: "rotate(-90deg)",
          }}
        />
        {/* Level number */}
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill={isOpen ? color : hexToRgba(color, 0.5)}
          fontSize="11"
          fontWeight="600"
          fontFamily="var(--font-mono-sg, monospace)"
        >
          {level}
        </text>
      </svg>
    </div>
  );
}

// ── Main Component ──

export default function DepthLayerAccordion({
  layerId,
  label,
  sublabel,
  description,
  depthLevel,
  defaultOpen = false,
  children,
}: Props) {
  const { theme } = useArchetypeTheme();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const contentRef = useRef<HTMLDivElement>(null);
  const design = DEPTH_DESIGNS[depthLevel] || DEPTH_DESIGNS[1];

  if (!theme) return null;

  const { text, border } = theme.palette;
  const contentId = `${layerId}-content`;

  return (
    <motion.section
      aria-labelledby={layerId}
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: isOpen ? design.bgGradient : "transparent",
        transition: "background 0.6s ease",
      }}
      layout
    >
      {/* Left accent border — animated gradient */}
      <motion.div
        className="absolute left-0 top-0 bottom-0 w-[3px] rounded-full"
        style={{
          background: isOpen
            ? design.borderGradient
            : hexToRgba(design.color, 0.1),
        }}
        animate={{
          opacity: isOpen ? 1 : 0.4,
        }}
        transition={{ duration: 0.22 }}
      />

      {/* Particles */}
      <DepthParticles
        count={design.particleCount}
        color={hexToRgba(design.color, 0.4)}
        isActive={isOpen}
      />

      {/* Header / Toggle */}
      <button
        id={layerId}
        className="w-full text-left px-5 py-5 flex items-center gap-4 relative z-10"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={contentId}
      >
        {/* Depth Ring */}
        <DepthRing
          level={depthLevel}
          isOpen={isOpen}
          color={design.color}
        />

        <div className="flex-1 min-w-0">
          {/* Depth label */}
          <motion.span
            className="text-[9px] font-mono-sg tracking-[0.3em] uppercase block mb-1"
            style={{ color: hexToRgba(design.color, isOpen ? 0.7 : 0.4) }}
            animate={{ letterSpacing: isOpen ? "0.35em" : "0.25em" }}
            transition={{ duration: 0.18 }}
          >
            {design.depthLabel}
          </motion.span>

          {/* Main label */}
          <div className="flex items-baseline gap-2">
            <motion.h3
              className="font-display font-semibold"
              style={{ color: hexToRgba(text, isOpen ? 0.96 : 0.7) }}
              animate={{ fontSize: isOpen ? "1.1rem" : "0.95rem" }}
              transition={{ duration: 0.18 }}
            >
              {label}
            </motion.h3>
            <span
              className="text-xs"
              style={{ color: hexToRgba(text, 0.4) }}
            >
              {sublabel}
            </span>
          </div>

          {/* Description — visible when closed */}
          <AnimatePresence>
            {!isOpen && (
              <motion.p
                className="text-xs mt-1 truncate"
                style={{ color: hexToRgba(text, 0.38) }}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
              >
                {description}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Expand indicator */}
        <motion.div
          className="flex-shrink-0 flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            borderRadius: "50%",
            background: hexToRgba(design.color, isOpen ? 0.08 : 0.04),
            border: `1px solid ${hexToRgba(design.color, isOpen ? 0.15 : 0.06)}`,
          }}
        >
          <motion.svg
            width={12}
            height={12}
            viewBox="0 0 12 12"
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            <path
              d="M2 4.5L6 8.5L10 4.5"
              stroke={hexToRgba(design.color, isOpen ? 0.8 : 0.4)}
              strokeWidth={1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </motion.svg>
        </motion.div>
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            id={contentId}
            ref={contentRef}
            role="region"
            aria-labelledby={layerId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{
              height: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
              opacity: { duration: 0.2, delay: 0.1 },
            }}
            className="overflow-hidden relative z-10"
          >
            {/* Top separator — glowing line */}
            <div
              className="mx-5 h-px mb-2"
              style={{
                background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(design.color, 0.2)} 30%, ${hexToRgba(design.color, 0.2)} 70%, transparent 100%)`,
              }}
            />

            <div className="px-3 pb-6 pt-2 space-y-7">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
