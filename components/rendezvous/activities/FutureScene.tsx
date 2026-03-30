"use client";

/**
 * FutureScene
 * 「二人で...」のシナリオを3パネルカードで表示
 * リアクション付き
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassButton,
  FadeInView,
} from "@/components/ui/glassmorphism-design";

type Props = {
  activityId: string;
  scenario: string;
  panels: [string, string, string] | null;
  mood: "warm" | "playful" | "reflective" | "adventurous" | null;
  myReaction: string | null;
  theirReaction: string | null;
  revealed: boolean;
  onSubmitReaction: (reaction: string) => void;
  onReveal: () => void;
};

const MOOD_COLORS: Record<string, { primary: string; bg: string; gradient: string }> = {
  warm: {
    primary: "#EC4899",
    bg: "rgba(236,72,153,0.05)",
    gradient: "linear-gradient(135deg, rgba(236,72,153,0.08), rgba(244,114,182,0.04))",
  },
  playful: {
    primary: "#F59E0B",
    bg: "rgba(245,158,11,0.05)",
    gradient: "linear-gradient(135deg, rgba(245,158,11,0.08), rgba(251,191,36,0.04))",
  },
  reflective: {
    primary: "#6366F1",
    bg: "rgba(99,102,241,0.05)",
    gradient: "linear-gradient(135deg, rgba(99,102,241,0.08), rgba(129,140,248,0.04))",
  },
  adventurous: {
    primary: "#22C55E",
    bg: "rgba(34,197,94,0.05)",
    gradient: "linear-gradient(135deg, rgba(34,197,94,0.08), rgba(74,222,128,0.04))",
  },
};

const REACTIONS = [
  { emoji: "\u2764\uFE0F", label: "いいね", key: "like" },
  { emoji: "\uD83E\uDD14", label: "面白い", key: "interesting" },
  { emoji: "\uD83D\uDE0A", label: "やってみたい", key: "want_to_try" },
];

export default function FutureScene({
  scenario,
  panels,
  mood,
  myReaction,
  theirReaction,
  revealed,
  onSubmitReaction,
  onReveal,
}: Props) {
  const [currentPanel, setCurrentPanel] = useState(0);
  const [loading, setLoading] = useState(!panels);
  const colors = MOOD_COLORS[mood ?? "reflective"];

  const bothReacted = myReaction !== null && theirReaction !== null;

  return (
    <GlassCard variant="default" padding="md" hoverEffect={false}>
      {/* Header */}
      <div className="text-center mb-4">
        <span
          className="inline-block text-[10px] font-bold tracking-widest mb-1"
          style={{ color: colors.primary }}
        >
          FUTURE SCENE
        </span>
        <h3 className="text-[15px] font-bold text-slate-800 leading-snug">
          {scenario}
        </h3>
      </div>

      {/* Loading state */}
      {loading && !panels && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-8"
        >
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="text-3xl mb-3 inline-block"
          >
            &#x1F52E;
          </motion.div>
          <p className="text-xs text-slate-400 font-medium">
            二人の未来を想像しています...
          </p>
        </motion.div>
      )}

      {/* Panels */}
      {panels && (
        <div className="mb-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPanel}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3 }}
              className="p-5 rounded-2xl min-h-[80px] border"
              style={{
                background: colors.gradient,
                borderColor: `${colors.primary}10`,
              }}
            >
              <div
                className="text-[9px] font-bold mb-2 tracking-wider"
                style={{ color: `${colors.primary}80` }}
              >
                SCENE {currentPanel + 1} / 3
              </div>
              <div className="text-sm text-slate-600 leading-relaxed font-medium">
                {panels[currentPanel]}
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Panel navigation */}
          <div className="flex justify-center gap-2 mt-3">
            {[0, 1, 2].map((i) => (
              <button
                key={i}
                onClick={() => setCurrentPanel(i)}
                className="border-none cursor-pointer transition-all duration-300 p-0"
                style={{
                  width: i === currentPanel ? 20 : 6,
                  height: 6,
                  borderRadius: 3,
                  background:
                    i === currentPanel
                      ? colors.primary
                      : `${colors.primary}25`,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* Reaction phase */}
      {panels && !myReaction && (
        <FadeInView>
          <div className="text-[11px] text-slate-400 text-center mb-2">
            このシーンの印象は?
          </div>
          <div className="flex justify-center gap-3">
            {REACTIONS.map((r) => (
              <motion.button
                key={r.key}
                whileTap={{ scale: 0.9 }}
                whileHover={{ scale: 1.05 }}
                onClick={() => onSubmitReaction(r.label)}
                className="py-2 px-3 rounded-xl border cursor-pointer text-center backdrop-blur-sm transition-shadow hover:shadow-md"
                style={{
                  borderColor: `${colors.primary}15`,
                  background: "rgba(255,255,255,0.8)",
                }}
              >
                <div className="text-xl">{r.emoji}</div>
                <div className="text-[9px] text-slate-400 mt-0.5">
                  {r.label}
                </div>
              </motion.button>
            ))}
          </div>
        </FadeInView>
      )}

      {/* Waiting for them */}
      {myReaction && !bothReacted && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-3"
        >
          <p className="text-xs text-slate-400">
            あなたの印象: <strong className="text-slate-600">{myReaction}</strong>
          </p>
          <p className="text-[11px] text-slate-300 mt-1">
            相手のリアクションを待っています...
          </p>
        </motion.div>
      )}

      {/* Both reacted, can reveal */}
      {bothReacted && !revealed && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-3"
        >
          <GlassButton
            variant="gradient"
            onClick={onReveal}
            style={{
              background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}CC)`,
              boxShadow: `0 4px 16px ${colors.primary}30`,
            }}
          >
            お互いの印象を見る
          </GlassButton>
        </motion.div>
      )}

      {/* Revealed */}
      {revealed && myReaction && theirReaction && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex gap-2.5 py-3"
        >
          <div className="flex-1 p-2.5 rounded-xl bg-indigo-50/60 text-center">
            <div className="text-[9px] font-bold mb-1" style={{ color: "#6366F1" }}>
              あなた
            </div>
            <div className="text-sm font-semibold text-slate-800">{myReaction}</div>
          </div>
          <div className="flex-1 p-2.5 rounded-xl bg-pink-50/60 text-center">
            <div className="text-[9px] font-bold mb-1" style={{ color: "#EC4899" }}>
              相手
            </div>
            <div className="text-sm font-semibold text-slate-800">{theirReaction}</div>
          </div>
        </motion.div>
      )}
    </GlassCard>
  );
}
