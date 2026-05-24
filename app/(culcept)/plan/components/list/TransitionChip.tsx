/**
 * Phase 3-N List impl sub-phase 5 + 8b-7/8b-8/8b-9 corrective — TransitionChip component
 *
 * 8b-9 corrective (= CEO + GPT 詳細要件):
 *   - **「移動」 pill を 予定 card の左端に揃える** (= TimelineSpine の content column 内で render)
 *   - pill 大きく (= text-xs → text-sm、 padding 増)
 *   - 中立 gray、 上品で細い
 *   - card title より明確に弱い
 *   - 右端時刻は subtle text
 *
 * 設計原則:
 *   - 非 interactive (= div)
 *   - text-sm + text-slate-500 (= mock 整合)
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
 * TransitionChip — event 間の余白表現 (= 8b-9 mock 整合 + card 左端揃え)
 *
 * 構造:
 *   - 左: capsule label (= rounded-full + bg-white + border-slate-200 + text-sm text-slate-500)
 *   - 中: dashed line (= flex-1、 border-t-dashed border-slate-300)
 *   - 右: 時刻 range 薄く (= text-xs text-slate-400 tabular-nums)
 *   - non-interactive (= div)
 *
 * TimelineSpine 内で右 column に配置されるため、 card と同 left edge に並ぶ
 */
export function TransitionChip({ transition }: TransitionChipProps): ReactNode {
  const { fromTime, toTime, label } = transition;
  const timeRange = `${fromTime}-${toTime}`;

  return (
    <div
      className="flex items-center gap-2"
      data-testid={`plan-list-transition-${fromTime}-${toTime}`}
      aria-label={`transition: ${label} ${timeRange}`}
    >
      {/* 左: 8b-11 で 小さく + 横長 (= text-xs + px-2.5 py-0.5 + rounded-md 角度抑え) */}
      <span className="rounded-md bg-white border border-slate-200 px-2.5 py-0.5 text-[10px] text-slate-500 whitespace-nowrap">
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
