"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { FormationDigest, DigestCard } from "@/lib/origin/v7/formationDigest";

interface Props {
  digest: FormationDigest;
  onClose: () => void;
}

/**
 * 形成史ダイジェスト — Spotify Wrapped風のフルスクリーンストーリー
 * カードを1枚ずつ表示し、タップで進行
 */
export default function FormationDigestView({ digest, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);

  const cards = digest.cards;
  const card = cards[currentIndex];
  const isLast = currentIndex >= cards.length - 1;
  const progress = (currentIndex + 1) / cards.length;

  const goNext = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    setDirection(1);
    setCurrentIndex((prev) => prev + 1);
  }, [isLast, onClose]);

  const goPrev = useCallback(() => {
    if (currentIndex <= 0) return;
    setDirection(-1);
    setCurrentIndex((prev) => prev - 1);
  }, [currentIndex]);

  if (!card) return null;

  const typeLabel: Record<DigestCard["type"], string> = {
    stat: "データ",
    pattern: "パターン",
    insight: "洞察",
    question: "問い",
    summary: "まとめ",
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex flex-col"
      style={{ background: "linear-gradient(135deg, #0f0a1a, #1a1030, #0a0f20)" }}
    >
      {/* プログレスバー */}
      <div className="flex gap-1 px-4 pt-4" style={{ paddingTop: "max(env(safe-area-inset-top), 16px)" }}>
        {cards.map((_, i) => (
          <div
            key={i}
            className="h-0.5 flex-1 rounded-full transition-all duration-300"
            style={{
              background: i <= currentIndex
                ? "rgba(255,255,255,0.8)"
                : "rgba(255,255,255,0.15)",
            }}
          />
        ))}
      </div>

      {/* 閉じるボタン */}
      <div className="flex justify-end px-4 pt-2">
        <button
          onClick={onClose}
          className="rounded-full px-3 py-1 text-xs text-white/50 transition-colors hover:text-white/80"
        >
          ✕ 閉じる
        </button>
      </div>

      {/* カードエリア（タップで進行） */}
      <div className="flex flex-1 items-center justify-center px-6">
        <div className="relative w-full max-w-md" onClick={goNext}>
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={card.id}
              custom={direction}
              initial={{ opacity: 0, y: direction > 0 ? 40 : -40, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: direction > 0 ? -40 : 40, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="flex flex-col items-center text-center"
            >
              {/* 種別バッジ */}
              <span
                className="mb-6 rounded-full px-3 py-1 text-[10px] font-semibold tracking-wider uppercase"
                style={{
                  background: `${card.accent}20`,
                  color: card.accent,
                }}
              >
                {typeLabel[card.type]}
              </span>

              {/* Emoji */}
              <motion.span
                className="mb-6 text-5xl"
                initial={{ scale: 0.5, rotate: -10 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.15 }}
              >
                {card.emoji}
              </motion.span>

              {/* タイトル */}
              <motion.h2
                className="mb-4 text-2xl font-bold text-white"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {card.title}
              </motion.h2>

              {/* 本文 */}
              <motion.p
                className="max-w-sm text-sm leading-relaxed text-white/70"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
              >
                {card.body}
              </motion.p>

              {/* アクセントライン */}
              <motion.div
                className="mt-8 h-0.5 w-12 rounded-full"
                style={{ background: card.accent }}
                initial={{ width: 0 }}
                animate={{ width: 48 }}
                transition={{ delay: 0.5, duration: 0.4 }}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* ナビゲーション */}
      <div
        className="flex items-center justify-between px-6 pb-6"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom), 24px)" }}
      >
        <button
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className={`rounded-full px-4 py-2 text-xs font-medium transition-colors ${
            currentIndex > 0
              ? "text-white/60 hover:text-white/90"
              : "text-transparent pointer-events-none"
          }`}
        >
          ← 戻る
        </button>

        <span className="text-xs text-white/30">
          {currentIndex + 1} / {cards.length}
        </span>

        <button
          onClick={(e) => { e.stopPropagation(); goNext(); }}
          className="rounded-full px-4 py-2 text-xs font-semibold text-white/80 transition-colors hover:text-white"
        >
          {isLast ? "閉じる" : "次へ →"}
        </button>
      </div>
    </motion.div>
  );
}
