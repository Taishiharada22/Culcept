"use client";

import { useState } from "react";
import type {
  StarMap,
  ResolvedType,
  PersonalityProfile,
  InsightCardCollection,
} from "@/types/stargazer";
import SubTabBar, { type ResultSubTab } from "./SubTabBar";
import OverviewTab from "./OverviewTab";
import TraitsTab from "./TraitsTab";
import ContextTab from "./ContextTab";
import InsightsTab from "./InsightsTab";
import OrbitTab from "./OrbitTab";
import UnobservedTab from "./UnobservedTab";
import LockedOverlay from "../shared/LockedOverlay";
import JudgmentHub from "../../_components/JudgmentHub";

interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

interface ObservationStats {
  totalAnswered: number;
  avgResponseTimeMs: number;
  fastAnswerCount: number;
  slowAnswerCount: number;
  avgHesitation: number;
  phaseBreakdown?: { initial: number; daily: number; core: number };
}

interface Props {
  starMap: StarMap | null;
  resolvedType: ResolvedType | null;
  personalityProfile: PersonalityProfile | null;
  dimensionDetails: DimensionDetail[];
  observationStats: ObservationStats | null;
  insightCards: InsightCardCollection | null;
  archetypeInfo: {
    emoji: string;
    description: string;
    keywords: string[];
  } | null;
  hasStarMap: boolean;
  isLocked: boolean;
  remainingForResults?: number;
  periodFilter: string;
  onPeriodFilterChange: (p: string) => void;
}

// シミュレーションカードを表示するタブ（概要 + 文脈差のみ）
const TABS_WITH_SIMULATION: ResultSubTab[] = ["overview", "context"];

export default function ResultsView({
  starMap,
  resolvedType,
  personalityProfile,
  dimensionDetails,
  observationStats,
  insightCards,
  archetypeInfo,
  hasStarMap,
  isLocked,
  remainingForResults,
  periodFilter,
  onPeriodFilterChange,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<ResultSubTab>("overview");

  if (isLocked) {
    return (
      <div className="relative min-h-[400px]">
        <div className="pointer-events-none select-none filter blur-md opacity-40">
          <ResultPlaceholder />
        </div>
        <LockedOverlay />
      </div>
    );
  }

  if (!hasStarMap || !starMap) {
    return (
      <div className="card-hero flex flex-col items-center justify-center !py-16 text-center max-w-[720px] mx-auto">
        <div className="relative mb-6">
          <span className="text-5xl">🔭</span>
          <div className="absolute inset-[-20px] rounded-full bg-amber-400/5 blur-xl" />
        </div>
        <h3 className="font-display text-2xl font-semibold text-white/80 mb-2">
          {remainingForResults
            ? `あと ${remainingForResults}問 で概要が見られます`
            : "まだ結果がありません"}
        </h3>
        <p className="font-body text-base text-white/40 max-w-sm">
          観測タブで質問に答えると、あなたの人格分析が始まります
        </p>
      </div>
    );
  }

  const showSimulation = TABS_WITH_SIMULATION.includes(activeSubTab);

  return (
    <div className="space-y-8">
      {/* サブタブバー */}
      <SubTabBar activeTab={activeSubTab} onTabChange={setActiveSubTab} />

      {/* タブコンテンツ */}
      <div key={activeSubTab} className="tab-content-enter">
        {activeSubTab === "overview" && (
          <OverviewTab
            starMap={starMap}
            resolvedType={resolvedType}
            personalityProfile={personalityProfile}
            dimensionDetails={dimensionDetails}
            observationStats={observationStats}
            archetypeInfo={archetypeInfo}
            periodFilter={periodFilter}
            onPeriodFilterChange={onPeriodFilterChange}
          />
        )}
        {activeSubTab === "traits" && (
          <TraitsTab
            starMap={starMap}
            resolvedType={resolvedType}
            personalityProfile={personalityProfile}
            dimensionDetails={dimensionDetails}
            observationStats={observationStats}
            archetypeInfo={archetypeInfo}
          />
        )}
        {activeSubTab === "context" && (
          <ContextTab resolvedType={resolvedType} />
        )}
        {activeSubTab === "insights" && (
          <InsightsTab
            insightCards={insightCards}
            observationStats={observationStats}
          />
        )}
        {activeSubTab === "orbit" && <OrbitTab starMap={starMap} />}
        {activeSubTab === "unobserved" && (
          <UnobservedTab starMap={starMap} />
        )}
      </div>

      {/* シミュレーションカード — 概要と文脈差タブにだけ表示 */}
      {hasStarMap && showSimulation && (
        <div className="max-w-[720px] mx-auto">
          <JudgmentHub
            visible
            observationCount={observationStats?.totalAnswered}
          />
        </div>
      )}

      {/* フッター */}
      <div className="text-center py-8 max-w-[720px] mx-auto">
        <div className="h-px bg-gradient-to-r from-transparent via-white/[0.06] to-transparent mb-4" />
        <p className="font-body text-sm text-white/25 leading-relaxed">
          Stargazer は診断ではなく観測です。データが増えるほど、仮説の精度が上がります。
        </p>
      </div>
    </div>
  );
}

function ResultPlaceholder() {
  return (
    <div className="space-y-4 p-4">
      <div className="h-40 bg-white/[0.03] rounded-2xl" />
      <div className="h-32 bg-white/[0.03] rounded-2xl" />
      <div className="h-24 bg-white/[0.03] rounded-2xl" />
      <div className="h-24 bg-white/[0.03] rounded-2xl" />
    </div>
  );
}
