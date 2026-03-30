"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvButton,
  RvCard,
  RV_COLORS,
} from "@/components/ui/rendezvous-design";
import {
  TopicAnswerCard,
  type TopicAnswer,
} from "@/components/rendezvous/TopicAnswerCard";

// =============================================================================
// GalleryClient — 匿名回答ギャラリー
// =============================================================================

export function GalleryClient({
  topicId,
  category,
}: {
  topicId: string;
  category: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<TopicAnswer[]>([]);
  const [topicPrompt, setTopicPrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [mutualMatch, setMutualMatch] = useState(false);

  const fetchAnswers = useCallback(
    async (pageNum: number, append = false) => {
      try {
        const res = await fetch(
          `/api/rendezvous/topic/gallery?topicId=${topicId}&category=${category}&page=${pageNum}&limit=20`,
        );
        const data = await res.json();
        if (data.ok) {
          if (append) {
            setAnswers((prev) => [...prev, ...data.answers]);
          } else {
            setAnswers(data.answers);
          }
          setHasMore(data.hasMore);
        }
      } finally {
        setLoading(false);
      }
    },
    [topicId, category],
  );

  const fetchTopic = useCallback(async () => {
    const res = await fetch(
      `/api/rendezvous/topic/today?category=${category}`,
    );
    const data = await res.json();
    if (data.ok) {
      setTopicPrompt(data.topic.prompt);
    }
  }, [category]);

  useEffect(() => {
    fetchTopic();
    fetchAnswers(0);
  }, [fetchTopic, fetchAnswers]);

  const handleLike = async (answerId: string) => {
    try {
      const res = await fetch("/api/rendezvous/topic/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answerId }),
      });
      const data = await res.json();
      if (data.ok && data.isMutual) {
        setMutualMatch(true);
        setTimeout(() => setMutualMatch(false), 3000);
      }
    } catch {
      // ignore
    }
  };

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchAnswers(next, true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <motion.div
          animate={{ opacity: [0.3, 1, 0.3] }}
          transition={{ repeat: Infinity, duration: 1.5 }}
          className="text-sm"
          style={{ color: RV_COLORS.textMuted }}
        >
          回答を読み込み中...
        </motion.div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      {/* お題表示 */}
      <RvCard className="mb-6">
        <span
          className="text-xs font-bold tracking-wider"
          style={{ color: RV_COLORS.textMuted }}
        >
          TODAY&apos;S TOPIC
        </span>
        <p
          className="text-sm font-bold leading-relaxed mt-2"
          style={{ color: RV_COLORS.text }}
        >
          {topicPrompt}
        </p>
      </RvCard>

      {/* マッチ通知 */}
      <AnimatePresence>
        {mutualMatch && (
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-20 left-4 right-4 z-50 rounded-2xl p-4 text-center"
            style={{
              background: RV_COLORS.gradient,
              color: "#FFFFFF",
              boxShadow: `0 8px 32px ${RV_COLORS.primaryGlow}`,
            }}
          >
            <p className="text-lg font-bold">✨ 相互共鳴！</p>
            <p className="text-xs mt-1">お互いの回答に惹かれ合いました</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 回答リスト */}
      {answers.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm" style={{ color: RV_COLORS.textSub }}>
            まだ他の人の回答がありません
          </p>
          <RvButton
            variant="ghost"
            onClick={() => router.push("/rendezvous")}
            className="mt-4"
          >
            ホームに戻る
          </RvButton>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {answers.map((answer, i) => (
            <motion.div
              key={answer.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <TopicAnswerCard answer={answer} onLike={handleLike} />
            </motion.div>
          ))}

          {hasMore && (
            <RvButton
              variant="ghost"
              onClick={loadMore}
              className="mx-auto mt-4"
            >
              もっと見る
            </RvButton>
          )}
        </div>
      )}
    </div>
  );
}
