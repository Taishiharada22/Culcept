"use client";

import { motion } from "framer-motion";

interface SocialProofBadgeProps {
  /** Number of total genome users (can be a rough estimate) */
  totalUsers?: number;
  /** Percentile rank of this user's completeness */
  completenessPercentile?: number;
  /** Archetype label for community comparison */
  archetypeLabel?: string;
  archetypeSharePct?: number;
}

/**
 * SocialProofBadge — shows relative positioning and community context.
 * "You're in the top X%" / "N people share your archetype"
 */
export default function SocialProofBadge({
  totalUsers = 128,
  completenessPercentile,
  archetypeLabel,
  archetypeSharePct,
}: SocialProofBadgeProps) {
  return (
    <motion.div
      className="rounded-[24px] border border-white/85 bg-gradient-to-r from-violet-50/40 via-white/60 to-fuchsia-50/40 px-6 py-5 shadow-sm backdrop-blur-sm"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3, duration: 0.5 }}
      role="status"
      aria-label="コミュニティでの位置づけ"
    >
      <div className="flex flex-wrap items-center justify-center gap-4 text-sm">
        {/* Total users */}
        <div className="flex items-center gap-1.5 text-slate-500">
          <span className="text-base">👥</span>
          <span>
            <span className="font-bold text-slate-700">{totalUsers}</span>人が探索中
          </span>
        </div>

        {/* Completeness percentile */}
        {completenessPercentile != null && (
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="text-base">🏆</span>
            <span>
              上位 <span className="font-bold text-violet-600">{completenessPercentile}%</span>
            </span>
          </div>
        )}

        {/* Archetype community */}
        {archetypeLabel && archetypeSharePct != null && (
          <div className="flex items-center gap-1.5 text-slate-500">
            <span className="text-base">✦</span>
            <span>
              {archetypeLabel}は全体の
              <span className="font-bold text-fuchsia-600">{archetypeSharePct}%</span>
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
}
