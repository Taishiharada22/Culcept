"use client";

/**
 * AlterCtaRow — CTA 2 つ（v2: 参照画像準拠の大型フルラウンド 2 色グラデーション）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.7
 *  - 第 1: 「今日を組む」（compose — Stage 1 配線。暖色側 = 行動 CTA）
 *  - 第 2: 「調整案を見る」（A3 接続までモック導線。紫側）
 */

import { SparkleIcon, SunIcon } from "./alterIcons";

export interface AlterCtaRowProps {
  onCompose?: () => void;
  onViewAdjustments?: () => void;
}

export function AlterCtaRow({ onCompose, onViewAdjustments }: AlterCtaRowProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onViewAdjustments}
        className="relative flex items-center justify-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-indigo-400 via-violet-500 to-purple-500 px-3 py-3.5 text-[13px] font-bold text-white shadow-[0_8px_22px_rgba(124,58,237,0.45)] transition-transform hover:scale-[1.02]"
      >
        <span className="pointer-events-none absolute inset-x-2 top-0.5 h-1/2 rounded-full bg-gradient-to-b from-white/35 to-white/0" />
        <SparkleIcon size={14} />
        調整案を見る
      </button>
      <button
        type="button"
        onClick={onCompose}
        className="relative flex items-center justify-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-orange-500 px-3 py-3.5 text-[13px] font-bold text-white shadow-[0_8px_22px_rgba(251,146,60,0.5)] transition-transform hover:scale-[1.02]"
      >
        <span className="pointer-events-none absolute inset-x-2 top-0.5 h-1/2 rounded-full bg-gradient-to-b from-white/35 to-white/0" />
        <SunIcon size={14} />
        今日を組む
      </button>
    </div>
  );
}
