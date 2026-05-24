/**
 * Phase 3-N List impl sub-phase 5 + 8b-7/8b-8 corrective — TransitionChip component
 *
 * 8b-8 corrective (= CEO + mock 整合):
 *   - mock 形式: 「(移動 capsule) ──── dashed line ──── 時刻」
 *   - 横長 subtle capsule + dashed line + 右端時刻
 *   - timeline spine 上に重なるように TimelineSpine 側で配置
 *
 * 設計原則:
 *   - 非 interactive (= div)
 *   - text-xs + text-slate-400/500 (= subtle、 main content 邪魔しない)
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
};

/**
 * TransitionChip — event 間の余白表現 (= 8b-8 mock 整合)
 *
 * 構造:
 *   - 左: capsule label (= rounded-full + bg-white + border-slate-200 + text-xs text-slate-500)
 *   - 中: dashed line (= flex-1、 border-t-dashed border-slate-300)
 *   - 右: 時刻 range (= text-xs text-slate-400 tabular-nums)
 *   - non-interactive (= div)
 */
export function TransitionChip({ transition }: TransitionChipProps): ReactNode {
  const { fromTime, toTime, label } = transition;
  const timeRange = `${fromTime}-${toTime}`;

  return (
    <div
      className="flex items-center gap-2 py-1"
      data-testid={`plan-list-transition-${fromTime}-${toTime}`}
      aria-label={`transition: ${label} ${timeRange}`}
    >
      {/* 左: capsule label (= 白背景 + 細枠 + subtle text) */}
      <span className="rounded-full bg-white border border-slate-200 px-3 py-0.5 text-xs text-slate-500">
        {label}
      </span>
      {/* 中: dashed line */}
      <span
        className="flex-1 border-t border-dashed border-slate-300"
        aria-hidden="true"
      />
      {/* 右: 時刻 range */}
      <span className="text-xs text-slate-400 tabular-nums">{timeRange}</span>
    </div>
  );
}
