"use client";

/**
 * AlterHeader — Alter タブヘッダー
 *
 * 正本: docs/alter-tab-visual-contract.md §3.1
 *  - 左: `Alter` 大見出し + 「● ライブ」小バッジ（意味は「開いた瞬間に最新導出」に限定 — 常時監視を示唆しない）
 *  - サブコピー: 「あなたの現実を、いっしょに組む」（候補 1。CEO 選択で差し替え可）
 *  - 右上: 設定/調整アイコン 1 個まで（mock）
 *  - セグメントタブは置かない（PlanClient 管轄）
 */

export interface AlterHeaderProps {
  onSettingsTap?: () => void;
}

export function AlterHeader({ onSettingsTap }: AlterHeaderProps) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-100 bg-white/95 px-4 py-2 backdrop-blur-sm">
      <div className="mx-auto flex max-w-3xl items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Alter</h1>
            <span
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-600"
              title="開いた瞬間に最新の見立てを組み立てます"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              ライブ
            </span>
          </div>
          <p className="text-[11px] text-slate-500">あなたの現実を、いっしょに組む</p>
        </div>
        <button
          type="button"
          onClick={onSettingsTap}
          className="rounded-xl border border-slate-200 bg-white/80 p-2 text-slate-500 shadow-sm transition-colors hover:bg-white"
          aria-label="調整"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
            <path d="M4 7 h10 M18 7 h2 M14 7 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0" />
            <path d="M4 17 h2 M10 17 h10 M6 17 a2 2 0 1 0 4 0 a2 2 0 1 0 -4 0" />
          </svg>
        </button>
      </div>
    </header>
  );
}
