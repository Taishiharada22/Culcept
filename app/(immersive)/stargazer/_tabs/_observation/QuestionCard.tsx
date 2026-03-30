"use client";

// QuestionCard — ポジション別ビジュアル処理
// Q1: card-hero-star + FIRST SIGNAL（第一印象の特別感）
// Q2-Q4: card-instrument（ビルドアップ）
// Q5-Q6: card-hero-peak（ピークモーメント）
// Q7: card-instrument（減速）
// Q最終: card-hero-star + FINAL SIGNAL（締めの特別感）
// Serial Position Effect + Peak-End Rule

import { motion } from "framer-motion";

type PositionPersonality = {
  cardClass: string;
  textSize: string;
  label: string | null;
  transition: {
    initial: Record<string, number>;
    animate: Record<string, number>;
    duration: number;
  };
};

function getPositionPersonality(
  position: number, // 1-based
  total: number
): PositionPersonality {
  const isFirst = position === 1;
  const isLast = position === total;
  const peakStart = Math.floor(total * 0.55) + 1;
  const peakEnd = Math.floor(total * 0.75) + 1;
  const isPeak = position >= peakStart && position <= peakEnd && total > 4;

  if (isFirst) {
    return {
      cardClass: "card-hero-star",
      textSize: "text-[1.5rem]",
      label: "FIRST SIGNAL",
      transition: {
        initial: { opacity: 0, y: 30 },
        animate: { opacity: 1, y: 0 },
        duration: 0.13,
      },
    };
  }

  if (isLast) {
    return {
      cardClass: "card-hero-star",
      textSize: "text-[1.4rem]",
      label: "FINAL SIGNAL",
      transition: {
        initial: { opacity: 0, scale: 1.05 },
        animate: { opacity: 1, scale: 1 },
        duration: 0.13,
      },
    };
  }

  if (isPeak) {
    return {
      cardClass: "card-hero-peak",
      textSize: "text-[1.4rem]",
      label: null,
      transition: {
        initial: { opacity: 0, scale: 0.92 },
        animate: { opacity: 1, scale: 1 },
        duration: 0.15,
      },
    };
  }

  // Wind-down (last 2 before final, but not peak)
  if (position >= total - 1) {
    return {
      cardClass: "card-instrument",
      textSize: "text-[1.15rem]",
      label: null,
      transition: {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        duration: 0.15,
      },
    };
  }

  // Build phase — alternate slide directions
  const slideDirection = position % 2 === 0 ? 30 : -30;
  return {
    cardClass: "card-instrument",
    textSize: "text-[1.25rem]",
    label: null,
    transition: {
      initial: { opacity: 0, x: slideDirection },
      animate: { opacity: 1, x: 0 },
      duration: 0.12,
    },
  };
}

interface StepOption {
  id: string;
  label: string;
  score?: number;
  delta?: number;
}

interface QuestionCardProps {
  questionKey: string;
  position: number; // 1-based
  total: number;
  stepLabel: string;
  prompt: string;
  note: string;
  scenario?: string;
  uxHint?: string;
  options: StepOption[];
  selectedOption: StepOption | null;
  onSelectOption: (opt: StepOption) => void;
  onConfirm: () => void;
  isReobservation?: boolean;
  previousDate?: string;
  showPauseBtn?: boolean;
  onPause?: () => void;
  /** 深度フェーズの色（左端ラインに表示） */
  depthColor?: string;
}

export default function QuestionCard({
  questionKey,
  position,
  total,
  stepLabel,
  prompt,
  note,
  scenario,
  uxHint,
  options,
  selectedOption,
  onSelectOption,
  onConfirm,
  isReobservation,
  previousDate,
  showPauseBtn,
  onPause,
  depthColor,
}: QuestionCardProps) {
  const personality = getPositionPersonality(position, total);
  const optionLabels = ["a", "b", "c", "d", "e"];

  return (
    <motion.div
      key={questionKey}
      className={personality.cardClass}
      style={{ position: "relative", overflow: "hidden" }}
      initial={personality.transition.initial}
      animate={personality.transition.animate}
      exit={{ opacity: 0, x: -20 }}
      transition={{
        duration: personality.transition.duration,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      {/* 深度カラーライン — 現在の深度フェーズを視覚的に示す */}
      {depthColor && (
        <motion.div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: 3,
            borderRadius: "0 2px 2px 0",
            background: depthColor,
          }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        />
      )}
      {/* Position label (Q1 / Q最終 only) */}
      {personality.label && (
        <motion.span
          className="font-mono-sg text-[0.65rem] tracking-[0.2em] block mb-3"
          style={{
            color:
              personality.label === "FIRST SIGNAL"
                ? "rgba(170,150,90,0.5)"
                : "rgba(170,150,90,0.6)",
          }}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {personality.label}
        </motion.span>
      )}

      {/* Step type badge */}
      <div className="flex items-center gap-2 mb-2">
        <span className="sg-text-micro">{stepLabel}</span>
        {isReobservation && previousDate && (
          <span
            className="text-[10px] px-2 py-0.5 rounded-full"
            style={{
              background: "rgba(139,92,246,0.08)",
              color: "rgba(139,92,246,0.55)",
              border: "1px solid rgba(139,92,246,0.12)",
            }}
          >
            前回: {previousDate}
          </span>
        )}
      </div>

      {/* Scenario context (if shadow_play or has scenario) */}
      {scenario && (
        <p
          className="text-sm leading-relaxed mb-3"
          style={{ color: "rgba(100,105,130,0.6)" }}
        >
          {scenario}
        </p>
      )}

      {/* Main prompt — size varies by position */}
      <h3
        className={`font-display ${personality.textSize} font-medium leading-[1.4] mb-1`}
        style={{ color: "rgba(18,24,44,0.92)" }}
      >
        {prompt}
      </h3>

      {/* UX hint — why this question */}
      {uxHint && (
        <div className="card-info mt-3 mb-4">
          <p className="sg-text-caption leading-6">{uxHint}</p>
        </div>
      )}

      {/* Options */}
      <div className="space-y-2 mt-4" role="listbox" aria-label="回答の選択肢">
        {options.map((opt, i) => {
          const isSelected = selectedOption?.id === opt.id;
          return (
            <motion.button
              key={opt.id}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelectOption(opt)}
              className="w-full text-left p-3.5 rounded-xl transition-all flex items-start gap-3 min-h-[48px]"
              style={{
                background: isSelected
                  ? "rgba(139,92,246,0.08)"
                  : "rgba(255,255,255,0.55)",
                border: isSelected
                  ? "1px solid rgba(139,92,246,0.28)"
                  : "1px solid rgba(160,170,200,0.12)",
                color: isSelected
                  ? "rgba(30,35,55,0.92)"
                  : "rgba(80,85,105,0.55)",
              }}
              whileTap={{ scale: 0.98 }}
              animate={isSelected ? { scale: [1, 1.012, 1] } : {}}
              transition={isSelected ? { duration: 0.2 } : {}}
            >
              <span
                className="font-mono-sg text-[10px] w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5"
                style={{
                  background: isSelected
                    ? "rgba(139,92,246,0.15)"
                    : "rgba(160,170,200,0.08)",
                  color: isSelected
                    ? "rgba(100,70,200,0.7)"
                    : "rgba(120,125,140,0.4)",
                  border: isSelected
                    ? "1px solid rgba(139,92,246,0.2)"
                    : "1px solid rgba(160,170,200,0.1)",
                }}
              >
                {optionLabels[i] ?? i + 1}
              </span>
              <span className="text-sm leading-relaxed">{opt.label}</span>
              {isSelected && (
                <motion.span
                  className="ml-auto flex-shrink-0 text-xs"
                  style={{ color: "rgba(139,92,246,0.5)" }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                >
                  ✓
                </motion.span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Confirm button — appears when option selected */}
      {selectedOption && (
        <motion.button
          onClick={onConfirm}
          className="btn-primary-sg w-full py-3.5 mt-4 text-sm font-semibold tracking-wide"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          whileTap={{ scale: 0.98 }}
        >
          次へ →
        </motion.button>
      )}

      {/* Pause button */}
      {showPauseBtn && !selectedOption && (
        <motion.button
          onClick={onPause}
          className="w-full text-center mt-4 py-2"
          style={{ color: "rgba(120,125,140,0.3)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <span className="text-xs">あとで答える</span>
        </motion.button>
      )}
    </motion.div>
  );
}
