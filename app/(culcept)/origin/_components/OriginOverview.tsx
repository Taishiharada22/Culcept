"use client";

import { motion } from "framer-motion";
import type { MemoryChapter, CurrentPosition } from "@/lib/origin/v7/types";
import { REMAIN_ITEMS } from "@/lib/origin/v7/currentPositionData";

type Props = {
  chapters: MemoryChapter[];
  currentPosition: CurrentPosition | null;
};

/** 全チャプターからEchoesを集約 + 現在地点のremainsを追加 */
function collectEchoes(
  chapters: MemoryChapter[],
  currentPosition: CurrentPosition | null,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // First: current position remains (these are the user's self-identified echoes)
  if (currentPosition) {
    for (const id of currentPosition.remains) {
      const label = REMAIN_ITEMS.find((r) => r.id === id)?.label;
      if (label && !seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    }
  }

  // Then: chapter echoes
  for (const ch of chapters) {
    for (const echo of ch.echoes) {
      const key = echo.trim();
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(key);
      }
    }
  }
  return result.slice(0, 6);
}

export default function OriginOverview({ chapters, currentPosition }: Props) {
  const echoes = collectEchoes(chapters, currentPosition);
  const hasContent = chapters.length > 0 || currentPosition;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center gap-5 pb-10 pt-6 text-center"
    >
      {/* ── Title block ── */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-800">
          Origin
        </h1>
        <p className="mt-1 text-[11px] tracking-wide text-gray-400">
          今に至るまでの航路
        </p>
      </div>

      {/* ── Summary ── */}
      {hasContent && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="max-w-[18rem] text-[13px] leading-[1.8] text-gray-500"
        >
          過去の断片は、今のあなたのプロフィールとして残っています。
        </motion.p>
      )}

      {/* ── Echoes — 今に残るもの ── */}
      {echoes.length > 0 && (
        <div className="flex flex-col items-center gap-2.5">
          <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-600/40">
            今に残るもの
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {echoes.map((echo, i) => (
              <motion.span
                key={echo}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 + i * 0.06 }}
                className="rounded-full bg-amber-50/60 px-3 py-1 text-[11px] text-amber-700/70 ring-1 ring-amber-200/25"
              >
                {echo}
              </motion.span>
            ))}
          </div>
        </div>
      )}

      {/* ── Chapter count ── */}
      {chapters.length > 0 && (
        <p className="text-[10px] text-gray-300">
          {chapters.length} Chapter{chapters.length > 1 ? "s" : ""}
        </p>
      )}
    </motion.section>
  );
}
