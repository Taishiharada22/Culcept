"use client";

import { motion } from "framer-motion";
import type { InsightCard, InsightCardCollection } from "@/types/stargazer";

interface Props {
  cards?: InsightCard[];
  collection?: InsightCardCollection;
}

const TYPE_CONFIG: Record<string, { icon: string; gradient: string; border: string; glow: string }> = {
  pattern: {
    icon: "🔮",
    gradient: "linear-gradient(145deg, rgba(251,191,36,0.08) 0%, rgba(245,158,11,0.04) 50%, rgba(255,255,255,0.015) 100%)",
    border: "rgba(251,191,36,0.15)",
    glow: "rgba(251,191,36,0.1)",
  },
  contradiction: {
    icon: "⚡",
    gradient: "linear-gradient(145deg, rgba(251,191,36,0.06) 0%, rgba(245,158,11,0.03) 50%, rgba(255,255,255,0.015) 100%)",
    border: "rgba(245,158,11,0.15)",
    glow: "rgba(245,158,11,0.1)",
  },
  growth: {
    icon: "🌱",
    gradient: "linear-gradient(145deg, rgba(52,211,153,0.08) 0%, rgba(52,211,153,0.04) 50%, rgba(255,255,255,0.015) 100%)",
    border: "rgba(52,211,153,0.15)",
    glow: "rgba(52,211,153,0.1)",
  },
};

export default function InsightCardDisplay({ cards: cardsProp, collection }: Props) {
  const cards = cardsProp ?? collection?.cards ?? [];
  if (cards.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <motion.div
          className="w-3 h-3 rounded-full bg-amber-400/60"
          animate={{ scale: [1, 1.5, 1], opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2, repeat: Infinity }}
        />
        <span className="text-[10px] text-amber-200/30 tracking-[0.2em] mt-3">
          観測データを分析中
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {cards.map((card, i) => {
        const config = TYPE_CONFIG[card.type] || TYPE_CONFIG.pattern;
        return (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="rounded-xl p-5"
            style={{
              background: config.gradient,
              border: `1px solid ${config.border}`,
              boxShadow: `0 4px 16px ${config.glow}`,
            }}
          >
            <div className="flex items-start gap-3">
              <span className="text-xl">{config.icon}</span>
              <div className="flex-1 min-w-0">
                <h4 className="font-body text-sm font-semibold text-white/80 mb-1">
                  {card.title}
                </h4>
                <p className="font-body text-xs text-white/50 leading-relaxed">
                  {card.description}
                </p>
                {card.confidence && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="w-12 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-400/50"
                        style={{ width: `${card.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-white/25 font-mono">
                      {Math.round(card.confidence * 100)}%
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
