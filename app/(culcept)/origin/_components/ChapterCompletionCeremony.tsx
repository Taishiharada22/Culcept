"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface Props {
  chapterCount: number;
  chapterTitle: string;
  onDismiss: () => void;
}

const STATS_CONFIG = [
  { label: "記憶の断片", getValue: (n: number) => `${n}`, color: "rgba(245,158,11,0.8)" },
  { label: "地図の広がり", getValue: (n: number) => n <= 1 ? "始まったばかり" : n < 5 ? "プロフィールが見え始めた" : "形になってきた", color: "rgba(99,102,241,0.8)" },
];

/**
 * チャプター完了セレモニー
 * スタガードスタッツ表示 + 祝福メッセージ + 自動遷移(5秒)
 */
export default function ChapterCompletionCeremony({
  chapterCount,
  chapterTitle,
  onDismiss,
}: Props) {
  const [autoProgress, setAutoProgress] = useState(0);

  // 5秒自動遷移
  useEffect(() => {
    const interval = setInterval(() => {
      setAutoProgress((prev) => {
        const next = prev + 2;
        if (next >= 100) {
          clearInterval(interval);
          setTimeout(onDismiss, 300);
        }
        return Math.min(next, 100);
      });
    }, 100);
    return () => clearInterval(interval);
  }, [onDismiss]);

  return (
    <motion.div
      className="flex flex-col items-center gap-6 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* 光の演出 */}
      <motion.div
        className="relative h-20 w-20"
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: "rgba(245,158,11,0.3)",
            filter: "blur(20px)",
            animation: "sg-breathe 3s ease-in-out infinite",
          }}
        />
        <div className="absolute inset-0 flex items-center justify-center text-4xl">
          ✨
        </div>
      </motion.div>

      {/* メインメッセージ */}
      <motion.div
        className="flex flex-col items-center gap-2"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      >
        <h2 className="text-lg font-bold" style={{ color: "#3a2a1a" }}>
          記憶が刻まれました
        </h2>
        <p className="text-sm text-gray-500">
          「{chapterTitle}」
        </p>
      </motion.div>

      {/* スタガードスタッツ */}
      <div className="flex w-full max-w-xs flex-col gap-3">
        {STATS_CONFIG.map((stat, i) => (
          <motion.div
            key={stat.label}
            className="flex items-center justify-between rounded-2xl border border-amber-200/30 bg-white/60 px-4 py-3 backdrop-blur-sm"
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              delay: 0.8 + i * 0.15,
              type: "spring",
              stiffness: 300,
              damping: 25,
            }}
          >
            <span className="text-xs text-gray-500">{stat.label}</span>
            <span
              className="text-sm font-bold"
              style={{ color: stat.color }}
            >
              {stat.getValue(chapterCount)}
            </span>
          </motion.div>
        ))}
      </div>

      {/* プログレスバー（自動遷移） */}
      <motion.div
        className="mt-4 h-1 w-32 overflow-hidden rounded-full bg-gray-200/50"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <div
          className="h-full rounded-full bg-amber-400/60 transition-all"
          style={{ width: `${autoProgress}%` }}
        />
      </motion.div>

      {/* スキップボタン */}
      <motion.button
        className="text-xs text-gray-400"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        onClick={onDismiss}
      >
        タップしてスキップ
      </motion.button>
    </motion.div>
  );
}
