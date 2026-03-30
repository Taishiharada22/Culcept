// app/stargazer/_tabs/star-map/shared.tsx
// アーキタイプタブ共通コンポーネント — CollapsibleSection, SectionLabel, MottoCard, DeepDiveSection, 各セクション
"use client";

import { useState, useMemo, memo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useArchetypeTheme } from "../../_components/ArchetypeThemeProvider";
import { hexToRgba } from "../../_utils/color";
import { hapticLight } from "@/lib/rendezvous/haptics";
import RadarChart from "../../_components/RadarChart";
import {
  aggregateRadarDimensions,
  getRadarDimensionDescription,
} from "@/lib/stargazer/radarAggregation";
import type { ProfileContent } from "@/lib/stargazer/profileContentGenerator";

// ── Utility: safely adjust alpha in rgba() strings ──
function withAlpha(rgbaStr: string, alpha: number): string {
  return rgbaStr.replace(/[\d.]+\)$/, `${alpha})`);
}

// ── Motto Card ──

export function MottoCard({
  motto,
  code,
  englishName,
}: {
  motto: string;
  code: string;
  englishName: string;
}) {
  const { theme } = useArchetypeTheme();
  if (!theme) return null;
  const { palette } = theme;

  return (
    <motion.div
      className="relative mx-auto max-w-md text-center py-6 px-8 rounded-2xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${hexToRgba(palette.primary, 0.06)} 0%, ${hexToRgba(palette.primary, 0.02)} 100%)`,
        border: `1px solid ${hexToRgba(palette.primary, 0.12)}`,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: 0.2 }}
    >
      <div
        className="text-[10px] font-mono-sg uppercase tracking-[0.2em] mb-2"
        style={{ color: hexToRgba(palette.primary, 0.5) }}
      >
        {code} / {englishName}
      </div>
      <div
        className="text-lg sm:text-xl font-bold font-display tracking-wide"
        style={{ color: palette.text }}
      >
        {motto}
      </div>
      <div
        className="mx-auto mt-3 w-12 h-[2px] rounded-full"
        style={{ background: hexToRgba(palette.primary, 0.25) }}
      />
    </motion.div>
  );
}

// ── Section Label ──

export function SectionLabel({
  label,
  sublabel,
}: {
  label: string;
  sublabel: string;
}) {
  const { theme } = useArchetypeTheme();
  return (
    <div className="mb-4">
      <span
        className="text-section-header font-semibold"
        style={
          theme
            ? { color: theme.palette.textLabel, opacity: 1 }
            : { color: "rgba(112, 92, 52, 0.95)" }
        }
      >
        {sublabel}
      </span>
      <h3
        className="font-display text-xl font-bold mt-1"
        style={{ color: theme?.palette.text ?? "rgba(20,25,45,0.95)" }}
      >
        {label}
      </h3>
    </div>
  );
}

// ── Collapsible Section ──

export function CollapsibleSection({
  id,
  title,
  subtitle,
  itemCount,
  expanded,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  subtitle: string;
  itemCount: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { theme } = useArchetypeTheme();

  return (
    <div id={`sg-section-group-${id}`}>
      <motion.button
        onClick={() => { onToggle(); hapticLight(); }}
        className="w-full flex items-center justify-between py-3 px-1 group"
        whileHover={{ x: 2 }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.15 }}
      >
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: expanded ? 90 : 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 20 }}
            className="shrink-0"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke={theme?.palette.textMuted ?? "rgba(100,105,130,0.5)"}
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 5l7 7-7 7" />
            </svg>
          </motion.div>
          <div className="text-left">
            <h3
              className="font-display text-sm font-bold"
              style={{
                color: theme?.palette.text ?? "rgba(22,28,48,0.9)",
              }}
            >
              {title}
            </h3>
            <p
              className="text-xs mt-0.5"
              style={{
                color:
                  theme?.palette.textMuted ?? "rgba(100,105,130,0.55)",
              }}
            >
              {subtitle}
            </p>
          </div>
        </div>
        <span
          className="text-xs font-medium px-2 py-0.5 rounded-md shrink-0"
          style={{
            background: theme
              ? hexToRgba(theme.palette.primary, 0.07)
              : "rgba(140,120,60,0.07)",
            color: theme?.palette.textLabel ?? "rgba(140,120,60,0.7)",
          }}
        >
          {itemCount}件
        </span>
      </motion.button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-2 pb-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Deep Dive Link ──

export function DeepDiveSection({
  onNavigateToDeep,
}: {
  onNavigateToDeep?: () => void;
}) {
  const { theme } = useArchetypeTheme();

  return (
    <section className="space-y-3">
      <SectionLabel label="さらに深く知る" sublabel="もっと詳しく" />
      <button
        onClick={onNavigateToDeep}
        className="w-full card-section text-left flex items-center justify-between group"
      >
        <div>
          <span
            className="text-base font-display font-bold"
            style={{
              color: theme?.palette.text ?? "rgba(20,25,45,0.95)",
            }}
          >
            全ての性格軸を詳しく見る
          </span>
          <p
            className="text-sm mt-0.5"
            style={{
              color: theme?.palette.textMuted ?? "rgba(50,55,75,0.7)",
            }}
          >
            場面ごとの傾向の違いも確認できます
          </p>
        </div>
        <span
          style={{
            color: theme?.palette.textLabel ?? "rgba(140,120,60,0.8)",
          }}
          className="text-lg font-bold group-hover:translate-x-1 transition-transform"
        >
          →
        </span>
      </button>
    </section>
  );
}

// ── Overview (Radar Chart) ──

export function OverviewSection({
  dimensions,
  ghostDimensions,
  typeDef,
  previousScores,
}: {
  dimensions: ReturnType<typeof aggregateRadarDimensions>;
  ghostDimensions?: ReturnType<typeof aggregateRadarDimensions>;
  typeDef?: { code: string; label: string; traits?: Partial<Record<string, number>> } | null;
  /** Previous scores (7-day-ago) for trend indicators per dimension */
  previousScores?: Record<string, number>;
}) {
  const { theme } = useArchetypeTheme();

  // タイプの平均値をレーダー次元に変換
  const typeAverageDimensions = useMemo(() => {
    if (!typeDef?.traits) return undefined;
    return aggregateRadarDimensions(
      typeDef.traits as Partial<Record<import("@/lib/stargazer/traitAxes").TraitAxisKey, number>>
    );
  }, [typeDef]);

  function getScoreLabel(score: number): string {
    if (score >= 80) return "非常に高い";
    if (score >= 60) return "高い";
    if (score >= 40) return "ふつう";
    if (score >= 20) return "やや低い";
    return "低い";
  }

  return (
    <section>
      <SectionLabel label="あなたの全体像" sublabel="全体バランス" />
      <p
        className="text-sm mb-4 leading-relaxed"
        style={{
          color: theme?.palette.text ?? "rgba(30,35,55,0.75)",
        }}
      >
        全体の傾向をレーダーチャートで俯瞰した結果です。各項目は観測データに基づいています。
      </p>
      <div className="card-mbti">
        <RadarChart
          dimensions={dimensions}
          size={280}
          animated
          interactive
          maxAxes={typeof window !== "undefined" && window.innerWidth < 640 ? 6 : undefined}
          ghostDimensions={ghostDimensions}
          ghostLabel="以前の自分"
          overlayDimensions={typeAverageDimensions}
          overlayColor={theme ? hexToRgba(theme.palette.primary, 0.45) : "rgba(139,92,246,0.4)"}
        />

        {/* タイプ平均値の凡例 */}
        {typeDef && typeAverageDimensions && (
          <div
            className="flex items-center justify-center gap-4 mt-3 text-[11px]"
            style={{ color: theme?.palette.textMuted ?? "rgba(100,105,130,0.7)" }}
          >
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-0.5 rounded-full"
                style={{ background: theme ? hexToRgba(theme.palette.primary, 0.6) : "rgba(201,169,110,0.6)" }}
              />
              あなた
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-4 h-0.5 rounded-full"
                style={{
                  background: theme ? hexToRgba(theme.palette.primary, 0.4) : "rgba(139,92,246,0.4)",
                  borderTop: "1px dashed",
                }}
              />
              {typeDef.label}の平均
            </span>
            {ghostDimensions && (
              <span className="flex items-center gap-1.5">
                <span
                  className="inline-block w-4 h-0.5 rounded-full"
                  style={{ background: "rgba(160,170,200,0.35)", borderTop: "1px dashed" }}
                />
                以前の自分
              </span>
            )}
          </div>
        )}

        <div className="mt-6 space-y-2.5">
          {dimensions.map((d) => {
            const typeAvg = typeAverageDimensions?.find((t) => t.key === d.key);
            const primaryColor = theme ? hexToRgba(theme.palette.primary, 0.55) : "rgba(190,170,110,0.55)";
            const primaryBg = theme ? hexToRgba(theme.palette.primary, 0.12) : "rgba(190,170,110,0.12)";

            return (
              <div
                key={d.key}
                className="rounded-xl px-4 py-3"
                style={{
                  background: "rgba(255,255,255,0.55)",
                  border: "1px solid rgba(160,170,200,0.10)",
                }}
              >
                {/* ラベル行: 次元名 + トレンド + スコア */}
                <div className="flex items-baseline justify-between mb-2">
                  <span
                    className="text-sm font-display font-bold"
                    style={{ color: theme?.palette.text ?? "rgba(20,25,45,0.92)" }}
                  >
                    {d.label}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {/* Trend indicator: compare current vs previous */}
                    {previousScores && previousScores[d.key] !== undefined && (() => {
                      const diff = d.score - previousScores[d.key];
                      if (diff > 5) {
                        return (
                          <span
                            className="text-xs font-mono-sg font-semibold"
                            style={{ color: "rgba(34,160,88,0.8)" }}
                            title={`+${Math.round(diff)} (7日前比)`}
                          >
                            ↑
                          </span>
                        );
                      }
                      if (diff < -5) {
                        return (
                          <span
                            className="text-xs font-mono-sg font-semibold"
                            style={{ color: "rgba(220,80,80,0.8)" }}
                            title={`${Math.round(diff)} (7日前比)`}
                          >
                            ↓
                          </span>
                        );
                      }
                      return (
                        <span
                          className="text-xs font-mono-sg"
                          style={{ color: "rgba(120,125,140,0.5)" }}
                          title="安定 (7日前比)"
                        >
                          →
                        </span>
                      );
                    })()}
                    <span
                      className="text-lg font-mono-sg font-bold tabular-nums"
                      style={{ color: primaryColor }}
                    >
                      {d.score}
                    </span>
                  </span>
                </div>

                {/* バーグラフ + タイプ平均マーカー */}
                <div className="relative h-2 rounded-full overflow-visible mb-2" style={{ background: "rgba(160,170,200,0.10)" }}>
                  {/* ユーザーのスコアバー */}
                  <motion.div
                    className="absolute top-0 left-0 h-full rounded-full"
                    style={{ background: `linear-gradient(90deg, ${primaryBg}, ${primaryColor})` }}
                    initial={{ width: 0 }}
                    animate={{ width: `${d.score}%` }}
                    transition={{ duration: 0.4, ease: "easeOut", delay: 0.1 }}
                  />
                  {/* タイプ平均マーカー */}
                  {typeAvg && typeAvg.score > 0 && (
                    <div
                      className="absolute top-[-3px] w-0.5 h-[14px] rounded-full"
                      style={{
                        left: `${typeAvg.score}%`,
                        background: theme ? hexToRgba(theme.palette.primary, 0.35) : "rgba(139,92,246,0.35)",
                        transition: "left 0.5s ease",
                      }}
                      title={`${typeDef?.label ?? "タイプ"}平均: ${typeAvg.score}`}
                    />
                  )}
                </div>

                {/* 説明文 */}
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: theme?.palette.textMuted ?? "rgba(80,85,110,0.6)" }}
                >
                  {getRadarDimensionDescription(d.key)}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── Core Axes (Enhanced v2) ──

export const CoreAxesSection = memo(function CoreAxesSection({
  axes,
  axisHistory,
}: {
  axes: ProfileContent["summaryAxes"];
  axisHistory?: Record<string, number[]>;
}) {
  const { theme } = useArchetypeTheme();
  const [hoveredAxisId, setHoveredAxisId] = useState<string | null>(null);

  // Pre-compute axis metrics (avoids recalculation per hover)
  const axisMetrics = useMemo(() => axes.map((axis) => {
    const leftPercent = Math.round(50 - axis.score * 50);
    const rightPercent = Math.round(50 + axis.score * 50);
    const dominantPercent = Math.max(leftPercent, rightPercent);
    const history = axisHistory?.[axis.axisId];
    let trendLabel = "安定";
    let trendIcon = "→";
    if (history && history.length >= 2) {
      const diff = history[history.length - 1] - history[history.length - 2];
      if (diff > 0.05) { trendLabel = "上昇"; trendIcon = "↑"; }
      else if (diff < -0.05) { trendLabel = "低下"; trendIcon = "↓"; }
    }
    return {
      leftPercent, rightPercent, dominantPercent,
      isLeft: axis.score < -0.15,
      isRight: axis.score > 0.15,
      trendLabel, trendIcon, history,
    };
  }), [axes, axisHistory]);

  if (axes.length === 0) return null;

  const primary = theme?.palette.primary ?? "#8B5CF6";
  const accent = theme?.palette.accent ?? "#7C3AED";
  const textLabel = theme?.palette.textLabel ?? "rgba(140,120,60,0.9)";
  const textColor = theme?.palette.text ?? "rgba(20,25,45,0.95)";
  const textMuted = theme?.palette.textMuted ?? "rgba(60,65,85,0.75)";

  return (
    <section>
      <SectionLabel label="あなたの性格の軸" sublabel="性格の軸" />
      <p
        className="text-sm mb-5 leading-relaxed"
        style={{ color: theme?.palette.text ?? "rgba(30,35,55,0.75)" }}
      >
        観測データから、あなたの傾向が最も強く表れている軸です。バーが左右どちらかに伸びるほど、その傾向が明確です。
      </p>
      <div className="space-y-4">
        {axes.map((axis, i) => {
          const { leftPercent, rightPercent, dominantPercent, isLeft, isRight, trendLabel, trendIcon, history } = axisMetrics[i];
          const isHovered = hoveredAxisId === axis.axisId;

          return (
            <motion.div
              key={axis.axisId}
              className="card-section cursor-default"
              role="meter"
              aria-valuenow={dominantPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${axis.labelLeft} - ${axis.labelRight}: ${dominantPercent}% ${axis.dominantLabel}`}
              tabIndex={0}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.1, type: "spring", stiffness: 300, damping: 25 }}
              whileHover={{ scale: 1.01, y: -1 }}
              whileTap={{ scale: 0.99 }}
              onHoverStart={() => setHoveredAxisId(axis.axisId)}
              onHoverEnd={() => setHoveredAxisId(null)}
              onFocus={() => setHoveredAxisId(axis.axisId)}
              onBlur={() => setHoveredAxisId(null)}
            >
              {/* Labels */}
              <div className="flex justify-between items-center mb-2">
                <span
                  className="text-sm font-body"
                  style={{
                    color: isLeft ? textColor : "rgba(80,85,100,0.6)",
                    fontWeight: isLeft ? 700 : 500,
                  }}
                >
                  {axis.labelLeft}
                </span>
                <span
                  className="text-sm font-body"
                  style={{
                    color: isRight ? textColor : "rgba(80,85,100,0.6)",
                    fontWeight: isRight ? 700 : 500,
                  }}
                >
                  {axis.labelRight}
                </span>
              </div>

              {/* Enhanced gauge bar */}
              <div
                className="relative h-4 rounded-full overflow-hidden"
                style={{ background: hexToRgba(primary, 0.08) }}
              >
                {/* Center pulse line */}
                <motion.div
                  className="absolute top-0 left-1/2 w-px h-full z-10"
                  style={{ background: hexToRgba(primary, 0.25) }}
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: [0.5, 0.15, 0.5] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                />

                {/* Fill bar with animated width */}
                <motion.div
                  className="absolute top-0 h-full rounded-full"
                  style={{
                    left: axis.score < 0 ? `${50 + axis.score * 50}%` : "50%",
                    background:
                      Math.abs(axis.score) > 0.4
                        ? `linear-gradient(90deg, ${hexToRgba(primary, 0.6)}, ${hexToRgba(accent, 0.85)})`
                        : `linear-gradient(90deg, ${hexToRgba(primary, 0.4)}, ${hexToRgba(accent, 0.6)})`,
                    boxShadow: isHovered
                      ? `0 0 12px ${hexToRgba(primary, 0.3)}`
                      : `0 0 6px ${hexToRgba(primary, 0.1)}`,
                  }}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.abs(axis.score) * 50}%` }}
                  transition={{
                    delay: 0.3 + i * 0.1,
                    duration: 0.4,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                />
              </div>

              {/* Score info row */}
              <div className="flex justify-between items-center mt-2">
                <div className="flex items-center gap-2">
                  <span
                    className="font-mono-sg text-xs font-semibold"
                    style={{ color: textLabel }}
                  >
                    {dominantPercent}% {axis.dominantLabel}
                    <span className="font-body font-normal ml-1.5" style={{ color: textMuted, fontSize: "0.65rem" }}>
                      {dominantPercent >= 90 ? "非常に明確" : dominantPercent >= 75 ? "はっきり" : dominantPercent >= 60 ? "やや傾向あり" : "ほぼ中立"}
                    </span>
                  </span>
                  {/* Trend indicator */}
                  {history && history.length >= 2 && (
                    <span
                      className="text-[10px] font-mono-sg px-1.5 py-0.5 rounded"
                      style={{
                        background: hexToRgba(primary, 0.07),
                        color: trendIcon === "↑"
                          ? "rgba(34,160,88,0.8)"
                          : trendIcon === "↓"
                            ? "rgba(220,80,80,0.8)"
                            : textMuted,
                      }}
                    >
                      {trendIcon} {trendLabel}
                    </span>
                  )}
                </div>

                {/* Inline sparkline */}
                {history && history.length >= 3 && (
                  <SparklineMini data={history} color={primary} />
                )}
              </div>

              {/* Description */}
              {axis.description && (
                <p
                  className="text-sm mt-1.5 leading-relaxed"
                  style={{ color: textMuted }}
                >
                  {axis.description}
                </p>
              )}

              {/* Hover detail overlay */}
              <AnimatePresence>
                {isHovered && (
                  <motion.div
                    className="mt-2 pt-2 flex items-center gap-3"
                    style={{ borderTop: `1px solid ${hexToRgba(primary, 0.1)}` }}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <span className="text-xs" style={{ color: textMuted }}>
                      スコア: <strong style={{ color: textLabel }}>{axis.score > 0 ? "+" : ""}{(axis.score * 100).toFixed(0)}</strong>
                    </span>
                    {history && history.length >= 2 && (
                      <span className="text-xs" style={{ color: textMuted }}>
                        前回比: <strong style={{ color: trendIcon === "↑" ? "rgba(34,160,88,0.8)" : trendIcon === "↓" ? "rgba(220,80,80,0.8)" : textLabel }}>
                          {((history[history.length - 1] - history[history.length - 2]) * 100).toFixed(0)}pt
                        </strong>
                      </span>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
});

// ── Strengths ──

export const StrengthsSection = memo(function StrengthsSection({
  strengths,
}: {
  strengths: ProfileContent["strengths"];
}) {
  const { theme } = useArchetypeTheme();
  if (strengths.length === 0) return null;

  const borderColor = theme
    ? hexToRgba(theme.palette.primary, 0.25)
    : "rgba(74,222,128,0.3)";

  return (
    <section>
      <SectionLabel label="あなたの強み" sublabel="強み" />
      <p
        className="text-sm mb-4 leading-relaxed"
        style={{
          color: theme?.palette.text ?? "rgba(30,35,55,0.75)",
        }}
      >
        観測データから浮かび上がった、あなたが自然に発揮できる力です。
      </p>
      <div className="space-y-3">
        {strengths.map((s, i) => (
          <motion.div
            key={s.id}
            className="card-mbti"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            style={{ borderLeft: `3px solid ${borderColor}` }}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5">{s.icon}</span>
              <div className="flex-1">
                <h4
                  className="font-display text-base font-bold"
                  style={{
                    color:
                      theme?.palette.text ?? "rgba(20,25,45,0.95)",
                  }}
                >
                  {s.headline}
                </h4>
                <p
                  className="text-sm mt-1 leading-relaxed"
                  style={{
                    color:
                      theme?.palette.textMuted ?? "rgba(50,55,75,0.8)",
                  }}
                >
                  {s.description}
                </p>
                {s.manifestation && (
                  <p
                    className="text-sm mt-2 italic"
                    style={{
                      color:
                        theme?.palette.textMuted ??
                        "rgba(60,65,85,0.65)",
                    }}
                  >
                    こんな時に出やすい: {s.manifestation}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
});

// ── Cautions ──

export const CautionsSection = memo(function CautionsSection({
  weaknesses,
}: {
  weaknesses: ProfileContent["weaknesses"];
}) {
  const { theme } = useArchetypeTheme();
  if (weaknesses.length === 0) return null;

  const borderColor = theme
    ? hexToRgba(theme.palette.accent, 0.2)
    : "rgba(190,170,110,0.3)";

  return (
    <section>
      <SectionLabel label="注意すべき傾向" sublabel="注意点" />
      <p
        className="text-sm mb-4 leading-relaxed"
        style={{
          color: theme?.palette.text ?? "rgba(30,35,55,0.75)",
        }}
      >
        強みの裏側に潜む、無意識に陥りやすいパターンです。自覚することで対処できます。
      </p>
      <div className="space-y-3">
        {weaknesses.map((w, i) => (
          <motion.div
            key={w.id}
            className="card-mbti"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
            style={{ borderLeft: `3px solid ${borderColor}` }}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl mt-0.5">{w.icon}</span>
              <div className="flex-1">
                <h4
                  className="font-display text-base font-bold"
                  style={{
                    color:
                      theme?.palette.text ?? "rgba(20,25,45,0.95)",
                  }}
                >
                  {w.headline}
                </h4>
                <p
                  className="text-sm mt-1 leading-relaxed"
                  style={{
                    color:
                      theme?.palette.textMuted ?? "rgba(50,55,75,0.8)",
                  }}
                >
                  {w.description}
                </p>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
});

// ── Relationships ──

export const RelationshipsSection = memo(function RelationshipsSection({
  relationships,
}: {
  relationships: ProfileContent["relationships"];
}) {
  const { theme } = useArchetypeTheme();
  const [activeCtx, setActiveCtx] = useState<string>("romance");

  if (relationships.length === 0) return null;

  const active =
    relationships.find((r) => r.context === activeCtx) || relationships[0];

  return (
    <section>
      <SectionLabel label="関係性のパターン" sublabel="対人関係" />
      <p
        className="text-sm mb-4 leading-relaxed"
        style={{
          color: theme?.palette.text ?? "rgba(30,35,55,0.75)",
        }}
      >
        場面ごとに、あなたの対人傾向がどう変化するかを分析しています。
      </p>

      <div className="flex gap-2 mb-4">
        {relationships.map((r) => (
          <button
            key={r.context}
            onClick={() => setActiveCtx(r.context)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background:
                activeCtx === r.context
                  ? withAlpha(r.accentColor, 0.15)
                  : "rgba(255,255,255,0.6)",
              border:
                activeCtx === r.context
                  ? `1px solid ${withAlpha(r.accentColor, 0.35)}`
                  : "1px solid rgba(160,170,200,0.15)",
              color:
                activeCtx === r.context
                  ? withAlpha(r.accentColor, 0.9)
                  : "rgba(60,65,85,0.7)",
            }}
          >
            <span>{r.icon}</span>
            <span>{r.contextLabel}</span>
          </button>
        ))}
      </div>

      <motion.div
        key={active.context}
        className="card-mbti"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          borderLeft: `3px solid ${withAlpha(active.accentColor, 0.5)}`,
        }}
      >
        <p
          className="font-display text-base font-bold mb-3"
          style={{
            color: theme?.palette.text ?? "rgba(20,25,45,0.95)",
          }}
        >
          {active.style}
        </p>

        <div className="mb-3">
          <span
            className="text-xs font-mono-sg font-semibold block mb-1.5"
            style={{ color: "rgba(34,160,88,0.85)" }}
          >
            強み
          </span>
          <ul className="space-y-1">
            {active.strengths.map((s, i) => (
              <li
                key={`s-${s.slice(0, 20)}-${i}`}
                className="text-sm flex items-start gap-1.5"
                style={{
                  color:
                    theme?.palette.textMuted ?? "rgba(40,45,65,0.8)",
                }}
              >
                <span
                  className="font-bold"
                  style={{ color: "rgba(34,160,88,0.7)" }}
                >
                  +
                </span>
                {s}
              </li>
            ))}
          </ul>
        </div>

        <div className="mb-3">
          <span
            className="text-xs font-mono-sg font-semibold block mb-1.5"
            style={{
              color:
                theme?.palette.textLabel ?? "rgba(140,120,60,0.85)",
            }}
          >
            課題
          </span>
          <ul className="space-y-1">
            {active.challenges.map((c, i) => (
              <li
                key={`c-${c.slice(0, 20)}-${i}`}
                className="text-sm flex items-start gap-1.5"
                style={{
                  color:
                    theme?.palette.textMuted ?? "rgba(50,55,75,0.8)",
                }}
              >
                <span
                  className="font-bold"
                  style={{
                    color:
                      theme?.palette.textLabel ??
                      "rgba(140,120,60,0.7)",
                  }}
                >
                  ·
                </span>
                {c}
              </li>
            ))}
          </ul>
        </div>

        <div
          className="mt-3 pt-3 flex items-start gap-2.5 rounded-lg p-3"
          style={{
            background: withAlpha(active.accentColor, 0.06),
            border: `1px solid ${withAlpha(active.accentColor, 0.12)}`,
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={withAlpha(active.accentColor, 0.6)} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5" aria-hidden="true">
            <path d="M9 18V5l12-2v13" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="18" cy="16" r="3" />
          </svg>
          <p
            className="text-sm leading-relaxed font-medium"
            style={{
              color: withAlpha(active.accentColor, 0.85),
            }}
          >
            {active.advice}
          </p>
        </div>
      </motion.div>
    </section>
  );
});

// ── Defining Traits ──

export const DefiningTraitsSection = memo(function DefiningTraitsSection({
  traits,
}: {
  traits: ProfileContent["influentialTraits"];
}) {
  const { theme } = useArchetypeTheme();
  if (traits.length === 0) return null;

  return (
    <section>
      <SectionLabel label="あなたを突き動かす原動力" sublabel="行動の原動力" />
      <p
        className="text-sm mb-4 leading-relaxed"
        style={{
          color: theme?.palette.text ?? "rgba(30,35,55,0.75)",
        }}
      >
        あなたの行動に最も強く影響を与えている特性です。これらが組み合わさって、あなた独自の判断や行動のパターンを生み出しています。
      </p>
      <div className="grid grid-cols-2 gap-3">
        {traits.map((trait, i) => (
          <motion.div
            key={trait.id}
            className="card-section text-center py-5"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.06 }}
          >
            <span className="text-2xl block mb-2">{trait.icon}</span>
            <h5
              className="font-display text-base font-bold"
              style={{
                color: theme?.palette.text ?? "rgba(20,25,45,0.95)",
              }}
            >
              {trait.label}
            </h5>
            <p
              className="text-sm mt-1.5 px-2 leading-relaxed"
              style={{
                color:
                  theme?.palette.textMuted ?? "rgba(50,55,75,0.8)",
              }}
            >
              {trait.description}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
});

// ── Inline Sparkline Mini (for CoreAxesSection) ──

const SparklineMini = memo(function SparklineMini({
  data,
  color,
}: {
  data: number[];
  color: string;
}) {
  const w = 64;
  const h = 20;
  const px = 2;
  const py = 2;

  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points: [number, number][] = data.map((v, i) => [
    px + (i / (data.length - 1)) * (w - px * 2),
    py + (1 - (v - min) / range) * (h - py * 2),
  ]);

  // Simple polyline path
  const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]},${p[1]}`).join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="shrink-0">
      <motion.path
        d={d}
        fill="none"
        stroke={hexToRgba(color, 0.4)}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.5, ease: "easeOut" }}
      />
      {/* Latest point dot */}
      <motion.circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={2}
        fill={hexToRgba(color, 0.7)}
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 1.2, type: "spring", stiffness: 300 }}
      />
    </svg>
  );
});
