"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RvCard, RV_COLORS } from "@/components/ui/rendezvous-design";

// =============================================================================
// TopicAnswerCard — ギャラリー内の匿名回答カード
// =============================================================================

export type TopicAnswer = {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  isLiked: boolean;
};

export function TopicAnswerCard({
  answer,
  onLike,
}: {
  answer: TopicAnswer;
  onLike: (answerId: string) => void;
}) {
  const [isLiked, setIsLiked] = useState(answer.isLiked);
  const [likeCount, setLikeCount] = useState(answer.likeCount);
  const [isAnimating, setIsAnimating] = useState(false);

  const handleLike = () => {
    if (isLiked) return; // いいね取り消し不可
    setIsLiked(true);
    setLikeCount((c) => c + 1);
    setIsAnimating(true);
    onLike(answer.id);
    setTimeout(() => setIsAnimating(false), 600);
  };

  return (
    <RvCard className="relative">
      {/* 回答テキスト */}
      <p
        className="text-sm leading-relaxed mb-4 whitespace-pre-wrap"
        style={{ color: RV_COLORS.text }}
      >
        {answer.text}
      </p>

      {/* フッター */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: RV_COLORS.textMuted }}>
          {formatTimeAgo(answer.createdAt)}
        </span>

        <motion.button
          whileTap={{ scale: 1.2 }}
          onClick={handleLike}
          className="flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-all"
          style={{
            backgroundColor: isLiked ? `${RV_COLORS.primary}12` : "transparent",
            border: `1px solid ${isLiked ? `${RV_COLORS.primary}40` : RV_COLORS.border}`,
          }}
        >
          <AnimatePresence mode="wait">
            {isAnimating ? (
              <motion.span
                key="animating"
                initial={{ scale: 0, rotate: -30 }}
                animate={{ scale: 1.3, rotate: 0 }}
                exit={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 15 }}
              >
                💗
              </motion.span>
            ) : (
              <motion.span key="static">
                {isLiked ? "💗" : "🤍"}
              </motion.span>
            )}
          </AnimatePresence>
          {likeCount > 0 && (
            <span
              className="text-xs font-bold"
              style={{ color: isLiked ? RV_COLORS.primary : RV_COLORS.textMuted }}
            >
              {likeCount}
            </span>
          )}
        </motion.button>
      </div>
    </RvCard>
  );
}

function formatTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "たった今";
  if (mins < 60) return `${mins}分前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}時間前`;
  return `${Math.floor(hours / 24)}日前`;
}
