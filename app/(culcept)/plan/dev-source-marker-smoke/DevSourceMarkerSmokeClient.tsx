"use client";

/**
 * B-2 source marker visual smoke — client（週/日/月 view を 1 画面で目視確認）
 *
 * 本番と同じ component（CalendarTab / FlowTab / MonthGridView）に synthetic fixture を渡し、
 * shift_image 由来の「取込」marker が 3 view で自然に出るか・既存表示を壊さないかを確認する。
 *
 * 月 view は enablement flag を ON にせず **MonthGridView を直接 component として描画**
 * （NEXT_PUBLIC_PLAN_CALENDAR_MONTH_GRID_ENABLED は触らない・本番は dormant のまま）。
 *
 * save/import UI は本 fixture に存在しない（views は read-only・保存導線は別レイヤー）。
 * FlowTab は LIVE 新 path で mount 時に enhanceAlterNotesAction を fire するが、
 * 全 LLM/PM flag が default OFF のため auth.getUser() の benign read のみ（DB write/LLM/save 非接触）。
 */
import { useMemo } from "react";

import { CalendarTab } from "../tabs/CalendarTab";
import { FlowTab } from "../tabs/FlowTab";
import { MonthGridView } from "../components/MonthGridView";
import { buildMonthGrid } from "../tabs/_monthGrid";
import { resolveShiftAnchorChip } from "@/lib/plan/shift/shiftAnchorChip";
import {
  SMOKE_NOW,
  SMOKE_ANCHORS,
  SMOKE_DAY_INDICATORS,
  SMOKE_IMPORTED_SOURCE_IDS,
} from "./sourceMarkerSmokeFixture";

function SectionHeader({ title, note }: { title: string; note: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-sm font-bold text-slate-800">{title}</h2>
      <p className="text-xs text-slate-500">{note}</p>
    </div>
  );
}

export function DevSourceMarkerSmokeClient() {
  const grid = useMemo(() => buildMonthGrid(SMOKE_NOW), []);

  return (
    <main
      className="mx-auto max-w-3xl px-4 py-6 space-y-10"
      data-testid="plan-source-marker-smoke"
    >
      <header className="space-y-1">
        <h1 className="text-base font-bold text-slate-900">
          B-2 取込 source marker visual smoke
        </h1>
        <p className="text-xs text-slate-500">
          合成 fixture（now=2026-06-10）。期待: 取込 = 夜勤(6/10) / 休み(6/12) ・
          marker なし = 面談・歯医者・休み(6/13)。save/import UI なし。
        </p>
      </header>

      {/* 週 view */}
      <section data-testid="smoke-week">
        <SectionHeader
          title="週 view（CalendarTab・既定 week mode）"
          note="6/10・6/12 の day cell に小さく「取」が出る / 6/11・6/13 には出ない"
        />
        <div className="rounded-xl border border-slate-200">
          <CalendarTab
            anchors={SMOKE_ANCHORS}
            now={SMOKE_NOW}
            dayIndicatorByIso={SMOKE_DAY_INDICATORS}
            importedShiftSourceIds={SMOKE_IMPORTED_SOURCE_IDS}
          />
        </div>
      </section>

      {/* 日 view */}
      <section data-testid="smoke-day">
        <SectionHeader
          title="日 view（FlowTab・LIVE = TimelineSpine + EventCard）"
          note="6/10 夜勤 EventCard に「取込」/ 同日 面談には出ない / 6/12 休み badge に「取込」/ 6/13 休みには出ない"
        />
        <div className="rounded-xl border border-slate-200">
          <FlowTab
            anchors={SMOKE_ANCHORS}
            now={SMOKE_NOW}
            dayIndicatorByIso={SMOKE_DAY_INDICATORS}
            importedShiftSourceIds={SMOKE_IMPORTED_SOURCE_IDS}
          />
        </div>
      </section>

      {/* 月 view（直接 component・enablement flag 非依存） */}
      <section data-testid="smoke-month">
        <SectionHeader
          title="月 view（MonthGridView 直接描画・enablement flag 非依存）"
          note="6/10(N+面談)・6/12(休) の cell に「取込」/ 6/11・6/13 には出ない / chip が狭すぎないか"
        />
        <div className="rounded-xl border border-slate-200 py-2">
          <MonthGridView
            grid={grid}
            anchors={SMOKE_ANCHORS}
            dayIndicatorByIso={SMOKE_DAY_INDICATORS}
            selectedIso="2026-06-10"
            todayIso="2026-06-10"
            onSelectDate={() => {}}
            getAnchorChip={resolveShiftAnchorChip}
            importedShiftSourceIds={SMOKE_IMPORTED_SOURCE_IDS}
          />
        </div>
      </section>
    </main>
  );
}
