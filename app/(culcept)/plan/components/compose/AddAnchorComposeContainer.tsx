"use client";

/**
 * AddAnchorComposeContainer — 予定追加 2カラム体験の状態 container（A-3）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.2 / A-0-2 / A-0-3 / A-0-4
 *
 * 責務（A-3）:
 *   - useReducer(composeReducer) を保持し、presentational な AddAnchorComposeSheet に props 供給
 *   - activeDraft 管理 / 決定論でない id は ref counter で採番（client のみ）
 *   - ComposeCard のドラッグ → DayTimelineCanvas ドロップ → A-1 resolver で 4 ケース配置
 *   - ドラッグ中の ghost プレビュー / placed の削除・戻す
 *   - ローカル日付切替時の未保存確認ダイアログ骨格（実保存・再取得は A-4）
 *
 * 範囲外（A-3・後続 stop gate）:
 *   - 保存（createAnchorBundle）/ PlanClient 統合 / flag 分岐（A-4）
 *   - 対象日の既存予定再取得（A-4・PlanClient 依存）/ 候補検索（A-4）/ Phase B/C
 */

import { useEffect, useReducer, useRef, useState } from "react";
import { motion, type PanInfo } from "framer-motion";

import {
  type ComposeDraftCore,
  type ComposeDraftState,
  type ComposeState,
  composeReducer,
  emptyDraftCore,
  hasUnsavedPlaced,
} from "@/lib/plan/compose/composeDraft";
import {
  type ComposeTimeConstraint,
  resolvePlacement,
  visualBlock,
} from "@/lib/plan/compose/composeTimeResolver";
import { planComposeSave } from "@/lib/plan/compose/composeToAnchorInput";
import type { LocationUsage } from "@/lib/plan/compose/locationHistory";
import { createAnchorBundle } from "@/lib/plan/anchor-fetch";
import {
  DEFAULT_WINDOW_START_MIN,
  DEFAULT_WINDOW_END_MIN,
  snappedMinAtY,
  type TimelineViewport,
} from "@/lib/plan/timeline-geometry";

import { AddAnchorComposeSheet } from "./AddAnchorComposeSheet";
import { ComposeCard } from "./ComposeCard";
import { DateChangeConfirmDialog } from "./DateChangeConfirmDialog";
import {
  TIMELINE_HEIGHT_PX,
  type TimelineBlock,
  type TimelineGhost,
} from "./DayTimelineCanvas";

// 俯瞰ビューポート（DayTimelineCanvas の既定高と一致させる＝drop 計算と描画の整合）。
const VIEWPORT: TimelineViewport = {
  startMin: DEFAULT_WINDOW_START_MIN,
  endMin: DEFAULT_WINDOW_END_MIN,
  heightPx: TIMELINE_HEIGHT_PX,
};
const DROP_SNAP_GRID = 5;

export interface AddAnchorComposeContainerProps {
  isOpen: boolean;
  onClose: () => void;
  dateLabel: string;
  existingBlocks: TimelineBlock[];
  /** A-4 で対象日の再取得に接続。A-3 は gate のみ */
  /** 保存対象日（YYYY-MM-DD）。A-4b 保存で one_off date に使う */
  dateISO: string;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  /** 保存成功後（PlanClient: load() + close） */
  onSaved?: () => void;
  /** ④ Phase 1a: 場所利用ログ（PlanClient が全 anchor から抽出・任意）。panel が title 連動で集計 */
  locationUsages?: LocationUsage[];
  // ── テスト / 将来の prefill 用（optional） ──
  initialState?: ComposeState;
  initialActiveId?: string;
  initialNextId?: number;
}

function blankDraft(id: string): ComposeDraftState {
  return {
    id,
    core: emptyDraftCore(),
    // 開始/終了は空白なし＝既定 09:00–10:00（カードとホイールを整合）。間隔のみ空白可。
    time: { mode: "both", startMin: 9 * 60, endMin: 10 * 60 },
    placement: { status: "unplaced" },
  };
}

function firstUnplacedId(state: ComposeState): string | null {
  return state.drafts.find((d) => d.placement.status === "unplaced")?.id ?? null;
}

function eventPoint(
  e: MouseEvent | TouchEvent | PointerEvent,
): { x: number; y: number } | null {
  if ("clientX" in e && typeof e.clientX === "number") {
    return { x: e.clientX, y: e.clientY };
  }
  if ("changedTouches" in e && e.changedTouches.length > 0) {
    const t = e.changedTouches[0];
    return { x: t.clientX, y: t.clientY };
  }
  return null;
}

export function AddAnchorComposeContainer({
  isOpen,
  onClose,
  dateLabel,
  dateISO,
  existingBlocks,
  onPrevDay,
  onNextDay,
  onSaved,
  locationUsages,
  initialState,
  initialActiveId,
  initialNextId,
}: AddAnchorComposeContainerProps) {
  const [state, dispatch] = useReducer(
    composeReducer,
    initialState ?? { drafts: [blankDraft("draft-1")] },
  );
  const [activeId, setActiveId] = useState<string>(
    () => initialActiveId ?? firstUnplacedId(state) ?? "draft-1",
  );
  const nextIdRef = useRef<number>(initialNextId ?? state.drafts.length + 1);

  const [ghost, setGhost] = useState<TimelineGhost | null>(null);
  const [confirm, setConfirm] = useState<{ open: boolean; dir: "prev" | "next" | null }>(
    { open: false, dir: null },
  );

  const timelineRef = useRef<HTMLDivElement>(null);

  // 現在時刻ライン用（対象日 = 今日のときだけ分を持つ）。client-only（hydration 回避）+ 1分更新。
  const [nowMin, setNowMin] = useState<number | undefined>(undefined);
  useEffect(() => {
    const pad = (n: number) => String(n).padStart(2, "0");
    const compute = () => {
      const d = new Date();
      const localISO = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      setNowMin(
        localISO === dateISO ? d.getHours() * 60 + d.getMinutes() : undefined,
      );
    };
    compute();
    const t = setInterval(compute, 60_000);
    return () => clearInterval(t);
  }, [dateISO]);

  const activeDraft =
    state.drafts.find((d) => d.id === activeId) ?? blankDraft("draft-active");

  // ── 編集 ──
  const handleCoreChange = (patch: Partial<ComposeDraftCore>) =>
    dispatch({ type: "updateCore", id: activeId, patch });
  const handleTimeChange = (time: ComposeTimeConstraint) =>
    dispatch({ type: "setTime", id: activeId, time });

  // ── ドラッグ → 配置 ──
  function pointerToDropMin(
    e: MouseEvent | TouchEvent | PointerEvent,
  ): number | null {
    const pt = eventPoint(e);
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!pt || !rect) return null;
    const inside =
      pt.x >= rect.left &&
      pt.x <= rect.right &&
      pt.y >= rect.top &&
      pt.y <= rect.bottom;
    if (!inside) return null;
    return snappedMinAtY(pt.y - rect.top, VIEWPORT, DROP_SNAP_GRID);
  }

  function handleCardDrag(
    draft: ComposeDraftState,
    e: MouseEvent | TouchEvent | PointerEvent,
    _info: PanInfo,
  ) {
    const dropMin = pointerToDropMin(e);
    if (dropMin == null) {
      setGhost(null);
      return;
    }
    const resolved = resolvePlacement(draft.time, { dropStartMin: dropMin });
    const vb = visualBlock(resolved);
    setGhost({
      startMin: vb.startMin,
      endMin: vb.endMin,
      invalid: resolved.crossesMidnight,
    });
  }

  function handleCardDragEnd(
    draft: ComposeDraftState,
    e: MouseEvent | TouchEvent | PointerEvent,
    _info: PanInfo,
  ) {
    setGhost(null);
    const dropMin = pointerToDropMin(e);
    if (dropMin == null) return; // 範囲外 → dragSnapToOrigin で戻る
    dispatch({ type: "place", id: draft.id, dropStartMin: dropMin });
    // 配置した draft が現在 active なら、新しい空 draft を active にする。
    if (draft.id === activeId) {
      const newId = `draft-${nextIdRef.current++}`;
      dispatch({
        type: "add",
        id: newId,
        time: { mode: "both", startMin: 9 * 60, endMin: 10 * 60 },
      });
      setActiveId(newId);
    }
  }

  const renderCard = (draft: ComposeDraftState) => (
    <motion.div
      data-testid="compose-card-draggable"
      drag
      dragSnapToOrigin
      whileDrag={{
        scale: 1.05,
        zIndex: 60,
        boxShadow: "0 18px 42px -12px rgba(139,92,246,0.5)",
      }}
      onDrag={(e, info) => handleCardDrag(draft, e, info)}
      onDragEnd={(e, info) => handleCardDragEnd(draft, e, info)}
      className="cursor-grab touch-none active:cursor-grabbing"
    >
      <ComposeCard draft={draft} />
    </motion.div>
  );

  // ── placed の削除 / 戻す（A-0-4） ──
  const handleRemoveBlock = (id: string) => dispatch({ type: "remove", id });
  const handleUnplaceBlock = (id: string) => dispatch({ type: "unplace", id });
  // P4-4: 左 timeline で移動/伸縮 → placement+time 更新 ＋ その予定を編集対象に（ホイール同期）。
  const handleBlockReposition = (
    id: string,
    startMin: number,
    endMin: number,
  ) => {
    dispatch({ type: "reposition", id, startMin, endMin });
    setActiveId(id);
  };

  // ── 日付切替（A-0-3・未保存があれば確認） ──
  const requestDateChange = (dir: "prev" | "next") => {
    if (hasUnsavedPlaced(state)) {
      setConfirm({ open: true, dir });
    } else {
      proceedDateChange(dir);
    }
  };
  const proceedDateChange = (dir: "prev" | "next") => {
    if (dir === "prev") onPrevDay?.();
    else onNextDay?.();
  };
  const handleDiscard = () => {
    state.drafts
      .filter((d) => d.placement.status === "placed")
      .forEach((d) => dispatch({ type: "remove", id: d.id }));
    const dir = confirm.dir;
    setConfirm({ open: false, dir: null });
    if (dir) proceedDateChange(dir);
  };
  const handleCancel = () => setConfirm({ open: false, dir: null });

  // ── 完了 = 保存（A-4b。A-4a converter → createAnchorBundle → onSaved） ──
  const [saveState, setSaveState] = useState<{
    status: "idle" | "saving" | "error";
    message?: string;
  }>({ status: "idle" });

  async function handleComplete() {
    const plan = planComposeSave(state.drafts, dateISO);
    // 配置なし / 日跨ぎのみ等で保存対象が空 → API を呼ばず警告のみ（CEO 2026-06-01）
    if (plan.kind === "nothing_to_save") {
      setSaveState({
        status: "error",
        message:
          plan.excluded.length > 0
            ? "保存できる予定がありません（日跨ぎ等は除外されます）"
            : "左のタイムラインに予定を配置してください",
      });
      return;
    }
    setSaveState({ status: "saving" });
    const r = await createAnchorBundle({
      source: { sourceType: "manual" },
      anchors: plan.inputs,
    });
    if (r.ok) {
      setSaveState({ status: "idle" });
      onSaved?.();
    } else {
      setSaveState({ status: "error", message: r.error });
    }
  }

  // 日跨ぎ警告（保存しない・A-0-1）+ 保存エラーの notice
  const wrapCount = state.drafts.filter(
    (d) => d.placement.status === "placed" && d.placement.crossesMidnight,
  ).length;
  const notice =
    wrapCount > 0 || saveState.status === "error" ? (
      <div
        data-testid="compose-notice"
        className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700"
      >
        {wrapCount > 0 && (
          <p>日跨ぎの予定が {wrapCount} 件あります（保存されません）。</p>
        )}
        {saveState.status === "error" && saveState.message && (
          <p>{saveState.message}</p>
        )}
      </div>
    ) : null;

  return (
    <AddAnchorComposeSheet
      isOpen={isOpen}
      onClose={onClose}
      dateLabel={dateLabel}
      existingBlocks={existingBlocks}
      drafts={state.drafts}
      activeDraft={activeDraft}
      onPrevDay={() => requestDateChange("prev")}
      onNextDay={() => requestDateChange("next")}
      onCoreChange={handleCoreChange}
      onTimeChange={handleTimeChange}
      onComplete={() => void handleComplete()}
      notice={notice}
      ghost={ghost}
      timelineRef={timelineRef}
      renderCard={renderCard}
      onRemoveBlock={handleRemoveBlock}
      onUnplaceBlock={handleUnplaceBlock}
      onBlockReposition={handleBlockReposition}
      nowMin={nowMin}
      locationUsages={locationUsages}
      confirmOverlay={
        <DateChangeConfirmDialog
          isOpen={confirm.open}
          onDiscard={handleDiscard}
          onCancel={handleCancel}
          // onSave は A-4 で接続（未指定＝「保存する」disabled）
        />
      }
    />
  );
}
