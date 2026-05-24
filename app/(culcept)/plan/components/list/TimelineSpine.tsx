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

import { Fragment, type ComponentType, type ReactNode } from "react";
import {
  type StrictEventCardViewModel,
} from "@/lib/plan/list/sourceProvenance";
import { type EventCategory, type TransitionViewModel } from "@/lib/plan/list/types";
import { EventCard } from "./EventCard";
import { TransitionChip } from "./TransitionChip";
import {
  CategoryCafeIcon,
  CategoryHomeIcon,
  CategoryUnknownIcon,
  type CategoryIconProps,
} from "@/components/ui/icons/category";

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

/**
 * 8b-6: meal 専用 SVG icon (= 既存 categoryIconMap には meal 相当なし、 inline 提供)
 *
 * 設計: fork + knife outline、 stroke="currentColor" で text-{color} に追従 (= 白抜き)
 */
function MealIcon({ className, size = 16, ariaLabel }: CategoryIconProps): ReactNode {
  const isInteractive = !!ariaLabel;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={isInteractive ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={isInteractive ? undefined : true}
    >
      {/* Fork (= left): 3 tine + handle */}
      <path d="M7 3 v6" />
      <path d="M9 3 v6" />
      <path d="M11 3 v6 a2 2 0 0 1 -2 2 h-2 a2 2 0 0 1 -2 -2 V3" />
      <path d="M9 11 v10" />
      {/* Knife (= right): blade + handle */}
      <path d="M17 3 c2 0 3 4 3 8 h-3 v10" />
    </svg>
  );
}

/**
 * 8b-7 corrective: work 専用 BriefcaseIcon (= 既存 CategoryOfficeIcon が「不適切」 と CEO 指摘)
 *
 * 設計: 美しい briefcase outline、 stroke="currentColor" で 白抜き
 */
function BriefcaseIcon({ className, size = 16, ariaLabel }: CategoryIconProps): ReactNode {
  const isInteractive = !!ariaLabel;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role={isInteractive ? "img" : undefined}
      aria-label={ariaLabel}
      aria-hidden={isInteractive ? undefined : true}
    >
      {/* Handle (= top) */}
      <path d="M9 6 V4.5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 V6" />
      {/* Body (= main rectangle、 rounded corners) */}
      <rect x="3.5" y="6" width="17" height="13" rx="1.5" />
      {/* Front horizontal split line (= bag closure suggestion) */}
      <path d="M3.5 11 H20.5" />
    </svg>
  );
}

/**
 * Spine category icon component (= 8b-6/8b-7 corrective、 emoji → SVG component 切替):
 *   - cafe / home / other は既存 SVG icon system 再利用
 *   - meal は MealIcon (= inline、 fork + knife)
 *   - work は BriefcaseIcon (= inline、 8b-7 で CategoryOfficeIcon から差替、 CEO 「不適切」 指摘反映)
 *   - stroke="currentColor" + text-white で **白抜き** 表現
 *   - 全 icon size 統一 (= 16px、 32px circle 内で適切)
 */
const CATEGORY_ICON_COMPONENT: Record<EventCategory, ComponentType<CategoryIconProps>> = {
  cafe: CategoryCafeIcon,
  meal: MealIcon,
  work: BriefcaseIcon,
  home: CategoryHomeIcon,
  other: CategoryUnknownIcon,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimelineSpine component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimelineSpineProps = {
  readonly events: ReadonlyArray<StrictEventCardViewModel>;
  /**
   * Optional: events 間に挿入する transitions (= 8b-4 追加、 後方互換)
   *
   * - undefined or 空配列 → transition render なし (= 既存 sub-phase 4 動作)
   * - transition.fromTime <= 直前 event.endTime かつ transition.toTime >= 直後 event.startTime に
   *   合致する transition を、 events 間に時系列順で interleave で render
   * - 不一致な transition は skip (= silent、 throw しない)
   */
  readonly transitions?: ReadonlyArray<TransitionViewModel>;
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
export function TimelineSpine({
  events,
  transitions,
  onEventTap,
}: TimelineSpineProps): ReactNode {
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
      {/* 8b-6 corrective: spine line position fix (= 56px + 16px gap + 16px = 88px = circle 中心)
          旧 72px は circle 左端 → ズレ原因 */}
      <div
        className="absolute top-4 bottom-4 w-0.5 bg-slate-200 pointer-events-none"
        style={{ left: '88px' }}
        aria-hidden="true"
      />

      <ul className="flex flex-col gap-4 list-none m-0 p-0" role="list">
        {events.map((event, index) => {
          // 8b-4: 直前 event の endTime と現 event の startTime に一致する transition があれば interleave
          //   - 隣り合う events 間でのみ判定 (= index > 0)
          //   - transitions が undefined / 空 / 一致なし の場合は何も挟まない (= 後方互換)
          //   - 「truth なき semantics 主張禁止」 のため、 一致しない transition は silent skip
          const prevEvent = index > 0 ? events[index - 1] : null;
          const matchingTransition =
            prevEvent !== null && prevEvent.endTime !== undefined
              ? transitions?.find(
                  (t) =>
                    t.fromTime === prevEvent.endTime &&
                    t.toTime === event.startTime,
                )
              : undefined;
          return (
            <Fragment key={event.id}>
              {matchingTransition && (
                <li
                  className="relative flex items-center"
                  role="listitem"
                >
                  {/* 左 column 余白 (= 時刻 column 幅と合わせる、 transition 自体は中央に出す) */}
                  <div className="w-14 flex-shrink-0" aria-hidden="true" />
                  {/* 中央 + 右 (= TransitionChip は flex-1 で中央寄せ済) */}
                  <div className="flex-1 min-w-0">
                    <TransitionChip transition={matchingTransition} />
                  </div>
                </li>
              )}
              <li
                className="relative flex items-start gap-4"
                role="listitem"
              >
                {/* 左 column: 時刻 label */}
                <div
                  className={`w-14 flex-shrink-0 pt-3 text-base font-medium tabular-nums ${CATEGORY_TIME_TEXT_CLASS[event.category]}`}
                >
                  {event.startTime}
                </div>

                {/* 中央 column: category circle (= spine 上、 z-10 で line と重ねる) + SVG icon (= 節点マーカー、 白抜き)
                    8b-6 corrective: emoji → SVG component (= stroke="currentColor" + text-white で白抜き)、
                    spine line と circle 中心が一致 */}
                <div className="relative flex-shrink-0 z-10 pt-2">
                  <div
                    className={`w-8 h-8 rounded-full ${CATEGORY_CIRCLE_BG_CLASS[event.category]} border-4 border-white flex items-center justify-center text-white`}
                    aria-hidden="true"
                  >
                    {(() => {
                      const Icon = CATEGORY_ICON_COMPONENT[event.category];
                      return <Icon size={16} className="text-white" />;
                    })()}
                  </div>
                </div>

                {/* 右 column: EventCard */}
                <div className="flex-1 min-w-0">
                  <EventCard
                    event={event}
                    onTap={onEventTap ? () => onEventTap(event.id) : undefined}
                  />
                </div>
              </li>
            </Fragment>
          );
        })}
      </ul>
    </div>
  );
}
