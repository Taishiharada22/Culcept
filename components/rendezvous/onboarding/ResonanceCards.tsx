"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  RESONANCE_CARDS,
  inferInitialVector,
  getAxisRevealMessage,
  type ResonanceChoice,
  type ResonanceResult,
} from "@/lib/rendezvous/instantResonance";

type Props = {
  onComplete: (result: ResonanceResult) => void;
};

const TOTAL_CARDS = RESONANCE_CARDS.length; // 12
const MIN_CARDS_FOR_SKIP = 6;

export default function ResonanceCards({ onComplete }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [choices, setChoices] = useState<ResonanceChoice[]>([]);
  const [revealMessage, setRevealMessage] = useState<string | null>(null);
  const [showReveal, setShowReveal] = useState(false);

  const card = RESONANCE_CARDS[currentIndex];
  const canSkip = choices.length >= MIN_CARDS_FOR_SKIP;
  const isFinished = currentIndex >= TOTAL_CARDS;

  const handleSelect = useCallback(
    (selected: "a" | "b") => {
      if (!card) return;

      const choice: ResonanceChoice = { cardId: card.id, selected };
      const newChoices = [...choices, choice];
      setChoices(newChoices);

      // Show axis reveal
      const msg = getAxisRevealMessage(choice);
      if (msg) {
        setRevealMessage(msg);
        setShowReveal(true);

        setTimeout(() => {
          setShowReveal(false);
          setTimeout(() => {
            if (currentIndex + 1 >= TOTAL_CARDS) {
              onComplete(inferInitialVector(newChoices));
            } else {
              setCurrentIndex((i) => i + 1);
            }
          }, 150);
        }, 1000);
      } else {
        if (currentIndex + 1 >= TOTAL_CARDS) {
          onComplete(inferInitialVector(newChoices));
        } else {
          setCurrentIndex((i) => i + 1);
        }
      }
    },
    [card, choices, currentIndex, onComplete],
  );

  const handleSkip = useCallback(() => {
    onComplete(inferInitialVector(choices));
  }, [choices, onComplete]);

  if (isFinished) return null;

  return (
    <div className="relative flex flex-col items-center min-h-[100dvh] px-5 pt-12 pb-8">
      {/* Progress dots */}
      <div className="flex items-center gap-2 mb-10">
        {Array.from({ length: TOTAL_CARDS }).map((_, i) => (
          <motion.div
            key={i}
            className="rounded-full"
            animate={{
              width: i === currentIndex ? 20 : 6,
              height: 6,
              backgroundColor:
                i < currentIndex
                  ? "rgba(139,92,246,0.8)"
                  : i === currentIndex
                    ? "rgba(139,92,246,1)"
                    : "rgba(139,92,246,0.15)",
            }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          />
        ))}
      </div>

      {/* Axis reveal overlay */}
      <AnimatePresence>
        {showReveal && revealMessage && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 20 }}
              animate={{ y: 0 }}
              className="bg-white/90 backdrop-blur-2xl rounded-3xl px-8 py-6 shadow-2xl border border-white/80 max-w-xs text-center"
            >
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 2, ease: "linear" }}
                className="text-3xl mb-3 inline-block"
              >
                ✨
              </motion.div>
              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                {revealMessage}
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Card */}
      <AnimatePresence mode="wait">
        {card && (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, scale: 0.9, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -30 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="w-full max-w-sm"
          >
            <p className="text-center text-xs font-medium text-slate-400 mb-6">
              どちらに惹かれますか？
            </p>

            <div className="flex flex-col gap-4">
              {/* Option A */}
              <motion.button
                onClick={() => handleSelect("a")}
                className="relative w-full rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 shadow-lg p-6 text-left overflow-hidden group"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 to-pink-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-4">
                  <span className="text-4xl">{card.optionA.emoji}</span>
                  <span className="text-lg font-bold text-slate-800">
                    {card.optionA.label}
                  </span>
                </div>
              </motion.button>

              {/* VS indicator */}
              <div className="flex items-center justify-center">
                <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                  <span className="text-xs font-bold text-slate-400">or</span>
                </div>
              </div>

              {/* Option B */}
              <motion.button
                onClick={() => handleSelect("b")}
                className="relative w-full rounded-3xl bg-white/80 backdrop-blur-xl border border-white/90 shadow-lg p-6 text-left overflow-hidden group"
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              >
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-blue-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="relative flex items-center gap-4">
                  <span className="text-4xl">{card.optionB.emoji}</span>
                  <span className="text-lg font-bold text-slate-800">
                    {card.optionB.label}
                  </span>
                </div>
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skip button */}
      {canSkip && (
        <motion.button
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={handleSkip}
          className="mt-8 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
        >
          スキップして進む →
        </motion.button>
      )}
    </div>
  );
}
