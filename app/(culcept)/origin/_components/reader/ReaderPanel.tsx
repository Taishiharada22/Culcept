"use client";

import { motion } from "framer-motion";
import { useState } from "react";
import type { OriginSnapshot, FormationChain, ResidueSummary, PressureRewardProfile } from "@/lib/origin/v7/formationReader";
import type { BehavioralLawsResult, CollapseCondition, GrowthCondition, Contradiction } from "@/lib/origin/v7/behavioralLaws";
import type { EchoTimelineResult } from "@/lib/origin/v7/echoTimeline";
import type { CollapseGrowthInsight, ContradictionResolution, ExplorationAxis } from "@/lib/origin/v7/types";
import OriginSnapshotCard from "./OriginSnapshotCard";
import FormationChainDisplay from "./FormationChainDisplay";
import ResidueSummaryPanel from "./ResidueSummaryPanel";
import BehavioralLawsPanel from "./BehavioralLawsPanel";
import CollapseGrowthPanel from "./CollapseGrowthPanel";
import ContradictionExplorer from "./ContradictionExplorer";
import EchoTraceView from "../EchoTraceView";

type Props = {
  snapshot: OriginSnapshot;
  chains: FormationChain[];
  residueSummary: ResidueSummary;
  pressureReward: PressureRewardProfile;
  behavioralLaws?: BehavioralLawsResult;
  echoTimeline?: EchoTimelineResult;
  // v6: Collapse/Growth + Contradiction + Echo
  collapseGrowthInsights?: CollapseGrowthInsight[];
  contradictionResolutions?: ContradictionResolution[];
  onSaveCollapseGrowthInsight?: (insight: CollapseGrowthInsight) => void;
  onSaveContradictionResolution?: (resolution: ContradictionResolution) => void;
  onHighlightChapters?: (chapterIds: string[]) => void;
  onStartExploration?: (axis?: ExplorationAxis) => void;
};

export default function ReaderPanel({
  snapshot,
  chains,
  residueSummary,
  pressureReward,
  behavioralLaws,
  echoTimeline,
  collapseGrowthInsights,
  contradictionResolutions,
  onSaveCollapseGrowthInsight,
  onSaveContradictionResolution,
  onHighlightChapters,
  onStartExploration,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // dataCompleteness < 0.1 → 非表示
  if (snapshot.dataCompleteness < 0.1 && chains.length === 0 && residueSummary.groups.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mb-4"
    >
      {/* Header with collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="mb-2 flex w-full items-center gap-1.5 px-1 text-left"
      >
        <span className="text-sm">📊</span>
        <h3 className="text-xs font-semibold text-amber-700/60">
          形成履歴の読み取り
        </h3>
        <motion.span
          animate={{ rotate: collapsed ? -90 : 0 }}
          className="ml-auto text-[10px] text-gray-400"
        >
          ▼
        </motion.span>
      </button>

      {!collapsed && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="space-y-3"
        >
          {/* Origin Snapshot */}
          {snapshot.sentences.length > 0 && (
            <OriginSnapshotCard snapshot={snapshot} />
          )}

          {/* Formation Chains */}
          {chains.length > 0 && (
            <FormationChainDisplay chains={chains} />
          )}

          {/* Pressure/Reward Summary (inline) */}
          {(pressureReward.dominantPressures.length > 0 || pressureReward.dominantRewards.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="flex gap-3"
            >
              {pressureReward.dominantPressures.length > 0 && (
                <div className="flex-1 rounded-xl border border-orange-100/40 bg-orange-50/30 p-3">
                  <p className="mb-1 text-[10px] font-semibold text-orange-500/70">
                    繰り返された圧力
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pressureReward.dominantPressures.map((p) => (
                      <span
                        key={p}
                        className="rounded-full bg-orange-100/50 px-2 py-0.5 text-[10px] text-orange-600/70"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {pressureReward.dominantRewards.length > 0 && (
                <div className="flex-1 rounded-xl border border-green-100/40 bg-green-50/30 p-3">
                  <p className="mb-1 text-[10px] font-semibold text-green-600/70">
                    求めた報酬
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {pressureReward.dominantRewards.map((r) => (
                      <span
                        key={r}
                        className="rounded-full bg-green-100/50 px-2 py-0.5 text-[10px] text-green-600/70"
                      >
                        {getRewardLabel(r)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Residue Summary */}
          {residueSummary.groups.length > 0 && (
            <ResidueSummaryPanel summary={residueSummary} />
          )}

          {/* Behavioral Laws (simplified: patterns + principles only) */}
          {behavioralLaws && (
            <BehavioralLawsPanel laws={behavioralLaws} />
          )}

          {/* Collapse/Growth Panel */}
          {behavioralLaws && onSaveCollapseGrowthInsight && (
            <CollapseGrowthPanel
              collapseConditions={behavioralLaws.collapseConditions}
              growthConditions={behavioralLaws.growthConditions}
              insights={collapseGrowthInsights ?? []}
              onSaveInsight={onSaveCollapseGrowthInsight}
            />
          )}

          {/* Contradiction Explorer */}
          {behavioralLaws && behavioralLaws.contradictions.length > 0 && onSaveContradictionResolution && (
            <ContradictionExplorer
              contradictions={behavioralLaws.contradictions}
              resolutions={contradictionResolutions ?? []}
              onSaveResolution={onSaveContradictionResolution}
            />
          )}

          {/* Echo Trace View */}
          {echoTimeline && echoTimeline.trajectories.length > 0 && (
            <EchoTraceView
              echoTimeline={echoTimeline}
              onHighlightChapters={onHighlightChapters}
              onStartExploration={onStartExploration}
            />
          )}
        </motion.div>
      )}
    </motion.div>
  );
}

function getRewardLabel(reward: string): string {
  const labels: Record<string, string> = {
    security: "安全",
    recognition: "承認",
    achievement: "達成",
    belonging: "居場所",
    freedom: "自由",
  };
  return labels[reward] ?? reward;
}
