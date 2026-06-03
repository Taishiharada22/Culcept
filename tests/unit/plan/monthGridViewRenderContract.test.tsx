/**
 * MonthGridView — render contract test（Plan 月ビュー Phase 2-A+ M2）
 *
 * 検証手法: react-dom/server.renderToStaticMarkup（@testing-library / jsdom 不使用、
 * 既存 dayIndicatorBadgeRenderContract / assistedRowSelectorRenderContract 規約踏襲）。
 *
 * GPT/CEO 必須項目（jsdom 無しで充足）:
 *   §1 42 cells 描画 / 6 週 / role=grid
 *   §2 weekday header 表示
 *   §3 leading/trailing cell が淡色（text-slate-300 + data-in-current-month=false）
 *   §4 selected cell 強調（gradient）
 *   §5 today cell 強調（indigo-700 bold）
 *   §6 勤務 anchor がある日に sky-500 dot / 無い日は dot なし
 *   §7 H/BD/HREQ の dayIndicator dot が既存色（rose-400 / slate-300 / violet-300）と整合
 *   §8 勤務 dot + 休み dot の両方が並ぶ
 *   §9 onSelectDate 配線（42 個の addressable button + render 時に誤発火しない）
 *       ※ 実 click 発火検証は jsdom 依存となるため本 phase 非対象（M3/M5 smoke で担保）
 *
 * 非接触: DB / API / VLM / network（本 test は component + pure helper のみ import）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MonthGridView } from "@/app/(culcept)/plan/components/MonthGridView";
import { buildMonthGrid } from "@/app/(culcept)/plan/tabs/_monthGrid";
import type { ExternalAnchor, OneOffExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

// ── fixture builders ──
function oneOff(date: string, over: Partial<OneOffExternalAnchor> = {}): OneOffExternalAnchor {
  return {
    id: `oo-${date}`,
    userId: "user-a",
    sourceId: "src-shift",
    confirmedAt: "2025-06-01T00:00:00.000Z",
    title: "勤務",
    startTime: "09:00",
    rigidity: "hard",
    anchorKind: "one_off",
    date,
    ...over,
  } as OneOffExternalAnchor;
}

function vm(over: Partial<DayIndicatorViewModel> & { date: string }): DayIndicatorViewModel {
  return {
    variant: "off",
    label: "休み",
    isTentative: false,
    countsAsPublicHoliday: false,
    sourceType: "shift_image",
    ...over,
  } as DayIndicatorViewModel;
}

/** 指定 iso の cell の <button …> 開始タグを抽出（属性順に依らず class 検査） */
function cellTag(html: string, iso: string): string {
  const marker = `data-testid="plan-month-grid-day-${iso}"`;
  const idx = html.indexOf(marker);
  if (idx === -1) return "";
  const start = html.lastIndexOf("<button", idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

/** 指定 testid の <span …> 開始タグを抽出（dot 色検査用） */
function spanTag(html: string, testid: string): string {
  const marker = `data-testid="${testid}"`;
  const idx = html.indexOf(marker);
  if (idx === -1) return "";
  const start = html.lastIndexOf("<span", idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}

// ── 共通 fixture（2025 年 6 月）──
const JUNE = buildMonthGrid(utc(2025, 5, 1));
const ANCHORS: ExternalAnchor[] = [
  oneOff("2025-06-10"), // 勤務 dot のみ
  oneOff("2025-06-15"), // 勤務 + 休み（両 dot）
];
const INDICATORS = new Map<string, DayIndicatorViewModel>([
  ["2025-06-15", vm({ date: "2025-06-15", variant: "off", label: "休み" })], // anchor と共存
  ["2025-06-18", vm({ date: "2025-06-18", variant: "off", label: "休み" })],
  ["2025-06-20", vm({ date: "2025-06-20", variant: "public_holiday", label: "公休", countsAsPublicHoliday: true })],
  ["2025-06-21", vm({ date: "2025-06-21", variant: "requested_off", label: "希望休", isTentative: true })],
]);

function renderJune(over: Partial<Parameters<typeof MonthGridView>[0]> = {}): string {
  return renderToStaticMarkup(
    <MonthGridView
      grid={JUNE}
      anchors={ANCHORS}
      dayIndicatorByIso={INDICATORS}
      selectedIso="2025-06-10"
      todayIso="2025-06-12"
      onSelectDate={() => {}}
      {...over}
    />
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §1 構造（42 cells / 6 週 / role=grid）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §1 構造", () => {
  it("42 個の day cell が描画される", () => {
    const html = renderJune();
    expect(count(html, 'data-testid="plan-month-grid-day-')).toBe(42);
  });
  it("role=grid + 6 週（role=row）", () => {
    const html = renderJune();
    expect(html).toContain('role="grid"');
    expect(count(html, 'role="row"')).toBe(6);
  });
  it("各 cell は button（role=gridcell）= 42 個", () => {
    const html = renderJune();
    expect(count(html, 'role="gridcell"')).toBe(42);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §2 weekday header
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §2 weekday header", () => {
  it("日 月 火 水 木 金 土（Sun-first）が出る", () => {
    const html = renderJune();
    for (const label of ["日", "月", "火", "水", "木", "金", "土"]) {
      expect(html).toContain(`data-testid="plan-month-grid-weekday-${label}"`);
    }
  });
  it("日 = rose / 土 = blue（locale 色）", () => {
    const html = renderJune();
    expect(spanTagDiv(html, "plan-month-grid-weekday-日")).toContain("text-rose-500");
    expect(spanTagDiv(html, "plan-month-grid-weekday-土")).toContain("text-blue-500");
  });
});

/** weekday は div なので div タグを抽出 */
function spanTagDiv(html: string, testid: string): string {
  const marker = `data-testid="${testid}"`;
  const idx = html.indexOf(marker);
  if (idx === -1) return "";
  const start = html.lastIndexOf("<div", idx);
  const end = html.indexOf(">", idx);
  return html.slice(start, end + 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §3 leading/trailing 淡色（2025/7 grid で 6/29 が leading）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §3 leading/trailing 淡色", () => {
  const JULY = buildMonthGrid(utc(2025, 6, 1)); // leading = 6/29, 6/30
  const html = renderToStaticMarkup(
    <MonthGridView
      grid={JULY}
      anchors={[]}
      dayIndicatorByIso={new Map()}
      selectedIso="2025-07-01"
      todayIso="2025-09-01" // grid 範囲外 = today 強調なし
      onSelectDate={() => {}}
    />
  );

  it("leading cell（6/29）= text-slate-300 + data-in-current-month=false", () => {
    const tag = cellTag(html, "2025-06-29");
    expect(tag).toContain("text-slate-300");
    expect(tag).toContain('data-in-current-month="false"');
  });
  it("当月 cell（7/15）= data-in-current-month=true + 既定 slate-700", () => {
    const tag = cellTag(html, "2025-07-15");
    expect(tag).toContain('data-in-current-month="true"');
    expect(tag).toContain("text-slate-700");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §4 selected 強調
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §4 selected 強調", () => {
  it("selected cell（6/10）= gradient + aria-selected=true", () => {
    const html = renderJune();
    const tag = cellTag(html, "2025-06-10");
    expect(tag).toContain("from-indigo-500");
    expect(tag).toContain("to-purple-500");
    expect(tag).toContain('aria-selected="true"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §5 today 強調
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §5 today 強調", () => {
  it("today cell（6/12、非選択）= indigo-700 bold + aria-current=date", () => {
    const html = renderJune();
    const tag = cellTag(html, "2025-06-12");
    expect(tag).toContain("text-indigo-700");
    expect(tag).toContain("font-bold");
    expect(tag).toContain('aria-current="date"');
    expect(tag).not.toContain("from-indigo-500"); // selected ではない
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §6 勤務 anchor sky dot
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §6 勤務 dot（sky-500）", () => {
  it("anchor のある日（6/10）に sky-500 dot", () => {
    const html = renderJune();
    expect(html).toContain('data-testid="plan-month-grid-anchor-dot-2025-06-10"');
    expect(spanTag(html, "plan-month-grid-anchor-dot-2025-06-10")).toContain("bg-sky-500");
  });
  it("anchor の無い日（6/2）に anchor dot なし", () => {
    const html = renderJune();
    expect(html).not.toContain('data-testid="plan-month-grid-anchor-dot-2025-06-02"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §7 dayIndicator dot（既存色整合）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §7 dayIndicator dot 既存色整合", () => {
  it("公休 H（6/20）= rose-400", () => {
    const html = renderJune();
    expect(spanTag(html, "plan-month-grid-indicator-dot-2025-06-20")).toContain("bg-rose-400");
  });
  it("休み BD（6/18）= slate-300", () => {
    const html = renderJune();
    expect(spanTag(html, "plan-month-grid-indicator-dot-2025-06-18")).toContain("bg-slate-300");
  });
  it("希望休 HREQ（6/21）= violet-300", () => {
    const html = renderJune();
    expect(spanTag(html, "plan-month-grid-indicator-dot-2025-06-21")).toContain("bg-violet-300");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §8 勤務 dot + 休み dot 両方
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §8 両 dot 並置", () => {
  it("勤務 + 休み の日（6/15）= anchor dot と indicator dot が両方出る", () => {
    const html = renderJune();
    expect(html).toContain('data-testid="plan-month-grid-anchor-dot-2025-06-15"');
    expect(html).toContain('data-testid="plan-month-grid-indicator-dot-2025-06-15"');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §9 onSelectDate 配線
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §9 onSelectDate 配線", () => {
  it("render 時に onSelectDate は呼ばれない（誤発火しない）", () => {
    const onSelectDate = vi.fn();
    renderToStaticMarkup(
      <MonthGridView
        grid={JUNE}
        anchors={ANCHORS}
        dayIndicatorByIso={INDICATORS}
        selectedIso="2025-06-10"
        todayIso="2025-06-12"
        onSelectDate={onSelectDate}
      />
    );
    expect(onSelectDate).not.toHaveBeenCalled();
  });
  it("42 個の addressable な day button（一意 testid）", () => {
    const html = renderJune();
    // 既知の数日が一意に addressable
    for (const iso of ["2025-06-01", "2025-06-15", "2025-06-30", "2025-07-12"]) {
      expect(count(html, `data-testid="plan-month-grid-day-${iso}"`)).toBe(1);
    }
    expect(count(html, 'data-testid="plan-month-grid-day-')).toBe(42);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// §10 健全性（prop 漏れなし）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §10 健全性", () => {
  it("出力に undefined / [object Object] が漏れない", () => {
    const html = renderJune();
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("[object Object]");
  });
});
