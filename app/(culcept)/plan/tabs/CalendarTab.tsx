"use client";

/**
 * CalendarTab — 俯瞰レンズ（今週）(W1-5)
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md §2
 *
 * 表示:
 *   - 今週の月〜日（7 日）を grid で並べる
 *   - 各日に該当する anchor を時刻順に縦に並べる
 *   - recurring anchor は expandRecurrence で展開
 *   - one_off anchor は date 一致で配置
 *
 * 範囲外:
 *   - 月ビュー / 日ビュー
 *   - ドラッグ移動
 *   - 編集 UI
 */

import { GlassCard, GlassBadge } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";

import {
  WEEKDAY_LABELS,
  anchorsForDay,
  formatTime,
  getWeekDays,
  isoDate,
  utcMidnight,
} from "./_helpers";

export function CalendarTab({
  anchors,
  now,
}: {
  anchors: ExternalAnchor[];
  /** inject 可能、test deterministic 化のため */
  now?: Date;
}) {
  const baseNow = now ?? new Date();
  const days = getWeekDays(baseNow);
  const today = isoDate(utcMidnight(baseNow));

  return (
    <div
      data-testid="plan-calendar-tab"
      className="space-y-3 md:grid md:grid-cols-7 md:gap-3 md:space-y-0"
    >
      {days.map((day) => {
        const iso = isoDate(day);
        const dayName = WEEKDAY_LABELS[day.getUTCDay()];
        const dayAnchors = anchorsForDay(anchors, day);
        const isToday = iso === today;

        return (
          <GlassCard
            key={iso}
            className={"p-3 " + (isToday ? "ring-2 ring-indigo-400" : "")}
            data-testid={`plan-calendar-day-${iso}`}
          >
            <header className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-500">{dayName}</span>
              <span
                className={
                  "text-sm font-semibold " +
                  (isToday ? "text-indigo-700" : "text-slate-900")
                }
              >
                {day.getUTCDate()}
              </span>
            </header>
            {dayAnchors.length === 0 ? (
              <p className="text-xs text-slate-400">予定なし</p>
            ) : (
              <ul className="space-y-2">
                {dayAnchors.map((anchor) => (
                  <li
                    key={anchor.id}
                    className="rounded-lg border border-slate-200 bg-white/60 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-indigo-700">
                        {formatTime(anchor.startTime)}
                      </span>
                      {anchor.rigidity === "hard" && (
                        <GlassBadge variant="default" size="sm">
                          固定
                        </GlassBadge>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {anchor.title}
                    </p>
                    {anchor.locationText && (
                      <p className="text-xs text-slate-500">{anchor.locationText}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}
