// app/stargazer/_components/VanishingInsight.tsx
// 消えるインサイト — 24時間で消滅するインサイトカード
"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { updateEngagementField, incrementReaction } from "@/lib/stargazer/engagementScore";
import { saveVanishingReaction, loadVanishingInsight } from "@/lib/stargazer/vanishingInsightGenerator";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type InsightCategory = "矛盾発見" | "行動パターン" | "深層の兆候" | "盲点" | "予感";

interface VanishingInsightProps {
  insightId?: string;
  insight: string;
  category: InsightCategory;
  expiresAt: number; // timestamp ms
  basedOn?: string; // attribution source text
  onExpire?: () => void;
  onView?: () => void;
}

const VANISHING_REACTIONS = [
  { key: "resonated", label: "響いた", icon: "✦" },
  { key: "surprising", label: "意外", icon: "◇" },
  { key: "expected", label: "そうだよね", icon: "○" },
  { key: "unclear", label: "よくわからない", icon: "?" },
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_COLORS: Record<InsightCategory, { bg: string; border: string; text: string }> = {
  "矛盾発見": {
    bg: "rgba(236,72,153,0.1)",
    border: "rgba(236,72,153,0.3)",
    text: "rgba(236,72,153,0.9)",
  },
  "行動パターン": {
    bg: "rgba(59,130,246,0.1)",
    border: "rgba(59,130,246,0.3)",
    text: "rgba(59,130,246,0.9)",
  },
  "深層の兆候": {
    bg: "rgba(168,85,247,0.1)",
    border: "rgba(168,85,247,0.3)",
    text: "rgba(168,85,247,0.9)",
  },
  "盲点": {
    bg: "rgba(245,158,11,0.1)",
    border: "rgba(245,158,11,0.3)",
    text: "rgba(245,158,11,0.9)",
  },
  "予感": {
    bg: "rgba(190,170,110,0.1)",
    border: "rgba(190,170,110,0.3)",
    text: "rgba(190,170,110,0.9)",
  },
};

function formatRemaining(ms: number): string {
  if (ms <= 0) return "00:00:00";
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  const s = Math.floor((ms % (1000 * 60)) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default function VanishingInsight({
  insightId,
  insight,
  category,
  expiresAt,
  basedOn,
  onExpire,
  onView,
}: VanishingInsightProps) {
  const [remaining, setRemaining] = useState<number>(expiresAt - Date.now());
  const [expired, setExpired] = useState(false);
  const [viewed, setViewed] = useState(false);
  const [reaction, setReaction] = useState<string | null>(() => {
    // Restore reaction from localStorage on mount
    const saved = loadVanishingInsight();
    return saved?.reaction ?? null;
  });

  // Mark as viewed on mount
  useEffect(() => {
    if (!viewed) {
      setViewed(true);
      // XP: 消えるインサイト閲覧 +10pt
      updateEngagementField("vanishingInsightViewed", true);
      onView?.();
    }
  }, [viewed, onView]);

  // Countdown
  useEffect(() => {
    const interval = setInterval(() => {
      const left = expiresAt - Date.now();
      setRemaining(left);
      if (left <= 0) {
        clearInterval(interval);
        setExpired(true);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  const colors = CATEGORY_COLORS[category] || CATEGORY_COLORS["予感"];
  const isUrgent = remaining < 60 * 60 * 1000 && remaining > 0; // < 1 hour
  const isVeryUrgent = remaining < 10 * 60 * 1000 && remaining > 0; // < 10 min

  return (
    <AnimatePresence>
      {!expired && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{
            opacity: 0,
            scale: 0.92,
            filter: "blur(12px)",
            transition: { duration: 1.2, ease: "easeInOut" },
          }}
          className="relative rounded-3xl overflow-hidden"
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(28px)",
            border: `1px solid ${isUrgent ? "rgba(236,72,153,0.3)" : "rgba(190,170,110,0.2)"}`,
          }}
        >
          {/* Shimmer / Aurora effect */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `linear-gradient(135deg, transparent 20%, rgba(190,170,110,0.04) 40%, rgba(168,85,247,0.04) 60%, transparent 80%)`,
              backgroundSize: "300% 300%",
            }}
            animate={{
              backgroundPosition: ["0% 0%", "100% 100%", "0% 0%"],
            }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
          />

          {/* Urgent pulse glow */}
          {isUrgent && (
            <motion.div
              className="absolute inset-0 pointer-events-none rounded-3xl"
              style={{
                boxShadow: "inset 0 0 30px rgba(236,72,153,0.08)",
              }}
              animate={{
                opacity: isVeryUrgent ? [0.3, 0.8, 0.3] : [0.2, 0.5, 0.2],
              }}
              transition={{
                duration: isVeryUrgent ? 0.8 : 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          )}

          <div className="relative px-6 py-5">
            {/* Top row: category + timer */}
            <div className="flex items-center justify-between mb-4">
              {/* Category badge */}
              <div
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  background: colors.bg,
                  border: `1px solid ${colors.border}`,
                  color: colors.text,
                }}
              >
                {category}
              </div>

              {/* Countdown timer */}
              <div className="flex items-center gap-1.5">
                <motion.div
                  className="w-1.5 h-1.5 rounded-full"
                  style={{
                    background: isUrgent ? "rgba(236,72,153,0.8)" : "rgba(190,170,110,0.6)",
                  }}
                  animate={{ opacity: [1, 0.3, 1] }}
                  transition={{
                    duration: isVeryUrgent ? 0.5 : isUrgent ? 1 : 2,
                    repeat: Infinity,
                  }}
                />
                <span
                  className="text-xs font-mono font-medium"
                  style={{
                    color: isUrgent ? "rgba(236,72,153,0.8)" : "rgba(150,140,100,0.8)",
                  }}
                >
                  残り {formatRemaining(remaining)}
                </span>
              </div>
            </div>

            {/* Insight text */}
            <p className="text-base font-medium text-slate-800 leading-relaxed mb-5">
              {insight}
            </p>

            {/* Countdown urgency bar */}
            {remaining > 0 && (
              <div className="mb-3">
                <div
                  className="h-[2px] rounded-full overflow-hidden"
                  style={{ background: "rgba(148,163,184,0.1)" }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{
                      background: isVeryUrgent
                        ? "rgba(236,72,153,0.8)"
                        : isUrgent
                          ? "rgba(245,158,11,0.6)"
                          : "rgba(190,170,110,0.4)",
                    }}
                    initial={{ width: "100%" }}
                    animate={{
                      width: `${Math.max((remaining / (24 * 60 * 60 * 1000)) * 100, 1)}%`,
                    }}
                    transition={{ duration: 1, ease: "linear" }}
                  />
                </div>
                {isVeryUrgent && (
                  <motion.p
                    className="text-[11px] mt-1 font-semibold text-center"
                    style={{ color: "rgba(236,72,153,0.8)" }}
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 0.8, repeat: Infinity }}
                  >
                    まもなく消滅します
                  </motion.p>
                )}
              </div>
            )}

            {/* Reaction buttons */}
            {!reaction ? (
              <div className="mb-2">
                <p className="text-[11px] text-slate-600 mb-2">このインサイト、どう感じた？</p>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {VANISHING_REACTIONS.map((r) => (
                    <button
                      key={r.key}
                      aria-label={`${r.label}と反応する`}
                      onClick={() => {
                        setReaction(r.key);
                        // localStorage に保存（リロードしても復元される）
                        saveVanishingReaction(r.key);
                        // XP: リアクション +5pt (max 3)
                        incrementReaction();
                        // DB にも保存（テーブル未作成でも黙って失敗）
                        if (insightId) {
                          fetch("/api/stargazer/vanishing-insight", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              insightId,
                              reaction: r.key,
                            }),
                          }).catch(() => {});
                        }
                      }}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium
                        bg-white/10 border border-slate-300/20 text-slate-600
                        hover:bg-white/20 hover:border-slate-300/40 transition-all"
                    >
                      <span>{r.icon}</span>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-[11px] text-slate-600 mb-2">
                ✦ 記録しました — このインサイトは一期一会
              </p>
            )}

            {/* Attribution source */}
            {basedOn && (
              <div className="flex items-center gap-1 mb-2">
                <span className="text-[10px] text-slate-400">出典:</span>
                <span className="text-[10px] text-slate-500 italic">
                  {basedOn}に基づく
                </span>
              </div>
            )}

            {/* Bottom hint */}
            <div className="flex items-center justify-end">
              <span className="text-[11px] text-slate-600">
                次のインサイトは観測を重ねると届きます
              </span>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export type { InsightCategory, VanishingInsightProps };
