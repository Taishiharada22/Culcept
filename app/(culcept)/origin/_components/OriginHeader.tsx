"use client";

import { motion } from "framer-motion";

type Props = {
  chapterCount: number;
  explorationTheme?: string;
};

export default function OriginHeader({
  chapterCount,
  explorationTheme,
}: Props) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center gap-3 pb-6 pt-6 text-center"
    >
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">
          Origin
        </h1>
        <p className="mt-1 text-[11px] tracking-wide text-gray-400">
          今に至るまでの航路
        </p>
      </div>

      <p className="max-w-[18rem] text-[13px] leading-[1.8] text-gray-500">
        今の自分がどう作られてきたか ― 過去の断片を辿ってプロフィールを描きます
      </p>

      {/* 探索テーマ表示 */}
      {explorationTheme && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-full bg-amber-50/60 px-3 py-1 text-[11px] text-amber-700/70 ring-1 ring-amber-200/25"
        >
          {explorationTheme}
        </motion.div>
      )}

      {/* 断片数バッジ */}
      {chapterCount > 0 && (
        <p className="text-[10px] text-gray-300">
          {chapterCount} 断片
        </p>
      )}
    </motion.section>
  );
}
