"use client";

/**
 * DayTimelineCanvas — 予定追加 2カラム体験「左の俯瞰タイムライン」（A-2・静的描画のみ）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.4 / A-0-5
 *
 * 責務（A-2 = presentational・props 駆動）:
 *   - 可視窓（既定 6:00–24:00）をシート高に圧縮した俯瞰ルーラー描画
 *   - blocks（既存予定 read-only / 配置済み draft）を時刻位置に静的描画
 *
 * 範囲外（A-2 で触れない）:
 *   - ドラッグ / ドロップ / 吸着（A-3）
 *   - 状態保持（useReducer は A-3 の container が持つ）
 *   - 保存 / PlanClient / flag / 候補検索
 */

import {
  DEFAULT_WINDOW_START_MIN,
  DEFAULT_WINDOW_END_MIN,
  formatMinutes,
  minutesToY,
  type TimelineViewport,
} from "@/lib/plan/timeline-geometry";

export interface TimelineBlock {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  /** existing = 当日の既存予定（read-only）/ draft = 配置済みの新規 */
  tone: "existing" | "draft";
}

export interface DayTimelineCanvasProps {
  blocks: TimelineBlock[];
  /** 可視窓開始（分・既定 6:00） */
  windowStartMin?: number;
  /** 可視窓終了（分・既定 24:00） */
  windowEndMin?: number;
  /** canvas 高（px・俯瞰圧縮の基準） */
  heightPx?: number;
}

const MIN_BLOCK_PX = 18;

export function DayTimelineCanvas({
  blocks,
  windowStartMin = DEFAULT_WINDOW_START_MIN,
  windowEndMin = DEFAULT_WINDOW_END_MIN,
  heightPx = 560,
}: DayTimelineCanvasProps) {
  const vp: TimelineViewport = {
    startMin: windowStartMin,
    endMin: windowEndMin,
    heightPx,
  };

  // 1 時間主線（可視窓内の毎正時）。A-0-5: 俯瞰＝窓全体が高さに収まる。
  const hourMarks: number[] = [];
  const firstHour = Math.ceil(windowStartMin / 60) * 60;
  for (let m = firstHour; m <= windowEndMin; m += 60) hourMarks.push(m);

  return (
    <div
      data-testid="compose-timeline"
      className="relative w-full rounded-xl border border-slate-200 bg-slate-50/60"
      style={{ height: heightPx }}
    >
      {/* 時刻主線 + ラベル */}
      {hourMarks.map((m) => {
        const y = minutesToY(m, vp);
        return (
          <div key={m} className="absolute inset-x-0" style={{ top: y }}>
            <div className="flex items-start gap-1">
              <span className="w-10 shrink-0 -translate-y-1.5 text-[10px] tabular-nums text-slate-400">
                {formatMinutes(m)}
              </span>
              <span className="mt-px h-px flex-1 bg-slate-200/70" />
            </div>
          </div>
        );
      })}

      {/* 予定ブロック（静的描画） */}
      <div className="absolute inset-y-0 left-11 right-1">
        {blocks.map((b) => {
          const top = minutesToY(b.startMin, vp);
          const rawH = minutesToY(b.endMin, vp) - top;
          const height = Math.max(rawH, MIN_BLOCK_PX);
          const isExisting = b.tone === "existing";
          return (
            <div
              key={b.id}
              data-testid={`compose-block-${b.id}`}
              data-tone={b.tone}
              className={
                "absolute inset-x-0 overflow-hidden rounded-md border px-2 py-0.5 text-[11px] leading-tight " +
                (isExisting
                  ? "border-slate-200 bg-white/80 text-slate-500"
                  : "border-indigo-300 bg-indigo-50 text-indigo-700")
              }
              style={{ top, height }}
            >
              <span className="block truncate font-medium">{b.label}</span>
              <span className="block tabular-nums opacity-70">
                {formatMinutes(b.startMin)}–{formatMinutes(b.endMin)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
