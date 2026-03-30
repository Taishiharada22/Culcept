"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GlassCard,
  GlassBadge,
  GlassButton,
} from "@/components/ui/glassmorphism-design";
import type { UnconsciousPattern } from "@/lib/rendezvous/unconsciousPatterns";

// ---------- Constants ----------

const TENSION_CONFIG: Record<
  UnconsciousPattern["tensionLevel"],
  { label: string; color: string; bgGradient: string; borderColor: string }
> = {
  gentle: {
    label: "\u7A0F\u3084\u304B",
    color: "text-blue-600",
    bgGradient: "from-blue-500/5 via-blue-400/3 to-transparent",
    borderColor: "border-blue-200/50",
  },
  moderate: {
    label: "\u4E2D\u7A0B\u5EA6",
    color: "text-amber-600",
    bgGradient: "from-amber-500/5 via-amber-400/3 to-transparent",
    borderColor: "border-amber-200/50",
  },
  confronting: {
    label: "\u6DF1\u5C64",
    color: "text-red-600",
    bgGradient: "from-red-500/5 via-red-400/3 to-transparent",
    borderColor: "border-red-200/50",
  },
};

const PATTERN_TYPE_LABELS: Record<string, string> = {
  attraction_avoidance: "\u5F15\u529B\u3068\u56DE\u907F",
  repetition_compulsion: "\u53CD\u5FA9\u5F37\u8FEB",
  projection_pattern: "\u6295\u5F71",
  comfort_zone_lock: "\u5B89\u5168\u5730\u5E2F",
  approach_retreat_cycle: "\u63A5\u8FD1\u3068\u5F8C\u9000",
  idealization_gap: "\u7406\u60F3\u3068\u73FE\u5B9F",
  hidden_priority: "\u96A0\u308C\u305F\u512A\u5148\u4E8B\u9805",
  growth_resistance: "\u6210\u9577\u3078\u306E\u62B5\u6297",
  safety_seeking: "\u5B89\u5168\u5FD7\u5411",
  novelty_addiction: "\u65B0\u898F\u6027\u4F9D\u5B58",
};

// ---------- Component ----------

export default function UnconsciousPatternCard({
  pattern,
  onFace,
  onDefer,
}: {
  pattern: UnconsciousPattern;
  onFace: (id: string) => void;
  onDefer: (id: string) => void;
}) {
  const [revealed, setRevealed] = useState(false);
  const tension = TENSION_CONFIG[pattern.tensionLevel];
  const typeLabel = PATTERN_TYPE_LABELS[pattern.type] ?? pattern.type;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 30 }}
    >
      <GlassCard
        className={`relative overflow-hidden ${tension.borderColor}`}
      >
        {/* Gradient background based on tension */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${tension.bgGradient} pointer-events-none`}
        />

        <div className="relative p-5">
          {/* Header: tension level + type */}
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <GlassBadge variant="default" size="sm">
                <span className={`text-xs ${tension.color}`}>
                  {tension.label}
                </span>
              </GlassBadge>
              <span className="text-[10px] text-slate-400">{typeLabel}</span>
            </div>

            {/* Significance dots */}
            <div className="flex items-center gap-0.5">
              {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold, i) => (
                <div
                  key={i}
                  className={`w-1 h-1 rounded-full ${
                    pattern.significance >= threshold
                      ? pattern.tensionLevel === "confronting"
                        ? "bg-red-400"
                        : pattern.tensionLevel === "moderate"
                          ? "bg-amber-400"
                          : "bg-blue-400"
                      : "bg-slate-200"
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Title with reveal animation */}
          <motion.h3
            className="text-base font-bold text-slate-800 mb-2"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
          >
            {pattern.title}
          </motion.h3>

          {/* Insight */}
          <motion.p
            className="text-sm text-slate-600 leading-relaxed mb-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.35, duration: 0.5 }}
          >
            {pattern.insight}
          </motion.p>

          {/* Evidence (expandable) */}
          <AnimatePresence>
            {!revealed ? (
              <motion.button
                key="reveal-btn"
                className="text-xs text-indigo-500 hover:text-indigo-600 font-medium mb-3"
                onClick={() => setRevealed(true)}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {"\u6839\u62E0\u3092\u898B\u308B \u25BE"}
              </motion.button>
            ) : (
              <motion.div
                key="evidence"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3 }}
                className="mb-3 space-y-2"
              >
                {pattern.evidence.map((ev, i) => (
                  <div
                    key={i}
                    className="bg-white/40 rounded-lg p-2.5 border border-slate-100"
                  >
                    <p className="text-xs font-medium text-slate-700 mb-0.5">
                      {ev.description}
                    </p>
                    <p className="text-[11px] text-slate-500">{ev.dataPoint}</p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Action buttons */}
          <div className="flex items-center gap-2 pt-1">
            <GlassButton
              className="flex-1 text-xs py-2"
              onClick={() => onFace(pattern.id)}
            >
              {"\u5411\u304D\u5408\u3046"}
            </GlassButton>
            <button
              className="flex-1 text-xs py-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg border border-slate-200/50 hover:border-slate-300/50"
              onClick={() => onDefer(pattern.id)}
            >
              {"\u4ECA\u306F\u307E\u3060"}
            </button>
          </div>
        </div>
      </GlassCard>
    </motion.div>
  );
}
