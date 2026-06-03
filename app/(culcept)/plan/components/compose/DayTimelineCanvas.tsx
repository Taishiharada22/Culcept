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
import {
  classifyTimelineRoles,
  type TimelineBlockRole,
} from "@/lib/plan/timeline-containment";
import {
  classifyActivityIconKey,
  type ActivityIconKey,
} from "@/lib/plan/compose/activityIcon";

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
  onRepositionActive?: (active: boolean) => void;
  /** ②-1: placed draft block の**クリック（非ドラッグ）→ 右フォーム再編集**。draft のみ対象。 */
  onBlockSelect?: (id: string) => void;
  /** ②-1: 編集中（active）の placed draft block id。ハイライト表示用。 */
  activeBlockId?: string;
  /** ②-3: active block が「既存予定のインライン編集」なら true（amber + 脈動の編集アクセント）。 */
  activeIsEditing?: boolean;
  /** ②-3: 既存(保存済)予定 block の**クリック → ボトムシート内インライン編集**（container band 含む）。 */
  onExistingSelect?: (id: string) => void;
  /**
   * UI-polish: 現在時刻（分・0–1440）。**対象日 = 今日のときのみ** container が渡す。
   * 可視窓内なら現在時刻ラインを描画。未指定 / 窓外なら描画しない（後方互換）。
   */
  nowMin?: number;
}

const RESIZE_ZONE_PX = 8;
const DRAG_SNAP = 5;
/** クリック（編集選択）と drag（移動）の閾値 px。これ未満の移動はクリック扱い。 */
const CLICK_THRESHOLD_PX = 4;

/** 俯瞰タイムラインの既定高（px）。container の drop 計算 VIEWPORT と一致させる単一ソース（UI-1）。 */
export const TIMELINE_HEIGHT_PX = 440;

const MIN_BLOCK_PX = 16;
/** 2.5D: 重なる context band を段差で重ねる左 inset（px/段）。各 rail が distinct な x に並ぶ。 */
const BAND_INSET_PX = 8;
/** 2 行（タイトル＋時刻・各 10px leading-tight + py）が収まる最小高。これ未満は時刻行を省く。 */
const TIME_LINE_MIN_PX = 30;

/**
 * カテゴリー（活動種別）配色（CEO 2026-06-03: 入れた予定の種別が1目で分かる）。
 *   - block = 前面ブロックの濃い版 / band = 背景バンドの淡い版（同カテゴリー色）。
 *   - 種別は title から classifyActivityIconKey で判定（meeting/food/fitness/travel/work/generic）。
 * ※色クラスは literal で持つ（Tailwind の content scan 対象＝この app/ ファイル内）。
 */
const CATEGORY_PALETTE: Record<ActivityIconKey, { band: string; block: string }> = {
  meeting: {
    band: "border-indigo-200 border-l-indigo-400 bg-indigo-50/70 text-indigo-700",
    block: "border-indigo-200 bg-indigo-100 text-indigo-800",
  },
  food: {
    band: "border-amber-200 border-l-amber-400 bg-amber-50/70 text-amber-700",
    block: "border-amber-200 bg-amber-100 text-amber-800",
  },
  fitness: {
    band: "border-emerald-200 border-l-emerald-400 bg-emerald-50/70 text-emerald-700",
    block: "border-emerald-200 bg-emerald-100 text-emerald-800",
  },
  travel: {
    band: "border-sky-200 border-l-sky-400 bg-sky-50/70 text-sky-700",
    block: "border-sky-200 bg-sky-100 text-sky-800",
  },
  work: {
    band: "border-violet-200 border-l-violet-400 bg-violet-50/70 text-violet-700",
    block: "border-violet-200 bg-violet-100 text-violet-800",
  },
  generic: {
    band: "border-slate-200 border-l-slate-400 bg-slate-100/70 text-slate-600",
    block: "border-slate-200 bg-slate-100 text-slate-700",
  },
};

/** title → カテゴリー配色。 */
function categoryColor(label: string): { band: string; block: string } {
  return CATEGORY_PALETTE[classifyActivityIconKey(label)];
}

export function DayTimelineCanvas({
  blocks,
  windowStartMin = DEFAULT_WINDOW_START_MIN,
  windowEndMin = DEFAULT_WINDOW_END_MIN,
  heightPx = TIMELINE_HEIGHT_PX,
  ghost = null,
  onRemoveBlock,
  onUnplaceBlock,
  onBlockReposition,
  onRepositionActive,
  onBlockSelect,
  activeBlockId,
  activeIsEditing,
  onExistingSelect,
  nowMin,
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

  // 30 分補助線（毎正時の :30。設計書 §4.3「薄い 15/30 分補助線」）。
  // 俯瞰圧縮（~12px/30分）では 30 分で十分。ラベルは付けず主線に従属させる。
  const halfHourMarks: number[] = [];
  const firstHalf = Math.ceil(windowStartMin / 30) * 30;
  for (let m = firstHalf; m < windowEndMin; m += 30) {
    if (m % 60 !== 0) halfHourMarks.push(m);
  }

  // 現在時刻ライン（対象日 = 今日のときのみ・可視窓内のみ）。
  const showNow =
    typeof nowMin === "number" && nowMin >= windowStartMin && nowMin <= windowEndMin;
  const noBlocks = blocks.length === 0;

  // ③ containment: 役割判定（context 文脈予定のみ background band 化）。pure・drop 非干渉。
  const roles = classifyTimelineRoles(blocks);
  const roleOf = (id: string): TimelineBlockRole => roles.get(id) ?? "normal";
  // 重なり横分割（UI-5・表示専用。X のみ）。**container を除外**し前景だけ lanes に通す
  // ＝部分重なりの他クラスタは不変・child 同士は前景で lane 分割（CEO 補正 / GPT 補正）。
  const laneMap = layoutLanes(blocks.filter((b) => roleOf(b.id) !== "container"));
  // 2.5D layered（GPT＋Claude）: 重なる context band 同士は段差(inset)で重ねる＝各 rail が distinct な
  // x に並び、3重以上でも「どの帯がどこまでか」が一意。X(left)のみ＝drop 非干渉（lane と同種）。
  const containerLaneMap = layoutLanes(blocks.filter((b) => roleOf(b.id) === "container"));

  // ── P4-4: placed block の移動 / 伸縮（Y のみ・drop 配置とは別経路） ──
  const ppm = pxPerMin(vp);
  const dragRef = useRef<{
    id: string;
    mode: "move" | "resize-top" | "resize-bottom";
    startClientY: number;
    origStart: number;
    origEnd: number;
    /** 閾値超えの移動が起きたか（true=drag, false のまま離せば click=編集選択）。 */
    moved: boolean;
  } | null>(null);

  const handleBlockPointerDown = (
    b: TimelineBlock,
    e: React.PointerEvent<HTMLDivElement>,
  ) => {
    // reposition も select も無ければ無反応。button（✕/↩）上は無視。
    if (
      (!onBlockReposition && !onBlockSelect) ||
      (e.target as HTMLElement).closest("button")
    )
      return;
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
      moved: false,
    };
  };

  const handleBlockPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const dg = dragRef.current;
    if (!dg) return;
    // 閾値内はまだクリック圏内（block を動かさない＝誤移動防止 + click 検出）。
    if (!dg.moved && Math.abs(e.clientY - dg.startClientY) < CLICK_THRESHOLD_PX)
      return;
    if (!dg.moved) onRepositionActive?.(true);
    dg.moved = true;
    if (!onBlockReposition || ppm === 0) return;
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
    const dg = dragRef.current;
    dragRef.current = null;
    if (dg?.moved) onRepositionActive?.(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    // 動いていない = クリック → その placed draft を右フォーム編集対象に。
    if (dg && !dg.moved) onBlockSelect?.(dg.id);
  };

  return (
    <div
      data-testid="compose-timeline"
      // 角ばった四角形（CEO 指定）。背景は白で清潔に（グラデ撤去）。時間帯の手がかりは
      // 「今より前をごく薄く dim」で機能的に（今日のみ・block 配色と競合しない）。
      className="relative w-full border border-slate-200 bg-white"
      style={{ height: heightPx }}
    >
      {/* 今より前を淡く dim（今日のみ・ごく薄い中立グレー・block の下＝読みやすさ不変） */}
      {showNow && (
        <div
          data-testid="compose-timeline-past"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 bg-slate-500/[0.06]"
          style={{ height: minutesToY(nowMin as number, vp) }}
        />
      )}
      {/* 30分補助線（薄い・ラベルなし・ブロック層に整列。設計書 §4.3） */}
      {halfHourMarks.map((m) => (
        <div
          key={`half-${m}`}
          aria-hidden="true"
          className="absolute left-9 right-1 h-px bg-slate-200/40"
          style={{ top: minutesToY(m, vp) }}
        />
      ))}

      {/* 時刻ラベル（hour-only・3h アンカー=6/9/12/15/18/21/24 を濃く semibold ＝時間の流れを追いやすく。
          :00 を省き脱クランプ＝大きくせずに視認性を上げる。右揃え + tabular-nums で整列。） */}
      {hourMarks.map((m) => {
        const y = minutesToY(m, vp);
        const hour = Math.round(m / 60);
        const isAnchor = hour % 3 === 0;
        return (
          <div key={m} className="absolute inset-x-0" style={{ top: y }}>
            <div className="flex items-start gap-1">
              <span
                data-testid={`compose-hour-${hour}`}
                className={
                  "w-8 shrink-0 -translate-y-1.5 pr-1 text-right text-[11px] tabular-nums " +
                  (isAnchor
                    ? "font-semibold text-slate-700"
                    : "font-normal text-slate-400")
                }
              >
                {hour}
              </span>
              <span
                className={
                  "mt-px h-px flex-1 " + (isAnchor ? "bg-slate-300" : "bg-slate-200")
                }
              />
            </div>
          </div>
        );
      })}

      {/* ブロック層 */}
      <div className="absolute inset-y-0 left-9 right-1">
        {/* 空状態ヒント（予定 / 配置 / ghost いずれも無いとき・ドラッグ先を明示） */}
        {noBlocks && !ghost && (
          <div
            data-testid="compose-timeline-empty"
            className="pointer-events-none absolute inset-x-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 text-center text-[11px] leading-snug text-slate-300"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
              <path d="M3.5 9.5h17M8 3v4M16 3v4" strokeLinecap="round" />
            </svg>
            <span>右で作った予定を<br />ここへドラッグ</span>
          </div>
        )}
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

        {/* ③ 背景バンド（container=文脈予定・全幅・最初に描画＝前景の背面）。
            existing=read-only click編集 / draft=click編集＋↩✕（タップ操作維持・drag/resize は #8）。 */}
        {blocks.map((b) => {
          if (roleOf(b.id) !== "container") return null;
          const top = minutesToY(b.startMin, vp);
          const height = Math.max(minutesToY(b.endMin, vp) - top, MIN_BLOCK_PX);
          // 2.5D: 重なる band を段差(inset)で重ねる＝各 rail が distinct な x（3重以上の範囲明確化）。
          const cInset = (containerLaneMap.get(b.id)?.lane ?? 0) * BAND_INSET_PX;
          const isExisting = b.tone === "existing";
          const isActive = !isExisting && b.id === activeBlockId;
          // existing → onExistingSelect / draft → onBlockSelect（どちらも click で右フォーム編集）。
          const onBandClick = isExisting
            ? onExistingSelect && (() => onExistingSelect(b.id))
            : onBlockSelect && (() => onBlockSelect(b.id));
          // draft バンドはタップ操作（↩戻す/✕削除）を維持＝退行防止（draft を編集/撤回できる）。
          const showBandControls = !isExisting && (!!onRemoveBlock || !!onUnplaceBlock);
          return (
            <div
              key={`band-${b.id}`}
              data-testid={`compose-block-${b.id}`}
              data-role="container"
              data-tone={b.tone}
              data-active={isActive ? "true" : undefined}
              onClick={onBandClick || undefined}
              className={
                // 視認性（CEO 2026-06-03）: 細い全周border（上下=範囲）＋**太い左rail（縦の軸＝下まで続く文脈の帯）**
                // ＋少し強い塗り。ただし前景 child（濃い塗り＋shadow＋ring）より弱く保つ。
                "group absolute inset-x-0 overflow-hidden rounded-md border border-l-4 px-2 py-0.5 text-[10px] leading-tight shadow-sm transition " +
                // 背景バンド＝同カテゴリー色の**淡い版**（前面より薄い＝背景でも種別が分かる）。
                categoryColor(b.label).band +
                (isActive ? " ring-2 ring-indigo-400" : "") +
                (onBandClick ? " cursor-pointer hover:brightness-95" : "")
              }
              style={{ top, height, left: cInset }}
            >
              {/* 上端に title + time を小さく固定（child より目立たない・文脈が分かる程度） */}
              <span className="flex items-baseline gap-1 pr-10">
                <span className="truncate font-medium">{b.label}</span>
                <span className="shrink-0 tabular-nums opacity-70">
                  {formatMinutes(b.startMin)}–{formatMinutes(b.endMin)}
                </span>
              </span>
              {showBandControls && (
                <div className="absolute right-1 top-0.5 flex gap-0.5">
                  {onUnplaceBlock && (
                    <button
                      type="button"
                      data-testid={`compose-block-unplace-${b.id}`}
                      aria-label="未配置に戻す"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUnplaceBlock(b.id);
                      }}
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
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveBlock(b.id);
                      }}
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

        {/* 予定ブロック（前景＝contained + normal。container は band で別描画＝skip） */}
        {blocks.map((b) => {
          if (roleOf(b.id) === "container") return null;
          const top = minutesToY(b.startMin, vp);
          const height = Math.max(minutesToY(b.endMin, vp) - top, MIN_BLOCK_PX);
          const isExisting = b.tone === "existing";
          const isActive = !isExisting && b.id === activeBlockId;
          // ②-3: 既存予定のインライン編集中（amber + 脈動）。新規 draft の active(indigo) と区別。
          const isActiveEdit = isActive && !!activeIsEditing;
          const showControls = !isExisting && (onRemoveBlock || onUnplaceBlock);
          const repositionable = !isExisting && !!onBlockReposition;
          // ②-1: クリックで編集（draft のみ）。reposition か select があれば interactive。
          const interactive = !isExisting && (repositionable || !!onBlockSelect);
          // ②-2: 既存(保存済)予定は単純クリックで編集（drag なし）。
          const existingClickable = isExisting && !!onExistingSelect;
          // 色＝カテゴリー（種別を1目で）の**濃い版**。active/編集中は ring を重ねて状態を示す。
          const catBlock = categoryColor(b.label).block;
          const toneClass = isActiveEdit
            ? // ②-3 既存予定を編集中 = amber ring（カテゴリー色の上に注意喚起）。
              catBlock + " ring-2 ring-amber-400 shadow-amber-200/60"
            : isActive
              ? // ②-1 新規 draft を編集中（active）= indigo ring。
                catBlock + " ring-2 ring-indigo-400"
              : // 既存 / placed draft = カテゴリー色（draft は ↩✕ コントロールで区別）。
                catBlock;
          // 重なり横分割（UI-5）。重なりなしは全幅。
          const slot = laneMap.get(b.id) ?? { lane: 0, lanes: 1 };
          const widthPct = 100 / slot.lanes;
          const leftPct = widthPct * slot.lane;
          return (
            <div
              key={b.id}
              data-testid={`compose-block-${b.id}`}
              data-role={roleOf(b.id) === "contained" ? "contained" : undefined}
              data-tone={b.tone}
              data-lanes={slot.lanes}
              data-active={isActive ? "true" : undefined}
              data-clickable={existingClickable ? "true" : undefined}
              onPointerDown={
                interactive ? (e) => handleBlockPointerDown(b, e) : undefined
              }
              onPointerMove={interactive ? handleBlockPointerMove : undefined}
              onPointerUp={interactive ? endBlockDrag : undefined}
              onClick={
                existingClickable ? () => onExistingSelect?.(b.id) : undefined
              }
              className={
                "group absolute overflow-hidden rounded-lg border px-2 py-0.5 text-[10px] leading-tight shadow-sm " +
                toneClass +
                (interactive
                  ? repositionable
                    ? " cursor-grab touch-none select-none active:cursor-grabbing"
                    : " cursor-pointer touch-none select-none"
                  : existingClickable
                    ? " cursor-pointer transition hover:brightness-95"
                    : "")
              }
              style={{
                top,
                height,
                left: `${leftPct}%`,
                width: `calc(${widthPct}% - 2px)`,
              }}
            >
              {/* ②-3: 既存編集中の脈動リング（ゆっくり明滅＝いま編集中の生きた焦点・操作非干渉）。 */}
              {isActiveEdit && (
                <span
                  data-testid="compose-block-editing-pulse"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 animate-pulse rounded-lg ring-2 ring-amber-400"
                />
              )}
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
              {/* CEO①: 予定（タイトル）と 何時〜何時 を常に表示。高さで 2 行 / 1 行を切替え clip 回避。 */}
              {height >= TIME_LINE_MIN_PX ? (
                <>
                  <span className="block truncate pr-10 font-medium">
                    {b.label}
                  </span>
                  <span className="block tabular-nums opacity-70">
                    {formatMinutes(b.startMin)}–{formatMinutes(b.endMin)}
                  </span>
                </>
              ) : (
                <span className="flex items-baseline gap-1 pr-8">
                  <span className="truncate font-medium">{b.label}</span>
                  <span className="shrink-0 tabular-nums opacity-70">
                    {formatMinutes(b.startMin)}–{formatMinutes(b.endMin)}
                  </span>
                </span>
              )}
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

      {/* 現在時刻ライン（対象日=今日のみ・最前面・pointer 透過・hour 線に整列） */}
      {showNow && (
        <div
          data-testid="compose-timeline-now"
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-10"
          style={{ top: minutesToY(nowMin as number, vp) }}
        >
          <div className="flex -translate-y-1/2 items-center gap-1">
            <span className="w-8 shrink-0 pr-0.5 text-right text-[9px] font-bold leading-none text-rose-500">
              今
            </span>
            <span className="relative h-px flex-1 bg-rose-400/80">
              <span className="absolute -left-1 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-rose-500 shadow-sm shadow-rose-300" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
