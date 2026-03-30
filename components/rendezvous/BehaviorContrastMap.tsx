"use client";

import { motion } from "framer-motion";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { ContrastData } from "@/lib/rendezvous/selfDiscovery";

// =============================================================================
// BehaviorContrastMap
// 行動対比マップ - 候補者間の行動差を水平バーで可視化
// =============================================================================

interface BehaviorContrastMapProps {
  contrasts: ContrastData[];
}

function ContrastRow({ contrast, index }: { contrast: ContrastData; index: number }) {
  const maxValue = Math.max(contrast.candidateA.value, contrast.candidateB.value);
  const widthA = maxValue > 0 ? (contrast.candidateA.value / maxValue) * 100 : 0;
  const widthB = maxValue > 0 ? (contrast.candidateB.value / maxValue) * 100 : 0;

  return (
    <div className="space-y-2">
      {/* Label */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{contrast.label}</span>
        <span className="text-xs text-slate-400">{contrast.unit}</span>
      </div>

      {/* Candidate A bar */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-20 truncate">
            {contrast.candidateA.name}
          </span>
          <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-cyan-500"
              initial={{ width: 0 }}
              animate={{ width: `${widthA}%` }}
              transition={{ duration: 0.8, delay: 0.1 + index * 0.15, ease: "easeOut" }}
            />
          </div>
          <span className="text-xs font-medium text-slate-600 w-16 text-right whitespace-nowrap">
            {Math.round(contrast.candidateA.value)}{contrast.unit}
          </span>
        </div>

        {/* Candidate B bar */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500 w-20 truncate">
            {contrast.candidateB.name}
          </span>
          <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500"
              initial={{ width: 0 }}
              animate={{ width: `${widthB}%` }}
              transition={{ duration: 0.8, delay: 0.2 + index * 0.15, ease: "easeOut" }}
            />
          </div>
          <span className="text-xs font-medium text-slate-600 w-16 text-right whitespace-nowrap">
            {Math.round(contrast.candidateB.value)}{contrast.unit}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function BehaviorContrastMap({ contrasts }: BehaviorContrastMapProps) {
  if (!contrasts || contrasts.length === 0) return null;

  return (
    <GlassCard variant="bordered" padding="md" hoverEffect={false}>
      <h3 className="text-sm font-bold text-slate-900 mb-4">
        行動の対比マップ
      </h3>
      <div className="space-y-5">
        {contrasts.map((contrast, i) => (
          <ContrastRow key={contrast.label} contrast={contrast} index={i} />
        ))}
      </div>
    </GlassCard>
  );
}
