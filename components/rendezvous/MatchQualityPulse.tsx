"use client";

/**
 * MatchQualityPulse
 * Lightweight bottom-sheet for match quality feedback.
 * Shows at natural conversation breakpoints (50 messages, 7 days).
 * Stores feedback in orbiter_signals for algorithm learning.
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { hapticLight } from "@/lib/rendezvous/haptics";

type Props = {
  candidateId: string;
  milestone: string;
  onDismiss: () => void;
};

const SENTIMENTS = [
  { key: "positive" as const, emoji: "✨", label: "この人との会話、好き" },
  { key: "neutral" as const, emoji: "🤔", label: "まだわからない" },
  { key: "negative" as const, emoji: "👋", label: "ちょっと違うかも" },
];

export default function MatchQualityPulse({
  candidateId,
  milestone,
  onDismiss,
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSelect = useCallback(
    async (sentiment: "positive" | "neutral" | "negative") => {
      if (submitting) return;
      setSubmitting(true);
      hapticLight();

      try {
        await fetch(`/api/rendezvous/${candidateId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ sentiment, milestone }),
        });

        // Mark as submitted in localStorage
        localStorage.setItem(
          `culcept_match_feedback_${candidateId}_${milestone}`,
          sentiment,
        );

        setSubmitted(true);
        setTimeout(onDismiss, 800);
      } catch {
        onDismiss();
      }
    },
    [candidateId, milestone, submitting, onDismiss],
  );

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 25 }}
        style={{
          position: "absolute",
          bottom: 80,
          left: 12,
          right: 12,
          zIndex: 30,
          padding: "16px",
          borderRadius: 16,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(16px)",
          border: "1px solid rgba(99,102,241,0.1)",
          boxShadow:
            "0 -4px 24px rgba(30,30,60,0.08), 0 2px 8px rgba(99,102,241,0.06)",
        }}
      >
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            style={{ textAlign: "center", padding: "8px 0" }}
          >
            <span style={{ fontSize: 20 }}>💜</span>
            <p
              style={{
                fontSize: 11,
                color: "rgba(30,30,60,0.5)",
                marginTop: 4,
              }}
            >
              フィードバックありがとう
            </p>
          </motion.div>
        ) : (
          <>
            <p
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: "rgba(30,30,60,0.5)",
                marginBottom: 10,
                textAlign: "center",
              }}
            >
              この接続はどうですか？
            </p>
            <div style={{ display: "flex", gap: 6 }}>
              {SENTIMENTS.map((s) => (
                <button
                  key={s.key}
                  disabled={submitting}
                  onClick={() => handleSelect(s.key)}
                  style={{
                    flex: 1,
                    padding: "10px 4px",
                    borderRadius: 12,
                    border: "1px solid rgba(30,30,60,0.06)",
                    background: "rgba(255,255,255,0.7)",
                    cursor: submitting ? "not-allowed" : "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    opacity: submitting ? 0.5 : 1,
                    transition: "opacity 0.2s, background 0.2s",
                  }}
                >
                  <span style={{ fontSize: 18 }}>{s.emoji}</span>
                  <span
                    style={{
                      fontSize: 9,
                      fontWeight: 600,
                      color: "rgba(30,30,60,0.5)",
                      lineHeight: 1.3,
                    }}
                  >
                    {s.label}
                  </span>
                </button>
              ))}
            </div>
            <button
              onClick={onDismiss}
              style={{
                display: "block",
                width: "100%",
                marginTop: 8,
                padding: "6px 0",
                border: "none",
                background: "transparent",
                cursor: "pointer",
                fontSize: 10,
                color: "rgba(30,30,60,0.3)",
              }}
            >
              あとで
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
