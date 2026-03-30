"use client";

/**
 * IceBreakerSuggestions
 * 空チャット状態で表示される会話トピック候補チップ
 * タップで入力欄に反映
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  candidateId: string;
  onSelect: (text: string) => void;
};

export default function IceBreakerSuggestions({ candidateId, onSelect }: Props) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch(`/api/rendezvous/${candidateId}/icebreakers`)
      .then((r) => r.json())
      .then((res) => {
        if (res.ok && res.iceBreakers) setSuggestions(res.iceBreakers);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [candidateId]);

  if (loading || dismissed || suggestions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 10 }}
        style={{ padding: "12px 16px" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <p style={{ fontSize: 11, color: "rgba(30,30,60,0.4)", fontWeight: 600 }}>
            💡 会話のきっかけ
          </p>
          <button
            onClick={() => setDismissed(true)}
            style={{
              border: "none",
              background: "none",
              fontSize: 10,
              color: "rgba(30,30,60,0.3)",
              cursor: "pointer",
            }}
          >
            非表示
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {suggestions.map((text, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                onSelect(text);
                setDismissed(true);
              }}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(99,102,241,0.1)",
                background: "rgba(255,255,255,0.7)",
                backdropFilter: "blur(8px)",
                fontSize: 13,
                color: "#1E1E3C",
                textAlign: "left",
                cursor: "pointer",
                lineHeight: 1.5,
                transition: "border-color 0.2s",
              }}
            >
              {text}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
