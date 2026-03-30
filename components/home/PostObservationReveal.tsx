"use client";

import { useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  syncDelta?: number;
  discoveryText?: string;
  onDismiss: () => void;
};

/** 5種のランダム報酬（変数比率強化 — 毎回違うから飽きない） */
const REWARD_TYPES = [
  { icon: "✧", label: "新しい発見があったよ", color: "#8B5CF6" },
  { icon: "👻", label: "似たタイプの人が見つかったよ", color: "#6366F1" },
  { icon: "🔮", label: "予測がもっと正確になったよ", color: "#EC4899" },
  { icon: "🧬", label: "ゲノムカードが更新されたよ", color: "#14B8A6" },
  { icon: "↻", label: "あなたの傾向に変化があったよ", color: "#F59E0B" },
] as const;

export default function PostObservationReveal({
  syncDelta = 0,
  discoveryText,
  onDismiss,
}: Props) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 7000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  // 毎回ランダムな報酬（日時ベースのシード）
  const reward = useMemo(() => {
    const seed = Date.now() % REWARD_TYPES.length;
    return REWARD_TYPES[seed];
  }, []);

  const deltaColor =
    syncDelta > 0 ? "#16a34a" : syncDelta < 0 ? "#d97706" : "#6b7280";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        onClick={onDismiss}
        style={{
          position: "fixed",
          top: 80,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 190,
          maxWidth: 340,
          width: "calc(100% - 32px)",
          padding: "20px 22px",
          borderRadius: 18,
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          boxShadow:
            "0 8px 32px rgba(99,102,241,0.12), 0 1px 4px rgba(0,0,0,0.06)",
          border: "1px solid rgba(99,102,241,0.15)",
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        {/* Stage 1: Sync delta */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.22 }}
          style={{ fontWeight: 700, fontSize: 16, color: deltaColor }}
        >
          Sync {syncDelta > 0 ? "+" : ""}{syncDelta}% 変化
        </motion.div>

        {/* Stage 2: Discovery or random reward */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.5, duration: 0.22 }}
          style={{
            fontSize: 12,
            color: "#4a4a68",
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          {discoveryText ? (
            <>
              <span style={{ flexShrink: 0 }}>🔍</span>
              <span style={{ fontStyle: "italic" }}>{discoveryText}</span>
            </>
          ) : (
            <>
              <span style={{ flexShrink: 0, fontSize: 16 }}>{reward.icon}</span>
              <span style={{ fontWeight: 600, color: reward.color }}>{reward.label}</span>
            </>
          )}
        </motion.div>

        {/* Stage 3: Variable closing message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 2.5, duration: 0.22 }}
          style={{ fontSize: 11, color: "#6366F1" }}
        >
          {discoveryText
            ? "この発見が明日の予測に反映されるよ"
            : `${reward.label} — 次に答えるとまた何か変わるかも`}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
