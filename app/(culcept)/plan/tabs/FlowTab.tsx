"use client";

/**
 * FlowTab — 主観レンズ（その日を生きる）(W1-5)
 *
 * 設計書: docs/alter-plan-w15-ui-mini-design.md §2
 *
 * 表示:
 *   - 日付セレクタ（昨日 / 今日 / 明日）+ 任意日付
 *   - 選択された 1 日の anchor を時刻順に縦タイムライン
 *   - anchor 間の空白時間（gap）を視覚化
 *
 * 範囲外:
 *   - 編集 UI
 *   - 自由日付 picker（W1-X）
 *   - W1-6 drift logging
 */

import { useState, useMemo } from "react";

import { GlassCard, GlassBadge, GlassButton } from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { expandOneOff, expandRecurrence } from "@/lib/plan/recurrence-expander";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function utcMidnight(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(d.getUTCDate() + n);
  return r;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatJpDate(d: Date): string {
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const wd = ["日", "月", "火", "水", "木", "金", "土"][d.getUTCDay()];
  return `${m}月${day}日(${wd})`;
}

function formatTime(t: string): string {
  return t.slice(0, 5);
}

/** 同一日の anchor を時刻順で返す */
function anchorsForDay(
  anchors: ExternalAnchor[],
  day: Date
): ExternalAnchor[] {
  const range = { start: day, end: day };
  const hits: ExternalAnchor[] = [];

  for (const a of anchors) {
    if (a.anchorKind === "one_off") {
      if (expandOneOff({ date: a.date }, range).length > 0) hits.push(a);
    } else {
      const expanded = expandRecurrence(
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
      if (expanded.length > 0) hits.push(a);
    }
  }

  return hits.sort((x, y) => x.startTime.localeCompare(y.startTime));
}

/** "HH:MM" → 分単位の数値 */
function minutesOf(t: string): number {
  const [h, m] = t.split(":");
  return (Number(h) || 0) * 60 + (Number(m) || 0);
}

/** 前 anchor の endTime と次 anchor の startTime の差を「分」で返す */
function gapMinutes(prev: ExternalAnchor, next: ExternalAnchor): number {
  const prevEnd = prev.endTime ?? prev.startTime;
  return minutesOf(next.startTime) - minutesOf(prevEnd);
}

function formatGap(mins: number): string {
  if (mins <= 0) return "間隔なし";
  if (mins < 60) return `${mins} 分`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} 時間` : `${h} 時間 ${m} 分`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type FlowOffset = -1 | 0 | 1;

const OFFSET_LABELS: Record<FlowOffset, string> = {
  [-1]: "昨日",
  [0]: "今日",
  [1]: "明日",
};

export function FlowTab({
  anchors,
  now,
}: {
  anchors: ExternalAnchor[];
  now?: Date;
}) {
  const baseDay = utcMidnight(now ?? new Date());
  const [offset, setOffset] = useState<FlowOffset>(0);

  const selectedDay = useMemo(() => addDays(baseDay, offset), [baseDay, offset]);
  const dayAnchors = useMemo(
    () => anchorsForDay(anchors, selectedDay),
    [anchors, selectedDay]
  );

  return (
    <div data-testid="plan-flow-tab" className="space-y-4">
      {/* Date selector */}
      <div className="flex gap-2">
        {([-1, 0, 1] as FlowOffset[]).map((o) => {
          const active = o === offset;
          return (
            <GlassButton
              key={o}
              size="sm"
              variant={active ? "primary" : "secondary"}
              onClick={() => setOffset(o)}
            >
              {OFFSET_LABELS[o]}
            </GlassButton>
          );
        })}
        <span
          className="ml-auto flex items-center text-xs text-slate-500"
          data-testid="plan-flow-selected-date"
        >
          {formatJpDate(selectedDay)}
        </span>
      </div>

      {/* Timeline */}
      {dayAnchors.length === 0 ? (
        <GlassCard className="p-6 text-center">
          <p className="text-sm text-slate-500">
            {OFFSET_LABELS[offset]}は予定がありません。空白の 1 日です。
          </p>
        </GlassCard>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-indigo-100 pl-6">
          {dayAnchors.map((a, idx) => {
            const prev = idx > 0 ? dayAnchors[idx - 1] : null;
            const gap = prev ? gapMinutes(prev, a) : null;
            return (
              <li
                key={a.id}
                className="relative"
                data-testid={`plan-flow-item-${a.id}`}
              >
                {/* Dot */}
                <span className="absolute -left-[33px] top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-indigo-400 bg-white" />
                {/* Gap indicator */}
                {gap !== null && (
                  <p className="mb-2 text-xs text-slate-400">
                    ↑ 前から {formatGap(gap)}
                  </p>
                )}
                <GlassCard className="p-3">
                  <div className="flex items-baseline gap-2">
                    <span className="text-sm font-mono text-indigo-700">
                      {formatTime(a.startTime)}
                      {a.endTime ? ` – ${formatTime(a.endTime)}` : ""}
                    </span>
                    {a.rigidity === "hard" && (
                      <GlassBadge variant="default" size="sm">
                        固定
                      </GlassBadge>
                    )}
                  </div>
                  <p className="mt-1 text-base font-medium text-slate-900">
                    {a.title}
                  </p>
                  {a.locationText && (
                    <p className="text-xs text-slate-500">{a.locationText}</p>
                  )}
                </GlassCard>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
