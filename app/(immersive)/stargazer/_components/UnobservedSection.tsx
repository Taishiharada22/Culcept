// app/stargazer/_components/UnobservedSection.tsx
// 未観測次元 — まだ観測が足りない領域の表示
"use client";

import { motion } from "framer-motion";

interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

interface Props {
  dimensions: DimensionDetail[];
  totalQuestions: number;
  lightMode?: boolean;
}

export default function UnobservedSection({
  dimensions,
  totalQuestions,
  lightMode = true,
}: Props) {
  // 未観測 = confidence < 0.15 or evidenceCount < 3
  const unobserved = dimensions.filter(
    (d) => d.confidence < 0.15 || d.evidenceCount < 3
  );

  if (unobserved.length === 0) return null;

  const textTertiary = lightMode
    ? "rgba(80,90,110,0.4)"
    : "rgba(120,125,140,0.4)";
  const textSecondary = lightMode
    ? "rgba(60,70,90,0.5)"
    : "rgba(100,105,130,0.5)";
  const textMuted = lightMode
    ? "rgba(80,90,110,0.35)"
    : "rgba(120,125,140,0.35)";
  const lineBg = lightMode
    ? "rgba(100,110,130,0.12)"
    : "rgba(160,170,200,0.12)";
  const cardBg = lightMode
    ? "rgba(0,0,0,0.02)"
    : "rgba(0,0,0,0.02)";
  const cardBorder = lightMode
    ? "rgba(0,0,0,0.05)"
    : "rgba(160,170,200,0.1)";
  const barBg = lightMode
    ? "rgba(0,0,0,0.04)"
    : "rgba(0,0,0,0.04)";
  const barFill = lightMode
    ? "rgba(0,0,0,0.08)"
    : "rgba(0,0,0,0.08)";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to right, ${lineBg}, transparent)`,
          }}
        />
        <span
          className="font-mono-sg text-xs tracking-[0.25em] uppercase font-medium"
          style={{ color: textTertiary }}
        >
          まだ見えていない領域
        </span>
        <div
          className="h-px flex-1"
          style={{
            background: `linear-gradient(to left, ${lineBg}, transparent)`,
          }}
        />
      </div>

      <p className="font-body text-sm" style={{ color: textSecondary }}>
        まだ観測が足りない領域。データが増えると解像度が上がります。
      </p>

      <div className="space-y-2">
        {unobserved.map((dim, i) => {
          const pct = Math.round(dim.confidence * 100);
          const remaining = Math.max(
            0,
            Math.ceil((0.5 - dim.confidence) * totalQuestions)
          );

          return (
            <motion.div
              key={dim.id}
              initial={{ opacity: 0, x: -8 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.05, duration: 0.22 }}
              className="rounded-lg p-3"
              style={{
                background: cardBg,
                border: `1px solid ${cardBorder}`,
              }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span
                  className="font-body text-sm"
                  style={{ color: textSecondary }}
                >
                  {dim.labelLeft} → {dim.labelRight}
                </span>
                <span
                  className="font-mono-sg text-xs tabular-nums"
                  style={{ color: textTertiary }}
                >
                  {pct}%
                </span>
              </div>

              {/* Progress bar */}
              <div
                className="h-1 rounded-full overflow-hidden mb-1"
                style={{ background: barBg }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: barFill,
                  }}
                />
              </div>

              <p
                className="font-body text-xs"
                style={{ color: textMuted }}
              >
                あと {remaining}問 の観測で推定可能
              </p>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
