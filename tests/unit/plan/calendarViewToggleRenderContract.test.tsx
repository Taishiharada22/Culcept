/**
 * CalendarViewToggle — render contract（Plan 月ビュー M3-a）
 *
 * renderToStaticMarkup 規約（jsdom 不使用）。click 発火は検証しない
 * （規約どおり。M3-b visual smoke + 既存 pure helper test で担保）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CalendarViewToggle } from "@/app/(culcept)/plan/components/CalendarViewToggle";

/** 指定 testid の <button …> 開始タグを抽出（aria-selected 検査用） */
function btnTag(html: string, testid: string): string {
  const marker = `data-testid="${testid}"`;
  const idx = html.indexOf(marker);
  if (idx === -1) return "";
  const start = html.lastIndexOf("<button", idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

describe("CalendarViewToggle render contract", () => {
  it("週 | 月 segmented shell が出る", () => {
    const html = renderToStaticMarkup(
      <CalendarViewToggle viewMode="week" onChange={() => {}} />
    );
    expect(html).toContain('data-testid="plan-calendar-view-toggle"');
    expect(html).toContain('data-testid="plan-calendar-view-toggle-week"');
    expect(html).toContain('data-testid="plan-calendar-view-toggle-month"');
    expect(html).toContain("週");
    expect(html).toContain("月");
    expect(html).toContain('role="tablist"');
  });

  it("viewMode=week → 週 aria-selected=true / 月=false", () => {
    const html = renderToStaticMarkup(
      <CalendarViewToggle viewMode="week" onChange={() => {}} />
    );
    expect(btnTag(html, "plan-calendar-view-toggle-week")).toContain(
      'aria-selected="true"'
    );
    expect(btnTag(html, "plan-calendar-view-toggle-month")).toContain(
      'aria-selected="false"'
    );
  });

  it("viewMode=month → 月 aria-selected=true / 週=false", () => {
    const html = renderToStaticMarkup(
      <CalendarViewToggle viewMode="month" onChange={() => {}} />
    );
    expect(btnTag(html, "plan-calendar-view-toggle-month")).toContain(
      'aria-selected="true"'
    );
    expect(btnTag(html, "plan-calendar-view-toggle-week")).toContain(
      'aria-selected="false"'
    );
  });

  it("render 時に onChange は呼ばれない（誤発火しない）", () => {
    const onChange = vi.fn();
    renderToStaticMarkup(
      <CalendarViewToggle viewMode="week" onChange={onChange} />
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});
