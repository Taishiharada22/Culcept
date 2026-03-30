"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CORRECTION_OPTIONS,
  PHASE8_COPY,
} from "@/lib/origin/v7/deepFlowQuestions";
import type { CorrectionLevel } from "@/lib/origin/v7/types";

type Props = {
  /** 仮説テキスト（AI or テンプレート生成） */
  hypothesis: string;
  /** テンプレート生成か */
  isTemplate: boolean;
  onComplete: (result: {
    correctionLevel: CorrectionLevel;
    editedText: string | null;
    selectedOption: string;
  }) => void;
};

/** CORRECTION_OPTIONS の id → CorrectionLevel へのマッピング */
function toCorrectionLevel(optionId: string): CorrectionLevel {
  switch (optionId) {
    case "very_close":
      return "close";
    case "partly_close":
      return "slightly_off";
    case "different":
    case "close_but":
      return "wrong";
    default:
      return "slightly_off";
  }
}

export default function HypothesisCorrectionStep({
  hypothesis,
  isTemplate,
  onComplete,
}: Props) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [editedText, setEditedText] = useState<string | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const needsInput =
    selectedOption === "close_but" || selectedOption === "different";

  useEffect(() => {
    if (needsInput && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [needsInput]);

  const handleSubmit = useCallback(() => {
    if (!selectedOption) return;
    onComplete({
      correctionLevel: toCorrectionLevel(selectedOption),
      editedText: needsInput ? editedText : null,
      selectedOption,
    });
  }, [selectedOption, editedText, needsInput, onComplete]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ duration: 0.35 }}
      className="flex flex-col gap-5"
    >
      <div className="text-center">
        <p className="mb-1 text-sm text-gray-500">Phase 8</p>
        <h2 className="text-lg font-semibold text-gray-800">
          {PHASE8_COPY.heading}
        </h2>
        <p className="mt-1 text-xs text-gray-400">{PHASE8_COPY.sub}</p>
      </div>

      {/* 仮説テキスト */}
      <div className="rounded-2xl bg-white/80 backdrop-blur-md p-5 shadow-sm">
        <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-wrap">
          {hypothesis}
        </p>
      </div>

      <p className="text-center text-xs text-gray-400">
        {isTemplate
          ? "選択した断片をもとに仮説を描きました"
          : "これはあくまで推測です。合っているか教えてください"}
      </p>

      {/* 修正選択肢 */}
      <div className="flex flex-col gap-2">
        {CORRECTION_OPTIONS.map((opt) => {
          const isSelected = selectedOption === opt.id;
          return (
            <motion.button
              key={opt.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => setSelectedOption(opt.id)}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 text-left transition-all ${
                isSelected
                  ? "bg-amber-100/70 ring-1 ring-amber-300/40 shadow-sm"
                  : "bg-white/60 ring-1 ring-gray-200/30 hover:bg-white/80"
              }`}
            >
              <span className="text-base">{opt.icon}</span>
              <span className="text-xs text-gray-700">{opt.label}</span>
            </motion.button>
          );
        })}
      </div>

      {/* 修正テキスト入力 */}
      {needsInput && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="overflow-hidden"
        >
          <textarea
            ref={textAreaRef}
            value={editedText ?? ""}
            onChange={(e) => setEditedText(e.target.value)}
            placeholder="あなたの言葉で書いてください..."
            rows={3}
            className="w-full rounded-xl bg-white/70 px-4 py-3 text-sm text-gray-700 ring-1 ring-gray-200/40 placeholder:text-gray-300 focus:outline-none focus:ring-amber-300/50"
          />
        </motion.div>
      )}

      {/* 確定ボタン */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSubmit}
        disabled={!selectedOption || (needsInput && !editedText?.trim())}
        className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90 disabled:opacity-40"
      >
        この記憶を保存する
      </motion.button>
    </motion.div>
  );
}
