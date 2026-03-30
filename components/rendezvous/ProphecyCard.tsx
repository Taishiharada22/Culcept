"use client";

import { motion } from "framer-motion";
import { RvCard, RV_COLORS } from "@/components/ui/rendezvous-design";

// =============================================================================
// ProphecyCard — ホーム画面の予言カード
// =============================================================================

export type ProphecyData = {
  id: string;
  text: string;
  targetDate: string;
  daysUntil: number;
  category?: string | null;
};

export function ProphecyCard({ prophecy }: { prophecy: ProphecyData }) {
  return (
    <RvCard
      className="relative overflow-hidden"
      accentBorder="rgba(123,97,255,0.3)"
    >
      {/* 背景グロー */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 30% 50%, rgba(123,97,255,0.06) 0%, transparent 70%)",
        }}
      />

      {/* ヘッダー */}
      <div className="flex items-center gap-2 mb-3 relative">
        <motion.span
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
          className="text-lg"
        >
          ✦
        </motion.span>
        <span
          className="text-xs font-bold tracking-wider"
          style={{ color: RV_COLORS.secondary }}
        >
          予言
        </span>
        <span className="text-xs ml-auto" style={{ color: RV_COLORS.textMuted }}>
          {prophecy.daysUntil > 0
            ? `あと${prophecy.daysUntil}日`
            : "今日中に"}
        </span>
      </div>

      {/* 予言テキスト */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 0.3 }}
        className="text-sm leading-relaxed font-medium relative"
        style={{
          color: RV_COLORS.text,
          fontFamily: "'Noto Serif JP', serif",
        }}
      >
        {prophecy.text}
      </motion.p>

      {/* 底部アクセント */}
      <div className="mt-3 flex items-center gap-1">
        {Array.from({ length: prophecy.daysUntil + 1 }).map((_, i) => (
          <motion.div
            key={i}
            className="h-1 rounded-full"
            style={{
              width: i === 0 ? 20 : 8,
              backgroundColor:
                i === 0 ? RV_COLORS.secondary : `${RV_COLORS.secondary}30`,
            }}
            animate={i === 0 ? { opacity: [0.6, 1, 0.6] } : undefined}
            transition={
              i === 0
                ? { repeat: Infinity, duration: 2, ease: "easeInOut" }
                : undefined
            }
          />
        ))}
      </div>
    </RvCard>
  );
}
