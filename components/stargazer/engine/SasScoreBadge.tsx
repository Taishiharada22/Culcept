"use client";

import { GlassBadge } from "@/components/ui/glassmorphism-design";
import { cn } from "@/lib/utils";

const LEVEL_MAP: Record<string, { label: string; color: string }> = {
  fog:        { label: "霧",   color: "bg-slate-100 text-slate-500 border-slate-300" },
  dawn:       { label: "夜明け", color: "bg-orange-50 text-orange-600 border-orange-200" },
  moonlight:  { label: "月光",  color: "bg-slate-50 text-slate-400 border-slate-200" },
  starry:     { label: "星空",  color: "bg-blue-50 text-blue-600 border-blue-200" },
  telescope:  { label: "望遠鏡", color: "bg-purple-50 text-purple-600 border-purple-200" },
  supernova:  { label: "超新星", color: "bg-amber-50 text-amber-600 border-amber-300" },
};

interface SasScoreBadgeProps {
  score: number;
  level: string;
  className?: string;
}

export default function SasScoreBadge({ score, level, className }: SasScoreBadgeProps) {
  const info = LEVEL_MAP[level] ?? LEVEL_MAP.fog;
  const displayScore = typeof score === "number" && !Number.isNaN(score) ? Math.round(score) : 0;
  return (
    <GlassBadge className={cn(info.color, className)}>
      {info.label} {displayScore}%
    </GlassBadge>
  );
}
