"use client";

/**
 * StyleDuet
 * 5ラウンドの美的/ライフスタイル二択
 * 選択後、相手も完了したら重なりマップ表示
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";
import type { StyleDuetRound } from "@/lib/rendezvous/activityEngine";

type Props = {
  activityId: string;
  rounds: StyleDuetRound[];
  myChoices: string[] | null;
  theirChoices: string[] | null;
  revealed: boolean;
  overlapPercent: number | null;
  insightText: string | null;
  onSubmit: (choices: string[]) => void;
  onReveal: () => void;
};

const GRADIENT_A = "linear-gradient(135deg, #6366F1, #818CF8)";
const GRADIENT_B = "linear-gradient(135deg, #EC4899, #F472B6)";

export default function StyleDuet({
  rounds,
  myChoices,
  theirChoices,
  revealed,
  overlapPercent,
  insightText,
  onSubmit,
  onReveal,
}: Props) {
  const [currentRound, setCurrentRound] = useState(0);
  const [choices, setChoices] = useState<string[]>([]);

  const bothDone = myChoices !== null && theirChoices !== null;
  const inProgress = !myChoices && currentRound < rounds.length;
  const waitingForThem = myChoices !== null && !bothDone;

  function handleChoice(choice: string) {
    const next = [...choices, choice];
    setChoices(next);

    if (next.length >= rounds.length) {
      onSubmit(next);
    } else {
      setCurrentRound((r) => r + 1);
    }
  }

  return (
    <GlassCard variant="default" padding="md" hoverEffect={false}>
      {/* Header */}
      <div className="text-center mb-4">
        <span
          className="inline-block text-[10px] font-bold tracking-widest mb-1"
          style={{ color: "#F59E0B" }}
        >
          STYLE DUET
        </span>
        {inProgress && (
          <div className="text-[11px] text-slate-400">
            {currentRound + 1} / {rounds.length}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {inProgress && (
        <div className="mb-4 h-1 rounded-full bg-slate-100 overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ background: "linear-gradient(90deg, #F59E0B, #FBBF24)" }}
            animate={{ width: `${((currentRound) / rounds.length) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      {/* In Progress: Show current round */}
      <AnimatePresence mode="wait">
        {inProgress && rounds[currentRound] && (
          <motion.div
            key={rounds[currentRound].id}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3 }}
            className="flex gap-3"
          >
            <ChoiceButton
              label={rounds[currentRound].optionA.label}
              gradient={GRADIENT_A}
              borderColor="rgba(99,102,241,0.15)"
              onClick={() => handleChoice("A")}
            />
            <ChoiceButton
              label={rounds[currentRound].optionB.label}
              gradient={GRADIENT_B}
              borderColor="rgba(236,72,153,0.15)"
              onClick={() => handleChoice("B")}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress dots */}
      {inProgress && (
        <div className="flex justify-center gap-1.5 mt-4">
          {rounds.map((_, i) => (
            <div
              key={i}
              className="w-1.5 h-1.5 rounded-full transition-colors duration-300"
              style={{
                background:
                  i < currentRound
                    ? "#F59E0B"
                    : i === currentRound
                    ? "rgba(245,158,11,0.4)"
                    : "rgba(30,30,60,0.1)",
              }}
            />
          ))}
        </div>
      )}

      {/* Waiting for them */}
      {waitingForThem && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-5"
        >
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="text-3xl mb-2 inline-block"
          >
            &#x1F3B5;
          </motion.div>
          <p className="text-xs text-slate-400 font-semibold">
            相手の演奏を待っています...
          </p>
        </motion.div>
      )}

      {/* Both done, can reveal */}
      {bothDone && !revealed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-4"
        >
          <p className="text-sm font-semibold mb-3" style={{ color: "#F59E0B" }}>
            デュエット完了
          </p>
          <GlassButton
            variant="gradient"
            onClick={onReveal}
            style={{
              background: "linear-gradient(135deg, #F59E0B, #FBBF24)",
              boxShadow: "0 4px 16px rgba(245,158,11,0.3)",
            }}
          >
            ハーモニーを見る
          </GlassButton>
        </motion.div>
      )}

      {/* Revealed: Overlap Map */}
      {revealed && myChoices && theirChoices && (
        <FadeInView>
          {/* Per-round results */}
          <div className="mb-3.5">
            {rounds.map((round, i) => {
              const match = myChoices[i] === theirChoices[i];
              return (
                <div
                  key={round.id}
                  className="flex items-center gap-2 py-1.5"
                  style={{
                    borderBottom:
                      i < rounds.length - 1
                        ? "1px solid rgba(30,30,60,0.05)"
                        : "none",
                  }}
                >
                  <div
                    className="w-5 text-center text-xs"
                    style={{ color: match ? "#22C55E" : "rgba(30,30,60,0.2)" }}
                  >
                    {match ? "●" : "○"}
                  </div>
                  <div className="flex-1 text-xs text-slate-500">
                    {myChoices[i] === "A"
                      ? round.optionA.label
                      : round.optionB.label}
                  </div>
                  <div
                    className="text-[10px]"
                    style={{
                      color: match ? "#22C55E" : "rgba(30,30,60,0.25)",
                    }}
                  >
                    {match
                      ? "一致"
                      : theirChoices[i] === "A"
                      ? round.optionA.label
                      : round.optionB.label}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Overlap bar */}
          {overlapPercent !== null && (
            <div className="mb-3">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-slate-400">
                  オーバーラップ
                </span>
                <span
                  className="text-sm font-extrabold"
                  style={{
                    color: "#F59E0B",
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  }}
                >
                  {overlapPercent}%
                </span>
              </div>
              <div className="h-1 rounded-sm bg-slate-100 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${overlapPercent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full rounded-sm"
                  style={{
                    background: "linear-gradient(90deg, #F59E0B, #FBBF24)",
                  }}
                />
              </div>
            </div>
          )}

          {/* Insight */}
          {insightText && (
            <div
              className="p-3 rounded-xl border"
              style={{
                background:
                  "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(251,191,36,0.06))",
                borderColor: "rgba(245,158,11,0.08)",
              }}
            >
              <div className="text-[9px] font-bold text-slate-400 mb-1">
                HARMONY
              </div>
              <div className="text-xs text-slate-500 leading-relaxed">
                {insightText}
              </div>
            </div>
          )}
        </FadeInView>
      )}
    </GlassCard>
  );
}

function ChoiceButton({
  label,
  gradient,
  borderColor,
  onClick,
}: {
  label: string;
  gradient: string;
  borderColor: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      whileHover={{ scale: 1.02 }}
      onClick={onClick}
      className="flex-1 py-6 px-3 rounded-2xl border cursor-pointer text-center backdrop-blur-sm transition-shadow hover:shadow-lg"
      style={{
        borderColor,
        background: "rgba(255,255,255,0.9)",
      }}
    >
      <div
        className="text-sm font-bold leading-snug"
        style={{
          background: gradient,
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {label}
      </div>
    </motion.button>
  );
}
