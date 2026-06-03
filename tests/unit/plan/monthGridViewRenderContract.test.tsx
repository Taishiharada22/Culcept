/**
 * MonthGridView — render contract test（Plan 月ビュー M3-b polish: code chip 版）
 *
 * 検証手法: react-dom/server.renderToStaticMarkup（jsdom 不使用）。
 *
 * M3-b polish 固定項目:
 *   §1 42 cells / weekday header
 *   §2 leading/trailing 淡色（opacity + data-in-current-month=false）
 *   §3 selected = ring（全面 gradient なし）+ コード chip が消えない
 *   §4 today = border / selected と区別できる
 *   §5 勤務 chip は getAnchorChip resolver 経由（辞書非依存・sky tone）
 *   §6 休み chip は PlanDayIndicator.rawCode（H/HREQ/BD）から
 *   §7 rawCode null は variant fallback（公/希/休）
 *   §8 resolver 不一致 anchor は短縮 title fallback（無理にコード化しない）
 *   §9 dot に依存していない（旧 dot testid なし）
 *   §10 render 時に onSelectDate 誤発火しない
 *
 * 非接触: DB / API / VLM。MonthGridView は辞書を直 import しない（resolver 注入）。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { MonthGridView } from "@/app/(culcept)/plan/components/MonthGridView";
import { buildMonthGrid } from "@/app/(culcept)/plan/tabs/_monthGrid";
import type { MonthGridChip } from "@/lib/plan/monthGridChip";
import type { ExternalAnchor, OneOffExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

function oneOff(date: string, title: string): OneOffExternalAnchor {
  return {
    id: `oo-${date}`,
    userId: "u",
    sourceId: "s",
    confirmedAt: "2025-06-01T00:00:00.000Z",
    title,
    startTime: "09:00",
    rigidity: "hard",
    anchorKind: "one_off",
    date,
  } as OneOffExternalAnchor;
}

function ind(
  date: string,
  variant: DayIndicatorViewModel["variant"],
  rawCode: string | null
): DayIndicatorViewModel {
  return {
    date,
    variant,
    label: variant === "public_holiday" ? "公休" : variant === "requested_off" ? "希望休" : "休み",
    isTentative: variant === "requested_off",
    countsAsPublicHoliday: variant === "public_holiday",
    sourceType: "shift_image",
    rawCode,
  };
}

/** fake resolver（辞書非依存・MonthGridView の resolver 注入を検証）: 夜勤 → N のみ */
const fakeResolver = (a: ExternalAnchor): MonthGridChip | null =>
  a.title === "夜勤" ? { label: "N", tone: "work" } : null;

const JUNE = buildMonthGrid(utc(2025, 5, 1));
const ANCHORS: ExternalAnchor[] = [
  oneOff("2025-06-10", "夜勤"), // → resolver "N"（選択日）
  oneOff("2025-06-20", "通院"), // → resolver null → fallback "通院"
];
const INDICATORS = new Map<string, DayIndicatorViewModel>([
  ["2025-06-08", ind("2025-06-08", "public_holiday", "H")],
  ["2025-06-15", ind("2025-06-15", "requested_off", "HREQ")],
  ["2025-06-22", ind("2025-06-22", "off", "BD")],
  ["2025-06-18", ind("2025-06-18", "off", null)], // rawCode null → fallback "休"
]);

function renderJune(): string {
  return renderToStaticMarkup(
    <MonthGridView
      grid={JUNE}
      anchors={ANCHORS}
      dayIndicatorByIso={INDICATORS}
      selectedIso="2025-06-10"
      todayIso="2025-06-12"
      onSelectDate={() => {}}
      getAnchorChip={fakeResolver}
    />
  );
}

function count(html: string, needle: string): number {
  return html.split(needle).length - 1;
}
/** 指定 iso の cell <button …> 開始タグ */
function cellTag(html: string, iso: string): string {
  const m = `data-testid="plan-month-grid-day-${iso}"`;
  const idx = html.indexOf(m);
  if (idx === -1) return "";
  return html.slice(html.lastIndexOf("<button", idx), html.indexOf(">", idx) + 1);
}
/** 指定 iso の chip <span …>label</span>（最初の 1 個） */
function chipSpan(html: string, iso: string): string {
  const m = `data-testid="plan-month-grid-chip-${iso}"`;
  const idx = html.indexOf(m);
  if (idx === -1) return "";
  return html.slice(html.lastIndexOf("<span", idx), html.indexOf("</span>", idx) + 7);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("MonthGridView §1 構造", () => {
  it("42 cell + weekday header", () => {
    const html = renderJune();
    expect(count(html, 'data-testid="plan-month-grid-day-')).toBe(42);
    for (const l of ["日", "月", "火", "水", "木", "金", "土"]) {
      expect(html).toContain(`plan-month-grid-weekday-${l}`);
    }
  });
});

describe("MonthGridView §2 leading/trailing 淡色", () => {
  it("7 月 grid: 6/29 leading = data-in-current-month=false + opacity", () => {
    const JULY = buildMonthGrid(utc(2025, 6, 1));
    const html = renderToStaticMarkup(
      <MonthGridView
        grid={JULY}
        anchors={[]}
        dayIndicatorByIso={new Map()}
        selectedIso="2025-07-01"
        todayIso="2025-09-01"
        onSelectDate={() => {}}
      />
    );
    const tag = cellTag(html, "2025-06-29");
    expect(tag).toContain('data-in-current-month="false"');
    expect(tag).toContain("opacity-50");
  });
});

describe("MonthGridView §3 selected = ring（gradient なし）", () => {
  const html = renderJune();
  it("selected cell（6/10）= ring-2 ring-indigo-500 / 全面 gradient ではない", () => {
    const tag = cellTag(html, "2025-06-10");
    expect(tag).toContain("ring-2");
    expect(tag).toContain("ring-indigo-500");
    expect(tag).toContain('aria-selected="true"');
    expect(tag).not.toContain("from-indigo-500"); // 全面 gradient 廃止
    expect(tag).not.toContain("to-purple-500");
  });
  it("selected でも コード chip（N）が消えない", () => {
    expect(chipSpan(html, "2025-06-10")).toContain("N");
  });
});

describe("MonthGridView §4 today = border / selected と区別", () => {
  it("today cell（6/12、非選択）= border-indigo-300 + aria-current=date / ring-2 ではない", () => {
    const tag = cellTag(renderJune(), "2025-06-12");
    expect(tag).toContain("border-indigo-300");
    expect(tag).toContain('aria-current="date"');
    expect(tag).not.toContain("ring-2"); // selected と区別
  });
});

describe("MonthGridView §5 勤務 chip（resolver 経由・辞書非依存）", () => {
  it("6/10 chip = N / tone=work / sky", () => {
    const html = renderJune();
    const chip = chipSpan(html, "2025-06-10");
    expect(chip).toContain("N");
    expect(chip).toContain('data-tone="work"');
    expect(chip).toContain("bg-sky");
  });
});

describe("MonthGridView §6 休み chip（rawCode 由来）", () => {
  const html = renderJune();
  it("公休 6/8 = H / tone=public_holiday / rose", () => {
    const c = chipSpan(html, "2025-06-08");
    expect(c).toContain("H");
    expect(c).toContain('data-tone="public_holiday"');
    expect(c).toContain("bg-rose");
  });
  it("希望休 6/15 = HREQ / tone=requested_off / violet", () => {
    const c = chipSpan(html, "2025-06-15");
    expect(c).toContain("HREQ");
    expect(c).toContain('data-tone="requested_off"');
    expect(c).toContain("bg-violet");
  });
  it("休み 6/22 = BD / tone=off / slate", () => {
    const c = chipSpan(html, "2025-06-22");
    expect(c).toContain("BD");
    expect(c).toContain('data-tone="off"');
    expect(c).toContain("bg-slate");
  });
});

describe("MonthGridView §7 rawCode null は variant fallback", () => {
  it("6/18（off, rawCode null）= 休（fallback）", () => {
    const c = chipSpan(renderJune(), "2025-06-18");
    expect(c).toContain("休");
    expect(c).toContain('data-tone="off"');
  });
});

describe("MonthGridView §8 resolver 不一致 = 短縮 title fallback", () => {
  it("6/20（通院・resolver null）= 通院 / tone=default（無理にコード化しない）", () => {
    const c = chipSpan(renderJune(), "2025-06-20");
    expect(c).toContain("通院");
    expect(c).toContain('data-tone="default"');
  });
});

describe("MonthGridView §9 dot 非依存", () => {
  it("旧 dot testid（anchor-dot / indicator-dot）が出ない", () => {
    const html = renderJune();
    expect(html).not.toContain("plan-month-grid-anchor-dot");
    expect(html).not.toContain("plan-month-grid-indicator-dot");
  });
});

describe("MonthGridView §10 onSelectDate", () => {
  it("render 時に呼ばれない", () => {
    const spy = vi.fn();
    renderToStaticMarkup(
      <MonthGridView
        grid={JUNE}
        anchors={ANCHORS}
        dayIndicatorByIso={INDICATORS}
        selectedIso="2025-06-10"
        todayIso="2025-06-12"
        onSelectDate={spy}
        getAnchorChip={fakeResolver}
      />
    );
    expect(spy).not.toHaveBeenCalled();
  });
});
