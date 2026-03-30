// app/stargazer/_components/PredictiveCloneCard.tsx
// 予測的分身カード — 「次にあなたはこう判断する」を分身が予測
"use client";

import { motion } from "framer-motion";
import type { PredictiveCloneResult } from "@/lib/stargazer/predictiveClone";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  cloneResult: PredictiveCloneResult;
}

const CATEGORY_CONFIG: Record<
  string,
  { icon: string; color: string }
> = {
  decision: { icon: "◇", color: "#63B3ED" },
  social: { icon: "♡", color: "#F687B3" },
  stress: { icon: "⚡", color: "#FC8181" },
  creative: { icon: "✦", color: "#48BB78" },
  conflict: { icon: "⇄", color: "#F6AD55" },
};

export default function PredictiveCloneCard({ cloneResult }: Props) {
  const { theme } = useArchetypeTheme();

  if (!theme || cloneResult.predictions.length === 0) return null;

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
        <div className="flex items-center gap-3 mb-5">
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(primary, 0.3)} 100%)`,
            }}
          />
          <span
            className="text-[10px] font-mono-sg tracking-[0.25em] uppercase"
            style={{ color: textMuted }}
          >
            予測的分身
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <h3
          className="text-sm font-medium mb-1"
          style={{ color: text }}
        >
          あなたの「次の手」を読む
        </h3>
        <p
          className="text-xs leading-relaxed mb-4"
          style={{ color: textMuted }}
        >
          これまでの観測データをもとに、あなたが特定の場面でどう動くかを予測します。
        </p>

        {/* Clone Accuracy & Data Completeness */}
        <div
          className="rounded-xl p-3.5 mb-4"
          style={{
            background: hexToRgba(accent, 0.04),
            border: `1px solid ${hexToRgba(accent, 0.12)}`,
          }}
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px]" style={{ color: textMuted }}>
                  分身精度
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: accent }}
                >
                  {(cloneResult.cloneAccuracy * 100).toFixed(0)}%
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: hexToRgba(primary, 0.06) }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${hexToRgba(accent, 0.4)}, ${hexToRgba(accent, 0.7)})`,
                  }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${cloneResult.cloneAccuracy * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px]" style={{ color: textMuted }}>
                  データ充足度
                </span>
                <span
                  className="text-xs font-mono"
                  style={{ color: textMuted }}
                >
                  {(cloneResult.dataCompleteness * 100).toFixed(0)}%
                </span>
              </div>
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: hexToRgba(primary, 0.06) }}
              >
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: `linear-gradient(90deg, ${hexToRgba(primary, 0.2)}, ${hexToRgba(primary, 0.4)})`,
                  }}
                  initial={{ width: 0 }}
                  whileInView={{ width: `${cloneResult.dataCompleteness * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
                />
              </div>
            </div>
          </div>
          <p
            className="text-[10px] leading-relaxed"
            style={{ color: textMuted }}
          >
            {cloneResult.cloneSummary}
          </p>
        </div>

        {/* Scenario Predictions */}
        <div className="space-y-2.5">
          {cloneResult.predictions.map((prediction, i) => {
            const config = CATEGORY_CONFIG[prediction.category] ?? {
              icon: "·",
              color: accent,
            };
            const prob = Math.round(prediction.predictedChoice.probability * 100);

            return (
              <motion.div
                key={prediction.scenarioId}
                className="rounded-xl p-3"
                style={{
                  background: hexToRgba(config.color, 0.04),
                  border: `1px solid ${hexToRgba(config.color, 0.1)}`,
                }}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
              >
                {/* Scenario */}
                <div className="flex items-start gap-2 mb-2">
                  <span className="text-xs mt-0.5">{config.icon}</span>
                  <p
                    className="text-xs leading-relaxed flex-1"
                    style={{ color: text, opacity: 0.85 }}
                  >
                    {prediction.scenario}
                  </p>
                </div>

                {/* Predicted Choice */}
                <div className="flex items-center gap-2 mb-1.5">
                  <span
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{
                      background: hexToRgba(config.color, 0.12),
                      color: config.color,
                    }}
                  >
                    {prediction.predictedChoice.label}
                  </span>
                  <span
                    className="text-[10px] font-mono ml-auto"
                    style={{ color: config.color }}
                  >
                    {prob}%
                  </span>
                </div>

                {/* Probability Distribution (mini bar) */}
                <div className="flex gap-0.5 mb-1.5">
                  {prediction.distribution.map((d) => (
                    <motion.div
                      key={d.optionId}
                      className="h-1 rounded-full"
                      style={{
                        background:
                          d.optionId === prediction.predictedChoice.optionId
                            ? config.color
                            : hexToRgba(primary, 0.12),
                      }}
                      initial={{ width: 0 }}
                      whileInView={{
                        width: `${d.probability * 100}%`,
                      }}
                      viewport={{ once: true }}
                      transition={{
                        duration: 0.22,
                        delay: i * 0.07 + 0.2,
                      }}
                    />
                  ))}
                </div>

                {/* Reasoning */}
                <p
                  className="text-[10px] leading-relaxed"
                  style={{ color: textMuted }}
                >
                  {prediction.cloneReasoning}
                </p>

                {/* Context Sensitivity */}
                {prediction.contextSensitivity > 0.3 && (
                  <div className="flex items-center gap-1 mt-1.5">
                    <div
                      className="w-1 h-1 rounded-full"
                      style={{ background: "#F6AD55" }}
                    />
                    <span
                      className="text-[9px]"
                      style={{ color: textMuted }}
                    >
                      状況依存度 {(prediction.contextSensitivity * 100).toFixed(0)}% -- 場面によって変わる可能性あり
                    </span>
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Predictable / Unpredictable Areas */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {cloneResult.predictableAreas.length > 0 && (
            <div
              className="rounded-lg p-2.5"
              style={{
                background: hexToRgba("#48BB78", 0.04),
                border: `1px solid ${hexToRgba("#48BB78", 0.1)}`,
              }}
            >
              <span
                className="text-[9px] block mb-1.5"
                style={{ color: "#48BB78" }}
              >
                予測しやすい
              </span>
              {cloneResult.predictableAreas.map((area) => (
                <div
                  key={area.area}
                  className="flex items-center justify-between"
                >
                  <span
                    className="text-[10px]"
                    style={{ color: text, opacity: 0.7 }}
                  >
                    {area.area}
                  </span>
                  <span
                    className="text-[9px] font-mono"
                    style={{ color: "#48BB78" }}
                  >
                    {(area.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}
          {cloneResult.unpredictableAreas.length > 0 && (
            <div
              className="rounded-lg p-2.5"
              style={{
                background: hexToRgba("#FC8181", 0.04),
                border: `1px solid ${hexToRgba("#FC8181", 0.1)}`,
              }}
            >
              <span
                className="text-[9px] block mb-1.5"
                style={{ color: "#FC8181" }}
              >
                予測が難しい
              </span>
              {cloneResult.unpredictableAreas.map((area) => (
                <div key={area.area}>
                  <span
                    className="text-[10px]"
                    style={{ color: text, opacity: 0.7 }}
                  >
                    {area.area}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
