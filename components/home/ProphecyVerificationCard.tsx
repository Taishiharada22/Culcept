"use client";

// ProphecyVerificationCard — 予言の答え合わせインタラクション
// 予測誤差信号: 予想の結果にドーパミンが最も強く出る（Schultz, 1997）
// ホーム画面に表示し、毎日の第2の engagement moment を作る

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type VerificationResult = "hit" | "partial" | "miss";

interface ProphecyVerificationCardProps {
  /** 昨日の予言テキスト */
  prophecyText: string;
  /** 現在の的中率（%） */
  currentAccuracy?: number;
  /** 検証を送信するコールバック */
  onVerify: (result: VerificationResult) => Promise<{ newAccuracy: number } | void>;
}

const VERIFICATION_OPTIONS: {
  result: VerificationResult;
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}[] = [
  {
    result: "hit",
    label: "的中",
    icon: "◎",
    color: "rgba(34,197,94,0.9)",
    bgColor: "rgba(34,197,94,0.08)",
  },
  {
    result: "partial",
    label: "半分",
    icon: "△",
    color: "rgba(245,158,11,0.9)",
    bgColor: "rgba(245,158,11,0.08)",
  },
  {
    result: "miss",
    label: "外れた",
    icon: "✕",
    color: "rgba(160,170,200,0.7)",
    bgColor: "rgba(160,170,200,0.06)",
  },
];

const FEEDBACK_TEXT: Record<VerificationResult, string> = {
  hit: "分身の洞察が的中した。観測データが確かになっている。",
  partial: "半分当たり。ズレた部分が次の予測を賢くする。",
  miss: "外れた瞬間こそ、最も深い発見がある。",
};

export default function ProphecyVerificationCard({
  prophecyText,
  currentAccuracy,
  onVerify,
}: ProphecyVerificationCardProps) {
  const [selected, setSelected] = useState<VerificationResult | null>(null);
  const [newAccuracy, setNewAccuracy] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSelect = useCallback(
    async (result: VerificationResult) => {
      if (selected || isSubmitting) return;
      setIsSubmitting(true);
      setSelected(result);
      try {
        const resp = await onVerify(result);
        if (resp?.newAccuracy !== undefined) {
          setNewAccuracy(resp.newAccuracy);
        }
      } catch {
        // silent
      } finally {
        setIsSubmitting(false);
      }
    },
    [selected, isSubmitting, onVerify],
  );

  return (
    <div
      style={{
        borderRadius: 20,
        background:
          "linear-gradient(145deg, rgba(139,92,246,0.05) 0%, #ffffff 50%, rgba(99,102,241,0.04) 100%)",
        border: "1.5px solid rgba(139,92,246,0.12)",
        boxShadow: "0 2px 12px rgba(139,92,246,0.06)",
        padding: "16px 16px 14px",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <span style={{ fontSize: 16 }}>🔮</span>
        <span
          style={{
            fontSize: 9,
            color: "#8B5CF6",
            fontWeight: 700,
            letterSpacing: 2,
            fontFamily: "'JetBrains Mono','SF Mono',monospace",
          }}
        >
          予言の答え合わせ
        </span>
      </div>

      {/* Prophecy text */}
      <p
        style={{
          fontSize: 13,
          color: "#1a1a2e",
          lineHeight: 1.7,
          fontWeight: 500,
          marginBottom: 14,
        }}
      >
        「{prophecyText}」
      </p>

      {/* Verification buttons or result */}
      <AnimatePresence mode="wait">
        {!selected ? (
          <motion.div
            key="buttons"
            style={{ display: "flex", gap: 8 }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            {VERIFICATION_OPTIONS.map((opt) => (
              <button
                key={opt.result}
                onClick={() => handleSelect(opt.result)}
                disabled={isSubmitting}
                style={{
                  flex: 1,
                  padding: "10px 0",
                  borderRadius: 12,
                  background: opt.bgColor,
                  border: `1px solid ${opt.color.replace(/[\d.]+\)$/, "0.2)")}`,
                  cursor: "pointer",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: 4,
                  transition: "transform 0.15s, box-shadow 0.15s",
                }}
              >
                <span style={{ fontSize: 18, color: opt.color }}>{opt.icon}</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: opt.color,
                  }}
                >
                  {opt.label}
                </span>
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            {/* Feedback text */}
            <p
              style={{
                fontSize: 12,
                color: "#6366F1",
                lineHeight: 1.6,
                marginBottom: 8,
              }}
            >
              {FEEDBACK_TEXT[selected]}
            </p>

            {/* Accuracy display */}
            {(newAccuracy ?? currentAccuracy) !== undefined && (
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 6,
                  paddingTop: 8,
                  borderTop: "1px solid rgba(139,92,246,0.1)",
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    color: "#8888a0",
                  }}
                >
                  通算的中率:
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    color: "#8B5CF6",
                    fontFamily: "'JetBrains Mono','SF Mono',monospace",
                  }}
                >
                  {newAccuracy ?? currentAccuracy}%
                </span>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
