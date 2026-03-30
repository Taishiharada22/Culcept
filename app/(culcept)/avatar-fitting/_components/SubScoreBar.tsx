"use client";

import { motion } from "framer-motion";

type Props = {
  label: string;
  score: number;
  adjustedScore: number;
  reasons: string[];
  delay?: number;
};

function scoreColor(score: number): string {
  if (score >= 70) return "bg-emerald-400";
  if (score >= 40) return "bg-amber-400";
  return "bg-rose-400";
}

export default function SubScoreBar({ label, score, adjustedScore, reasons, delay = 0 }: Props) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/80">{label}</span>
        <span className="text-sm font-bold text-white">{adjustedScore}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className={`h-full rounded-full ${scoreColor(adjustedScore)}`}
          initial={{ width: 0 }}
          animate={{ width: `${adjustedScore}%` }}
          transition={{ duration: 0.8, delay, ease: "easeOut" }}
        />
      </div>
      {reasons.length > 0 && (
        <p className="text-xs text-white/40">{reasons.slice(0, 2).join(" / ")}</p>
      )}
    </div>
  );
}
