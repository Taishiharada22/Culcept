"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { StargazerQuestion, EnhancedDailyAnswer } from "@/types/stargazer";
import BinaryChoiceLayer from "./core-layers/BinaryChoiceLayer";
import SituationSwitchLayer from "./core-layers/SituationSwitchLayer";

interface Props {
  question: StargazerQuestion;
  onAnswer: (answer: EnhancedDailyAnswer) => void;
  questionIndex?: number;
  totalQuestions?: number;
  isSubmitting?: boolean;
}

export default function EnhancedObservationCard({
  question,
  onAnswer,
  questionIndex,
  totalQuestions,
  isSubmitting,
}: Props) {
  const [selectedChoice, setSelectedChoice] = useState<"A" | "B" | null>(null);
  const [situationId, setSituationId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0.5);
  const startRef = useRef(Date.now());
  const shownAtRef = useRef(new Date().toISOString());

  const handleSelect = useCallback((choice: "A" | "B") => {
    setSelectedChoice(choice);
  }, []);

  const handleSubmit = useCallback(() => {
    if (!selectedChoice) return;
    onAnswer({
      questionId: question.id,
      binaryChoice: selectedChoice,
      shownAt: shownAtRef.current,
      answeredAt: new Date().toISOString(),
      responseTimeMs: Date.now() - startRef.current,
      confidenceSelfReport: confidence,
      skipped: false,
    });
    // Reset for next question
    setSelectedChoice(null);
    setSituationId(null);
    startRef.current = Date.now();
    shownAtRef.current = new Date().toISOString();
  }, [selectedChoice, question.id, confidence, onAnswer]);

  const handleSkip = useCallback(() => {
    onAnswer({
      questionId: question.id,
      binaryChoice: "A",
      shownAt: shownAtRef.current,
      answeredAt: new Date().toISOString(),
      responseTimeMs: Date.now() - startRef.current,
      confidenceSelfReport: 0,
      skipped: true,
    });
    setSelectedChoice(null);
    setSituationId(null);
    startRef.current = Date.now();
    shownAtRef.current = new Date().toISOString();
  }, [question.id, onAnswer]);

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -16 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="card-hero"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <span className="text-xs font-mono text-white/30">
          {questionIndex != null && totalQuestions != null
            ? `${questionIndex + 1}/${totalQuestions}`
            : ""}
        </span>
        <span className="text-xs text-white/20">{question.category}</span>
      </div>

      {/* Question Text */}
      <h3 className="text-xl font-semibold text-white text-center mb-10 leading-relaxed">
        {question.text}
      </h3>

      {/* Binary Choice Layer */}
      <BinaryChoiceLayer
        optionA={question.optionA}
        optionB={question.optionB}
        selectedChoice={selectedChoice}
        onSelect={handleSelect}
      />

      {/* Situation Switch (after choice) */}
      <AnimatePresence>
        {selectedChoice && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-6"
          >
            <SituationSwitchLayer
              selectedId={situationId}
              onSelect={setSituationId}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="flex items-center gap-3 mt-8">
        <button
          onClick={handleSkip}
          disabled={isSubmitting}
          aria-label="この質問をスキップ"
          className="px-4 py-2.5 rounded-xl text-xs text-white/30 hover:text-white/50 transition-colors disabled:opacity-50"
        >
          スキップ
        </button>
        <motion.button
          onClick={handleSubmit}
          disabled={!selectedChoice || isSubmitting}
          aria-label="回答を送信"
          className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${
            selectedChoice && !isSubmitting
              ? "bg-amber-500/20 border border-amber-500/30 text-amber-200 hover:bg-amber-500/30"
              : "bg-white/[0.04] border border-white/[0.06] text-white/20 cursor-not-allowed"
          }`}
          whileHover={selectedChoice && !isSubmitting ? { scale: 1.03, boxShadow: "0 0 20px rgba(251,191,36,0.2)" } : {}}
          whileTap={selectedChoice && !isSubmitting ? { scale: 0.94 } : {}}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
        >
          {isSubmitting ? "記録中..." : "回答する"}
        </motion.button>
      </div>
    </motion.div>
  );
}
