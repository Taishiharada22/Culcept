"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";

/**
 * GraduationTrigger
 * 関係が卒業条件を満たしたときに表示する誘導カード。
 *
 * 卒業条件:
 * - mutual_liked または chat_opened 状態
 * - メッセージ50通以上
 * - 接続期間30日以上
 * - ユーザーが明示的に「卒業する」を選択できる
 */

type GraduationEligibility = {
  eligible: boolean;
  messageCount: number;
  daysConnected: number;
  milestoneCount: number;
};

type Props = {
  candidateId: string;
  candidateState: string;
  matchedAt: string | null;
};

export default function GraduationTrigger({
  candidateId,
  candidateState,
  matchedAt,
}: Props) {
  const [eligibility, setEligibility] = useState<GraduationEligibility | null>(
    null,
  );
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Only check for active relationships
    if (
      candidateState !== "mutual_liked" &&
      candidateState !== "chat_opened"
    ) {
      return;
    }

    // Check basic time threshold (30 days)
    if (matchedAt) {
      const matchDate = new Date(matchedAt);
      const now = new Date();
      const days = Math.floor(
        (now.getTime() - matchDate.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (days < 30) return;
    }

    async function checkEligibility() {
      try {
        const res = await fetch(
          `/api/rendezvous/${candidateId}/graduation-check`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (data.eligible) {
          setEligibility(data);
        }
      } catch {
        // ignore
      }
    }

    checkEligibility();
  }, [candidateId, candidateState, matchedAt]);

  if (!eligibility?.eligible || dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 200, damping: 20 }}
        style={{
          padding: "20px",
          borderRadius: 16,
          background:
            "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(139,92,246,0.08))",
          border: "1px solid rgba(99,102,241,0.12)",
          marginBottom: 14,
          textAlign: "center",
          position: "relative",
        }}
      >
        <button
          onClick={() => setDismissed(true)}
          style={{
            position: "absolute",
            top: 8,
            right: 10,
            background: "none",
            border: "none",
            fontSize: 16,
            color: "rgba(30,30,60,0.3)",
            cursor: "pointer",
          }}
        >
          ×
        </button>

        <div
          style={{
            fontSize: 28,
            marginBottom: 8,
          }}
        >
          🎓
        </div>

        <h3
          style={{
            fontSize: 14,
            fontWeight: 800,
            color: "#1E1E3C",
            marginBottom: 6,
          }}
        >
          卒業セレモニーの準備ができました
        </h3>

        <p
          style={{
            fontSize: 11,
            color: "rgba(30,30,60,0.5)",
            lineHeight: 1.6,
            marginBottom: 12,
          }}
        >
          {eligibility.daysConnected}日間の旅路、
          {eligibility.messageCount}通のメッセージ。
          この関係を美しく締めくくり、次のステージへ進みませんか？
        </p>

        <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
          <Link
            href={`/rendezvous/graduation/${candidateId}`}
            style={{
              padding: "10px 20px",
              borderRadius: 24,
              background:
                "linear-gradient(135deg, #6366F1, #8B5CF6)",
              color: "#fff",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 2px 12px rgba(99,102,241,0.25)",
              transition: "transform 0.2s",
            }}
          >
            セレモニーへ進む
          </Link>
          <button
            onClick={() => setDismissed(true)}
            style={{
              padding: "10px 20px",
              borderRadius: 24,
              background: "rgba(30,30,60,0.05)",
              color: "rgba(30,30,60,0.45)",
              fontSize: 12,
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            今はまだ
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
