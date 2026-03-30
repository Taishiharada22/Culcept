// app/stargazer/_components/GenerativeCoreCard.tsx
// 生成核カード — Layer 4 の深層インサイトを表示
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { GenerativeCoreResult } from "@/lib/stargazer/generativeCore";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  generativeCore: GenerativeCoreResult | null;
}

export default function GenerativeCoreCard({ generativeCore }: Props) {
  const { theme } = useArchetypeTheme();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  if (!theme || !generativeCore || generativeCore.dataCompleteness < 0.1) return null;

  const { primary, accent, text, textMuted, border } = theme.palette;

  const toggleSection = (id: string) =>
    setExpandedSection(expandedSection === id ? null : id);

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
            判断の核心
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <h3
          className="text-sm font-medium mb-2"
          style={{ color: text }}
        >
          あなたの判断の根っこにあるもの
        </h3>

        {/* Inner Core — 判断原理 */}
        {generativeCore.innerCore.principle && (
          <motion.div
            className="rounded-xl p-4 mb-4"
            style={{
              background: hexToRgba(accent, 0.06),
              border: `1px solid ${hexToRgba(accent, 0.15)}`,
            }}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <span style={{ color: accent, fontSize: 10 }}>◈</span>
              <span
                className="text-[10px] font-mono tracking-[0.12em] uppercase"
                style={{ color: accent }}
              >
                判断の基準
              </span>
            </div>
            <p
              className="text-xs leading-relaxed"
              style={{ color: text, opacity: 0.9 }}
            >
              {generativeCore.innerCore.principle}
            </p>
            {generativeCore.innerCore.safetySource && (
              <p
                className="text-[11px] leading-relaxed mt-2"
                style={{ color: textMuted }}
              >
                安心できる理由: {generativeCore.innerCore.safetySource}
              </p>
            )}
          </motion.div>
        )}

        {/* Expandable Sections */}
        <div className="space-y-2">
          {/* Protective Structures */}
          {generativeCore.protectiveStructures.length > 0 && (
            <SectionToggle
              id="protective"
              label="自分を守るしくみ"
              emoji="🛡"
              isExpanded={expandedSection === "protective"}
              onToggle={() => toggleSection("protective")}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            >
              {generativeCore.protectiveStructures.map((ps, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <p className="text-xs leading-relaxed mb-1" style={{ color: text, opacity: 0.85 }}>
                    {ps.manifestation}
                  </p>
                  <div
                    className="rounded-lg p-2 mt-1"
                    style={{
                      background: hexToRgba(accent, 0.04),
                      border: `1px dashed ${hexToRgba(accent, 0.12)}`,
                    }}
                  >
                    <p className="text-[11px]" style={{ color: textMuted }}>
                      ? {ps.reflectionPrompt}
                    </p>
                  </div>
                </div>
              ))}
            </SectionToggle>
          )}

          {/* Growth Vector */}
          {generativeCore.growthVector.direction && (
            <SectionToggle
              id="growth"
              label="次に伸びそうなところ"
              emoji="🌱"
              isExpanded={expandedSection === "growth"}
              onToggle={() => toggleSection("growth")}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            >
              <p className="text-xs leading-relaxed mb-1" style={{ color: text, opacity: 0.85 }}>
                {generativeCore.growthVector.direction}
              </p>
              {generativeCore.growthVector.signs.map((sign, i) => (
                <p key={i} className="text-[11px] ml-2" style={{ color: textMuted }}>
                  • {sign}
                </p>
              ))}
              {generativeCore.growthVector.resistance && (
                <p className="text-[11px] mt-2" style={{ color: textMuted, opacity: 0.7 }}>
                  つまずきやすい点: {generativeCore.growthVector.resistance}
                </p>
              )}
            </SectionToggle>
          )}

          {/* Blind Spots */}
          {generativeCore.blindSpots.length > 0 && (
            <SectionToggle
              id="blindspots"
              label="気づきにくいところ"
              emoji="👁"
              isExpanded={expandedSection === "blindspots"}
              onToggle={() => toggleSection("blindspots")}
              primary={primary}
              accent={accent}
              text={text}
              textMuted={textMuted}
              border={border}
            >
              {generativeCore.blindSpots.map((bs, i) => (
                <div key={i} className="mb-3 last:mb-0">
                  <p className="text-xs font-medium mb-1" style={{ color: text }}>
                    {bs.title}
                  </p>
                  <p className="text-[11px] leading-relaxed" style={{ color: textMuted }}>
                    {bs.description}
                  </p>
                </div>
              ))}
            </SectionToggle>
          )}
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
        <span className="text-xs font-medium flex-1" style={{ color: text }}>
          {label}
        </span>
        <motion.span
          className="text-xs"
          style={{ color: textMuted }}
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
