// app/stargazer/_components/ContradictionMapCard.tsx
// 矛盾マップ表示カード — 三面鏡のズレを可視化
"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ContradictionMap, ContradictionEntry } from "@/lib/stargazer/contradictionMap";
import {
  getMagnitudeLevel,
  DIVERGENCE_TYPE_LABELS,
  MEANING_LABELS,
} from "@/lib/stargazer/contradictionMap";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  contradictionMap: ContradictionMap;
}

export default function ContradictionMapCard({ contradictionMap }: Props) {
  const { theme } = useArchetypeTheme();
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  if (!theme) return null;
  if (contradictionMap.entries.length === 0 && contradictionMap.alignedAxes === 0) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      role="region"
      aria-label="矛盾マップ"
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
            矛盾マップ
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        {/* Summary */}
        <div className="mb-6">
          <h3
            className="text-sm font-medium mb-2"
            style={{ color: text }}
          >
            内面の食い違い — 自分の中のズレを見る
          </h3>
          <p
            className="text-xs leading-relaxed mb-3"
            style={{ color: textMuted, opacity: 0.8 }}
          >
            {contradictionMap.summary}
          </p>

          {/* Stats */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] font-mono"
                style={{ color: accent }}
              >
                {contradictionMap.totalContradictions}
              </span>
              <span
                className="text-[10px]"
                style={{ color: textMuted }}
              >
                件のズレ
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="text-[10px] font-mono"
                style={{ color: accent }}
              >
                {contradictionMap.alignedAxes}
              </span>
              <span
                className="text-[10px]"
                style={{ color: textMuted }}
              >
                件が一致
              </span>
            </div>
          </div>
        </div>

        {/* Primary Theme */}
        {contradictionMap.entries.length > 0 && (
          <motion.div
            className="rounded-xl p-3 mb-5"
            style={{
              background: hexToRgba(accent, 0.06),
              border: `1px solid ${hexToRgba(accent, 0.15)}`,
            }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-1">
              <span style={{ color: accent, fontSize: 10 }}>◆</span>
              <span
                className="text-[10px] font-mono tracking-[0.12em] uppercase"
                style={{ color: accent }}
              >
                主要テーマ
              </span>
            </div>
            <p
              className="text-xs leading-relaxed"
              style={{ color: text, opacity: 0.9 }}
            >
              {contradictionMap.primaryTheme}
            </p>
          </motion.div>
        )}

        {/* Contradiction Entries */}
        <div className="space-y-3">
          {contradictionMap.entries.slice(0, 5).map((entry, i) => (
            <ContradictionEntryRow
              key={entry.axisId}
              entry={entry}
              index={i}
              isExpanded={expandedIdx === i}
              onToggle={() => setExpandedIdx(expandedIdx === i ? null : i)}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            />
          ))}
        </div>

        {/* "All aligned" message */}
        {contradictionMap.entries.length === 0 && contradictionMap.alignedAxes > 0 && (
          <motion.div
            className="rounded-xl p-4 text-center"
            style={{
              background: hexToRgba(accent, 0.05),
              border: `1px solid ${hexToRgba(accent, 0.15)}`,
            }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <span className="text-2xl block mb-2">✓</span>
            <p
              className="text-xs leading-relaxed"
              style={{ color: text, opacity: 0.85 }}
            >
              3つの視点からの分析結果がよく一致しています。
            </p>
            <p
              className="text-xs mt-1"
              style={{ color: textMuted }}
            >
              自分のことをよく把握できている状態です。
            </p>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

// ── Contradiction Entry Row ──

function ContradictionEntryRow({
  entry,
  index,
  isExpanded,
  onToggle,
  primary,
  accent,
  text,
  textMuted,
  border,
}: {
  entry: ContradictionEntry;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  primary: string;
  accent: string;
  text: string;
  textMuted: string;
  border: string;
}) {
  const magnitudeInfo = getMagnitudeLevel(entry.magnitude);
  const divergenceLabel = DIVERGENCE_TYPE_LABELS[entry.divergenceType];
  const meaningLabel = MEANING_LABELS[entry.meaning];

  return (
    <motion.div
      className="rounded-xl overflow-hidden cursor-pointer"
      role="button"
      aria-expanded={isExpanded}
      aria-label={`${entry.axisLabelLeft} ⇔ ${entry.axisLabelRight} の矛盾`}
      tabIndex={0}
      style={{
        background: hexToRgba(primary, 0.03 + index * 0.01),
        border: `1px solid ${hexToRgba(border, 0.3)}`,
      }}
      initial={{ opacity: 0, x: -8 }}
      whileInView={{ opacity: 1, x: 0 }}
      whileHover={{ y: -1, boxShadow: `0 4px 12px ${hexToRgba(primary, 0.06)}` }}
      viewport={{ once: true }}
      transition={{ delay: 0.15 + index * 0.06 }}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle(); } }}
    >
      {/* Header */}
      <div className="p-3 flex items-center gap-3">
        {/* Magnitude Indicator */}
        {entry.magnitude > 0.7 ? (
          <motion.div
            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
            style={{ background: magnitudeInfo.color }}
            aria-label={`矛盾度: ${Math.round(entry.magnitude * 100)}%`}
            animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          />
        ) : (
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ background: magnitudeInfo.color }}
            aria-label={`矛盾度: ${Math.round(entry.magnitude * 100)}%`}
          />
        )}

        {/* Axis info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="text-xs font-medium truncate"
              style={{ color: text }}
            >
              {entry.axisLabelLeft} ⇔ {entry.axisLabelRight}
            </span>
            <span
              className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{
                background: hexToRgba(magnitudeInfo.color, 0.1),
                color: magnitudeInfo.color,
              }}
            >
              {divergenceLabel.emoji}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span
              className="text-[9px]"
              style={{ color: textMuted }}
            >
              {meaningLabel.emoji} {meaningLabel.label}
            </span>
          </div>
          {/* Magnitude bar */}
          <div
            className="mt-1.5 h-1 rounded-full overflow-hidden"
            style={{ background: hexToRgba(primary, 0.06), width: "100%" }}
          >
            <motion.div
              className="h-full rounded-full"
              style={{ background: hexToRgba(magnitudeInfo.color, 0.4) }}
              initial={{ width: 0 }}
              whileInView={{ width: `${entry.magnitude * 100}%` }}
              viewport={{ once: true }}
              transition={{ duration: 0.25, delay: 0.2 + index * 0.06 }}
            />
          </div>
        </div>

        {/* Expand arrow */}
        <motion.span
          className="text-xs flex-shrink-0"
          style={{ color: textMuted }}
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2 }}
        >
          ▸
        </motion.span>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            className="px-3 pb-3"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          >
            {/* Mirror Scores */}
            <div
              className="rounded-lg p-3 mb-3"
              style={{
                background: hexToRgba(primary, 0.04),
                border: `1px solid ${hexToRgba(border, 0.2)}`,
              }}
            >
              <div className="flex items-center gap-4">
                {entry.scores.selfPortrait !== undefined && (
                  <MirrorScoreChip
                    label="🪞 自己申告"
                    score={entry.scores.selfPortrait}
                    accent={accent}
                    textMuted={textMuted}
                  />
                )}
                {entry.scores.footprint !== undefined && (
                  <MirrorScoreChip
                    label="👣 行動データ"
                    score={entry.scores.footprint}
                    accent={accent}
                    textMuted={textMuted}
                  />
                )}
                {entry.scores.shadowPlay !== undefined && (
                  <MirrorScoreChip
                    label="🎭 無意識の反応"
                    score={entry.scores.shadowPlay}
                    accent={accent}
                    textMuted={textMuted}
                  />
                )}
              </div>
            </div>

            {/* Insight */}
            <p
              className="text-xs leading-relaxed mb-2"
              style={{ color: text, opacity: 0.85 }}
            >
              {entry.insight}
            </p>

            {/* Exploration Prompt */}
            <div
              className="rounded-lg p-2.5 mt-2"
              style={{
                background: hexToRgba(accent, 0.04),
                border: `1px dashed ${hexToRgba(accent, 0.15)}`,
              }}
            >
              <div className="flex items-start gap-1.5">
                <span
                  className="text-[10px] mt-0.5 flex-shrink-0"
                  style={{ color: accent }}
                >
                  ?
                </span>
                <p
                  className="text-[11px] leading-relaxed"
                  style={{ color: textMuted }}
                >
                  {entry.explorationPrompt}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Mirror Score Chip ──

function MirrorScoreChip({
  label,
  score,
  accent,
  textMuted,
}: {
  label: string;
  score: number;
  accent: string;
  textMuted: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[9px]" style={{ color: textMuted }}>
        {label}
      </span>
      <span
        className="text-[10px] font-mono"
        style={{ color: accent }}
      >
        {score >= 0 ? "+" : ""}
        {score.toFixed(2)}
      </span>
    </div>
  );
}
