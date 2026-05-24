"use client";

/**
 * Phase 3-N Map impl sub-phase 9a-impl — MapBottomSheet (= 新 path 唯一の新規 component)
 *
 * 設計原則 (= CEO + GPT 合議 readiness v2 + 9a-impl 着手判断):
 *   - **half 固定** (= drag handle なし、 expanded は 9b 以降検討)
 *   - **close button 明示** (= ✕ 右上、 a11y label)
 *   - **fixed bottom overlay** (= map main view より上、 z-50)
 *   - **spec v3 §9 4 段構造** (= category 大 icon + timeRange + title + location + meaningText)
 *   - **状態完全分離** (= flag OFF の SelectedAnchorCard とは別 component、 同時表示禁止は MapTab 分岐で担保)
 *   - **imageUrl 常に undefined** (= MapSheetViewModel 型側で fake 禁止保証、 sheet 内 image 非表示)
 *   - **中立文体** (= 命令形 / 評価形容詞なし、 「閉じる」 のみ機能ラベル)
 *
 * Aneurasync 哲学整合:
 *   - 「観測 + 解釈」 を sheet で集約 (= 行動指示 / 評価 / 推奨なし)
 *   - meaningText は CategoryMeaning (= Alter 由来観測) 由来 (= adapter で getNarrative 流用済み)
 *
 * 規約 24-extended:
 *   - focus-visible:border-slate-300 (= brand-color focus 禁止)
 *
 * 9a vs 9b 位置づけ (= CEO 補足明示):
 *   - 9a = interaction / state / sheet first-pass (= 本 component)
 *   - 9b = visual fidelity 引き上げ (= 涙型 pin / 白抜き SVG icon 完全実装等)
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-spec-audit.md v3 §9 (= bottom sheet 4 段構造)
 *   - docs/alter-plan-map-redesign-impl-readiness.md v2
 *   - lib/plan/map/types.ts (= MapSheetViewModel)
 *   - lib/plan/map/adapters/externalAnchorMapAdapter.ts (= convertExternalAnchorToMapSheet)
 */

import { type ComponentType, type ReactNode } from "react";

import type { MapSheetViewModel } from "@/lib/plan/map/types";
import type { EventCategory } from "@/lib/plan/list/types";
import {
  CategoryCafeIcon,
  CategoryHomeIcon,
  CategoryUnknownIcon,
  type CategoryIconProps,
} from "@/components/ui/icons/category";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category styling tokens (= TimelineSpine 同 pattern、 frozen file 不触で inline)
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
 * meal 専用 SVG icon (= fork + knife outline、 白抜き、 TimelineSpine 8b-6 同実装)
 */
function MealIcon({ className, size = 28, ariaLabel }: CategoryIconProps): ReactNode {
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
 * work 専用 Briefcase icon (= handle + body + closure、 TimelineSpine 8b-7 同実装)
 */
function BriefcaseIcon({ className, size = 28, ariaLabel }: CategoryIconProps): ReactNode {
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

const CATEGORY_ICON_COMPONENT: Record<EventCategory, ComponentType<CategoryIconProps>> = {
  cafe: CategoryCafeIcon,
  meal: MealIcon,
  work: BriefcaseIcon,
  home: CategoryHomeIcon,
  other: CategoryUnknownIcon,
};

/**
 * Location pin SVG icon (= 📍 絵文字代替、 場所表示用、 spec v3 §9 「絵文字禁止」 整合)
 */
function LocationPinIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={14}
      height={14}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={true}
    >
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type MapBottomSheetProps = {
  /** 表示対象 sheet (= null なら sheet 非表示) */
  readonly sheet: MapSheetViewModel | null;
  /** close button tap handler (= MapTab 側で selectedPinId を null に戻す) */
  readonly onClose: () => void;
};

/**
 * MapBottomSheet — 9a-impl half 固定 sheet (= spec v3 §9 4 段構造)
 *
 * 表示条件:
 *   - sheet === null → 何も render しない (= null return、 親側で条件分岐ではなく本 component で吸収)
 *   - sheet !== null → fixed bottom overlay として表示
 *
 * Layout (= half 固定):
 *   - 上: category 大 icon (= category color circle + 白抜き SVG)
 *   - 中: timeRange + title
 *   - 下: location (optional) + meaningText (optional)
 *   - 右上: close button (✕)
 *
 * a11y:
 *   - role="dialog" (= overlay として認識)
 *   - aria-modal="false" (= map 操作は維持される、 modal 化しない)
 *   - aria-label (= 「{title} の詳細」)
 *   - close button に aria-label
 */
export function MapBottomSheet({ sheet, onClose }: MapBottomSheetProps): ReactNode {
  if (!sheet) return null;

  const Icon = CATEGORY_ICON_COMPONENT[sheet.category];
  const circleBg = CATEGORY_CIRCLE_BG_CLASS[sheet.category];
  const timeColor = CATEGORY_TIME_TEXT_CLASS[sheet.category];

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`${sheet.title} の詳細`}
      data-testid="plan-map-bottom-sheet"
      className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-md rounded-t-2xl border-t border-slate-200 bg-white px-4 pb-6 pt-4 shadow-2xl"
    >
      {/* Close button (= 右上) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="詳細を閉じる"
        data-testid="plan-map-bottom-sheet-close"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 focus:outline-none focus-visible:border focus-visible:border-slate-300"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden={true}
        >
          <path d="M18 6 6 18" />
          <path d="m6 6 12 12" />
        </svg>
      </button>

      {/* Section 1: category 大 icon (= 上、 spec §9.1) */}
      <div className="mb-3 flex justify-center">
        <div
          data-testid="plan-map-bottom-sheet-icon"
          className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-sm ${circleBg}`}
        >
          <Icon className="" size={28} />
        </div>
      </div>

      {/* Section 2: timeRange (= 上中央、 category color text) */}
      <p
        data-testid="plan-map-bottom-sheet-time-range"
        className={`text-center text-sm font-medium tabular-nums ${timeColor}`}
      >
        {sheet.timeRange}
      </p>

      {/* Section 3: title (= 中央 太、 spec §9.3 「sheet 最重要」) */}
      <h3
        data-testid="plan-map-bottom-sheet-title"
        className="mt-1 text-center text-lg font-bold text-slate-900"
      >
        {sheet.title}
      </h3>

      {/* Section 4: location (= optional、 専用 SVG icon + 控えめ slate) */}
      {sheet.location && (
        <div
          data-testid="plan-map-bottom-sheet-location"
          className="mt-2 flex items-center justify-center gap-1 text-xs text-slate-500"
        >
          <LocationPinIcon className="text-slate-400" />
          <span>{sheet.location}</span>
        </div>
      )}

      {/* Section 5: meaningText (= optional、 ✨ + Alter 観測由来) */}
      {sheet.meaningText && (
        <p
          data-testid="plan-map-bottom-sheet-meaning"
          className="mt-3 text-center text-sm leading-relaxed text-slate-700"
        >
          <span aria-hidden={true} className="mr-1">✨</span>
          {sheet.meaningText}
        </p>
      )}
    </div>
  );
}
