"use client";

import { motion } from "framer-motion";
import type { StarMap } from "@/types/stargazer";

interface DimensionDetail {
  id: string;
  score: number;
  confidence: number;
  evidenceCount: number;
  category: string;
  labelLeft: string;
  labelRight: string;
}

interface Props {
  starMap?: StarMap | null;
  dimensionDetails?: DimensionDetail[];
}

export default function UnobservedTab({ starMap, dimensionDetails: detailsProp }: Props) {
  // Derive dimension details from starMap if not directly provided
  const dimensionDetails: DimensionDetail[] = detailsProp ?? (
    starMap?.coreStar?.coreTraits
      ? Object.entries(starMap.coreStar.coreTraits).map(([id, score]) => ({
          id,
          score: typeof score === "number" ? score : 0.5,
          confidence: 0.5,
          evidenceCount: 0,
          category: "core",
          labelLeft: id,
          labelRight: id,
        }))
      : []
  );
  // Find dimensions with low confidence or low evidence count
  const unobserved = dimensionDetails
    .filter((d) => d.confidence < 0.3 || d.evidenceCount < 3)
    .sort((a, b) => a.confidence - b.confidence);

  const wellObserved = dimensionDetails.filter(
    (d) => d.confidence >= 0.3 && d.evidenceCount >= 3
  );

  return (
    <div className="space-y-8 max-w-[880px] mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="card-hero"
      >
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🔭</span>
          <h3 className="font-display text-xl font-semibold text-white">
            未観測の領域
          </h3>
        </div>
        <p className="font-body text-sm text-white/50 mb-6">
          まだデータが十分でない性格次元です。観測を続けることで精度が上がります。
        </p>

        {unobserved.length > 0 ? (
          <div className="space-y-3">
            {unobserved.map((dim, i) => (
              <motion.div
                key={dim.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center justify-between p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]"
              >
                <div>
                  <span className="text-sm text-white/60 font-medium">
                    {dim.labelLeft} ⇔ {dim.labelRight}
                  </span>
                  <span className="text-[10px] text-white/25 ml-2 font-mono">
                    {dim.category}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-amber-300/50 font-mono">
                    {dim.evidenceCount}件
                  </span>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <span className="text-3xl mb-3 inline-block">✨</span>
            <p className="text-sm text-white/50">
              すべての次元が十分に観測されています
            </p>
          </div>
        )}
      </motion.div>

      {/* 観測済み Summary */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="card-info"
      >
        <p className="text-xs text-white/30 font-mono">
          観測済み: {wellObserved.length}/{dimensionDetails.length} 次元
        </p>
      </motion.div>
    </div>
  );
}
