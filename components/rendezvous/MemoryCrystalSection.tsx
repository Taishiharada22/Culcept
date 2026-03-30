"use client";

/**
 * MemoryCrystalSection — 統合メモリークリスタルコンポーネント
 * MemoryCrystalCard, MemoryCrystalList, MemoryCrystalBadge, CrystalGallery を統合
 */

import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { RV_COLORS, RvCard, RvSectionTitle } from "@/components/ui/rendezvous-design";
import { FadeInView } from "@/components/ui/glassmorphism-design";

type Crystal = {
  id: string;
  type: string;
  description: string;
  createdAt: string;
  significance?: number;
};

type Props = {
  crystals: Crystal[];
  variant?: "compact" | "full" | "badge";
  color?: string;
  className?: string;
};

export default function MemoryCrystalSection({ crystals, variant = "compact", color = RV_COLORS.secondary, className }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!crystals || crystals.length === 0) return null;

  // Badge variant — just a count indicator
  if (variant === "badge") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold"
        style={{ background: `${color}10`, color, border: `1px solid ${color}20` }}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill={color} opacity={0.6}>
          <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
        </svg>
        {crystals.length}
      </span>
    );
  }

  const displayCrystals = expanded ? crystals : crystals.slice(0, 3);

  return (
    <FadeInView className={className}>
      <RvCard>
        <RvSectionTitle accent={color}>思い出の結晶</RvSectionTitle>
        <div className="mt-4 flex flex-col gap-3">
          <AnimatePresence>
            {displayCrystals.map((crystal, i) => (
              <motion.div
                key={crystal.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
                style={{ background: `${color}04`, border: `1px solid ${color}08` }}
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${color}12` }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill={color} opacity={0.7}>
                    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs leading-relaxed" style={{ color: RV_COLORS.textSub }}>
                    {crystal.description}
                  </p>
                  <span className="text-[10px] mt-1 block" style={{ color: RV_COLORS.textMuted }}>
                    {new Date(crystal.createdAt).toLocaleDateString("ja-JP", { month: "short", day: "numeric" })}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
        {crystals.length > 3 && !expanded && (
          <button
            onClick={() => setExpanded(true)}
            className="w-full mt-3 py-2 text-xs font-medium rounded-lg border-none cursor-pointer"
            style={{ background: `${color}06`, color }}
          >
            すべて見る ({crystals.length}件)
          </button>
        )}
      </RvCard>
    </FadeInView>
  );
}
