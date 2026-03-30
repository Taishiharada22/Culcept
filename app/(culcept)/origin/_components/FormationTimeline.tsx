"use client";

import { motion } from "framer-motion";
import { useMemo, useCallback } from "react";
import type {
  MemoryChapter,
  CurrentPosition,
  ExplorationAxis,
} from "@/lib/origin/v7/types";
import TimelineNode from "./TimelineNode";
import FormationBridge from "./FormationBridge";

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

type Props = {
  chapters: MemoryChapter[];
  currentPosition: CurrentPosition | null;
  selectedChapterId?: string | null;
  onStartExploration: (axis?: ExplorationAxis) => void;
  onDeepDiveChapter: (chapter: MemoryChapter, axis: ExplorationAxis) => void;
  onSelectChapter?: (chapter: MemoryChapter) => void;
};

export default function FormationTimeline({
  chapters,
  currentPosition,
  selectedChapterId,
  onStartExploration,
  onDeepDiveChapter,
  onSelectChapter,
}: Props) {
  const sorted = useMemo(
    () =>
      [...chapters].sort(
        (a, b) =>
          (PERIOD_ORDER[a.fact.period] ?? 99) -
          (PERIOD_ORDER[b.fact.period] ?? 99),
      ),
    [chapters],
  );

  const handleNodeClick = useCallback(
    (chapter: MemoryChapter) => {
      if (onSelectChapter) {
        onSelectChapter(chapter);
      }
    },
    [onSelectChapter],
  );

  if (chapters.length === 0) {
    return <EmptyState onStart={() => onStartExploration()} />;
  }

  return (
    <div className="flex flex-col overflow-x-hidden">
      {/* タイムライン本体 */}
      <section className="relative px-3">
        {/* Route line */}
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
        {/* Glow */}
        <div
          className="pointer-events-none absolute left-[1.55rem] top-0 bottom-0 w-3 opacity-40"
          style={{
            background:
              "linear-gradient(to bottom, transparent 5%, rgba(212,160,64,0.08) 20%, rgba(212,160,64,0.06) 80%, transparent 95%)",
            filter: "blur(4px)",
          }}
        />

        {/* Chapter nodes + bridges */}
        <div className="flex flex-col gap-2 pl-4">
          {sorted.map((chapter, i) => (
            <div key={chapter.id}>
              {/* Bridge between nodes */}
              {i > 0 && (
                <FormationBridge
                  fromChapter={sorted[i - 1]}
                  toChapter={chapter}
                />
              )}

              {/* Node */}
              <div className="relative flex items-stretch gap-3">
                {/* Route node */}
                <div className="relative flex flex-col items-center pt-4">
                  <motion.div
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ delay: i * 0.08 + 0.2, duration: 0.3 }}
                    className="absolute left-[1.05rem] top-[1.2rem] h-[1px] w-3 origin-left"
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
                    <div
                      className="absolute inset-0 rounded-full"
                      style={{
                        border:
                          selectedChapterId === chapter.id
                            ? "1.5px solid rgba(212,160,64,0.5)"
                            : "1px solid rgba(200,185,160,0.25)",
                      }}
                    />
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{
                        background:
                          selectedChapterId === chapter.id
                            ? "linear-gradient(135deg, #d4a040, #e0b840)"
                            : "rgba(200,185,160,0.55)",
                        boxShadow:
                          selectedChapterId === chapter.id
                            ? "0 0 8px rgba(212,160,64,0.3)"
                            : "none",
                      }}
                    />
                  </motion.div>
                </div>

                {/* Chapter card */}
                <div className="flex-1 min-w-0">
                  <TimelineNode
                    chapter={chapter}
                    isSelected={selectedChapterId === chapter.id}
                    onClick={() => handleNodeClick(chapter)}
                    index={i}
                  />
                </div>
              </div>
            </div>
          ))}

          {/* Mid-journey dots */}
          <div className="flex items-center gap-3 py-1 pl-1">
            <div className="flex h-6 w-6 items-center justify-center">
              <motion.div
                animate={{ opacity: [0.15, 0.35, 0.15] }}
                transition={{
                  duration: 4,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="h-1 w-1 rounded-full bg-amber-400/50"
              />
            </div>
          </div>

          {/* Present anchor */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: sorted.length * 0.08 + 0.2 }}
            className="relative flex items-center gap-3 pt-2 pb-4"
          >
            <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
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
    </div>
  );
}

/* ── Empty state ── */

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
        <h2 className="text-xl font-bold text-gray-800">Origin</h2>
        <p className="text-xs text-gray-400">今に至るまでの航路</p>
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
