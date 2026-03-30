"use client";

import { motion } from "framer-motion";
import type { ContextFaces, ResolvedVisualStyle } from "@/types/stargazer";

interface Props {
  contextFaces: ContextFaces | undefined;
  activeContext?: "romance" | "work" | "friends";
  borderColor?: string;
  visual?: ResolvedVisualStyle;
}

const CONTEXT_LABELS: Record<string, string> = {
  romance: "恋愛",
  work: "仕事",
  friends: "友達",
};

export default function ContextFacesPanel({ contextFaces, activeContext = "romance", borderColor, visual }: Props) {
  const faces = contextFaces?.[activeContext] || {};
  const entries = Object.entries(faces).sort(([, a], [, b]) => b - a);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="rounded-xl p-5"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: borderColor ? `1px solid ${borderColor}` : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <p className="text-xs text-white/30 tracking-wider uppercase font-semibold mb-4">
        場面ごとの軌道差
      </p>
      <p className="font-body text-sm text-white/50 mb-4">
        同じ人格が、文脈によってどう傾くか
      </p>
      {entries.length > 0 ? (
        <div className="space-y-3">
          {entries.map(([dim, score]) => (
            <div key={dim} className="flex items-center gap-3">
              <span className="text-xs text-white/50 w-16 truncate">{dim}</span>
              <div className="flex-1 h-2 bg-white/[0.04] rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-amber-600/60 to-amber-400/80"
                  initial={{ width: 0 }}
                  animate={{ width: `${score * 100}%` }}
                  transition={{ duration: 0.25 }}
                />
              </div>
              <span className="text-xs text-white/30 font-mono w-8 text-right">
                {Math.round(score * 100)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-white/30 text-center py-4">
          観測データが不足しています
        </p>
      )}
    </motion.div>
  );
}
