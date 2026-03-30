"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/glassmorphism-design";

interface Props {
  archetype?: { emoji: string; label: string } | null;
  syncPercent?: number;
  innerWeather?: { emoji: string; label: string } | null;
  streakDays?: number;
  loading?: boolean;
  observationCount?: number;
}

export default function IdentitySnapshot({
  archetype,
  syncPercent,
  innerWeather,
  streakDays,
  loading,
  observationCount = 0,
}: Props) {
  if (loading) {
    return (
      <div className="px-4 py-2">
        <Skeleton className="h-5 w-3/4 rounded-full" />
      </div>
    );
  }

  // obs=0: 未観測状態
  if (observationCount === 0 || !archetype) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="px-4 py-2"
      >
        <p className="text-xs text-slate-400 tracking-wide">
          まだ見えていない — 最初の観測を始めよう
        </p>
      </motion.div>
    );
  }

  const parts: string[] = [];
  parts.push(`${archetype.emoji} ${archetype.label}`);
  if (typeof syncPercent === "number") parts.push(`Sync ${Math.round(syncPercent)}%`);
  if (innerWeather) parts.push(`${innerWeather.emoji} ${innerWeather.label}`);
  if (typeof streakDays === "number" && streakDays > 0) parts.push(`🔥 ${streakDays}日連続`);

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="px-4 py-2"
    >
      <p className="text-xs font-medium text-slate-500 tracking-wide truncate">
        {parts.join(" · ")}
      </p>
    </motion.div>
  );
}
