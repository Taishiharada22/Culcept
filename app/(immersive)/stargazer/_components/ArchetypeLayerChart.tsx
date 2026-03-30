// app/stargazer/_components/ArchetypeLayerChart.tsx
// Stargazer v3 — 3-Layer Score Visualization
// Shows the user's scores across all 3 layers (P/B/H, E/I/S, A/W/D)
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  COGNITION_DEFS,
  EMOTION_DEFS,
  SOCIAL_DEFS,
  EXECUTION_DEFS,
} from "@/lib/stargazer/archetypeTypes";
import type { CognitionCode, EmotionCode, SocialCode, ExecutionCode, AxisDef } from "@/lib/stargazer/archetypeTypes";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

/** Adjust alpha of an rgba() or hex color string */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) return hexToRgba(color, alpha);
  return color.replace(/[\d.]+\)$/, `${alpha})`);
}

// ── Types ──

interface LayerScores {
  layer1: { A: number; N: number; S: number; winner: CognitionCode };
  layer2: { C: number; V: number; winner: EmotionCode };
  layer3: { I: number; E: number; winner: SocialCode };
  layer4?: { O: number; X: number; winner: ExecutionCode };
}

interface Props {
  scores: LayerScores;
}

// ── Layer Labels ──

const LAYER_META = {
  layer1: {
    title: "認知スタイル",
    subtitle: "どう考えるか",
    codes: ["A", "N", "S"] as CognitionCode[],
    getDef: (code: string) => COGNITION_DEFS[code as CognitionCode],
  },
  layer2: {
    title: "感情の動き",
    subtitle: "感情がどう動くか",
    codes: ["C", "V"] as EmotionCode[],
    getDef: (code: string) => EMOTION_DEFS[code as EmotionCode],
  },
  layer3: {
    title: "エネルギーの方向",
    subtitle: "内向か外向か",
    codes: ["I", "E"] as SocialCode[],
    getDef: (code: string) => SOCIAL_DEFS[code as SocialCode],
  },
  layer4: {
    title: "実行スタイル",
    subtitle: "どう動くか",
    codes: ["O", "X"] as ExecutionCode[],
    getDef: (code: string) => EXECUTION_DEFS[code as ExecutionCode],
  },
} as const;

// ── Score Bar ──

/** Convert raw score (-3..+3) to a human-readable percentage (0-100) */
function toPercent(score: number): number {
  return Math.round(Math.min(Math.max((score + 3) / 6, 0), 1) * 100);
}

/** Convert raw score to a strength label */
function getStrengthLabel(percent: number, isWinner: boolean): string {
  if (!isWinner) {
    if (percent < 30) return "弱い";
    if (percent < 45) return "やや弱い";
    return "ふつう";
  }
  if (percent >= 75) return "とても強い";
  if (percent >= 60) return "強い";
  return "やや強い";
}

function ScoreBar({
  label,
  englishLabel,
  description,
  score,
  isWinner,
  primary,
  accent,
  text,
  textMuted,
  border,
  gradient,
  delay,
}: {
  label: string;
  englishLabel: string;
  description: string;
  score: number;
  isWinner: boolean;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  gradient: string;
  delay: number;
}) {
  const percent = toPercent(score);
  const strengthLabel = getStrengthLabel(percent, isWinner);

  return (
    <motion.div
      className="space-y-1.5"
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Label Row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isWinner && (
            <motion.div
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ background: accent }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.7, 1, 0.7],
              }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          <span
            className="text-sm font-semibold"
            style={{ color: isWinner ? text : withAlpha(text, 0.6) }}
          >
            {label}
          </span>
          <span
            className="text-[10px] font-mono tracking-wide"
            style={{ color: withAlpha(textMuted, 0.7) }}
          >
            {englishLabel}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs font-semibold"
            style={{ color: isWinner ? accent : withAlpha(textMuted, 0.7) }}
          >
            {percent}%
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-md"
            style={{
              background: isWinner ? hexToRgba(accent, 0.12) : hexToRgba(primary, 0.06),
              color: isWinner ? accent : withAlpha(textMuted, 0.7),
              fontWeight: isWinner ? 600 : 400,
            }}
          >
            {strengthLabel}
          </span>
        </div>
      </div>

      {/* Bar */}
      <div
        className="h-2.5 rounded-full overflow-hidden relative"
        style={{
          background: hexToRgba(primary, 0.08),
        }}
      >
        <motion.div
          className="absolute top-0 left-0 h-full rounded-full"
          style={{
            background: isWinner
              ? gradient
              : hexToRgba(primary, 0.25),
          }}
          initial={{ width: 0 }}
          whileInView={{ width: `${percent}%` }}
          viewport={{ once: true }}
          transition={{
            delay: delay + 0.15,
            duration: 0.25,
            ease: [0.22, 1, 0.36, 1],
          }}
        />
      </div>

      {/* Description */}
      {isWinner && description && (
        <p
          className="text-xs leading-relaxed pl-3.5"
          style={{ color: withAlpha(text, 0.7) }}
        >
          {description}
        </p>
      )}
    </motion.div>
  );
}

// ── Main Component ──

export default function ArchetypeLayerChart({ scores }: Props) {
  const { theme } = useArchetypeTheme();

  type LayerEntry = {
    key: string;
    meta: { title: string; subtitle: string; codes: readonly string[]; getDef: (code: string) => AxisDef | undefined };
    scores: Record<string, number>;
    winner: string;
  };

  const layers = useMemo(
    () => {
      const base: LayerEntry[] = [
        {
          key: "layer1",
          meta: LAYER_META.layer1,
          scores: { A: scores.layer1.A, N: scores.layer1.N, S: scores.layer1.S },
          winner: scores.layer1.winner,
        },
        {
          key: "layer2",
          meta: LAYER_META.layer2,
          scores: { C: scores.layer2.C, V: scores.layer2.V },
          winner: scores.layer2.winner,
        },
        {
          key: "layer3",
          meta: LAYER_META.layer3,
          scores: { I: scores.layer3.I, E: scores.layer3.E },
          winner: scores.layer3.winner,
        },
      ];
      if (scores.layer4) {
        base.push({
          key: "layer4",
          meta: LAYER_META.layer4,
          scores: { O: scores.layer4.O, X: scores.layer4.X },
          winner: scores.layer4.winner,
        });
      }
      return base;
    },
    [scores],
  );

  if (!theme) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: theme.gradient.card,
        border: `1px solid ${border}`,
        backdropFilter: `blur(${theme.glassEffect.blur})`,
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="p-6 sm:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-3">
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(primary, 0.3)} 100%)`,
            }}
          />
          <span
            className="text-[10px] font-mono-sg tracking-[0.25em] uppercase font-semibold"
            style={{ color: text }}
          >
            4軸の内面構造
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>
        <p
          className="text-sm text-center mb-8 leading-relaxed"
          style={{ color: withAlpha(text, 0.7) }}
        >
          観測データから、あなたの内面を4つの軸で読み解いています。
        </p>

        {/* Layer Sections */}
        <div className="space-y-8">
          {layers.map((layer, layerIdx) => (
            <div key={layer.key}>
              {/* Layer Title */}
              <motion.div
                className="flex items-center gap-2 mb-4"
                initial={{ opacity: 0 }}
                whileInView={{ opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: layerIdx * 0.15 }}
              >
                <span
                  className="w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-mono font-bold"
                  style={{
                    background: hexToRgba(primary, 0.15),
                    color: accent,
                    border: `1px solid ${hexToRgba(primary, 0.25)}`,
                  }}
                >
                  {layerIdx + 1}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{ color: text }}
                >
                  {layer.meta.title}
                </span>
                <span
                  className="text-xs font-medium"
                  style={{ color: withAlpha(text, 0.6) }}
                >
                  — {layer.meta.subtitle}
                </span>
              </motion.div>

              {/* Bars */}
              <div className="space-y-2.5 pl-7">
                {layer.meta.codes.map((code, barIdx) => {
                  const def = layer.meta.getDef(code);
                  const scoreVal =
                    layer.scores[code as keyof typeof layer.scores];

                  return (
                    <ScoreBar
                      key={code}
                      label={def?.label ?? code}
                      englishLabel={def?.englishLabel ?? code}
                      description={def?.description ?? ""}
                      score={scoreVal as number}
                      isWinner={layer.winner === code}
                      primary={primary}
                      accent={accent}
                      text={text}
                      textMuted={textMuted}
                      border={border}
                      gradient={theme.gradient.button}
                      delay={layerIdx * 0.15 + barIdx * 0.06}
                    />
                  );
                })}
              </div>

              {/* Divider between layers */}
              {layerIdx < layers.length - 1 && (
                <div
                  className="mt-6 h-px"
                  style={{
                    background: `linear-gradient(90deg, transparent 10%, ${hexToRgba(border, 0.4)} 50%, transparent 90%)`,
                  }}
                />
              )}
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
