"use client";

/**
 * AlterQuickReplies — クイックチップ列（v2: アイコン付き・横スクロール 1 行）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.6
 * チップ→フィールド書込は Stage 1（ここではモックコールバック）。
 */

import { useState } from "react";
import { LeafIcon, MoonIcon, SunIcon, TargetIcon, WalkIcon } from "./alterIcons";

const CHIP_ICON: Record<string, { icon: React.ReactNode; tint: string }> = {
  元気: { icon: <SunIcon size={11} />, tint: "text-amber-500" },
  少し疲れた: { icon: <LeafIcon size={11} />, tint: "text-emerald-500" },
  眠い: { icon: <MoonIcon size={11} />, tint: "text-indigo-400" },
  集中したい: { icon: <TargetIcon size={11} />, tint: "text-sky-500" },
  外出は軽め: { icon: <WalkIcon size={11} />, tint: "text-teal-500" },
};

export interface AlterQuickRepliesProps {
  quickReplies: string[];
  /** コールドスタート昇格時の導入 1 行（観測トーン） */
  lead?: string;
  onSelect?: (chip: string) => void;
}

export function AlterQuickReplies({ quickReplies, lead, onSelect }: AlterQuickRepliesProps) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div>
      {lead && <p className="mb-1.5 px-1 text-[10.5px] leading-relaxed text-slate-500">{lead}</p>}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {quickReplies.map((chip) => {
          const meta = CHIP_ICON[chip];
          return (
            <button
              key={chip}
              type="button"
              onClick={() => {
                setSelected(chip);
                onSelect?.(chip);
              }}
              className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-medium shadow-sm transition-colors ${
                selected === chip
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-white bg-white/90 text-slate-600 hover:bg-white"
              }`}
            >
              {meta && <span className={meta.tint}>{meta.icon}</span>}
              {chip}
            </button>
          );
        })}
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80 text-[11px] text-slate-300 shadow-sm" aria-hidden="true">
          ›
        </span>
      </div>
    </div>
  );
}
