"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { DailyResonance, ResonanceSourceType } from "@/lib/rendezvous/dailyResonance";

// =============================================================================
// DailyResonanceCard - 日次共鳴カード
// 自己理解ナッジをGlassCardスタイルで表示
// =============================================================================

type DailyResonanceCardProps = {
  resonance: DailyResonance;
  className?: string;
};

const SOURCE_STYLES: Record<ResonanceSourceType, { accent: string; icon: string }> = {
  viewing_pattern: { accent: "border-l-amber-400", icon: "👁" },
  swipe_pattern: { accent: "border-l-violet-400", icon: "✦" },
  time_pattern: { accent: "border-l-blue-400", icon: "◷" },
  absence_reflection: { accent: "border-l-emerald-400", icon: "◌" },
  stargazer_echo: { accent: "border-l-indigo-400", icon: "☆" },
  seasonal: { accent: "border-l-rose-400", icon: "❀" },
};

export function DailyResonanceCard({ resonance, className }: DailyResonanceCardProps) {
  const style = SOURCE_STYLES[resonance.sourceType];

  return (
    <motion.div
      className={cn(
        "rounded-2xl bg-white/60 backdrop-blur-md border border-white/30 shadow-sm overflow-hidden",
        className,
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <div className={cn("border-l-[3px] pl-4 pr-4 py-4", style.accent)}>
        {/* ラベル */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm">{style.icon}</span>
          <span className="text-[10px] text-slate-400 uppercase tracking-wider">
            今日の共鳴
          </span>
        </div>

        {/* メインテキスト */}
        <p className="text-sm text-slate-700 leading-relaxed mb-2">
          {resonance.text}
        </p>

        {/* サブテキスト */}
        {resonance.subtext && (
          <p className="text-xs text-slate-500 leading-relaxed">
            {resonance.subtext}
          </p>
        )}
      </div>
    </motion.div>
  );
}
