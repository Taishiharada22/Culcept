// app/stargazer/_components/ArchetypeHero.tsx
// Stargazer v4 — 24 Archetype Hero Card (Light Mode Glassmorphism)
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { ArchetypeCode } from "@/lib/stargazer/archetypeTypes";
import {
  getArchetypeByCode,
  parseArchetypeCode,
  LAYER1_DEFS,
  LAYER2_DEFS,
  LAYER3_DEFS,
} from "@/lib/stargazer/archetypeTypes";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import ArchetypeFigure from "./ArchetypeFigure";
import { hexToRgba } from "../_utils/color";

/** Adjust alpha of an rgba() or hex color string */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) return hexToRgba(color, alpha);
  return color.replace(/[\d.]+\)$/, `${alpha})`);
}

// ── Types ──

interface Props {
  archetypeCode: ArchetypeCode;
  confidence: number; // 0-1
  observationCount: number;
}

// ── Component ──

export default function ArchetypeHero({
  archetypeCode,
  confidence,
  observationCount,
}: Props) {
  const { theme } = useArchetypeTheme();

  const def = useMemo(() => getArchetypeByCode(archetypeCode), [archetypeCode]);
  const layers = useMemo(
    () => parseArchetypeCode(archetypeCode),
    [archetypeCode],
  );

  const l1 = useMemo(() => LAYER1_DEFS[layers.layer1], [layers.layer1]);
  const l2 = useMemo(() => LAYER2_DEFS[layers.layer2], [layers.layer2]);
  const l3 = useMemo(() => LAYER3_DEFS[layers.layer3], [layers.layer3]);

  if (!def || !theme) return null;

  const { palette, gradient, glassEffect, typography } = theme;
  const confidencePercent = Math.round(confidence * 100);

  return (
    <motion.section
      className="relative overflow-hidden rounded-[1.25rem]"
      style={{
        background: gradient.hero,
        border: `1px solid ${palette.border}`,
        boxShadow: `0 0 60px ${palette.glow}, 0 8px 32px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)`,
        backdropFilter: `blur(${glassEffect.blur})`,
        WebkitBackdropFilter: `blur(${glassEffect.blur})`,
      }}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Reticle corner accents */}
      <div
        className="absolute top-[-1px] left-[-1px] w-10 h-10 pointer-events-none"
        style={{
          borderTop: `2px solid ${hexToRgba(palette.primary, 0.3)}`,
          borderLeft: `2px solid ${hexToRgba(palette.primary, 0.3)}`,
          borderTopLeftRadius: "1.25rem",
        }}
      />
      <div
        className="absolute bottom-[-1px] right-[-1px] w-10 h-10 pointer-events-none"
        style={{
          borderBottom: `2px solid ${hexToRgba(palette.primary, 0.3)}`,
          borderRight: `2px solid ${hexToRgba(palette.primary, 0.3)}`,
          borderBottomRightRadius: "1.25rem",
        }}
      />

      {/* Ambient glow */}
      <div
        className="absolute top-0 right-0 w-48 h-48 pointer-events-none"
        style={{
          background: `radial-gradient(circle at 80% 20%, ${palette.nebulaColor} 0%, transparent 70%)`,
          filter: "blur(40px)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 px-6 py-8 sm:px-8 sm:py-10">
        {/* Archetype Code Badge */}
        <motion.div
          className="flex items-center gap-3 mb-5"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        >
          <span
            className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-mono-sg tracking-[0.15em] uppercase"
            style={{
              background: hexToRgba(palette.primary, 0.1),
              border: `1px solid ${hexToRgba(palette.primary, 0.2)}`,
              color: palette.textLabel,
            }}
          >
            {archetypeCode}
          </span>
          <span
            className="text-xs tracking-wide"
            style={{ color: palette.textMuted }}
          >
            {def.englishName}
          </span>
          {/* Confidence */}
          <span
            className="ml-auto text-xs px-2.5 py-1 rounded-full font-mono-sg"
            style={{
              background: hexToRgba(palette.primary, 0.08),
              border: `1px solid ${hexToRgba(palette.primary, 0.15)}`,
              color: palette.textLabel,
            }}
          >
            観測精度 {confidencePercent}%
          </span>
        </motion.div>

        {/* Main Identity */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center gap-4 mb-3">
            <motion.div
              className="h-16 w-16 shrink-0 sm:h-20 sm:w-20"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 200,
                damping: 15,
                delay: 0.2,
              }}
              style={{
                filter: `drop-shadow(0 0 24px ${palette.glow})`,
              }}
            >
              <ArchetypeFigure
                englishName={def.englishName}
                emoji={def.emoji}
                alt={def.name}
                containerClassName="h-full w-full"
                imageClassName="object-contain"
                fallbackClassName="text-5xl sm:text-6xl"
                priority
                sizes="(min-width: 640px) 80px, 64px"
              />
            </motion.div>
            <div>
              <h2
                className="font-display text-3xl sm:text-4xl leading-tight"
                style={{
                  color: palette.text,
                  fontWeight: typography.headingWeight,
                  letterSpacing: typography.letterSpacing,
                }}
              >
                {def.name}
              </h2>
              {def.quote && (
                <p
                  className="text-sm sm:text-base mt-2 leading-relaxed italic"
                  style={{ color: withAlpha(palette.text, 0.75) }}
                >
                  「{def.quote.text}」
                  <span
                    className="not-italic ml-1.5 text-xs"
                    style={{ color: withAlpha(palette.text, 0.5) }}
                  >
                    — {def.quote.author}
                  </span>
                </p>
              )}
              <p
                className="text-sm mt-1 font-display italic"
                style={{ color: hexToRgba(palette.primary, 0.7) }}
              >
                {def.tagline}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Description */}
        <motion.p
          className="text-sm leading-[1.9] mb-6"
          style={{ color: palette.text }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          {def.description}
        </motion.p>

        {/* 3-Layer Breakdown */}
        <motion.div
          className="flex flex-wrap gap-3 mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.22, delay: 0.35 }}
        >
          {[
            { layer: l1, label: "大切なもの", sublabel: "あなたを動かす中心動機", code: layers.layer1 },
            { layer: l2, label: "納得のしかた", sublabel: "確信に至る情報処理の型", code: layers.layer2 },
            { layer: l3, label: "行動", sublabel: "追い込まれた時の反応パターン", code: layers.layer3 },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{
                background: hexToRgba(palette.primary, 0.06 + i * 0.02),
                border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
              }}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.4 + i * 0.08 }}
            >
              <span
                className="text-[10px] font-mono-sg uppercase tracking-wider font-semibold"
                style={{ color: withAlpha(palette.text, 0.6) }}
              >
                {item.label}
              </span>
              <div className="flex flex-col">
                <span
                  className="text-xs font-bold"
                  style={{ color: palette.text }}
                >
                  {item.layer?.label ?? item.code}
                </span>
                <span
                  className="text-[9px]"
                  style={{ color: withAlpha(palette.text, 0.4) }}
                >
                  {item.sublabel}
                </span>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Stats Row */}
        <motion.div
          className="flex items-center gap-5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {/* Confidence Gauge */}
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-mono-sg"
              style={{
                background: hexToRgba(palette.primary, 0.1),
                border: `1.5px solid ${hexToRgba(palette.primary, 0.25)}`,
                color: palette.textLabel,
              }}
            >
              {confidencePercent}
            </div>
            <div>
              <div
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: withAlpha(palette.text, 0.55) }}
              >
                観測精度
              </div>
              <div className="text-xs" style={{ color: palette.text }}>
                {confidencePercent >= 80
                  ? "高精度"
                  : confidencePercent >= 60
                    ? "安定"
                    : "収集中"}
              </div>
              <div className="text-[9px] mt-0.5" style={{ color: withAlpha(palette.text, 0.35), lineHeight: 1.3 }}>
                観測量と一貫性から計算。100%には届きません — 人間は複雑だから。
              </div>
            </div>
          </div>

          {/* Observation Count */}
          <div className="flex items-center gap-2">
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ background: palette.primary }}
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
            <div>
              <div
                className="text-[10px] uppercase tracking-wider font-semibold"
                style={{ color: withAlpha(palette.text, 0.55) }}
              >
                観測回数
              </div>
              <div
                className="text-xs font-mono-sg"
                style={{ color: palette.text }}
              >
                {observationCount}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </motion.section>
  );
}
