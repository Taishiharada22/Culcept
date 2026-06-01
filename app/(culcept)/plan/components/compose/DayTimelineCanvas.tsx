"use client";

/**
 * DayTimelineCanvas — 予定追加 2カラム体験「左の俯瞰タイムライン」。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.4 / A-0-5
 *
 * 責務（presentational・props 駆動）:
 *   - 可視窓（既定 6:00–24:00）をシート高に圧縮した俯瞰ルーラー描画（A-2）
 *   - blocks（既存予定 read-only / 配置済み draft）を時刻位置に描画（A-2）
 *   - A-3 追加（すべて optional・後方互換）:
 *       ghost: ドラッグ中の配置プレビュー（点線・crossesMidnight は警告色）
 *       onRemoveBlock / onUnplaceBlock: 配置済み draft block の削除 / 戻す操作
 *
 * 範囲外: ドラッグ検知そのもの（container が担当）/ 保存 / PlanClient / 候補検索。
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

export interface TimelineGhost {
  startMin: number;
  endMin: number;
  /** 日跨ぎ・退化（A-0-1）。警告色で描画 */
  invalid?: boolean;
}

export interface DayTimelineCanvasProps {
  blocks: TimelineBlock[];
  /** 可視窓開始（分・既定 6:00） */
  windowStartMin?: number;
  /** 可視窓終了（分・既定 24:00） */
  windowEndMin?: number;
  /** canvas 高（px・俯瞰圧縮の基準） */
  heightPx?: number;
  /** A-3: ドラッグ中の配置プレビュー */
  ghost?: TimelineGhost | null;
  /** A-3: 配置済み draft block の削除（指定時のみ ✕ ボタン描画） */
  onRemoveBlock?: (id: string) => void;
  /** A-3: 配置済み draft block を未配置へ戻す（指定時のみ ↩ ボタン描画） */
  onUnplaceBlock?: (id: string) => void;
}

/** 俯瞰タイムラインの既定高（px）。container の drop 計算 VIEWPORT と一致させる単一ソース（UI-1）。 */
export const TIMELINE_HEIGHT_PX = 440;

const MIN_BLOCK_PX = 16;

export function DayTimelineCanvas({
  blocks,
  windowStartMin = DEFAULT_WINDOW_START_MIN,
  windowEndMin = DEFAULT_WINDOW_END_MIN,
  heightPx = TIMELINE_HEIGHT_PX,
  ghost = null,
  onRemoveBlock,
  onUnplaceBlock,
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
              <span className="w-8 shrink-0 -translate-y-1.5 text-[9px] tabular-nums text-slate-400">
                {formatMinutes(m)}
              </span>
              <span className="mt-px h-px flex-1 bg-slate-200/60" />
            </div>
          </div>
        );
      })}

      {/* ブロック層 */}
      <div className="absolute inset-y-0 left-9 right-1">
        {/* ゴースト（ドラッグ中プレビュー・A-3） */}
        {ghost && (
          <div
            data-testid="compose-ghost"
            data-invalid={ghost.invalid ? "true" : "false"}
            className={
              "absolute inset-x-0 rounded-lg border-2 border-dashed px-2 py-0.5 text-[10px] leading-tight " +
              (ghost.invalid
                ? "border-rose-300 bg-rose-50/70 text-rose-600"
                : "border-indigo-400 bg-indigo-50/70 text-indigo-600")
            }
            style={{
              top: minutesToY(ghost.startMin, vp),
              height: Math.max(
                minutesToY(ghost.endMin, vp) - minutesToY(ghost.startMin, vp),
                MIN_BLOCK_PX,
              ),
            }}
          >
            <span className="block tabular-nums">
              {formatMinutes(ghost.startMin)}–{formatMinutes(ghost.endMin)}
              {ghost.invalid ? "（日跨ぎ）" : ""}
            </span>
          </div>
        )}

        {/* 予定ブロック */}
        {blocks.map((b) => {
          const top = minutesToY(b.startMin, vp);
          const height = Math.max(minutesToY(b.endMin, vp) - top, MIN_BLOCK_PX);
          const isExisting = b.tone === "existing";
          const showControls = !isExisting && (onRemoveBlock || onUnplaceBlock);
          return (
            <div
              key={b.id}
              data-testid={`compose-block-${b.id}`}
              data-tone={b.tone}
              className={
                "group absolute inset-x-0 overflow-hidden rounded-lg border px-2 py-0.5 text-[10px] leading-tight shadow-sm " +
                (isExisting
                  ? "border-slate-200/80 bg-white/85 text-slate-500"
                  : "border-indigo-300 bg-indigo-200 text-indigo-800")
              }
              style={{ top, height }}
            >
              <span className="block truncate pr-10 font-medium">{b.label}</span>
              <span className="block tabular-nums opacity-70">
                {formatMinutes(b.startMin)}–{formatMinutes(b.endMin)}
              </span>
              {showControls && (
                <div className="absolute right-1 top-0.5 flex gap-0.5">
                  {onUnplaceBlock && (
                    <button
                      type="button"
                      data-testid={`compose-block-unplace-${b.id}`}
                      aria-label="未配置に戻す"
                      onClick={() => onUnplaceBlock(b.id)}
                      className="rounded px-1 text-[10px] text-indigo-400 hover:bg-white/60 hover:text-indigo-600"
                    >
                      ↩
                    </button>
                  )}
                  {onRemoveBlock && (
                    <button
                      type="button"
                      data-testid={`compose-block-remove-${b.id}`}
                      aria-label="削除"
                      onClick={() => onRemoveBlock(b.id)}
                      className="rounded px-1 text-[10px] text-slate-400 hover:bg-white/60 hover:text-rose-600"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
