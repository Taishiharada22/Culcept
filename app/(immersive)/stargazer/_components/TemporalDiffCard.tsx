// app/stargazer/_components/TemporalDiffCard.tsx
// 時間差分カード — 同じ質問への回答変化を表示
"use client";

import { motion } from "framer-motion";
import type { TemporalDiffResult } from "@/lib/stargazer/innovativeMechanisms";
import { TRAIT_AXES } from "@/lib/stargazer/traitAxes";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  temporalDiffs: TemporalDiffResult[];
}

export default function TemporalDiffCard({ temporalDiffs }: Props) {
  const { theme } = useArchetypeTheme();

  if (!theme || temporalDiffs.length === 0) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  const directionConfig: Record<
    TemporalDiffResult["direction"],
    { icon: string; color: string; label: string }
  > = {
    strengthened: { icon: "↑", color: "#48BB78", label: "強化" },
    weakened: { icon: "↓", color: "#F6AD55", label: "弱化" },
    reversed: { icon: "⇄", color: "#FC8181", label: "反転" },
    stable: { icon: "—", color: accent, label: "安定" },
  };

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
            時間差分
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
          変化の瞬間 — 同じ問いへの回答の変化
        </h3>
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: hexToRgba(text, 0.84) }}
        >
          同じ質問に再び答えたとき、前回との違いにあなたの内面の変化が映し出されます。
        </p>

        <div className="space-y-3">
          {temporalDiffs.map((diff, i) => {
            const config = directionConfig[diff.direction];
            const axis = TRAIT_AXES.find((a) => a.id === diff.axisId);
            // スコアの変化方向に合わせてラベルを組み立て
            // scoreDiff > 0 → labelRight方向へ移動、scoreDiff < 0 → labelLeft方向へ移動
            const movingToward = axis
              ? (diff.scoreDiff >= 0 ? axis.labelRight : axis.labelLeft)
              : null;
            const movingFrom = axis
              ? (diff.scoreDiff >= 0 ? axis.labelLeft : axis.labelRight)
              : null;
            const axisLabel = axis
              ? `${movingFrom} → ${movingToward}`
              : diff.axisId;

            return (
              <motion.div
                key={`${diff.axisId}-${i}`}
                className="rounded-xl p-3.5"
                style={{
                  background: hexToRgba(config.color, 0.04),
                  border: `1px solid ${hexToRgba(config.color, 0.12)}`,
                }}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{
                      background: hexToRgba(config.color, 0.12),
                      color: config.color,
                    }}
                  >
                    {config.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-sm font-medium block truncate"
                      style={{ color: hexToRgba(text, 0.94) }}
                    >
                      {axisLabel}
                    </span>
                    <span
                      className="text-xs font-mono"
                      style={{ color: hexToRgba(text, 0.8) }}
                    >
                      {diff.daysBetween}日間の変化 · {config.label}
                    </span>
                  </div>
                  {/* Score change indicator */}
                  <div className="flex items-center gap-1">
                    <span
                      className="text-xs font-mono"
                      style={{ color: config.color }}
                    >
                      {diff.scoreDiff > 0 ? "+" : ""}
                      {(diff.scoreDiff * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: hexToRgba(text, 0.9) }}
                >
                  {diff.interpretation}
                </p>
                {/* Confidence dots */}
                <div className="flex items-center gap-1 mt-2">
                  {[...Array(3)].map((_, ci) => (
                    <div
                      key={ci}
                      className="w-1 h-1 rounded-full"
                      style={{
                        background:
                          ci < Math.ceil(diff.confidence * 3)
                            ? config.color
                            : hexToRgba(primary, 0.15),
                      }}
                    />
                  ))}
                  <span
                    className="text-xs ml-1"
                    style={{ color: hexToRgba(text, 0.78) }}
                  >
                    信頼度
                  </span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
