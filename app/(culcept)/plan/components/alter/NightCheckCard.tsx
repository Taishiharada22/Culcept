"use client";

/**
 * NightCheckCard — 夜の答え合わせカード
 *
 * 正本: 設計書 §5（設問・チップ文言）/ docs/alter-tab-visual-contract.md §3.5
 *  - state は VM の値のみで分岐（hidden / main / followup / answered / carried_over — 状態機械は Session A 管轄）
 *  - hidden → 描画なし。answered → 静かな既答表示
 *  - チップはモックコールバック（保存は Stage 1）
 */

import { useState } from "react";
import { GlassCard } from "@/components/ui/glassmorphism-design";
import type { AlterBatteryViewModel } from "@/lib/plan/dayState/dayStateTypes";

export interface NightCheckCardProps {
  nightCheck: AlterBatteryViewModel["nightCheck"];
  onAnswer?: (chip: string) => void;
}

export function NightCheckCard({ nightCheck, onAnswer }: NightCheckCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  if (nightCheck.state === "hidden") return null;

  if (nightCheck.state === "answered") {
    return (
      <GlassCard variant="default" padding="sm" hoverEffect={false}>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50 text-emerald-500">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13 l5 5 L20 7" />
            </svg>
          </span>
          <span className="text-xs">今夜の答え合わせは記録済みです</span>
        </div>
      </GlassCard>
    );
  }

  const heading =
    nightCheck.state === "carried_over"
      ? "きのうの答え合わせ"
      : nightCheck.state === "followup"
        ? "もうひとつだけ"
        : "今日の答え合わせ";

  return (
    <GlassCard variant="gradient" padding="sm" hoverEffect={false}>
      <div className="flex items-center gap-1.5">
        <span className="text-indigo-300">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path d="M21 12.8 A9 9 0 1 1 11.2 3 A7 7 0 0 0 21 12.8 z" />
          </svg>
        </span>
        <span className="text-[11px] font-medium text-slate-500">{heading}</span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-slate-800">{nightCheck.question}</p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {nightCheck.chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setSelected(chip);
              onAnswer?.(chip);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              selected === chip
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-slate-200 bg-white/85 text-slate-600 hover:bg-white"
            }`}
          >
            {chip}
          </button>
        ))}
      </div>
      {selected !== null && (
        <p className="mt-2 text-[10px] text-slate-400">受け取りました</p>
      )}
    </GlassCard>
  );
}
