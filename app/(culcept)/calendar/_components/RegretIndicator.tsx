"use client";

import { motion, AnimatePresence } from "framer-motion";
import * as React from "react";
import type { RegretPrediction } from "../_lib/regretPredictor";

const LEVEL_CONFIG = {
  safe:    { bg: "bg-emerald-50/60", border: "border-emerald-200/40", text: "text-emerald-600", icon: "✅", label: "安心" },
  mild:    { bg: "bg-blue-50/60",    border: "border-blue-200/40",    text: "text-blue-600",    icon: "💡", label: "概ね良好" },
  warning: { bg: "bg-amber-50/60",   border: "border-amber-200/40",   text: "text-amber-600",   icon: "⚠️", label: "注意" },
  danger:  { bg: "bg-red-50/60",     border: "border-red-200/40",     text: "text-red-500",     icon: "🚨", label: "要改善" },
} as const;

interface RegretIndicatorProps {
  prediction: RegretPrediction;
  compact?: boolean;
}

export default function RegretIndicator({ prediction, compact = false }: RegretIndicatorProps) {
  const [expanded, setExpanded] = React.useState(false);
  const config = LEVEL_CONFIG[prediction.level];

  if (prediction.level === "safe" && compact) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl ${config.bg} border ${config.border} backdrop-blur-sm overflow-hidden`}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-base">{config.icon}</span>
          <div>
            <p className={`text-[10px] font-bold ${config.text}`}>
              後悔リスク: {prediction.probability}%
            </p>
            {!compact && prediction.topSuggestion && prediction.level !== "safe" && (
              <p className="text-[9px] text-gray-500 mt-0.5">{prediction.topSuggestion}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[8px] font-bold rounded-full px-2 py-0.5 ${config.bg} ${config.text} border ${config.border}`}>
            {config.label}
          </span>
          {prediction.factors.length > 0 && (
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              className="text-[10px] text-gray-400"
            >
              ▼
            </motion.span>
          )}
        </div>
      </button>

      <AnimatePresence>
        {expanded && prediction.factors.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5">
              {prediction.factors.map((factor, i) => (
                <div key={i} className="flex items-start gap-2 rounded-xl bg-white/40 p-2">
                  <span className="text-[8px] font-bold text-gray-400 mt-0.5 w-4 text-center">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-semibold text-gray-600">{factor.message}</p>
                    {factor.suggestion && (
                      <p className="text-[8px] text-gray-400 mt-0.5">→ {factor.suggestion}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <div className="w-8 h-1.5 rounded-full bg-gray-200/60 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          factor.severity >= 60 ? "bg-red-400" :
                          factor.severity >= 35 ? "bg-amber-400" : "bg-blue-400"
                        }`}
                        style={{ width: `${factor.severity}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ── ミニ版（提案カード内） ── */
export function MiniRegretBadge({ prediction }: { prediction: RegretPrediction }) {
  if (prediction.level === "safe") return null;

  const config = LEVEL_CONFIG[prediction.level];
  return (
    <span className={`inline-flex items-center gap-1 text-[8px] font-bold rounded-full px-2 py-0.5 ${config.bg} ${config.text} border ${config.border}`}>
      {config.icon} 後悔{prediction.probability}%
    </span>
  );
}
