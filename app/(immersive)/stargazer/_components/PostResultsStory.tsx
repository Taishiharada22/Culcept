// app/stargazer/_components/PostResultsStory.tsx
// 最終結果後のストーリー + ログインCTA
// 3パート構成:
//   Part 1: 観測する — Stargazer / Origin / Phenotype / My-Style
//   Part 2: 理解する — Alter
//   Part 3: 現実に還元する — Calendar + Rendezvous
// 最終: ログイン/保存CTA
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  /** ログイン/保存ボタン押下 */
  onSave: () => void;
  /** 匿名ユーザーかどうか */
  isAnonymous?: boolean;
  /** ログインページへ遷移 */
  onLogin?: () => void;
}

// ---------------------------------------------------------------------------
// Story cards
// ---------------------------------------------------------------------------

interface StoryCard {
  id: string;
  emoji?: string;
  title: string;
  body: string;
  accent?: string;
}

const STORY_CARDS: StoryCard[] = [
  // Part 1: 観測する — 4つの観測機能
  {
    id: "stargazer",
    emoji: "🧠",
    title: "Stargazer — あなたの思考・性格を見る",
    body: "あなたの判断パターン、認知の癖、\n感情の動き方を深層から観測する。",
    accent: "#5B7FFF",
  },
  {
    id: "origin",
    emoji: "📝",
    title: "Origin — to do list & 日記を書く",
    body: "日々の行動と感情を記録し、\nあなたのパターンを可視化する。",
    accent: "#B09050",
  },
  {
    id: "phenotype",
    emoji: "🫀",
    title: "Phenotype — あなたの体を作る",
    body: "パーソナルカラー、体型、\nあなたの身体的特徴を科学的に分析する。",
    accent: "#E05050",
  },
  {
    id: "my_style",
    emoji: "👗",
    title: "My-Style — あなたのショーケースを作る",
    body: "スタイルDNA、美意識、表現の型。\nあなたらしさを構造化する。",
    accent: "#50B0A0",
  },
  // Part 2: 理解する — Alter
  {
    id: "alter",
    title: "4つの観測が重なるとき、Alterが目を覚ます。",
    body: "あなたが言葉にする前の気持ちまで、先にわかってしまう存在。\nもうひとりのあなた。",
    accent: "#8B5CF6",
  },
  // Part 3: 現実に還元する
  {
    id: "daily",
    title: "Alterがあなたの毎日を変える。",
    body: "カレンダーが最適なコーデを組む。\nRendezvousが、あなたに合う人を見つける。\n友達も、恋人も、ビジネスも、人生のパートナーも。",
    accent: "#F59E0B",
  },
  {
    id: "closing",
    title: "理解は、現実になる。",
    body: "",
    accent: "#121830",
  },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function PostResultsStory({ onSave, isAnonymous, onLogin }: Props) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showCta, setShowCta] = useState(false);

  const currentCard = STORY_CARDS[currentCardIndex];
  const isLastCard = currentCardIndex >= STORY_CARDS.length - 1;

  const handleTap = useCallback(() => {
    if (isLastCard) {
      setShowCta(true);
    } else {
      setCurrentCardIndex((prev) => prev + 1);
    }
  }, [isLastCard]);

  // ---------------------------------------------------------------------------
  // CTA screen
  // ---------------------------------------------------------------------------
  if (showCta) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#fafbfe] px-6">
        <motion.div
          className="max-w-sm text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <p className="mb-8 text-sm leading-relaxed text-[rgba(18,24,44,0.6)]">
            ここまでの観測結果は保存されています。
            <br />
            ログインすると全ての結果が見られます。
          </p>

          {isAnonymous ? (
            <>
              <motion.button
                onClick={onLogin}
                className="mx-auto mb-4 flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-[#121830] px-8 py-4 text-base font-medium text-white shadow-[0_4px_16px_rgba(18,24,44,0.2)]"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                ログインして保存する
              </motion.button>
              <button
                onClick={onSave}
                className="text-sm text-[rgba(18,24,44,0.4)] underline underline-offset-4 transition-colors hover:text-[rgba(18,24,44,0.6)]"
              >
                ログインせずに続ける
              </button>
            </>
          ) : (
            <motion.button
              onClick={onSave}
              className="mx-auto flex w-full max-w-xs items-center justify-center gap-2 rounded-full bg-[#121830] px-8 py-4 text-base font-medium text-white shadow-[0_4px_16px_rgba(18,24,44,0.2)]"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              保存して日常観測を始める
            </motion.button>
          )}

          <p className="mt-6 text-xs text-[rgba(18,24,44,0.25)]">
            観測データはいつでも削除できます
          </p>
        </motion.div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Story cards
  // ---------------------------------------------------------------------------
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#fafbfe] px-6"
      onClick={handleTap}
      style={{ cursor: "pointer" }}
    >
      {/* Progress dots */}
      <div className="absolute top-6 left-1/2 flex -translate-x-1/2 gap-1.5">
        {STORY_CARDS.map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === currentCardIndex
                ? "w-6 bg-[#b09050]"
                : i < currentCardIndex
                  ? "w-1.5 bg-[rgba(18,24,44,0.15)]"
                  : "w-1.5 bg-[rgba(18,24,44,0.08)]"
            }`}
          />
        ))}
      </div>

      {/* Card content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentCard.id}
          className="max-w-md text-center"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        >
          {currentCard.emoji && (
            <motion.span
              className="mb-4 block text-5xl"
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
            >
              {currentCard.emoji}
            </motion.span>
          )}

          <h2
            className="mb-4 font-['Cormorant_Garamond',serif] text-2xl font-light"
            style={{ color: currentCard.accent ?? "#121830" }}
          >
            {currentCard.title}
          </h2>

          {currentCard.body && (
            <p className="whitespace-pre-line text-base leading-relaxed text-[rgba(18,24,44,0.7)]">
              {currentCard.body}
            </p>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Tap hint */}
      <motion.p
        className="absolute bottom-8 text-xs text-[rgba(18,24,44,0.2)]"
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 2, repeat: Infinity }}
      >
        タップして次へ
      </motion.p>
    </div>
  );
}
