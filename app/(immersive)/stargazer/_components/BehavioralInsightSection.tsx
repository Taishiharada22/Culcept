// app/stargazer/_components/BehavioralInsightSection.tsx
// 行動インサイトセクション — 行動データから見える「言葉にならない自分」
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  BehavioralInsight,
  InsightCategory,
} from "@/lib/stargazer/behavioralInsightEngine";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  insights: BehavioralInsight[];
}

const CATEGORY_CONFIG: Record<
  InsightCategory,
  { icon: string; label: string; colorKey: "danger" | "warning" | "accent" | "muted" }
> = {
  hesitation_pattern: {
    icon: "⏳",
    label: "ためらいのパターン",
    colorKey: "warning",
  },
  avoidance_zone: {
    icon: "🚧",
    label: "回避している領域",
    colorKey: "accent",
  },
  emotional_trigger: {
    icon: "⚡",
    label: "感情のトリガー",
    colorKey: "warning",
  },
  decision_style: {
    icon: "🧭",
    label: "意思決定スタイル",
    colorKey: "muted",
  },
  self_deception: {
    icon: "🪞",
    label: "自己欺瞞の兆候",
    colorKey: "danger",
  },
};

function getImportanceColor(
  colorKey: "danger" | "warning" | "accent" | "muted",
  primary: string,
  accent: string,
): string {
  switch (colorKey) {
    case "danger":
      return "#E53E3E";
    case "warning":
      return "#D69E2E";
    case "accent":
      return accent;
    case "muted":
      return primary;
  }
}

export default function BehavioralInsightSection({ insights }: Props) {
  const { theme } = useArchetypeTheme();
  const [expandedId, setExpandedId] = useState<number | null>(null);

  if (!theme || insights.length === 0) return null;

  const { primary, accent, text, border } = theme.palette;

  // Sort by surprise factor × confidence (most valuable first)
  const sorted = [...insights].sort(
    (a, b) =>
      b.userSurpriseFactor * b.confidence - a.userSurpriseFactor * a.confidence,
  );

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
            行動シグナル
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
          行動が語る、言葉にしなかった自分
        </h3>
        <p
          className="text-sm mb-6"
          style={{ color: hexToRgba(text, 0.6) }}
        >
          応答速度・迷い・回避パターンから検出された無自覚な傾向
        </p>

        {/* Insight Cards */}
        <div className="space-y-3" role="list" aria-label="行動インサイト一覧">
          {sorted.slice(0, 5).map((insight, i) => {
            const config = CATEGORY_CONFIG[insight.category];
            const color = getImportanceColor(
              config.colorKey,
              primary,
              accent,
            );
            const isExpanded = expandedId === i;
            const isBlindSpot = insight.userSurpriseFactor > 0.8;

            return (
              <motion.div
                key={`${insight.category}-${i}`}
                role="listitem"
                className="rounded-xl overflow-hidden"
                style={{
                  background: hexToRgba(color, 0.06),
                  borderLeft: `3px solid ${hexToRgba(color, 0.7)}`,
                }}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.22 }}
              >
                <button
                  className="w-full text-left p-4"
                  onClick={() => setExpandedId(isExpanded ? null : i)}
                  aria-expanded={isExpanded}
                  aria-label={`${config.label}の詳細を${isExpanded ? "閉じる" : "開く"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-lg flex-shrink-0 mt-0.5">
                      {config.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{
                            background: hexToRgba(color, 0.15),
                            color: color,
                          }}
                        >
                          {config.label}
                        </span>
                        {isBlindSpot && (
                          <motion.span
                            className="text-xs font-medium px-2 py-0.5 rounded-full"
                            style={{
                              background: hexToRgba("#E53E3E", 0.12),
                              color: "#E53E3E",
                            }}
                            animate={{ opacity: [0.7, 1, 0.7] }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: "easeInOut",
                            }}
                          >
                            盲点の可能性
                          </motion.span>
                        )}
                      </div>
                      <p
                        className="text-sm leading-relaxed"
                        style={{ color: hexToRgba(text, 0.88) }}
                      >
                        {insight.description}
                      </p>
                    </div>
                    {/* Confidence Ring */}
                    <div
                      className="flex-shrink-0 relative"
                      style={{ width: 36, height: 36 }}
                      aria-label={`確信度 ${Math.round(insight.confidence * 100)}%`}
                    >
                      <svg viewBox="0 0 36 36" className="w-full h-full">
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke={hexToRgba(text, 0.1)}
                          strokeWidth="2.5"
                        />
                        <circle
                          cx="18"
                          cy="18"
                          r="15"
                          fill="none"
                          stroke={color}
                          strokeWidth="2.5"
                          strokeDasharray={`${insight.confidence * 94.2} 94.2`}
                          strokeLinecap="round"
                          transform="rotate(-90 18 18)"
                          style={{ opacity: 0.8 }}
                        />
                      </svg>
                      <span
                        className="absolute inset-0 flex items-center justify-center text-[9px] font-mono-sg"
                        style={{ color: hexToRgba(text, 0.7) }}
                      >
                        {Math.round(insight.confidence * 100)}
                      </span>
                    </div>
                  </div>
                </button>

                {/* Expandable Evidence */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div
                        className="px-4 pb-4 pt-1 border-t"
                        style={{ borderColor: hexToRgba(text, 0.06) }}
                      >
                        <p
                          className="text-xs leading-relaxed"
                          style={{ color: hexToRgba(text, 0.6) }}
                        >
                          <span
                            className="font-medium"
                            style={{ color: hexToRgba(text, 0.7) }}
                          >
                            根拠：
                          </span>
                          {insight.evidence}
                        </p>
                        {insight.affectedAxes.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {insight.affectedAxes.map((axisId) => (
                              <span
                                key={axisId}
                                className="text-[10px] px-1.5 py-0.5 rounded"
                                style={{
                                  background: hexToRgba(primary, 0.1),
                                  color: hexToRgba(text, 0.5),
                                }}
                              >
                                {axisId}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}
