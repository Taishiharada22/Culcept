"use client";

/**
 * AlterHeader — Alter タブヘッダー（v2）
 *
 * 正本: docs/alter-tab-visual-contract.md §3.1
 *  - `Alter` 大見出し + 「● ライブ」バッジ（意味は「開いた瞬間に最新導出」に限定 — 常時監視を示唆しない）
 *  - サブコピー: CEO 原案「あなたの現実を制御する」（契約 §3.1 で可とされた選択肢）
 *  - 右上: 調整アイコン 1 個まで（mock）。セグメントタブは置かない（PlanClient 管轄）
 */

import { SlidersIcon } from "./alterIcons";

export interface AlterHeaderProps {
  onSettingsTap?: () => void;
}

export function AlterHeader({ onSettingsTap }: AlterHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-100/80 bg-white/92 px-3 py-2 backdrop-blur-md">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[26px] font-bold leading-none tracking-tight text-slate-900">Alter</h1>
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9.5px] font-medium text-emerald-600"
              title="開いた瞬間に最新の見立てを組み立てます"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              ライブ
            </span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-slate-500">あなたの現実を制御する</p>
        </div>
        <button
          type="button"
          onClick={onSettingsTap}
          className="rounded-2xl border border-slate-200/80 bg-white p-2.5 text-slate-500 shadow-sm transition-colors hover:bg-slate-50"
          aria-label="調整"
        >
          <SlidersIcon size={15} />
        </button>
      </div>
    </header>
  );
}
