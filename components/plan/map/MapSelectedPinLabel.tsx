"use client";

/**
 * Phase 3-N Map impl sub-phase 9b-1 — MapSelectedPinLabel (= 選択 pin 用 HTML overlay)
 *
 * 設計原則 (= CEO + GPT 補正受領、 9a-impl carry 1 件):
 *   - **HTML overlay** (= SVG 内 embed ではない、 sheet open 時 Y を clamp 可能)
 *   - **Y clamp**: map 上部 fixed (= sheet が下から出ても **常に sheet 上端より上の可読領域**)
 *   - **selected 時のみ表示** (= sheet null なら null return)
 *   - **時刻 + title の白カードラベル** (= mock 整合、 spec v3 §4 label policy)
 *   - **pointer-events-none** (= map 操作邪魔しない、 ラベルは表示のみ)
 *   - **auto-pan は実装しない** (= CEO 補正、 fallback として 9b-1 corrective or 9b-1b で検討)
 *
 * 配置:
 *   - map div 内 absolute top-3 inset-x-* 中央寄せ (= 横方向中央、 top 固定)
 *   - z-20 (= DayItemsPanel z-10 / current location z-10 より前、 sheet z-50 より後)
 *
 * 規約:
 *   - 規約 24-extended (= focus-visible 不要 = pointer-events-none + non-interactive)
 *   - 絵文字 0 (= 純 text)
 *   - 中立文体
 *
 * 設計書:
 *   - docs/alter-plan-map-redesign-9b-readiness.md (= 9b-1 carry 範囲)
 *   - docs/alter-plan-map-redesign-spec-audit.md v3 §4 (= label policy)
 *   - lib/plan/map/types.ts (= MapSheetViewModel 再利用)
 */

import { type ReactNode } from "react";

import type { MapSheetViewModel } from "@/lib/plan/map/types";
import type { EventCategory } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Category color tokens (= MapBottomSheet 同 pattern、 frozen file 不触で inline)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const CATEGORY_TIME_TEXT_CLASS: Record<EventCategory, string> = {
  cafe: 'text-indigo-600',
  meal: 'text-orange-600',
  work: 'text-blue-600',
  home: 'text-emerald-600',
  other: 'text-slate-600',
};

const CATEGORY_BORDER_CLASS: Record<EventCategory, string> = {
  cafe: 'border-indigo-200',
  meal: 'border-orange-200',
  work: 'border-blue-200',
  home: 'border-emerald-200',
  other: 'border-slate-200',
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type MapSelectedPinLabelProps = {
  /** 選択 pin の sheet view model (= null なら overlay 非表示) */
  readonly sheet: MapSheetViewModel | null;
};

/**
 * MapSelectedPinLabel — selected pin の title + 時刻 を白カードで overlay 表示 (= 9b-1 carry)
 *
 * 表示条件:
 *   - sheet === null → null return (= 何も描画しない)
 *   - sheet !== null → map 上部に絶対配置 (= sheet 不干渉)
 *
 * Layout:
 *   - absolute top-3 left-1/2 + translate-x で中央寄せ
 *   - 白カード + category 色 border (= sheet ↔ pin visual 結びつき強化)
 *   - 上段: time (= category 色 text)
 *   - 下段: title (= 黒太、 truncate)
 *
 * a11y:
 *   - role="status" (= 動的更新通知)
 *   - aria-label (= 「選択中: {title}」)
 *   - pointer-events-none (= 操作不可、 表示専用)
 */
export function MapSelectedPinLabel({ sheet }: MapSelectedPinLabelProps): ReactNode {
  if (!sheet) return null;

  const timeColor = CATEGORY_TIME_TEXT_CLASS[sheet.category];
  const borderColor = CATEGORY_BORDER_CLASS[sheet.category];

  return (
    <div
      role="status"
      aria-label={`選択中: ${sheet.title}`}
      data-testid="plan-map-selected-pin-label"
      className={`pointer-events-none absolute left-1/2 top-3 z-20 max-w-[220px] -translate-x-1/2 rounded-xl border bg-white px-3 py-1.5 shadow-lg ${borderColor}`}
    >
      <p
        data-testid="plan-map-selected-pin-label-time"
        className={`text-center text-xs font-semibold tabular-nums ${timeColor}`}
      >
        {sheet.timeRange}
      </p>
      <p
        data-testid="plan-map-selected-pin-label-title"
        className="truncate text-center text-sm font-bold text-slate-900"
      >
        {sheet.title}
      </p>
    </div>
  );
}
