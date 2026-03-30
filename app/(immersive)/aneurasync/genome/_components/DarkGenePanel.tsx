"use client";

import { motion, AnimatePresence } from "framer-motion";
import type { DarkGeneDiscovery } from "../hooks/useDarkGenes";

interface DarkGenePanelProps {
  darkCount: number;
  discoveredCount: number;
  discoveries: DarkGeneDiscovery[];
  recentDiscoveryIds: Set<string>;
}

const STRAND_COLORS: Record<string, string> = {
  physical: "#6366f1",
  personality: "#8b5cf6",
  behavioral: "#ec4899",
  social: "#14b8a6",
};

/**
 * Dark Gene Discovery panel — shows unknown genome regions and recent discoveries.
 */
export default function DarkGenePanel({
  darkCount,
  discoveredCount,
  discoveries,
  recentDiscoveryIds,
}: DarkGenePanelProps) {
  const recentDiscoveries = discoveries
    .filter((d) => recentDiscoveryIds.has(d.basePairId))
    .slice(-5)
    .reverse();

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[20px] border border-white/80 bg-white/60 px-4 py-3 text-center backdrop-blur-sm">
          <div className="text-2xl font-bold text-slate-700">{darkCount}</div>
          <div className="mt-1 text-[10px] text-slate-400">未観測遺伝子</div>
        </div>
        <div className="rounded-[20px] border border-white/80 bg-white/60 px-4 py-3 text-center backdrop-blur-sm">
          <div className="text-2xl font-bold text-amber-500">{discoveredCount}</div>
          <div className="mt-1 text-[10px] text-slate-400">発見済み</div>
        </div>
      </div>

      {/* Dark gene info */}
      {darkCount > 0 && (
        <div className="rounded-[24px] border border-slate-200/40 bg-gradient-to-b from-slate-900/90 to-slate-800/90 px-5 py-4 text-white/80">
          <div className="flex items-center gap-2">
            <span className="text-lg">🔮</span>
            <span className="text-sm font-semibold">暗黒遺伝子領域</span>
          </div>
          <p className="mt-2 text-xs text-white/50">
            {darkCount}個の塩基対がまだ十分に観測されていません。
            日々の観測や行動を通じて、隠れた性質が浮かび上がります。
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-500"
              initial={{ width: 0 }}
              animate={{
                width: `${Math.min(100, (discoveredCount / Math.max(1, discoveredCount + darkCount)) * 100)}%`,
              }}
              transition={{ duration: 1, ease: "easeOut" }}
            />
          </div>
          <div className="mt-1 text-right text-[10px] text-white/40">
            {Math.round(
              (discoveredCount / Math.max(1, discoveredCount + darkCount)) * 100,
            )}% 発見済み
          </div>
        </div>
      )}

      {/* Recent discoveries */}
      <AnimatePresence>
        {recentDiscoveries.length > 0 && (
          <motion.div
            className="space-y-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-xs font-semibold text-amber-600">
              ✨ 最近の発見
            </div>
            {recentDiscoveries.map((disc) => (
              <motion.div
                key={disc.basePairId}
                className="flex items-center gap-3 rounded-2xl border border-amber-200/40 bg-amber-50/60 px-4 py-3"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 25 }}
              >
                <span className="text-lg">💫</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-slate-700">
                    {disc.label}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    信頼度 {Math.round(disc.previousConfidence * 100)}% →{" "}
                    <span
                      className="font-bold"
                      style={{ color: STRAND_COLORS[disc.strandId] ?? "#8b5cf6" }}
                    >
                      {Math.round(disc.newConfidence * 100)}%
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* CTA */}
      {darkCount > 0 && (
        <div className="text-center">
          <span className="text-xs text-slate-400">
            毎日の観測で暗黒遺伝子を発見しよう
          </span>
        </div>
      )}
    </div>
  );
}
