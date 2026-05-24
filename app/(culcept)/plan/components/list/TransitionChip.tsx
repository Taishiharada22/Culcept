/**
 * Phase 3-N List impl sub-phase 5 + 8b-7 corrective — TransitionChip component
 *
 * 8b-7 corrective (= CEO + GPT mock 整合):
 *   - mock 形式に揃える: 「(移動) ----------- 時刻」
 *   - 横長 capsule chip (= rounded-full、 薄 bg)
 *   - dashed line で前後 event を視覚的に繋ぐ
 *   - 右端に時刻 range 薄く
 *
 * 設計原則 (= Spec audit §5.3 + 第 14 補正範囲制限):
 *   - 非 interactive 構造 component (= timeline 上の event 間の余白表現)
 *   - text-xs + text-slate-400 (= subtle)
 *   - 第 11 補正 #1 UI 責務分離: TransitionChip は構造のみ、 source / authority / clonedFrom 無関係
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
 * TransitionChip — event 間の余白表現 (= 8b-7 mock 整合)
 *
 * 構造:
 *   - 左: 横長 capsule で 「移動」 label (= rounded-full + bg-slate-100 + text-xs)
 *   - 中: dashed line (= flex-1、 border-dashed)
 *   - 右: 時刻 range 薄く (= text-xs + text-slate-400 + tabular-nums)
 *   - non-interactive (= div)
 */
export function TransitionChip({ transition }: TransitionChipProps): ReactNode {
  const { fromTime, toTime, label } = transition;
  const timeRange = `${fromTime}-${toTime}`;

  return (
    <div
      className="flex items-center gap-2 py-2"
      data-testid={`plan-list-transition-${fromTime}-${toTime}`}
      aria-label={`transition: ${label} ${timeRange}`}
    >
      {/* 左: capsule label */}
      <span className="rounded-full bg-slate-100 px-3 py-0.5 text-xs text-slate-500">
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
