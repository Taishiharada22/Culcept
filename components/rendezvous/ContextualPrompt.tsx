"use client";

/**
 * ContextualPrompt
 * 会話停滞時の文脈対応会話シードカード
 * reasonCodes/cautionCodesベースの知的な提案
 */

import { motion } from "framer-motion";
import type { ContextualPrompt as PromptData } from "@/lib/rendezvous/contextualPromptEngine";

type Props = {
  prompt: PromptData;
  onUse?: () => void;
  onDismiss?: () => void;
};

const TONE_ICONS: Record<string, string> = {
  light: "💬",
  exploratory: "🔮",
  reflective: "🪞",
};

const TONE_COLORS: Record<string, string> = {
  light: "#22C55E",
  exploratory: "#6366F1",
  reflective: "#F59E0B",
};

export default function ContextualPrompt({ prompt, onUse, onDismiss }: Props) {
  const icon = TONE_ICONS[prompt.tone] ?? "💬";
  const accentColor = TONE_COLORS[prompt.tone] ?? "#6366F1";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      style={{
        padding: "12px 14px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.9)",
        backdropFilter: "blur(12px)",
        border: `1px solid ${accentColor}12`,
        boxShadow: `0 2px 8px ${accentColor}08`,
      }}
    >
      <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ fontSize: 14, lineHeight: 1, flexShrink: 0 }}>{icon}</span>
        <div style={{ flex: 1 }}>
          <p
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "rgba(30,30,60,0.75)",
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            {prompt.text}
          </p>
          <p
            style={{
              fontSize: 10,
              color: "rgba(30,30,60,0.4)",
              lineHeight: 1.5,
              margin: "4px 0 0",
            }}
          >
            {prompt.subtext}
          </p>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 10,
          justifyContent: "flex-end",
        }}
      >
        {onUse && (
          <button
            onClick={onUse}
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: accentColor,
              background: `${accentColor}08`,
              border: `1px solid ${accentColor}15`,
              borderRadius: 6,
              padding: "4px 12px",
              cursor: "pointer",
            }}
          >
            この話題を使う
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: "rgba(30,30,60,0.3)",
              background: "rgba(30,30,60,0.03)",
              border: "1px solid rgba(30,30,60,0.06)",
              borderRadius: 6,
              padding: "4px 10px",
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        )}
      </div>
    </motion.div>
  );
}
