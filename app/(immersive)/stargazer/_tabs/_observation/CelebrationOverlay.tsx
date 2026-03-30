// CelebrationOverlay — 観測完了時の達成アニメーション
// 通常: 3秒間の暗転 + テキスト出現 + パーティクル → 自動遷移
// マイルストーン: 5秒間 + ゴールド演出 + 機能解放アナウンス
"use client";

import { useEffect } from "react";
import { motion } from "framer-motion";
import type { FeatureGate } from "@/lib/stargazer/featureUnlock";

interface CelebrationOverlayProps {
  totalAnswered: number;
  onDone: () => void;
  durationMs?: number;
  /** マイルストーン解放時に渡す（Peak-End Rule: セッション最後を特別に） */
  justUnlocked?: FeatureGate | null;
}

export default function CelebrationOverlay({
  totalAnswered,
  onDone,
  durationMs = 3000,
  justUnlocked,
}: CelebrationOverlayProps) {
  const isMilestone = !!justUnlocked;
  const duration = isMilestone ? 5000 : durationMs;

  useEffect(() => {
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [onDone, duration]);

  // ── マイルストーン演出 ──
  if (isMilestone) {
    return (
      <motion.div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center"
        style={{
          background: "linear-gradient(180deg, rgba(24,18,8,0.96) 0%, rgba(36,28,12,0.94) 100%)",
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={onDone}
      >
        {/* ゴールドパーティクル — 8つが中央に収束 */}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const angle = (i / 8) * Math.PI * 2 - Math.PI / 2;
          const startX = Math.cos(angle) * 160;
          const startY = Math.sin(angle) * 160;
          return (
            <motion.div
              key={i}
              className="absolute text-sm"
              style={{ color: "rgba(201,169,110,0.9)" }}
              initial={{ x: startX, y: startY, opacity: 0, scale: 0.2 }}
              animate={{
                x: [startX, 0],
                y: [startY, -30],
                opacity: [0, 1, 0.7],
                scale: [0.2, 1.5, 0.9],
              }}
              transition={{ duration: 2.0, delay: 0.2 + i * 0.05, ease: "easeOut" }}
            >
              ✦
            </motion.div>
          );
        })}

        {/* パルスリング（ゴールド） */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 240,
            height: 240,
            border: "2px solid rgba(201,169,110,0.3)",
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.8, 1.4, 1.6],
            opacity: [0, 0.6, 0.25, 0.15],
          }}
          transition={{ duration: 3, delay: 0.3, ease: "easeOut" }}
        />
        <motion.div
          className="absolute rounded-full"
          style={{
            width: 280,
            height: 280,
            border: "1px solid rgba(201,169,110,0.15)",
          }}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 2.0, 1.6], opacity: [0, 0.3, 0.08] }}
          transition={{ duration: 3.5, delay: 0.5, ease: "easeOut" }}
        />

        {/* メインコンテンツ */}
        <motion.div
          className="text-center relative z-10"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.5 }}
        >
          {/* アイコン */}
          <motion.span
            className="text-5xl block mb-5"
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", delay: 0.7, stiffness: 180, damping: 12 }}
          >
            {justUnlocked.icon}
          </motion.span>

          {/* 解放ラベル */}
          <motion.span
            className="font-mono-sg text-[0.65rem] tracking-[0.25em] block mb-3"
            style={{ color: "rgba(201,169,110,0.6)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.0 }}
          >
            UNLOCKED
          </motion.span>

          {/* 機能名 */}
          <h2
            className="font-display text-2xl font-bold tracking-wide"
            style={{ color: "rgba(201,169,110,0.95)" }}
          >
            {justUnlocked.label}
          </h2>

          {/* 説明 */}
          <motion.p
            className="mt-3 text-sm max-w-[260px] mx-auto leading-relaxed"
            style={{ color: "rgba(255,255,255,0.6)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4 }}
          >
            {justUnlocked.description}
          </motion.p>

          {/* 累計カウント */}
          <motion.p
            className="mt-5 font-mono-sg text-xs"
            style={{ color: "rgba(201,169,110,0.35)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.0 }}
          >
            {justUnlocked.requiredObservations}回の観測が、この扉を開いた
          </motion.p>
        </motion.div>
      </motion.div>
    );
  }

  // ── 通常演出 ──
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(180deg, rgba(16,20,36,0.94) 0%, rgba(24,28,48,0.92) 100%)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      onClick={onDone}
    >
      {/* 星パーティクル — 4つが中央に集まる */}
      {[0, 1, 2, 3].map((i) => {
        const angle = (i / 4) * Math.PI * 2 - Math.PI / 2;
        const startX = Math.cos(angle) * 120;
        const startY = Math.sin(angle) * 120;
        return (
          <motion.div
            key={i}
            className="absolute text-lg"
            style={{ color: "rgba(201,169,110,0.8)" }}
            initial={{ x: startX, y: startY, opacity: 0, scale: 0.3 }}
            animate={{ x: 0, y: -20, opacity: [0, 1, 0.6], scale: [0.3, 1.2, 0.8] }}
            transition={{ duration: 1.5, delay: 0.3 + i * 0.06, ease: "easeOut" }}
          >
            ✦
          </motion.div>
        );
      })}

      {/* メインテキスト */}
      <motion.div
        className="text-center relative z-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
      >
        <motion.span
          className="text-3xl block mb-4"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.6, stiffness: 200 }}
        >
          🔭
        </motion.span>
        <h2
          className="font-display text-2xl font-bold tracking-wide"
          style={{ color: "rgba(255,255,255,0.95)" }}
        >
          観測完了
        </h2>
        <motion.p
          className="mt-3 text-sm"
          style={{ color: "rgba(201,169,110,0.7)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
        >
          {totalAnswered}つの応答が、あなたの輪郭を書き換えます
        </motion.p>
      </motion.div>

      {/* ゴールドリング */}
      <motion.div
        className="absolute rounded-full"
        style={{
          width: 200,
          height: 200,
          border: "1px solid rgba(201,169,110,0.15)",
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.5, 1.2], opacity: [0, 0.4, 0.15] }}
        transition={{ duration: 2, delay: 0.5, ease: "easeOut" }}
      />
    </motion.div>
  );
}
