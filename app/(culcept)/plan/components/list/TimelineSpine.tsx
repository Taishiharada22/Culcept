/**
 * Phase 3-N List impl sub-phase 4 — TimelineSpine component
 *
 * 設計原則 (= Spec audit §5.2 + §4.3 + 第 11 補正 #1 反映):
 *   - 時間軸を主役にする構造 component (= 左に時刻、 中央 spine line、 右に EventCard)
 *   - 各 event の category color circle で spine と接続
 *   - transition (= 「移動」 chip) は本 sub-phase 4 では inline placeholder (= sub-phase 5 で TransitionChip 専用 component 化)
 *   - 規約 24-extended (= focus surface は EventCard 内で適用、 spine 自体は非 interactive)
 *
 * UI 責務 (= 構造のみ):
 *   - 時刻 label (= left、 56px width、 tabular-nums、 category color)
 *   - spine line (= 中央、 2px、 slate-200)
 *   - event circle (= 32px、 category color bg、 spine 上 z-10)
 *   - EventCard render (= right、 flex-1)
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §5.2 + §4.3
 *   - app/(culcept)/plan/components/list/EventCard.tsx
 *   - lib/plan/list/sourceProvenance.ts
 */

import { type ReactNode } from "react";
import {
  type StrictEventCardViewModel,
} from "@/lib/plan/list/sourceProvenance";
import { type EventCategory } from "@/lib/plan/list/types";
import { EventCard } from "./EventCard";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category circle bg + 時刻 text color (= Spec §8.2 + EventCard 整合)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_CIRCLE_BG_CLASS: Record<EventCategory, string> = {
  cafe: 'bg-indigo-500',
  meal: 'bg-orange-500',
  work: 'bg-blue-500',
  home: 'bg-emerald-500',
  other: 'bg-slate-500',
};

const CATEGORY_TIME_TEXT_CLASS: Record<EventCategory, string> = {
  cafe: 'text-indigo-600',
  meal: 'text-orange-600',
  work: 'text-blue-600',
  home: 'text-emerald-600',
  other: 'text-slate-600',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimelineSpine component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimelineSpineProps = {
  readonly events: ReadonlyArray<StrictEventCardViewModel>;
  /** Optional: event tap handler (= id を受け取る、 詳細 sheet open trigger 等) */
  readonly onEventTap?: (id: string) => void;
};

/**
 * TimelineSpine — 時間軸を spine に List 上の event 群を render
 *
 * 構造:
 *   - 左 column (= 56px): 時刻 label (= 各 event の startTime)
 *   - 中央 column (= 32px circle area): category color circle、 spine line 上
 *   - 右 column (= flex-1): EventCard
 *
 * spine line は absolute 配置で背景に置く (= 各 row の circle が接続)
 */
export function TimelineSpine({ events, onEventTap }: TimelineSpineProps): ReactNode {
  if (events.length === 0) {
    return (
      <div
        className="text-sm text-slate-500 py-8 text-center"
        data-testid="plan-list-timeline-spine-empty"
      >
        {/* empty timeline (= empty 日)、 EmptyDayEntry は別 component で render (= sub-phase 5) */}
      </div>
    );
  }

  return (
    <div
      className="relative"
      data-testid="plan-list-timeline-spine"
    >
      {/* 中央 spine line (= 56px + 16px gap + 16px (circle center) = 88px from left) */}
      <div
        className="absolute top-4 bottom-4 w-0.5 bg-slate-200 pointer-events-none"
        style={{ left: '72px' }}
        aria-hidden="true"
      />

      <ul className="flex flex-col gap-4 list-none m-0 p-0" role="list">
        {events.map((event) => (
          <li
            key={event.id}
            className="relative flex items-start gap-4"
            role="listitem"
          >
            {/* 左 column: 時刻 label */}
            <div
              className={`w-14 flex-shrink-0 pt-3 text-base font-medium tabular-nums ${CATEGORY_TIME_TEXT_CLASS[event.category]}`}
            >
              {event.startTime}
            </div>

            {/* 中央 column: category circle (= spine 上、 z-10 で line と重ねる) */}
            <div className="relative flex-shrink-0 z-10 pt-2">
              <div
                className={`w-8 h-8 rounded-full ${CATEGORY_CIRCLE_BG_CLASS[event.category]} border-4 border-white`}
                aria-hidden="true"
              />
            </div>

            {/* 右 column: EventCard */}
            <div className="flex-1 min-w-0">
              <EventCard
                event={event}
                onTap={onEventTap ? () => onEventTap(event.id) : undefined}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
