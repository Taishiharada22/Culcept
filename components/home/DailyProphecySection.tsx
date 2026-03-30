"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { humanizeScoresInText } from "@/app/_home/deriveAnswerData";

const mono = "'JetBrains Mono','SF Mono',monospace";

type VerificationResult = "hit" | "partial" | "miss";

type Props = {
  prophecy: {
    prediction?: string;
    reasoning?: string;
    verification?: string;
    accuracy?: number;
    isVerified?: boolean;
  } | null;
  onVerify?: (result: VerificationResult) => Promise<{ newAccuracy: number } | void>;
};

const FEEDBACK_TEXT: Record<VerificationResult, string> = {
  hit: "的中。観測の精度が上がっている。",
  partial: "半分当たり。ズレが次の予測を賢くする。",
  miss: "外れた瞬間こそ、深い発見がある。",
};

export default function DailyProphecySection({ prophecy, onVerify }: Props) {
  const [selected, setSelected] = useState<VerificationResult | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback(
    async (result: VerificationResult) => {
      if (selected || isSubmitting) return;
      setIsSubmitting(true);
      setSelected(result);
      try {
        localStorage.setItem("aneurasync_prophecy_feedback_today", result);
        await onVerify?.(result);
      } catch { /* silent */ } finally {
        setIsSubmitting(false);
      }
    },
    [selected, isSubmitting, onVerify],
  );

  if (!prophecy?.prediction) {
    return (
      <section
        aria-label="今日の予言"
        style={{ padding: "8px 20px 16px", maxWidth: 780, margin: "0 auto" }}
      >
        <div
          style={{
            borderRadius: 16,
            background: "linear-gradient(145deg, rgba(99,102,241,0.04) 0%, #ffffff 40%, rgba(139,92,246,0.03) 100%)",
            border: "1px solid rgba(99,102,241,0.1)",
            padding: "14px 16px 12px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <span style={{ fontSize: 14, opacity: 0.5 }}>🔮</span>
            <span style={{ fontSize: 9, color: "#6366F1", fontWeight: 700, letterSpacing: 2, fontFamily: mono, opacity: 0.6 }}>
              今日の予測
            </span>
          </div>
          <p style={{ fontSize: 11, color: "#8888a0", lineHeight: 1.6, marginBottom: 8 }}>
            もう少し答えてくれたら、AIが明日のあなたを予測できるようになるよ
          </p>
          <a href="/stargazer" style={{ fontSize: 10, color: "#6366F1", fontWeight: 600, textDecoration: "none" }}>
            質問に答える →
          </a>
        </div>
      </section>
    );
  }

  const alreadyVerified = prophecy.isVerified || selected !== null;
  const humanized = prophecy.prediction ? humanizeScoresInText(prophecy.prediction) : prophecy.prediction;
  const previewText = humanized && humanized.length > 30
    ? humanized.slice(0, 30) + "…"
    : humanized;

  return (
    <section
      aria-label="今日の予言"
      style={{ padding: "8px 20px 16px", maxWidth: 780, margin: "0 auto" }}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIsOpen(!isOpen); } }}
        style={{
          width: "100%",
          textAlign: "left",
          borderRadius: 16,
          background: "linear-gradient(145deg, rgba(99,102,241,0.05) 0%, #ffffff 40%, rgba(139,92,246,0.03) 100%)",
          border: "1px solid rgba(99,102,241,0.12)",
          boxShadow: "0 2px 12px rgba(99,102,241,0.06)",
          padding: "14px 16px 12px",
          position: "relative",
          overflow: "hidden",
          cursor: "pointer",
        }}
      >
        {/* Header — always visible */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>🔮</span>
            <span style={{ fontSize: 9, color: "#6366F1", fontWeight: 700, letterSpacing: 2, fontFamily: mono }}>
              今日の予測
            </span>
          </div>
          <span style={{
            fontSize: 10, color: "#8888a0",
            transition: "transform 0.2s",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}>
            ▼
          </span>
        </div>

        {/* Collapsed: one-line preview */}
        {!isOpen && previewText && (
          <div style={{
            fontSize: 11, color: "#4a4a68", marginTop: 6,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            「{previewText}」
          </div>
        )}

        {/* Expanded: full content */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              style={{ overflow: "hidden" }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: "#1a1a2e",
                  lineHeight: 1.7,
                  fontWeight: 500,
                  marginTop: 10,
                  marginBottom: 10,
                }}
              >
                「{humanized}」
              </div>

              {/* Verification area */}
              <AnimatePresence mode="wait">
                {!alreadyVerified ? (
                  <motion.div
                    key="buttons"
                    style={{
                      display: "flex",
                      gap: 6,
                      paddingTop: 8,
                      borderTop: "1px solid rgba(99,102,241,0.08)",
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                  >
                    <span style={{ fontSize: 10, color: "#8888a0", alignSelf: "center", marginRight: 2, flexShrink: 0 }}>
                      当たった？
                    </span>
                    {([
                      { result: "hit" as const, label: "的中", color: "#22c55e", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)" },
                      { result: "partial" as const, label: "半分", color: "#F59E0B", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
                      { result: "miss" as const, label: "外れた", color: "#a0aac8", bg: "rgba(160,170,200,0.06)", border: "rgba(160,170,200,0.15)" },
                    ]).map((opt) => (
                      <button
                        key={opt.result}
                        onClick={(e) => { e.stopPropagation(); handleSelect(opt.result); }}
                        disabled={isSubmitting}
                        style={{
                          flex: 1,
                          padding: "6px 0",
                          borderRadius: 10,
                          background: opt.bg,
                          border: `1px solid ${opt.border}`,
                          cursor: "pointer",
                          fontSize: 10,
                          fontWeight: 700,
                          color: opt.color,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </motion.div>
                ) : (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25 }}
                    style={{
                      paddingTop: 8,
                      borderTop: "1px solid rgba(99,102,241,0.08)",
                    }}
                  >
                    <p style={{ fontSize: 11, color: "#6366F1", lineHeight: 1.5 }}>
                      {selected ? FEEDBACK_TEXT[selected] : prophecy.verification}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
