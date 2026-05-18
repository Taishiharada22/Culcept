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
import { expandOneOff, expandRecurrence } from "@/lib/plan/recurrence-expander";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const WEEKDAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 今週の月曜を UTC midnight で返す */
function getMondayOfThisWeek(now: Date = new Date()): Date {
  const d = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  const day = d.getUTCDay(); // 0 (Sun) - 6 (Sat)
  // Mon=1。日曜のときは前週の月曜まで -6 戻す。
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

/** monday から 7 日分の UTC midnight 配列 */
function getWeekDays(now: Date = new Date()): Date[] {
  const monday = getMondayOfThisWeek(now);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setUTCDate(monday.getUTCDate() + i);
    return d;
  });
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface AnchorOnDay {
  anchor: ExternalAnchor;
  startTime: string;
}

/**
 * day（UTC midnight）に該当する anchor を抽出。
 * recurring は expandRecurrence、one_off は date 一致。
 */
function anchorsForDay(
  anchors: ExternalAnchor[],
  day: Date
): AnchorOnDay[] {
  const result: AnchorOnDay[] = [];
  const range = { start: day, end: day }; // 1 日分

  for (const a of anchors) {
    if (a.anchorKind === "one_off") {
      const hits = expandOneOff({ date: a.date }, range);
      if (hits.length > 0) result.push({ anchor: a, startTime: a.startTime });
    } else {
      const hits = expandRecurrence(
        {
          validFrom: a.validFrom,
          ...(a.validUntil !== undefined ? { validUntil: a.validUntil } : {}),
          recurrenceRule: a.recurrenceRule,
          ...(a.exceptionDates !== undefined
            ? { exceptionDates: a.exceptionDates }
            : {}),
        },
        range
      );
      if (hits.length > 0) result.push({ anchor: a, startTime: a.startTime });
    }
  }

  return result.sort((x, y) => x.startTime.localeCompare(y.startTime));
}

function formatTime(t: string): string {
  // "HH:MM:SS" → "HH:MM" / "HH:MM" → "HH:MM"
  return t.slice(0, 5);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function CalendarTab({
  anchors,
  now,
}: {
  anchors: ExternalAnchor[];
  /** inject 可能、test deterministic 化のため */
  now?: Date;
}) {
  const days = getWeekDays(now);
  const today = isoDate(new Date(Date.UTC(
    (now ?? new Date()).getUTCFullYear(),
    (now ?? new Date()).getUTCMonth(),
    (now ?? new Date()).getUTCDate()
  )));

  return (
    <div data-testid="plan-calendar-tab" className="space-y-3 md:grid md:grid-cols-7 md:gap-3 md:space-y-0">
      {days.map((day) => {
        const iso = isoDate(day);
        const dayName = WEEKDAY_LABELS[day.getUTCDay()];
        const dayAnchors = anchorsForDay(anchors, day);
        const isToday = iso === today;

        return (
          <GlassCard
            key={iso}
            className={
              "p-3 " + (isToday ? "ring-2 ring-indigo-400" : "")
            }
            data-testid={`plan-calendar-day-${iso}`}
          >
            <header className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-500">
                {dayName}
              </span>
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
                {dayAnchors.map(({ anchor, startTime }) => (
                  <li
                    key={anchor.id}
                    className="rounded-lg border border-slate-200 bg-white/60 p-2"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-indigo-700">
                        {formatTime(startTime)}
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
                      <p className="text-xs text-slate-500">
                        {anchor.locationText}
                      </p>
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
