"use client";

/**
 * ComposeCard — 右パネルで作った予定カード（A-2・表示のみ）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.1 / §1.2
 *
 * 責務（A-2 = presentational）:
 *   - draft の title / 場所 / 時間条件ラベルを表示
 *   - ドラッグ可能に見えるハンドル（視覚のみ。実ドラッグは A-3）
 *
 * 範囲外（A-2）: 実ドラッグ / 削除・戻す操作 / 配置（A-3）。
 */

import { formatMinutes } from "@/lib/plan/timeline-geometry";
import type { ComposeDraftState } from "@/lib/plan/compose/composeDraft";
import type { ComposeTimeConstraint } from "@/lib/plan/compose/composeTimeResolver";

export interface ComposeCardProps {
  draft: ComposeDraftState;
}

function timeLabel(time: ComposeTimeConstraint): string {
  const s = time.startMin != null ? formatMinutes(time.startMin) : null;
  const e = time.endMin != null ? formatMinutes(time.endMin) : null;
  switch (time.mode) {
    case "both":
      return s && e ? `${s}–${e}` : "時間未定";
    case "start":
      return s ? `${s}〜` : "時間未定";
    case "end":
      return e ? `〜${e}` : "時間未定";
    case "none":
    default:
      return "時間未定";
  }
}

export function ComposeCard({ draft }: ComposeCardProps) {
  const placed = draft.placement.status === "placed";
  return (
    <div
      data-testid="compose-card"
      data-draft-id={draft.id}
      data-placed={placed ? "true" : "false"}
      className="flex items-start gap-2.5 rounded-2xl border border-violet-100 bg-violet-50 p-3 shadow-md shadow-violet-500/10"
    >
      {/* ドラッグハンドル（視覚のみ・A-3 で実装） */}
      <span
        aria-hidden="true"
        className="mt-0.5 select-none text-violet-300"
        data-testid="compose-card-handle"
      >
        ⠿
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {draft.core.title || "（無題）"}
        </p>
        {draft.core.locationText && (
          <p className="truncate text-xs text-slate-500">
            {draft.core.locationText}
          </p>
        )}
        <p className="mt-0.5 text-[11px] tabular-nums text-violet-600">
          {timeLabel(draft.time)}
        </p>
      </div>
    </div>
  );
}
