// app/stargazer/_components/MetamorphosisLawCard.tsx
// 変容律カード — Layer 5 のパーソナリティ変化パターンを表示
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { MetamorphosisLawResult } from "@/lib/stargazer/metamorphosisLaw";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  metamorphosis: MetamorphosisLawResult | null;
}

export default function MetamorphosisLawCard({ metamorphosis }: Props) {
  const { theme } = useArchetypeTheme();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  if (!theme || !metamorphosis || metamorphosis.dataCompleteness < 0.05) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  const toggleSection = (id: string) =>
    setExpandedSection(expandedSection === id ? null : id);

  const hasContent =
    metamorphosis.cyclicalPatterns.length > 0 ||
    metamorphosis.triggerPatterns.length > 0 ||
    metamorphosis.transformationVectors.length > 0;

  if (!hasContent && !metamorphosis.summary) return null;

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
            変容律
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <h3 className="text-base font-medium mb-2" style={{ color: hexToRgba(text, 0.96) }}>
          変容律 — あなたの変化の法則
        </h3>

        {/* Summary */}
        <p
          className="text-sm leading-relaxed mb-5"
          style={{ color: hexToRgba(text, 0.84) }}
        >
          {metamorphosis.summary}
        </p>

        {/* Resilience Badge */}
        <motion.div
          className="rounded-xl p-3 mb-5"
          style={{
            background: hexToRgba(accent, 0.06),
            border: `1px solid ${hexToRgba(accent, 0.15)}`,
          }}
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-center gap-2 mb-1">
            <span style={{ color: accent, fontSize: 10 }}>◆</span>
            <span
              className="text-xs font-mono tracking-[0.12em] uppercase"
              style={{ color: accent }}
            >
              回復パターン
            </span>
          </div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-xs font-medium" style={{ color: text }}>
              {metamorphosis.resilience.pattern === "elastic"
                ? "弾力型"
                : metamorphosis.resilience.pattern === "gradual"
                  ? "漸進型"
                  : metamorphosis.resilience.pattern === "stepwise"
                    ? "段階型"
                    : "振動型"}
            </span>
            {/* Resilience meter */}
            <div
              className="flex-1 h-1.5 rounded-full overflow-hidden"
              style={{ background: hexToRgba(primary, 0.08) }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${metamorphosis.resilience.overallResilience * 100}%`,
                  background: `linear-gradient(90deg, ${hexToRgba(accent, 0.4)}, ${hexToRgba(accent, 0.7)})`,
                }}
              />
            </div>
            <span
              className="text-xs font-mono"
              style={{ color: hexToRgba(text, 0.78) }}
            >
              {Math.round(metamorphosis.resilience.overallResilience * 100)}%
            </span>
          </div>
          <p
            className="text-xs leading-relaxed"
            style={{ color: hexToRgba(text, 0.82) }}
          >
            {metamorphosis.resilience.description}
          </p>
        </motion.div>

        {/* Expandable Sections */}
        <div className="space-y-2">
          {/* Transformation Vectors */}
          {metamorphosis.transformationVectors.length > 0 && (
            <SectionToggle
              id="vectors"
              label="変容方向"
              emoji="→"
              count={metamorphosis.transformationVectors.length}
              isExpanded={expandedSection === "vectors"}
              onToggle={() => toggleSection("vectors")}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            >
              {metamorphosis.transformationVectors.map((v, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: hexToRgba(text, 0.9) }}
                  >
                    {v.interpretation}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span
                      className="text-xs font-mono"
                      style={{ color: hexToRgba(text, 0.78) }}
                    >
                      {v.pastScore > 0 ? "+" : ""}
                      {v.pastScore.toFixed(2)}
                    </span>
                    <div
                      className="flex-1 h-px"
                      style={{ background: hexToRgba(accent, 0.2) }}
                    />
                    <span
                      className="text-xs font-mono"
                      style={{ color: accent }}
                    >
                      {v.currentScore > 0 ? "+" : ""}
                      {v.currentScore.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: hexToRgba(
                          v.consistency > 0.6 ? accent : primary,
                          0.08,
                        ),
                        color: v.consistency > 0.6 ? accent : hexToRgba(text, 0.78),
                      }}
                    >
                      {v.consistency > 0.6 ? "一貫" : "揺れあり"}
                    </span>
                  </div>
                </div>
              ))}
            </SectionToggle>
          )}

          {/* Cyclical Patterns */}
          {metamorphosis.cyclicalPatterns.length > 0 && (
            <SectionToggle
              id="cycles"
              label="周期的パターン"
              emoji="🔄"
              count={metamorphosis.cyclicalPatterns.length}
              isExpanded={expandedSection === "cycles"}
              onToggle={() => toggleSection("cycles")}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            >
              {metamorphosis.cyclicalPatterns.map((cp, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <p
                    className="text-sm leading-relaxed mb-1"
                    style={{ color: hexToRgba(text, 0.9) }}
                  >
                    {cp.description}
                  </p>
                  <div className="flex items-center gap-3">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{
                        background: hexToRgba(accent, 0.08),
                        color: accent,
                      }}
                    >
                      {cp.cycleType === "daily"
                        ? "日内"
                        : cp.cycleType === "weekly"
                          ? "週間"
                          : cp.cycleType === "contextual"
                            ? "文脈"
                            : "月間"}
                    </span>
                    <span className="text-xs" style={{ color: hexToRgba(text, 0.8) }}>
                      振幅: {(cp.amplitude * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </SectionToggle>
          )}

          {/* Trigger Patterns */}
          {metamorphosis.triggerPatterns.length > 0 && (
            <SectionToggle
              id="triggers"
              label="トリガーパターン"
              emoji="⚡"
              count={metamorphosis.triggerPatterns.length}
              isExpanded={expandedSection === "triggers"}
              onToggle={() => toggleSection("triggers")}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            >
              {metamorphosis.triggerPatterns.map((tp, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded font-medium"
                      style={{
                        background: hexToRgba(
                          tp.direction === "positive" ? accent : primary,
                          0.1,
                        ),
                        color: tp.direction === "positive" ? accent : primary,
                      }}
                    >
                      {tp.trigger}
                    </span>
                    <span className="text-xs" style={{ color: hexToRgba(text, 0.8) }}>
                      {tp.observedCount}回観測
                    </span>
                  </div>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: hexToRgba(text, 0.9) }}
                  >
                    {tp.interpretation}
                  </p>
                </div>
              ))}
            </SectionToggle>
          )}
        </div>

        {/* Data completeness indicator */}
        <div className="flex items-center gap-2 mt-4 pt-3" style={{ borderTop: `1px solid ${hexToRgba(border, 0.2)}` }}>
          <span className="text-xs" style={{ color: hexToRgba(text, 0.78) }}>
            データ充足度
          </span>
          <div
            className="flex-1 h-1 rounded-full overflow-hidden"
            style={{ background: hexToRgba(primary, 0.06) }}
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${metamorphosis.dataCompleteness * 100}%`,
                background: hexToRgba(accent, 0.4),
              }}
            />
          </div>
          <span className="text-xs font-mono" style={{ color: hexToRgba(text, 0.78) }}>
            {Math.round(metamorphosis.dataCompleteness * 100)}%
          </span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Expandable Section Toggle ──

function SectionToggle({
  id,
  label,
  emoji,
  count,
  isExpanded,
  onToggle,
  primary,
  accent,
  text,
  textMuted,
  border,
  children,
}: {
  id: string;
  label: string;
  emoji: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-xl overflow-hidden cursor-pointer"
      style={{
        background: hexToRgba(primary, 0.03),
        border: `1px solid ${hexToRgba(border, 0.3)}`,
      }}
      onClick={onToggle}
    >
      <div className="p-3 flex items-center gap-2">
        <span className="text-xs">{emoji}</span>
        <span
          className="text-sm font-medium flex-1"
          style={{ color: hexToRgba(text, 0.94) }}
        >
          {label}
        </span>
        <span
          className="text-xs font-mono px-1.5 py-0.5 rounded"
          style={{
            background: hexToRgba(accent, 0.08),
            color: accent,
          }}
        >
          {count}
        </span>
        <motion.span
          className="text-sm"
          style={{ color: hexToRgba(text, 0.78) }}
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ▸
        </motion.span>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="px-3 pb-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
