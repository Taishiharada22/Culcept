// app/stargazer/_components/InsightCardDisplay.tsx
// Insight Cards — パターン/矛盾/成長の3タイプ別カード
"use client";

import { motion } from "framer-motion";
import type { InsightCard, InsightCardCollection } from "@/types/stargazer";

interface Props {
  cards?: InsightCard[];
  collection?: InsightCardCollection;
  lightMode?: boolean;
}

const TYPE_CONFIG: Record<
  string,
  {
    icon: string;
    lightGradient: string;
    lightBorder: string;
    lightAccent: string;
    darkGradient: string;
    darkBorder: string;
    darkGlow: string;
  }
> = {
  pattern: {
    icon: "🔍",
    lightGradient:
      "linear-gradient(145deg, rgba(255,255,255,0.8) 0%, rgba(251,246,237,0.7) 100%)",
    lightBorder: "rgba(201,169,110,0.15)",
    lightAccent: "rgba(180,150,80,0.5)",
    darkGradient:
      "linear-gradient(145deg, rgba(190,170,110,0.08) 0%, rgba(190,170,110,0.04) 50%, rgba(160,170,200,0.03) 100%)",
    darkBorder: "rgba(190,170,110,0.15)",
    darkGlow: "rgba(0,0,0,0.03)",
  },
  contradiction: {
    icon: "🌊",
    lightGradient:
      "linear-gradient(145deg, rgba(255,255,255,0.8) 0%, rgba(237,243,251,0.7) 100%)",
    lightBorder: "rgba(96,165,250,0.15)",
    lightAccent: "rgba(96,165,250,0.5)",
    darkGradient:
      "linear-gradient(145deg, rgba(96,165,250,0.08) 0%, rgba(96,165,250,0.04) 50%, rgba(160,170,200,0.03) 100%)",
    darkBorder: "rgba(96,165,250,0.15)",
    darkGlow: "rgba(0,0,0,0.03)",
  },
  evolution: {
    icon: "📈",
    lightGradient:
      "linear-gradient(145deg, rgba(255,255,255,0.8) 0%, rgba(237,251,243,0.7) 100%)",
    lightBorder: "rgba(52,211,153,0.15)",
    lightAccent: "rgba(52,211,153,0.5)",
    darkGradient:
      "linear-gradient(145deg, rgba(52,211,153,0.08) 0%, rgba(52,211,153,0.04) 50%, rgba(160,170,200,0.03) 100%)",
    darkBorder: "rgba(52,211,153,0.15)",
    darkGlow: "rgba(0,0,0,0.03)",
  },
  growth: {
    icon: "🌱",
    lightGradient:
      "linear-gradient(145deg, rgba(255,255,255,0.8) 0%, rgba(237,251,243,0.7) 100%)",
    lightBorder: "rgba(52,211,153,0.15)",
    lightAccent: "rgba(52,211,153,0.5)",
    darkGradient:
      "linear-gradient(145deg, rgba(52,211,153,0.08) 0%, rgba(52,211,153,0.04) 50%, rgba(160,170,200,0.03) 100%)",
    darkBorder: "rgba(52,211,153,0.15)",
    darkGlow: "rgba(0,0,0,0.03)",
  },
};

export default function InsightCardDisplay({
  cards: cardsProp,
  collection,
  lightMode = true,
}: Props) {
  const cards = cardsProp ?? collection?.cards ?? [];

  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <motion.div
          className="w-3 h-3 rounded-full"
          style={{ background: "rgba(201,169,110,0.6)" }}
          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span
          className="text-xs tracking-[0.2em] mt-3"
          style={{
            color: lightMode ? "rgba(80,90,110,0.4)" : "rgba(120,125,140,0.4)",
          }}
        >
          観測データを分析中
        </span>
      </div>
    );
  }

  const textPrimary = lightMode
    ? "rgba(30,40,60,0.85)"
    : "rgba(30,35,55,0.85)";
  const textSecondary = lightMode
    ? "rgba(60,70,90,0.6)"
    : "rgba(100,105,130,0.6)";
  const textTertiary = lightMode
    ? "rgba(80,90,110,0.4)"
    : "rgba(120,125,140,0.4)";
  const barTrack = lightMode ? "rgba(0,0,0,0.06)" : "rgba(0,0,0,0.06)";

  return (
    <div className="space-y-3">
      {cards.map((card, i) => {
        const config = TYPE_CONFIG[card.type] || TYPE_CONFIG.pattern;
        return (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.06, duration: 0.22 }}
            className="rounded-xl p-5"
            style={{
              background: lightMode
                ? config.lightGradient
                : config.darkGradient,
              border: `1px solid ${lightMode ? config.lightBorder : config.darkBorder}`,
              backdropFilter: "blur(16px)",
              boxShadow: lightMode
                ? "0 2px 12px rgba(0,0,0,0.03)"
                : `0 4px 16px ${config.darkGlow}`,
            }}
          >
            <div className="flex items-start gap-3">
              <span className="text-lg mt-0.5">{config.icon}</span>
              <div className="flex-1 min-w-0">
                <h4
                  className="font-body text-sm font-semibold mb-1"
                  style={{ color: textPrimary }}
                >
                  {card.title}
                </h4>
                <p
                  className="font-body text-sm leading-relaxed"
                  style={{ color: textSecondary }}
                >
                  {card.description}
                </p>
                {card.confidence != null && (
                  <div className="mt-2 flex items-center gap-2">
                    <div
                      className="w-16 h-1 rounded-full overflow-hidden"
                      style={{ background: barTrack }}
                    >
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: lightMode
                            ? config.lightAccent
                            : "rgba(170,150,90,0.5)",
                        }}
                        initial={{ width: 0 }}
                        whileInView={{
                          width: `${card.confidence * 100}%`,
                        }}
                        viewport={{ once: true }}
                        transition={{
                          delay: 0.3 + i * 0.08,
                          duration: 0.25,
                        }}
                      />
                    </div>
                    <span
                      className="font-mono-sg text-xs tabular-nums"
                      style={{ color: textTertiary }}
                    >
                      確信度 {Math.round(card.confidence * 100)}%
                    </span>
                  </div>
                )}
              </div>
              {/* Share button */}
              <button
                onClick={() => {
                  const text = `${config.icon} ${card.title}\n${card.description}\n\n#Aneurasync #Stargazer`;
                  if (navigator.share) {
                    navigator.share({ text }).catch(() => {});
                  } else {
                    navigator.clipboard.writeText(text).catch(() => {});
                  }
                }}
                className="mt-3 text-[10px] tracking-wider"
                style={{
                  color: textTertiary,
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: "2px 0",
                }}
              >
                ↗ 共有
              </button>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
