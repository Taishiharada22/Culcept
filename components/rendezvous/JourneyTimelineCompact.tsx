"use client";

/**
 * JourneyTimelineCompact — 統合ジャーニータイムライン
 * JourneyTimeline, JourneyMap, JourneyTimelineSection の責務を統合
 * 軽量なスパークライン表示 + マイルストーン
 */

import { motion } from "framer-motion";
import { RV_COLORS, RvCard, RvSectionTitle } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";

type TimelinePoint = {
  date: string;
  score: number;
  milestone?: string;
};

type Props = {
  points: TimelinePoint[];
  color?: string;
  height?: number;
  className?: string;
};

export default function JourneyTimelineCompact({
  points,
  color = RV_COLORS.primary,
  height = 80,
  className,
}: Props) {
  if (!points || points.length < 2) return null;

  const maxScore = Math.max(...points.map((p) => p.score), 1);
  const w = 300;
  const pad = 16;
  const innerW = w - pad * 2;
  const innerH = height - pad;

  const pathPoints = points.map((p, i) => ({
    x: pad + (i / (points.length - 1)) * innerW,
    y: pad + innerH - (p.score / maxScore) * innerH,
  }));

  // Smooth bezier
  const d = pathPoints.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = pathPoints[i - 1];
    const cx = (prev.x + pt.x) / 2;
    return `${acc} Q ${cx} ${prev.y} ${pt.x} ${pt.y}`;
  }, "");

  const milestones = points.filter((p) => p.milestone);

  return (
    <FadeInView className={className}>
      <RvCard>
        <RvSectionTitle accent={color}>ジャーニー</RvSectionTitle>
        <div className="mt-3">
          <svg viewBox={`0 0 ${w} ${height}`} className="w-full" style={{ height }}>
            {/* Area fill */}
            <path
              d={`${d} L ${pathPoints[pathPoints.length - 1].x} ${height} L ${pathPoints[0].x} ${height} Z`}
              fill={`${color}08`}
            />
            {/* Line */}
            <motion.path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinecap="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
            {/* Milestone dots */}
            {points.map((p, i) => {
              if (!p.milestone) return null;
              const pt = pathPoints[i];
              return (
                <circle
                  key={i}
                  cx={pt.x}
                  cy={pt.y}
                  r="4"
                  fill={color}
                  stroke="white"
                  strokeWidth="2"
                />
              );
            })}
          </svg>

          {/* Milestone labels */}
          {milestones.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {milestones.map((m, i) => (
                <span
                  key={i}
                  className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: `${color}08`, color: `${color}CC` }}
                >
                  {m.milestone}
                </span>
              ))}
            </div>
          )}
        </div>
      </RvCard>
    </FadeInView>
  );
}
