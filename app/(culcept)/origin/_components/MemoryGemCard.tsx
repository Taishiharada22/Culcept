"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import type { MemoryGem } from "@/lib/origin/v7/types";
import { EMOTION_CARDS } from "@/lib/origin/v7/memoryDiveData";

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Props
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type Props = {
  gem: MemoryGem;
  compact?: boolean;
  onClick?: () => void;
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Emotion Color Map
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type EmotionTheme = {
  bg: string;
  border: string;
  gradient: string;
};

const EMOTION_THEME: Record<string, EmotionTheme> = {
  joy: {
    bg: "bg-amber-50",
    border: "border-amber-300/60",
    gradient: "from-amber-100 to-amber-400",
  },
  sadness: {
    bg: "bg-slate-50",
    border: "border-slate-300/60",
    gradient: "from-slate-100 to-slate-400",
  },
  anger: {
    bg: "bg-red-50",
    border: "border-red-300/60",
    gradient: "from-red-100 to-red-400",
  },
  fear: {
    bg: "bg-violet-50",
    border: "border-violet-300/60",
    gradient: "from-violet-100 to-violet-400",
  },
  pride: {
    bg: "bg-emerald-50",
    border: "border-emerald-300/60",
    gradient: "from-emerald-100 to-emerald-400",
  },
  love: {
    bg: "bg-rose-50",
    border: "border-rose-300/60",
    gradient: "from-rose-100 to-rose-400",
  },
};

const DEFAULT_THEME: EmotionTheme = {
  bg: "bg-stone-50",
  border: "border-stone-300/60",
  gradient: "from-stone-100 to-stone-400",
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Helpers
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function getEmotionMeta(emotionId: string) {
  const card = EMOTION_CARDS.find((c) => c.id === emotionId);
  return {
    icon: card?.icon ?? "💎",
    label: card?.label ?? "感情",
  };
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "...";
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Shimmer keyframes (inline)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const shimmerStyle: React.CSSProperties = {
  background:
    "linear-gradient(110deg, transparent 25%, rgba(255,255,255,0.4) 37%, transparent 63%)",
  backgroundSize: "200% 100%",
  animation: "gemShimmer 3s ease-in-out infinite",
};

const shimmerKeyframes = `
@keyframes gemShimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Compact Card
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function CompactGemCard({ gem, onClick }: { gem: MemoryGem; onClick?: () => void }) {
  const { icon } = getEmotionMeta(gem.dominantEmotion);
  const theme = EMOTION_THEME[gem.dominantEmotion] ?? DEFAULT_THEME;

  return (
    <motion.div
      layoutId={`gem-${gem.id}`}
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      className={`flex h-16 cursor-pointer items-center gap-3 rounded-xl border ${theme.border} ${theme.bg} px-4 transition-shadow hover:shadow-md`}
    >
      <span className="text-xl">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-stone-800">
          {gem.title}
        </p>
        <p className="text-xs text-stone-400">
          {gem.calendarYear}年{gem.calendarMonth}月
        </p>
      </div>
    </motion.div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Full Card
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function FullGemCard({ gem, onClick }: { gem: MemoryGem; onClick?: () => void }) {
  const { icon, label: emotionLabel } = getEmotionMeta(gem.dominantEmotion);
  const theme = EMOTION_THEME[gem.dominantEmotion] ?? DEFAULT_THEME;

  const narrativeSnippet = useMemo(() => {
    const narrative = gem.events?.narrative ?? "";
    return truncate(narrative, 60);
  }, [gem.events?.narrative]);

  const place = gem.scene?.place ?? "";

  return (
    <motion.div
      layoutId={`gem-${gem.id}`}
      onClick={onClick}
      whileHover={onClick ? { scale: 1.02 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      className={`relative overflow-hidden rounded-3xl border-2 ${theme.border} ${theme.bg} p-5 ${
        onClick ? "cursor-pointer" : ""
      } shadow-lg transition-shadow hover:shadow-xl`}
    >
      {/* Inject shimmer keyframes */}
      <style>{shimmerKeyframes}</style>

      {/* Shimmer Overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-3xl"
        style={shimmerStyle}
      />

      {/* Gradient Accent Bar */}
      <div
        className={`mb-4 h-1 w-16 rounded-full bg-gradient-to-r ${theme.gradient}`}
      />

      {/* Title */}
      <h3 className="mb-2 text-lg font-bold text-stone-800">
        {gem.title}
      </h3>

      {/* Year/Month and Place */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-stone-500">
        <span className="rounded-full bg-white/60 px-2.5 py-0.5 font-medium">
          {gem.calendarYear}年{gem.calendarMonth}月
        </span>
        {place && (
          <span className="rounded-full bg-white/60 px-2.5 py-0.5">
            {place}
          </span>
        )}
      </div>

      {/* Dominant Emotion */}
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xl">{icon}</span>
        <span className="text-sm font-medium text-stone-600">
          {emotionLabel}
        </span>
      </div>

      {/* Narrative Snippet */}
      {narrativeSnippet && (
        <p className="text-sm leading-relaxed text-stone-500">
          {narrativeSnippet}
        </p>
      )}
    </motion.div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Main Export
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export default function MemoryGemCard({ gem, compact = false, onClick }: Props) {
  if (compact) {
    return <CompactGemCard gem={gem} onClick={onClick} />;
  }
  return <FullGemCard gem={gem} onClick={onClick} />;
}
