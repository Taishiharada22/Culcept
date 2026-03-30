"use client";

import { motion } from "framer-motion";

const EASE_OUT_EXPO: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface EntropySigProps {
  entropy: {
    structureType: "crystallized" | "fluid" | "fragmented" | "evolving";
    label: string;
    description: string;
    axisEntropy: { axisId: string; entropy: number }[];
  } | null;
}

const TYPE_ICONS: Record<string, string> = {
  crystallized: "\uD83D\uDC8E",
  fluid: "\uD83C\uDF0A",
  fragmented: "\uD83D\uDD2E",
  evolving: "\uD83E\uDD8B",
};

const TYPE_GRADIENTS: Record<string, string> = {
  crystallized: "from-sky-400 to-indigo-500",
  fluid: "from-cyan-400 to-blue-500",
  fragmented: "from-fuchsia-400 to-violet-500",
  evolving: "from-amber-400 to-emerald-500",
};

function entropyColor(entropy: number): string {
  // 0 (stable/emerald) → 1 (volatile/rose)
  if (entropy < 0.25) return "bg-emerald-400";
  if (entropy < 0.5) return "bg-emerald-300";
  if (entropy < 0.75) return "bg-amber-400";
  return "bg-rose-400";
}

export default function EntropySig({ entropy }: EntropySigProps) {
  if (!entropy) return null;

  const icon = TYPE_ICONS[entropy.structureType] ?? "\u2728";
  const gradient = TYPE_GRADIENTS[entropy.structureType] ?? "from-slate-400 to-slate-500";

  return (
    <div className="rounded-[30px] border border-white/70 bg-white/88 p-6 shadow-[0_18px_60px_rgba(133,129,180,0.14)] backdrop-blur-xl">
      {/* Large icon */}
      <div className="flex flex-col items-center">
        <motion.span
          className="text-5xl"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
        >
          {icon}
        </motion.span>

        {/* Type label in gradient text */}
        <h3
          className={`mt-3 bg-gradient-to-r ${gradient} bg-clip-text text-xl font-black text-transparent`}
        >
          {entropy.label}
        </h3>
      </div>

      {/* Description */}
      <p className="mt-4 text-center text-sm leading-7 text-slate-600">
        {entropy.description}
      </p>

      {/* Axis entropy heatmap */}
      {entropy.axisEntropy.length > 0 && (
        <div className="mt-6 space-y-2">
          <h4 className="mb-3 text-xs font-black text-slate-950">
            軸ごとのエントロピー
          </h4>
          {entropy.axisEntropy.map((axis, i) => (
            <motion.div
              key={axis.axisId}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                delay: i * 0.05,
                duration: 0.4,
                ease: EASE_OUT_EXPO,
              }}
            >
              <span className="w-20 truncate text-right text-[10px] font-bold text-slate-500">
                {axis.axisId}
              </span>
              <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                <motion.div
                  className={`h-full rounded-full ${entropyColor(axis.entropy)}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${axis.entropy * 100}%` }}
                  transition={{
                    delay: i * 0.05 + 0.1,
                    duration: 0.5,
                    ease: EASE_OUT_EXPO,
                  }}
                />
              </div>
              <span className="w-8 text-right text-[10px] font-bold text-slate-400">
                {(axis.entropy * 100).toFixed(0)}%
              </span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
