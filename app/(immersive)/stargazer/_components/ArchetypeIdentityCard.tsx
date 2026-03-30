// app/stargazer/_components/ArchetypeIdentityCard.tsx
// Stargazer v4 — 24 Archetype Identity Card with dynamic theming
"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { ArchetypeCode } from "@/lib/stargazer/archetypeTypes";
import {
  getArchetypeByCode,
  parseArchetypeCode,
  LAYER1_DEFS,
  LAYER2_DEFS,
  LAYER3_DEFS,
} from "@/lib/stargazer/archetypeTypes";
import type { DualArchetypeResult } from "@/lib/stargazer/archetypeResolver";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import ArchetypeFigure from "./ArchetypeFigure";
import { hexToRgba } from "../_utils/color";

/** Adjust alpha of an rgba() or hex color string */
function withAlpha(color: string, alpha: number): string {
  if (color.startsWith("#")) return hexToRgba(color, alpha);
  // rgba(r, g, b, a) -> rgba(r, g, b, newAlpha)
  return color.replace(/[\d.]+\)$/, `${alpha})`);
}

// ── Types ──

interface TopMatch {
  code: ArchetypeCode;
  score: number;
}

interface Props {
  archetypeCode: ArchetypeCode;
  confidence: number;
  topMatches?: TopMatch[];
  /** Shadow type code */
  shadowCode?: ArchetypeCode;
  /** Dual archetype result (Three Mirror) */
  dualResult?: DualArchetypeResult | null;
}

// ── Section Header ──

function SectionHeader({
  label,
  color,
  mutedColor,
}: {
  label: string;
  color: string;
  mutedColor: string;
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div
        className="flex-1 h-px"
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${hexToRgba(color, 0.3)} 100%)`,
        }}
      />
      <span
        className="text-[10px] font-mono-sg tracking-[0.25em] uppercase"
        style={{ color: mutedColor }}
      >
        {label}
      </span>
      <div
        className="flex-1 h-px"
        style={{
          background: `linear-gradient(90deg, ${hexToRgba(color, 0.3)} 0%, transparent 100%)`,
        }}
      />
    </div>
  );
}

// ── Main Component ──

export default function ArchetypeIdentityCard({
  archetypeCode,
  confidence,
  topMatches,
  shadowCode,
  dualResult,
}: Props) {
  const { theme } = useArchetypeTheme();

  const def = useMemo(() => getArchetypeByCode(archetypeCode), [archetypeCode]);
  const layers = useMemo(
    () => parseArchetypeCode(archetypeCode),
    [archetypeCode],
  );

  const shadowDef = useMemo(
    () => (shadowCode ? getArchetypeByCode(shadowCode) : null),
    [shadowCode],
  );

  // Dual archetype data
  const objectiveDef = useMemo(
    () =>
      dualResult && !dualResult.isSame
        ? getArchetypeByCode(dualResult.objective.code)
        : null,
    [dualResult],
  );

  const l1 = useMemo(() => LAYER1_DEFS[layers.layer1], [layers.layer1]);
  const l2 = useMemo(() => LAYER2_DEFS[layers.layer2], [layers.layer2]);
  const l3 = useMemo(() => LAYER3_DEFS[layers.layer3], [layers.layer3]);

  if (!def || !theme) return null;

  const primary = theme.palette.primary;
  const accent = theme.palette.accent;
  const text = theme.palette.text;
  const textMuted = theme.palette.textMuted;
  const surface = theme.palette.surface;
  const border = theme.palette.border;

  return (
    <div className="space-y-8">
      {/* ── Description Card ── */}
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
          <SectionHeader
            label="アイデンティティ"
            color={primary}
            mutedColor={textMuted}
          />

          {/* Description */}
          <p
            className="text-sm leading-[1.8] mb-6"
            style={{ color: text }}
          >
            {def.description}
          </p>

          {/* Layer Details */}
          <div className="space-y-4 mb-6">
            {[
              {
                layerDef: l1,
                layerLabel: "大切なもの",
                layerDesc: l1?.description,
                icon: "◆",
              },
              {
                layerDef: l2,
                layerLabel: "納得のしかた",
                layerDesc: l2?.description,
                icon: "◇",
              },
              {
                layerDef: l3,
                layerLabel: "プレッシャー下の行動",
                layerDesc: l3?.description,
                icon: "▸",
              },
            ].map((item, i) => (
              <motion.div
                key={item.layerLabel}
                className="rounded-xl p-4"
                style={{
                  background: hexToRgba(primary, 0.05 + i * 0.02),
                  border: `1px solid ${hexToRgba(border, 0.4)}`,
                }}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{
                  delay: 0.15 + i * 0.08,
                  duration: 0.22,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  <span style={{ color: accent, fontSize: 10 }}>
                    {item.icon}
                  </span>
                  <span
                    className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase"
                    style={{ color: withAlpha(text, 0.6) }}
                  >
                    {item.layerLabel}
                  </span>
                </div>
                <div
                  className="text-sm font-bold mb-1"
                  style={{ color: text }}
                >
                  {item.layerDef?.label ?? "—"}
                  <span
                    className="ml-2 text-xs font-medium"
                    style={{ color: withAlpha(text, 0.6) }}
                  >
                    {item.layerDef?.englishLabel ?? ""}
                  </span>
                </div>
                {item.layerDesc && (
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: withAlpha(text, 0.7) }}
                  >
                    {item.layerDesc}
                  </p>
                )}
              </motion.div>
            ))}
          </div>

          {/* Strengths & Blind Spots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Strengths */}
            <div
              className="rounded-xl p-4"
              style={{
                background: hexToRgba(primary, 0.06),
                border: `1px solid ${hexToRgba(border, 0.3)}`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <span style={{ color: accent, fontSize: 12 }}>✦</span>
                <span
                  className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase"
                  style={{ color: "rgba(34,160,88,0.85)" }}
                >
                  強み
                </span>
              </div>
              <div className="space-y-2">
                {def.strengths.map((s, i) => (
                  <motion.div
                    key={s}
                    className="flex items-start gap-2"
                    initial={{ opacity: 0, x: -6 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.06 }}
                  >
                    <span
                      className="mt-1 w-1 h-1 rounded-full flex-shrink-0"
                      style={{ background: accent }}
                    />
                    <span
                      className="text-sm leading-relaxed"
                      style={{ color: text }}
                    >
                      {s}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Blind Spots */}
            <div
              className="rounded-xl p-4"
              style={{
                background: hexToRgba(primary, 0.04),
                border: `1px solid ${hexToRgba(border, 0.25)}`,
              }}
            >
              <div className="flex items-center gap-1.5 mb-3">
                <span style={{ color: withAlpha(text, 0.6), fontSize: 12 }}>◌</span>
                <span
                  className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase"
                  style={{ color: "rgba(220,80,120,0.8)" }}
                >
                  気づきにくい傾向
                </span>
              </div>
              <div className="space-y-2">
                {def.blindSpots.map((b, i) => (
                  <motion.div
                    key={b}
                    className="flex items-start gap-2"
                    initial={{ opacity: 0, x: -6 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.3 + i * 0.06 }}
                  >
                    <span
                      className="mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0"
                      style={{ background: "rgba(220,80,120,0.5)" }}
                    />
                    <span
                      className="text-sm leading-relaxed"
                      style={{ color: withAlpha(text, 0.75) }}
                    >
                      {b}
                    </span>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── State Cards (Safe / Stress) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Safe State */}
        <motion.div
          className="rounded-2xl p-5"
          style={{
            background: theme.gradient.card,
            border: `1px solid ${border}`,
            backdropFilter: `blur(${theme.glassEffect.blur})`,
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.22, delay: 0.1 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ background: accent }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.6, 1, 0.6],
              }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            />
            <span
              className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase"
              style={{ color: accent }}
            >
              安心状態
            </span>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: text }}
          >
            {def.safeState}
          </p>
        </motion.div>

        {/* Stress State */}
        <motion.div
          className="rounded-2xl p-5"
          style={{
            background: theme.gradient.card,
            border: `1px solid ${hexToRgba(border, 0.7)}`,
            backdropFilter: `blur(${theme.glassEffect.blur})`,
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.22, delay: 0.2 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <motion.div
              className="w-2 h-2 rounded-full"
              style={{ background: textMuted, opacity: 0.6 }}
              animate={{
                scale: [1, 1.4, 1],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{ duration: 2, repeat: Infinity }}
            />
            <span
              className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase"
              style={{ color: withAlpha(text, 0.65) }}
            >
              ストレス状態
            </span>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: withAlpha(text, 0.75) }}
          >
            {def.stressState}
          </p>
        </motion.div>
      </div>

      {/* ── Growth Key ── */}
      <motion.div
        className="rounded-2xl p-5"
        style={{
          background: hexToRgba(primary, 0.06),
          border: `1px solid ${hexToRgba(accent, 0.2)}`,
        }}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color: accent, fontSize: 14 }}>↗</span>
          <span
            className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase"
            style={{ color: accent }}
          >
            成長の鍵
          </span>
        </div>
        <p
          className="text-base leading-relaxed font-medium"
          style={{ color: text }}
        >
          {def.growthKey}
        </p>
      </motion.div>

      {/* ── Dual Character (Three Mirror) ── */}
      {dualResult && def?.dualView && (
        <motion.div
          className="rounded-2xl overflow-hidden"
          style={{
            background: theme.gradient.card,
            border: `1px solid ${border}`,
            backdropFilter: `blur(${theme.glassEffect.blur})`,
          }}
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="p-6 sm:p-8">
            <SectionHeader
              label="三面鏡"
              color={primary}
              mutedColor={textMuted}
            />

            {/* Title */}
            <div className="mb-6">
              <h3
                className="text-base font-bold mb-1"
                style={{ color: text }}
              >
                三面鏡 — 自分が見る自分と、観測が映す自分
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: withAlpha(text, 0.7) }}
              >
                自己申告による回答と、行動データ・投影反応の3つの観測源から、あなたの内面を多角的に映し出します。
              </p>
            </div>

            {/* Two Mirror Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Subjective (Self-Portrait) */}
              <motion.div
                className="rounded-xl p-4"
                style={{
                  background: hexToRgba(primary, 0.05),
                  border: `1px solid ${hexToRgba(border, 0.4)}`,
                }}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.15, duration: 0.22 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontSize: 14 }}>🪞</span>
                  <span
                    className="text-[10px] font-mono tracking-[0.15em] uppercase"
                    style={{ color: accent }}
                  >
                    自画像 — 自分が見る自分
                  </span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <ArchetypeFigure
                    englishName={def.englishName}
                    emoji={def.emoji}
                    alt={def.name}
                    containerClassName="h-5 w-5"
                    fallbackClassName="text-base"
                    sizes="20px"
                  />
                  <span
                    className="text-sm font-medium"
                    style={{ color: text }}
                  >
                    {def.name}
                  </span>
                  <span
                    className="text-[10px] font-mono"
                    style={{ color: textMuted }}
                  >
                    {archetypeCode}
                  </span>
                </div>
                <p
                  className="text-sm leading-relaxed"
                  style={{ color: text }}
                >
                  {def.dualView.selfView}
                </p>
              </motion.div>

              {/* Objective (Three Mirror Integration) */}
              <motion.div
                className="rounded-xl p-4"
                style={{
                  background: dualResult.isSame
                    ? hexToRgba(primary, 0.05)
                    : hexToRgba(accent, 0.06),
                  border: dualResult.isSame
                    ? `1px solid ${hexToRgba(border, 0.4)}`
                    : `1px solid ${hexToRgba(accent, 0.25)}`,
                }}
                initial={{ opacity: 0, x: 12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.25, duration: 0.22 }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span style={{ fontSize: 14 }}>👁</span>
                  <span
                    className="text-[10px] font-mono tracking-[0.15em] uppercase"
                    style={{ color: dualResult.isSame ? accent : textMuted }}
                  >
                    客観 — 観測が映す自分
                  </span>
                </div>
                {dualResult.isSame ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <ArchetypeFigure
                        englishName={def.englishName}
                        emoji={def.emoji}
                        alt={def.name}
                        containerClassName="h-5 w-5"
                        fallbackClassName="text-base"
                        sizes="20px"
                      />
                      <span
                        className="text-sm font-medium"
                        style={{ color: text }}
                      >
                        {def.name}
                      </span>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          color: accent,
                          background: hexToRgba(accent, 0.1),
                        }}
                      >
                        一致
                      </span>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: text }}
                    >
                      {def.dualView.observedView}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <ArchetypeFigure
                        englishName={objectiveDef?.englishName}
                        emoji={objectiveDef?.emoji ?? "?"}
                        alt={objectiveDef?.name ?? dualResult.objective.code}
                        containerClassName="h-5 w-5"
                        fallbackClassName="text-base"
                        sizes="20px"
                      />
                      <span
                        className="text-sm font-bold"
                        style={{ color: text }}
                      >
                        {objectiveDef?.name ?? dualResult.objective.code}
                      </span>
                      <span
                        className="text-[10px] font-mono font-medium"
                        style={{ color: withAlpha(text, 0.6) }}
                      >
                        {dualResult.objective.code}
                      </span>
                    </div>
                    <p
                      className="text-sm leading-relaxed"
                      style={{ color: text }}
                    >
                      {dualResult.objectiveDualView?.observedView ??
                        objectiveDef?.description ??
                        ""}
                    </p>
                  </>
                )}
              </motion.div>
            </div>

            {/* Divergence Insight */}
            {dualResult.divergenceInsight && (
              <motion.div
                className="mt-4 rounded-xl p-4"
                style={{
                  background: dualResult.isSame
                    ? hexToRgba(accent, 0.04)
                    : hexToRgba(primary, 0.04),
                  border: `1px solid ${hexToRgba(border, 0.25)}`,
                }}
                initial={{ opacity: 0, y: 8 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.35 }}
              >
                <div className="flex items-start gap-2">
                  <span
                    className="mt-0.5 text-xs flex-shrink-0"
                    style={{ color: accent }}
                  >
                    {dualResult.isSame ? "✓" : "◇"}
                  </span>
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: withAlpha(text, 0.75) }}
                  >
                    {dualResult.divergenceInsight}
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {/* ── もうひとつの顔 (Shadow Type) ── */}
      {shadowDef && (
        <motion.div
          className="rounded-2xl p-5"
          style={{
            background: hexToRgba(primary, 0.03),
            border: `1px dashed ${hexToRgba(border, 0.4)}`,
          }}
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-3">
            <span style={{ color: withAlpha(text, 0.6), fontSize: 14 }}>☾</span>
            <span
              className="text-[10px] font-mono font-semibold tracking-[0.15em] uppercase"
              style={{ color: withAlpha(text, 0.6) }}
            >
              もうひとつの顔
            </span>
          </div>
          <div className="flex items-center gap-3 mb-2">
            <ArchetypeFigure
              englishName={shadowDef.englishName}
              emoji={shadowDef.emoji}
              alt={shadowDef.name}
              containerClassName="h-6 w-6"
              fallbackClassName="text-xl"
              sizes="24px"
            />
            <div>
              <span
                className="text-sm font-bold"
                style={{ color: text }}
              >
                {shadowDef.name}
              </span>
              <span
                className="ml-2 text-xs font-mono font-medium"
                style={{ color: withAlpha(text, 0.6) }}
              >
                {shadowDef.code}
              </span>
            </div>
          </div>
          {def.shadowTension && (
            <p
              className="text-sm leading-relaxed"
              style={{ color: withAlpha(text, 0.7) }}
            >
              {def.shadowTension}
            </p>
          )}
        </motion.div>
      )}

      {/* ── Top Matches ── */}
      {topMatches && topMatches.length > 0 && (
        <motion.div
          className="rounded-2xl overflow-hidden"
          style={{
            background: theme.gradient.card,
            border: `1px solid ${border}`,
            backdropFilter: `blur(${theme.glassEffect.blur})`,
          }}
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.22, delay: 0.1 }}
        >
          <div className="p-6">
            <SectionHeader
              label="近い原型"
              color={primary}
              mutedColor={textMuted}
            />
            <div className="space-y-3">
              {topMatches.map((match, i) => {
                const matchDef = getArchetypeByCode(match.code);
                if (!matchDef) return null;
                const score = Math.round(match.score * 100);

                return (
                  <motion.div
                    key={match.code}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 + i * 0.06 }}
                  >
                    <ArchetypeFigure
                      englishName={matchDef.englishName}
                      emoji={matchDef.emoji}
                      alt={matchDef.name}
                      containerClassName="h-6 w-6"
                      fallbackClassName="text-lg"
                      sizes="24px"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-xs font-medium"
                            style={{ color: text }}
                          >
                            {matchDef.name}
                          </span>
                          <span
                            className="text-[10px] font-mono"
                            style={{ color: textMuted }}
                          >
                            {match.code}
                          </span>
                        </div>
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: accent }}
                        >
                          {score}%
                        </span>
                      </div>
                      {/* Score Bar */}
                      <div
                        className="h-1 rounded-full overflow-hidden"
                        style={{
                          background: hexToRgba(primary, 0.1),
                        }}
                      >
                        <motion.div
                          className="h-full rounded-full"
                          style={{
                            background:
                              i === 0
                                ? theme.gradient.button
                                : hexToRgba(primary, 0.4 - i * 0.1),
                          }}
                          initial={{ width: 0 }}
                          whileInView={{ width: `${score}%` }}
                          viewport={{ once: true }}
                          transition={{
                            delay: 0.3 + i * 0.06,
                            duration: 0.4,
                            ease: [0.22, 1, 0.36, 1],
                          }}
                        />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
