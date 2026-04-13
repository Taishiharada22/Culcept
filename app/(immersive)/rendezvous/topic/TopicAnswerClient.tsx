"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import {
  RvButton,
  RvBadge,
  RvCard,
  RV_COLORS,
  RV_CATEGORY_COLORS,
  type RvCategory,
} from "@/components/ui/rendezvous-design";
import { retryFetch } from "@/lib/retryFetch";
import { useSaveToast } from "@/components/ui/SaveToastProvider";

// =============================================================================
// TopicAnswerClient — お題回答入力UI
// =============================================================================

const MAX_LENGTH = 300;

type TopicData = {
  id: string;
  prompt: string;
  subtext?: string | null;
  category: string;
};

export function TopicAnswerClient({ category }: { category: string }) {
  const router = useRouter();
  const { showError } = useSaveToast();
  const [topic, setTopic] = useState<TopicData | null>(null);
  const [answer, setAnswer] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [answerCount, setAnswerCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const catColor = RV_CATEGORY_COLORS[category as RvCategory] ?? RV_COLORS.primary;

  const fetchTopic = useCallback(async () => {
    try {
      const res = await fetch(`/api/rendezvous/topic/today?category=${category}`);
      const data = await res.json();
      if (data.ok) {
        setTopic(data.topic);
        setAnswerCount(data.answerCount);
        if (data.myAnswer) {
          setAnswer(data.myAnswer.text);
          setSubmitted(true);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchTopic();
  }, [fetchTopic]);

  const handleSubmit = async () => {
    if (!topic || !answer.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await retryFetch<{ ok: boolean }>("/api/rendezvous/topic/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: topic.id,
          answerText: answer.trim(),
          category,
        }),
      });
      if (res.ok && res.data?.ok) {
        setSubmitted(true);
      } else {
        showError("回答の保存に失敗しました");
      }
    } catch {
      showError("回答の保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
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
          お題を読み込み中...
        </motion.div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="p-6 text-center">
        <p style={{ color: RV_COLORS.textSub }}>お題を取得できませんでした</p>
        <RvButton variant="ghost" onClick={() => router.back()} className="mt-4">
          戻る
        </RvButton>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex flex-col px-4 py-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-xs font-bold tracking-wider" style={{ color: RV_COLORS.textMuted }}>
          TODAY&apos;S TOPIC
        </span>
        {category !== "general" && <RvBadge category={category as RvCategory} />}
      </div>

      {/* お題 */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <RvCard elevated className="mb-6">
          <p
            className="text-lg font-bold leading-relaxed"
            style={{ color: RV_COLORS.text }}
          >
            {topic.prompt}
          </p>
          {topic.subtext && (
            <p className="text-xs mt-2" style={{ color: RV_COLORS.textMuted }}>
              {topic.subtext}
            </p>
          )}
        </RvCard>
      </motion.div>

      {/* 回答入力 or 完了 */}
      <AnimatePresence mode="wait">
        {submitted ? (
          <motion.div
            key="submitted"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center gap-4 flex-1 justify-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.2 }}
              className="text-4xl"
            >
              ✨
            </motion.div>
            <p className="text-sm font-bold" style={{ color: RV_COLORS.text }}>
              回答しました
            </p>
            <p className="text-xs" style={{ color: RV_COLORS.textSub }}>
              {answerCount > 0 && `${answerCount}人がこのお題に回答しています`}
            </p>
            <RvButton
              variant="primary"
              onClick={() =>
                router.push(
                  `/rendezvous/topic/gallery?topicId=${topic.id}&category=${category}`,
                )
              }
              className="mt-4"
            >
              みんなの回答を見る
            </RvButton>
            <RvButton variant="ghost" onClick={() => router.push("/rendezvous")}>
              ホームに戻る
            </RvButton>
          </motion.div>
        ) : (
          <motion.div
            key="input"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex flex-col flex-1"
          >
            <div className="relative flex-1 mb-4">
              <textarea
                value={answer}
                onChange={(e) => {
                  if (e.target.value.length <= MAX_LENGTH) {
                    setAnswer(e.target.value);
                  }
                }}
                placeholder="あなたの答えを書いてください..."
                className="w-full h-full min-h-[200px] rounded-2xl p-4 text-sm leading-relaxed resize-none focus:outline-none transition-all"
                style={{
                  backgroundColor: RV_COLORS.surface,
                  border: `1.5px solid ${answer ? catColor + "40" : RV_COLORS.border}`,
                  color: RV_COLORS.text,
                }}
              />
              <span
                className="absolute bottom-3 right-3 text-xs"
                style={{
                  color:
                    answer.length > MAX_LENGTH * 0.9
                      ? RV_COLORS.primary
                      : RV_COLORS.textMuted,
                }}
              >
                {answer.length}/{MAX_LENGTH}
              </span>
            </div>

            <p className="text-xs text-center mb-4" style={{ color: RV_COLORS.textMuted }}>
              回答は匿名で公開されます
            </p>

            <RvButton
              variant="glow"
              disabled={!answer.trim() || submitting}
              onClick={handleSubmit}
              className="w-full"
            >
              {submitting ? "送信中..." : "回答する"}
            </RvButton>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
