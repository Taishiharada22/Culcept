"use client";
// components/home/SessionCompleteFlow.tsx
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Session Complete Flow — 「完了 → 次は何？」の自動遷移UI
//
// Duolingoの「レッスン完了 → 次のレッスンを提案」を
// Aneurasyncの自己発見文脈に翻訳。
//
// フロー:
// 1. プライマリアクション完了後にこのコンポーネントを表示
// 2. 「今日の成果」を短く見せる（ストリーク更新、新発見）
// 3. 次に最も価値の高いアクションを1つ提案
// 4. ユーザーが選ぶ: 次に進む or 今日は完了
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { motion } from "framer-motion";
import Link from "next/link";
import type { PrimaryAction } from "@/lib/stargazer/primaryAction";

interface SessionCompleteFlowProps {
  /** 完了したアクションのID */
  completedActionId: string;
  /** ストリーク日数 */
  streakDays: number;
  /** 今回のセッションでの新発見 */
  sessionDiscovery: string | null;
  /** 次に提案するアクション */
  nextAction: PrimaryAction | null;
  /** 「今日は完了」を選んだとき */
  onDismiss: () => void;
}

export default function SessionCompleteFlow({
  completedActionId,
  streakDays,
  sessionDiscovery,
  nextAction,
  onDismiss,
}: SessionCompleteFlowProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      style={{
        borderRadius: 20,
        background: "linear-gradient(145deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.6) 100%)",
        backdropFilter: "blur(24px)",
        border: "1.5px solid rgba(255,255,255,0.9)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)",
        padding: "28px 24px",
        textAlign: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Confetti celebration */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.18 }}
        style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", borderRadius: 20 }}
      >
        {Array.from({ length: 24 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{
              x: "50%",
              y: "40%",
              scale: 0,
              opacity: 1,
            }}
            animate={{
              x: `${10 + Math.random() * 80}%`,
              y: `${-20 + Math.random() * 120}%`,
              scale: [0, 1, 0.6],
              opacity: [1, 1, 0],
              rotate: Math.random() * 360,
            }}
            transition={{
              duration: 1.2 + Math.random() * 0.8,
              delay: 0.3 + Math.random() * 0.4,
              ease: "easeOut",
            }}
            style={{
              position: "absolute",
              width: 6 + Math.random() * 4,
              height: 6 + Math.random() * 4,
              borderRadius: Math.random() > 0.5 ? "50%" : 2,
              background: ["#6366F1", "#EC4899", "#EAB308", "#14B8A6", "#8B5CF6"][i % 5],
            }}
          />
        ))}
      </motion.div>

      {/* 完了メッセージ */}
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, duration: 0.22 }}
      >
        <div style={{ fontSize: 36, marginBottom: 8 }}>✓</div>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#1a1a2e" }}>
          観測完了
        </h3>
        {streakDays > 0 && (
          <p style={{ fontSize: 13, color: "#6366F1", fontWeight: 600 }}>
            {streakDays}日連続 🔥
          </p>
        )}
      </motion.div>

      {/* 今回の発見 */}
      {sessionDiscovery && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.25 }}
          style={{
            marginTop: 16,
            padding: "12px 16px",
            borderRadius: 12,
            background: "rgba(99,102,241,0.06)",
            border: "1px solid rgba(99,102,241,0.12)",
          }}
        >
          <p style={{ fontSize: 11, color: "#4a4a68", lineHeight: 1.6, margin: 0 }}>
            {sessionDiscovery}
          </p>
        </motion.div>
      )}

      {/* 次のアクション提案 */}
      {nextAction && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8, duration: 0.22 }}
          style={{ marginTop: 20 }}
        >
          <p style={{ fontSize: 10, color: "#8888a0", marginBottom: 8, letterSpacing: 1 }}>
            次のおすすめ
          </p>
          <Link
            href={nextAction.href}
            style={{
              display: "block",
              padding: "14px 20px",
              borderRadius: 14,
              background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(139,92,246,0.08) 100%)",
              border: "1px solid rgba(99,102,241,0.2)",
              textDecoration: "none",
              color: "#1a1a2e",
              transition: "all 0.2s",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>{nextAction.icon}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{nextAction.label}</div>
                {nextAction.sublabel && (
                  <div style={{ fontSize: 11, color: "#8888a0", marginTop: 2 }}>
                    {nextAction.sublabel}
                  </div>
                )}
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      {/* 今日は完了ボタン */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.2, duration: 0.22 }}
        onClick={onDismiss}
        style={{
          marginTop: 16,
          padding: "10px 24px",
          borderRadius: 10,
          background: "transparent",
          border: "1px solid rgba(0,0,0,0.08)",
          color: "#8888a0",
          fontSize: 12,
          cursor: "pointer",
          transition: "all 0.2s",
        }}
      >
        今日は完了
      </motion.button>
    </motion.div>
  );
}
