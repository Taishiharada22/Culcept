"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Rating = "positive" | "negative";

interface AlterFeedbackProps {
  sessionId: string;
  responseId: string;
  feedbackMeta: Record<string, unknown>;
  onSubmit?: (rating: Rating) => void;
}

export function AlterFeedback({
  sessionId,
  responseId,
  feedbackMeta,
  onSubmit,
}: AlterFeedbackProps) {
  const [state, setState] = useState<"idle" | "text" | "done">("idle");
  const [rating, setRating] = useState<Rating | null>(null);
  const [freeText, setFreeText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = useCallback(async (r: Rating, text?: string) => {
    setSubmitting(true);
    try {
      await fetch("/api/stargazer/alter/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          session_id: sessionId,
          response_id: responseId,
          rating: r,
          free_text: text?.trim() || null,
          target_feature: "alter",
          response_metadata: feedbackMeta,
        }),
      });
    } catch {
      // Non-fatal: フィードバック送信失敗はUIに表示しない
    }
    setSubmitting(false);
    setState("done");
    onSubmit?.(r);
  }, [sessionId, responseId, feedbackMeta, onSubmit]);

  const handleRating = useCallback((r: Rating) => {
    setRating(r);
    setState("text");
  }, []);

  const handleTextSubmit = useCallback(() => {
    if (rating) submit(rating, freeText);
  }, [rating, freeText, submit]);

  const handleSkipText = useCallback(() => {
    if (rating) submit(rating);
  }, [rating, submit]);

  return (
    <AnimatePresence mode="wait">
      {state === "idle" && (
        <motion.div
          key="buttons"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-2 mt-1.5"
        >
          <button
            onClick={() => handleRating("positive")}
            className="text-[16px] opacity-40 hover:opacity-100 transition-opacity p-0.5"
            aria-label="良い回答"
          >
            👍
          </button>
          <button
            onClick={() => handleRating("negative")}
            className="text-[16px] opacity-40 hover:opacity-100 transition-opacity p-0.5"
            aria-label="改善が必要"
          >
            👎
          </button>
        </motion.div>
      )}

      {state === "text" && (
        <motion.div
          key="text"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-2 space-y-2"
        >
          <p className="text-[11px] text-text2">
            {rating === "positive" ? "良かった点があれば教えてください" : "改善点があれば教えてください"}
          </p>
          <textarea
            value={freeText}
            onChange={(e) => setFreeText(e.target.value.slice(0, 500))}
            placeholder="自由に記入（任意）"
            className="w-full text-[12px] bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-text1 placeholder:text-text3 resize-none focus:outline-none focus:border-indigo-500/30"
            rows={2}
            maxLength={500}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handleTextSubmit}
              disabled={submitting}
              className="text-[11px] px-3 py-1 rounded-md bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 transition-colors disabled:opacity-50"
            >
              {submitting ? "送信中..." : "送信"}
            </button>
            <button
              onClick={handleSkipText}
              disabled={submitting}
              className="text-[11px] px-3 py-1 text-text3 hover:text-text2 transition-colors"
            >
              スキップ
            </button>
          </div>
        </motion.div>
      )}

      {state === "done" && (
        <motion.div
          key="done"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="mt-1.5"
        >
          <p className="text-[11px] text-text3">
            {rating === "positive" ? "👍" : "👎"} ありがとうございます
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
