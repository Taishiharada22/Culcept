"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { Insight, InsightType, InsightTier } from "../_lib/types";
import InsightMicroFeedback from "./InsightMicroFeedback";

/* ── InsightType別カラー ── */
const INSIGHT_COLORS: Record<InsightType, { bg: string; border: string; iconBg: string }> = {
  color: { bg: "bg-pink-50/50", border: "border-pink-200/30", iconBg: "bg-pink-100/60" },
  persona: { bg: "bg-violet-50/50", border: "border-violet-200/30", iconBg: "bg-violet-100/60" },
  learning: { bg: "bg-emerald-50/50", border: "border-emerald-200/30", iconBg: "bg-emerald-100/60" },
  risk: { bg: "bg-amber-50/50", border: "border-amber-200/30", iconBg: "bg-amber-100/60" },
  rotation: { bg: "bg-blue-50/50", border: "border-blue-200/30", iconBg: "bg-blue-100/60" },
  contradiction: { bg: "bg-indigo-50/50", border: "border-indigo-200/30", iconBg: "bg-indigo-100/60" },
  seasonal_transition: { bg: "bg-orange-50/50", border: "border-orange-200/30", iconBg: "bg-orange-100/60" },
  temporal: { bg: "bg-cyan-50/50", border: "border-cyan-200/30", iconBg: "bg-cyan-100/60" },
  combo: { bg: "bg-rose-50/50", border: "border-rose-200/30", iconBg: "bg-rose-100/60" },
  material: { bg: "bg-teal-50/50", border: "border-teal-200/30", iconBg: "bg-teal-100/60" },
  aneurasync: { bg: "bg-purple-50/50", border: "border-purple-200/30", iconBg: "bg-purple-100/60" },
  impression: { bg: "bg-violet-50/60", border: "border-violet-300/40", iconBg: "bg-violet-100/70" },
  genome_relationship: { bg: "bg-fuchsia-50/50", border: "border-fuchsia-200/30", iconBg: "bg-fuchsia-100/60" },
};

/* ── Tier別ラベル ── */
const TIER_LABELS: Record<InsightTier, { label: string; color: string }> = {
  practical: { label: "実用", color: "text-gray-400" },
  "self-understanding": { label: "あなたの傾向", color: "text-violet-500" },
  impression: { label: "今日の場面", color: "text-indigo-500" },
};

function InsightCard({ insight, compact = false, date }: { insight: Insight; compact?: boolean; date?: string }) {
  const colors = INSIGHT_COLORS[insight.type] ?? INSIGHT_COLORS.learning;
  const tierInfo = TIER_LABELS[insight.tier];

  if (compact) {
    return (
      <div className={`flex items-center gap-1.5 rounded-lg ${colors.bg} border ${colors.border} px-2 py-1`}>
        <span className="text-xs">{insight.icon}</span>
        <p className="text-[9px] text-gray-600 truncate">{insight.text}</p>
      </div>
    );
  }

  // self-understanding / impression は特別なスタイル
  const isDeep = insight.tier === "self-understanding" || insight.tier === "impression";

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl backdrop-blur-sm p-2.5 ${
        isDeep
          ? "bg-gradient-to-r from-violet-50/60 to-indigo-50/40 border border-violet-200/40"
          : `${colors.bg} border ${colors.border}`
      }`}
    >
      <div className="flex items-start gap-2">
        <div className={`shrink-0 w-6 h-6 rounded-lg ${isDeep ? "bg-violet-100/70" : colors.iconBg} flex items-center justify-center`}>
          <span className="text-xs">{insight.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className={`text-[9px] font-bold uppercase tracking-wider ${isDeep ? tierInfo.color : "text-gray-400"}`}>
              {insight.label}
            </p>
            {isDeep && (
              <span className={`text-[7px] font-bold ${tierInfo.color} bg-white/50 rounded-full px-1.5 py-px`}>
                {tierInfo.label}
              </span>
            )}
          </div>
          <p className={`text-[10px] leading-relaxed ${isDeep ? "text-gray-800 font-medium" : "text-gray-700"}`}>
            {insight.text}
          </p>
          {date && <InsightMicroFeedback insight={insight} date={date} />}
        </div>
      </div>
    </motion.div>
  );
}

interface Props {
  insights: Insight[];
  compact?: boolean;
  maxVisible?: number;
  date?: string;
}

export default function InsightCards({ insights, compact = false, maxVisible = 3, date }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (insights.length === 0) return null;

  const visible = expanded ? insights : insights.slice(0, maxVisible);
  const hasMore = insights.length > maxVisible;

  return (
    <div className="space-y-1.5">
      <AnimatePresence mode="popLayout">
        {visible.map((insight, i) => (
          <InsightCard key={`${insight.type}-${i}`} insight={insight} compact={compact} date={date} />
        ))}
      </AnimatePresence>

      {hasMore && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-center text-[9px] text-gray-400 hover:text-gray-600 transition-colors py-1"
        >
          もっと見る（+{insights.length - maxVisible}）
        </button>
      )}
    </div>
  );
}

/* ── 1行ミニインサイト（代替提案用） ── */
export function MiniInsight({ insight }: { insight: Insight }) {
  return (
    <p className="text-[9px] text-gray-500 flex items-center gap-1">
      <span>{insight.icon}</span>
      <span className="truncate">{insight.text}</span>
    </p>
  );
}
