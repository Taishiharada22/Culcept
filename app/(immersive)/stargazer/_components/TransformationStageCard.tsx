// app/stargazer/_components/TransformationStageCard.tsx
// Layer 6: 変容の可能性 — Prochaska 変容ステージモデルの可視化
"use client";

import { motion } from "framer-motion";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

// ── Types ──

export interface TransformationStageCardProps {
  changeStage: "pre_contemplation" | "contemplation" | "preparation" | "action" | "maintenance";
  changeStageLabel: string;
  changeStageDescription: string;
  accelerating?: Array<{
    axis: string;
    axisLabel: string;
    velocity: number;
    direction: string;
    interpretation: string;
  }>;
  mostStable?: Array<{
    axis: string;
    axisLabel: string;
    interpretation: string;
  }>;
}

// ── Stage definitions ──

const STAGES: Array<{
  key: TransformationStageCardProps["changeStage"];
  label: string;
  shortLabel: string;
}> = [
  { key: "pre_contemplation", label: "観測開始期", shortLabel: "前熟考" },
  { key: "contemplation",     label: "探索期",    shortLabel: "熟考" },
  { key: "preparation",       label: "準備期",    shortLabel: "準備" },
  { key: "action",            label: "変容期",    shortLabel: "行動" },
  { key: "maintenance",       label: "安定期",    shortLabel: "維持" },
];

// ── Component ──

export default function TransformationStageCard({
  changeStage,
  changeStageLabel,
  changeStageDescription,
  accelerating = [],
  mostStable = [],
}: TransformationStageCardProps) {
  const { theme } = useArchetypeTheme();

  // Fallback theme when ArchetypeThemeProvider is absent
  const fallbackPalette = {
    primary: "#C9A84C",
    accent: "#60C8E8",
    text: "#E8E4DD",
    border: "rgba(255,255,255,0.12)",
  };
  const palette = theme?.palette ?? fallbackPalette;
  const { primary, accent, text, border } = palette;

  const currentIndex = STAGES.findIndex((s) => s.key === changeStage);

  // Colors
  const goldActive  = "#C9A84C";
  const greenDone   = hexToRgba(accent, 0.72);
  const grayFuture  = hexToRgba(text, 0.18);
  const cyanAccel   = "#60C8E8";
  const amberStable = "#D4955A";

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: theme?.gradient?.card ?? "linear-gradient(135deg, rgba(30,30,40,0.85), rgba(20,20,30,0.95))",
        border: `1px solid ${border}`,
        backdropFilter: `blur(${theme?.glassEffect?.blur ?? "20px"})`,
      }}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="p-6 sm:p-8">

        {/* ── Header ── */}
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
            変容のステージ
          </span>
          <div
            className="flex-1 h-px"
            style={{
              background: `linear-gradient(90deg, ${hexToRgba(primary, 0.3)} 0%, transparent 100%)`,
            }}
          />
        </div>

        <p
          className="text-xs tracking-widest mb-6 text-center"
          style={{ color: hexToRgba(text, 0.48), letterSpacing: "0.18em" }}
        >
          Transformation Stage
        </p>

        {/* ── Section 1: Stage Progress Bar ── */}
        <div className="relative mb-8">
          {/* Connecting line */}
          <div
            className="absolute top-4 left-0 right-0 h-px"
            style={{ background: hexToRgba(text, 0.08) }}
          />
          {/* Filled line up to current stage */}
          <motion.div
            className="absolute top-4 left-0 h-px"
            style={{
              background: `linear-gradient(90deg, ${greenDone}, ${goldActive})`,
              transformOrigin: "left center",
            }}
            initial={{ scaleX: 0 }}
            whileInView={{
              scaleX: currentIndex === 0 ? 0 : currentIndex / (STAGES.length - 1),
            }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          />

          {/* Stage circles */}
          <div className="relative flex justify-between">
            {STAGES.map((stage, i) => {
              const isPast    = i < currentIndex;
              const isCurrent = i === currentIndex;
              const isFuture  = i > currentIndex;

              const circleColor = isCurrent ? goldActive : isPast ? greenDone : grayFuture;
              const labelColor  = isCurrent
                ? goldActive
                : isPast
                  ? hexToRgba(text, 0.6)
                  : hexToRgba(text, 0.28);

              return (
                <div key={stage.key} className="flex flex-col items-center gap-2">
                  {/* Circle */}
                  <motion.div
                    className="relative w-8 h-8 rounded-full flex items-center justify-center"
                    style={{
                      background: isCurrent
                        ? hexToRgba(goldActive, 0.12)
                        : isPast
                          ? hexToRgba(accent, 0.08)
                          : hexToRgba(text, 0.04),
                      border: `2px solid ${circleColor}`,
                      boxShadow: isCurrent
                        ? `0 0 12px ${hexToRgba(goldActive, 0.35)}`
                        : "none",
                    }}
                    animate={isCurrent ? { scale: [1, 1.08, 1] } : { scale: 1 }}
                    transition={{
                      duration: 2.4,
                      repeat: isCurrent ? Infinity : 0,
                      ease: "easeInOut",
                    }}
                  >
                    {isPast && (
                      <span style={{ color: greenDone, fontSize: 11 }}>✓</span>
                    )}
                    {isCurrent && (
                      <motion.div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: goldActive }}
                        animate={{ opacity: [0.6, 1, 0.6] }}
                        transition={{ duration: 1.8, repeat: Infinity }}
                      />
                    )}
                    {isFuture && (
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: grayFuture }}
                      />
                    )}
                  </motion.div>

                  {/* Label */}
                  <span
                    className="text-[10px] font-mono-sg text-center leading-tight"
                    style={{
                      color: labelColor,
                      fontWeight: isCurrent ? 600 : 400,
                      maxWidth: 44,
                    }}
                  >
                    {stage.shortLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Section 2: Current Stage Description ── */}
        <motion.div
          className="rounded-xl p-4 mb-5"
          style={{
            background: hexToRgba(goldActive, 0.05),
            border: `1px solid ${hexToRgba(goldActive, 0.18)}`,
          }}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: goldActive, fontSize: 9 }}>◆</span>
            <h3
              className="text-sm font-medium"
              style={{ color: goldActive }}
            >
              {changeStageLabel}
            </h3>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: hexToRgba(text, 0.88) }}
          >
            {changeStageDescription}
          </p>
        </motion.div>

        {/* ── Section 3: Accelerating Axes ── */}
        {accelerating.length > 0 && (
          <motion.div
            className="mb-5"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-mono-sg tracking-[0.18em] uppercase"
                style={{ color: hexToRgba(cyanAccel, 0.85) }}
              >
                加速中の変化
              </span>
              <div
                className="flex-1 h-px"
                style={{ background: hexToRgba(cyanAccel, 0.12) }}
              />
            </div>
            <div className="space-y-2">
              {accelerating.slice(0, 3).map((ax, i) => {
                const isPositive = ax.velocity > 0 || ax.direction === "positive";
                return (
                  <motion.div
                    key={ax.axis}
                    className="rounded-lg p-3"
                    style={{
                      background: hexToRgba(cyanAccel, 0.04),
                      border: `1px solid ${hexToRgba(cyanAccel, 0.12)}`,
                    }}
                    initial={{ opacity: 0, x: -8 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.45 + i * 0.07 }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="text-xs font-medium"
                        style={{ color: hexToRgba(cyanAccel, 0.9) }}
                      >
                        {ax.axisLabel}
                      </span>
                      {/* Velocity indicator */}
                      <div className="ml-auto flex items-center gap-1">
                        <span
                          className="text-sm"
                          style={{
                            color: hexToRgba(cyanAccel, 0.8),
                            transform: isPositive ? "none" : "scaleY(-1)",
                            display: "inline-block",
                          }}
                        >
                          ↑
                        </span>
                        <span
                          className="text-[10px] font-mono"
                          style={{ color: hexToRgba(cyanAccel, 0.65) }}
                        >
                          {Math.abs(ax.velocity * 100).toFixed(1)}/日
                        </span>
                      </div>
                    </div>
                    <p
                      className="text-xs leading-relaxed"
                      style={{ color: hexToRgba(text, 0.78) }}
                    >
                      {ax.interpretation}
                    </p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Section 4: Stable Core ── */}
        {mostStable.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <span
                className="text-xs font-mono-sg tracking-[0.18em] uppercase"
                style={{ color: hexToRgba(amberStable, 0.85) }}
              >
                変わらない核
              </span>
              <div
                className="flex-1 h-px"
                style={{ background: hexToRgba(amberStable, 0.12) }}
              />
            </div>
            <div className="space-y-2 mb-3">
              {mostStable.slice(0, 2).map((ax, i) => (
                <motion.div
                  key={ax.axis}
                  className="rounded-lg p-3"
                  style={{
                    background: hexToRgba(amberStable, 0.04),
                    border: `1px solid ${hexToRgba(amberStable, 0.12)}`,
                  }}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.55 + i * 0.07 }}
                >
                  <span
                    className="text-xs font-medium block mb-1"
                    style={{ color: hexToRgba(amberStable, 0.88) }}
                  >
                    {ax.axisLabel}
                  </span>
                  <p
                    className="text-xs leading-relaxed"
                    style={{ color: hexToRgba(text, 0.78) }}
                  >
                    {ax.interpretation}
                  </p>
                </motion.div>
              ))}
            </div>
            <p
              className="text-xs text-center"
              style={{ color: hexToRgba(amberStable, 0.65) }}
            >
              これらはあなたの揺るがない土台です
            </p>
          </motion.div>
        )}

      </div>
    </motion.div>
  );
}
