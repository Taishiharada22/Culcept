"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { CoreObservationQuestion, CoreObservationAnswer } from "@/types/stargazer";
import ReasonChipLayer from "./core-layers/ReasonChipLayer";

interface Props {
  question: CoreObservationQuestion;
  onAnswer?: (answer: CoreObservationAnswer) => void;
  onComplete?: (answer: CoreObservationAnswer) => void;
  questionNumber?: number;
  totalQuestions?: number;
  isSubmitting?: boolean;
}

export default function CoreObservationFlow({
  question,
  onAnswer,
  onComplete,
  questionNumber,
  totalQuestions,
  isSubmitting,
}: Props) {
  const handleAnswer = onComplete ?? onAnswer ?? (() => {});
  const [partialAnswer, setPartialAnswer] = useState<{
    binaryChoice: "A" | "B" | null;
    binaryTimestamp: string | null;
  }>({ binaryChoice: null, binaryTimestamp: null });
  const [reasonChipId, setReasonChipId] = useState<string | null>(null);
  const startTime = useState(() => Date.now())[0];

  const handleBinaryChoice = useCallback((choice: "A" | "B") => {
    setPartialAnswer({ binaryChoice: choice, binaryTimestamp: new Date().toISOString() });
  }, []);

  const handleSubmit = useCallback(() => {
    if (!partialAnswer.binaryChoice || !partialAnswer.binaryTimestamp) return;
    handleAnswer({
      questionId: question.id,
      binaryChoice: partialAnswer.binaryChoice,
      binaryTimestamp: partialAnswer.binaryTimestamp,
      totalResponseTimeMs: Date.now() - startTime,
    });
    setPartialAnswer({ binaryChoice: null, binaryTimestamp: null });
    setReasonChipId(null);
  }, [partialAnswer, question.id, handleAnswer, startTime]);

  return (
    <div className="space-y-6">
      {/* Question */}
      <motion.div
        key={question.id}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="text-center"
      >
        {questionNumber != null && totalQuestions != null && (
          <p className="text-xs text-white/30 font-mono mb-2">
            {questionNumber}/{totalQuestions}
          </p>
        )}
        <h3 className="text-xl font-semibold text-white/90 leading-relaxed mb-6">
          {question.text}
        </h3>
      </motion.div>

      {/* Binary Choices */}
      <div className="grid grid-cols-2 gap-3">
        {(["A", "B"] as const).map((choice) => {
          const option = choice === "A" ? question.optionA : question.optionB;
          const isSelected = partialAnswer.binaryChoice === choice;
          return (
            <button
              key={choice}
              onClick={() => handleBinaryChoice(choice)}
              className={`p-4 rounded-xl border transition-all text-left ${
                isSelected
                  ? "bg-amber-500/15 border-amber-500/30 text-amber-200"
                  : "bg-white/[0.04] border-white/[0.08] text-white/60 hover:bg-white/[0.06]"
              }`}
            >
              <span className="text-2xl mb-2 block">{option?.emoji || (choice === "A" ? "🅰️" : "🅱️")}</span>
              <span className="text-sm font-medium block">{option?.label || `選択肢 ${choice}`}</span>
            </button>
          );
        })}
      </div>

      {/* Reason Chip Layer (shown after binary choice) */}
      <AnimatePresence>
        {partialAnswer.binaryChoice && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
          >
            <ReasonChipLayer
              accentColor={partialAnswer.binaryChoice === "A" ? "amber" : "amber"}
              onSelect={(chipId) => setReasonChipId(chipId)}
              selectedId={reasonChipId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit */}
      {partialAnswer.binaryChoice && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleSubmit}
          disabled={isSubmitting}
          className="w-full py-3 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-200 font-semibold text-sm hover:bg-amber-500/30 transition-colors disabled:opacity-50"
        >
          {isSubmitting ? "記録中..." : "これで決める"}
        </motion.button>
      )}
    </div>
  );
}
