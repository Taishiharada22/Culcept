"use client";

import { motion } from "framer-motion";
import type { MemoryChapter, CurrentPosition } from "@/lib/origin/v7/types";
import OriginOverview from "./OriginOverview";
import ChapterRouteCard from "./ChapterRouteCard";
import StardustSection from "./StardustSection";

type Props = {
  chapters: MemoryChapter[];
  currentPosition: CurrentPosition | null;
  onStartExploration: () => void;
};

export default function OriginRouteView({
  chapters,
  currentPosition,
  onStartExploration,
}: Props) {
  if (chapters.length === 0) {
    return <EmptyState onStart={onStartExploration} />;
  }

  // Sort: earliest period first (top=past, bottom=present)
  const PERIOD_ORDER: Record<string, number> = {
    early_childhood: 0,
    elementary: 1,
    middle_school: 2,
    high_school: 3,
    late_teens: 4,
    early_twenties: 5,
    mid_twenties: 6,
    thirties: 7,
    forties_plus: 8,
    special_period: 9,
  };
  const sorted = [...chapters].sort(
    (a, b) =>
      (PERIOD_ORDER[a.fact.period] ?? 99) -
      (PERIOD_ORDER[b.fact.period] ?? 99),
  );

  return (
    <div className="flex flex-col overflow-x-hidden">
      {/* ── Origin Overview (top) ── */}
      <OriginOverview chapters={chapters} currentPosition={currentPosition} />

      {/* ── Route (center) ── */}
      <section className="relative px-3">
        {/* Route line — the backbone of the journey */}
        <motion.div
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="absolute left-[2.05rem] top-0 bottom-0 w-[2px] origin-top"
          style={{
            background:
              "linear-gradient(to bottom, rgba(212,160,64,0.08), rgba(212,160,64,0.3) 15%, rgba(212,160,64,0.3) 75%, rgba(212,160,64,0.45))",
          }}
        />
        {/* Faint glow alongside the route line — organic warmth */}
        <div
          className="pointer-events-none absolute left-[1.55rem] top-0 bottom-0 w-3 opacity-40"
          style={{
            background:
              "linear-gradient(to bottom, transparent 5%, rgba(212,160,64,0.08) 20%, rgba(212,160,64,0.06) 80%, transparent 95%)",
            filter: "blur(4px)",
          }}
        />

        {/* Chapter nodes + cards */}
        <div className="flex flex-col gap-4 pl-4">
          {sorted.map((chapter, i) => (
            <div key={chapter.id} className="relative flex items-stretch gap-3">
              {/* Route node + connector */}
              <div className="relative flex flex-col items-center pt-5">
                {/* Connector line to card (horizontal) */}
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ delay: i * 0.08 + 0.2, duration: 0.3 }}
                  className="absolute left-[1.05rem] top-[1.4rem] h-[1px] w-3 origin-left"
                  style={{ background: "rgba(212,160,64,0.25)" }}
                />
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 20,
                    delay: i * 0.08,
                  }}
                  className="relative z-10 flex h-6 w-6 shrink-0 items-center justify-center"
                >
                  {/* Outer ring */}
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      border:
                        i === sorted.length - 1
                          ? "1.5px solid rgba(212,160,64,0.35)"
                          : "1px solid rgba(200,185,160,0.25)",
                    }}
                  />
                  {/* Inner dot */}
                  <div
                    className="h-2.5 w-2.5 rounded-full"
                    style={{
                      background:
                        i === sorted.length - 1
                          ? "linear-gradient(135deg, #d4a040, #e0b840)"
                          : "rgba(200,185,160,0.55)",
                      boxShadow:
                        i === sorted.length - 1
                          ? "0 0 8px rgba(212,160,64,0.3)"
                          : "none",
                    }}
                  />
                </motion.div>
              </div>

              {/* Chapter card */}
              <div className="flex-1 min-w-0">
                <ChapterRouteCard chapter={chapter} index={i} />
              </div>
            </div>
          ))}

          {/* ── Faint mid-journey dots — 途中感 ── */}
          <div className="flex items-center gap-3 py-1 pl-1">
            <div className="flex h-6 w-6 items-center justify-center">
              <motion.div
                animate={{ opacity: [0.15, 0.35, 0.15] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="h-1 w-1 rounded-full bg-amber-400/50"
              />
            </div>
          </div>

          {/* ── "Present" anchor — 旅の到達点 ── */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: sorted.length * 0.08 + 0.2 }}
            className="relative flex items-center gap-3 pt-2 pb-4"
          >
            <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
              {/* Pulsing outer ring */}
              <motion.div
                animate={{
                  scale: [1, 1.6, 1],
                  opacity: [0.3, 0, 0.3],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="absolute inset-0 rounded-full"
                style={{ border: "1px solid rgba(212,160,64,0.4)" }}
              />
              {/* Inner dot */}
              <div
                className="relative z-10 h-3 w-3 rounded-full"
                style={{
                  background: "linear-gradient(135deg, #d4a040, #e8c050)",
                  boxShadow: "0 0 12px rgba(212,160,64,0.45)",
                }}
              />
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-semibold text-amber-700/70">
                現在
              </p>
              <p className="text-[10px] text-gray-400">
                ここに辿り着いた
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── Stardust section (bottom) ── */}
      <StardustSection
        currentPosition={currentPosition}
        onStartExploration={onStartExploration}
      />
    </div>
  );
}

/* ── Empty state (no chapters yet) ── */

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center gap-6 py-16"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 18 }}
          className="text-5xl"
        >
          🔍
        </motion.div>
        <h2 className="text-xl font-bold text-gray-800">
          Origin
        </h2>
        <p className="text-xs text-gray-400">
          今に至るまでの航路
        </p>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-gray-500">
          過去の自分を少しずつ思い出していく体験です。
          正確でなくて大丈夫。ざっくりした記憶から始められます。
        </p>
      </div>
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={onStart}
        className="rounded-2xl bg-amber-400/90 px-8 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
      >
        最初の記憶を探索する
      </motion.button>
    </motion.div>
  );
}
