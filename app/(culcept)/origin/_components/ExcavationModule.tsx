"use client";

import { motion } from "framer-motion";
import { useState, useMemo, useCallback } from "react";
import type {
  CurrentPosition,
  MemoryChapter,
  ExplorationAxis,
} from "@/lib/origin/v7/types";
import {
  EXCAVATION_AXES,
  getPrimaryAxes,
} from "@/lib/origin/v7/excavationAxes";
import ExcavationCard from "./ExcavationCard";

type Props = {
  currentPosition: CurrentPosition | null;
  selectedChapter?: MemoryChapter;
  onStartExploration: (axis?: ExplorationAxis) => void;
};

export default function ExcavationModule({
  currentPosition,
  selectedChapter,
  onStartExploration,
}: Props) {
  const [showAll, setShowAll] = useState(false);

  const axes = useMemo(() => {
    return showAll ? EXCAVATION_AXES : getPrimaryAxes();
  }, [showAll]);

  const subCopy = useMemo(() => {
    if (selectedChapter) {
      return "この断片の奥にある、まだ辿っていない部分を探ります";
    }
    if (currentPosition) {
      return "あなたの現在地点から、辿りやすい入口を提示しています";
    }
    return "過去の断片を辿る入口を選んでください";
  }, [selectedChapter, currentPosition]);

  const mainCTA = selectedChapter
    ? "この時期をもっと掘る"
    : "新しい時期を探索する";

  const handleAxisClick = useCallback(
    (axis: ExplorationAxis) => {
      onStartExploration(axis);
    },
    [onStartExploration],
  );

  return (
    <section className="mt-8 flex flex-col gap-5 pb-12 px-4">
      {/* Divider */}
      <div className="mx-auto h-px w-16 bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />

      {/* Section header */}
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600/40">
          記憶探索
        </p>
        <p className="mt-1.5 text-sm text-gray-500">
          忘れていた断片を探す
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400 italic">
          {subCopy}
        </p>
      </div>

      {/* Main CTA */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.97 }}
        onClick={() => onStartExploration()}
        className="mx-auto w-full max-w-xs rounded-2xl bg-amber-400/90 px-6 py-3.5 text-sm font-semibold text-white shadow-md hover:bg-amber-500/90"
      >
        {mainCTA}
      </motion.button>

      {/* 探索カード群 */}
      <div className="flex flex-col gap-2">
        {axes.map((axis, i) => (
          <motion.div
            key={axis.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 + i * 0.04 }}
          >
            <ExcavationCard
              axis={axis.id}
              label={axis.label}
              description={axis.description}
              icon={axis.icon}
              onClick={() => handleAxisClick(axis.id)}
            />
          </motion.div>
        ))}
      </div>

      {/* 展開トグル */}
      {!showAll && (
        <button
          onClick={() => setShowAll(true)}
          className="mx-auto text-[11px] text-gray-400 hover:text-gray-500"
        >
          他の入口を見る ▼
        </button>
      )}
    </section>
  );
}
