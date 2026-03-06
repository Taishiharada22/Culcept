"use client";

import { motion } from "framer-motion";
import type { ContradictionProbe } from "@/types/stargazer";

interface Props {
  probe: ContradictionProbe;
  onAnswer: (probeId: string, chipId: string, chipInsightType: string) => void;
  isSubmitting?: boolean;
}

export default function ContradictionProbeCard({ probe, onAnswer, isSubmitting }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-instrument p-6"
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-lg">🔍</span>
        <h3 className="font-body text-sm font-semibold text-amber-300/70 tracking-wide uppercase">
          矛盾の検出
        </h3>
      </div>
      <p className="font-body text-base text-white/80 mb-6 leading-relaxed">
        {probe.question}
      </p>
      <div className="space-y-2">
        {probe.options.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onAnswer(probe.id, opt.value, "contradiction_probe")}
            disabled={isSubmitting}
            className="w-full text-left px-4 py-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-white/70 hover:bg-white/[0.08] hover:border-amber-500/20 transition-all text-sm disabled:opacity-50"
          >
            {opt.label}
          </button>
        ))}
      </div>
    </motion.div>
  );
}
