"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useCallback } from "react";
import { getPeriodLabel } from "@/lib/origin/v7/periods";
import { getAtmosphereLabel } from "@/lib/origin/v7/atmosphereData";
import { getPerspectiveLabel } from "@/lib/origin/v7/perspectiveData";
import { getComparisonLabel } from "@/lib/origin/v7/comparisonData";
import { getTriggerLabel } from "@/lib/origin/v7/triggerData";
import type { MemoryChapter } from "@/lib/origin/v7/types";

const CONNECTION_META: Record<string, { icon: string; label: string }> = {
  stargazer: { icon: "🔭", label: "Stargazer" },
  genome: { icon: "🧬", label: "Genome" },
  presence: { icon: "🪞", label: "Presence" },
};

type Props = {
  chapter: MemoryChapter;
  index: number;
};

export default function ChapterRouteCard({ chapter, index }: Props) {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((p) => !p), []);

  const periodLabel = getPeriodLabel(chapter.fact.period);
  const atmosphereLabel = getAtmosphereLabel(chapter.mood.atmosphere);

  return (
    <motion.button
      onClick={toggle}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 250, damping: 22, delay: index * 0.08 }}
      className="w-full text-left"
    >
      <div
        className={`
          rounded-2xl p-4 transition-all duration-300
          border-l-2
          ${expanded
            ? "border-l-amber-300/40 bg-white/80 backdrop-blur-sm shadow-md ring-1 ring-amber-200/20"
            : "border-l-amber-200/20 bg-white/55 backdrop-blur-sm shadow-sm hover:bg-white/70 hover:border-l-amber-300/30 hover:shadow-md"}
        `}
      >
        {/* ── Title — 章の名前が主役 ── */}
        <p className="text-[13px] font-bold text-gray-800 leading-snug">
          {chapter.title || periodLabel}
        </p>

        {/* ── Period — 軽く添える ── */}
        <p className="mt-0.5 text-[10px] text-gray-400">
          {periodLabel}
          <span className="mx-1 text-gray-300">·</span>
          {atmosphereLabel}
        </p>

        {/* ── その頃の一文 — 空気感の主役 ── */}
        <p className={`mt-2.5 text-xs leading-[1.7] text-gray-600 ${expanded ? "" : "line-clamp-3"}`}>
          {chapter.meaning.finalText}
        </p>

        {/* ── 今に残るもの — 控えめに ── */}
        {chapter.echoes.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {chapter.echoes.map((echo) => (
              <span
                key={echo}
                className="rounded-full px-2 py-0.5 text-[9px] text-amber-600/70"
                style={{ background: "rgba(245,230,200,0.5)" }}
              >
                {echo}
              </span>
            ))}
          </div>
        )}

        {/* ── Expanded details ── */}
        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="mt-4 flex flex-col gap-3 border-t border-gray-100/80 pt-3">
                {/* Then section */}
                <div>
                  <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-gray-300">
                    その頃
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <p className="text-[9px] text-gray-400">空気感</p>
                      <p className="text-[11px] text-gray-600">{atmosphereLabel}</p>
                    </div>
                    {chapter.mood.perspective && (
                      <div>
                        <p className="text-[9px] text-gray-400">他人視点</p>
                        <p className="text-[11px] text-gray-600">
                          {getPerspectiveLabel(chapter.mood.perspective)}
                        </p>
                      </div>
                    )}
                    {chapter.mood.comparison && (
                      <div>
                        <p className="text-[9px] text-gray-400">今との違い</p>
                        <p className="text-[11px] text-gray-600">
                          {getComparisonLabel(chapter.mood.comparison)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Triggers */}
                {chapter.fact.triggers.length > 0 && (
                  <div>
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-gray-300">
                      記憶のトリガー
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {chapter.fact.triggers.map((id) => (
                        <span
                          key={id}
                          className="rounded-full bg-gray-50 px-2 py-0.5 text-[10px] text-gray-500"
                        >
                          {getTriggerLabel(id)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* What Remains Now */}
                {chapter.echoes.length > 0 && (
                  <div>
                    <p className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-gray-300">
                      今に残るもの
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {chapter.echoes.map((echo) => (
                        <span
                          key={echo}
                          className="rounded-full bg-amber-50/80 px-2.5 py-0.5 text-[10px] text-amber-700/80 ring-1 ring-amber-200/30"
                        >
                          {echo}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Feature connections */}
                {chapter.connections.length > 0 && (
                  <div className="rounded-xl bg-gray-50/40 p-3">
                    <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-gray-300">
                      つながり
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {chapter.connections.map((conn, i) => {
                        const meta = CONNECTION_META[conn.target];
                        return (
                          <p key={i} className="text-[11px] leading-relaxed text-gray-500">
                            <span className="mr-1">{meta?.icon}</span>
                            {conn.hint}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Date */}
                <p className="text-[9px] text-gray-300">
                  {new Date(chapter.createdAt).toLocaleDateString("ja-JP")}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Expand indicator */}
        <div className="mt-1.5 flex justify-center">
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            className="text-[9px] text-gray-300"
          >
            ▼
          </motion.span>
        </div>
      </div>
    </motion.button>
  );
}
