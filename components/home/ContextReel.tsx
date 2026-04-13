"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AlterInsightCard } from "@/lib/stargazer/alterInsightCardBuilder";

type Props = {
  /** Builder が確定した3枚（1 pinned + 2 secondary） */
  cards: AlterInsightCard[];
  /** カードタップ時のアクション（composerSeed 優先、href は Link） */
  onCardAction?: (card: AlterInsightCard) => void;
  /** Secondary 回転インターバル (ms) */
  intervalMs?: number;
};

export default function ContextReel({
  cards,
  onCardAction,
  intervalMs = 5000,
}: Props) {
  const pinned = cards.find((c) => c.pinned) ?? cards[0];
  const secondary = cards.filter((c) => !c.pinned);

  const [secIdx, setSecIdx] = useState(0);

  // Secondary 2枚を5秒ローテーション
  useEffect(() => {
    if (secondary.length <= 1) return;
    const timer = setInterval(() => {
      setSecIdx((i) => (i + 1) % secondary.length);
    }, intervalMs);
    return () => clearInterval(timer);
  }, [secondary.length, intervalMs]);

  const handleCardTap = useCallback(
    (card: AlterInsightCard) => {
      if (card.href && !card.composerSeed) {
        // href のみ: ナビゲーション（onCardAction に委譲）
        onCardAction?.(card);
        return;
      }
      // composerSeed 優先: タップ即投入 + focus
      onCardAction?.(card);
    },
    [onCardAction],
  );

  if (!pinned) return null;

  const currentSecondary = secondary[secIdx % Math.max(secondary.length, 1)];

  return (
    <div className="flex flex-col gap-0">
      {/* ── 1段目: pinned（固定・回さない） ── */}
      <CardRow card={pinned} onTap={handleCardTap} />

      {/* ── 2段目: secondary（2枚ローテーション） ── */}
      {currentSecondary && (
        <div className="relative overflow-hidden" style={{ minHeight: 48 }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSecondary.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: "easeInOut" }}
            >
              <CardRow card={currentSecondary} onTap={handleCardTap} />
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

/* ═══ CardRow ═══ */

function CardRow({
  card,
  onTap,
}: {
  card: AlterInsightCard;
  onTap: (card: AlterInsightCard) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onTap(card)}
      className="w-full text-left transition-opacity active:opacity-70 focus:outline-none"
    >
      <div className="flex items-start gap-2.5 px-6 py-2.5">
        <motion.span
          className="text-sm leading-none flex-shrink-0 mt-0.5 inline-block"
          animate={card.icon === "＊" ? {
            rotate: [0, 90, 180, 270, 360],
            scale: [1, 1.15, 1, 1.15, 1],
          } : undefined}
          transition={card.icon === "＊" ? {
            duration: 4,
            repeat: Infinity,
            ease: "easeInOut",
          } : undefined}
        >
          {card.icon}
        </motion.span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-text1 leading-relaxed line-clamp-2">
            {card.text}
          </p>
          {card.subtext && (
            <span className="text-[10px] text-text4 mt-0.5 block">
              {card.subtext}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
