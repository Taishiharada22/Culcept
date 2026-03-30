"use client";

import { motion } from "framer-motion";
import type { OriginSnapshot } from "@/lib/origin/v7/formationReader";

type Props = {
  snapshot: OriginSnapshot;
};

export default function OriginSnapshotCard({ snapshot }: Props) {
  if (snapshot.sentences.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-amber-200/40 bg-amber-50/60 p-4 backdrop-blur-sm"
    >
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-sm">📖</span>
        <h3 className="text-xs font-semibold text-amber-700/70">
          Origin Snapshot
        </h3>
      </div>

      <div className="space-y-1">
        {snapshot.sentences.map((sentence, i) => (
          <motion.p
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.1 }}
            className="text-[13px] leading-[1.8] text-gray-600"
          >
            {sentence}
          </motion.p>
        ))}
      </div>

      {/* Data completeness bar */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-amber-100/60">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.round(snapshot.dataCompleteness * 100)}%` }}
            transition={{ duration: 0.8, delay: 0.3 }}
            className="h-full rounded-full bg-amber-400/50"
          />
        </div>
        <span className="text-[10px] text-amber-500/60">
          {Math.round(snapshot.dataCompleteness * 100)}%
        </span>
      </div>
    </motion.div>
  );
}
