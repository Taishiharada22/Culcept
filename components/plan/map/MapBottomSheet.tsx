"use client";

/**
 * Phase 3-N Map impl sub-phase 9a-impl Step β — MapBottomSheet 再設計
 *
 * Step β 設計原則 (= CEO + GPT 合議 「再構成」 承認 + mock 整合):
 *   - **bottom sheet = 主戦場** (= floating card ではない、 画面下 32-40% 占有)
 *   - **handle 表示** (= 上端中央 pill、 drag UI 視覚化、 drag 機能は 9b 以降)
 *   - **8 段構造** (mock 整合):
 *       1. handle
 *       2. row1: 大カテゴリ icon (左) + time/title (中央) + image slot (右)
 *       3. row2: location row (= LocationPinIcon + 住所)
 *       4. row3: meaning box (= tint 背景 + SparkleIcon + meaningText)
 *       5. row4: CTA 2 つ (= 「詳細を見る」 secondary / 「ここへの経路」 primary)
 *   - **image slot 規約 β** (= CEO Q1 採用): truthful image なしの時は
 *       - 淡いカテゴリ背景 (= CATEGORY_PLACEHOLDER_BG)
 *       - 控えめなカテゴリ glyph (= CATEGORY_ICON_LIGHT 色)
 *       - 「画像なし」 文字なし
 *   - **CTA 規約 B** (= CEO Q2 採用):
 *       - 「詳細を見る」 → onOpenDetail (= 既存 AnchorDetailModal)
 *       - 「ここへの経路」 → routeUrl 外部遷移 (= Google Maps dir URL)、 null なら disabled
 *   - **safe-area-inset-bottom 対応** (= iPhone notch、 sheet 物理的に「下に居座る」)
 *   - **規約 24-extended**: focus-visible:border-slate-300
 *   - **中立文体**: 命令形 / 評価形容詞なし、 機能ラベルのみ
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-spec-audit.md v3 §9
 *   - docs/alter-plan-map-redesign-impl-readiness.md v2
 *   - lib/plan/map/types.ts (= MapSheetViewModel)
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
// Category styling tokens (= TimelineSpine 同 pattern + Step β image slot 追加)
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
 * Step β: image slot placeholder 背景 (= 淡い category tint、 truthful image なし時の埋め)
 */
const CATEGORY_PLACEHOLDER_BG_CLASS: Record<EventCategory, string> = {
  cafe: 'bg-indigo-50',
  meal: 'bg-orange-50',
  work: 'bg-blue-50',
  home: 'bg-emerald-50',
  other: 'bg-slate-50',
};

/**
 * Step β: image slot placeholder glyph 色 (= 控えめ、 主張しない)
 */
const CATEGORY_PLACEHOLDER_GLYPH_CLASS: Record<EventCategory, string> = {
  cafe: 'text-indigo-300',
  meal: 'text-orange-300',
  work: 'text-blue-300',
  home: 'text-emerald-300',
  other: 'text-slate-300',
};

/**
 * Step β: meaning box tint 背景 (= sheet 内 meaning 強調用、 mock 整合)
 */
const CATEGORY_MEANING_BG_CLASS: Record<EventCategory, string> = {
  cafe: 'bg-indigo-50/60',
  meal: 'bg-orange-50/60',
  work: 'bg-blue-50/60',
  home: 'bg-emerald-50/60',
  other: 'bg-slate-50/60',
};

const CATEGORY_MEANING_ICON_CLASS: Record<EventCategory, string> = {
  cafe: 'text-indigo-500',
  meal: 'text-orange-500',
  work: 'text-blue-500',
  home: 'text-emerald-500',
  other: 'text-slate-500',
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

/**
 * Step β: Sparkle SVG icon (= ✨ 絵文字代替、 meaning marker 用、 line-art)
 */
function SparkleIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={true}
    >
      <path d="M12 3 L13.5 9 L19.5 10.5 L13.5 12 L12 18 L10.5 12 L4.5 10.5 L10.5 9 Z" />
      <path d="M19 3 L19.7 5 L21.5 5.7 L19.7 6.4 L19 8.4 L18.3 6.4 L16.5 5.7 L18.3 5 Z" />
    </svg>
  );
}

/**
 * Step β: Compass / route SVG icon (= 「ここへの経路」 button 用、 path arrow)
 */
function RouteArrowIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={true}
    >
      <path d="M3 11 L21 3 L13 21 L11 13 Z" />
    </svg>
  );
}

/**
 * Step β: Document SVG icon (= 「詳細を見る」 button 用)
 */
function DocumentIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden={true}
    >
      <path d="M14 2 H6 a2 2 0 0 0 -2 2 v16 a2 2 0 0 0 2 2 h12 a2 2 0 0 0 2 -2 V8 Z" />
      <path d="M14 2 v6 h6" />
      <path d="M8 13 h8" />
      <path d="M8 17 h6" />
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
  /**
   * Step β: 「詳細を見る」 button tap handler (= CEO Q2 採用 B)
   *   - 既存 AnchorDetailModal を起動 (= MapTab 側で onAnchorClick 経由 wrap)
   *   - undefined なら button hidden (= a11y、 hover 等で「機能ない」 と分かる構造)
   */
  readonly onOpenDetail?: () => void;
  /**
   * Step β: 「ここへの経路」 用 URL (= CEO Q2 採用 B)
   *   - Google Maps dir URL: `https://www.google.com/maps/dir/?api=1&destination=lat,lng`
   *   - null なら button disabled (= lat/lng 不在時)
   */
  readonly routeUrl?: string | null;
};

/**
 * MapBottomSheet — Step β 主戦場 sheet (= mock 整合、 8 段構造)
 *
 * Layout:
 *   - handle (= 上端中央 pill)
 *   - close button (= ✕ 右上)
 *   - row 1: 大 icon (左) + time/title (中央 flex-1) + image slot (右)
 *   - row 2: location (= optional、 LocationPinIcon + 住所)
 *   - row 3: meaning box (= optional、 tint 背景 + SparkleIcon + meaningText)
 *   - row 4: CTA 2 つ (= 詳細を見る + ここへの経路)
 *
 * a11y:
 *   - role="dialog" / aria-modal="false" / aria-label
 *   - close + CTA に aria-label / aria-disabled
 *
 * 規約:
 *   - imageUrl 常に undefined (= 9a-pre adapter)、 placeholder で埋める
 *   - 絵文字 0 (= 全 SVG icon)
 *   - 中立文体
 */
export function MapBottomSheet({
  sheet,
  onClose,
  onOpenDetail,
  routeUrl,
}: MapBottomSheetProps): ReactNode {
  if (!sheet) return null;

  const Icon = CATEGORY_ICON_COMPONENT[sheet.category];
  const circleBg = CATEGORY_CIRCLE_BG_CLASS[sheet.category];
  const timeColor = CATEGORY_TIME_TEXT_CLASS[sheet.category];
  const placeholderBg = CATEGORY_PLACEHOLDER_BG_CLASS[sheet.category];
  const placeholderGlyph = CATEGORY_PLACEHOLDER_GLYPH_CLASS[sheet.category];
  const meaningBg = CATEGORY_MEANING_BG_CLASS[sheet.category];
  const meaningIcon = CATEGORY_MEANING_ICON_CLASS[sheet.category];

  const hasRoute = !!routeUrl;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`${sheet.title} の詳細`}
      data-testid="plan-map-bottom-sheet"
      className="fixed bottom-0 left-0 right-0 z-50 mx-auto max-w-2xl rounded-t-3xl border-t border-slate-200 bg-white shadow-2xl"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      {/* Handle (= 上端中央 pill、 Step β 視覚化、 drag は 9b) */}
      <div className="flex justify-center pt-3 pb-1">
        <div
          data-testid="plan-map-bottom-sheet-handle"
          className="h-1 w-12 rounded-full bg-slate-300"
          aria-hidden={true}
        />
      </div>

      {/* Close button (= 右上) */}
      <button
        type="button"
        onClick={onClose}
        aria-label="詳細を閉じる"
        data-testid="plan-map-bottom-sheet-close"
        className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 focus:outline-none focus-visible:border focus-visible:border-slate-300"
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

      {/* Row 1: 大 icon + time/title + image slot */}
      <div
        data-testid="plan-map-bottom-sheet-row1"
        className="flex items-start gap-4 px-5 pt-2"
      >
        {/* 大 icon (= 左、 h-16 w-16) */}
        <div
          data-testid="plan-map-bottom-sheet-icon"
          className={`flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-sm ${circleBg}`}
        >
          <Icon className="" size={32} />
        </div>

        {/* time + title (= 中央 flex-1) */}
        <div className="flex-1 min-w-0">
          <p
            data-testid="plan-map-bottom-sheet-time-range"
            className={`text-sm font-medium tabular-nums ${timeColor}`}
          >
            {sheet.timeRange}
          </p>
          <h3
            data-testid="plan-map-bottom-sheet-title"
            className="mt-0.5 text-lg font-bold leading-tight text-slate-900"
          >
            {sheet.title}
          </h3>
        </div>

        {/* image slot (= 右、 truthful あれば img / なければ placeholder β) */}
        <div
          data-testid="plan-map-bottom-sheet-image-slot"
          className={`flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl ${placeholderBg}`}
        >
          {sheet.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={sheet.imageUrl}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <Icon className={placeholderGlyph} size={28} />
          )}
        </div>
      </div>

      {/* Row 2: location (= optional) */}
      {sheet.location && (
        <div
          data-testid="plan-map-bottom-sheet-location"
          className="mt-3 flex items-center gap-1.5 px-5 text-xs text-slate-500"
        >
          <LocationPinIcon className="flex-shrink-0 text-slate-400" />
          <span className="truncate">{sheet.location}</span>
        </div>
      )}

      {/* Row 3: meaning box (= optional、 tint 背景 + SparkleIcon) */}
      {sheet.meaningText && (
        <div
          data-testid="plan-map-bottom-sheet-meaning"
          className={`mx-5 mt-3 flex items-start gap-2 rounded-xl px-3 py-2.5 ${meaningBg}`}
        >
          <SparkleIcon className={`mt-0.5 flex-shrink-0 ${meaningIcon}`} />
          <p className="text-sm leading-relaxed text-slate-700">
            {sheet.meaningText}
          </p>
        </div>
      )}

      {/* Row 4: CTA 2 つ (= 詳細を見る secondary + ここへの経路 primary) */}
      <div
        data-testid="plan-map-bottom-sheet-cta-row"
        className="mt-4 flex gap-3 px-5 pb-5"
      >
        {/* 詳細を見る (= secondary) */}
        <button
          type="button"
          onClick={onOpenDetail}
          disabled={!onOpenDetail}
          aria-label="この予定の詳細を見る"
          data-testid="plan-map-bottom-sheet-detail-cta"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus-visible:border-slate-400"
        >
          <DocumentIcon className="text-slate-500" />
          <span>詳細を見る</span>
        </button>

        {/* ここへの経路 (= primary、 routeUrl 外部遷移、 null なら disabled) */}
        {hasRoute ? (
          <a
            href={routeUrl ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="この場所への経路を Google Maps で開く"
            data-testid="plan-map-bottom-sheet-route-cta"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-indigo-500 py-3 text-sm font-medium text-white transition hover:bg-indigo-600 focus:outline-none focus-visible:border focus-visible:border-slate-300"
          >
            <RouteArrowIcon className="text-white" />
            <span>ここへの経路</span>
          </a>
        ) : (
          <button
            type="button"
            disabled
            aria-label="経路を開けません (場所が未解決)"
            data-testid="plan-map-bottom-sheet-route-cta"
            className="flex flex-1 cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-slate-200 py-3 text-sm font-medium text-slate-400"
          >
            <RouteArrowIcon className="text-slate-400" />
            <span>ここへの経路</span>
          </button>
        )}
      </div>
    </div>
  );
}
