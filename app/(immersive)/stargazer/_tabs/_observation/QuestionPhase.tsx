"use client";

// QuestionPhase — 質問フローのオーケストレーター
// ConstellationProgress + QuestionCard + MicroRewardOverlay を統合
// Position Personality System で各質問に「表情」を付与
// 自動確定を廃止し、明示的「次へ →」ボタンで確定

import { useState, useCallback, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";
import ConstellationProgress from "./ConstellationProgress";
import QuestionCard from "./QuestionCard";
import MicroRewardOverlay from "./MicroRewardOverlay";
import { useHaptics } from "@/hooks/useHaptics";

// ── Types matching ServerDailyObservationTab ──

export type StepOption = {
  id: string;
  label: string;
  score?: number;
  delta?: number;
};

export type PlanStep =
  | {
      kind: "variant";
      key: string;
      label: string;
      prompt: string;
      note: string;
      options: StepOption[];
      variantId: string;
      axisId: TraitAxisKey;
      previousScore?: number;
      previousDate?: string;
      isReobservation?: boolean;
      uxHint?: string;
    }
  | {
      kind: "shadow_play";
      key: string;
      label: string;
      prompt: string;
      note: string;
      scenario: string;
      options: StepOption[];
      shadowPlayId: string;
      primaryAxis: TraitAxisKey;
      category: string;
    }
  | {
      kind: "delta";
      key: string;
      label: string;
      prompt: string;
      note: string;
      options: StepOption[];
      axisId: TraitAxisKey;
      previousScore: number;
      previousDate: string;
    }
  | {
      kind: "expansion";
      key: string;
      label: string;
      prompt: string;
      note: string;
      options: StepOption[];
      expansionQuestionId: string;
      axisId: TraitAxisKey;
    };

const STEP_LABEL_MAP: Record<string, string> = {
  "状態観測": "状態観測",
  "文脈観測": "文脈観測",
  "深層観測": "深層観測",
  "影絵観測": "影絵観測",
  "再観測": "再観測",
  "差分確認": "差分確認",
  "深掘り観測": "深掘り観測",
  "拡張観測": "拡張観測",
};

interface QuestionPhaseProps {
  steps: PlanStep[];
  currentIdx: number;
  onAnswer: (
    step: PlanStep,
    option: StepOption,
    responseTimeMs: number,
    optionClickLog: { optionId: string; timestamp: number }[]
  ) => void;
  onPause?: () => void;
  /** Signal collector callbacks */
  onOptionHover?: (questionKey: string, optionLabel: string) => void;
  onOptionHoverEnd?: (questionKey: string) => void;
  onAnswerChange?: (questionKey: string, fromLabel: string, toLabel: string) => void;
  onStartQuestion?: (questionKey: string) => void;
  /** 深度フェーズの色（QuestionCardの左端ラインに表示） */
  depthColor?: string;
}

export default function QuestionPhase({
  steps,
  currentIdx,
  onAnswer,
  onPause,
  onOptionHover,
  onOptionHoverEnd,
  onAnswerChange,
  onStartQuestion,
  depthColor,
}: QuestionPhaseProps) {
  const [selectedOption, setSelectedOption] = useState<StepOption | null>(null);
  const [showReward, setShowReward] = useState(false);
  const [showPauseBtn, setShowPauseBtn] = useState(false);
  const [lastResponseTime, setLastResponseTime] = useState(0);
  const [optionClickLog, setOptionClickLog] = useState<
    { optionId: string; timestamp: number }[]
  >([]);

  const questionStartRef = useRef(Date.now());
  const prevSelectedRef = useRef<string | null>(null);
  const pauseBtnTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const haptics = useHaptics();

  const currentStep = steps[currentIdx] ?? null;

  // Reset state on question change
  useEffect(() => {
    setSelectedOption(null);
    setShowPauseBtn(false);
    setOptionClickLog([]);
    prevSelectedRef.current = null;
    questionStartRef.current = Date.now();

    // Notify parent to start signal tracking
    if (currentStep) {
      onStartQuestion?.(currentStep.key);
    }

    // Show pause button after 2s delay
    pauseBtnTimerRef.current = setTimeout(
      () => setShowPauseBtn(true),
      2000
    );

    return () => {
      if (pauseBtnTimerRef.current) clearTimeout(pauseBtnTimerRef.current);
    };
  }, [currentIdx, currentStep, onStartQuestion]);

  const handleSelectOption = useCallback(
    (opt: StepOption) => {
      if (!currentStep) return;

      // Track answer changes
      if (
        prevSelectedRef.current &&
        prevSelectedRef.current !== opt.id
      ) {
        const prevLabel =
          currentStep.options.find(
            (o) => o.id === prevSelectedRef.current
          )?.label ?? "";
        onAnswerChange?.(currentStep.key, prevLabel, opt.label);
      }

      prevSelectedRef.current = opt.id;
      setSelectedOption(opt);
      setOptionClickLog((prev) => [
        ...prev,
        { optionId: opt.id, timestamp: Date.now() },
      ]);

      haptics.light();
    },
    [currentStep, haptics, onAnswerChange]
  );

  const handleConfirm = useCallback(() => {
    if (!currentStep || !selectedOption) return;

    const elapsed = Date.now() - questionStartRef.current;
    setLastResponseTime(elapsed);
    haptics.medium();

    // Show micro reward before advancing
    setShowReward(true);

    // The actual answer submission happens after the reward overlay
  }, [currentStep, selectedOption, haptics]);

  const handleRewardComplete = useCallback(() => {
    setShowReward(false);
    if (!currentStep || !selectedOption) return;

    const elapsed = lastResponseTime || Date.now() - questionStartRef.current;
    onAnswer(currentStep, selectedOption, elapsed, optionClickLog);
  }, [
    currentStep,
    selectedOption,
    lastResponseTime,
    optionClickLog,
    onAnswer,
  ]);

  if (!currentStep) return null;

  const stepLabel =
    STEP_LABEL_MAP[currentStep.label] ?? currentStep.label;

  return (
    <div className="space-y-4">
      {/* Screen reader announcement */}
      <div aria-live="polite" className="sr-only">
        観測 {currentIdx + 1} / {steps.length}: {currentStep.prompt}
      </div>

      {/* Constellation Progress */}
      <ConstellationProgress
        current={currentIdx}
        total={steps.length}
        className="mb-2"
      />

      {/* Counter */}
      <div className="flex items-center justify-between px-1">
        <span className="sg-text-micro" style={{ color: "rgba(170,150,90,0.45)" }}>
          {stepLabel}
        </span>
        <span
          className="font-mono-sg text-xs tabular-nums"
          style={{ color: "rgba(120,125,140,0.3)" }}
        >
          {currentIdx + 1}/{steps.length}
        </span>
      </div>

      {/* Question Card */}
      <AnimatePresence mode="wait">
        <QuestionCard
          questionKey={currentStep.key}
          position={currentIdx + 1}
          total={steps.length}
          stepLabel={stepLabel}
          prompt={currentStep.prompt}
          note={currentStep.note}
          scenario={
            currentStep.kind === "shadow_play"
              ? currentStep.scenario
              : undefined
          }
          uxHint={
            currentStep.kind === "variant"
              ? currentStep.uxHint
              : undefined
          }
          options={currentStep.options}
          selectedOption={selectedOption}
          onSelectOption={handleSelectOption}
          onConfirm={handleConfirm}
          isReobservation={
            currentStep.kind === "variant"
              ? currentStep.isReobservation
              : false
          }
          previousDate={
            currentStep.kind === "variant" || currentStep.kind === "delta"
              ? currentStep.previousDate
              : undefined
          }
          showPauseBtn={showPauseBtn && currentIdx > 0}
          onPause={onPause}
          depthColor={depthColor}
        />
      </AnimatePresence>

      {/* Micro Reward Overlay */}
      <MicroRewardOverlay
        show={showReward}
        onComplete={handleRewardComplete}
        responseTimeMs={lastResponseTime}
        position={currentIdx + 1}
        total={steps.length}
        currentAxisId={
          currentStep?.kind === "variant" || currentStep?.kind === "delta"
            ? currentStep.axisId
            : currentStep?.kind === "shadow_play"
              ? currentStep.primaryAxis
              : undefined
        }
      />
    </div>
  );
}
