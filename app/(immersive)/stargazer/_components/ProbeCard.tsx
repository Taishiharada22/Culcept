// app/stargazer/_components/ProbeCard.tsx
// Stage 2: 5ステップ分岐プローブカード
// 心理的設計: 深度進行ビジュアル + 雰囲気変化 + ためらい検出
// 各ステップで視覚的に「深く潜っていく」感覚を演出
"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  PROBE_STEPS,
  PROBE_STEP_LABELS,
  PROBE_CONTEXT_COLORS,
  type ProbeTheme,
  type ProbeStepAnswer,
} from "@/lib/stargazer/stage2Probes";
import { PROBE_DEPTH_LEVELS } from "@/lib/stargazer/atmosphereConfig";
import { useHaptics } from "@/hooks/useHaptics";

interface Props {
  theme: ProbeTheme;
  currentStepIndex: number;
  previousAnswers: ProbeStepAnswer[];
  onAnswer: (answer: ProbeStepAnswer) => void;
  lightMode?: boolean;
}

export default function ProbeCard({
  theme,
  currentStepIndex,
  previousAnswers,
  onAnswer,
  lightMode = false,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const shownAt = useRef(Date.now());
  const haptics = useHaptics();

  const stepDef = theme.steps[currentStepIndex];

  const handleSelect = useCallback(
    (optionId: string) => {
      if (confirmed) return;
      setSelectedId(optionId);
      haptics.light();
    },
    [confirmed, haptics]
  );

  const handleConfirm = useCallback(() => {
    if (selectedId === null || confirmed || !stepDef) return;
    setConfirmed(true);
    haptics.medium();

    const option = stepDef.options.find((o) => o.id === selectedId);
    const responseTimeMs = Date.now() - shownAt.current;

    onAnswer({
      step: stepDef.step,
      selectedOptionId: selectedId,
      branchKey: option?.branchKey,
      responseTimeMs,
    });

    setTimeout(() => {
      setSelectedId(null);
      setConfirmed(false);
      shownAt.current = Date.now();
    }, 400);
  }, [selectedId, confirmed, stepDef, onAnswer]);

  if (!stepDef) return null;

  const contextColor = PROBE_CONTEXT_COLORS[theme.context];
  const stepLabel = PROBE_STEP_LABELS[stepDef.step];
  const depthLevel = PROBE_DEPTH_LEVELS[currentStepIndex] ?? PROBE_DEPTH_LEVELS[4];

  // 前ステップの branchKey でフィルタ
  const prevAnswer = previousAnswers[previousAnswers.length - 1];
  const prevBranchKey = prevAnswer?.branchKey;

  let visibleOptions = stepDef.options;
  if (stepDef.conditionalOptions && prevBranchKey) {
    const allowedIds = stepDef.conditionalOptions[prevBranchKey];
    if (allowedIds) {
      visibleOptions = stepDef.options.filter((o) =>
        allowedIds.includes(o.id)
      );
    }
  }

  // テーマカラー
  const accent = contextColor.accent;
  const accentBg = contextColor.bg;

  const textPrimary = "rgba(30,40,60,0.85)";
  const textMeta = "rgba(120,125,140,0.45)";
  const textOption = "rgba(40,50,70,0.75)";

  const cardBg = "rgba(255,255,255,0.7)";
  const cardBorder = "rgba(160,170,200,0.12)";
  const optionBg = "rgba(0,0,0,0.02)";
  const optionBorder = "rgba(160,170,200,0.12)";

  const btnInactiveBg = "rgba(0,0,0,0.02)";
  const btnInactiveBorder = "rgba(160,170,200,0.12)";
  const btnInactiveText = "rgba(120,125,140,0.3)";

  const dotInactive = "rgba(160,170,200,0.15)";
  const dotComplete = "rgba(100,105,130,0.3)";

  return (
    <motion.div
      key={`${theme.id}_step${currentStepIndex}`}
      initial={{ opacity: 0, x: 40, y: 10, rotateX: 3 }}
      animate={{ opacity: 1, x: 0, y: 0, rotateX: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="w-full max-w-lg mx-auto relative"
    >
      {/* 深度進行の雰囲気背景 — ステップが深くなるほど暗く */}
      <motion.div
        className="absolute inset-0 pointer-events-none -z-10"
        style={{
          background: `radial-gradient(ellipse at 50% 30%, ${accent.replace(/[\d.]+\)$/, `${0.03 + depthLevel.depthFactor * 0.04})`)} 0%, transparent 60%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      />

      {/* 5-dot ステッパー + 深度インジケーター */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <span
            className="font-mono-sg text-xs tracking-[0.2em] uppercase"
            style={{ color: textMeta }}
          >
            {theme.emoji} {contextColor.label}
          </span>
          <div className="flex items-center gap-2">
            {/* 深度ラベル */}
            <motion.span
              className="font-mono-sg text-[9px] tracking-[0.1em] px-1.5 py-0.5 rounded-full"
              style={{
                background: accent.replace(/[\d.]+\)$/, `${0.06 + depthLevel.depthFactor * 0.06})`),
                color: accent,
              }}
              key={depthLevel.labelJa}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.18 }}
            >
              {depthLevel.labelJa}
            </motion.span>
            <span
              className="font-mono-sg text-xs"
              style={{ color: textMeta }}
            >
              {stepLabel.label}
            </span>
          </div>
        </div>

        {/* 深度可視化ステッパー */}
        <div
          className="flex items-center gap-1.5 justify-center"
          role="progressbar"
          aria-valuenow={currentStepIndex + 1}
          aria-valuemin={1}
          aria-valuemax={PROBE_STEPS.length}
          aria-label="観測の深さ"
        >
          {PROBE_STEPS.map((step, i) => {
            const isActive = i === currentStepIndex;
            const isDone = i < currentStepIndex;
            const depthInfo = PROBE_DEPTH_LEVELS[i];

            return (
              <div key={step} className="flex items-center gap-1.5">
                <motion.div
                  className="rounded-full relative"
                  style={{
                    width: isActive ? 14 : 8,
                    height: isActive ? 14 : 8,
                    background: isActive
                      ? accent
                      : isDone
                        ? dotComplete
                        : dotInactive,
                    boxShadow: isActive
                      ? `0 0 ${8 + depthInfo.depthFactor * 8}px ${accent}`
                      : "none",
                  }}
                  animate={{
                    scale: isActive ? 1 : 0.8,
                  }}
                  transition={{
                    type: "spring",
                    stiffness: 400,
                    damping: 25,
                  }}
                >
                  {/* アクティブステップの呼吸パルス */}
                  {isActive && (
                    <motion.div
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: accent,
                      }}
                      animate={{
                        scale: [1, 1.8, 1],
                        opacity: [0.4, 0, 0.4],
                      }}
                      transition={{
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut",
                      }}
                    />
                  )}
                </motion.div>
                {i < PROBE_STEPS.length - 1 && (
                  <div
                    className="w-5 h-px"
                    style={{
                      background: isDone ? dotComplete : dotInactive,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* 質問カード — 深度に応じてblur増加 */}
      <div
        className="rounded-2xl p-6 sm:p-10"
        style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          backdropFilter: `blur(${depthLevel.blur}px)`,
          boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
        }}
      >
        {/* ステップ説明 — 深度色 */}
        <p
          className="font-mono-sg text-xs tracking-[0.15em] mb-4"
          style={{ color: accent }}
        >
          {stepLabel.description}
        </p>

        {/* 質問テキスト */}
        <p
          className="font-body text-base leading-[1.8] mb-8"
          style={{ color: textPrimary }}
        >
          {stepDef.prompt}
        </p>

        {/* 選択肢 */}
        <div className="flex flex-col gap-3.5 mb-8">
          {visibleOptions.map((option, i) => {
            const isSelected = selectedId === option.id;
            return (
              <motion.button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                disabled={confirmed}
                aria-label={option.label}
                aria-pressed={isSelected}
                className="w-full text-left px-4 py-3.5 rounded-xl font-body text-sm leading-relaxed transition-all"
                style={{
                  background: isSelected ? accentBg : optionBg,
                  border: `1px solid ${isSelected ? accent : optionBorder}`,
                  color: isSelected ? accent : textOption,
                  cursor: confirmed ? "not-allowed" : "pointer",
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: isSelected ? [0.95, 1.02, 1.0] : 1.0,
                  boxShadow: isSelected
                    ? [`0 0 0px ${accentBg}`, `0 0 20px ${accent}`, `0 0 12px ${accentBg}`]
                    : "0 0 0px transparent",
                }}
                transition={{
                  delay: i * 0.06,
                  duration: 0.2,
                  scale: { type: "spring", stiffness: 400, damping: 15 },
                  boxShadow: { duration: 0.22 },
                }}
                whileHover={!confirmed ? { scale: 1.02 } : {}}
                whileTap={!confirmed ? { scale: 0.95 } : {}}
              >
                {option.label}
              </motion.button>
            );
          })}
        </div>

        {/* 確定ボタン */}
        <motion.button
          onClick={handleConfirm}
          disabled={selectedId === null || confirmed}
          aria-label="この回答で進む"
          className="w-full py-3 rounded-xl font-body text-sm font-semibold transition-all"
          style={{
            background: selectedId !== null ? accentBg : btnInactiveBg,
            border: `1px solid ${selectedId !== null ? accent : btnInactiveBorder}`,
            color: selectedId !== null ? accent : btnInactiveText,
            cursor: selectedId !== null ? "pointer" : "not-allowed",
          }}
          whileHover={selectedId !== null ? { scale: 1.03, boxShadow: `0 0 20px ${accentBg}` } : {}}
          whileTap={selectedId !== null ? { scale: 0.94 } : {}}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
        >
          {confirmed ? "記録中..." : "この回答で進む"}
        </motion.button>
      </div>
    </motion.div>
  );
}
