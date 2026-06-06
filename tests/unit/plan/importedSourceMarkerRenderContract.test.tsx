/**
 * B-1 — シフト取込（shift_image）由来 marker render contract（日 view / 週 view）
 *
 * 要件（GPT B-1）:
 *   - shift_image 由来の勤務 anchor / 休み day_indicator に控えめな「取込」由来表示。
 *   - non-shift_image には marker を出さない。
 *   - 既存の勤務/休み表示は消えない。警告でなく provenance（muted）。
 *   - 日 view（FlowTab）= 個別 item に「取込」。週 view（CalendarTab）= day-level「取」。
 *
 * 検証手法: react-dom/server.renderToStaticMarkup（jsdom 不使用）。
 * 非接触: DB / API / VLM / save。
 */
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// FlowTab/CalendarTab の import chain（server action 等）が server-only を引くため無効化
vi.mock("server-only", () => ({}));

import { FlowTab } from "@/app/(culcept)/plan/tabs/FlowTab";
import { CalendarTab } from "@/app/(culcept)/plan/tabs/CalendarTab";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";

const NOW = new Date("2025-07-09T09:00:00.000Z"); // 水。週 strip = 7/6(日)〜7/12(土) / flow range = 7/9〜7/15
const ISO_IMPORTED = "2025-07-09"; // 今日（FlowTab で必ず render）かつ週 strip 内
const ISO_MANUAL = "2025-07-10"; // 週 strip 内・flow range 内

const IMPORTED_SET: ReadonlySet<string> = new Set(["src-shift"]);

function anchor(iso: string, title: string, sourceId: string): ExternalAnchor {
  return {
    id: `a-${iso}-${sourceId}`,
    userId: "u1",
    title,
    startTime: "09:00",
    rigidity: "hard",
    sourceId,
    confirmedAt: `${iso}T00:00:00.000Z`,
    anchorKind: "one_off",
    date: iso,
  };
}

function indicator(
  iso: string,
  sourceType: DayIndicatorViewModel["sourceType"]
): DayIndicatorViewModel {
  return {
    date: iso,
    variant: "off",
    label: "休み",
    isTentative: false,
    countsAsPublicHoliday: false,
    sourceType,
    rawCode: "BD",
  };
}

const IMPORTED_BADGE = 'data-testid="imported-source-badge"';
const WEEK_MARK = (iso: string) => `data-testid="plan-calendar-day-imported-${iso}"`;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 日 view（FlowTab）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("FlowTab（日 view）— 取込 marker", () => {
  it("点4: shift_image anchor に「取込」marker が出る", () => {
    const html = renderToStaticMarkup(
      <FlowTab
        anchors={[anchor(ISO_IMPORTED, "夜勤", "src-shift")]}
        now={NOW}
        importedShiftSourceIds={IMPORTED_SET}
      />
    );
    expect(html).toContain(IMPORTED_BADGE);
    expect(html).toContain("取込");
    expect(html).toContain("夜勤"); // 点9: 既存の勤務表示は消えない
  });

  it("点5: non-shift_image anchor には marker が出ない", () => {
    const html = renderToStaticMarkup(
      <FlowTab
        anchors={[anchor(ISO_IMPORTED, "歯医者", "src-manual")]}
        now={NOW}
        importedShiftSourceIds={IMPORTED_SET}
      />
    );
    expect(html).not.toContain(IMPORTED_BADGE);
    expect(html).toContain("歯医者"); // 既存表示は健在
  });

  it("点6: shift_image day_indicator に「取込」marker が出る", () => {
    const map = new Map([[ISO_IMPORTED, indicator(ISO_IMPORTED, "shift_image")]]);
    const html = renderToStaticMarkup(
      <FlowTab anchors={[]} now={NOW} dayIndicatorByIso={map} />
    );
    expect(html).toContain(`plan-flow-day-indicator-${ISO_IMPORTED}`); // 休み badge 健在
    expect(html).toContain(IMPORTED_BADGE); // 取込 marker
    expect(html).toContain("休み");
  });

  it("点7: non-shift_image day_indicator には marker が出ない", () => {
    const map = new Map([[ISO_IMPORTED, indicator(ISO_IMPORTED, "manual")]]);
    const html = renderToStaticMarkup(
      <FlowTab anchors={[]} now={NOW} dayIndicatorByIso={map} />
    );
    expect(html).toContain(`plan-flow-day-indicator-${ISO_IMPORTED}`); // 休み badge は出る
    expect(html).not.toContain(IMPORTED_BADGE); // が、取込 marker は出ない
  });

  it("importedShiftSourceIds 未指定（既存呼び出し）では marker なし（後方互換）", () => {
    const html = renderToStaticMarkup(
      <FlowTab anchors={[anchor(ISO_IMPORTED, "夜勤", "src-shift")]} now={NOW} />
    );
    expect(html).not.toContain(IMPORTED_BADGE);
    expect(html).toContain("夜勤");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 週 view（CalendarTab）= day-level marker
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe("CalendarTab（週 view）— day-level 取込 marker", () => {
  it("点8 + 点5: shift_image anchor の日に「取」day-level marker / manual の日には出ない", () => {
    const html = renderToStaticMarkup(
      <CalendarTab
        anchors={[
          anchor(ISO_IMPORTED, "夜勤", "src-shift"),
          anchor(ISO_MANUAL, "歯医者", "src-manual"),
        ]}
        now={NOW}
        importedShiftSourceIds={IMPORTED_SET}
      />
    );
    // 取込由来の日 = marker あり
    expect(html).toContain(WEEK_MARK(ISO_IMPORTED));
    // 手動の日 = marker なし
    expect(html).not.toContain(WEEK_MARK(ISO_MANUAL));
    // 週 strip 自体は健在（点9）
    expect(html).toContain("plan-calendar-week-strip");
  });

  it("点6/点7: shift_image indicator の日に marker / manual indicator の日には出ない", () => {
    const map = new Map([
      [ISO_IMPORTED, indicator(ISO_IMPORTED, "shift_image")],
      [ISO_MANUAL, indicator(ISO_MANUAL, "manual")],
    ]);
    const html = renderToStaticMarkup(
      <CalendarTab anchors={[]} now={NOW} dayIndicatorByIso={map} />
    );
    expect(html).toContain(WEEK_MARK(ISO_IMPORTED));
    expect(html).not.toContain(WEEK_MARK(ISO_MANUAL));
  });

  it("週 marker は「取」表示 + aria「シフト取込あり」（警告でなく由来）", () => {
    const html = renderToStaticMarkup(
      <CalendarTab
        anchors={[anchor(ISO_IMPORTED, "夜勤", "src-shift")]}
        now={NOW}
        importedShiftSourceIds={IMPORTED_SET}
      />
    );
    const idx = html.indexOf(`plan-calendar-day-imported-${ISO_IMPORTED}`);
    const seg = html.slice(idx - 30, idx + 200);
    expect(seg).toContain("取");
    expect(html).toContain('aria-label="シフト取込あり"');
  });

  it("importedShiftSourceIds 未指定 + manual indicator のみ（後方互換）では marker なし", () => {
    const map = new Map([[ISO_IMPORTED, indicator(ISO_IMPORTED, "manual")]]);
    const html = renderToStaticMarkup(
      <CalendarTab anchors={[anchor(ISO_IMPORTED, "夜勤", "src-shift")]} now={NOW} dayIndicatorByIso={map} />
    );
    expect(html).not.toContain(WEEK_MARK(ISO_IMPORTED));
    expect(html).toContain("plan-calendar-week-strip");
  });
});
