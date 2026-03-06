"use client";

import { motion } from "framer-motion";
import type { StarMap, ResolvedType } from "@/types/stargazer";

interface Props {
  starMap: StarMap | null;
  resolvedType?: ResolvedType | null;
}

export default function OrbitTab({ starMap, resolvedType }: Props) {
  const coreStar = starMap?.coreStar;

  return (
    <div className="space-y-8 max-w-[880px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-hero text-center"
      >
        <span className="text-4xl mb-4 inline-block">🌌</span>
        <h3 className="font-display text-xl font-semibold text-white mb-2">
          軌道の変遷
        </h3>
        <p className="font-body text-sm text-white/50 mb-6">
          あなたの性格特性がどのように変化してきたかを追跡します
        </p>

        {resolvedType?.orbit && (
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
            <span className="text-xs font-mono text-amber-300/70">
              現在の軌道: {resolvedType.orbit.key}
            </span>
          </div>
        )}
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-info text-center py-8"
      >
        <p className="text-sm text-white/40">
          観測を続けることで、軌道の変化が可視化されます
        </p>
        <p className="text-xs text-white/25 mt-2 font-mono">
          精度: {Math.round((coreStar?.confidenceScore ?? 0) * 100)}%
        </p>
      </motion.div>
    </div>
  );
}
