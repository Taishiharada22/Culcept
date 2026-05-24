/**
 * Phase 3-N List impl sub-phase 5 — TransitionChip component (= first-pass)
 *
 * 設計原則 (= Spec audit §5.3 + 第 14 補正範囲制限):
 *   - 非 interactive 構造 component (= timeline 上の event 間の余白表現)
 *   - 「移動」 or 「移動・リフレッシュ」 + 時刻 range
 *   - text-xs + text-slate-400 (= subtle)
 *   - 中央寄せ、 細線で前後 event を視覚的に繋ぐ
 *
 *   - 第 11 補正 #1 UI 責務分離: TransitionChip は構造のみ、 source / authority / clonedFrom 無関係
 *   - 第 14 補正 first-pass: 構造の箱まで、 詳細 logic / animation は後続 sub-phase
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
 * TransitionChip — event 間の余白表現
 *
 * 構造:
 *   - 中央寄せ
 *   - text-xs + text-slate-400 (= subtle、 main content 邪魔しない)
 *   - 「── label · 時刻 range ──」 形式
 *   - non-interactive (= div)
 */
export function TransitionChip({ transition }: TransitionChipProps): ReactNode {
  const { fromTime, toTime, label } = transition;
  const timeRange = `${fromTime}-${toTime}`;

  return (
    <div
      className="flex items-center justify-center gap-2 text-xs text-slate-400 py-2"
      data-testid={`plan-list-transition-${fromTime}-${toTime}`}
      aria-label={`transition: ${label} ${timeRange}`}
    >
      <span aria-hidden="true">──</span>
      <span>{label}</span>
      <span aria-hidden="true">·</span>
      <span className="tabular-nums">{timeRange}</span>
      <span aria-hidden="true">──</span>
    </div>
  );
}
