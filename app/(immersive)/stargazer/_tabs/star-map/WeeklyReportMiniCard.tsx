// app/stargazer/_tabs/star-map/WeeklyReportMiniCard.tsx
// アーキタイプ概要に表示する週次リビール・ミニカード — Spotify Wrapped 風の1スライドプレビュー
"use client";

import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useArchetypeTheme } from "../../_components/ArchetypeThemeProvider";
import { hexToRgba } from "../../_utils/color";
import type { WeeklyReport } from "@/lib/stargazer/weeklyReportGenerator";

// ── CountUp hook (lightweight version) ──
function useCountUp(target: number, duration = 1000): number {
  const [value, setValue] = useState(0);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (!target) return;
    const start = performance.now();
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, duration]);

  return value;
}

interface WeeklyReportMiniCardProps {
  report: WeeklyReport | null;
  onOpenFull?: () => void;
}

export default function WeeklyReportMiniCard({
  report,
  onOpenFull,
}: WeeklyReportMiniCardProps) {
  const { theme } = useArchetypeTheme();

  if (!report || !report.slides.length) return null;

  // Pick the most impactful slide (opening or growth)
  const slide =
    report.slides.find((s) => s.type === "opening_impact") ??
    report.slides.find((s) => s.type === "growth_trajectory") ??
    report.slides[0];

  const statNumber = slide.mainStat ? parseInt(slide.mainStat, 10) : 0;
  const primary = theme?.palette.primary ?? "#8B5CF6";
  const textColor = theme?.palette.text ?? "rgba(20,25,45,0.95)";
  const textMuted = theme?.palette.textMuted ?? "rgba(60,65,85,0.7)";
  const textLabel = theme?.palette.textLabel ?? "rgba(140,120,60,0.8)";

  return (
    <MiniCardInner
      slide={slide}
      statNumber={statNumber}
      primary={primary}
      textColor={textColor}
      textMuted={textMuted}
      textLabel={textLabel}
      weekLabel={`第${report.weekNumber}週`}
      onOpenFull={onOpenFull}
    />
  );
}

// Separate inner component to use hooks after early return
function MiniCardInner({
  slide,
  statNumber,
  primary,
  textColor,
  textMuted,
  textLabel,
  weekLabel,
  onOpenFull,
}: {
  slide: WeeklyReport["slides"][number];
  statNumber: number;
  primary: string;
  textColor: string;
  textMuted: string;
  textLabel: string;
  weekLabel: string;
  onOpenFull?: () => void;
}) {
  const animatedStat = useCountUp(statNumber || 0, 1200);

  return (
    <motion.div
      className="rounded-xl overflow-hidden"
      style={{
        background: `linear-gradient(135deg, ${hexToRgba(primary, 0.06)}, ${hexToRgba(primary, 0.02)})`,
        border: `1px solid ${hexToRgba(primary, 0.12)}`,
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
    >
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[10px] font-mono-sg uppercase tracking-wider"
            style={{ color: textLabel }}
          >
            WEEKLY REPORT {weekLabel}
          </span>
          {slide.iconEmoji && (
            <span className="text-base">{slide.iconEmoji}</span>
          )}
        </div>

        {/* Main stat + headline */}
        <div className="flex items-end gap-3 mb-2">
          {statNumber > 0 && (
            <span
              className="font-mono-sg text-3xl font-bold tabular-nums leading-none"
              style={{ color: textColor }}
            >
              {animatedStat}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-semibold truncate"
              style={{ color: textColor }}
            >
              {slide.headline}
            </p>
            {slide.mainStatLabel && (
              <p
                className="text-xs mt-0.5"
                style={{ color: textMuted }}
              >
                {slide.mainStatLabel}
              </p>
            )}
          </div>
        </div>

        {/* One-line narrative */}
        <p
          className="text-xs leading-relaxed line-clamp-2"
          style={{ color: textMuted }}
        >
          {slide.body}
        </p>

        {/* CTA */}
        {onOpenFull && (
          <button
            onClick={onOpenFull}
            className="mt-3 text-xs font-medium flex items-center gap-1 transition-opacity hover:opacity-80"
            style={{ color: hexToRgba(primary, 0.75) }}
          >
            全スライドを見る
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        )}
      </div>
    </motion.div>
  );
}
