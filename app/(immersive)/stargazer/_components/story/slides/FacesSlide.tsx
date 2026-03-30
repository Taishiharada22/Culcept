// Slide U1: FACES — 文脈ごとの差
"use client";

import { motion } from "framer-motion";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

export interface FacesSlideData {
  contexts: Array<{
    key: string;
    label: string;
    icon: string;
    topDiff: {
      axisId: TraitAxisKey;
      label: string;
      score: number;
    } | null;
  }>;
}

interface Props {
  data: FacesSlideData;
  onReady: () => void;
}

export default function FacesSlide({ data, onReady }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <motion.p
        className="text-xs tracking-widest uppercase mb-8"
        style={{ color: "rgba(255,255,255,0.4)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4 }}
      >
        文脈ごとの差
      </motion.p>

      <div className="flex gap-4 mb-8">
        {data.contexts.map((ctx, i) => (
          <motion.div
            key={ctx.key}
            className="flex-1 min-w-0 px-3 py-4 rounded-xl"
            style={{ background: "rgba(255,255,255,0.04)" }}
            initial={{ opacity: 0, x: -20 + i * 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 + i * 0.15, duration: 0.5 }}
          >
            <p className="text-lg mb-2" aria-hidden="true">{ctx.icon}</p>
            <p className="text-xs font-medium mb-2" style={{ color: "rgba(255,255,255,0.7)" }}>
              {ctx.label}
            </p>
            {ctx.topDiff ? (
              <>
                <p className="text-xs" style={{ color: "rgba(255,255,255,0.5)" }}>
                  {ctx.topDiff.label}
                </p>
                <p className="text-sm font-bold mt-1" style={{ color: "rgba(255,255,255,0.85)" }}>
                  {Math.round(((ctx.topDiff.score + 1) / 2) * 100)}%
                </p>
              </>
            ) : (
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                データ不足
              </p>
            )}
          </motion.div>
        ))}
      </div>

      <motion.p
        className="text-sm leading-relaxed max-w-[280px]"
        style={{ color: "rgba(255,255,255,0.5)" }}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.9, duration: 0.5 }}
        onAnimationComplete={onReady}
      >
        場面によって、あなたの判断基準が変わります
      </motion.p>
    </div>
  );
}
