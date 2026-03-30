"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import type {
  DraftChapter,
  ExplorationStep,
  MeaningLayer,
  MemoryChapter,
} from "@/lib/origin/v7/types";
import { STEP_ORDER, createEmptyDraft } from "@/lib/origin/v7/types";
import { saveDraft, saveChapter, clearDraft } from "@/lib/origin/v7/store";
import { inferStepFromDraft } from "@/lib/origin/v7/persistence";

import PeriodSelectionStep from "./PeriodSelectionStep";
import AtmosphereStep from "./AtmosphereStep";
import PerspectiveStep from "./PerspectiveStep";
import ComparisonStep from "./ComparisonStep";
import TriggerStep from "./TriggerStep";
import AIRecoveryStep from "./AIRecoveryStep";
import CorrectionStep from "./CorrectionStep";
import ChapterSaveStep from "./ChapterSaveStep";
import MemoryTransition from "./MemoryTransition";

type Props = {
  initialDraft: DraftChapter | null;
  onComplete: (chapter: MemoryChapter) => void | Promise<void>;
  onCancel: () => void;
  onStateChange?: (snapshot: {
    draft: DraftChapter;
    step: ExplorationStep;
    status: "in_progress" | "generating";
  }) => void;
};

type FlowPhase =
  | { type: "step"; step: ExplorationStep }
  | { type: "transition"; nextStep: ExplorationStep };

export default function MemoryExplorationFlow({
  initialDraft,
  onComplete,
  onCancel,
  onStateChange,
}: Props) {
  const [draft, setDraft] = useState<DraftChapter>(
    initialDraft ?? createEmptyDraft(),
  );
  const [phase, setPhase] = useState<FlowPhase>({
    type: "step",
    step: initialDraft ? inferStepFromDraft(initialDraft) : "period_selection",
  });

  const currentStepIndex =
    phase.type === "step"
      ? STEP_ORDER.indexOf(phase.step)
      : STEP_ORDER.indexOf(phase.nextStep);
  const currentStep = phase.type === "step" ? phase.step : phase.nextStep;

  useEffect(() => {
    if (!onStateChange) return;
    onStateChange({
      draft,
      step: currentStep,
      status:
        currentStep === "ai_recovery" && !draft.aiNarrative
          ? "generating"
          : "in_progress",
    });
  }, [currentStep, draft, onStateChange]);

  const advanceToStep = useCallback((nextStep: ExplorationStep) => {
    setPhase({ type: "transition", nextStep });
  }, []);

  const handleTransitionComplete = useCallback(() => {
    if (phase.type !== "transition") return;
    setPhase({ type: "step", step: phase.nextStep });
  }, [phase]);

  const handleStepComplete = useCallback(
    (update: Partial<DraftChapter>) => {
      const updated = { ...draft, ...update };
      setDraft(updated);
      saveDraft(updated);

      // Advance to next step
      const currentIdx = STEP_ORDER.indexOf(currentStep);
      if (currentIdx < STEP_ORDER.length - 1) {
        advanceToStep(STEP_ORDER[currentIdx + 1]);
      }
    },
    [advanceToStep, currentStep, draft],
  );

  const handleSave = useCallback(
    (meaning: MeaningLayer) => {
      try {
        const chapter = saveChapter(draft, meaning, {
          title: draft.aiTitle ?? undefined,
          echoes: draft.aiEchoes ?? undefined,
        });
        clearDraft();
        void onComplete(chapter);
      } catch (err) {
        console.error("[MemoryExplorationFlow] save failed:", err);
        alert("保存に失敗しました。もう一度お試しください。");
      }
    },
    [draft, onComplete],
  );

  const handleBack = useCallback(() => {
    const currentIdx = STEP_ORDER.indexOf(currentStep);
    if (currentIdx > 0) {
      setPhase({ type: "step", step: STEP_ORDER[currentIdx - 1] });
    } else {
      onCancel();
    }
  }, [currentStep, onCancel]);

  // Progress indicator
  const progress = ((currentStepIndex + 1) / STEP_ORDER.length) * 100;

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar: back + progress */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleBack}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-white/60 text-gray-500 hover:bg-white/80"
        >
          ←
        </button>
        <div className="flex-1">
          <div className="h-1.5 w-full rounded-full bg-gray-200/50 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-amber-400/70"
              animate={{ width: `${progress}%` }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
            />
          </div>
        </div>
        <span className="text-[10px] text-gray-400">
          {currentStepIndex + 1}/{STEP_ORDER.length}
        </span>
      </div>

      {/* Flow content */}
      <AnimatePresence mode="wait">
        {phase.type === "transition" && (
          <MemoryTransition
            key="transition"
            durationMs={800}
            onComplete={handleTransitionComplete}
          />
        )}

        {phase.type === "step" && phase.step === "period_selection" && (
          <PeriodSelectionStep
            key="period"
            draft={draft}
            onComplete={handleStepComplete}
          />
        )}

        {phase.type === "step" && phase.step === "atmosphere" && (
          <AtmosphereStep
            key="atmosphere"
            draft={draft}
            onComplete={handleStepComplete}
          />
        )}

        {phase.type === "step" && phase.step === "perspective" && (
          <PerspectiveStep
            key="perspective"
            draft={draft}
            onComplete={handleStepComplete}
          />
        )}

        {phase.type === "step" && phase.step === "comparison" && (
          <ComparisonStep
            key="comparison"
            draft={draft}
            onComplete={handleStepComplete}
          />
        )}

        {phase.type === "step" && phase.step === "triggers" && (
          <TriggerStep
            key="triggers"
            draft={draft}
            onComplete={handleStepComplete}
          />
        )}

        {phase.type === "step" && phase.step === "ai_recovery" && (
          <AIRecoveryStep
            key="ai_recovery"
            draft={draft}
            onComplete={handleStepComplete}
          />
        )}

        {phase.type === "step" && phase.step === "correction" && (
          <CorrectionStep
            key="correction"
            draft={draft}
            onComplete={handleStepComplete}
          />
        )}

        {phase.type === "step" && phase.step === "save" && (
          <ChapterSaveStep
            key="save"
            draft={draft}
            onSave={handleSave}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
