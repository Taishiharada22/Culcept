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

import { useRef } from "react";

import {
  DEFAULT_WINDOW_START_MIN,
  DEFAULT_WINDOW_END_MIN,
  formatMinutes,
  layoutLanes,
  minutesToY,
  pxPerMin,
  snapMinutes,
  type TimelineViewport,
} from "@/lib/plan/timeline-geometry";

/** 既存ブロックのパステル配色キー（表示専用・UI-5。draft/placed は violet 固定で別扱い）。 */
export type ExistingColorKey = "sky" | "amber" | "emerald" | "teal";

export interface TimelineBlock {
  id: string;
  label: string;
  startMin: number;
  endMin: number;
  /** existing = 当日の既存予定（read-only）/ draft = 配置済みの新規 */
  tone: "existing" | "draft";
  /** existing のパステル配色（UI-5・表示専用）。未指定は neutral 白。 */
  colorKey?: ExistingColorKey;
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
  /** P4-4: 配置済み draft block の移動 / 伸縮（指定時のみドラッグ可能化） */
  onBlockReposition?: (id: string, startMin: number, endMin: number) => void;
}

const RESIZE_ZONE_PX = 8;
const DRAG_SNAP = 5;

/** 俯瞰タイムラインの既定高（px）。container の drop 計算 VIEWPORT と一致させる単一ソース（UI-1）。 */
export const TIMELINE_HEIGHT_PX = 440;

const MIN_BLOCK_PX = 16;

/** 既存ブロックのパステル配色（UI-5）。placed(draft)=violet と区別するため violet/rose は不使用。 */
const EXISTING_PALETTE: Record<ExistingColorKey | "neutral", string> = {
  sky: "border-sky-100 bg-sky-50 text-sky-700",
  amber: "border-amber-100 bg-amber-50 text-amber-700",
  emerald: "border-emerald-100 bg-emerald-50 text-emerald-700",
  teal: "border-teal-100 bg-teal-50 text-teal-700",
  neutral: "border-slate-100 bg-white text-slate-500",
};

export function DayTimelineCanvas({
  blocks,
  windowStartMin = DEFAULT_WINDOW_START_MIN,
  windowEndMin = DEFAULT_WINDOW_END_MIN,
  heightPx = TIMELINE_HEIGHT_PX,
  ghost = null,
  onRemoveBlock,
  onUnplaceBlock,
  onBlockReposition,
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

  // 重なりブロックの横分割（UI-5・表示専用。X のみ＝drop 計算に非干渉）。
  const laneMap = layoutLanes(blocks);

  // ── P4-4: placed block の移動 / 伸縮（Y のみ・drop 配置とは別経路） ──
  const ppm = pxPerMin(vp);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize-top" | "resize-bottom";
    startClientY: number;
    origStart: number;
    origEnd: number;
  } | null>(null);

  const handleBlockPointerDown = (
    b: TimelineBlock,
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!onBlockReposition || (e.target as HTMLElement).closest("button")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const offY = e.clientY - rect.top;
    const mode =
      offY < RESIZE_ZONE_PX
        ? "resize-top"
        : offY > rect.height - RESIZE_ZONE_PX
          ? "resize-bottom"
          : "move";
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    dragRef.current = {
      id: b.id,
      mode,
      startClientY: e.clientY,
      origStart: b.startMin,
      origEnd: b.endMin,
    };
  };

  const handleBlockPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const dg = dragRef.current;
    if (!dg || !onBlockReposition || ppm === 0) return;
    const deltaMin = snapMinutes((e.clientY - dg.startClientY) / ppm, DRAG_SNAP);
    if (dg.mode === "move") {
      const dur = dg.origEnd - dg.origStart;
      const ns = Math.max(0, Math.min(1439 - dur, dg.origStart + deltaMin));
      onBlockReposition(dg.id, ns, ns + dur);
    } else if (dg.mode === "resize-top") {
      const ns = Math.max(0, Math.min(dg.origEnd - 5, dg.origStart + deltaMin));
      onBlockReposition(dg.id, ns, dg.origEnd);
    } else {
      const ne = Math.max(dg.origStart + 5, Math.min(1439, dg.origEnd + deltaMin));
      onBlockReposition(dg.id, dg.origStart, ne);
    }
  };

  const endBlockDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };

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
              <span className="w-8 shrink-0 -translate-y-1.5 text-[9px] tabular-nums text-slate-300">
                {formatMinutes(m)}
              </span>
              <span className="mt-px h-px flex-1 bg-slate-200/45" />
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
                : "border-violet-400 bg-violet-50/70 text-violet-600")
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
          const repositionable = !isExisting && !!onBlockReposition;
          const toneClass = isExisting
            ? EXISTING_PALETTE[b.colorKey ?? "neutral"]
            : "border-violet-200 bg-violet-100 text-violet-700";
          // 重なり横分割（UI-5）。重なりなしは全幅。
          const slot = laneMap.get(b.id) ?? { lane: 0, lanes: 1 };
          const widthPct = 100 / slot.lanes;
          const leftPct = widthPct * slot.lane;
          return (
            <div
              key={b.id}
              data-testid={`compose-block-${b.id}`}
              data-tone={b.tone}
              data-lanes={slot.lanes}
              onPointerDown={
                repositionable ? (e) => handleBlockPointerDown(b, e) : undefined
              }
              onPointerMove={repositionable ? handleBlockPointerMove : undefined}
              onPointerUp={repositionable ? endBlockDrag : undefined}
              className={
                "group absolute overflow-hidden rounded-lg border px-2 py-0.5 text-[10px] leading-tight shadow-sm " +
                toneClass +
                (repositionable
                  ? " cursor-grab touch-none select-none active:cursor-grabbing"
                  : "")
              }
              style={{
                top,
                height,
                left: `${leftPct}%`,
                width: `calc(${widthPct}% - 2px)`,
              }}
            >
              {repositionable && (
                <>
                  <span
                    data-testid={`compose-block-resize-top-${b.id}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 flex h-2 items-start justify-center"
                  >
                    <span className="mt-px h-0.5 w-5 rounded-full bg-violet-300/70" />
                  </span>
                  <span
                    data-testid={`compose-block-resize-bottom-${b.id}`}
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 bottom-0 flex h-2 items-end justify-center"
                  >
                    <span className="mb-px h-0.5 w-5 rounded-full bg-violet-300/70" />
                  </span>
                </>
              )}
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
