// app/stargazer/_components/MetaObservationCard.tsx
// メタ観測カード — 自己分析結果への反応から見える深層構造
"use client";

import { motion } from "framer-motion";
import type { MetaObservationInsight } from "@/lib/stargazer/innovativeMechanisms";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  metaInsights: MetaObservationInsight[];
}

export default function MetaObservationCard({ metaInsights }: Props) {
  const { theme } = useArchetypeTheme();

  if (!theme || metaInsights.length === 0) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  const reactionConfig: Record<
    MetaObservationInsight["reactionType"],
    { icon: string; label: string; color: string }
  > = {
    surprised: { icon: "😮", label: "意外", color: "#F6AD55" },
    validated: { icon: "✓", label: "納得", color: "#48BB78" },
    denied: { icon: "✗", label: "否定", color: "#FC8181" },
    curious: { icon: "?", label: "興味", color: "#63B3ED" },
    indifferent: { icon: "—", label: "無関心", color: accent },
  };

  // Compute self-awareness score
  const awarenessScore = metaInsights.reduce((sum, insight) => {
    switch (insight.reactionType) {
      case "validated": return sum + 1.0;
      case "curious": return sum + 0.8;
      case "surprised": return sum + 0.5;
      case "denied": return sum + 0.3;
      case "indifferent": return sum + 0.1;
      default: return sum;
    }
  }, 0) / metaInsights.length;

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
            Meta-Observation
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
          結果への反応 — 分析結果をどう感じたか
        </h3>
        <p
          className="text-sm leading-relaxed mb-4"
          style={{ color: hexToRgba(text, 0.84) }}
        >
          分析結果を見たときの感想も、自分を知る大切な手がかりです。
        </p>

        {/* Self-awareness gauge */}
        <div
          className="rounded-xl p-3.5 mb-4"
          style={{
            background: hexToRgba(accent, 0.04),
            border: `1px solid ${hexToRgba(accent, 0.12)}`,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs" style={{ color: hexToRgba(text, 0.8) }}>
              自分を知る力
            </span>
            <span
              className="text-sm font-mono"
              style={{ color: accent }}
            >
              {(awarenessScore * 100).toFixed(0)}%
            </span>
          </div>
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: hexToRgba(primary, 0.06) }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{
                background: `linear-gradient(90deg, ${hexToRgba(accent, 0.4)}, ${hexToRgba(accent, 0.7)})`,
              }}
              initial={{ width: 0 }}
              whileInView={{ width: `${awarenessScore * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            />
          </div>
          <p
            className="text-xs mt-1.5"
            style={{ color: hexToRgba(text, 0.82) }}
          >
            {awarenessScore > 0.7
              ? "自分のことをよく理解できています。分析結果と自己イメージがよく一致しています。"
              : awarenessScore > 0.4
                ? "自分を知る途中です。意外な発見が、まだ気づいていない一面を示しています。"
                : "自分が思う姿と分析結果にズレがあります。ここに一番の発見があるかもしれません。"}
          </p>
        </div>

        {/* Reaction details */}
        <div className="space-y-2.5">
          {metaInsights.map((insight, i) => {
            const config = reactionConfig[insight.reactionType] ?? { icon: "•", label: insight.reactionType, color: "#94A3B8" };

            return (
              <motion.div
                key={i}
                className="rounded-xl p-3"
                style={{
                  background: hexToRgba(config.color, 0.04),
                  border: `1px solid ${hexToRgba(config.color, 0.1)}`,
                }}
                initial={{ opacity: 0, x: -8 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-sm">{config.icon}</span>
                  <span
                    className="text-xs px-1.5 py-0.5 rounded-full font-mono"
                    style={{
                      background: hexToRgba(config.color, 0.1),
                      color: config.color,
                    }}
                  >
                    {config.label}
                  </span>
                  <span
                    className="text-xs ml-auto truncate max-w-[140px]"
                    style={{ color: hexToRgba(text, 0.78) }}
                  >
                    {insight.relatedAxes?.[0]?.replace(/_/g, " ")}
                  </span>
                </div>
                <p
                  className="text-sm leading-relaxed mb-1"
                  style={{ color: hexToRgba(text, 0.9) }}
                >
                  {insight.insight}
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: hexToRgba(text, 0.82) }}
                >
                  {insight.deeperImplication}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
