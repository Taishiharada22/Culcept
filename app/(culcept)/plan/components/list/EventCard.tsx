/**
 * Phase 3-N List impl sub-phase 4 — EventCard component
 *
 * 設計原則 (= Spec audit §5.1 + 第 11+12 補正反映):
 *   - main card UI hierarchy (= Spec §19.10.2):
 *     - primary: title + 時刻 + 場所 + Alter 補助文 (= content axis)
 *     - secondary: proposed dashed border + opacity 0.7 + 「受け入れる」 chip (= authority axis)
 *     - tertiary: source dot + execution chip count (= origin axis + execution)
 *     - **詳細 sheet のみ**: clonedFrom / imported 詳細 / acceptedAt (= 第 12 補正 #2、 main card 非表示)
 *
 *   - 第 11 補正 #1 UI 責務分離: origin と authority と clonedFrom を **3 axis 独立**で扱う
 *   - 第 12 補正 #1: provenance = origin (= source dot)、 derivation = clonedFrom (= 詳細 sheet のみ)
 *
 *   - 規約 24-extended (= focus surface): focus-visible:border-slate-300
 *   - 自然な日本語維持 (= 第 2 補正、 命令形 / 評価 / push 系単語狩り禁止)
 *
 * 第 7 補正 #1 多軸表現 minimal compact (= 色 + icon、 sub-phase 6 で SourceIndicator 専用 component 化):
 *   - 本 sub-phase 4 では minimal inline (= source dot + emoji icon)
 *   - sub-phase 6 で SourceIndicator + ExecutionLayerChip component に分離
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §5.1 + §19.10
 *   - lib/plan/list/sourceProvenance.ts (= 2 軸 source model + helpers)
 */

import { type ReactNode } from "react";
import {
  type StrictEventCardViewModel,
  isProposed,
  isAlterOrigin,
} from "@/lib/plan/list/sourceProvenance";
import { type EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category visual mapping (= Spec §8.2 color tokens、 sub-phase 4 inline、 sub-phase 10 で extract)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_BORDER_CLASS: Record<EventCategory, string> = {
  cafe: 'border-l-indigo-500',
  meal: 'border-l-orange-500',
  work: 'border-l-blue-500',
  home: 'border-l-emerald-500',
  other: 'border-l-slate-500',
};

const CATEGORY_TIME_TEXT_CLASS: Record<EventCategory, string> = {
  cafe: 'text-indigo-600',
  meal: 'text-orange-600',
  work: 'text-blue-600',
  home: 'text-emerald-600',
  other: 'text-slate-600',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventCard component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EventCardProps = {
  readonly event: StrictEventCardViewModel;
  readonly onTap?: () => void;
};

/**
 * EventCard — main timeline 上の event 表示単位
 *
 * UI hierarchy (= 第 12 補正 #2 遵守):
 *   - primary: title + 時刻 range + 場所 + Alter 補助文
 *   - secondary: authority 状態 (= proposed なら dashed border + chip)
 *   - tertiary: origin source dot + execution chip count
 *   - 詳細 sheet のみ: clonedFrom / imported 詳細 / acceptedAt
 */
export function EventCard({ event, onTap }: EventCardProps): ReactNode {
  const proposed = isProposed(event.sourceModel);
  const alterOrigin = isAlterOrigin(event.sourceModel);
  const imported = event.sourceModel.origin === 'imported';

  // container class
  const containerClass = [
    "block w-full text-left",
    "rounded-2xl bg-white",
    "border-l-4",
    CATEGORY_BORDER_CLASS[event.category],
    "border border-slate-100",
    "shadow-sm",
    "p-4",
    "transition-colors duration-150",
    "focus:outline-none focus-visible:border-slate-300",
    "hover:shadow-md",
    proposed ? "border-dashed opacity-70" : "",
  ].filter(Boolean).join(" ");

  // 時刻 range text
  const timeRangeText = event.endTime
    ? `${event.startTime}-${event.endTime}`
    : event.startTime;

  return (
    <button
      type="button"
      onClick={onTap}
      className={containerClass}
      data-testid={`plan-list-event-card-${event.id}`}
    >
      {/* PRIMARY: 時刻 range (= top right area、 category color) */}
      <p
        className={`text-sm font-medium ${CATEGORY_TIME_TEXT_CLASS[event.category]} tabular-nums`}
      >
        {timeRangeText}
      </p>

      {/* PRIMARY: title (= text-lg semibold) */}
      <p className="text-lg font-semibold text-slate-900 mt-1">
        {event.title}
      </p>

      {/* PRIMARY: 場所 (= optional) */}
      {event.location !== undefined && (
        <p className="text-sm text-slate-500 mt-1 flex items-start gap-1">
          <span aria-hidden="true">📍</span>
          <span>{event.location}</span>
        </p>
      )}

      {/* PRIMARY: Alter 補助文 (= optional) */}
      {event.alterNote !== undefined && (
        <p className="text-sm text-slate-600 mt-2 flex items-start gap-1">
          <span aria-hidden="true">✨</span>
          <span>{event.alterNote}</span>
        </p>
      )}

      {/* TERTIARY footer: source dot (= origin axis) + execution chip + SECONDARY chip (= authority) */}
      <div className="mt-3 flex items-center gap-2 text-xs">
        {/* origin source dot (= 第 7 補正 #1 minimal compact、 sub-phase 6 で SourceIndicator 化) */}
        {imported && (
          <span
            className="inline-block w-2 h-2 rounded-full bg-slate-500"
            aria-label="source: imported"
          />
        )}
        {alterOrigin && !proposed && (
          <span
            className="inline-block w-2 h-2 rounded-full bg-indigo-400"
            aria-label="source: Alter generated"
          />
        )}

        {/* execution chip count (= 第 8 補正 #3 枠まで、 sub-phase 6 で ExecutionLayerChip 化) */}
        {event.executionLayerCounts?.preparation !== undefined &&
          event.executionLayerCounts.preparation > 0 && (
            <span className="text-slate-500">
              準備 {event.executionLayerCounts.preparation}
            </span>
          )}

        {/* SECONDARY: proposed chip (= authority、 right) */}
        {proposed && (
          <span className="ml-auto text-indigo-600">
            受け入れる ›
          </span>
        )}
      </div>
    </button>
  );
}
