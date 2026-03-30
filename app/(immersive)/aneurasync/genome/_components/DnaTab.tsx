"use client";

import { motion } from "framer-motion";
import type { GenomeVisualizationData } from "@/lib/aneurasync/personaGenome";
import ChromosomeMap from "./ChromosomeMap";

interface DnaTabProps {
  visualization: GenomeVisualizationData;
}

export default function DnaTab({ visualization }: DnaTabProps) {
  const { strands } = visualization;

  return (
    <div className="space-y-6">
      <motion.p
        className="text-center text-sm leading-7 text-slate-500"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        4本の染色体が、あなたの全体像を構成しています
      </motion.p>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2" role="list" aria-label="染色体マップ">
        {strands.map((strand, i) => (
          <ChromosomeMap key={strand.id} strand={strand} index={i} />
        ))}
      </div>

      <p className="text-center text-xs text-slate-400 mt-2">
        バンドをタップして詳細を確認
      </p>

      {/* Data gap indicator */}
      {strands.some((s) => s.basePairs.length === 0) && (
        <div className="rounded-[28px] border border-dashed border-slate-200 bg-slate-50/60 p-5 text-center">
          <div className="text-2xl">🧪</div>
          <div className="mt-2 text-sm font-semibold text-slate-600">
            データ不足の染色体があります
          </div>
          <p className="mt-1 text-xs text-slate-400">
            診断やアクションで塩基対が追加されます
          </p>
        </div>
      )}
    </div>
  );
}
