// app/stargazer/_components/DataQualityBadge.tsx
// データ品質バッジ — 観測データの信頼性を可視化
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DataQualityScore } from "@/lib/stargazer/validation/dataQuality";
import { useArchetypeTheme } from "./ArchetypeThemeProvider";
import { hexToRgba } from "../_utils/color";

interface Props {
  quality: DataQualityScore;
}

const DIMENSION_LABELS: Record<keyof DataQualityScore["dimensions"], { label: string; icon: string }> = {
  sampleSize: { label: "観測量", icon: "📊" },
  temporalCoverage: { label: "時間的カバレッジ", icon: "📅" },
  axisCoverage: { label: "軸カバレッジ", icon: "🎯" },
  internalConsistency: { label: "内的整合性", icon: "🔗" },
};

function getLevelColor(level: DataQualityScore["level"]): string {
  switch (level) {
    case "low": return "#718096";
    case "moderate": return "#D69E2E";
    case "high": return "#38A169";
    case "excellent": return "#805AD5";
  }
}

export default function DataQualityBadge({ quality }: Props) {
  const { theme } = useArchetypeTheme();
  const [showDetails, setShowDetails] = useState(false);

  if (!theme) return null;

  const { text, border } = theme.palette;
  const color = getLevelColor(quality.level);
  const pct = Math.round(quality.overall * 100);

  return (
    <motion.div
      className="rounded-xl overflow-hidden"
      style={{
        background: hexToRgba(color, 0.06),
        border: `1px solid ${hexToRgba(color, 0.2)}`,
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.22 }}
    >
      <button
        className="w-full text-left px-4 py-3"
        onClick={() => setShowDetails(!showDetails)}
        aria-expanded={showDetails}
        aria-label={`データ品質: ${quality.levelLabel} (${pct}%) — 詳細を${showDetails ? "閉じる" : "表示"}`}
      >
        <div className="flex items-center gap-3">
          {/* Mini Ring */}
          <div className="relative flex-shrink-0" style={{ width: 40, height: 40 }}>
            <svg viewBox="0 0 40 40" className="w-full h-full" role="img" aria-label={`データ品質 ${pct}%`}>
              <circle cx="20" cy="20" r="16" fill="none" stroke={hexToRgba(text, 0.08)} strokeWidth="3" />
              <circle
                cx="20" cy="20" r="16"
                fill="none" stroke={color} strokeWidth="3"
                strokeDasharray={`${quality.overall * 100.5} 100.5`}
                strokeLinecap="round"
                transform="rotate(-90 20 20)"
              />
            </svg>
            <span
              className="absolute inset-0 flex items-center justify-center text-[10px] font-mono-sg font-bold"
              style={{ color }}
            >
              {pct}
            </span>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: hexToRgba(text, 0.9) }}>
                データ品質
              </span>
              <span
                className="text-xs px-2 py-0.5 rounded-full font-medium"
                style={{ background: hexToRgba(color, 0.15), color }}
              >
                {quality.levelLabel}
              </span>
            </div>
            <p className="text-xs mt-0.5" style={{ color: hexToRgba(text, 0.5) }}>
              {quality.advice[0] || "観測データの信頼性スコア"}
            </p>
          </div>

          <motion.span
            className="text-xs flex-shrink-0"
            style={{ color: hexToRgba(text, 0.4) }}
            animate={{ rotate: showDetails ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            ▼
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {showDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div
              className="px-4 pb-4 space-y-3 border-t"
              style={{ borderColor: hexToRgba(text, 0.06) }}
            >
              {/* Dimension Bars */}
              <div className="grid gap-2 pt-3">
                {(Object.entries(quality.dimensions) as [keyof DataQualityScore["dimensions"], number][]).map(
                  ([key, value]) => {
                    const dim = DIMENSION_LABELS[key];
                    return (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-sm flex-shrink-0">{dim.icon}</span>
                        <span
                          className="text-xs flex-shrink-0 w-24"
                          style={{ color: hexToRgba(text, 0.7) }}
                        >
                          {dim.label}
                        </span>
                        <div
                          className="flex-1 h-1.5 rounded-full overflow-hidden"
                          style={{ background: hexToRgba(text, 0.08) }}
                        >
                          <motion.div
                            className="h-full rounded-full"
                            style={{ background: color }}
                            initial={{ width: 0 }}
                            animate={{ width: `${value * 100}%` }}
                            transition={{ delay: 0.1, duration: 0.22, ease: "easeOut" }}
                          />
                        </div>
                        <span
                          className="text-[10px] font-mono-sg flex-shrink-0 w-8 text-right"
                          style={{ color: hexToRgba(text, 0.5) }}
                        >
                          {Math.round(value * 100)}
                        </span>
                      </div>
                    );
                  },
                )}
              </div>

              {/* Advice */}
              {quality.advice.length > 1 && (
                <div className="space-y-1.5 pt-1">
                  {quality.advice.slice(1).map((advice, i) => (
                    <p
                      key={i}
                      className="text-xs flex items-start gap-1.5"
                      style={{ color: hexToRgba(text, 0.55) }}
                    >
                      <span style={{ color: hexToRgba(color, 0.7) }}>💡</span>
                      {advice}
                    </p>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
