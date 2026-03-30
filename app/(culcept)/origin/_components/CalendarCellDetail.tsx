"use client";

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  MemoryGem,
  MicroQuestionAnswer,
  MemoryChapter,
} from "@/lib/origin/v7/types";
import { EMOTION_CARDS } from "@/lib/origin/v7/memoryDiveData";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Props
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type Props = {
  year: number;
  month: number;
  gems: MemoryGem[];
  answers: MicroQuestionAnswer[];
  chapters: MemoryChapter[];
  onClose: () => void;
  onStartDive: () => void;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Helpers
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function getEmotionIcon(emotionId: string): string {
  const card = EMOTION_CARDS.find((c) => c.id === emotionId);
  return card?.icon ?? "💎";
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Component
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function CalendarCellDetail({
  year,
  month,
  gems,
  answers,
  chapters,
  onClose,
  onStartDive,
}: Props) {
  const isEmpty = gems.length === 0 && answers.length === 0 && chapters.length === 0;

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleOverlayClick}
      >
        {/* Panel */}
        <motion.div
          className="relative mx-4 w-full max-w-sm rounded-3xl border border-amber-200/50 bg-white/85 p-6 shadow-xl shadow-amber-100/30 backdrop-blur-xl"
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600"
            aria-label="閉じる"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-5 w-5"
            >
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>

          {/* Header */}
          <h3 className="mb-4 text-xl font-bold text-amber-600">
            {year}年{month}月
          </h3>

          {/* Content */}
          <div className="max-h-80 space-y-4 overflow-y-auto pr-1">
            {/* Memory Gems */}
            {gems.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700">
                  <span>💎</span>
                  <span>記憶ジェム</span>
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-600">
                    {gems.length}
                  </span>
                </h4>
                <div className="space-y-2">
                  {gems.map((gem) => (
                    <motion.div
                      key={gem.id}
                      className="flex items-center gap-3 rounded-xl border border-amber-100/60 bg-amber-50/40 px-3 py-2.5"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <span className="text-lg">
                        {getEmotionIcon(gem.dominantEmotion)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-800">
                          {gem.title}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </section>
            )}

            {/* Micro Question Answers */}
            {answers.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700">
                  <span>📝</span>
                  <span>マイクロ回答</span>
                  <span className="ml-auto rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-500">
                    {answers.length}
                  </span>
                </h4>
                <div className="space-y-1.5">
                  {answers.map((ans, idx) => (
                    <div
                      key={`${ans.questionId}-${idx}`}
                      className="rounded-lg border border-stone-100/60 bg-stone-50/40 px-3 py-2 text-sm text-stone-600"
                    >
                      {ans.freeText || ans.selectedOptionId || "回答済み"}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Chapters */}
            {chapters.length > 0 && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-stone-700">
                  <span>📖</span>
                  <span>記憶チャプター</span>
                  <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-600">
                    {chapters.length}
                  </span>
                </h4>
                <div className="space-y-1.5">
                  {chapters.map((ch) => (
                    <div
                      key={ch.id}
                      className="rounded-lg border border-amber-100/60 bg-amber-50/30 px-3 py-2 text-sm font-medium text-stone-700"
                    >
                      {ch.title}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Empty State */}
            {isEmpty && (
              <div className="py-6 text-center">
                <p className="text-sm text-stone-400">
                  まだこの月は探索されていません
                </p>
              </div>
            )}
          </div>

          {/* Dive Button */}
          <motion.button
            onClick={onStartDive}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            className="mt-5 w-full rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-amber-200/40 transition-shadow hover:shadow-lg hover:shadow-amber-300/40"
          >
            この月をダイブする
          </motion.button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
