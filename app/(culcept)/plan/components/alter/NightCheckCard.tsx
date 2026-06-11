"use client";

/**
 * NightCheckCard — 夜の答え合わせカード（v2）
 *
 * 正本: 設計書 §5（設問・チップ文言）/ docs/alter-tab-visual-contract.md §3.5
 *  - state は VM の値のみで分岐（状態機械は Session A 管轄）。hidden → 描画なし
 *  - チップはモックコールバック（保存は Stage 1）
 */

import { useState } from "react";
import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";
import { MoonIcon } from "./alterIcons";

export interface NightCheckCardProps {
  nightCheck: AlterBatteryViewModel["nightCheck"];
  onAnswer?: (chip: string) => void;
}

export function NightCheckCard({ nightCheck, onAnswer }: NightCheckCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  if (nightCheck.state === "hidden") return null;

  if (nightCheck.state === "answered") {
    return (
      <div className="rounded-3xl border border-white bg-white/80 p-3 shadow-sm backdrop-blur-sm">
        <div className="flex items-center gap-2 text-slate-500">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13 l5 5 L20 7" />
            </svg>
          </span>
          <span className="text-[11px]">今夜の答え合わせは記録済みです</span>
        </div>
      </div>
    );
  }

  const heading =
    nightCheck.state === "carried_over"
      ? "きのうの答え合わせ"
      : nightCheck.state === "followup"
        ? "もうひとつだけ"
        : "今日の答え合わせ";

  return (
    <div className="rounded-3xl border border-indigo-100/80 bg-gradient-to-br from-indigo-50/70 to-white/80 p-3.5 shadow-sm backdrop-blur-sm">
      <div className="flex items-center gap-1.5">
        <span className="flex h-5 w-5 items-center justify-center rounded-md bg-indigo-100/90 text-indigo-500">
          <MoonIcon size={11} />
        </span>
        <span className="text-[10px] font-medium text-slate-500">{heading}</span>
      </div>
      <p className="mt-1.5 text-[13.5px] font-bold text-slate-800">{nightCheck.question}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {nightCheck.chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setSelected(chip);
              onAnswer?.(chip);
            }}
            className={`rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors ${
              selected === chip
                ? "border-indigo-300 bg-indigo-100/80 text-indigo-700"
                : "border-white bg-white/90 text-slate-600 shadow-sm hover:bg-white"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>
      {selected !== null && <p className="mt-2 text-[9.5px] text-slate-400">受け取りました</p>}
    </div>
  );
}
