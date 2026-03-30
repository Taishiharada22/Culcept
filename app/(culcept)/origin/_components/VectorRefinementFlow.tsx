"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";
import type { VectorRefinementResult } from "@/lib/origin/v7/vectorRefinement";
import type { TargetedPrompt } from "@/lib/origin/v7/vectorRefinementData";
import type { TargetedResponse } from "@/lib/origin/v7/types";
import type { RendezvousVectorPreview } from "@/lib/origin/v7/secondSelfBridge";

type Props = {
  refinementResult: VectorRefinementResult;
  currentVector: RendezvousVectorPreview;
  onSaveResponse: (response: TargetedResponse) => void;
  onClose?: () => void;
};

const CONFIDENCE_COLORS = {
  none: { text: "text-rose-500", bg: "bg-rose-50/40", border: "border-rose-200/50", label: "未導出" },
  low: { text: "text-amber-500", bg: "bg-amber-50/40", border: "border-amber-200/50", label: "低信頼" },
  medium: { text: "text-gray-400", bg: "bg-gray-50/30", border: "border-gray-200/40", label: "中信頼" },
};

export default function VectorRefinementFlow({
  refinementResult,
  currentVector,
  onSaveResponse,
  onClose,
}: Props) {
  const [activeDimension, setActiveDimension] = useState<string | null>(null);
  const [currentPromptIdx, setCurrentPromptIdx] = useState(0);
  const [answeredPrompts, setAnsweredPrompts] = useState<Set<string>>(new Set());

  const gaps = refinementResult.gaps;
  if (gaps.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-3 py-8 text-center"
      >
        <span className="text-2xl">✨</span>
        <p className="text-sm font-medium text-gray-700">
          すべての次元が導出済みです
        </p>
        <p className="text-[11px] text-gray-400">
          分身ベクトルが十分に構成されています
        </p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-2 rounded-full bg-indigo-50 px-4 py-1.5 text-[11px] font-medium text-indigo-600"
          >
            閉じる
          </button>
        )}
      </motion.div>
    );
  }

  const activeGap = gaps.find((g) => g.dimension === activeDimension);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-sm">🔬</span>
        <h3 className="text-xs font-semibold text-gray-700">ベクトル精錬</h3>
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] text-indigo-500">
          {gaps.length}次元を強化可能
        </span>
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto text-[10px] text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dimension chips */}
      <div className="flex flex-wrap gap-1.5">
        {gaps.map((gap) => {
          const colors = CONFIDENCE_COLORS[gap.confidence];
          const isActive = activeDimension === gap.dimension;
          const isAnswered = gap.explorationPrompts.every((p) =>
            answeredPrompts.has(p.id),
          );

          return (
            <motion.button
              key={gap.dimension}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                setActiveDimension(
                  isActive ? null : gap.dimension,
                );
                setCurrentPromptIdx(0);
              }}
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium transition-all ${
                isActive
                  ? `${colors.bg} ${colors.text} border ${colors.border}`
                  : isAnswered
                    ? "bg-emerald-50/40 text-emerald-500 border border-emerald-200/30"
                    : "bg-gray-50/50 text-gray-500 hover:bg-gray-100/50"
              }`}
            >
              {isAnswered ? "✓ " : ""}
              {gap.dimensionLabel}
              {!isAnswered && (
                <span className={`ml-1 text-[8px] ${colors.text}`}>
                  {colors.label}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Active dimension exploration */}
      <AnimatePresence mode="wait">
        {activeGap && (
          <DimensionExploration
            key={activeGap.dimension}
            gap={activeGap}
            currentPromptIdx={currentPromptIdx}
            answeredPrompts={answeredPrompts}
            onAnswer={(prompt, optionId, effect) => {
              const response: TargetedResponse = {
                promptId: prompt.id,
                dimension: prompt.targetDimension,
                selectedOptionId: optionId,
                dimensionEffect: effect,
                answeredAt: new Date().toISOString(),
              };
              onSaveResponse(response);
              setAnsweredPrompts((prev) => new Set([...prev, prompt.id]));

              // 次の質問へ
              const nextIdx = currentPromptIdx + 1;
              if (nextIdx < activeGap.explorationPrompts.length) {
                setCurrentPromptIdx(nextIdx);
              }
            }}
            onNext={() => {
              const nextIdx = currentPromptIdx + 1;
              if (nextIdx < activeGap.explorationPrompts.length) {
                setCurrentPromptIdx(nextIdx);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Vector update indicator */}
      {answeredPrompts.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-emerald-100/40 bg-emerald-50/20 px-3 py-2"
        >
          <p className="text-[10px] text-emerald-600">
            💡 {answeredPrompts.size}問の回答が分身ベクトルに反映されました
          </p>
          <p className="mt-0.5 text-[9px] text-gray-400">
            レーダーチャートがリアルタイムに更新されています
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ━━━ DimensionExploration ━━━ */

function DimensionExploration({
  gap,
  currentPromptIdx,
  answeredPrompts,
  onAnswer,
  onNext,
}: {
  gap: {
    dimension: string;
    dimensionLabel: string;
    currentValue: number;
    confidence: "none" | "low" | "medium";
    explorationPrompts: TargetedPrompt[];
  };
  currentPromptIdx: number;
  answeredPrompts: Set<string>;
  onAnswer: (prompt: TargetedPrompt, optionId: string, effect: number) => void;
  onNext: () => void;
}) {
  const prompt = gap.explorationPrompts[currentPromptIdx];
  if (!prompt) return null;

  const isAnswered = answeredPrompts.has(prompt.id);
  const totalPrompts = gap.explorationPrompts.length;
  const answeredCount = gap.explorationPrompts.filter((p) =>
    answeredPrompts.has(p.id),
  ).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-2xl border border-indigo-100/40 bg-white/40 p-4"
    >
      {/* Progress */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-[10px] font-medium text-indigo-500">
          {gap.dimensionLabel}
        </span>
        <div className="flex flex-1 gap-0.5">
          {gap.explorationPrompts.map((p, i) => (
            <div
              key={p.id}
              className={`h-1 flex-1 rounded-full transition-all ${
                answeredPrompts.has(p.id)
                  ? "bg-indigo-400"
                  : i === currentPromptIdx
                    ? "bg-indigo-200"
                    : "bg-gray-100"
              }`}
            />
          ))}
        </div>
        <span className="text-[9px] text-gray-400">
          {answeredCount}/{totalPrompts}
        </span>
      </div>

      {/* Question */}
      <p className="mb-3 text-[13px] font-medium text-gray-700">
        {prompt.question}
      </p>

      {/* Options */}
      <div className="space-y-1.5">
        {prompt.responseOptions.map((option) => (
          <OptionCard
            key={option.id}
            option={option}
            isAnswered={isAnswered}
            onSelect={() => {
              if (!isAnswered) {
                onAnswer(prompt, option.id, option.dimensionEffect);
              }
            }}
          />
        ))}
      </div>

      {/* Nav */}
      {isAnswered && currentPromptIdx < totalPrompts - 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 flex justify-end"
        >
          <button
            onClick={onNext}
            className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-medium text-indigo-600 hover:bg-indigo-100/80"
          >
            次の質問 →
          </button>
        </motion.div>
      )}

      {isAnswered && currentPromptIdx === totalPrompts - 1 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-3 text-center"
        >
          <p className="text-[10px] text-emerald-500">
            ✓ {gap.dimensionLabel} の精錬が完了しました
          </p>
        </motion.div>
      )}
    </motion.div>
  );
}

/* ━━━ OptionCard ━━━ */

function OptionCard({
  option,
  isAnswered,
  onSelect,
}: {
  option: { id: string; label: string; icon: string; dimensionEffect: number };
  isAnswered: boolean;
  onSelect: () => void;
}) {
  const [selected, setSelected] = useState(false);

  const handleSelect = useCallback(() => {
    if (isAnswered) return;
    setSelected(true);
    onSelect();
  }, [isAnswered, onSelect]);

  return (
    <motion.button
      whileTap={!isAnswered ? { scale: 0.97 } : undefined}
      onClick={handleSelect}
      className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all ${
        selected
          ? "border border-indigo-300/50 bg-indigo-50/50"
          : isAnswered
            ? "border border-transparent bg-gray-50/30 opacity-40"
            : "border border-gray-100/50 bg-white/30 hover:border-indigo-200/40 hover:bg-indigo-50/20"
      }`}
      disabled={isAnswered && !selected}
    >
      <span className="text-base">{option.icon}</span>
      <span
        className={`flex-1 text-[12px] ${
          selected
            ? "font-medium text-indigo-700"
            : "text-gray-600"
        }`}
      >
        {option.label}
      </span>
      {selected && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="text-[10px] text-indigo-400"
        >
          ✓
        </motion.span>
      )}
    </motion.button>
  );
}
