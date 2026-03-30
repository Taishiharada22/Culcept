"use client";

import { useCallback } from "react";
import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { DiscoveryCard } from "@/lib/rendezvous/selfDiscovery";

// =============================================================================
// SelfDiscoveryCard
// 発見の深さカード - 無意識の行動パターンから生成される自己発見カード
// =============================================================================

interface SelfDiscoveryCardProps {
  card: DiscoveryCard;
  onDismiss: (id: string) => void;
}

// Type-specific accent colors
const TYPE_ACCENTS: Record<
  string,
  { border: string; bg: string; text: string; dot: string }
> = {
  behavior_contrast: {
    border: "border-cyan-200/60",
    bg: "bg-cyan-50/50",
    text: "text-cyan-700",
    dot: "bg-cyan-400",
  },
  depth_insight: {
    border: "border-purple-200/60",
    bg: "bg-purple-50/50",
    text: "text-purple-700",
    dot: "bg-purple-400",
  },
  pattern_alert: {
    border: "border-amber-200/60",
    bg: "bg-amber-50/50",
    text: "text-amber-700",
    dot: "bg-amber-400",
  },
  time_pattern: {
    border: "border-indigo-200/60",
    bg: "bg-indigo-50/50",
    text: "text-indigo-700",
    dot: "bg-indigo-400",
  },
  unconscious_reveal: {
    border: "border-rose-200/60",
    bg: "bg-rose-50/50",
    text: "text-rose-700",
    dot: "bg-rose-400",
  },
};

const DEFAULT_ACCENT = {
  border: "border-slate-200/60",
  bg: "bg-slate-50/50",
  text: "text-slate-700",
  dot: "bg-slate-400",
};

export default function SelfDiscoveryCard({
  card,
  onDismiss,
}: SelfDiscoveryCardProps) {
  const accent = TYPE_ACCENTS[card.type] ?? DEFAULT_ACCENT;

  const handleDismiss = useCallback(async () => {
    // PATCH to dismiss API
    try {
      await fetch(`/api/rendezvous/self-discovery/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "dismissed" }),
      });
    } catch {
      // Best-effort
    }
    onDismiss(card.id);
  }, [card.id, onDismiss]);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
    >
      <GlassCard
        variant="bordered"
        padding="md"
        hoverEffect={false}
        className={`relative ${accent.border}`}
      >
        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="閉じる"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        {/* Type indicator dot */}
        <div className="flex items-center gap-2 mb-3">
          <span className={`w-2 h-2 rounded-full ${accent.dot}`} />
          <span className={`text-xs font-medium ${accent.text}`}>
            {card.type === "behavior_contrast" && "行動の対比"}
            {card.type === "depth_insight" && "深層の洞察"}
            {card.type === "pattern_alert" && "パターン検知"}
            {card.type === "time_pattern" && "時間のパターン"}
            {card.type === "unconscious_reveal" && "無意識の発見"}
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-slate-900 mb-2 pr-8">
          {card.title}
        </h3>

        {/* Body */}
        <p className="text-sm text-slate-600 leading-relaxed mb-2">
          {card.body}
        </p>

        {/* Subtext */}
        {card.subtext && (
          <p className={`text-xs leading-relaxed ${accent.text} opacity-70`}>
            {card.subtext}
          </p>
        )}
      </GlassCard>
    </motion.div>
  );
}
