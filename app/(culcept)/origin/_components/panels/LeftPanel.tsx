"use client";

import { motion } from "framer-motion";
import type { CurrentPosition, MemoryChapter, ExplorationAxis } from "@/lib/origin/v7/types";
import type {
  RootProfile,
  EraAffiliation,
  ActivityEntry,
  TurningPoint,
  ResidueItem,
  RightPanelView,
} from "@/lib/origin/v7/workspaceTypes";
import type { LifeBackbone } from "@/lib/origin/v7/formationReader";
import type { WorkspaceEntrySuggestion } from "@/lib/origin/v7/assistedFill";
import type { SecondSelfPreviewResult, ContextualRendezvousVector, RelationshipDepthProfile } from "@/lib/origin/v7/secondSelfBridge";
import LifeBackboneTimeline from "../reader/LifeBackboneTimeline";
import WorkspaceEntrySuggestionOverlay from "../WorkspaceEntrySuggestionOverlay";
import SecondSelfPreview from "../SecondSelfPreview";
import DomainVectorComparison from "../DomainVectorComparison";
import RelationshipDepthCard from "../RelationshipDepthCard";
import ExcavationModule from "../ExcavationModule";

type Props = {
  rootProfile?: RootProfile;
  eraAffiliations: EraAffiliation[];
  residueBoard: ResidueItem[];
  currentPosition: CurrentPosition | null;
  chapters: MemoryChapter[];
  selectedChapter?: MemoryChapter | null;
  onEditRoot: () => void;
  onEditEra: (era: EraAffiliation) => void;
  onEditResidue: () => void;
  onStartExploration: (axis?: ExplorationAxis) => void;
  // New: Life Backbone
  backbone?: LifeBackbone;
  // New: Workspace entry suggestions
  entrySuggestions?: WorkspaceEntrySuggestion[];
  onAcceptSuggestedActivity?: (data: Partial<ActivityEntry>) => void;
  onAcceptSuggestedTurningPoint?: (data: Partial<TurningPoint>) => void;
  onAcceptSuggestedEra?: (data: Partial<EraAffiliation>) => void;
  onDismissSuggestion?: (index: number) => void;
  // v5: Second Self Preview
  secondSelfPreview?: SecondSelfPreviewResult;
  // v6: Domain comparison + Relationship depth
  onOpenVectorRefinement?: () => void;
};

export default function LeftPanel({
  rootProfile,
  eraAffiliations,
  residueBoard,
  currentPosition,
  chapters,
  selectedChapter,
  onEditRoot,
  onEditEra,
  onEditResidue,
  onStartExploration,
  backbone,
  entrySuggestions,
  onAcceptSuggestedActivity,
  onAcceptSuggestedTurningPoint,
  onAcceptSuggestedEra,
  onDismissSuggestion,
  secondSelfPreview,
  onOpenVectorRefinement,
}: Props) {
  const hasRoot = rootProfile && (rootProfile.birthplace || rootProfile.homeAtmosphere);
  const sortedEras = [...eraAffiliations].sort((a, b) => {
    const order: Record<string, number> = {
      early_childhood: 0, elementary: 1, middle_school: 2, high_school: 3,
      late_teens: 4, early_twenties: 5, mid_twenties: 6, thirties: 7,
      forties_plus: 8, special_period: 9,
    };
    return (order[a.period] ?? 99) - (order[b.period] ?? 99);
  });

  return (
    <div className="flex h-full flex-col gap-1 overflow-y-auto p-4">
      {/* Root Profile Section */}
      <section className="mb-2">
        <button
          onClick={onEditRoot}
          className="group w-full rounded-2xl border border-amber-200/40 bg-white/60 p-3.5 text-left backdrop-blur-sm transition-all hover:border-amber-300/60 hover:bg-white/80"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm">🏠</span>
            <h3 className="text-xs font-semibold text-gray-700">ルーツ</h3>
            {!hasRoot && (
              <span className="ml-auto text-[10px] text-amber-500">未入力</span>
            )}
          </div>
          {hasRoot ? (
            <div className="space-y-0.5">
              {rootProfile.birthplace && (
                <p className="text-xs text-gray-500">
                  出身: {rootProfile.birthplace}
                </p>
              )}
              {rootProfile.homeAtmosphere && (
                <p className="text-xs text-gray-500">
                  家庭: {rootProfile.homeAtmosphere}
                </p>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">
              出身地・育った環境を記録する
            </p>
          )}
        </button>
      </section>

      {/* History Skeleton Section */}
      <section className="mb-2">
        <div className="mb-2 flex items-center gap-2 px-1">
          <span className="text-sm">📖</span>
          <h3 className="text-xs font-semibold text-gray-700">時代骨格</h3>
        </div>
        {sortedEras.length > 0 ? (
          <div className="space-y-1.5">
            {sortedEras.map((era) => (
              <button
                key={era.id}
                onClick={() => onEditEra(era)}
                className="w-full rounded-xl border border-amber-100/40 bg-white/50 p-2.5 text-left transition-all hover:border-amber-200/60 hover:bg-white/70"
              >
                <p className="text-xs font-medium text-gray-700">
                  {era.period.replace(/_/g, " ")}
                </p>
                {era.school && (
                  <p className="mt-0.5 text-[11px] text-gray-400">{era.school}</p>
                )}
                {era.mainActivity && (
                  <p className="text-[11px] text-gray-400">{era.mainActivity}</p>
                )}
              </button>
            ))}
          </div>
        ) : (
          <p className="px-1 text-[11px] text-gray-400">
            各時代の学校・所属・活動を記録する
          </p>
        )}
      </section>

      {/* Life Backbone Timeline */}
      {backbone && <LifeBackboneTimeline backbone={backbone} />}

      {/* Residue Preview Section */}
      <section className="mb-2">
        <button
          onClick={onEditResidue}
          className="group w-full rounded-2xl border border-amber-200/40 bg-white/60 p-3.5 text-left backdrop-blur-sm transition-all hover:border-amber-300/60 hover:bg-white/80"
        >
          <div className="mb-1.5 flex items-center gap-2">
            <span className="text-sm">🔍</span>
            <h3 className="text-xs font-semibold text-gray-700">今に残るもの</h3>
          </div>
          {residueBoard.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {residueBoard.slice(0, 8).map((item) => (
                <span
                  key={item.id}
                  className="inline-block rounded-full bg-amber-50/80 px-2 py-0.5 text-[10px] text-amber-700"
                >
                  {item.label}
                </span>
              ))}
              {residueBoard.length > 8 && (
                <span className="text-[10px] text-gray-400">
                  +{residueBoard.length - 8}
                </span>
              )}
            </div>
          ) : (
            <p className="text-[11px] text-gray-400">
              行動パターン・対人の癖・誇り・傷・武器・守り方
            </p>
          )}
        </button>
      </section>

      {/* Workspace Entry Suggestions */}
      {entrySuggestions && entrySuggestions.length > 0 && onAcceptSuggestedActivity && onAcceptSuggestedTurningPoint && onAcceptSuggestedEra && onDismissSuggestion && (
        <WorkspaceEntrySuggestionOverlay
          suggestions={entrySuggestions}
          onAcceptActivity={onAcceptSuggestedActivity}
          onAcceptTurningPoint={onAcceptSuggestedTurningPoint}
          onAcceptEra={onAcceptSuggestedEra}
          onDismiss={onDismissSuggestion}
        />
      )}

      {/* Second Self Preview */}
      {secondSelfPreview && <SecondSelfPreview preview={secondSelfPreview} />}

      {/* Domain Vector Comparison */}
      {secondSelfPreview?.contextualVectors && secondSelfPreview.contextualVectors.length > 0 && (
        <DomainVectorComparison
          contextualVectors={secondSelfPreview.contextualVectors}
          baseVector={secondSelfPreview.rendezvousPreview}
        />
      )}

      {/* Relationship Depth Card */}
      {secondSelfPreview?.relationshipDepth && (
        <RelationshipDepthCard profile={secondSelfPreview.relationshipDepth} />
      )}

      {/* Vector Refinement trigger */}
      {secondSelfPreview && secondSelfPreview.rendezvousPreview.underivableDimensions.length > 0 && onOpenVectorRefinement && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onOpenVectorRefinement}
          className="w-full rounded-2xl border border-indigo-200/40 bg-indigo-50/30 p-3 text-left transition-all hover:border-indigo-300/50"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">🔬</span>
            <span className="text-xs font-medium text-indigo-600">
              ベクトル精錬
            </span>
            <span className="ml-auto rounded-full bg-indigo-100/50 px-2 py-0.5 text-[9px] text-indigo-500">
              {secondSelfPreview.rendezvousPreview.underivableDimensions.length}次元未導出
            </span>
          </div>
          <p className="mt-1 text-[10px] text-gray-400">
            質問に答えて分身の精度を上げる
          </p>
        </motion.button>
      )}

      {/* Excavation Module */}
      <div className="mt-auto pt-2">
        <ExcavationModule
          currentPosition={currentPosition}
          selectedChapter={selectedChapter ?? undefined}
          onStartExploration={onStartExploration}
        />
      </div>
    </div>
  );
}
