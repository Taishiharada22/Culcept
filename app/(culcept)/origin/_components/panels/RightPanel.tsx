"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { MemoryChapter, ExplorationAxis, TargetedResponse } from "@/lib/origin/v7/types";
import type {
  RightPanelView,
  RootProfile,
  EraAffiliation,
  ActivityEntry,
  TurningPoint,
  ResidueItem,
} from "@/lib/origin/v7/workspaceTypes";
import type { FrameSuggestion, ResidueSuggestion } from "@/lib/origin/v7/assistedFill";
import type { VectorRefinementResult } from "@/lib/origin/v7/vectorRefinement";
import type { RendezvousVectorPreview } from "@/lib/origin/v7/secondSelfBridge";
import FragmentDetailCard from "../FragmentDetailCard";
import RootProfileEditor from "../right/RootProfileEditor";
import EraAffiliationEditor from "../right/EraAffiliationEditor";
import ActivityEditor from "../right/ActivityEditor";
import TurningPointEditor from "../right/TurningPointEditor";
import ResidueBoardEditor from "../right/ResidueBoardEditor";
import VectorRefinementFlow from "../VectorRefinementFlow";

type Props = {
  view: RightPanelView;
  selectedChapter: MemoryChapter | null;
  onDeepDive: (chapter: MemoryChapter, axis: ExplorationAxis) => void;
  onCloseDetail: () => void;
  // Root Profile
  rootProfile?: RootProfile;
  onSaveRootProfile?: (profile: RootProfile) => void;
  // Era Affiliation
  selectedEra?: EraAffiliation | null;
  onSaveEra?: (era: EraAffiliation) => void;
  onDeleteEra?: (id: string) => void;
  // Activity
  selectedActivity?: ActivityEntry | null;
  onSaveActivity?: (activity: ActivityEntry) => void;
  onDeleteActivity?: (id: string) => void;
  // Turning Point
  selectedTurningPoint?: TurningPoint | null;
  onSaveTurningPoint?: (tp: TurningPoint) => void;
  onDeleteTurningPoint?: (id: string) => void;
  // Residue
  residueItems?: ResidueItem[];
  onSaveResidueItem?: (item: ResidueItem) => void;
  onDeleteResidueItem?: (id: string) => void;
  // Generic close
  onCloseEditor?: () => void;
  // Suggestions
  activityFrameSuggestions?: FrameSuggestion[];
  turningPointFrameSuggestions?: FrameSuggestion[];
  residueSuggestions?: ResidueSuggestion[];
  // Vector Refinement
  vectorRefinementResult?: VectorRefinementResult;
  currentVector?: RendezvousVectorPreview;
  onSaveTargetedResponse?: (response: TargetedResponse) => void;
};

export default function RightPanel({
  view,
  selectedChapter,
  onDeepDive,
  onCloseDetail,
  rootProfile,
  onSaveRootProfile,
  selectedEra,
  onSaveEra,
  onDeleteEra,
  selectedActivity,
  onSaveActivity,
  onDeleteActivity,
  selectedTurningPoint,
  onSaveTurningPoint,
  onDeleteTurningPoint,
  residueItems,
  onSaveResidueItem,
  onDeleteResidueItem,
  onCloseEditor,
  activityFrameSuggestions,
  turningPointFrameSuggestions,
  residueSuggestions,
  vectorRefinementResult,
  currentVector,
  onSaveTargetedResponse,
}: Props) {
  const handleClose = onCloseEditor ?? onCloseDetail;

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <AnimatePresence mode="wait">
        {view === "empty" && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"
          >
            <span className="text-3xl opacity-30">📝</span>
            <p className="text-sm text-gray-400">
              タイムラインの断片を選ぶか、
              <br />
              左の項目を選んで編集できます
            </p>
          </motion.div>
        )}

        {view === "detail" && selectedChapter && (
          <motion.div
            key={`detail-${selectedChapter.id}`}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-4"
          >
            <FragmentDetailCard
              chapter={selectedChapter}
              onDeepDive={(axis) => onDeepDive(selectedChapter, axis)}
              onClose={onCloseDetail}
            />
          </motion.div>
        )}

        {view === "root_edit" && onSaveRootProfile && (
          <motion.div
            key="root_edit"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-4"
          >
            <RootProfileEditor
              profile={rootProfile}
              onSave={onSaveRootProfile}
              onClose={handleClose}
            />
          </motion.div>
        )}

        {view === "era_edit" && onSaveEra && (
          <motion.div
            key="era_edit"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-4"
          >
            <EraAffiliationEditor
              era={selectedEra ?? null}
              onSave={onSaveEra}
              onDelete={onDeleteEra}
              onClose={handleClose}
            />
          </motion.div>
        )}

        {view === "activity_edit" && onSaveActivity && (
          <motion.div
            key="activity_edit"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-4"
          >
            <ActivityEditor
              activity={selectedActivity ?? null}
              onSave={onSaveActivity}
              onDelete={onDeleteActivity}
              onClose={handleClose}
              frameSuggestions={activityFrameSuggestions}
            />
          </motion.div>
        )}

        {view === "turning_point_edit" && onSaveTurningPoint && (
          <motion.div
            key="turning_point_edit"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-4"
          >
            <TurningPointEditor
              turningPoint={selectedTurningPoint ?? null}
              onSave={onSaveTurningPoint}
              onDelete={onDeleteTurningPoint}
              onClose={handleClose}
              frameSuggestions={turningPointFrameSuggestions}
            />
          </motion.div>
        )}

        {view === "residue_edit" && onSaveResidueItem && onDeleteResidueItem && (
          <motion.div
            key="residue_edit"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-4"
          >
            <ResidueBoardEditor
              items={residueItems ?? []}
              onSave={onSaveResidueItem}
              onDelete={onDeleteResidueItem}
              onClose={handleClose}
              residueSuggestions={residueSuggestions}
            />
          </motion.div>
        )}

        {view === "vector_refinement" && vectorRefinementResult && currentVector && onSaveTargetedResponse && (
          <motion.div
            key="vector_refinement"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="p-4"
          >
            <VectorRefinementFlow
              refinementResult={vectorRefinementResult}
              currentVector={currentVector}
              onSaveResponse={onSaveTargetedResponse}
              onClose={handleClose}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
