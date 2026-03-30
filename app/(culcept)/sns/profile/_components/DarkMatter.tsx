"use client";

import Link from "next/link";
import { useMemo } from "react";
import { motion } from "framer-motion";
import { axisLabel } from "@/lib/stargazer/axisLabels";

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface DarkMatterItem {
  axisId: string;
  axisLabel: string;
  confidence: number;
  resonancePrediction: number | null;
  explorationPriority?: "high" | "medium" | "low";
  reason?: string;
  explorationPrompt?: string;
}

interface DarkMatterProps {
  items: DarkMatterItem[];
}

const PRIORITY_META: Record<string, { label: string; border: string; glow: string; badge: string }> = {
  high: {
    label: "優先探索",
    border: "border-amber-300/80",
    glow: "shadow-[0_0_16px_rgba(245,158,11,0.2)]",
    badge: "bg-amber-100 text-amber-700",
  },
  medium: {
    label: "探索推奨",
    border: "border-violet-200/80",
    glow: "",
    badge: "bg-violet-100 text-violet-600",
  },
  low: {
    label: "",
    border: "border-slate-100",
    glow: "",
    badge: "",
  },
};

export default function DarkMatter({ items }: DarkMatterProps) {
  // Sort by priority: high → medium → low, then by confidence ascending
  const sorted = useMemo(() => {
    const order = { high: 0, medium: 1, low: 2 };
    return [...items].sort((a, b) => {
      const pa = order[a.explorationPriority ?? "low"];
      const pb = order[b.explorationPriority ?? "low"];
      if (pa !== pb) return pa - pb;
      return a.confidence - b.confidence;
    });
  }, [items]);

  if (items.length === 0) return null;

  return (
    <div className="rounded-[30px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(133,129,180,0.14)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-900/80">
      {/* Header */}
      <h3 className="text-lg font-black text-slate-950 dark:text-white">まだ見えていない領域</h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        まだ十分に観測されていない領域
      </p>

      {/* Items */}
      <div className="mt-5 space-y-3">
        {sorted.map((item, i) => {
          const priority = item.explorationPriority ?? "low";
          const meta = PRIORITY_META[priority];
          // Resolve Japanese label: use axisLabel() to translate English keys
          const label = axisLabel(item.axisId) !== item.axisId
            ? axisLabel(item.axisId)
            : item.axisLabel;

          return (
            <motion.div
              key={item.axisId}
              className={`rounded-[24px] border bg-white/60 p-4 dark:bg-slate-800/60 ${meta.border} ${meta.glow}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.06,
                duration: 0.4,
                ease: EASE_OUT_EXPO,
              }}
            >
              {/* Axis label + priority badge */}
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-black text-slate-950 dark:text-white">
                  {label}
                </h4>
                {meta.label && (
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.badge}`}>
                    {meta.label}
                  </span>
                )}
              </div>

              {/* Confidence bar */}
              <div className="mt-2 flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <motion.div
                    className="h-full rounded-full bg-violet-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${item.confidence * 100}%` }}
                    transition={{
                      delay: i * 0.06 + 0.1,
                      duration: 0.5,
                      ease: EASE_OUT_EXPO,
                    }}
                  />
                </div>
                <span className="text-[10px] font-bold text-slate-400">
                  {(item.confidence * 100).toFixed(0)}%
                </span>
              </div>

              {/* Reason text */}
              {item.reason && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.reason}
                </p>
              )}

              {/* Resonance prediction */}
              {item.resonancePrediction !== null && (
                <p className="mt-1 text-[10px] text-slate-400">
                  共鳴予測: {item.resonancePrediction > 0 ? "+" : ""}
                  {item.resonancePrediction.toFixed(2)}
                </p>
              )}

              {/* CTA — not domain-specific, just encourage continued observation */}
              <Link
                href="/stargazer"
                className="mt-2 inline-block text-[11px] font-bold text-violet-500 hover:text-violet-700"
              >
                観測を続けると精度が上がります &rarr;
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
