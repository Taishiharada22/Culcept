/**
 * CalendarViewBody — body 分岐 seam の render contract（Plan 月ビュー M3-b）
 *
 * CEO 補正の test seam: jsdom / click を使わず、body 分岐を小さな presentational
 * helper（CalendarViewBody）に切り出し、viewMode="month" で MonthGridView が
 * 出ることを renderToStaticMarkup で検証する。
 *
 * 固定項目:
 *   - viewMode=month → MonthGridView（plan-month-grid）が出る / week strip children は出ない
 *   - viewMode=week  → children（week strip）が出る / month grid は出ない
 *   - agenda は seam の外（CalendarViewBody は agenda を含まない = mode 共通）
 *   - buildMonthGrid 接続が正しい（当月の既知日 cell が出る）
 *
 * 非接触: DB / API / VLM（component + pure helper のみ）。
 */
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarViewBody } from "@/app/(culcept)/plan/components/CalendarViewBody";
import { buildMonthGrid } from "@/app/(culcept)/plan/tabs/_monthGrid";
import type { MonthGridViewProps } from "@/app/(culcept)/plan/components/MonthGridView";

const JUNE = buildMonthGrid(new Date(Date.UTC(2025, 5, 1))); // June 2025
const monthGridProps: MonthGridViewProps = {
  grid: JUNE,
  anchors: [],
  dayIndicatorByIso: new Map(),
  selectedIso: "2025-06-10",
  todayIso: "2025-06-12",
  onSelectDate: () => {},
};

/** week mode の children（CalendarTab 既存 week strip の代理マーカー） */
const weekStripChild = (
  <div data-testid="plan-calendar-week-strip">週ストリップ</div>
);

describe("CalendarViewBody — body 分岐 seam（M3-b）", () => {
  it("viewMode=month → MonthGridView（plan-month-grid）/ week strip children は出ない", () => {
    const html = renderToStaticMarkup(
      <CalendarViewBody viewMode="month" monthGridProps={monthGridProps}>
        {weekStripChild}
      </CalendarViewBody>
    );
    expect(html).toContain('data-testid="plan-month-grid"');
    expect(html).not.toContain('data-testid="plan-calendar-week-strip"');
  });

  it("viewMode=week → children（week strip）/ month grid は出ない", () => {
    const html = renderToStaticMarkup(
      <CalendarViewBody viewMode="week" monthGridProps={monthGridProps}>
        {weekStripChild}
      </CalendarViewBody>
    );
    expect(html).toContain('data-testid="plan-calendar-week-strip"');
    expect(html).not.toContain('data-testid="plan-month-grid"');
  });

  it("agenda は seam の外（CalendarViewBody は selected-day agenda を含まない = mode 共通）", () => {
    const html = renderToStaticMarkup(
      <CalendarViewBody viewMode="month" monthGridProps={monthGridProps}>
        {weekStripChild}
      </CalendarViewBody>
    );
    expect(html).not.toContain("plan-calendar-selected-day");
  });

  it("buildMonthGrid 接続: month mode で当月の既知日 cell が出る（6/1, 6/15）", () => {
    const html = renderToStaticMarkup(
      <CalendarViewBody viewMode="month" monthGridProps={monthGridProps}>
        {weekStripChild}
      </CalendarViewBody>
    );
    expect(html).toContain('data-testid="plan-month-grid-day-2025-06-01"');
    expect(html).toContain('data-testid="plan-month-grid-day-2025-06-15"');
  });
});
