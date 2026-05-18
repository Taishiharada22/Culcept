"use client";

/**
 * FlowTab — 主観レンズ（その日を生きる）(W1-5 + W1-X3)
 *
 * 設計書:
 *   - docs/alter-plan-w15-ui-mini-design.md §2
 *   - docs/alter-plan-w1x3-cell-add-mini-design.md §2 (gap add 導線)
 *
 * 表示:
 *   - 日付セレクタ（昨日 / 今日 / 明日）
 *   - 選択された 1 日の anchor を時刻順に縦タイムライン
 *   - anchor 間の空白時間（gap）を視覚化
 *   - W1-X3: 30 分以上の gap に「+ 時刻を教える」badge + Empty 日に CTA
 *
 * 範囲外:
 *   - 編集 UI
 *   - 自由日付 picker
 *   - W1-6 drift logging
 */

import { useMemo, useState } from "react";

import {
  GlassBadge,
  GlassButton,
  GlassCard,
} from "@/components/ui/glassmorphism-design";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { AnchorFormState } from "@/lib/plan/anchor-input-form";

import type { AddRequest } from "../PlanClient";
import {
  addDays,
  anchorsForDay,
  formatGap,
  formatJpDate,
  formatTime,
  gapMinutes,
  isoDate,
  shouldShowGapAdd,
  suggestGapStartTime,
  utcMidnight,
} from "./_helpers";

type FlowOffset = -1 | 0 | 1;

const OFFSET_LABELS: Record<FlowOffset, string> = {
  [-1]: "昨日",
  [0]: "今日",
  [1]: "明日",
};

export function FlowTab({
  anchors,
  now,
  onAddRequest,
}: {
  anchors: ExternalAnchor[];
  now?: Date;
  onAddRequest?: (req: AddRequest) => void;
}) {
  const baseDay = utcMidnight(now ?? new Date());
  const [offset, setOffset] = useState<FlowOffset>(0);

  const selectedDay = useMemo(() => addDays(baseDay, offset), [baseDay, offset]);
  const dayAnchors = useMemo(
    () => anchorsForDay(anchors, selectedDay),
    [anchors, selectedDay]
  );
  const selectedDayIso = isoDate(selectedDay);
  const selectedDayLabel = formatJpDate(selectedDay);

  const handleGapAdd = (startTime: string) => {
    if (!onAddRequest) return;
    const initial: Partial<AnchorFormState> = {
      kind: "one_off",
      date: selectedDayIso,
      startTime,
    };
    onAddRequest({
      initial,
      subtitle: `Flow / ${selectedDayLabel} ${startTime} 頃から`,
    });
  };

  const handleEmptyAdd = () => {
    if (!onAddRequest) return;
    const initial: Partial<AnchorFormState> = {
      kind: "one_off",
      date: selectedDayIso,
    };
    onAddRequest({
      initial,
      subtitle: `Flow / ${selectedDayLabel} から`,
    });
  };

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
          {selectedDayLabel}
        </span>
      </div>

      {/* Timeline */}
      {dayAnchors.length === 0 ? (
        <GlassCard className="p-6 text-center">
          <p className="text-sm text-slate-500">
            {OFFSET_LABELS[offset]}は予定がありません。空白の 1 日です。
          </p>
          {onAddRequest && (
            <div className="mt-4 flex justify-center">
              <GlassButton
                size="sm"
                variant="primary"
                onClick={handleEmptyAdd}
                data-testid="plan-flow-empty-add"
              >
                + この日に予定を教える
              </GlassButton>
            </div>
          )}
        </GlassCard>
      ) : (
        <ol className="relative space-y-3 border-l-2 border-indigo-100 pl-6">
          {dayAnchors.map((a, idx) => {
            const prev = idx > 0 ? dayAnchors[idx - 1] : null;
            const gap = prev ? gapMinutes(prev, a) : null;
            const showGapAdd =
              prev &&
              gap !== null &&
              shouldShowGapAdd(gap) &&
              onAddRequest !== undefined;
            const suggestedTime =
              prev !== null
                ? suggestGapStartTime(prev.endTime ?? prev.startTime, a.startTime)
                : null;
            return (
              <li
                key={a.id}
                className="relative"
                data-testid={`plan-flow-item-${a.id}`}
              >
                <span className="absolute -left-[33px] top-2 inline-flex h-4 w-4 items-center justify-center rounded-full border-2 border-indigo-400 bg-white" />
                {gap !== null && (
                  <div className="mb-2 flex items-center gap-2 text-xs text-slate-400">
                    <span>↑ 前から {formatGap(gap)}</span>
                    {showGapAdd && suggestedTime && (
                      <button
                        type="button"
                        onClick={() => handleGapAdd(suggestedTime)}
                        aria-label={`${selectedDayLabel} ${suggestedTime} 頃に予定を教える`}
                        data-testid={`plan-flow-gap-add-${a.id}`}
                        className="rounded-full border border-indigo-200 px-2 py-0.5 text-xs font-medium text-indigo-600 transition hover:border-indigo-500 hover:bg-indigo-50"
                      >
                        + {suggestedTime} 頃を教える
                      </button>
                    )}
                  </div>
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
