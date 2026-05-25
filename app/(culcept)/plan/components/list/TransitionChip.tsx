/**
 * Phase 3-N List impl sub-phase 5 + 8b-7/8b-8/8b-9/8c-2 corrective — TransitionChip component
 *
 * 8c-2 追加 (= CEO 「詳細ボタンは従来通り入れて」):
 *   - 右端に 「詳細 ›」 button (= subtle、 onDetailTap callback)
 *   - 規約 24-extended: focus-visible:border-slate-300
 *
 * 8b-9 構造維持:
 *   - 左: capsule label (= 「移動」 等)
 *   - 中: dashed line (= 流れ表現)
 *   - 右: 時刻 range (= subtle text-slate-400)
 *   - 末尾: 詳細 button (= 8c-2 追加)
 *
 * 設計書:
 *   - Spec audit §5.3 + §19.6 + §19.12
 *   - lib/plan/list/types.ts (= TransitionViewModel)
 */

import { type ReactNode } from "react";
import { type TransitionViewModel } from "@/lib/plan/list/types";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TransitionChip component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TransitionChipProps = {
  readonly transition: TransitionViewModel;
  /**
   * 詳細 button tap handler (= 8c-2 追加、 CEO 「従来通り 詳細ボタン」)
   *
   * undefined OK = button 非表示 (= 8c-2 では callback、 実 sheet 起動は別 sub-phase)
   */
  readonly onDetailTap?: () => void;
};

/**
 * TransitionChip — event 間の余白表現 (= 8c-2 詳細 button 追加)
 *
 * 構造:
 *   - 左: capsule label (= 「移動」、 rounded-md + bg-white + border-slate-200)
 *   - 中: dashed line (= flex-1)
 *   - 右: 時刻 range (= subtle text-slate-400)
 *   - 末尾: 詳細 button (= onDetailTap 定義時のみ、 規約 24-extended)
 */
export function TransitionChip({ transition, onDetailTap }: TransitionChipProps): ReactNode {
  const { fromTime, toTime, label } = transition;
  const timeRange = `${fromTime}-${toTime}`;

  return (
    <div
      className="flex items-center gap-2"
      data-testid={`plan-list-transition-${fromTime}-${toTime}`}
      aria-label={`transition: ${label} ${timeRange}`}
    >
      {/* 左: capsule label */}
      <span className="rounded-md bg-white border border-slate-200 px-2.5 py-0.5 text-xs text-slate-500 whitespace-nowrap">
        {label}
      </span>
      {/* 中: dashed line */}
      <span
        className="flex-1 border-t border-dashed border-slate-300"
        aria-hidden="true"
      />
      {/* 右: 時刻 range */}
      <span className="text-xs text-slate-400 tabular-nums">{timeRange}</span>
      {/* 末尾: 詳細 button (= 8c-2 追加、 onDetailTap 定義時のみ) */}
      {onDetailTap !== undefined && (
        <button
          type="button"
          onClick={onDetailTap}
          data-testid={`plan-list-transition-${fromTime}-${toTime}-detail`}
          aria-label={`transition ${timeRange} 詳細`}
          className={[
            "text-xs text-indigo-500",
            "rounded-md",
            "px-2 py-0.5",
            "border border-transparent",
            "transition-colors duration-150",
            "hover:bg-slate-50",
            "focus:outline-none focus-visible:border-slate-300",
            "whitespace-nowrap",
          ].join(" ")}
        >
          詳細 ›
        </button>
      )}
    </div>
  );
}
