"use client";

import { motion } from "framer-motion";
import type { ExplorationRecommendation } from "@/lib/origin/v7/observationGaps";
import type { ExplorationAxis } from "@/lib/origin/v7/types";

type Props = {
  recommendation: ExplorationRecommendation;
  onStartExploration: (axis?: ExplorationAxis) => void;
};

export default function ObservationGapPanel({
  recommendation,
  onStartExploration,
}: Props) {
  if (recommendation.gaps.length === 0) return null;

  const pct = Math.round(recommendation.overallCoverage * 100);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="mt-4"
    >
      {/* Header + coverage bar */}
      <div className="mb-2 flex items-center gap-2 px-1">
        <span className="text-sm">🔭</span>
        <h3 className="text-xs font-semibold text-gray-700">
          {recommendation.title}
        </h3>
        <span className="ml-auto text-[10px] text-gray-400">
          観測率 {pct}%
        </span>
      </div>

      {/* Coverage bar */}
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gray-100/50 px-1">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{
            background: "linear-gradient(to right, rgba(212,160,64,0.4), rgba(212,160,64,0.7))",
          }}
        />
      </div>

      {/* Gap list */}
      <div className="space-y-1.5">
        {recommendation.gaps.slice(0, 5).map((gap, i) => (
          <motion.div
            key={`${gap.type}-${gap.period ?? i}`}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 + 0.2 }}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${
              gap.priority === "high"
                ? "border-amber-200/50 bg-amber-50/30"
                : gap.priority === "medium"
                  ? "border-amber-100/40 bg-amber-50/20"
                  : "border-gray-100/40 bg-gray-50/20"
            }`}
          >
            <span className="text-sm">
              {gap.priority === "high" ? "🔴" : gap.priority === "medium" ? "🟡" : "⚪"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-medium text-gray-700">
                {gap.description}
              </p>
            </div>
            <button
              onClick={() => onStartExploration(gap.suggestedAxis)}
              className="shrink-0 rounded-lg bg-amber-400/70 px-2.5 py-1 text-[10px] font-medium text-white transition-colors hover:bg-amber-500/70"
            >
              探索
            </button>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
