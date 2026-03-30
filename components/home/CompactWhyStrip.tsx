"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ReasoningSource } from "@/components/home/WhyCard";

/**
 * Compact "why" strip for Home.
 * Shows 1-line summary + expand toggle.
 * When inner weather is unrecorded, shows a nudge to boost accuracy.
 */

const SOURCE_COLORS: Record<string, string> = {
  contradiction: "#EC4899",
  temporal: "#6366F1",
  blindspot: "#F59E0B",
  prophecy: "#8B5CF6",
  pattern: "#14B8A6",
  origin: "#EAB308",
  weather: "#3B82F6",
};

type Props = {
  sources?: ReasoningSource[];
  shiftedAxis?: string | null;
  trendSummary?: string | null;
  observationCount?: number;
  innerWeatherRecorded?: boolean;
};

export default function CompactWhyStrip({
  sources = [],
  shiftedAxis,
  trendSummary,
  observationCount = 0,
  innerWeatherRecorded = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);

  // Don't show until enough observations
  if (observationCount < 5) return null;

  const hasContent = sources.length > 0 || shiftedAxis || trendSummary;
  if (!hasContent) return null;

  // Build 1-line summary
  const oneLiner = trendSummary
    ?? sources[0]?.detail?.slice(0, 60)
    ?? (shiftedAxis ? `直近の揺れ: ${shiftedAxis}` : null);

  if (!oneLiner) return null;

  return (
    <section className="px-4 pb-2">
      <motion.div
        layout
        className="rounded-xl overflow-hidden"
        style={{
          background: "linear-gradient(155deg, rgba(99,102,241,0.05), rgba(245,243,255,0.95))",
          border: "1px solid rgba(99,102,241,0.10)",
        }}
      >
        {/* Collapsed: 1-line header */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-2.5 px-4 py-2.5 text-left"
        >
          <div
            className="w-[3px] h-3.5 rounded-full flex-shrink-0"
            style={{ background: "linear-gradient(180deg, #6366F1, #8B5CF6)" }}
          />
          <span className="text-[11px] font-bold flex-shrink-0" style={{ color: "#4338CA" }}>
            なぜこの答えか
          </span>
          <span className="text-[11px] text-text2 flex-1 truncate min-w-0">
            {oneLiner}
          </span>
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.15 }}
            className="text-[10px] flex-shrink-0"
            style={{ color: "#6366F1", opacity: 0.5 }}
          >
            ▾
          </motion.span>
        </button>

        {/* Weather boost nudge */}
        {!innerWeatherRecorded && !expanded && (
          <div className="px-4 pb-2.5 -mt-0.5">
            <p className="text-[10px] text-text3 italic">
              今の状態を入れると、回答の根拠が変わります
            </p>
          </div>
        )}

        {/* Expanded: full reasoning */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-4 space-y-2.5">
                {/* Trend summary (full) */}
                {trendSummary && (
                  <p className="text-[12px] text-text1 leading-[1.7]">
                    {trendSummary}
                  </p>
                )}

                {/* Shifted axis */}
                {shiftedAxis && (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-text4">直近の揺れ:</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}
                    >
                      {shiftedAxis}
                    </span>
                  </div>
                )}

                {/* Sources */}
                {sources.slice(0, 3).map((src, i) => {
                  const color = SOURCE_COLORS[src.type] ?? "#6366F1";
                  return (
                    <div key={i} className="flex items-start gap-2.5">
                      <div
                        className="w-1 min-h-[20px] rounded-full flex-shrink-0 mt-1"
                        style={{ background: `${color}50` }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span className="text-xs leading-none">{src.icon}</span>
                          <span className="text-[10px] font-bold text-text1">{src.label}</span>
                        </div>
                        <p className="text-[10px] text-text3 leading-[1.6] line-clamp-3">
                          {src.detail}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {/* Remaining sources as badges */}
                {sources.length > 3 && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {sources.slice(3).map((src, i) => {
                      const color = SOURCE_COLORS[src.type] ?? "#6366F1";
                      return (
                        <span
                          key={i}
                          className="text-[8px] font-mono px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                          style={{ background: `${color}0a`, color, border: `1px solid ${color}15` }}
                        >
                          <span className="text-[9px]">{src.icon}</span>
                          {src.label}
                        </span>
                      );
                    })}
                  </div>
                )}

                {/* Weather nudge in expanded */}
                {!innerWeatherRecorded && (
                  <p className="text-[9px] text-text4 italic pt-1 border-t border-black/[0.04]">
                    上で状態を入力すると、ここに「今のあなた向け」の根拠が追加されます
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
