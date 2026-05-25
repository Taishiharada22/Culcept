/**
 * Phase 3-N List impl sub-phase 5 — EmptyDayEntry component (= first-pass、 N-3a 連携)
 *
 * 設計原則 (= Spec audit §5.5 + N-3a foundation 連携 + 第 14 補正 first-pass):
 *   - empty 日 (= anchor 0 件) で表示する entry
 *   - label: N-3a `EMPTY_DAY_ENTRY_LABEL = 'ALTER で見る ›'` を consume (= 直接 import)
 *   - default visible (= controlled visibility は parent 側)
 *   - 控えめ tone (= text-sm + text-slate-500)
 *   - user initiated (= tap で modal、 但し本 sub-phase は onTap optional)
 *
 *   - 規約 24-extended: focus-visible:border-slate-300 (= 機械保証)
 *   - 第 11 補正 #1 UI 責務分離: source / authority / clonedFrom 無関係 (= 純粋 empty surface)
 *   - 第 14 補正 first-pass: 構造の箱まで、 actual modal 起動 logic は N-3b 以降 sub-phase 7+
 *
 * N-3a 整合:
 *   - `EMPTY_DAY_ENTRY_LABEL` (= 'ALTER で見る ›') を直接 consume
 *   - `EmptyDayEntryContext` (= tab + iso) を props で受け取る
 *   - `isEmptyDay(anchors)` 判定は parent (= TimelineSpine or List) 側、 本 component は表示のみ
 *
 * 設計書:
 *   - Spec audit §5.5 + §11.5.7 + §19.6 + §19.12
 *   - lib/plan/emptyDayObservation.ts (= N-3a foundation `d55aab5f`)
 */

import { type ReactNode } from "react";
import {
  EMPTY_DAY_ENTRY_LABEL,
  type EmptyDayEntryContext,
} from "@/lib/plan/emptyDayObservation";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EmptyDayEntry component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type EmptyDayEntryProps = {
  readonly context: EmptyDayEntryContext;
  /**
   * onTap (= optional、 N-3b 以降の sub-phase で modal trigger 接続予定)
   *
   * 本 sub-phase 5 (= first-pass) では undefined OK = entry visible のみ
   */
  readonly onTap?: () => void;
};

/**
 * EmptyDayEntry — empty 日 surface に表示する entry
 *
 * 構造 (= controlled visibility は parent 側):
 *   - button (= interactive、 規約 24-extended 適用)
 *   - label: N-3a 確定 `EMPTY_DAY_ENTRY_LABEL` (= 'ALTER で見る ›')
 *   - text-sm + text-slate-500 (= 控えめ tone)
 *   - hover:bg-slate-50 (= subtle hover)
 *   - focus-visible:border-slate-300 (= 規約 24-extended)
 */
export function EmptyDayEntry({ context, onTap }: EmptyDayEntryProps): ReactNode {
  return (
    <button
      type="button"
      onClick={onTap}
      data-testid={`plan-list-empty-day-entry-${context.tab}-${context.iso}`}
      className={[
        "block w-full text-left",
        "rounded-lg",
        "p-3",
        "text-sm text-slate-500",
        "border border-transparent",
        "transition-colors duration-150",
        "hover:bg-slate-50",
        "focus:outline-none focus-visible:border-slate-300",
      ].join(" ")}
    >
      {EMPTY_DAY_ENTRY_LABEL}
    </button>
  );
}
