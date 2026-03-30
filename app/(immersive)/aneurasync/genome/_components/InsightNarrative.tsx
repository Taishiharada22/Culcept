"use client";

import { motion } from "framer-motion";

interface InsightNarrativeProps {
  /** The key insight to communicate */
  insight: string;
  /** Optional detail explanation */
  detail?: string;
  /** Visual accent color */
  accentColor?: string;
  /** Icon */
  icon?: string;
}

/**
 * InsightNarrative — a dramatic one-line insight card that creates "Aha!" moments.
 * Used throughout genome tabs to punctuate data with meaning.
 */
export default function InsightNarrative({
  insight,
  detail,
  accentColor = "#8b5cf6",
  icon = "💡",
}: InsightNarrativeProps) {
  return (
    <motion.div
      className="relative overflow-hidden rounded-[24px] border border-white/85 px-6 py-5 shadow-sm backdrop-blur-sm"
      style={{
        background: `linear-gradient(135deg, ${accentColor}08, white 40%, ${accentColor}05)`,
        borderColor: `${accentColor}20`,
      }}
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      role="note"
    >
      {/* Accent bar */}
      <div
        className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[24px]"
        style={{ background: accentColor, opacity: 0.4 }}
      />

      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg flex-shrink-0">{icon}</span>
        <div>
          <div className="text-sm font-semibold leading-relaxed text-slate-800">
            {insight}
          </div>
          {detail && (
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {detail}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
