"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { OriginSnapshot, FormationChain, ResidueSummary, PressureRewardProfile } from "@/lib/origin/v7/formationReader";
import type { BehavioralLawsResult } from "@/lib/origin/v7/behavioralLaws";
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
  collapseGrowthInsights?: CollapseGrowthInsight[];
  contradictionResolutions?: ContradictionResolution[];
  onSaveCollapseGrowthInsight?: (insight: CollapseGrowthInsight) => void;
  onSaveContradictionResolution?: (resolution: ContradictionResolution) => void;
  onHighlightChapters?: (chapterIds: string[]) => void;
  onStartExploration?: (axis?: ExplorationAxis) => void;
};

/**
 * プログレッシブ・ディスクロージャー版 ReaderPanel
 * デフォルトでTop3のインサイトのみ表示し、「もっと見る」で展開
 */
export default function ReaderAccordion({
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
  const [expanded, setExpanded] = useState(false);

  // データが不十分な場合は非表示
  if (
    snapshot.dataCompleteness < 0.1 &&
    chains.length === 0 &&
    residueSummary.groups.length === 0
  ) {
    return null;
  }

  // 利用可能なセクションを集める
  const hasSnapshot = snapshot.sentences.length > 0;
  const hasChains = chains.length > 0;
  const hasResidue = residueSummary.groups.length > 0;
  const hasLaws = !!behavioralLaws;
  const hasEcho = echoTimeline && echoTimeline.trajectories.length > 0;
  const hasContradictions = behavioralLaws && behavioralLaws.contradictions.length > 0;

  // 展開可能な追加セクション数
  const extraSections = [hasResidue, hasLaws, hasEcho, hasContradictions].filter(Boolean).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="mb-6"
    >
      {/* ヘッダー */}
      <div className="mb-3 flex items-center gap-1.5 px-1">
        <span className="text-sm">📊</span>
        <h3 className="text-xs font-semibold text-amber-700/60">
          形成履歴の読み取り
        </h3>
      </div>

      {/* Top 3: Snapshot + Chains + PressureReward（常に表示） */}
      <div className="space-y-4">
        {hasSnapshot && <OriginSnapshotCard snapshot={snapshot} />}
        {hasChains && <FormationChainDisplay chains={chains} />}

        {(pressureReward.dominantPressures.length > 0 ||
          pressureReward.dominantRewards.length > 0) && (
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
      </div>

      {/* 展開セクション */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="mt-4 space-y-4"
          >
            {hasResidue && <ResidueSummaryPanel summary={residueSummary} />}

            {hasLaws && <BehavioralLawsPanel laws={behavioralLaws!} />}

            {hasLaws && onSaveCollapseGrowthInsight && (
              <CollapseGrowthPanel
                collapseConditions={behavioralLaws!.collapseConditions}
                growthConditions={behavioralLaws!.growthConditions}
                insights={collapseGrowthInsights ?? []}
                onSaveInsight={onSaveCollapseGrowthInsight}
              />
            )}

            {hasContradictions && onSaveContradictionResolution && (
              <ContradictionExplorer
                contradictions={behavioralLaws!.contradictions}
                resolutions={contradictionResolutions ?? []}
                onSaveResolution={onSaveContradictionResolution}
              />
            )}

            {hasEcho && (
              <EchoTraceView
                echoTimeline={echoTimeline!}
                onHighlightChapters={onHighlightChapters}
                onStartExploration={onStartExploration}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* もっと見るボタン */}
      {extraSections > 0 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-xl bg-amber-50/40 py-2 text-xs text-amber-600/70 transition-colors hover:bg-amber-50/60"
        >
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            ▼
          </motion.span>
          {expanded ? "閉じる" : `もっと見る（+${extraSections}）`}
        </button>
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
