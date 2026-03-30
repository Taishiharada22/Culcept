// MirrorQuestionCard.tsx
// 🪞 鏡の問い — システムが生成した1行プロファイルをユーザーに突きつける
// 「合っている / 少し違う / 全然違う」で自己修正データを取得
"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Accuracy = "accurate" | "slightly_off" | "wrong";

export interface MirrorResult {
  profileText: string;
  accuracy: Accuracy;
  correction?: string;
}

interface Props {
  profileText: string;
  onAnswer: (result: MirrorResult) => void;
}

const ACCURACY_OPTIONS: { value: Accuracy; label: string; emoji: string }[] = [
  { value: "accurate", label: "はい、合っている", emoji: "✓" },
  { value: "slightly_off", label: "少し違う", emoji: "△" },
  { value: "wrong", label: "全然違う", emoji: "✕" },
];

export default function MirrorQuestionCard({ profileText, onAnswer }: Props) {
  const [selected, setSelected] = useState<Accuracy | null>(null);
  const [correction, setCorrection] = useState("");
  const [phase, setPhase] = useState<"choose" | "correct" | "done">("choose");

  const handleSelect = useCallback((accuracy: Accuracy) => {
    setSelected(accuracy);
    if (accuracy === "accurate") {
      // 合っている → そのまま進む
      setTimeout(() => {
        onAnswer({ profileText, accuracy, correction: undefined });
      }, 600);
    } else {
      // 少し違う / 全然違う → 修正入力画面へ
      setPhase("correct");
    }
  }, [profileText, onAnswer]);

  const handleSubmitCorrection = useCallback(() => {
    if (!selected) return;
    onAnswer({
      profileText,
      accuracy: selected,
      correction: correction.trim() || undefined,
    });
  }, [selected, correction, profileText, onAnswer]);

  const accent = "rgba(140,120,60,0.85)";
  const textPrimary = "rgba(20,25,40,0.90)";
  const textSecondary = "rgba(55,60,80,0.6)";

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center justify-center py-12 px-6 text-center relative"
    >
      {/* Background glow */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 50% 30%, rgba(140,120,60,0.08), transparent 70%)",
        }}
      />

      {/* Badge */}
      <div className="flex items-center gap-2 mb-6">
        <span className="text-sm">🪞</span>
        <span
          className="font-mono-sg text-xs tracking-[0.2em] uppercase"
          style={{ color: accent }}
        >
          鏡の問い
        </span>
      </div>

      {/* Intro text */}
      <motion.p
        className="font-body text-sm mb-4"
        style={{ color: textSecondary }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        ここまでの観測で、深層観測はあなたをこう見ています：
      </motion.p>

      {/* Profile statement */}
      <motion.div
        className="rounded-xl p-5 mb-8 max-w-sm"
        style={{
          background: "rgba(255,255,255,0.9)",
          border: "1px solid rgba(140,120,60,0.15)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.04)",
        }}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
      >
        <p
          className="font-display text-base leading-[1.8]"
          style={{ color: textPrimary }}
        >
          &ldquo;{profileText}&rdquo;
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {phase === "choose" && (
          <motion.div
            key="choose"
            className="flex flex-col gap-3 w-full max-w-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.6 }}
          >
            <p
              className="font-body text-sm mb-2"
              style={{ color: textSecondary }}
            >
              これは合っていますか？
            </p>
            {ACCURACY_OPTIONS.map((opt) => (
              <motion.button
                key={opt.value}
                onClick={() => handleSelect(opt.value)}
                className="w-full text-left px-4 py-3.5 rounded-xl font-body text-sm transition-all"
                style={{
                  background: selected === opt.value
                    ? "rgba(140,120,60,0.10)"
                    : "rgba(0,0,0,0.02)",
                  border: `1px solid ${
                    selected === opt.value
                      ? "rgba(140,120,60,0.25)"
                      : "rgba(140,150,180,0.12)"
                  }`,
                  color: selected === opt.value ? accent : "rgba(40,50,70,0.75)",
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                <span className="mr-2">{opt.emoji}</span>
                {opt.label}
              </motion.button>
            ))}
          </motion.div>
        )}

        {phase === "correct" && (
          <motion.div
            key="correct"
            className="w-full max-w-sm"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <p
              className="font-body text-sm mb-3"
              style={{ color: textSecondary }}
            >
              どう違いますか？（任意 — スキップもOK）
            </p>
            <textarea
              value={correction}
              onChange={(e) => setCorrection(e.target.value)}
              placeholder="自分ではこう思う..."
              rows={3}
              className="w-full rounded-xl px-4 py-3 font-body text-sm resize-none mb-4"
              style={{
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(140,150,180,0.15)",
                color: textPrimary,
                outline: "none",
              }}
            />
            <div className="flex gap-3">
              <motion.button
                onClick={handleSubmitCorrection}
                className="flex-1 py-3 rounded-xl font-body text-sm font-semibold"
                style={{
                  background: "rgba(140,120,60,0.10)",
                  border: "1px solid rgba(140,120,60,0.20)",
                  color: accent,
                }}
                whileTap={{ scale: 0.98 }}
              >
                {correction.trim() ? "送信して続ける" : "スキップして続ける"}
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
