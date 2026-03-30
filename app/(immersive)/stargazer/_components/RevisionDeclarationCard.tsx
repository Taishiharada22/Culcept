// app/stargazer/_components/RevisionDeclarationCard.tsx
// 理解の修正カード — 公式宣言風のデザインで修正を通知する
"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard, GlassButton } from "@/components/ui/glassmorphism-design";
import type { Revision } from "@/lib/stargazer/revisionEngine";
import { generateRevisionDeclaration } from "@/lib/stargazer/revisionEngine";

interface RevisionDeclarationCardProps {
  revision: Revision;
  onAcknowledge: () => void;
}

function scoreToPercent(score: number): number {
  return Math.round(((score + 1) / 2) * 100);
}

export default function RevisionDeclarationCard({
  revision,
  onAcknowledge,
}: RevisionDeclarationCardProps) {
  const [acknowledged, setAcknowledged] = useState(revision.acknowledged);
  const declaration = generateRevisionDeclaration(revision);

  const handleAcknowledge = () => {
    setAcknowledged(true);
    onAcknowledge();
  };

  const oldPercent = scoreToPercent(revision.previousScore);
  const newPercent = scoreToPercent(revision.newScore);

  return (
    <GlassCard
      className="relative overflow-visible"
      variant="elevated"
      padding="none"
      hoverEffect={false}
    >
      {/* 公式感を演出する上部バー */}
      <div
        className="h-1 rounded-t-3xl"
        style={{
          background:
            "linear-gradient(90deg, rgba(139,92,246,0.6), rgba(236,72,153,0.4), rgba(139,92,246,0.6))",
        }}
      />

      <div className="relative p-5 space-y-4">
        {/* スタンプ / シール効果 */}
        <motion.div
          className="absolute top-4 right-4 w-14 h-14 rounded-full flex items-center justify-center"
          style={{
            background: "rgba(139,92,246,0.06)",
            border: "2px solid rgba(139,92,246,0.15)",
          }}
          initial={{ rotate: -15, scale: 0 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{
            type: "spring",
            stiffness: 200,
            damping: 15,
            delay: 0.3,
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="rgba(139,92,246,0.5)"
            strokeWidth={1.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="12" y1="18" x2="12" y2="12" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
        </motion.div>

        {/* ヘッダー */}
        <div className="pr-16">
          <motion.p
            className="text-[11px] font-bold uppercase tracking-[0.15em] mb-1.5"
            style={{ color: "rgba(139,92,246,0.55)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            {declaration.title}
          </motion.p>
          <motion.p
            className="text-[10px] font-medium"
            style={{ color: "rgba(100,116,139,0.5)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
          >
            {new Date(revision.createdAt).toLocaleDateString("ja-JP")} /
            {revision.observationsThatChanged}回の新規観測に基づく
          </motion.p>
        </div>

        {/* Before → After トランジション */}
        <motion.div
          className="rounded-xl overflow-hidden"
          style={{
            background: "rgba(139,92,246,0.03)",
            border: "1px solid rgba(139,92,246,0.08)",
          }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="flex items-stretch">
            {/* Before */}
            <div className="flex-1 p-3 text-center">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "rgba(148,163,184,0.6)" }}
              >
                以前の理解
              </p>
              <p
                className="text-sm font-bold"
                style={{ color: "rgba(148,163,184,0.7)" }}
              >
                {revision.previousAssessment}
              </p>
              <p
                className="text-[11px] mt-0.5 tabular-nums"
                style={{ color: "rgba(148,163,184,0.45)" }}
              >
                {oldPercent}%
              </p>
            </div>

            {/* Arrow */}
            <div className="flex items-center px-2">
              <motion.div
                initial={{ x: -4, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ delay: 0.4, duration: 0.18 }}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="rgba(139,92,246,0.4)"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </motion.div>
            </div>

            {/* After */}
            <div className="flex-1 p-3 text-center">
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-1"
                style={{ color: "rgba(139,92,246,0.55)" }}
              >
                修正後の理解
              </p>
              <motion.p
                className="text-sm font-bold"
                style={{ color: "rgba(139,92,246,0.9)" }}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5, type: "spring", stiffness: 300 }}
              >
                {revision.newAssessment}
              </motion.p>
              <motion.p
                className="text-[11px] mt-0.5 tabular-nums font-semibold"
                style={{ color: "rgba(139,92,246,0.6)" }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.55 }}
              >
                {newPercent}%
              </motion.p>
            </div>
          </div>
        </motion.div>

        {/* 修正理由の説明 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="space-y-2"
        >
          <p
            className="text-sm leading-relaxed"
            style={{ color: "rgba(15,23,42,0.82)" }}
          >
            {declaration.body}
          </p>
          <p
            className="text-[11px] leading-snug"
            style={{ color: "rgba(100,116,139,0.55)" }}
          >
            {revision.reason}
          </p>
        </motion.div>

        {/* インパクト説明 */}
        <motion.div
          className="rounded-lg px-3 py-2"
          style={{
            background: "rgba(139,92,246,0.04)",
            border: "1px solid rgba(139,92,246,0.06)",
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <p
            className="text-[11px] leading-snug"
            style={{ color: "rgba(100,116,139,0.6)" }}
          >
            {declaration.impact}
          </p>
        </motion.div>

        {/* 確認ボタン */}
        <AnimatePresence mode="wait">
          {!acknowledged ? (
            <motion.div
              key="btn"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ delay: 0.5 }}
            >
              <GlassButton
                variant="primary"
                size="sm"
                fullWidth
                onClick={handleAcknowledge}
              >
                確認しました
              </GlassButton>
            </motion.div>
          ) : (
            <motion.div
              key="ack"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 300, damping: 25 }}
              className="flex items-center justify-center gap-2 py-2"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="rgba(16,185,129,0.7)"
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span
                className="text-xs font-semibold"
                style={{ color: "rgba(16,185,129,0.7)" }}
              >
                確認済み
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </GlassCard>
  );
}
