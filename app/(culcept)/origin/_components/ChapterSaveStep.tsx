"use client";

import { motion } from "framer-motion";
import { useCallback, useMemo } from "react";
import { getPeriodLabel } from "@/lib/origin/v7/periods";
import { getAtmosphereLabel } from "@/lib/origin/v7/atmosphereData";
import { getPerspectiveLabel } from "@/lib/origin/v7/perspectiveData";
import { getComparisonLabel } from "@/lib/origin/v7/comparisonData";
import { getTriggerLabel } from "@/lib/origin/v7/triggerData";
import type { DraftChapter, MeaningLayer } from "@/lib/origin/v7/types";

type Props = {
  draft: DraftChapter;
  onSave: (meaning: MeaningLayer) => void;
};

export default function ChapterSaveStep({ draft, onSave }: Props) {
  const periodLabel = draft.period ? getPeriodLabel(draft.period) : "";
  const atmosphereLabel = draft.atmosphere
    ? getAtmosphereLabel(draft.atmosphere)
    : "";
  const perspectiveLabel = draft.perspective
    ? getPerspectiveLabel(draft.perspective)
    : "";
  const comparisonLabel = draft.comparison
    ? getComparisonLabel(draft.comparison)
    : "";
  const triggerLabels = useMemo(
    () => draft.triggers.map(getTriggerLabel),
    [draft.triggers],
  );

  const finalText = useMemo(() => {
    if (draft.correction?.editedText) return draft.correction.editedText;
    return draft.aiNarrative?.narrative ?? "";
  }, [draft.correction, draft.aiNarrative]);

  const handleSave = useCallback(() => {
    if (!draft.aiNarrative || !draft.correction) return;
    const meaning: MeaningLayer = {
      aiNarrative: draft.aiNarrative,
      correction: draft.correction,
      finalText,
    };
    onSave(meaning);
  }, [draft.aiNarrative, draft.correction, finalText, onSave]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Step 8</p>
        <h2 className="text-lg font-semibold text-gray-800">
          この記憶を保存しますか？
        </h2>
      </div>

      {/* Summary card */}
      <div className="flex flex-col gap-4 rounded-2xl bg-white/80 backdrop-blur-md p-5 shadow-sm">
        {/* Title + Period */}
        <div>
          {draft.aiTitle && (
            <p className="mb-0.5 text-base font-semibold text-gray-800">
              {draft.aiTitle}
            </p>
          )}
          <p className="text-xs text-gray-500">{periodLabel}</p>
        </div>

        {/* Echoes */}
        {draft.aiEchoes && draft.aiEchoes.length > 0 && (
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              今に残るもの
            </p>
            <div className="flex flex-wrap gap-1.5">
              {draft.aiEchoes.map((echo, i) => (
                <span
                  key={i}
                  className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 ring-1 ring-amber-200/50"
                >
                  {echo}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Mood layer */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              空気感
            </p>
            <p className="text-xs text-gray-700">{atmosphereLabel}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              他人視点
            </p>
            <p className="text-xs text-gray-700">{perspectiveLabel}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              今との違い
            </p>
            <p className="text-xs text-gray-700">{comparisonLabel}</p>
          </div>
        </div>

        {/* Triggers */}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            記憶のトリガー
          </p>
          <div className="flex flex-wrap gap-1.5">
            {triggerLabels.map((label, i) => (
              <span
                key={i}
                className="rounded-full bg-amber-100/70 px-2.5 py-0.5 text-xs text-amber-800"
              >
                {label}
              </span>
            ))}
          </div>
        </div>

        {/* Final narrative */}
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            その頃のプロフィール
          </p>
          <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
            {finalText}
          </p>
        </div>
      </div>

      {/* Save button */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSave}
        className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
      >
        この記憶を保存する
      </motion.button>

      <p className="text-center text-[10px] text-gray-400">
        保存した記憶はいつでも追記・修正できます
      </p>
    </motion.div>
  );
}
