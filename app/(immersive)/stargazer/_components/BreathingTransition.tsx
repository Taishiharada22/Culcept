// app/stargazer/_components/BreathingTransition.tsx
// 質問間の瞑想的な呼吸パーズ
// ユーザーを内省的な状態に導く — 速い回答後は長く、熟考後は短く
// 原則: これはローディングではない。意図的な心理的リセット
"use client";

import { useEffect, useCallback } from "react";
import { motion } from "framer-motion";

interface Props {
  /** 呼吸の持続時間 (ms) */
  durationMs: number;
  /** アクセントカラー — カテゴリの雰囲気に合わせる */
  accentColor?: string;
  /** 完了コールバック */
  onComplete: () => void;
  /** オプションのメッセージ（心理的安全プライム） */
  message?: string;
  lightMode?: boolean;
}

export default function BreathingTransition({
  durationMs,
  accentColor = "rgba(190,170,110,0.5)",
  onComplete,
  message,
  lightMode = true,
}: Props) {
  const stableOnComplete = useCallback(onComplete, [onComplete]);

  useEffect(() => {
    const timer = setTimeout(stableOnComplete, durationMs);
    return () => clearTimeout(timer);
  }, [durationMs, stableOnComplete]);

  const cycles = Math.max(1, Math.floor(durationMs / 2000));

  return (
    <motion.div
      className="flex flex-col items-center justify-center py-20"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22 }}
    >
      {/* 呼吸する光の円 */}
      <div className="relative w-12 h-12">
        {/* 外側のグロウ */}
        <motion.div
          className="absolute inset-0 rounded-full"
          style={{
            background: accentColor,
            filter: "blur(16px)",
          }}
          animate={{
            scale: [1, 1.8, 1],
            opacity: [0.3, 0.6, 0.3],
          }}
          transition={{
            duration: 2.2,
            repeat: cycles - 1,
            ease: "easeInOut",
          }}
        />
        {/* 内側の核 */}
        <motion.div
          className="absolute inset-3 rounded-full"
          style={{
            background: accentColor,
            filter: "blur(4px)",
          }}
          animate={{
            scale: [0.8, 1.2, 0.8],
            opacity: [0.5, 0.9, 0.5],
          }}
          transition={{
            duration: 2.2,
            repeat: cycles - 1,
            ease: "easeInOut",
          }}
        />
      </div>

      {/* メッセージ — 心理的安全のプライミング */}
      {message && (
        <motion.p
          className="font-body text-sm mt-8 text-center max-w-xs leading-relaxed"
          style={{
            color: lightMode
              ? "rgba(80,90,110,0.35)"
              : "rgba(120,125,140,0.4)",
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.4 }}
        >
          {message}
        </motion.p>
      )}
    </motion.div>
  );
}
