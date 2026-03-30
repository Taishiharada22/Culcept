"use client";

import { motion } from "framer-motion";
import { useMemo } from "react";
import type { MemoryChapter, CurrentPosition } from "@/lib/origin/v7/types";
import { REMAIN_ITEMS, SEEKING_ITEMS } from "@/lib/origin/v7/currentPositionData";

type Props = {
  currentPosition: CurrentPosition | null;
  chapters: MemoryChapter[];
};

/** 残留要素のチップ群を生成（最大6個） */
function collectResidues(
  currentPosition: CurrentPosition | null,
  chapters: MemoryChapter[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // currentPosition.remains → ラベル変換
  if (currentPosition) {
    for (const id of currentPosition.remains) {
      const label = REMAIN_ITEMS.find((r) => r.id === id)?.label;
      if (label && !seen.has(label)) {
        seen.add(label);
        result.push(label);
      }
    }
  }

  // chapters[].echoes → 重複排除して追加
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

/** 輪郭文を生成 */
function buildOutlineText(currentPosition: CurrentPosition | null): string | null {
  if (!currentPosition) return null;

  const remainLabels = currentPosition.remains
    .map((id) => REMAIN_ITEMS.find((r) => r.id === id)?.label)
    .filter(Boolean)
    .slice(0, 2);

  const seekLabel = currentPosition.seeking
    .map((id) => SEEKING_ITEMS.find((s) => s.id === id)?.label)
    .filter(Boolean)[0];

  const parts: string[] = [];

  if (remainLabels.length > 0) {
    parts.push(`今のあなたには「${remainLabels.join("」と「")}」が残っています。`);
  }

  if (seekLabel) {
    parts.push(`そして今、「${seekLabel}」を探しているようです。`);
  }

  return parts.length > 0 ? parts.join("") : null;
}

export default function PresentSummary({ currentPosition, chapters }: Props) {
  const residues = useMemo(
    () => collectResidues(currentPosition, chapters),
    [currentPosition, chapters],
  );
  const outlineText = useMemo(
    () => buildOutlineText(currentPosition),
    [currentPosition],
  );

  if (residues.length === 0 && !outlineText) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="flex flex-col gap-3 px-4 pb-6"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-600/40">
        今の自分に残っているもの
      </p>

      {/* 輪郭文 */}
      {outlineText && (
        <p className="text-[13px] leading-[1.8] text-gray-500">
          {outlineText}
        </p>
      )}

      {/* 残留要素チップ群 */}
      {residues.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {residues.map((label, i) => (
            <motion.span
              key={label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + i * 0.06 }}
              className="rounded-full bg-amber-50/60 px-3 py-1 text-[11px] text-amber-700/70 ring-1 ring-amber-200/25"
            >
              {label}
            </motion.span>
          ))}
        </div>
      )}

      {/* 補足文 */}
      <p className="text-[10px] text-gray-300">
        探索を重ねるほど、プロフィールが鮮明になります
      </p>
    </motion.section>
  );
}
