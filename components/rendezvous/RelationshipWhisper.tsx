"use client";

/**
 * RelationshipWhisper — 関係の変態
 * A floating whisper card from the user's avatar (分身).
 * Shows detected relationship trajectory changes.
 */

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  RelationshipWhisper as WhisperData,
  WhisperType,
} from "@/lib/rendezvous/relationshipObserver";
import { safeLSSet } from "@/lib/safeLocalStorage";

type Props = {
  whisper: WhisperData | null;
  candidateId: string;
  onDismiss: () => void;
};

const GRADIENT_MAP: Record<WhisperType, string> = {
  warming: "linear-gradient(135deg, rgba(251,191,36,0.25), rgba(245,158,11,0.15))",
  cooling: "linear-gradient(135deg, rgba(96,165,250,0.25), rgba(59,130,246,0.15))",
  deepening: "linear-gradient(135deg, rgba(99,102,241,0.25), rgba(79,70,229,0.15))",
  shifting: "linear-gradient(135deg, rgba(168,85,247,0.25), rgba(139,92,246,0.15))",
  new_color:
    "linear-gradient(135deg, rgba(251,191,36,0.15), rgba(236,72,153,0.15), rgba(99,102,241,0.15), rgba(34,197,94,0.15))",
};

const BORDER_COLOR_MAP: Record<WhisperType, string> = {
  warming: "rgba(251,191,36,0.3)",
  cooling: "rgba(96,165,250,0.3)",
  deepening: "rgba(99,102,241,0.3)",
  shifting: "rgba(168,85,247,0.3)",
  new_color: "rgba(236,72,153,0.25)",
};

function getWeekKey(): string {
  const now = new Date();
  const year = now.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const week = Math.ceil(
    ((now.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7,
  );
  return `${year}-W${week}`;
}

export default function RelationshipWhisper({
  whisper,
  candidateId,
  onDismiss,
}: Props) {
  const prevInputRef = useRef({ whisper, candidateId });
  const [visible, setVisible] = useState(() => {
    if (!whisper) return false;
    if (typeof window === "undefined") return false;
    const weekKey = getWeekKey();
    const storageKey = `culcept_whisper_dismissed_${candidateId}_${weekKey}`;
    if (localStorage.getItem(storageKey)) return false;
    return true;
  });

  // Update visible when whisper/candidateId change (during render)
  if (prevInputRef.current.whisper !== whisper || prevInputRef.current.candidateId !== candidateId) {
    prevInputRef.current = { whisper, candidateId };
    const next = (() => {
      if (!whisper) return false;
      if (typeof window === "undefined") return false;
      const weekKey = getWeekKey();
      const storageKey = `culcept_whisper_dismissed_${candidateId}_${weekKey}`;
      if (localStorage.getItem(storageKey)) return false;
      return true;
    })();
    if (visible !== next) setVisible(next);
  }

  const handleDismiss = () => {
    const weekKey = getWeekKey();
    const storageKey = `culcept_whisper_dismissed_${candidateId}_${weekKey}`;
    safeLSSet(storageKey, "1");
    setVisible(false);
    onDismiss();
  };

  if (!whisper) return null;

  const gradient = GRADIENT_MAP[whisper.type] ?? GRADIENT_MAP.deepening;
  const borderColor = BORDER_COLOR_MAP[whisper.type] ?? "rgba(99,102,241,0.2)";

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          style={{
            margin: "0 16px 8px",
            padding: "10px 14px",
            background: gradient,
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            borderRadius: 12,
            border: `1px solid ${borderColor}`,
            boxShadow: "0 2px 12px rgba(30, 30, 60, 0.04)",
            position: "relative",
          }}
        >
          {/* Breathing animation via CSS */}
          <motion.div
            animate={{ opacity: [0.8, 1, 0.8] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
            }}
          >
            {/* Avatar silhouette icon */}
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "rgba(99, 102, 241, 0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              <svg
                width={14}
                height={14}
                viewBox="0 0 14 14"
                fill="none"
              >
                <circle
                  cx={7}
                  cy={4.5}
                  r={2.5}
                  fill="rgba(99,102,241,0.4)"
                />
                <ellipse
                  cx={7}
                  cy={11}
                  rx={4}
                  ry={2.5}
                  fill="rgba(99,102,241,0.3)"
                />
              </svg>
            </div>

            {/* Message */}
            <div style={{ flex: 1, minWidth: 0, paddingRight: 18 }}>
              <div
                style={{
                  fontSize: 11.5,
                  color: "#1E1E3C",
                  lineHeight: 1.6,
                  fontFamily:
                    "'Noto Serif JP', 'Georgia', 'Times New Roman', serif",
                  fontWeight: 400,
                }}
              >
                {whisper.message}
              </div>
            </div>
          </motion.div>

          {/* Close button */}
          <button
            onClick={handleDismiss}
            style={{
              position: "absolute",
              top: 6,
              right: 8,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontSize: 12,
              color: "rgba(30, 30, 60, 0.25)",
              padding: "2px 4px",
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
