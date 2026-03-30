// app/stargazer/_components/JudgmentArchaeologyCard.tsx
// 判断考古学カード — 排除順序から判断原理の地層を可視化
"use client";

import { motion } from "framer-motion";
import type { JudgmentArchaeologyResult } from "@/lib/stargazer/judgmentArchaeology";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  archaeology: JudgmentArchaeologyResult;
}

export default function JudgmentArchaeologyCard({ archaeology }: Props) {
  const { theme } = useArchetypeTheme();

  if (!theme || archaeology.layers.length === 0) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  const layerColors: Record<string, string> = {
    instant_reject: "#FC8181",
    careful_elimination: "#F6AD55",
    reluctant_abandon: "#9F7AEA",
    agonized_choice: "#63B3ED",
  };

  const { decisiveness, reluctance, consistency } = archaeology.eliminationProfile;

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
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(primary, 0.3)} 100%)`,
            }}
          />
          <span
            className="text-xs font-mono-sg tracking-[0.25em] uppercase"
            style={{ color: hexToRgba(text, 0.74) }}
          >
            判断の地層
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <h3
          className="text-base font-medium mb-1"
          style={{ color: hexToRgba(text, 0.96) }}
        >
          判断のクセ — 選択肢を切り捨てる順番
        </h3>
        <p
          className="text-sm leading-relaxed mb-5"
          style={{ color: hexToRgba(text, 0.84) }}
        >
          選択肢をどの順番で切り捨てるかに、自分でも気づいていない価値観が表れています。
        </p>

        {/* Elimination Profile Gauges */}
        <div
          className="rounded-xl p-4 mb-4 space-y-3"
          style={{
            background: hexToRgba(accent, 0.04),
            border: `1px solid ${hexToRgba(accent, 0.12)}`,
          }}
        >
          <ProfileGauge
            label="決断力"
            value={decisiveness}
            color="#48BB78"
            textColor={text}
            textMutedColor={textMuted}
            bgColor={primary}
          />
          <ProfileGauge
            label="迷いの多さ"
            value={reluctance}
            color="#FC8181"
            textColor={text}
            textMutedColor={textMuted}
            bgColor={primary}
          />
          <ProfileGauge
            label="一貫性"
            value={consistency}
            color="#63B3ED"
            textColor={text}
            textMutedColor={textMuted}
            bgColor={primary}
          />
        </div>

        {/* Judgment Layers (Stratigraphy) */}
        <div className="relative mb-4">
          <div className="space-y-0">
            {archaeology.layers.map((layer, i) => {
              const color = layerColors[layer.patternType] ?? accent;

              return (
                <motion.div
                  key={layer.patternType}
                  className="relative"
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                >
                  {/* Layer stripe */}
                  <div
                    className="rounded-lg p-3 mb-1"
                    style={{
                      background: `linear-gradient(90deg, ${hexToRgba(color, 0.08)}, ${hexToRgba(color, 0.02)})`,
                      borderLeft: `3px solid ${hexToRgba(color, 0.5)}`,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-mono px-1.5 py-0.5 rounded-full"
                        style={{
                          background: hexToRgba(color, 0.12),
                          color: color,
                        }}
                      >
                        深度 {(layer.depth * 100).toFixed(0)}%
                      </span>
                      <span
                        className="text-xs font-medium"
                        style={{ color: hexToRgba(text, 0.94) }}
                      >
                        {layer.label}
                      </span>
                      <span
                        className="text-xs font-mono ml-auto"
                        style={{ color: hexToRgba(text, 0.78) }}
                      >
                        ~{(layer.avgEliminationSpeed / 1000).toFixed(1)}s · {layer.questionCount}件
                      </span>
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: hexToRgba(text, 0.82) }}
                    >
                      {layer.insight}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Conflict Frontier */}
        {archaeology.conflictFrontier.length > 0 && (
          <div className="mb-4">
            <span
              className="text-xs font-medium block mb-2"
              style={{ color: hexToRgba(text, 0.86) }}
            >
              特に迷いやすいテーマ
            </span>
            <div className="space-y-1.5">
              {archaeology.conflictFrontier.map((frontier, i) => (
                <motion.div
                  key={frontier.axisId}
                  className="flex items-center gap-2 rounded-lg p-2"
                  style={{
                    background: hexToRgba("#FC8181", 0.04),
                    border: `1px solid ${hexToRgba("#FC8181", 0.08)}`,
                  }}
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + i * 0.08 }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: "#FC8181" }}
                  />
                  <span
                    className="text-xs truncate flex-1"
                    style={{ color: hexToRgba(text, 0.9) }}
                  >
                    {frontier.axisId.replace(/_/g, " ")}
                  </span>
                  <span
                    className="text-xs font-mono flex-shrink-0"
                    style={{ color: "#FC8181" }}
                  >
                    avg {(frontier.avgHesitationMs / 1000).toFixed(1)}s
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {/* Interpretation */}
        <div
          className="p-3 rounded-lg"
          style={{
            background: hexToRgba(primary, 0.03),
            border: `1px dashed ${hexToRgba(border, 0.3)}`,
          }}
        >
          <p
            className="text-xs leading-relaxed text-center"
            style={{ color: hexToRgba(text, 0.82) }}
          >
            {archaeology.interpretation}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Sub-component: Profile Gauge ──

function ProfileGauge({
  label,
  value,
  color,
  textColor,
  textMutedColor,
  bgColor,
}: {
  label: string;
  value: number;
  color: string;
  textColor: string;
  textMutedColor: string;
  bgColor: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs" style={{ color: hexToRgba(textColor, 0.82) }}>
          {label}
        </span>
        <span
          className="text-xs font-mono"
          style={{ color }}
        >
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: hexToRgba(bgColor, 0.06) }}
      >
        <motion.div
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${hexToRgba(color, 0.4)}, ${hexToRgba(color, 0.7)})`,
          }}
          initial={{ width: 0 }}
          whileInView={{ width: `${value * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}
