"use client";

/**
 * DevMonthGridClient — MonthGridView 単独 preview の client（dev 専用・sample data）
 *
 * 局所 state で MonthGridView を駆動。CalendarTab を経由しないため、別ブランチの
 * CalendarTab スタック問題と無関係に月 grid の見た目・コード chip・選択・月送りを確認できる。
 *
 * M3-b polish: 原稿コード chip 表示。sample は **矛盾なし**（勤務日と休み日を同日に重ねない）。
 *   - 勤務 anchor の title = displayLabel（早番/夜勤…）→ resolveShiftAnchorChip で rawCode(E/N/L/G/E-18)
 *   - 休み indicator は rawCode（H/BD/HREQ）を持たせる
 *   - 非シフト anchor（通院）= resolver 不一致 → 短縮 title fallback の確認
 */

import { useState } from "react";

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { DayIndicatorViewModel } from "@/lib/plan/dayIndicatorView";
import { resolveShiftAnchorChip } from "@/lib/plan/shift/shiftAnchorChip";

import { MonthGridView } from "../components/MonthGridView";
import { buildMonthGrid, clampSelectedDateToMonth } from "../tabs/_monthGrid";
import {
  addMonths,
  anchorsForDay,
  formatJpDate,
  formatJpYearMonth,
  formatTime,
  isoDate,
} from "../tabs/_helpers";

// ── sample data（2025/6 中心・矛盾なし・実 DB 非接続）──
function anchor(date: string, startTime: string, title: string): ExternalAnchor {
  return {
    id: `sample-${date}-${startTime}`,
    userId: "sample",
    sourceId: "sample-src",
    confirmedAt: "2025-06-01T00:00:00.000Z",
    title, // = displayLabel（早番/遅番/日勤/夜勤/早番ロング）or 非シフト名
    startTime,
    rigidity: "hard",
    anchorKind: "one_off",
    date,
  };
}

// 実際の連続デスクシフトに近い「密な 1 ヶ月」（全 30 日を勤務 or 休みで埋める・矛盾なし）。
// 注: これは実情に近い illustrative な rotation であり、CEO の実 roster そのものではない
//     （実データは cleanup 済 + import 保存は gate 中）。正確反映の最終確認は実取込（M5）。
const ISO = (d: number) => `2025-06-${String(d).padStart(2, "0")}`;

/** [day, displayLabel(=title), startTime] 勤務 → resolver で E/L/N/G/E-18 */
const WORK: ReadonlyArray<[number, string, string]> = [
  [2, "早番", "06:00"], [6, "早番", "06:00"], [14, "早番", "06:00"], [19, "早番", "06:00"], [25, "早番", "06:00"],
  [3, "遅番", "14:00"], [10, "遅番", "14:00"], [16, "遅番", "14:00"], [22, "遅番", "14:00"], [27, "遅番", "14:00"],
  [4, "夜勤", "18:00"], [11, "夜勤", "18:00"], [17, "夜勤", "18:00"], [23, "夜勤", "18:00"], [28, "夜勤", "18:00"],
  [9, "日勤", "09:00"], [20, "日勤", "09:00"],
  [7, "早番ロング", "06:00"], [26, "早番ロング", "06:00"],
];
const SAMPLE_ANCHORS: ExternalAnchor[] = WORK.map(([d, label, t]) =>
  anchor(ISO(d), t, label)
);

function indicator(
  date: string,
  variant: DayIndicatorViewModel["variant"],
  label: string,
  rawCode: string,
  opts: { tentative?: boolean; publicHoliday?: boolean } = {}
): DayIndicatorViewModel {
  return {
    date,
    variant,
    label,
    isTentative: opts.tentative ?? false,
    countsAsPublicHoliday: opts.publicHoliday ?? false,
    sourceType: "shift_image",
    rawCode,
  };
}

/** [day, variant, label, rawCode] 休み（勤務日と重ねない＝矛盾なし） */
const OFF: ReadonlyArray<
  [number, DayIndicatorViewModel["variant"], string, string]
> = [
  [1, "public_holiday", "公休", "H"], [8, "public_holiday", "公休", "H"], [13, "public_holiday", "公休", "H"], [21, "public_holiday", "公休", "H"], [30, "public_holiday", "公休", "H"],
  [5, "off", "休み", "BD"], [12, "off", "休み", "BD"], [18, "off", "休み", "BD"], [24, "off", "休み", "BD"], [29, "off", "休み", "BD"],
  [15, "requested_off", "希望休", "HREQ"],
];
const SAMPLE_INDICATORS = new Map<string, DayIndicatorViewModel>(
  OFF.map(([d, variant, label, rawCode]) => [
    ISO(d),
    indicator(ISO(d), variant, label, rawCode, {
      publicHoliday: variant === "public_holiday",
      tentative: variant === "requested_off",
    }),
  ])
);

/** preview の擬似「今日」（today 強調の確認用・データなしの日に置く） */
const FAKE_TODAY = "2025-06-12";

export function DevMonthGridClient() {
  const [currentMonth, setCurrentMonth] = useState<Date>(
    () => new Date(Date.UTC(2025, 5, 1))
  );
  const [selectedDate, setSelectedDate] = useState<string>("2025-06-10");

  const grid = buildMonthGrid(currentMonth);
  const selectedObj = new Date(selectedDate + "T00:00:00.000Z");

  const goMonth = (delta: number) => {
    const next = addMonths(currentMonth, delta);
    setCurrentMonth(next);
    setSelectedDate(isoDate(clampSelectedDateToMonth(selectedObj, next)));
  };

  const selectedAnchors = anchorsForDay(SAMPLE_ANCHORS, selectedObj);
  const selectedIndicator = SAMPLE_INDICATORS.get(selectedDate);

  return (
    <div className="max-w-md mx-auto p-4">
      {/* dev banner */}
      <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700">
        dev preview · sample data（DB 非接続）。CalendarTab 非経由で MonthGridView
        を単独描画しています。
      </div>

      {/* month header ◀ X月 YYYY ▶ */}
      <header className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => goMonth(-1)}
          aria-label="前月"
          className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition"
        >
          ◀
        </button>
        <h2 className="text-xl font-semibold text-slate-900">
          {formatJpYearMonth(currentMonth)}
        </h2>
        <button
          type="button"
          onClick={() => goMonth(1)}
          aria-label="翌月"
          className="w-10 h-10 flex items-center justify-center rounded-full text-slate-600 hover:bg-slate-100 transition"
        >
          ▶
        </button>
      </header>

      {/* 本体: MonthGridView（M3-b で接続するものと同一 component + 同一 resolver） */}
      <MonthGridView
        grid={grid}
        anchors={SAMPLE_ANCHORS}
        dayIndicatorByIso={SAMPLE_INDICATORS}
        selectedIso={selectedDate}
        todayIso={FAKE_TODAY}
        onSelectDate={setSelectedDate}
        getAnchorChip={resolveShiftAnchorChip}
      />

      {/* selected-day agenda（grid=コード / agenda=和名+時刻 の 2 層） */}
      <section className="mt-4 px-1">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-base font-semibold text-slate-800">
            {formatJpDate(selectedObj)}
          </h3>
          {selectedIndicator && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              {selectedIndicator.label}
            </span>
          )}
        </div>
        {selectedAnchors.length > 0 ? (
          <ul className="space-y-1">
            {selectedAnchors.map((a) => (
              <li key={a.id} className="text-sm text-slate-700">
                {a.title} {formatTime(a.startTime)}
              </li>
            ))}
          </ul>
        ) : selectedIndicator ? (
          <p className="text-sm text-slate-500">{selectedIndicator.label}</p>
        ) : (
          <p className="text-sm text-slate-400">予定なし</p>
        )}
      </section>

      {/* 凡例 */}
      <div className="mt-5 px-1 text-xs text-slate-500 space-y-1.5">
        <div className="font-medium text-slate-600">コード凡例（grid = 原稿コード）</div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="px-1 py-px rounded text-[10px] font-semibold bg-sky-100 text-sky-700">E/L/G/N/E-18</span>
          <span>勤務</span>
          <span className="ml-2 px-1 py-px rounded text-[10px] font-semibold bg-rose-100 text-rose-600">H</span>
          <span>公休</span>
          <span className="ml-2 px-1 py-px rounded text-[10px] font-semibold bg-violet-100 text-violet-600">HREQ</span>
          <span>希望休</span>
          <span className="ml-2 px-1 py-px rounded text-[10px] font-semibold bg-slate-100 text-slate-500">BD</span>
          <span>休み</span>
        </div>
        <div className="text-slate-400">
          確認点: 全 30 日を埋めた密な月で各コードが読めるか / 6/10（選択=ring）で L が消えないか /
          N(夜勤)・E-18 が収まるか / 密でもうるさすぎないか / 5・7 月へ ◀▶ で当月外が淡色か
        </div>
      </div>
    </div>
  );
}
