// app/stargazer/_components/GrowthStageCard.tsx
// 成長段階カード — Prochaska 変容段階 + 変化メトリクスを表示
"use client";

import { motion } from "framer-motion";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";
import { TRAIT_AXES, type TraitAxisKey } from "@/lib/stargazer/traitAxes";

// TraitEvolution の型（traitEvolution.ts から）
export interface TraitEvolutionSummary {
  changeStage:
    | "pre_contemplation"
    | "contemplation"
    | "preparation"
    | "action"
    | "maintenance";
  mostChanged: {
    axisId: TraitAxisKey;
    direction: "positive" | "negative" | "stable" | "oscillating";
    velocity: number;
    volatility: number;
  }[];
  accelerating: TraitAxisKey[];
  overallStability: number;
}

const STAGE_CONFIG: Record<
  TraitEvolutionSummary["changeStage"],
  { icon: string; label: string; description: string; color: string }
> = {
  pre_contemplation: {
    icon: "🌑",
    label: "沈黙期",
    description: "まだ変化の兆しは見えていない。自分を知る旅はこれから。",
    color: "#718096",
  },
  contemplation: {
    icon: "🌒",
    label: "気づき期",
    description: "何かが変わり始めている予感。自分の中で揺れが生まれている。",
    color: "#9F7AEA",
  },
  preparation: {
    icon: "🌓",
    label: "準備期",
    description: "変化の方向が見えてきた。自分が何を望んでいるか、少しずつ明らかに。",
    color: "#4299E1",
  },
  action: {
    icon: "🌔",
    label: "変容期",
    description: "内面が動いている。古い自己像が溶けて、新しい輪郭が生まれつつある。",
    color: "#F6AD55",
  },
  maintenance: {
    icon: "🌕",
    label: "定着期",
    description: "変化が安定してきた。新しい自分が日常に根を下ろしている。",
    color: "#38A169",
  },
};

const DIRECTION_LABELS: Record<string, string> = {
  positive: "↑ 強化",
  negative: "↓ 後退",
  stable: "→ 安定",
  oscillating: "↔ 揺動",
};

interface Props {
  evolution: TraitEvolutionSummary | null;
}

export default function GrowthStageCard({ evolution }: Props) {
  const { theme } = useArchetypeTheme();

  if (!theme || !evolution) return null;

  const { text, border } = theme.palette;
  const stage = STAGE_CONFIG[evolution.changeStage];
  const topChanged = evolution.mostChanged.slice(0, 4);

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
        <div className="flex items-center gap-3 mb-5">
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(stage.color, 0.3)} 100%)`,
            }}
          />
          <span
            className="text-xs font-mono-sg tracking-[0.25em] uppercase"
            style={{ color: hexToRgba(text, 0.74) }}
          >
            Growth Stage
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(stage.color, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        {/* Stage Display */}
        <div className="flex items-center gap-4 mb-4">
          <span className="text-3xl">{stage.icon}</span>
          <div>
            <h3
              className="text-lg font-medium"
              style={{ color: hexToRgba(text, 0.96) }}
            >
              {stage.label}
            </h3>
            <p
              className="text-sm"
              style={{ color: hexToRgba(text, 0.6) }}
            >
              {stage.description}
            </p>
          </div>
        </div>

        {/* Stage Progress Bar */}
        <div className="flex gap-1 mb-6" role="img" aria-label={`変容段階: ${stage.label}`}>
          {Object.keys(STAGE_CONFIG).map((key, i) => {
            const stageKeys = Object.keys(STAGE_CONFIG);
            const currentIdx = stageKeys.indexOf(evolution.changeStage);
            const isActive = i <= currentIdx;
            return (
              <div
                key={key}
                className="flex-1 h-1.5 rounded-full"
                style={{
                  background: isActive
                    ? stage.color
                    : hexToRgba(text, 0.08),
                  opacity: isActive ? 1 : 0.5,
                }}
              />
            );
          })}
        </div>

        {/* Overall Stability */}
        <div className="flex items-center gap-3 mb-5">
          <span className="text-xs" style={{ color: hexToRgba(text, 0.5) }}>
            全体安定度
          </span>
          <div
            className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: hexToRgba(text, 0.08) }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: stage.color }}
              initial={{ width: 0 }}
              whileInView={{ width: `${evolution.overallStability * 100}%` }}
              viewport={{ once: true }}
              transition={{ delay: 0.3, duration: 0.25 }}
            />
          </div>
          <span
            className="text-xs font-mono-sg"
            style={{ color: hexToRgba(text, 0.5) }}
          >
            {Math.round(evolution.overallStability * 100)}%
          </span>
        </div>

        {/* Most Changed Axes */}
        {topChanged.length > 0 && (
          <div>
            <h4
              className="text-xs font-medium mb-3"
              style={{ color: hexToRgba(text, 0.6) }}
            >
              最も変化している軸
            </h4>
            <div className="space-y-2">
              {topChanged.map((item, i) => {
                const axisDef = TRAIT_AXES.find((a) => a.id === item.axisId);
                if (!axisDef) return null;
                const dirLabel = DIRECTION_LABELS[item.direction] || item.direction;

                return (
                  <motion.div
                    key={item.axisId}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg"
                    style={{ background: hexToRgba(text, 0.03) }}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.06 }}
                  >
                    <span
                      className="text-xs flex-shrink-0 w-24 truncate"
                      style={{ color: hexToRgba(text, 0.7) }}
                    >
                      {axisDef.labelLeft}/{axisDef.labelRight}
                    </span>
                    <span
                      className="text-[10px] font-mono-sg px-1.5 py-0.5 rounded"
                      style={{
                        background: hexToRgba(stage.color, 0.1),
                        color: stage.color,
                      }}
                    >
                      {dirLabel}
                    </span>
                    {/* Velocity Mini-bar */}
                    <div className="flex-1 flex items-center gap-1">
                      <div
                        className="h-1 rounded-full"
                        style={{
                          width: `${Math.min(Math.abs(item.velocity) * 500, 100)}%`,
                          background: stage.color,
                          opacity: 0.6,
                        }}
                      />
                    </div>
                    <span
                      className="text-[9px] font-mono-sg flex-shrink-0"
                      style={{ color: hexToRgba(text, 0.4) }}
                    >
                      v{Math.round(Math.abs(item.velocity) * 100)}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Accelerating Axes */}
        {evolution.accelerating.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            <span className="text-xs" style={{ color: hexToRgba(text, 0.5) }}>
              加速中:
            </span>
            {evolution.accelerating.map((axisId) => {
              const axisDef = TRAIT_AXES.find((a) => a.id === axisId);
              return (
                <motion.span
                  key={axisId}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{
                    background: hexToRgba(stage.color, 0.12),
                    color: stage.color,
                  }}
                  animate={{ opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  🚀 {axisDef ? `${axisDef.labelLeft}/${axisDef.labelRight}` : axisId}
                </motion.span>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
