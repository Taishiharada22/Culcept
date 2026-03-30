"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { CurrentPosition } from "@/lib/origin/v7/types";
import {
  inferRecommendedEntry,
  ENTRY_META,
  type ExplorationEntry,
} from "@/lib/origin/v7/currentPositionData";

type Props = {
  currentPosition: CurrentPosition | null;
  onStartExploration: () => void;
};

const ALL_ENTRIES: ExplorationEntry[] = [
  "perspective",
  "comparison",
  "place",
  "thing",
  "person",
  "atmosphere",
];

const GUIDE_TEXTS = [
  "今日は、誰かの視線から辿ってみませんか",
  "場所の記憶は、ふとした瞬間に戻ってきます",
  "あの頃の空気感、まだ覚えていますか",
  "物に宿る記憶は、意外と正確です",
  "今の自分との違いから、プロフィールが見えてきます",
];

export default function StardustSection({
  currentPosition,
  onStartExploration,
}: Props) {
  // Smart recommendation: use current position if available, otherwise daily rotation
  const recommended = useMemo<ExplorationEntry>(() => {
    if (currentPosition) {
      return inferRecommendedEntry(
        currentPosition.remains,
        currentPosition.seeking,
      );
    }
    // Daily-stable fallback
    const d = new Date();
    const idx = (d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % ALL_ENTRIES.length;
    return ALL_ENTRIES[idx];
  }, [currentPosition]);

  const guideText = useMemo(() => {
    if (currentPosition) {
      return ENTRY_META[recommended].guide;
    }
    const d = new Date();
    return GUIDE_TEXTS[(d.getFullYear() * 366 + d.getMonth() * 31 + d.getDate()) % GUIDE_TEXTS.length];
  }, [currentPosition, recommended]);

  const recMeta = ENTRY_META[recommended];
  const otherEntries = ALL_ENTRIES.filter((e) => e !== recommended);

  return (
    <section className="mt-10 flex flex-col gap-5 pb-12">
      {/* Divider */}
      <div className="mx-auto h-px w-16 bg-gradient-to-r from-transparent via-amber-300/30 to-transparent" />

      {/* Section header */}
      <div className="text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600/40">
          Stardust
        </p>
        <p className="mt-1.5 text-sm text-gray-500">
          忘れていた断片を探す
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400 italic">
          {guideText}
        </p>
      </div>

      {/* Recommended entry — smart highlight */}
      <motion.button
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        whileTap={{ scale: 0.97 }}
        onClick={onStartExploration}
        className="mx-auto flex w-full max-w-xs items-center gap-3 rounded-2xl bg-white/70 backdrop-blur-sm px-5 py-4 shadow-sm ring-1 ring-amber-200/20 transition-colors hover:bg-white/85"
      >
        <span className="text-xl">{recMeta.icon}</span>
        <div className="flex flex-col text-left">
          <span className="text-xs font-medium text-gray-700">
            {recMeta.label}
          </span>
          <span className="text-[10px] text-gray-400">
            {currentPosition
              ? "あなたの現在地点から、ここが辿りやすそうです"
              : "今日はここから辿れそうです"}
          </span>
        </div>
      </motion.button>

      {/* Other entries — subtle, secondary */}
      <div className="flex flex-wrap justify-center gap-2 px-4">
        {otherEntries.map((entry, i) => {
          const meta = ENTRY_META[entry];
          return (
            <motion.button
              key={entry}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.15 + i * 0.04 }}
              whileTap={{ scale: 0.97 }}
              onClick={onStartExploration}
              className="rounded-full bg-white/40 px-3 py-1.5 text-[11px] text-gray-500 transition-colors hover:bg-white/60 hover:text-gray-600"
            >
              <span className="mr-1">{meta.icon}</span>
              {meta.label}
            </motion.button>
          );
        })}
      </div>

      {/* Main CTA */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        whileTap={{ scale: 0.97 }}
        onClick={onStartExploration}
        className="mx-auto mt-2 rounded-2xl bg-amber-400/15 px-6 py-3 text-sm font-medium text-amber-700/70 transition-colors hover:bg-amber-400/25"
      >
        新しい時期を探索する
      </motion.button>
    </section>
  );
}
