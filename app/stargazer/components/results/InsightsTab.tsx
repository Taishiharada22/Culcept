"use client";

import { motion } from "framer-motion";
import type { InsightCardCollection } from "@/types/stargazer";
import InsightCardDisplay from "../../_components/InsightCardDisplay";
import EvidenceLine from "../shared/EvidenceLine";

interface ObservationStats {
  totalAnswered: number;
  avgResponseTimeMs: number;
  avgHesitation: number;
}

interface Props {
  insightCards: InsightCardCollection | null;
  observationStats: ObservationStats | null;
}

export default function InsightsTab({ insightCards, observationStats }: Props) {
  if (!insightCards || insightCards.cards.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-hero flex flex-col items-center justify-center !py-16 text-center"
      >
        <div className="relative mb-6">
          <span className="text-5xl">🔭</span>
          <div className="absolute inset-[-20px] rounded-full bg-amber-400/5 blur-xl" />
        </div>
        <h3 className="font-display text-2xl font-semibold text-white/80 mb-2">
          まだ洞察がありません
        </h3>
        <p className="font-body text-base text-white/40 max-w-sm mb-6">
          観測を続けると、あなたの傾向が洞察カードとして浮かび上がります
        </p>
        <button
          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 hover:border-amber-500/30 rounded-xl font-body text-sm font-semibold text-amber-300 transition-all duration-200"
        >
          <span>🔭</span>
          <span>観測を続ける</span>
        </button>
      </motion.div>
    );
  }

  const hesitationLabel =
    (observationStats?.avgHesitation ?? 0) >= 70
      ? "高"
      : (observationStats?.avgHesitation ?? 0) >= 40
        ? "中"
        : "低";
  const avgTime = observationStats?.avgResponseTimeMs
    ? `${(observationStats.avgResponseTimeMs / 1000).toFixed(1)}s`
    : undefined;

  return (
    <div className="space-y-6 max-w-[720px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <InsightCardDisplay collection={insightCards} />
      </motion.div>

      {observationStats && (
        <div className="flex justify-center">
          <EvidenceLine
            count={observationStats.totalAnswered}
            avgResponseTime={avgTime}
            hesitation={hesitationLabel}
          />
        </div>
      )}
    </div>
  );
}
