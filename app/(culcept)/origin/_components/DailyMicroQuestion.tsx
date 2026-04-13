"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  MicroQuestion,
  MicroQuestionAnswer,
  MicroQuestionStreak,
} from "@/lib/origin/v7/types";
import { periodToApproximateCalendar } from "@/lib/origin/v7/microQuestionEngine";

/* ─── Props ─── */

type Props = {
  question: MicroQuestion | null;
  streak: MicroQuestionStreak;
  onAnswer: (answer: MicroQuestionAnswer) => void;
  birthYear?: number;
  /** AIコンパニオンからの挨拶メッセージ */
  greeting?: string;
};

/* ─── Helpers ─── */

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */
/*                              MAIN COMPONENT                                */
/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function DailyMicroQuestion({
  question,
  streak,
  onAnswer,
  birthYear,
  greeting,
}: Props) {
  const today = todayString();
  const answeredToday = streak.lastAnsweredDate === today;

  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitted, setSubmitted] = useState(answeredToday);

  /* ─ Build and submit answer ─ */
  const handleSelect = useCallback(
    (optionId: string) => {
      if (!question || submitted) return;
      setSelectedOptionId(optionId);

      // If no free text is allowed, submit immediately after a brief animation
      if (!question.allowFreeText) {
        setSubmitted(true);

        const cal =
          birthYear != null
            ? periodToApproximateCalendar(question.lifePeriod, birthYear)
            : null;

        const answer: MicroQuestionAnswer = {
          questionId: question.id,
          selectedOptionId: optionId,
          freeText: "",
          lifePeriod: question.lifePeriod,
          calendarYear: cal?.year ?? null,
          calendarMonth: cal?.month ?? null,
          answeredAt: new Date().toISOString(),
        };

        // Small delay for the selection animation
        setTimeout(() => onAnswer(answer), 500);
      }
    },
    [question, submitted, birthYear, onAnswer],
  );

  const handleSubmitWithText = useCallback(() => {
    if (!question || !selectedOptionId) return;
    setSubmitted(true);

    const cal =
      birthYear != null
        ? periodToApproximateCalendar(question.lifePeriod, birthYear)
        : null;

    const answer: MicroQuestionAnswer = {
      questionId: question.id,
      selectedOptionId,
      freeText: freeText.trim(),
      lifePeriod: question.lifePeriod,
      calendarYear: cal?.year ?? null,
      calendarMonth: cal?.month ?? null,
      answeredAt: new Date().toISOString(),
    };

    setTimeout(() => onAnswer(answer), 400);
  }, [question, selectedOptionId, freeText, birthYear, onAnswer]);

  /* ─ Streak badge ─ */
  const streakBadge = useMemo(() => {
    if (streak.currentStreak <= 0) return null;
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100/80 text-amber-700 text-xs font-semibold">
        <span className="text-sm">{"\uD83D\uDD25"}</span>
        {streak.currentStreak}日連続
      </span>
    );
  }, [streak.currentStreak]);

  /* ━━━ STATE: All questions answered ━━━ */
  if (!question) {
    return (
      <div className="rounded-2xl bg-white/60 backdrop-blur-sm border border-amber-200/40 p-4 text-center">
        <span className="text-3xl">{"\uD83C\uDF89"}</span>
        <p className="mt-2 text-sm font-medium text-gray-700">
          全ての質問に回答しました
        </p>
        <p className="text-xs text-gray-500 mt-1">
          合計 {streak.totalAnswered} 問に回答済み
        </p>
      </div>
    );
  }

  /* ━━━ STATE: Already answered today ━━━ */
  if (answeredToday && !submitted) {
    return (
      <div className="rounded-2xl bg-white/60 backdrop-blur-sm border border-amber-200/40 p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-semibold text-amber-800">今日の記憶</p>
          {streakBadge}
        </div>
        <div className="flex items-center gap-3 py-3">
          <span className="text-2xl">{"\u2705"}</span>
          <div>
            <p className="text-sm font-medium text-gray-700">
              今日の質問は完了
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              また明日、新しい記憶の扉が開きます
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ━━━ STATE: Normal (show question) ━━━ */
  return (
    <div className="rounded-2xl bg-white/60 backdrop-blur-sm border border-amber-200/40 p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-semibold text-amber-800">今日の記憶</p>
        {streakBadge}
      </div>

      {/* AI Greeting */}
      {greeting && (
        <p className="mb-3 text-xs leading-relaxed text-indigo-500/70 italic">
          {greeting}
        </p>
      )}

      {/* Question */}
      <p className="text-base font-medium text-gray-800 mb-4">
        {question.question}
      </p>

      {/* Option cards */}
      <AnimatePresence mode="wait">
        {!submitted ? (
          <motion.div
            key="options"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-2 gap-2"
          >
            {question.options.map((opt) => {
              const isSelected = selectedOptionId === opt.id;
              return (
                <motion.button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelect(opt.id)}
                  whileTap={{ scale: 0.95 }}
                  className={`rounded-xl px-3 py-3 text-sm border transition-colors text-left ${
                    isSelected
                      ? "bg-amber-100 border-amber-400 text-amber-800"
                      : "bg-white/70 border-gray-200/60 text-gray-600 hover:border-amber-300/60"
                  }`}
                >
                  <span className="text-lg mr-1.5">{opt.icon}</span>
                  <span>{opt.label}</span>
                </motion.button>
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key="confirmed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="flex flex-col items-center justify-center py-4"
          >
            <div className="flex items-center">
              <motion.span
                className="text-3xl"
                initial={{ rotate: -20 }}
                animate={{ rotate: 0 }}
              >
                {"\u2728"}
              </motion.span>
              <p className="ml-2 text-sm font-medium text-amber-700">
                記録しました
              </p>
            </div>
            <p className="text-xs text-white/40 mt-1">このデータは端末にのみ保存されています</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Free text (if allowed and an option is selected and not yet submitted) */}
      {question.allowFreeText && selectedOptionId && !submitted && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.3 }}
          className="mt-3 space-y-2"
        >
          <input
            type="text"
            value={freeText}
            onChange={(e) => setFreeText(e.target.value)}
            placeholder="自由に一言..."
            className="w-full rounded-xl px-4 py-2.5 text-sm bg-white/70 border border-amber-200/50 text-gray-800 placeholder-gray-400 focus:outline-none focus:border-amber-400 transition-colors"
          />
          <motion.button
            type="button"
            onClick={handleSubmitWithText}
            whileTap={{ scale: 0.96 }}
            className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold bg-amber-500 text-white shadow-sm shadow-amber-500/30 hover:bg-amber-400 transition-colors"
          >
            回答する
          </motion.button>
        </motion.div>
      )}
    </div>
  );
}
