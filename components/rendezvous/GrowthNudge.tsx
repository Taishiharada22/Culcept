"use client";

/**
 * GrowthNudge
 * 次のアクションを提案するナッジカード
 * GlassCard + lightbulb icon + フィードバックボタン
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";

type Props = {
  nudgeText: string;
  nudgeType: string;
  candidateId: string;
  onFeedback: (feedback: "helpful" | "not_relevant") => void;
};

export default function GrowthNudge({
  nudgeText,
  nudgeType,
  candidateId,
  onFeedback,
}: Props) {
  const [feedback, setFeedback] = useState<
    "helpful" | "not_relevant" | null
  >(null);
  const [submitting, setSubmitting] = useState(false);

  const handleFeedback = async (fb: "helpful" | "not_relevant") => {
    if (submitting || feedback) return;
    setSubmitting(true);

    try {
      await fetch(`/api/rendezvous/${candidateId}/nudge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nudgeType, feedback: fb }),
      });
    } catch {
      // silently fail
    }

    setFeedback(fb);
    onFeedback(fb);
    setSubmitting(false);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <GlassCard variant="default" padding="sm">
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          {/* Lightbulb icon */}
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 8,
              background:
                "linear-gradient(135deg, rgba(251,191,36,0.12), rgba(249,115,22,0.08))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <svg
              width={14}
              height={14}
              viewBox="0 0 24 24"
              fill="none"
              stroke="#F59E0B"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 18h6" />
              <path d="M10 22h4" />
              <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
            </svg>
          </div>

          {/* Text content */}
          <div style={{ flex: 1 }}>
            <p
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: "rgba(30,30,60,0.75)",
                lineHeight: 1.55,
                margin: 0,
              }}
            >
              {nudgeText}
            </p>
          </div>
        </div>

        {/* Feedback buttons */}
        <AnimatePresence mode="wait">
          {!feedback ? (
            <motion.div
              key="buttons"
              style={{
                display: "flex",
                gap: 8,
                marginTop: 12,
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => handleFeedback("helpful")}
                disabled={submitting}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#6366F1",
                  background: "rgba(99,102,241,0.06)",
                  border: "1px solid rgba(99,102,241,0.12)",
                  borderRadius: 8,
                  padding: "5px 12px",
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                参考になった
              </button>
              <button
                onClick={() => handleFeedback("not_relevant")}
                disabled={submitting}
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  color: "rgba(30,30,60,0.4)",
                  background: "rgba(30,30,60,0.03)",
                  border: "1px solid rgba(30,30,60,0.06)",
                  borderRadius: 8,
                  padding: "5px 12px",
                  cursor: submitting ? "not-allowed" : "pointer",
                  opacity: submitting ? 0.5 : 1,
                }}
              >
                今は違う
              </button>
            </motion.div>
          ) : (
            <motion.div
              key="thanks"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                marginTop: 10,
                textAlign: "right",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  color: "rgba(30,30,60,0.35)",
                }}
              >
                {feedback === "helpful" ? "ありがとう！" : "了解しました"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  );
}
