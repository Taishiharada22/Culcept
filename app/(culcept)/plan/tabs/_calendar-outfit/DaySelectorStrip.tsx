"use client";

/**
 * Slice 1 — section ② 内の日付セレクタ (NEW local impl)
 *
 * CEO 補正 #4: 既存 week strip を抽出・流用せず、 dashboard 専用の新規実装にする
 *   (= 既存 Plan の week strip / month nav に一切影響を与えない)。
 *
 * 振る舞い:
 *   - 今日を中心に、 過去 RANGE_BEFORE 日 〜 未来 RANGE_AFTER 日を横一列に並べる。
 *   - 横スクロールで前後 (過去・未来) に進める。 mount 時に選択日 (= 初期は今日) を中央へ寄せる。
 *   - 各 cell: 曜日 + 日付 + 天気アイコン。 選択日は紫枠ボックス、 今日は控えめリング。
 *   - tap で onSelect(iso)。 純粋な date helper (pure) のみ使用、 I/O なし。
 *   - 天気は決定論的 mock パターン (日付番号 % cycle)。 乱数 / 現在時刻参照なし。
 */

import { useEffect, useRef } from "react";

import { addDays, isoDate, utcMidnight, WEEKDAY_LABELS } from "../_helpers";
import { CAL_OUTFIT_PALETTE } from "./_palette";

/** 決定論的な mock 天気サイクル (日付番号で index、 実取得しない) */
const DAY_WEATHER_CYCLE: ReadonlyArray<string> = ["☀️", "⛅", "☀️", "🌧️", "⛅", "☁️", "☀️"];

/** 今日を中心に過去 7 日 / 未来 21 日 (= 横スクロールの可動域) */
const RANGE_BEFORE = 7;
const RANGE_AFTER = 21;

export function DaySelectorStrip({
  now,
  selectedIso,
  onSelect,
}: {
  now: Date;
  selectedIso: string;
  onSelect: (iso: string) => void;
}) {
  const today = utcMidnight(now);
  const todayIso = isoDate(today);
  const days = Array.from({ length: RANGE_BEFORE + 1 + RANGE_AFTER }, (_, i) => {
    const date = addDays(today, i - RANGE_BEFORE);
    return {
      iso: isoDate(date),
      dayOfMonth: date.getUTCDate(),
      weekday: WEEKDAY_LABELS[date.getUTCDay()],
      dow: date.getUTCDay(),
      weather: DAY_WEATHER_CYCLE[date.getUTCDate() % DAY_WEATHER_CYCLE.length],
    };
  });

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // mount 時、 選択日 (初期は今日) を strip の中央へ寄せる。 container 自身の scrollLeft のみ操作し、
  // ページ全体の縦スクロールは動かさない。
  useEffect(() => {
    const container = scrollRef.current;
    const active = activeRef.current;
    if (!container || !active) return;
    container.scrollLeft =
      active.offsetLeft - container.clientWidth / 2 + active.clientWidth / 2;
  }, []);

  return (
    <div
      ref={scrollRef}
      className="relative flex gap-1.5 overflow-x-auto pb-1"
      role="group"
      aria-label="日付を選ぶ"
      data-testid="plan-calendar-outfit-day-selector"
    >
      {days.map((d) => {
        const isSelected = d.iso === selectedIso;
        const isToday = d.iso === todayIso;
        const weekdayColor =
          d.dow === 0 ? "text-rose-400" : d.dow === 6 ? "text-sky-400" : CAL_OUTFIT_PALETTE.subtle;
        return (
          <button
            key={d.iso}
            ref={isSelected ? activeRef : undefined}
            type="button"
            onClick={() => onSelect(d.iso)}
            aria-pressed={isSelected}
            aria-current={isToday ? "date" : undefined}
            data-testid={`plan-calendar-outfit-day-${d.iso}`}
            className={
              "flex w-[48px] shrink-0 flex-col items-center gap-1 rounded-2xl border px-2 py-2 transition " +
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 " +
              (isSelected
                ? "border-violet-500 bg-violet-100 text-violet-700 shadow ring-1 ring-violet-300"
                : isToday
                ? "border-violet-100 bg-white text-violet-600 ring-1 ring-violet-100"
                : "border-transparent text-slate-600 hover:bg-violet-50/50")
            }
          >
            <span
              className={"text-[10px] font-medium " + (isSelected ? "text-violet-500" : weekdayColor)}
            >
              {d.weekday}
            </span>
            <span className="text-sm font-semibold leading-none">{d.dayOfMonth}</span>
            <span className="text-sm leading-none" aria-hidden="true">
              {d.weather}
            </span>
          </button>
        );
      })}
    </div>
  );
}
