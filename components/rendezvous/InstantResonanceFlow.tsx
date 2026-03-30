"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import {
  RESONANCE_CARDS,
  inferInitialVector,
  getAxisRevealMessage,
  type ResonanceResult,
  type ResonanceChoice,
} from "@/lib/rendezvous/instantResonance";

// ---------- Props ----------

type Props = {
  onComplete: (result: ResonanceResult) => void;
  onSkip?: () => void;
};

// ---------- Gradient presets for option cards ----------

const GRADIENT_A = "from-indigo-500/80 via-purple-500/70 to-pink-400/60";
const GRADIENT_B = "from-pink-500/80 via-rose-400/70 to-amber-400/60";

// ---------- Component ----------

export default function InstantResonanceFlow({ onComplete, onSkip }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [choices, setChoices] = useState<ResonanceChoice[]>([]);
  const [revealMessage, setRevealMessage] = useState<string | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [result, setResult] = useState<ResonanceResult | null>(null);
  const [direction, setDirection] = useState(0);

  const totalCards = RESONANCE_CARDS.length;
  const canSkip = choices.length >= 6;
  const currentCard = RESONANCE_CARDS[currentIndex];

  const handleChoice = useCallback(
    (selected: "a" | "b") => {
      const choice: ResonanceChoice = {
        cardId: currentCard.id,
        selected,
      };
      const newChoices = [...choices, choice];
      setChoices(newChoices);

      // Show axis reveal message
      const msg = getAxisRevealMessage(choice);
      setRevealMessage(msg);

      // After brief reveal, advance
      setTimeout(() => {
        setRevealMessage(null);
        if (currentIndex < totalCards - 1) {
          setDirection(1);
          setCurrentIndex((i) => i + 1);
        } else {
          // All cards done
          const res = inferInitialVector(newChoices);
          setResult(res);
          setShowResult(true);
        }
      }, 1200);
    },
    [currentCard, currentIndex, choices, totalCards],
  );

  const handleFinishEarly = useCallback(() => {
    const res = inferInitialVector(choices);
    setResult(res);
    setShowResult(true);
  }, [choices]);

  const handleComplete = useCallback(() => {
    if (result) onComplete(result);
  }, [result, onComplete]);

  // ---------- Result Screen ----------

  if (showResult && result) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950 p-4">
        <FadeInView>
          <GlassCard className="max-w-md w-full p-6 text-center space-y-6">
            <h2 className="text-2xl font-bold bg-gradient-to-r from-indigo-300 via-purple-300 to-pink-300 bg-clip-text text-transparent">
              あなたの共鳴パターン
            </h2>

            <p className="text-sm text-white/60">
              {result.discoveredAxes.length}つの軸が浮かび上がりました
            </p>

            <div className="space-y-4">
              {result.discoveredAxes.map((axis, i) => (
                <motion.div
                  key={axis.axis}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.3, duration: 0.5 }}
                  className="text-left"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-white/90 font-medium text-sm">
                      {axis.label}
                    </span>
                    <GlassBadge variant="info" size="sm">
                      確信度 {Math.round(axis.confidence * 100)}%
                    </GlassBadge>
                  </div>
                  <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-pink-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${axis.value * 100}%` }}
                      transition={{ delay: i * 0.3 + 0.2, duration: 0.8 }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>

            {!result.readyForMatching && (
              <p className="text-xs text-amber-300/80">
                あと{6 - choices.length}枚選ぶとマッチング精度が上がります
              </p>
            )}

            <div className="flex gap-3 pt-2">
              {!result.readyForMatching && currentIndex < totalCards - 1 && (
                <GlassButton
                  variant="ghost"
                  onClick={() => {
                    setShowResult(false);
                    setResult(null);
                    setDirection(1);
                    setCurrentIndex((i) => i + 1);
                  }}
                  className="flex-1"
                >
                  もっと知りたい
                </GlassButton>
              )}
              <GlassButton
                variant="primary"
                onClick={handleComplete}
                className="flex-1"
              >
                共鳴パターンを確定
              </GlassButton>
            </div>
          </GlassCard>
        </FadeInView>
      </div>
    );
  }

  // ---------- Card Selection Screen ----------

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-br from-indigo-950 via-purple-950 to-pink-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <p className="text-white/60 text-sm font-medium">
          Instant Resonance
        </p>
        {canSkip && (
          <button
            onClick={handleFinishEarly}
            className="text-white/40 text-sm hover:text-white/60 transition-colors"
          >
            スキップ
          </button>
        )}
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1.5 px-4 pb-4">
        {RESONANCE_CARDS.map((_, i) => (
          <div
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i < choices.length
                ? "w-4 bg-gradient-to-r from-indigo-400 to-pink-400"
                : i === currentIndex
                  ? "w-3 bg-white/50"
                  : "w-1.5 bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* Card area */}
      <div className="flex-1 flex items-center justify-center px-4 relative">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentCard.id}
            custom={direction}
            initial={{ opacity: 0, x: direction >= 0 ? 80 : -80, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: direction >= 0 ? -80 : 80, scale: 0.95 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="w-full max-w-md space-y-5"
          >
            {/* Question number */}
            <p className="text-center text-white/40 text-xs tracking-widest uppercase">
              {currentIndex + 1} / {totalCards}
            </p>

            {/* Option A */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => handleChoice("a")}
              className={`
                w-full rounded-2xl p-6 text-left
                bg-gradient-to-br ${GRADIENT_A}
                backdrop-blur-md border border-white/20
                shadow-lg shadow-indigo-500/10
                transition-transform active:scale-[0.97]
              `}
              disabled={revealMessage !== null}
            >
              <span className="text-3xl block mb-2">
                {currentCard.optionA.emoji}
              </span>
              <span className="text-white text-lg font-semibold">
                {currentCard.optionA.label}
              </span>
            </motion.button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/10" />
              <span className="text-white/30 text-xs">or</span>
              <div className="flex-1 h-px bg-white/10" />
            </div>

            {/* Option B */}
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => handleChoice("b")}
              className={`
                w-full rounded-2xl p-6 text-left
                bg-gradient-to-br ${GRADIENT_B}
                backdrop-blur-md border border-white/20
                shadow-lg shadow-pink-500/10
                transition-transform active:scale-[0.97]
              `}
              disabled={revealMessage !== null}
            >
              <span className="text-3xl block mb-2">
                {currentCard.optionB.emoji}
              </span>
              <span className="text-white text-lg font-semibold">
                {currentCard.optionB.label}
              </span>
            </motion.button>
          </motion.div>
        </AnimatePresence>

        {/* Axis reveal overlay */}
        <AnimatePresence>
          {revealMessage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
            >
              <div className="bg-black/60 backdrop-blur-sm rounded-2xl px-6 py-4">
                <p className="text-white/90 text-center text-sm font-medium tracking-wide">
                  {revealMessage}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Footer hint */}
      <div className="px-4 pb-6 text-center">
        <p className="text-white/30 text-xs">
          直感で選んでください。正解はありません。
        </p>
      </div>
    </div>
  );
}
