/**
 * Phase 3-N List impl sub-phase 8b-6 corrective — EventCard component (= mock 整合 大幅改修)
 *
 * 8b-6 改修内容 (= CEO + GPT 合議 2026-05-24):
 *   - **左濃い border 廃止** (= border-l-4 + border-l-{color}-500 削除)
 *   - **全周 細 border** (= border + border-{color}-200、 mock 「全周を細く囲む」)
 *   - **背景 tint そのまま** (= bg-{color}-50、 既に薄い、 CEO 「もっと薄い色」 でも -50 系継続)
 *   - **左尖り 吹き出し形状** (= ::before pseudo-triangle、 card 本体の延長として spine icon 方向に向く)
 *   - **📍 emoji 廃止** (= inline SVG pin icon、 mock の洗練された pin 表現)
 *   - **location 控えめ** (= text-xs + text-slate-400、 mock の薄く扱う pattern)
 *   - **alterNote 自然な日本語** (= CategoryMeaning 8b-6 で書き直し済、 本 file は表示のみ)
 *
 * 既存維持:
 *   - main card UI hierarchy (= Spec §19.10.2、 primary/secondary/tertiary)
 *   - 第 11 補正 #1 UI 責務分離 (= origin/authority/clonedFrom 3 axis 独立)
 *   - 第 12 補正 #2 hierarchy (= accepted Alter は main card で user_owned 同等)
 *   - 規約 24-extended (= focus-visible:border-slate-300)
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §5.1 + §19.10 + §19.13
 *   - decision-log (= 8b-6 corrective 7 項目)
 *   - lib/plan/list/sourceProvenance.ts (= 2 軸 source model + helpers)
 *   - ./SourceIndicator.tsx (= origin axis 表示)
 *   - ./ExecutionLayerChip.tsx (= 軽いサイン)
 */

import { type ReactNode } from "react";
import {
  type StrictEventCardViewModel,
  isProposed,
} from "@/lib/plan/list/sourceProvenance";
import { type EventCategory } from "@/lib/plan/list/types";
import { SourceIndicator } from "./SourceIndicator";
import { ExecutionLayerChip } from "./ExecutionLayerChip";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category visual mapping (= 8b-6 corrective、 全周 border + tint + triangle)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全周 border 色 (= 8b-9 で 反転、 CEO 「囲み色濃く、 中身薄く」、 -100 → -300)
 */
const CATEGORY_BORDER_CLASS: Record<EventCategory, string> = {
  cafe: 'border-indigo-300',
  meal: 'border-orange-300',
  work: 'border-blue-300',
  home: 'border-emerald-300',
  other: 'border-slate-300',
};

/**
 * 時刻 text 色 (= category 別、 8a/8b-3 から継続)
 */
const CATEGORY_TIME_TEXT_CLASS: Record<EventCategory, string> = {
  cafe: 'text-indigo-600',
  meal: 'text-orange-600',
  work: 'text-blue-600',
  home: 'text-emerald-600',
  other: 'text-slate-600',
};

/**
 * 背景 tint (= 8b-9 でさらに薄く、 CEO 「中の色が濃すぎ」、 bg-{color}-50 → 50/30 opacity)
 */
const CATEGORY_BG_CLASS: Record<EventCategory, string> = {
  cafe: 'bg-indigo-50/30',
  meal: 'bg-orange-50/30',
  work: 'bg-blue-50/30',
  home: 'bg-emerald-50/30',
  other: 'bg-white',
};

/**
 * 左尖り triangle 内部色 (= 8b-6 追加、 card bg と同色で延長感)
 */
const CATEGORY_TRIANGLE_CLASS: Record<EventCategory, string> = {
  cafe: 'before:border-r-indigo-50',
  meal: 'before:border-r-orange-50',
  work: 'before:border-r-blue-50',
  home: 'before:border-r-emerald-50',
  other: 'before:border-r-white',
};

/**
 * 左尖り triangle 外周 border 色 (= 8b-9 で 反転、 border と同色 -300)
 */
const CATEGORY_TRIANGLE_BORDER_CLASS: Record<EventCategory, string> = {
  cafe: 'after:border-r-indigo-300',
  meal: 'after:border-r-orange-300',
  work: 'after:border-r-blue-300',
  home: 'after:border-r-emerald-300',
  other: 'after:border-r-slate-300',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// LocationPin (= 8b-6 corrective、 📍 emoji 廃止 → 洗練 outline SVG)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Location pin outline SVG (= 8b-6、 mock の細線 pin 表現整合)
 *
 * 設計: stroke="currentColor" で text-{color} に追従、 fill="none" で outline 強調
 */
function LocationPinIcon({ size = 12 }: { size?: number }): ReactNode {
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
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <path d="M12 22 s8-7.5 8-13 a8 8 0 0 0 -16 0 c0 5.5 8 13 8 13 z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EventCard component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EventCardProps = {
  readonly event: StrictEventCardViewModel;
  readonly onTap?: () => void;
};

/**
 * EventCard — main timeline 上の event 表示単位 (= 8b-6 corrective 改修版)
 *
 * UI hierarchy:
 *   - primary: title + 時刻 range + 場所 (SVG pin) + Alter 補助文 (✨)
 *   - secondary: authority 状態 (= proposed なら dashed border + chip)
 *   - tertiary: SourceIndicator (= origin、 compact) + ExecutionLayerChip
 *   - 詳細 sheet のみ: clonedFrom / imported 詳細 / acceptedAt
 *
 * 視覚仕様 (= 8b-6):
 *   - 全周細 border (= border + border-{color}-200)
 *   - 薄 tint 背景 (= bg-{color}-50)
 *   - 左尖り pseudo-triangle (= card 延長感、 spine icon 方向)
 *   - 📍 廃止 → SVG outline pin
 *   - location: text-xs + text-slate-400 (= 控えめ)
 */
export function EventCard({ event, onTap }: EventCardProps): ReactNode {
  const proposed = isProposed(event.sourceModel);

  // container class (= 8b-7 corrective: border -200 → -100、 triangle に外周 border 追加)
  //   - ::before: 中身 triangle (= card bg 同色で延長感)、 z-10 で外周より前
  //   - ::after: 外周 1px 線 (= card border 同色 -100)、 1px 外側に配置して縁取り表現
  const containerClass = [
    "relative", // for ::before / ::after triangle positioning
    "block w-full text-left",
    "rounded-2xl",
    CATEGORY_BG_CLASS[event.category],
    "border", // 全周 1px
    CATEGORY_BORDER_CLASS[event.category], // border-{color}-100 (= 8b-7 薄く)
    // 左尖り 内部 triangle (= ::before pseudo、 card 延長感)
    "before:content-[''] before:absolute before:left-[-7px] before:top-4 before:z-10",
    "before:border-y-[7px] before:border-y-transparent before:border-r-[7px]",
    CATEGORY_TRIANGLE_CLASS[event.category],
    // 左尖り 外周 border triangle (= ::after pseudo、 8b-7 「三角形も周りの太線で囲む」)
    "after:content-[''] after:absolute after:left-[-8px] after:top-[15px]",
    "after:border-y-[8px] after:border-y-transparent after:border-r-[8px]",
    CATEGORY_TRIANGLE_BORDER_CLASS[event.category],
    "shadow-sm",
    "p-4",
    "transition-colors duration-150",
    "focus:outline-none focus-visible:border-slate-300",
    "hover:shadow-md",
    proposed ? "border-dashed opacity-70" : "",
  ].filter(Boolean).join(" ");

  // 時刻 range text (= startTime - endTime、 endTime は adapter で必ず推論済)
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

      {/* PRIMARY: 場所 (= optional、 8b-6: 📍 → SVG outline pin + text-xs text-slate-400 控えめ) */}
      {event.location !== undefined && (
        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
          <LocationPinIcon size={12} />
          <span>{event.location}</span>
        </p>
      )}

      {/* PRIMARY: Alter 補助文 (= optional、 ✨ + 自然な日本語、 CategoryMeaning 8b-6 書き直し済) */}
      {event.alterNote !== undefined && (
        <p className="text-sm text-slate-600 mt-2 flex items-start gap-1">
          <span aria-hidden="true">✨</span>
          <span>{event.alterNote}</span>
        </p>
      )}

      {/* TERTIARY footer: SourceIndicator (= origin axis、 compact) + ExecutionLayerChip + SECONDARY chip (= authority) */}
      <div className="mt-3 flex items-center gap-2 text-xs">
        {/* origin axis: SourceIndicator compact (= 第 11 補正 #1 軸分離、 第 12 補正 #2 hierarchy) */}
        <SourceIndicator sourceModel={event.sourceModel} variant="compact" />

        {/* 軽いサイン: ExecutionLayerChip (= 第 8 補正 #3 first-pass、 sub-phase 6 範囲) */}
        {event.executionLayerCounts !== undefined && (
          <ExecutionLayerChip counts={event.executionLayerCounts} />
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
