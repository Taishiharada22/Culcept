// app/stargazer/_components/SemanticDifferentialCard.tsx
// Semantic Differential 質問カード — 5段階スライダー
// V3: パーティクルフィードバック + 直感スパーク + 高速トランジション
"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { QuestionDefinition } from "@/lib/stargazer/questions";

interface Props {
  question: QuestionDefinition;
  questionIndex: number;
  totalQuestions: number;
  chapterLabel: string;
  onAnswer: (questionId: string, value: number, responseTimeMs: number) => void;
  onGoBack?: () => void;
  canGoBack?: boolean;
  isSubmitting?: boolean;
  lightMode?: boolean;
  contextBadge?: { emoji: string; label: string; color: string } | null;
  displayQuestionText?: string | null;
  displayNote?: string | null;
  isFollowUp?: boolean;
  /** 速答フラッシュモード — 3秒カウントダウン付き */
  flashMode?: boolean;
  /** 外部から観測タグを表示 */
  observationTag?: { emoji: string; label: string } | null;
  onScaleHover?: (value: number) => void;
  onScaleHoverEnd?: (value: number) => void;
}

const SCALE_LABELS = [
  { value: 1, label: "強く左" },
  { value: 2, label: "やや左" },
  { value: 3, label: "中立" },
  { value: 4, label: "やや右" },
  { value: 5, label: "強く右" },
];

// Quick-answer streak tracker
const FAST_THRESHOLD_MS = 2000;

function SemanticDifferentialCard({
  question,
  questionIndex,
  totalQuestions,
  chapterLabel,
  onAnswer,
  onGoBack,
  canGoBack = false,
  isSubmitting = false,
  lightMode = false,
  contextBadge,
  displayQuestionText,
  displayNote,
  isFollowUp = false,
  flashMode = false,
  observationTag,
  onScaleHover,
  onScaleHoverEnd,
}: Props) {
  const [selectedValue, setSelectedValue] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [showParticles, setShowParticles] = useState(false);
  const [showIntuitionSpark, setShowIntuitionSpark] = useState(false);
  const [fastStreak, setFastStreak] = useState(0);
  const [showObsTag, setShowObsTag] = useState(false);
  const shownAt = useRef(Date.now());
  const autoAdvanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Flash mode countdown
  const [flashCountdown, setFlashCountdown] = useState(3);
  const flashTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flashExpired = useRef(false);

  // Reset state when question changes (via key remount)
  useEffect(() => {
    shownAt.current = Date.now();
    flashExpired.current = false;
    setFlashCountdown(3);
    if (flashMode) {
      flashTimerRef.current = setInterval(() => {
        setFlashCountdown((c) => {
          if (c <= 1) {
            if (flashTimerRef.current) clearInterval(flashTimerRef.current);
            flashExpired.current = true;
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    }
    return () => {
      if (flashTimerRef.current) clearInterval(flashTimerRef.current);
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    };
  }, [question.id, flashMode]);

  // Show observation tag when it arrives
  useEffect(() => {
    if (observationTag) {
      setShowObsTag(true);
      const t = setTimeout(() => setShowObsTag(false), 1200);
      return () => clearTimeout(t);
    }
  }, [observationTag]);

  const handleSelect = useCallback(
    (value: number) => {
      if (confirmed || isSubmitting) return;
      setSelectedValue(value);

      // 即時送信: 0.6秒後に自動で次へ（その間に変更可能）
      if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
      autoAdvanceTimer.current = setTimeout(() => {
        doSubmit(value);
      }, 600);
    },
    [confirmed, isSubmitting, question.id] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const doSubmit = useCallback((value: number) => {
    if (confirmed || isSubmitting) return;
    setConfirmed(true);
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    const responseTimeMs = Date.now() - shownAt.current;

    // Particle burst
    setShowParticles(true);
    setTimeout(() => setShowParticles(false), 600);

    // Fast answer detection
    if (responseTimeMs < FAST_THRESHOLD_MS) {
      setShowIntuitionSpark(true);
      setFastStreak((s) => s + 1);
      setTimeout(() => setShowIntuitionSpark(false), 800);
    } else {
      setFastStreak(0);
    }

    onAnswer(question.id, value, responseTimeMs);

    setTimeout(() => {
      setSelectedValue(null);
      setConfirmed(false);
      shownAt.current = Date.now();
    }, 250);
  }, [confirmed, isSubmitting, question.id, onAnswer]);

  const progress = ((questionIndex + 1) / totalQuestions) * 100;

  // テーマカラー
  const accent = "rgba(140,120,60,0.95)";
  const accentLight = "rgba(140,120,60,0.6)";
  const accentGlow = "0 0 14px rgba(140,120,60,0.25)";
  const accentBg = "rgba(140,120,60,0.12)";
  const accentBorder = "rgba(170,150,90,0.35)";

  const textPrimary = "rgba(20,25,40,0.95)";
  const textLabel = "rgba(40,45,65,0.82)";
  const textLabelDimmed = "rgba(50,55,75,0.6)";
  const textMeta = "rgba(80,85,105,0.65)";
  const textMetaDim = "rgba(90,95,115,0.55)";

  const trackBg = "rgba(140,150,180,0.15)";
  const dotBg = "rgba(140,150,180,0.14)";
  const dotBorder = "rgba(140,150,180,0.25)";
  const dotBorderCenter = "rgba(140,150,180,0.35)";
  const dividerBg = "rgba(140,150,180,0.18)";

  const cardBg = isFollowUp
    ? "rgba(245,240,255,0.92)"
    : "rgba(255,255,255,0.95)";
  const cardBorder = isFollowUp
    ? "rgba(139,92,246,0.15)"
    : "rgba(140,150,180,0.18)";

  const btnInactiveBg = "rgba(0,0,0,0.03)";
  const btnInactiveBorder = "rgba(140,150,180,0.18)";
  const btnInactiveText = "rgba(120,125,140,0.4)";

  const lineGradient = "linear-gradient(to right, rgba(140,120,60,0.2), rgba(140,150,180,0.1), rgba(140,120,60,0.2))";

  const hasQuestionText = !!displayQuestionText;

  return (
    <motion.div
      key={question.id}
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -30 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-lg mx-auto relative"
    >
      {/* Confirmation particles */}
      <AnimatePresence>
        {showParticles && (
          <>
            {[0, 1].map((i) => (
              <motion.div
                key={`particle-${i}`}
                className="absolute rounded-full pointer-events-none z-20"
                style={{
                  width: 4,
                  height: 4,
                  background: "rgba(190,170,110,0.7)",
                  left: "50%",
                  top: "60%",
                }}
                initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{
                  x: (i === 0 ? -40 : 40) + (Math.random() * 20 - 10),
                  y: -30 - Math.random() * 30,
                  opacity: 0,
                  scale: 0.3,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.22, ease: "easeOut" }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Intuition spark flash */}
      <AnimatePresence>
        {showIntuitionSpark && (
          <motion.div
            className="absolute inset-0 rounded-2xl pointer-events-none z-10"
            style={{
              background: "radial-gradient(circle at 50% 60%, rgba(190,170,110,0.15), transparent 70%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
          />
        )}
      </AnimatePresence>

      {/* コンテキストバッジ */}
      {contextBadge && (
        <div className="mb-3">
          <span
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-display"
            style={{
              background: contextBadge.color.replace(/[\d.]+\)$/, "0.12)"),
              border: `1px solid ${contextBadge.color.replace(/[\d.]+\)$/, "0.25)")}`,
              color: contextBadge.color,
            }}
          >
            {contextBadge.emoji} {contextBadge.label}
          </span>
        </div>
      )}

      {/* 進捗バー */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span
              className="font-mono-sg text-xs tracking-[0.2em] uppercase"
              style={{ color: textMeta }}
            >
              {chapterLabel}
            </span>
            {isFollowUp && (
              <span
                className="text-xs font-mono-sg tracking-wider"
                style={{ color: "rgba(139,92,246,0.6)" }}
              >
                ↳ 深掘り
              </span>
            )}
          </div>
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
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: accentLight }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.18 }}
          />
        </div>

        {/* Fast streak indicator */}
        <AnimatePresence>
          {fastStreak >= 3 && (
            <motion.p
              className="font-mono-sg text-[10px] mt-1 text-right"
              style={{ color: "rgba(170,150,90,0.45)" }}
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              直感が冴えている ✦
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* 質問カード */}
      <div
        className="rounded-2xl p-6 sm:p-8"
        style={{
          background: cardBg,
          border: `1px solid ${cardBorder}`,
          borderLeft: isFollowUp
            ? "3px solid rgba(139,92,246,0.45)"
            : `1px solid ${cardBorder}`,
          backdropFilter: "blur(20px)",
          boxShadow: "0 2px 8px rgba(0,0,0,0.04), 0 8px 32px rgba(0,0,0,0.06)",
        }}
      >
        {/* 質問文（V2で追加 — 主役） */}
        {hasQuestionText && (
          <p
            className="font-body text-lg leading-relaxed mb-6"
            style={{ color: textPrimary }}
          >
            {displayQuestionText}
          </p>
        )}

        {/* 左右ラベル & スライダー */}
        <div className="mb-8">
          <div className="flex justify-between items-start mb-6">
            <p
              className={`font-body leading-relaxed flex-1 text-left pr-4 ${
                hasQuestionText ? "text-sm" : "text-base"
              }`}
              style={{ color: hasQuestionText ? textLabelDimmed : textLabel }}
            >
              {question.leftLabel}
            </p>
            <div
              className="w-px h-8 mx-2 flex-shrink-0"
              style={{ background: dividerBg }}
            />
            <p
              className={`font-body leading-relaxed flex-1 text-right pl-4 ${
                hasQuestionText ? "text-sm" : "text-base"
              }`}
              style={{ color: hasQuestionText ? textLabelDimmed : textLabel }}
            >
              {question.rightLabel}
            </p>
          </div>

          {/* 5段階ドット */}
          <div
            className="flex items-center justify-between px-2"
            role="radiogroup"
            aria-label={`${question.leftLabel} から ${question.rightLabel} のスケール`}
          >
            {SCALE_LABELS.map((item) => {
              const isSelected = selectedValue === item.value;
              const isCenter = item.value === 3;
              const ariaLabel = item.value <= 2
                ? `${question.leftLabel} (${item.label})`
                : item.value === 3
                  ? "中立"
                  : `${question.rightLabel} (${item.label})`;
              return (
                <button
                  key={item.value}
                  role="radio"
                  aria-checked={isSelected}
                  aria-label={ariaLabel}
                  onClick={() => handleSelect(item.value)}
                  onKeyDown={(e) => {
                    if (confirmed || isSubmitting) return;
                    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                      e.preventDefault();
                      const next = Math.min(5, item.value + 1);
                      handleSelect(next);
                    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                      e.preventDefault();
                      const prev = Math.max(1, item.value - 1);
                      handleSelect(prev);
                    } else if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (selectedValue !== null) doSubmit(selectedValue);
                    }
                  }}
                  onMouseEnter={() => onScaleHover?.(item.value)}
                  onMouseLeave={() => onScaleHoverEnd?.(item.value)}
                  onTouchStart={() => onScaleHover?.(item.value)}
                  disabled={confirmed || isSubmitting}
                  className="flex flex-col items-center gap-2 group transition-all"
                  style={{ minWidth: 44 }}
                >
                  <motion.div
                    className="rounded-full transition-all cursor-pointer"
                    style={{
                      width: isSelected ? 32 : isCenter ? 18 : 16,
                      height: isSelected ? 32 : isCenter ? 18 : 16,
                      background: isSelected ? accent : dotBg,
                      border: isSelected
                        ? `2px solid ${accentLight}`
                        : isCenter
                          ? `2px solid ${dotBorderCenter}`
                          : `1px solid ${dotBorder}`,
                      boxShadow: isSelected ? accentGlow : "none",
                    }}
                    whileHover={{ scale: 1.2 }}
                    whileTap={{ scale: 0.9 }}
                    animate={{
                      scale: isSelected ? 1 : 1,
                      width: isSelected ? 32 : isCenter ? 18 : 16,
                      height: isSelected ? 32 : isCenter ? 18 : 16,
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                  />
                </button>
              );
            })}
          </div>

          {/* 軸のラインインジケータ */}
          <div
            className="h-px mt-3 mx-4"
            style={{ background: lineGradient }}
          />

          {/* 補足テキスト */}
          {displayNote && (
            <p
              className="text-xs italic mt-3 mx-1 leading-relaxed"
              style={{ color: textMetaDim }}
            >
              {displayNote}
            </p>
          )}
        </div>

        {/* 戻るボタン（確定ボタンの代わり） */}
        {canGoBack && (
          <motion.button
            onClick={onGoBack}
            disabled={isSubmitting || confirmed}
            aria-label="前の質問に戻る"
            className="w-full py-3 min-h-[44px] rounded-xl font-body text-sm transition-all"
            style={{
              background: "transparent",
              border: `1px solid ${btnInactiveBorder}`,
              color: textMetaDim,
              cursor: isSubmitting ? "not-allowed" : "pointer",
            }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.98 }}
          >
            ← 前の質問に戻る
          </motion.button>
        )}

        {/* 観測タグ（特徴的な回答時に一瞬表示） */}
        <AnimatePresence>
          {showObsTag && observationTag && (
            <motion.div
              className="absolute top-4 right-4 z-30 flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{
                background: "rgba(140,120,60,0.08)",
                border: "1px solid rgba(140,120,60,0.15)",
              }}
              initial={{ opacity: 0, x: 20, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.8 }}
              transition={{ type: "spring", stiffness: 300, damping: 20 }}
            >
              <span className="text-xs">{observationTag.emoji}</span>
              <span
                className="font-mono-sg text-[10px] tracking-wider"
                style={{ color: "rgba(140,120,60,0.6)" }}
              >
                {observationTag.label}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* フラッシュモードオーバーレイ */}
        {flashMode && !confirmed && (
          <motion.div
            className="absolute top-0 left-0 right-0 flex items-center justify-center gap-2 py-2 z-20"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="text-xs">⚡</span>
            <span
              className="font-mono-sg text-xs tracking-wider"
              style={{ color: flashCountdown <= 1 ? "rgba(200,80,60,0.7)" : "rgba(140,120,60,0.6)" }}
            >
              直感で。
            </span>
            {/* カウントダウンリング */}
            <svg width="24" height="24" viewBox="0 0 24 24" className="ml-1">
              <circle cx="12" cy="12" r="10" fill="none" stroke="rgba(140,150,180,0.15)" strokeWidth="2" />
              <motion.circle
                cx="12" cy="12" r="10" fill="none"
                stroke={flashCountdown <= 1 ? "rgba(200,80,60,0.5)" : "rgba(140,120,60,0.5)"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={62.83}
                initial={{ strokeDashoffset: 0 }}
                animate={{ strokeDashoffset: 62.83 }}
                transition={{ duration: 3, ease: "linear" }}
                transform="rotate(-90 12 12)"
              />
              <text
                x="12" y="12" textAnchor="middle" dominantBaseline="central"
                fill="rgba(60,65,85,0.6)" fontSize="9" fontFamily="monospace"
              >
                {flashCountdown}
              </text>
            </svg>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}

export default React.memo(SemanticDifferentialCard);
