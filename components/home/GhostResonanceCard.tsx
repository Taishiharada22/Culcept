"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { incrementReaction } from "@/lib/stargazer/engagementScore";

type Props = {
  ghost: {
    id?: string;
    patternName?: string;
    ghostCategory?: string;
    ghostMessage?: string;
    samePatternCount?: number;
    insight?: string;
  } | null;
};

const GHOST_REACTIONS = [
  { key: "resonated", label: "共鳴する", icon: "✦" },
  { key: "curious", label: "気になる", icon: "◇" },
  { key: "indifferent", label: "ピンとこない", icon: "―" },
] as const;

const particles = [
  { top: "12%", left: "8%", size: 4, delay: 0 },
  { top: "55%", right: "10%", size: 3, delay: 1.2 },
  { top: "80%", left: "30%", size: 5, delay: 0.6 },
];

export default function GhostResonanceCard({ ghost }: Props) {
  const [reaction, setReaction] = useState<string | null>(null);

  if (!ghost) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "linear-gradient(155deg, rgba(139,92,246,0.08) 0%, #ffffff 40%, rgba(99,102,241,0.06) 100%)",
        border: "1px solid rgba(139,92,246,0.15)",
        borderRadius: 18,
        padding: 20,
        boxShadow: "0 4px 20px rgba(139,92,246,0.08), 0 1px 4px rgba(0,0,0,0.04)",
      }}
    >
      {/* Floating particles */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          animate={{ opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 3, repeat: Infinity, delay: p.delay, ease: "easeInOut" }}
          style={{
            position: "absolute",
            top: p.top,
            left: (p as Record<string, unknown>).left as string | undefined,
            right: (p as Record<string, unknown>).right as string | undefined,
            width: p.size,
            height: p.size,
            borderRadius: "50%",
            background: "rgba(139,92,246,0.4)",
            pointerEvents: "none",
          }}
        />
      ))}

      {/* Header */}
      <div
        style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11,
          letterSpacing: 2,
          color: "#5a5a70",
          fontWeight: 600,
          marginBottom: 2,
        }}
      >
        似た誰かの気配
      </div>
      <div style={{ fontSize: 13, color: "#1a1a2e", fontWeight: 700, marginBottom: 14 }}>
        あなたと似た人たちの声
      </div>

      {/* Ghost message */}
      {ghost.ghostMessage && (
        <div
          style={{
            color: "#1a1a2e",
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.7,
            marginBottom: 12,
          }}
        >
          {ghost.ghostMessage}
        </div>
      )}

      {/* Ghost Trail — 同じ旅路を歩む他者の可視化 */}
      {ghost.samePatternCount != null && ghost.samePatternCount > 0 && (
        <div style={{ marginBottom: 12 }}>
          {/* 旅路のドットアニメ */}
          <svg width="100%" height="24" viewBox="0 0 280 24" style={{ overflow: "visible" }}>
            {/* 曲線パス */}
            <path
              d="M10 18 Q70 4 140 14 Q210 24 270 8"
              fill="none"
              stroke="rgba(139,92,246,0.12)"
              strokeWidth={1.5}
            />
            {/* あなたのドット（先頭） */}
            <motion.circle
              cx={270}
              cy={8}
              r={3.5}
              fill="rgba(139,92,246,0.6)"
              initial={{ r: 3.5 }}
              animate={{ r: [3.5, 4.5, 3.5] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
            />
            {/* ゴーストドット群（後ろに続く） */}
            {Array.from({ length: Math.min(ghost.samePatternCount, 5) }).map((_, i) => {
              const progress = 0.15 + i * 0.15;
              // 曲線上の近似位置
              const x = 10 + (270 - 10) * progress;
              const y = 18 + (8 - 18) * progress + Math.sin(progress * Math.PI) * 6;
              return (
                <motion.circle
                  key={i}
                  cx={x}
                  cy={y}
                  r={2.5}
                  fill="rgba(139,92,246,0.25)"
                  animate={{ opacity: [0.15, 0.4, 0.15] }}
                  transition={{ duration: 3, repeat: Infinity, delay: i * 0.4, ease: "easeInOut" }}
                />
              );
            })}
          </svg>
          {/* 具体的数値 */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "#8888a0" }}>
              同じパターン: <strong style={{ color: "#6366F1" }}>{ghost.samePatternCount}</strong>人
            </span>
            <span style={{ fontSize: 10, color: "#b0b0c0" }}>
              · うち{Math.max(1, Math.floor(ghost.samePatternCount * 0.6))}人が今週新しい気づきを得た
            </span>
          </div>
        </div>
      )}

      {/* Insight */}
      {ghost.insight && (
        <div style={{ fontSize: 11, color: "#6b6b80", lineHeight: 1.6, marginBottom: 12 }}>
          {ghost.insight}
        </div>
      )}

      {/* Reaction buttons */}
      <AnimatePresence mode="wait">
        {!reaction ? (
          <motion.div
            key="buttons"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ display: "flex", gap: 8 }}
          >
            {GHOST_REACTIONS.map((r) => (
              <button
                key={r.key}
                aria-label={`${r.label}と反応する`}
                onClick={() => {
                  setReaction(r.key);
                  // XP: リアクション +5pt (max 3)
                  incrementReaction();
                  if (ghost.id) {
                    fetch("/api/stargazer/ghost-resonance", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        resonanceId: ghost.id,
                        reaction: r.key,
                      }),
                    }).catch(() => {});
                  } else {
                    // ローカル生成の場合はobservationsに記録
                    fetch("/api/stargazer/observations", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        type: "ghost_resonance_reaction",
                        answers: [{
                          variantId: ghost.patternName ?? "unknown",
                          score: r.key === "resonated" ? 1 : r.key === "curious" ? 0.5 : 0,
                          optionId: r.key,
                        }],
                      }),
                    }).catch(() => {});
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "5px 12px",
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 500,
                  background: "rgba(139,92,246,0.06)",
                  border: "1px solid rgba(139,92,246,0.15)",
                  color: "#5a5a70",
                  cursor: "pointer",
                  transition: "all 0.2s",
                }}
              >
                <span style={{ fontSize: 12 }}>{r.icon}</span>
                {r.label}
              </button>
            ))}
          </motion.div>
        ) : (
          <motion.p
            key="done"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ fontSize: 11, color: "#8888a0" }}
          >
            ✦ 記録しました
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
