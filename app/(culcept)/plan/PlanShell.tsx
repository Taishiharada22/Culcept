"use client";

/**
 * Plan Shell (Wave 1 / W1-2 — empty tabs only)
 *
 * Calendar / Flow / Map の 3 タブ空表示。各タブは静的 placeholder のみ。
 * ロジック・データ取得・API 呼び出しは持たない。
 *
 * Tab 切替は最低限の React useState のみで動かす。これは W1-2 で必要な
 * 「shell skeleton」の最低単位として許容する。
 *
 * 含めない（W1-2 範囲外）:
 *   - 実データ表示
 *   - 横スワイプ（page-level gesture handler）
 *   - Home 連携
 *   - Map SDK / Mapbox / Google Maps
 *   - コーデカレンダー統合
 *
 * 設計書: docs/alter-plan-foundation-design.md §8.2
 */

import { useState } from "react";

type PlanTab = "calendar" | "flow" | "map";

const TABS: ReadonlyArray<{ key: PlanTab; label: string }> = [
  { key: "calendar", label: "カレンダー" },
  { key: "flow", label: "Flow" },
  { key: "map", label: "地図" },
] as const;

const PLACEHOLDER_LABELS: Record<PlanTab, string> = {
  calendar: "カレンダー — 準備中",
  flow: "Flow — 準備中",
  map: "地図 — 準備中",
};

export function PlanShell() {
  const [activeTab, setActiveTab] = useState<PlanTab>("calendar");

  return (
    <main className="min-h-screen bg-white px-4 py-8">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-widest text-indigo-600">
          ALTER
        </p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Plan</h1>
        <p className="mt-1 text-sm text-slate-500">
          shell skeleton（Wave 1 / W1-2）
        </p>
      </header>

      <nav
        role="tablist"
        aria-label="Plan tabs"
        className="mb-6 flex gap-2 border-b border-slate-200"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`plan-panel-${tab.key}`}
              id={`plan-tab-${tab.key}`}
              onClick={() => setActiveTab(tab.key)}
              className={
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors " +
                (isActive
                  ? "border-indigo-500 text-indigo-700"
                  : "border-transparent text-slate-500 hover:text-slate-700")
              }
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      <section
        id={`plan-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`plan-tab-${activeTab}`}
      >
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-12 text-center">
          <p className="text-slate-500">{PLACEHOLDER_LABELS[activeTab]}</p>
        </div>
      </section>
    </main>
  );
}
