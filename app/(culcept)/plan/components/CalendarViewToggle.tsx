"use client";

/**
 * CalendarViewToggle — week ⇄ month の segmented control（Plan 月ビュー M3-a）
 *
 * presentational のみ（viewMode + onChange を props で受ける。内部 state なし）。
 * flag ON のとき CalendarTab の月 header 下に表示。実 month grid 描画は M3-b。
 *
 * 設計: M3 mini design（2026-06-03 CEO chat 承認、toggle 表記「週 | 月」）。
 */

import type { CalendarViewMode } from "@/lib/plan/calendarViewMode";

const OPTIONS: ReadonlyArray<{ mode: CalendarViewMode; label: string }> = [
  { mode: "week", label: "週" },
  { mode: "month", label: "月" },
];

export function CalendarViewToggle({
  viewMode,
  onChange,
}: {
  viewMode: CalendarViewMode;
  onChange: (mode: CalendarViewMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="カレンダー表示切替"
      data-testid="plan-calendar-view-toggle"
      className="inline-flex items-center rounded-full bg-slate-100 p-0.5"
    >
      {OPTIONS.map(({ mode, label }) => {
        const selected = viewMode === mode;
        return (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={selected}
            data-testid={`plan-calendar-view-toggle-${mode}`}
            onClick={() => onChange(mode)}
            className={
              "px-3 py-1 text-xs font-medium rounded-full transition " +
              (selected
                ? "bg-white text-indigo-600 shadow-sm"
                : "text-slate-500 hover:text-slate-700")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
