"use client";

/**
 * ParallelQuestion
 * 両者が同じ質問に回答 -> 両方提出後に同時開示
 * 回答前: 質問+テキスト入力
 * 回答済み・未開示: 待機アニメーション
 * 開示済み: 並列表示+インサイト
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";

type Props = {
  activityId: string;
  question: string;
  myAnswer: string | null;
  theirAnswer: string | null;
  revealed: boolean;
  insightText: string | null;
  onSubmit: (answer: string) => void;
  onReveal: () => void;
  iAmA: boolean;
};

export default function ParallelQuestion({
  question,
  myAnswer,
  theirAnswer,
  revealed,
  insightText,
  onSubmit,
  onReveal,
}: Props) {
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const bothAnswered = myAnswer !== null && theirAnswer !== null;

  async function handleSubmit() {
    if (!draft.trim() || submitting) return;
    setSubmitting(true);
    onSubmit(draft.trim());
  }

  return (
    <GlassCard variant="default" padding="md" hoverEffect={false}>
      {/* Header */}
      <div className="text-center mb-4">
        <span
          className="inline-block text-[10px] font-bold tracking-widest mb-1"
          style={{ color: "#6366F1" }}
        >
          PARALLEL QUESTION
        </span>
        <h3 className="text-base font-bold text-slate-800 leading-relaxed">
          {question}
        </h3>
      </div>

      {/* Phase: Not answered yet */}
      {!myAnswer && (
        <FadeInView>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="あなたの回答を書いてください..."
            className="w-full min-h-[80px] p-3 rounded-xl border text-sm text-slate-800 resize-y outline-none font-inherit transition-colors focus:border-indigo-300"
            style={{
              borderColor: "rgba(99,102,241,0.15)",
              background: "rgba(99,102,241,0.03)",
            }}
          />
          <GlassButton
            variant={draft.trim() ? "primary" : "secondary"}
            fullWidth
            disabled={!draft.trim() || submitting}
            loading={submitting}
            onClick={handleSubmit}
            className="mt-3"
            style={{
              background: draft.trim()
                ? "linear-gradient(135deg, #6366F1, #818CF8)"
                : undefined,
            }}
          >
            {submitting ? "送信中..." : "送信"}
          </GlassButton>
        </FadeInView>
      )}

      {/* Phase: Answered, waiting for them */}
      {myAnswer && !bothAnswered && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center py-5"
        >
          <motion.div
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-3xl mb-2"
          >
            &#x23F3;
          </motion.div>
          <p className="text-xs text-slate-400 font-semibold">
            相手の回答を待っています...
          </p>
          <div className="mt-3 px-3.5 py-2 rounded-xl bg-indigo-50/60 text-sm text-slate-500 leading-relaxed">
            あなたの回答: {myAnswer}
          </div>
        </motion.div>
      )}

      {/* Phase: Both answered, not yet revealed */}
      {bothAnswered && !revealed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-4"
        >
          <p className="text-sm font-semibold mb-3" style={{ color: "#6366F1" }}>
            両方の回答が揃いました
          </p>
          <GlassButton
            variant="gradient"
            onClick={onReveal}
            style={{
              background: "linear-gradient(135deg, #6366F1, #A78BFA)",
              boxShadow: "0 4px 16px rgba(99,102,241,0.3)",
            }}
          >
            同時に開く
          </GlassButton>
        </motion.div>
      )}

      {/* Phase: Revealed */}
      <AnimatePresence>
        {revealed && myAnswer && theirAnswer && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <div className="flex gap-2.5 mb-3.5">
              {/* My answer */}
              <div className="flex-1 p-3 rounded-xl bg-indigo-50/80 border border-indigo-100/80">
                <div
                  className="text-[9px] font-bold mb-1"
                  style={{ color: "#6366F1" }}
                >
                  あなた
                </div>
                <div className="text-[13px] text-slate-800 leading-relaxed">
                  {myAnswer}
                </div>
              </div>
              {/* Their answer */}
              <div className="flex-1 p-3 rounded-xl bg-pink-50/80 border border-pink-100/80">
                <div
                  className="text-[9px] font-bold mb-1"
                  style={{ color: "#EC4899" }}
                >
                  相手
                </div>
                <div className="text-[13px] text-slate-800 leading-relaxed">
                  {theirAnswer}
                </div>
              </div>
            </div>

            {/* Insight */}
            {insightText && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="p-3 rounded-xl border"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.06), rgba(139,92,246,0.06))",
                  borderColor: "rgba(99,102,241,0.08)",
                }}
              >
                <div className="text-[9px] font-bold text-slate-400 mb-1">
                  INSIGHT
                </div>
                <div className="text-xs text-slate-500 leading-relaxed">
                  {insightText}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
