/**
 * Phase 3-N List impl sub-phase 6 — EventCard component (= SourceIndicator + ExecutionLayerChip 統合反映)
 *
 * 設計原則 (= Spec audit §5.1 + 第 11+12+14+15 補正反映):
 *   - main card UI hierarchy (= Spec §19.10.2):
 *     - primary: title + 時刻 + 場所 + Alter 補助文 (= content axis)
 *     - secondary: proposed dashed border + opacity 0.7 + 「受け入れる」 chip (= authority axis)
 *     - tertiary: SourceIndicator (= origin axis、 compact) + ExecutionLayerChip (= 軽いサイン)
 *     - **詳細 sheet のみ**: clonedFrom / imported 詳細 / acceptedAt (= 第 12 補正 #2、 main card 非表示)
 *
 *   - 第 11 補正 #1 UI 責務分離: origin / authority / clonedFrom を **3 axis 独立**で扱う
 *   - 第 12 補正 #2 hierarchy: accepted Alter generated は main card で user_owned 同等 (= dot 消滅)
 *   - 第 14 補正 first-pass: SourceIndicator + ExecutionLayerChip は **component 統合のみ**
 *     (= 詳細 sheet 起動 logic / 学習ループ本実装は sub-phase 7+)
 *   - 第 15 補正範囲制限: 既存 wave 1/2/3/3a frozen file 不触、 新 component 追加 + 本 file refactor のみ
 *
 *   - 規約 24-extended (= focus surface): focus-visible:border-slate-300
 *   - 自然な日本語維持 (= 第 2 補正、 命令形 / 評価 / push 系単語狩り禁止)
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §5.1 + §19.10 + §19.13
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
// Category visual mapping (= Spec §8.2 color tokens、 sub-phase 6 inline、 sub-phase 10 で extract)
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

/**
 * Semantic tint (= 8b-3 追加、 CEO + GPT 合議 2026-05-24):
 *   - 各 category に薄い背景色を付与 (= mock 整合、 「白い箱」 感の解消)
 *   - 上品な低彩度 (= -50 系)、 ノイズにならない最小限の温度感
 *   - 'other' は default 白 (= bg-white、 中立)
 *
 * 第 12 補正 #2 hierarchy との整合:
 *   - tint は origin axis ではなく content axis (= category 認識補助)
 *   - SourceIndicator (= origin 表示) と並立、 干渉なし
 */
const CATEGORY_BG_CLASS: Record<EventCategory, string> = {
  cafe: 'bg-indigo-50',
  meal: 'bg-orange-50',
  work: 'bg-blue-50',
  home: 'bg-emerald-50',
  other: 'bg-white',
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
 *   - tertiary: SourceIndicator (= origin、 compact) + ExecutionLayerChip
 *   - 詳細 sheet のみ: clonedFrom / imported 詳細 / acceptedAt
 */
export function EventCard({ event, onTap }: EventCardProps): ReactNode {
  const proposed = isProposed(event.sourceModel);

  // container class (= 8b-3 で semantic tint 追加、 white → category 別薄背景)
  const containerClass = [
    "block w-full text-left",
    "rounded-2xl",
    CATEGORY_BG_CLASS[event.category],
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
