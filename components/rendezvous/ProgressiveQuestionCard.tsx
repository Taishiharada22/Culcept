"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

// =============================================================================
// ProgressiveQuestionCard - プログレッシブ質問カード
// RendezvousHomeに組み込み、1日1問ずつ自然に提示する
// =============================================================================

type ProgressiveQuestion = {
  id: string;
  text: string;
  lowLabel: string;
  highLabel: string;
  phase: number;
};

type ProgressiveQuestionCardProps = {
  className?: string;
};

export function ProgressiveQuestionCard({ className }: ProgressiveQuestionCardProps) {
  const [question, setQuestion] = useState<ProgressiveQuestion | null>(null);
  const [answer, setAnswer] = useState(0.5);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [answeredCount, setAnsweredCount] = useState(0);

  // 今日の質問を取得
  useEffect(() => {
    fetch("/api/rendezvous/progressive-answer")
      .then((res) => res.json())
      .then((data) => {
        if (data.questions?.length > 0) {
          setQuestion(data.questions[0]);
        }
        setAnsweredCount(data.answeredCount ?? 0);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!question) return;
    setSubmitted(true);
    try {
      await fetch("/api/rendezvous/progressive-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: question.id, answer }),
      });
    } catch {
      // 失敗時もUIは成功表示のまま（次回再取得で再出題される）
    }
  }, [question, answer]);

  if (loading || !question || submitted) {
    if (submitted) {
      return (
        <motion.div
          className={cn(
            "rounded-2xl bg-white/60 backdrop-blur-md border border-white/30 shadow-sm p-5",
            className,
          )}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <p className="text-sm text-slate-600 text-center">
            回答しました。分身があなたの理解を深めています...
          </p>
          <div className="mt-2 text-center">
            <span className="text-[10px] text-slate-400">
              {answeredCount + 1}/14 回答済み
            </span>
          </div>
        </motion.div>
      );
    }
    return null; // 質問がない/ロード中は非表示
  }

  return (
    <motion.div
      className={cn(
        "rounded-2xl bg-white/60 backdrop-blur-md border border-white/30 shadow-sm overflow-hidden",
        className,
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      {/* ヘッダー */}
      <div className="px-4 pt-4 pb-2 bg-gradient-to-r from-violet-400/10 to-indigo-300/10">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-violet-500 font-medium uppercase tracking-wider">
            今日の質問
          </span>
          <span className="text-[10px] text-slate-400">
            {answeredCount}/14
          </span>
        </div>
      </div>

      {/* 質問 */}
      <div className="px-4 py-4">
        <p className="text-sm text-slate-700 leading-relaxed mb-4">
          {question.text}
        </p>

        {/* スライダー */}
        <div className="space-y-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={answer}
            onChange={(e) => setAnswer(parseFloat(e.target.value))}
            className="w-full accent-violet-500"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>{question.lowLabel}</span>
            <span>{question.highLabel}</span>
          </div>
        </div>

        {/* 送信ボタン */}
        <button
          onClick={handleSubmit}
          className="mt-4 w-full py-2.5 rounded-xl bg-violet-50/80 border border-violet-200/30 text-sm text-violet-600 hover:bg-violet-100/80 transition-colors"
        >
          回答する
        </button>
      </div>
    </motion.div>
  );
}
