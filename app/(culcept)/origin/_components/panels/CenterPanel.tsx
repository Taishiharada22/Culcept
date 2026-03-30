"use client";

import type {
  MemoryChapter,
  CurrentPosition,
  ExplorationAxis,
} from "@/lib/origin/v7/types";
import type { ActivityEntry, TurningPoint, EraAffiliation } from "@/lib/origin/v7/workspaceTypes";
import type {
  OriginSnapshot,
  FormationChain,
  ResidueSummary,
  PressureRewardProfile,
} from "@/lib/origin/v7/formationReader";
import type { BehavioralLawsResult } from "@/lib/origin/v7/behavioralLaws";
import type { EchoTimelineResult } from "@/lib/origin/v7/echoTimeline";
import type { ExplorationRecommendation } from "@/lib/origin/v7/observationGaps";
import type { CollapseGrowthInsight, ContradictionResolution } from "@/lib/origin/v7/types";
import OriginHeader from "../OriginHeader";
import PresentSummary from "../PresentSummary";
import ReaderPanel from "../reader/ReaderPanel";
import ReaderAccordion from "../reader/ReaderAccordion";
import LifeNarrative from "../LifeNarrative";
import ObservationGapPanel from "../ObservationGapPanel";

type Props = {
  chapters: MemoryChapter[];
  currentPosition: CurrentPosition | null;
  activities: ActivityEntry[];
  turningPoints: TurningPoint[];
  eraAffiliations?: EraAffiliation[];
  selectedChapterId?: string | null;
  onStartExploration: (axis?: ExplorationAxis) => void;
  onDeepDiveChapter: (chapter: MemoryChapter, axis: ExplorationAxis) => void;
  onSelectChapter?: (chapter: MemoryChapter) => void;
  onSelectActivity: (activity: ActivityEntry) => void;
  onSelectTurningPoint: (tp: TurningPoint) => void;
  // Reader Layer
  snapshot?: OriginSnapshot;
  chains?: FormationChain[];
  residueSummary?: ResidueSummary;
  pressureReward?: PressureRewardProfile;
  // v5: Behavioral Laws + Echo Timeline + Observation Gaps
  behavioralLaws?: BehavioralLawsResult;
  echoTimeline?: EchoTimelineResult;
  observationGaps?: ExplorationRecommendation;
  // v6: Collapse/Growth + Contradiction
  collapseGrowthInsights?: CollapseGrowthInsight[];
  contradictionResolutions?: ContradictionResolution[];
  onSaveCollapseGrowthInsight?: (insight: CollapseGrowthInsight) => void;
  onSaveContradictionResolution?: (resolution: ContradictionResolution) => void;
  /** trueの場合、ReaderPanelの代わりにReaderAccordion(Top3+展開)を使う */
  compact?: boolean;
};

export default function CenterPanel({
  chapters,
  currentPosition,
  activities,
  turningPoints,
  eraAffiliations,
  selectedChapterId,
  onStartExploration,
  onDeepDiveChapter,
  onSelectChapter,
  onSelectActivity,
  onSelectTurningPoint,
  snapshot,
  chains,
  residueSummary,
  pressureReward,
  behavioralLaws,
  echoTimeline,
  observationGaps,
  collapseGrowthInsights,
  contradictionResolutions,
  onSaveCollapseGrowthInsight,
  onSaveContradictionResolution,
  compact = false,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-lg px-4 py-6">
        {/* Header — desktop only (mobile shows in left panel or inline) */}
        <div className="mb-4 hidden lg:block">
          <OriginHeader chapterCount={chapters.length} />
        </div>

        {/* Reader Panel — データがあれば表示 */}
        {snapshot && chains && residueSummary && pressureReward && (
          compact ? (
            <ReaderAccordion
              snapshot={snapshot}
              chains={chains}
              residueSummary={residueSummary}
              pressureReward={pressureReward}
              behavioralLaws={behavioralLaws}
              echoTimeline={echoTimeline}
              collapseGrowthInsights={collapseGrowthInsights}
              contradictionResolutions={contradictionResolutions}
              onSaveCollapseGrowthInsight={onSaveCollapseGrowthInsight}
              onSaveContradictionResolution={onSaveContradictionResolution}
              onStartExploration={onStartExploration}
            />
          ) : (
            <ReaderPanel
              snapshot={snapshot}
              chains={chains}
              residueSummary={residueSummary}
              pressureReward={pressureReward}
              behavioralLaws={behavioralLaws}
              echoTimeline={echoTimeline}
              collapseGrowthInsights={collapseGrowthInsights}
              contradictionResolutions={contradictionResolutions}
              onSaveCollapseGrowthInsight={onSaveCollapseGrowthInsight}
              onSaveContradictionResolution={onSaveContradictionResolution}
              onStartExploration={onStartExploration}
            />
          )
        )}

        {/* Present Summary */}
        {currentPosition && (
          <div className="mb-4">
            <PresentSummary
              currentPosition={currentPosition}
              chapters={chapters}
            />
          </div>
        )}

        {/* Life Narrative — 統合タイムライン */}
        <LifeNarrative
          chapters={chapters}
          activities={activities}
          turningPoints={turningPoints}
          eraAffiliations={eraAffiliations}
          currentPosition={currentPosition}
          selectedChapterId={selectedChapterId}
          gaps={observationGaps?.gaps}
          echoTimeline={echoTimeline}
          onStartExploration={onStartExploration}
          onDeepDiveChapter={onDeepDiveChapter}
          onSelectChapter={onSelectChapter}
          onSelectActivity={onSelectActivity}
          onSelectTurningPoint={onSelectTurningPoint}
        />

        {/* Observation Gap Panel */}
        {observationGaps && (
          <ObservationGapPanel
            recommendation={observationGaps}
            onStartExploration={onStartExploration}
          />
        )}
      </div>
    </div>
  );
}
