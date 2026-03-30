"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RV_COLORS } from "@/components/ui/rendezvous-design";

type Segment = {
  key: string;
  label: string;
  weight: number;
  score: number;
  color: string;
};

type StrengthData = {
  completeness: number;
  segments: Segment[];
  nextAction: { label: string; description: string } | null;
};

/**
 * ProfileStrengthRing — ライトテーマ版
 * プロフィール完成度をリングで表示
 */
export default function ProfileStrengthRing() {
  const [data, setData] = useState<StrengthData | null>(null);

  useEffect(() => {
    fetch("/api/rendezvous/profile-strength", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: StrengthData | null) => {
        if (d) setData(d);
      })
      .catch(() => {});
  }, []);

  if (!data || data.completeness >= 100) return null;

  const size = 100;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = data.completeness / 100;

  const ringColor =
    data.completeness >= 80
      ? RV_COLORS.success
      : data.completeness >= 50
        ? RV_COLORS.accent
        : RV_COLORS.primary;

  const ringGlow =
    data.completeness >= 80
      ? RV_COLORS.successGlow
      : data.completeness >= 50
        ? RV_COLORS.accentGlow
        : RV_COLORS.primaryGlow;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      style={{
        padding: "16px",
        borderRadius: 16,
        background: RV_COLORS.surface,
        border: `1px solid ${RV_COLORS.border}`,
        boxShadow: `0 2px 12px ${RV_COLORS.shadow}`,
        display: "flex",
        alignItems: "center",
        gap: 16,
      }}
    >
      {/* SVG Ring */}
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={RV_COLORS.surfaceMuted}
            strokeWidth={strokeWidth}
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference * (1 - progress) }}
            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
            style={{
              transform: "rotate(-90deg)",
              transformOrigin: "50% 50%",
              filter: `drop-shadow(0 0 4px ${ringGlow})`,
            }}
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
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: ringColor,
              fontFamily: "'JetBrains Mono','SF Mono',monospace",
              lineHeight: 1,
            }}
          >
            {data.completeness}
          </motion.span>
          <span style={{ fontSize: 8, color: RV_COLORS.textMuted, fontWeight: 600 }}>%</span>
        </div>
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: RV_COLORS.textSub, marginBottom: 4 }}>
          プロフィール完成度
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 8 }}>
          {data.segments.map((seg) => (
            <div key={seg.key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, color: RV_COLORS.textMuted, width: 56, flexShrink: 0 }}>
                {seg.label}
              </span>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: RV_COLORS.surfaceMuted }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${seg.score * 100}%` }}
                  transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
                  style={{
                    height: "100%",
                    borderRadius: 2,
                    background: seg.color,
                  }}
                />
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence>
          {data.nextAction && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              style={{
                fontSize: 10,
                color: ringColor,
                fontWeight: 600,
                margin: 0,
              }}
            >
              {data.nextAction.description}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
