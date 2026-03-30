// app/stargazer/_components/MultipleChoiceCard.tsx
// Stage 1: 多肢選択カード — 3-5個の選択肢ボタン
// 心理的設計: 雰囲気カラー対応 + ためらい検出 + 回答後の呼吸パルス
"use client";

import { useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import type { Stage1Question } from "@/lib/stargazer/stage1Questions";
import type { HesitationSignal } from "@/lib/stargazer/atmosphereConfig";
import { useHaptics } from "@/hooks/useHaptics";

interface Props {
  question: Stage1Question;
  questionIndex: number;
  totalQuestions: number;
  categoryLabel: string;
  categoryEmoji: string;
  onAnswer: (
    questionId: string,
    selectedOptionId: string,
    responseTimeMs: number,
    hesitation: HesitationSignal
  ) => void;
  isSubmitting?: boolean;
  lightMode?: boolean;
  /** カテゴリの雰囲気カラー (デフォルト: amber) */
  atmosphereColor?: string;
}

export default function MultipleChoiceCard({
  question,
  questionIndex,
  totalQuestions,
  categoryLabel,
  categoryEmoji,
  onAnswer,
  isSubmitting = false,
  lightMode = false,
  atmosphereColor,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const shownAt = useRef(Date.now());
  const firstSelectionAt = useRef<number | null>(null);
  const selectionChanges = useRef(0);
  const haptics = useHaptics();

  const handleSelect = useCallback(
    (optionId: string) => {
      if (confirmed || isSubmitting) return;

      // ためらい追跡
      if (firstSelectionAt.current === null) {
        firstSelectionAt.current = Date.now();
      }
      if (selectedId !== null && selectedId !== optionId) {
        selectionChanges.current += 1;
      }

      setSelectedId(optionId);
      haptics.light();
    },
    [confirmed, isSubmitting, selectedId, haptics]
  );

  const handleConfirm = useCallback(() => {
    if (selectedId === null || confirmed || isSubmitting) return;
    setConfirmed(true);
    haptics.medium();

    const now = Date.now();
    const responseTimeMs = now - shownAt.current;
    const timeToFirstSelection = firstSelectionAt.current
      ? firstSelectionAt.current - shownAt.current
      : responseTimeMs;

    const hesitation: HesitationSignal = {
      selectionChanges: selectionChanges.current,
      timeToFirstSelection,
      totalResponseTimeMs: responseTimeMs,
      detected:
        selectionChanges.current >= 2 ||
        timeToFirstSelection > 10000 ||
        (selectionChanges.current >= 1 && responseTimeMs > 12000),
    };

    onAnswer(question.id, selectedId, responseTimeMs, hesitation);

    setTimeout(() => {
      setSelectedId(null);
      setConfirmed(false);
      shownAt.current = Date.now();
      firstSelectionAt.current = null;
      selectionChanges.current = 0;
    }, 400);
  }, [selectedId, confirmed, isSubmitting, question.id, onAnswer]);

  const progress = ((questionIndex + 1) / totalQuestions) * 100;

  // カテゴリ雰囲気カラーまたはデフォルト
  const atmoColor = atmosphereColor ?? "rgba(160,140,90,0.8)";

  // 雰囲気から派生する色
  const accent = atmoColor;
  const accentLight = atmoColor.replace(/[\d.]+\)$/, "0.5)");
  const accentGlow = `0 0 16px ${atmoColor.replace(/[\d.]+\)$/, "0.2)")}`;
  const accentBg = atmoColor.replace(/[\d.]+\)$/, "0.10)");
  const accentBorder = atmoColor.replace(/[\d.]+\)$/, "0.20)");

  const textPrimary = "rgba(30,40,60,0.85)";
  const textMeta = "rgba(120,125,140,0.45)";
  const textMetaDim = "rgba(120,125,140,0.35)";
  const textOption = "rgba(40,50,70,0.75)";

  const trackBg = "rgba(160,170,200,0.10)";
  const cardBg = "rgba(255,255,255,0.7)";
  const cardBorder = "rgba(160,170,200,0.12)";

  const optionBg = "rgba(0,0,0,0.02)";
  const optionBorder = "rgba(160,170,200,0.12)";

  const btnInactiveBg = "rgba(0,0,0,0.02)";
  const btnInactiveBorder = "rgba(160,170,200,0.12)";
  const btnInactiveText = "rgba(120,125,140,0.3)";

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, x: 40, y: 10, rotateX: 3 }}
      animate={{ opacity: 1, x: 0, y: 0, rotateX: 0 }}
      exit={{ opacity: 0, x: -40 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="w-full max-w-lg mx-auto"
    >
      {/* 雰囲気グロウ背景 */}
      <motion.div
        className="absolute inset-0 pointer-events-none -z-10"
        style={{
          background: `radial-gradient(ellipse at 50% 20%, ${atmoColor.replace(/[\d.]+\)$/, "0.04)")} 0%, transparent 60%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      />

      {/* 進捗バー */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-2">
          <span
            className="font-mono-sg text-xs tracking-[0.2em] uppercase"
            style={{ color: textMeta }}
          >
            {categoryEmoji} {categoryLabel}
          </span>
          <span
            className="font-mono-sg text-xs tabular-nums"
            style={{ color: textMetaDim }}
          >
            {questionIndex + 1} / {totalQuestions}
          </span>
        </div>
        <div
          className="h-0.5 rounded-full overflow-hidden"
          style={{ background: trackBg }}
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="質問の進捗"
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: accentLight }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.22 }}
          />
        </div>
      </div>

      {/* 質問カード */}
      <div
        className="rounded-2xl p-6 sm:p-10"
        style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          backdropFilter: "blur(16px)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.04)",
        }}
      >
        {/* 質問テキスト */}
        <p
          className="font-body text-lg leading-[1.8] mb-8"
          style={{ color: textPrimary }}
        >
          {question.prompt}
        </p>

        {/* 選択肢 */}
        <div className="flex flex-col gap-3.5 mb-8">
          {question.options.map((option, i) => {
            const isSelected = selectedId === option.id;
            return (
              <motion.button
                key={option.id}
                onClick={() => handleSelect(option.id)}
                disabled={confirmed || isSubmitting}
                aria-label={option.label}
                aria-pressed={isSelected}
                className="w-full text-left px-4 py-4 min-h-[56px] rounded-xl font-body text-sm leading-relaxed transition-all"
                style={{
                  background: isSelected ? accentBg : optionBg,
                  border: `1px solid ${isSelected ? accentBorder : optionBorder}`,
                  color: isSelected ? accent : textOption,
                  cursor: confirmed || isSubmitting ? "not-allowed" : "pointer",
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{
                  opacity: 1,
                  y: 0,
                  scale: isSelected ? [0.95, 1.02, 1.0] : 1.0,
                  boxShadow: isSelected
                    ? [`0 0 0px ${accentBg}`, `0 0 20px ${accent}`, accentGlow]
                    : "0 0 0px transparent",
                }}
                transition={{
                  delay: i * 0.06,
                  duration: 0.2,
                  scale: { type: "spring", stiffness: 400, damping: 15 },
                  boxShadow: { duration: 0.22 },
                }}
                whileHover={
                  !confirmed && !isSubmitting ? { scale: 1.02 } : {}
                }
                whileTap={
                  !confirmed && !isSubmitting ? { scale: 0.95 } : {}
                }
              >
                {isSelected && <span className="mr-2 text-sm">✓</span>}
                {option.label}
              </motion.button>
            );
          })}
        </div>

        {/* 確定ボタン */}
        <motion.button
          onClick={handleConfirm}
          disabled={selectedId === null || confirmed || isSubmitting}
          aria-label="この回答で進む"
          className={`w-full py-3.5 rounded-xl font-body text-sm font-semibold transition-all ${selectedId !== null ? "btn-primary-sg" : ""}`}
          style={selectedId === null ? {
            background: btnInactiveBg,
            border: `1px solid ${btnInactiveBorder}`,
            color: btnInactiveText,
            cursor: "not-allowed",
          } : undefined}
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
