/**
 * Phase 3-N List impl sub-phase 4 + 8b-9 corrective — TimelineSpine component
 *
 * 8b-9 大規模 refactor (= CEO + GPT 詳細要件):
 *   - **1 本の timeline 軸** (= spine column 固定 width、 全 row で icon center / transition dot center / 軸 完全同一 X)
 *   - **transition row 新設** (= spine 上小 dot + 「移動」 pill 弱め、 card と card の間)
 *   - **帰宅 (= 最後 event) 以降に spine line 出さない** (= row-internal で線を繋ぐ pattern に refactor)
 *   - icon center / transition dot center / spine 軸 完全同一 X (= w-12 円中心 = 24px、 spine column 内中央)
 *   - 線色 neutral gray (= category 色使わず)
 *   - 線スタイル dashed (= 8b-8 から継続、 mock 整合)
 *
 * 設計原則:
 *   - 時間軸を主役にする構造 component
 *   - 各 event の category color circle + SVG icon 白抜き
 *   - 規約 24-extended (= focus surface は EventCard 内、 spine 自体は非 interactive)
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §5.2 + §4.3
 *   - app/(culcept)/plan/components/list/EventCard.tsx
 *   - app/(culcept)/plan/components/list/TransitionChip.tsx
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
 * 8b-6: meal 専用 SVG icon (= fork + knife outline、 白抜き)
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
      <path d="M7 3 v6" />
      <path d="M9 3 v6" />
      <path d="M11 3 v6 a2 2 0 0 1 -2 2 h-2 a2 2 0 0 1 -2 -2 V3" />
      <path d="M9 11 v10" />
      <path d="M17 3 c2 0 3 4 3 8 h-3 v10" />
    </svg>
  );
}

/**
 * 8b-7 corrective: work 専用 Briefcase icon (= handle + body + closure)
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
      <path d="M9 6 V4.5 a1 1 0 0 1 1 -1 h4 a1 1 0 0 1 1 1 V6" />
      <rect x="3.5" y="6" width="17" height="13" rx="1.5" />
      <path d="M3.5 11 H20.5" />
    </svg>
  );
}

/**
 * Spine category icon component (= 8b-6/8b-7、 SVG 白抜き、 stroke=currentColor で text-white 追従)
 */
const CATEGORY_ICON_COMPONENT: Record<EventCategory, ComponentType<CategoryIconProps>> = {
  cafe: CategoryCafeIcon,
  meal: MealIcon,
  work: BriefcaseIcon,
  home: CategoryHomeIcon,
  other: CategoryUnknownIcon,
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimelineSpine component (= 8b-9 大規模 refactor)
//
// Layout (= 3 column structure):
//   - 左 column (= w-14、 時刻 label)
//   - 中央 column (= w-12、 spine 軸 + circle/dot 完全中央配置)
//   - 右 column (= flex-1、 EventCard or TransitionChip)
//
// spine line (= 8b-9):
//   - **各 row 内に縦線を絶対配置** (= row 内 background line)
//   - 最初 row の top 半分 / 最後 row の bottom 半分 は線出さない (= 帰宅後 line なし)
//   - 各 row 内で line が連続して見える → 1 本の軸として認識
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TimelineSpineProps = {
  readonly events: ReadonlyArray<StrictEventCardViewModel>;
  /**
   * Optional: events 間に挿入する transitions (= 8b-4 追加、 後方互換)
   * transitions は events 間の transition row として render
   */
  readonly transitions?: ReadonlyArray<TransitionViewModel>;
  /** Optional: event tap handler (= id を受け取る、 詳細 sheet open trigger 等) */
  readonly onEventTap?: (id: string) => void;
  /**
   * Optional: 8c-2 追加、 transition 詳細 tap handler (= fromTime, toTime を受け取る、 詳細 sheet 等)
   */
  readonly onTransitionDetailTap?: (fromTime: string, toTime: string) => void;
};

/**
 * TimelineSpine — 時間軸を spine に List 上の event 群を render (= 8b-9 大規模 refactor)
 *
 * 構造 (= 3 column):
 *   - 左 (= 56px、 時刻)
 *   - 中央 (= 48px、 spine column、 circle/dot center 完全同一 X)
 *   - 右 (= flex-1、 EventCard / TransitionChip)
 *
 * spine line (= 中央 column 内に絶対配置、 row-internal):
 *   - 最初 row の top 半分: line なし (= timeline 開始)
 *   - 最後 row の bottom 半分: line なし (= 帰宅後 line なし、 CEO 指示)
 */
export function TimelineSpine({
  events,
  transitions,
  onEventTap,
  onTransitionDetailTap,
}: TimelineSpineProps): ReactNode {
  if (events.length === 0) {
    return (
      <div
        className="text-sm text-slate-500 py-8 text-center"
        data-testid="plan-list-timeline-spine-empty"
      />
    );
  }

  // 各 event の前にある transition を lookup table 化 (= 後で iteration で使用)
  const transitionBefore: Map<number, TransitionViewModel> = new Map();
  if (transitions !== undefined && transitions.length > 0) {
    for (let i = 1; i < events.length; i += 1) {
      const prev = events[i - 1];
      const cur = events[i];
      const prevEnd = prev.endTime ?? prev.startTime;
      const matched = transitions.find(
        (t) => t.fromTime === prevEnd && t.toTime === cur.startTime,
      );
      if (matched !== undefined) {
        transitionBefore.set(i, matched);
      }
    }
  }

  return (
    <div
      className="relative"
      data-testid="plan-list-timeline-spine"
    >
      <ul className="flex flex-col gap-3 list-none m-0 p-0" role="list">
        {events.map((event, index) => {
          const matchingTransition = transitionBefore.get(index);
          const isFirstEvent = index === 0;
          const isLastEvent = index === events.length - 1;
          return (
            <Fragment key={event.id}>
              {/* transition row (= 前 event との間に「移動」 pill、 spine 上小 dot 含む) */}
              {matchingTransition && (
                <li
                  className="relative flex items-stretch"
                  role="listitem"
                  data-testid={`plan-list-spine-transition-row-${matchingTransition.fromTime}-${matchingTransition.toTime}`}
                >
                  {/* 左 column 空白 */}
                  <div className="w-12 flex-shrink-0" aria-hidden="true" />
                  {/* 中央 column: spine 軸 (= dashed、 transition 用) + 小 dot center */}
                  <div className="w-10 flex-shrink-0 relative">
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-0 bottom-0 border-l border-dashed border-slate-300"
                      aria-hidden="true"
                    />
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-slate-400"
                      aria-hidden="true"
                    />
                  </div>
                  {/* 右 column: 「移動」 pill (= 8c-2 で 詳細 button 接続) */}
                  <div className="flex-1 min-w-0 py-1.5 pl-2">
                    <TransitionChip
                      transition={matchingTransition}
                      onDetailTap={
                        onTransitionDetailTap
                          ? () =>
                              onTransitionDetailTap(
                                matchingTransition.fromTime,
                                matchingTransition.toTime,
                              )
                          : undefined
                      }
                    />
                  </div>
                </li>
              )}
              {/* event row (= 8b-12 corrective: items-start → items-stretch、 spine column が row 全体 height に拡張) */}
              <li
                className="relative flex items-stretch"
                role="listitem"
              >
                {/* 左 column: 時刻 label (= w-14→w-12、 text-base→text-sm) */}
                <div
                  className={`w-12 flex-shrink-0 pt-2 text-sm font-medium tabular-nums ${CATEGORY_TIME_TEXT_CLASS[event.category]}`}
                >
                  {event.startTime}
                </div>

                {/* 中央 column: spine column (= 8b-11: pt-1 削除 → line が row top から本当に start、 icon に mt-1)
                    8b-10: line solid for event row (= icon と密着)、 8b-11: gap が visual に消える */}
                <div className="w-10 flex-shrink-0 relative">
                  {/* spine line top 半分 (= 8b-10 solid、 8b-11 で row top から確実に start) */}
                  {!isFirstEvent && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-0 h-1/2 border-l border-solid border-slate-300"
                      aria-hidden="true"
                    />
                  )}
                  {/* spine line bottom 半分 (= 8b-10 solid、 最後 event は line なし) */}
                  {!isLastEvent && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 bottom-0 top-1/2 border-l border-solid border-slate-300"
                      aria-hidden="true"
                    />
                  )}
                  {/* circle (= 8b-11 mt-1 個別付与で line を遮らない) */}
                  <div className="relative flex justify-center z-10 mt-1">
                    <div
                      className={`w-10 h-10 rounded-full ${CATEGORY_CIRCLE_BG_CLASS[event.category]} border-[3px] border-white flex items-center justify-center text-white shadow-sm`}
                      aria-hidden="true"
                    >
                      {(() => {
                        const Icon = CATEGORY_ICON_COMPONENT[event.category];
                        return <Icon size={18} className="text-white" />;
                      })()}
                    </div>
                  </div>
                </div>

                {/* 右 column: EventCard */}
                <div className="flex-1 min-w-0 pl-2">
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
