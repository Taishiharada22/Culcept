"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export type ReasoningSource = {
  icon: string;
  label: string;
  detail: string;
  /** ソースの種類 */
  type: "contradiction" | "temporal" | "blindspot" | "prophecy" | "pattern" | "origin" | "weather";
};

type Props = {
  /** 回答の根拠となる reasoning sources */
  sources?: ReasoningSource[];
  /** 直近の揺れた軸 */
  shiftedAxis?: string | null;
  /** 回答傾向の要約 */
  trendSummary?: string | null;
  /** 表示制御 */
  observationCount?: number;
  /** 内面天気が記録済みか */
  innerWeatherRecorded?: boolean;
};

const SOURCE_COLORS: Record<string, string> = {
  contradiction: "#EC4899",
  temporal: "#6366F1",
  blindspot: "#F59E0B",
  prophecy: "#8B5CF6",
  pattern: "#14B8A6",
  origin: "#EAB308",
  weather: "#3B82F6",
};

export default function WhyCard({
  sources = [],
  shiftedAxis,
  trendSummary,
  observationCount = 0,
  innerWeatherRecorded = false,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  if (observationCount < 5) return null;

  const hasContent = sources.length > 0 || shiftedAxis || trendSummary;
  if (!hasContent) return null;

  // Show up to 2 sources in collapsed state
  const previewSources = sources.slice(0, 2);
  const remainingSources = sources.slice(2);

  return (
    <section className="pb-3">
      <motion.div
        layout
        className="rounded-2xl overflow-hidden h-full"
        style={{
          background: "linear-gradient(155deg, rgba(99,102,241,0.07), rgba(139,92,246,0.05), rgba(245,243,255,0.95))",
          border: "1.5px solid rgba(99,102,241,0.12)",
          boxShadow: "0 4px 20px rgba(99,102,241,0.07), 0 1px 4px rgba(0,0,0,0.02)",
          cursor: !innerWeatherRecorded ? "pointer" : undefined,
        }}
        onClick={!innerWeatherRecorded ? () => router.push("/stargazer/weather") : undefined}
      >
        {/* Header — strong label */}
        <div className="px-5 pt-4 pb-1 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className="w-[3px] h-4 rounded-full"
              style={{ background: "linear-gradient(180deg, #6366F1, #8B5CF6)" }}
            />
            <span className="text-[12px] font-bold" style={{ color: "#4338CA" }}>
              なぜこの答えなのか
            </span>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (!innerWeatherRecorded) { router.push("/stargazer/weather"); return; }
              setExpanded(!expanded);
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors"
            style={{ background: expanded ? "rgba(99,102,241,0.08)" : "transparent" }}
          >
            {sources.length > 2 && !expanded && (
              <span className="text-[8px] font-mono" style={{ color: "#6366F1" }}>
                +{sources.length - 2}件
              </span>
            )}
            <motion.span
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.15 }}
              className="text-[10px]"
              style={{ color: "#6366F1", opacity: 0.6 }}
            >
              ▾
            </motion.span>
          </button>
        </div>

        {/* Trend summary — always visible when available */}
        {trendSummary && (
          <div className="px-5 pb-2.5">
            <p className="text-[12px] text-text1 leading-[1.7]">
              {trendSummary}
            </p>
          </div>
        )}

        {/* Collapsed: show first 2 sources with detail */}
        {!expanded && (
          <div className="px-5 pb-4 space-y-3">
            {/* Primary sources with full detail */}
            {previewSources.map((src, i) => {
              const color = SOURCE_COLORS[src.type] ?? "#6366F1";
              return (
                <div key={i} className="flex items-start gap-3">
                  <div
                    className="w-1 min-h-[28px] rounded-full flex-shrink-0 mt-1"
                    style={{ background: `${color}50` }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-sm leading-none">{src.icon}</span>
                      <span className="text-[11px] font-bold text-text1">{src.label}</span>
                    </div>
                    <p className="text-[11px] text-text2 leading-[1.7] line-clamp-4">
                      {src.detail}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* Shifted axis inline */}
            {shiftedAxis && (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[9px] text-text4">直近の揺れ:</span>
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}
                >
                  {shiftedAxis}
                </span>
              </div>
            )}

            {/* Remaining source badges */}
            {remainingSources.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                {remainingSources.slice(0, 4).map((src, i) => {
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
          </div>
        )}

        {/* Expanded: all sources */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-5 space-y-3">
                {/* Shifted axis */}
                {shiftedAxis && (
                  <div className="flex items-center gap-2 py-1">
                    <span className="text-[9px] font-mono text-text4">揺れた軸</span>
                    <span
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(99,102,241,0.08)", color: "#6366F1" }}
                    >
                      {shiftedAxis}
                    </span>
                  </div>
                )}

                {/* All reasoning sources */}
                {sources.length > 0 && (
                  <div className="space-y-2.5">
                    <span className="text-[9px] font-mono text-text4 tracking-wider">根拠</span>
                    {sources.map((src, i) => {
                      const color = SOURCE_COLORS[src.type] ?? "#6366F1";
                      return (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="flex items-start gap-3 py-1"
                        >
                          <div
                            className="w-1 min-h-[24px] rounded-full flex-shrink-0 mt-1"
                            style={{ background: `${color}50` }}
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-sm leading-none">{src.icon}</span>
                              <span className="text-[11px] font-bold text-text1">{src.label}</span>
                            </div>
                            <p className="text-[10px] text-text3 leading-[1.6]">{src.detail}</p>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}

                {/* Footer */}
                <p className="text-[8px] text-text4 italic pt-1">
                  AIの思考過程を可視化しています。観測を重ねるほど根拠が増えます。
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
