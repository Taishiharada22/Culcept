"use client";

/**
 * MilestoneReflection
 * チャットインラインのマイルストーンカード
 * 閾値到達時に表示（初返信、10通目、初ボイス、3日連続等）
 * マイクロリフレクション(1-5スケール)収集
 */

import { useState } from "react";
import { motion } from "framer-motion";

export type MilestoneType =
  | "first_reply"
  | "ten_messages"
  | "first_voice"
  | "three_day_streak"
  | "first_activity"
  | "mutual_activity";

type Props = {
  milestoneType: MilestoneType;
  candidateId: string;
  onComplete?: () => void;
};

const MILESTONE_META: Record<
  MilestoneType,
  { icon: string; title: string; question: string; color: string }
> = {
  first_reply: {
    icon: "✦",
    title: "最初の返信",
    question: "この会話、続けたいと思いますか？",
    color: "#6366F1",
  },
  ten_messages: {
    icon: "💬",
    title: "10通目",
    question: "相手との会話、どのくらい心地いいですか？",
    color: "#22C55E",
  },
  first_voice: {
    icon: "🎙",
    title: "初ボイス",
    question: "声を聞いた印象は、テキストと違いましたか？",
    color: "#EC4899",
  },
  three_day_streak: {
    icon: "🔥",
    title: "3日連続",
    question: "この関係、どの方向に進んでほしいですか？",
    color: "#F59E0B",
  },
  first_activity: {
    icon: "✨",
    title: "初アクティビティ",
    question: "一緒にやってみた感想は？",
    color: "#8B5CF6",
  },
  mutual_activity: {
    icon: "🤝",
    title: "共同アクティビティ",
    question: "一緒に何かをする相手として、どう感じますか？",
    color: "#06B6D4",
  },
};

const SCALE_LABELS = ["もう少し", "まあまあ", "いい感じ", "とても良い", "最高"];

export default function MilestoneReflection({
  milestoneType,
  candidateId,
  onComplete,
}: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const meta = MILESTONE_META[milestoneType];

  const handleSubmit = async (score: number) => {
    setSelected(score);
    try {
      await fetch(`/api/rendezvous/${candidateId}/chat/milestones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          milestoneType,
          reflectionAnswer: { score, label: SCALE_LABELS[score - 1] },
        }),
      });
      setSubmitted(true);
      setTimeout(() => onComplete?.(), 1500);
    } catch {
      // silently fail
    }
  };

  if (submitted) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          background: `${meta.color}06`,
          border: `1px solid ${meta.color}12`,
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 11, color: "rgba(30,30,60,0.4)" }}>
          記録しました ✓
        </span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        padding: "14px 16px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${meta.color}12`,
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        <span style={{ fontSize: 14 }}>{meta.icon}</span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: meta.color,
            letterSpacing: "0.5px",
          }}
        >
          {meta.title}
        </span>
      </div>

      {/* Question */}
      <p
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "rgba(30,30,60,0.7)",
          lineHeight: 1.5,
          margin: "0 0 12px",
        }}
      >
        {meta.question}
      </p>

      {/* 1-5 Scale */}
      <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
        {[1, 2, 3, 4, 5].map((score) => (
          <button
            key={score}
            onClick={() => handleSubmit(score)}
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              border: `1px solid ${selected === score ? meta.color : "rgba(30,30,60,0.08)"}`,
              background: selected === score ? `${meta.color}15` : "rgba(30,30,60,0.02)",
              color: selected === score ? meta.color : "rgba(30,30,60,0.5)",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            {score}
          </button>
        ))}
      </div>

      {/* Scale labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 4,
          padding: "0 4px",
        }}
      >
        <span style={{ fontSize: 8, color: "rgba(30,30,60,0.3)" }}>
          {SCALE_LABELS[0]}
        </span>
        <span style={{ fontSize: 8, color: "rgba(30,30,60,0.3)" }}>
          {SCALE_LABELS[4]}
        </span>
      </div>
    </motion.div>
  );
}
