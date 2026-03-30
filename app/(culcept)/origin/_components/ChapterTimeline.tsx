"use client";

import { motion, AnimatePresence } from "framer-motion";
import { getPeriodLabel } from "@/lib/origin/v7/periods";
import { getAtmosphereLabel } from "@/lib/origin/v7/atmosphereData";
import type { MemoryChapter } from "@/lib/origin/v7/types";

type Props = {
  chapters: MemoryChapter[];
  onNewChapter: () => void;
};

export default function ChapterTimeline({ chapters, onNewChapter }: Props) {
  if (chapters.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center gap-6 py-12"
      >
        <div className="flex flex-col items-center gap-2 text-center">
          <span className="text-4xl">🔍</span>
          <h2 className="text-lg font-semibold text-gray-800">
            記憶の探索を始めましょう
          </h2>
          <p className="max-w-xs text-sm text-gray-500">
            過去の自分を少しずつ思い出していく体験です。
            ざっくりした記憶で大丈夫。
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onNewChapter}
          className="rounded-2xl bg-amber-400/90 px-8 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
        >
          最初の記憶を探索する
        </motion.button>
      </motion.div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">
          あなたの記憶
        </h2>
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onNewChapter}
          className="rounded-full bg-amber-400/80 px-4 py-1.5 text-xs font-semibold text-white hover:bg-amber-500/80"
        >
          + 新しい時期を探索
        </motion.button>
      </div>

      {/* Timeline */}
      <AnimatePresence>
        {chapters.map((chapter, i) => (
          <motion.div
            key={chapter.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="relative flex gap-4"
          >
            {/* Timeline line */}
            <div className="flex flex-col items-center">
              <div className="h-3 w-3 rounded-full bg-amber-400/70" />
              {i < chapters.length - 1 && (
                <div className="w-px flex-1 bg-amber-200/50" />
              )}
            </div>

            {/* Card */}
            <div className="mb-4 flex-1 rounded-2xl bg-white/75 backdrop-blur-sm p-4 shadow-sm">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">
                  {getPeriodLabel(chapter.fact.period)}
                </span>
                <span className="text-xs text-gray-400">
                  {getAtmosphereLabel(chapter.mood.atmosphere)}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-gray-600 line-clamp-3">
                {chapter.meaning.finalText}
              </p>
              <p className="mt-2 text-[10px] text-gray-400">
                {new Date(chapter.createdAt).toLocaleDateString("ja-JP")}
              </p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
