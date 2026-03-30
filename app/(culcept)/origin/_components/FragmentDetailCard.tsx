"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { MemoryChapter, ExplorationAxis } from "@/lib/origin/v7/types";
import { getPeriodLabel } from "@/lib/origin/v7/periods";
import { extractLayers } from "@/lib/origin/v7/layerExtraction";
import FragmentLayer from "./FragmentLayer";

type Props = {
  chapter: MemoryChapter;
  onDeepDive: (axis: ExplorationAxis) => void;
  onClose: () => void;
};

export default function FragmentDetailCard({
  chapter,
  onDeepDive,
  onClose,
}: Props) {
  const periodLabel = getPeriodLabel(chapter.fact.period);
  const layers = useMemo(() => extractLayers(chapter), [chapter]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="rounded-2xl bg-white/80 backdrop-blur-md p-5 shadow-md ring-1 ring-amber-200/20"
    >
      {/* 閉じるボタン */}
      <button
        onClick={onClose}
        className="float-right text-gray-300 hover:text-gray-500 text-sm"
      >
        ✕
      </button>

      {/* 1. タイトル */}
      <p className="text-base font-bold text-gray-800 leading-snug pr-6">
        {chapter.title || periodLabel}
      </p>

      {/* 2. サブ情報 */}
      <p className="mt-1 text-[10px] text-gray-400">
        {periodLabel}
        {layers.place && (
          <span className="mx-1 text-gray-300">·</span>
        )}
        {layers.place && layers.place}
      </p>

      {/* 7層表示 */}
      <div className="mt-4 flex flex-col gap-4">
        {/* 3. 何が起きていたか */}
        <FragmentLayer label="何が起きていたか" content={layers.events} />

        {/* 4. その時の内側 */}
        <FragmentLayer label="その時の内側" content={layers.innerState} />

        {/* 5. その時に覚えた生き方 */}
        <FragmentLayer
          label="その時に覚えた生き方"
          content={layers.learnedPatterns}
        />

        {/* 6. 今への影響 */}
        <FragmentLayer
          label="今への影響"
          content={layers.presentImpact}
          variant="highlight"
        />

        {/* 7. 次への接続 */}
        <FragmentLayer label="次への接続" content={layers.nextConnection} />

        {/* echoes */}
        {chapter.echoes.length > 0 && (
          <FragmentLayer
            label="今に残るもの"
            content={chapter.echoes}
          />
        )}

        {/* 深掘り導線 */}
        {layers.deepDivePrompts && layers.deepDivePrompts.length > 0 && (
          <FragmentLayer
            label="さらに深掘りできそうなこと"
            content={layers.deepDivePrompts}
            variant="prompts"
          />
        )}
      </div>

      {/* 深掘りボタン */}
      <div className="mt-5 flex flex-col gap-2">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => onDeepDive("daily_flow")}
          className="w-full rounded-2xl bg-amber-400/15 px-4 py-3 text-sm font-medium text-amber-700/70 transition-colors hover:bg-amber-400/25"
        >
          この時期をもっと掘る
        </motion.button>
      </div>

      {/* 日付 */}
      <p className="mt-3 text-center text-[9px] text-gray-300">
        {new Date(chapter.createdAt).toLocaleDateString("ja-JP")}
        {chapter.revisitCount > 0 && ` · 再訪 ${chapter.revisitCount}回`}
      </p>
    </motion.div>
  );
}
