"use client";

import { motion } from "framer-motion";
import type { FormationChain } from "@/lib/origin/v7/formationReader";
import { getPeriodLabel } from "@/lib/origin/v7/periods";

type Props = {
  chains: FormationChain[];
};

export default function FormationChainDisplay({ chains }: Props) {
  // confidence >= 0.6 のみ表示、最大6本
  const visible = chains.filter((c) => c.confidence >= 0.6).slice(0, 6);
  if (visible.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="rounded-2xl border border-amber-200/30 bg-white/50 p-4 backdrop-blur-sm"
    >
      <div className="mb-3 flex items-center gap-1.5">
        <span className="text-sm">🔗</span>
        <h3 className="text-xs font-semibold text-gray-600">形成の線</h3>
        <span className="ml-auto text-[10px] text-gray-400">
          {visible.length}本
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((chain, i) => (
          <motion.div
            key={chain.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="rounded-xl border border-amber-100/40 bg-amber-50/30 px-3 py-2"
          >
            {/* Chain flow: source → mechanism → remains */}
            <div className="flex flex-wrap items-center gap-1 text-[12px]">
              <span className="font-medium text-amber-700/80">
                {chain.source}
              </span>
              <span className="text-gray-300">→</span>
              <span className="text-gray-500">{chain.mechanism}</span>
              <span className="text-gray-300">→</span>
              <span className="font-medium text-amber-600/90">
                {chain.remains}
              </span>
            </div>
            <p className="mt-0.5 text-[10px] text-gray-400">
              {getPeriodLabel(chain.sourcePeriod)}
            </p>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
