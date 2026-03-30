"use client";

/**
 * CatalystCard
 * 成長触媒ポテンシャルを可視化するカード
 * 相性ではなく「この人があなたの変容をどう加速するか」を表示
 */

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { CatalystPotential, CatalystType } from "@/lib/rendezvous/growthCatalyst";

type Props = {
  potential: CatalystPotential;
  compact?: boolean;
};

// ---------- Catalyst Type Visuals ----------

const CATALYST_ICONS: Record<CatalystType, string> = {
  mirror: "\u{1FA9E}", // 🪞
  challenger: "\u{2694}\u{FE0F}", // ⚔️
  amplifier: "\u{1F4E1}", // 📡
  stabilizer: "\u{2693}", // ⚓
  spark: "\u{2728}", // ✨
  healer: "\u{1F33F}", // 🌿
  compass: "\u{1F9ED}", // 🧭
  wildcard: "\u{1F0CF}", // 🃏
};

const CATALYST_COLORS: Record<CatalystType, { ring: string; bg: string; text: string }> = {
  mirror: { ring: "#818CF8", bg: "rgba(129,140,248,0.08)", text: "#6366F1" },
  challenger: { ring: "#F97316", bg: "rgba(249,115,22,0.08)", text: "#EA580C" },
  amplifier: { ring: "#A78BFA", bg: "rgba(167,139,250,0.08)", text: "#7C3AED" },
  stabilizer: { ring: "#06B6D4", bg: "rgba(6,182,212,0.08)", text: "#0891B2" },
  spark: { ring: "#FBBF24", bg: "rgba(251,191,36,0.08)", text: "#D97706" },
  healer: { ring: "#34D399", bg: "rgba(52,211,153,0.08)", text: "#059669" },
  compass: { ring: "#3B82F6", bg: "rgba(59,130,246,0.08)", text: "#2563EB" },
  wildcard: { ring: "#EC4899", bg: "rgba(236,72,153,0.08)", text: "#DB2777" },
};

const ZONE_COLORS = {
  "快適ゾーン": { ring: "#34D399", bg: "rgba(52,211,153,0.10)" },
  "伸張ゾーン": { ring: "#FBBF24", bg: "rgba(251,191,36,0.10)" },
  "恐怖ゾーン": { ring: "#F87171", bg: "rgba(248,113,113,0.10)" },
} as const;

// ---------- Score Ring Component ----------

function ScoreRing({
  score,
  color,
  size = 72,
}: {
  score: number;
  color: string;
  size?: number;
}) {
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(0,0,0,0.06)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
        }}
      >
        <motion.span
          style={{ fontSize: size * 0.28, fontWeight: 700, color, lineHeight: 1 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
        >
          {score}
        </motion.span>
      </div>
    </div>
  );
}

// ---------- Growth Zone Rings ----------

function GrowthZoneRings({
  zones,
  compact,
}: {
  zones: CatalystPotential["growthZones"];
  compact?: boolean;
}) {
  if (compact) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "rgba(30,30,60,0.5)",
          margin: 0,
          letterSpacing: "0.02em",
        }}
      >
        成長ゾーン
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        {zones.map((zone) => {
          const zoneColor =
            ZONE_COLORS[zone.name as keyof typeof ZONE_COLORS] ??
            ZONE_COLORS["伸張ゾーン"];
          return (
            <motion.div
              key={zone.name}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
              style={{
                flex: 1,
                padding: "10px 10px",
                borderRadius: 10,
                background: zoneColor.bg,
                border: `1px solid ${zoneColor.ring}30`,
              }}
            >
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: zoneColor.ring,
                  margin: 0,
                }}
              >
                {zone.name}
              </p>
              {zone.axes.length > 0 ? (
                <p
                  style={{
                    fontSize: 9,
                    color: "rgba(30,30,60,0.5)",
                    margin: "4px 0 0",
                    lineHeight: 1.4,
                  }}
                >
                  {zone.axes.slice(0, 3).join("・")}
                  {zone.axes.length > 3 && ` +${zone.axes.length - 3}`}
                </p>
              ) : (
                <p
                  style={{
                    fontSize: 9,
                    color: "rgba(30,30,60,0.3)",
                    margin: "4px 0 0",
                    fontStyle: "italic",
                  }}
                >
                  なし
                </p>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Main Component ----------

export default function CatalystCard({ potential, compact = false }: Props) {
  const colors = CATALYST_COLORS[potential.catalystType];
  const icon = CATALYST_ICONS[potential.catalystType];

  return (
    <GlassCard padding={compact ? "sm" : "md"}>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 20 }}
        style={{ display: "flex", flexDirection: "column", gap: compact ? 12 : 16 }}
      >
        {/* Header: Type + Score */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Catalyst Type Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.15 }}
            style={{
              width: compact ? 44 : 52,
              height: compact ? 44 : 52,
              borderRadius: 14,
              background: colors.bg,
              border: `1.5px solid ${colors.ring}30`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: compact ? 22 : 26,
              flexShrink: 0,
            }}
          >
            {icon}
          </motion.div>

          {/* Type Label + Description */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p
              style={{
                fontSize: compact ? 14 : 16,
                fontWeight: 700,
                color: colors.text,
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {potential.catalystLabel}
            </p>
            {!compact && (
              <p
                style={{
                  fontSize: 11,
                  color: "rgba(30,30,60,0.5)",
                  margin: "4px 0 0",
                  lineHeight: 1.5,
                }}
              >
                {potential.catalystDescription}
              </p>
            )}
          </div>

          {/* Score Ring */}
          <ScoreRing
            score={potential.overallCatalystScore}
            color={colors.ring}
            size={compact ? 56 : 72}
          />
        </div>

        {/* Growth Zones: 3 concentric zone indicators */}
        <GrowthZoneRings zones={potential.growthZones} compact={compact} />

        {/* Accelerated Axes */}
        {potential.acceleratedAxes.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(30,30,60,0.5)",
                margin: 0,
                letterSpacing: "0.02em",
              }}
            >
              加速する成長軸
            </p>
            {potential.acceleratedAxes.map((aa, i) => (
              <motion.div
                key={aa.axis}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 + i * 0.08 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(52,211,153,0.06)",
                  border: "1px solid rgba(52,211,153,0.12)",
                }}
              >
                <span style={{ fontSize: 12, flexShrink: 0, color: "#059669" }}>
                  {"\u2191"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "rgba(30,30,60,0.7)",
                      margin: 0,
                    }}
                  >
                    {aa.label}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 400,
                        color: "#059669",
                        marginLeft: 6,
                      }}
                    >
                      +{aa.potential}%
                    </span>
                  </p>
                  {!compact && (
                    <p
                      style={{
                        fontSize: 10,
                        color: "rgba(30,30,60,0.4)",
                        margin: "2px 0 0",
                        lineHeight: 1.4,
                      }}
                    >
                      {aa.narrative}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Growth Pains */}
        {potential.growthPains.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(30,30,60,0.5)",
                margin: 0,
                letterSpacing: "0.02em",
              }}
            >
              成長の痛み
            </p>
            {potential.growthPains.map((gp, i) => (
              <motion.div
                key={gp.axis}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.08 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 8,
                  background: "rgba(251,191,36,0.06)",
                  border: "1px solid rgba(251,191,36,0.12)",
                }}
              >
                <span style={{ fontSize: 12, flexShrink: 0, color: "#D97706" }}>
                  {"\u26A0"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: "rgba(30,30,60,0.7)",
                      margin: 0,
                    }}
                  >
                    {gp.label}
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 400,
                        color: "#D97706",
                        marginLeft: 6,
                      }}
                    >
                      痛み {gp.painLevel}%
                    </span>
                  </p>
                  {!compact && (
                    <p
                      style={{
                        fontSize: 10,
                        color: "rgba(30,30,60,0.4)",
                        margin: "2px 0 0",
                        lineHeight: 1.4,
                      }}
                    >
                      {gp.narrative}
                    </p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </GlassCard>
  );
}
