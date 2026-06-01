"use client";

/**
 * AddAnchorComposeSheet — 予定追加 2カラム体験の親シート（presentational 骨格）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.1 / §4.2 / A-0-5 / A-0-6
 *
 * 責務（presentational・props 駆動）:
 *   - GlassModal(lg) に「日付ヘッダ + 左タイムライン + 右作成パネル + 完了」を配置（A-2）
 *   - A-3 追加（すべて optional・後方互換）:
 *       ghost / timelineRef / onRemoveBlock / onUnplaceBlock を DayTimelineCanvas へ委譲
 *       renderCard で未配置 draft カードの描画を container 側（ドラッグ対応）に委譲
 *       confirmOverlay で日付切替確認ダイアログを overlay
 *
 * 範囲外: 状態保持（useReducer は container）/ 保存 / PlanClient / flag / 候補検索。
 */

import type { ReactNode, Ref } from "react";

import { GlassButton } from "@/components/ui/glassmorphism-design";
import {
  type ComposeDraftCore,
  type ComposeDraftState,
  isPlaceable,
} from "@/lib/plan/compose/composeDraft";
import {
  type ComposeTimeConstraint,
  visualBlock,
} from "@/lib/plan/compose/composeTimeResolver";

import { ComposeBottomSheet } from "./ComposeBottomSheet";
import { ComposeCard } from "./ComposeCard";
import { ComposeFormPanel } from "./ComposeFormPanel";
import {
  DayTimelineCanvas,
  TIMELINE_HEIGHT_PX,
  type TimelineBlock,
  type TimelineGhost,
} from "./DayTimelineCanvas";

export interface AddAnchorComposeSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** ヘッダ表示用の整形済み日付ラベル（例: "6/1(月)"） */
  dateLabel: string;
  /** 当日の既存予定（read-only 文脈） */
  existingBlocks: TimelineBlock[];
  /** 作成中・配置済みの draft 群 */
  drafts: ComposeDraftState[];
  /** 右パネルで編集中の draft */
  activeDraft: ComposeDraftState;
  onPrevDay?: () => void;
  onNextDay?: () => void;
  onCoreChange?: (patch: Partial<ComposeDraftCore>) => void;
  onTimeChange?: (time: ComposeTimeConstraint) => void;
  onComplete?: () => void;

  // ── A-3 追加（optional・後方互換） ──
  ghost?: TimelineGhost | null;
  timelineRef?: Ref<HTMLDivElement>;
  /** 未配置 draft カードの描画委譲（container がドラッグ対応で wrap）。未指定なら静的 ComposeCard */
  renderCard?: (draft: ComposeDraftState) => ReactNode;
  onRemoveBlock?: (id: string) => void;
  onUnplaceBlock?: (id: string) => void;
  /** 日付切替確認ダイアログ等の overlay */
  confirmOverlay?: ReactNode;
  /** 完了ボタン上に出す通知（日跨ぎ警告 / 保存エラー等・A-4b） */
  notice?: ReactNode;
}

export function AddAnchorComposeSheet({
  isOpen,
  onClose,
  dateLabel,
  existingBlocks,
  drafts,
  activeDraft,
  onPrevDay,
  onNextDay,
  onCoreChange,
  onTimeChange,
  onComplete,
  ghost = null,
  timelineRef,
  renderCard,
  onRemoveBlock,
  onUnplaceBlock,
  confirmOverlay,
  notice,
}: AddAnchorComposeSheetProps) {
  // 配置済み draft → タイムライン block（仮長は visualBlock）。
  const placedBlocks: TimelineBlock[] = drafts
    .filter((d) => d.placement.status === "placed")
    .map((d) => {
      const p = d.placement as Extract<
        ComposeDraftState["placement"],
        { status: "placed" }
      >;
      const vb = visualBlock({
        startMin: p.startMin,
        endMin: p.endMin,
        crossesMidnight: p.crossesMidnight,
        edgeClamped: p.edgeClamped,
      });
      return {
        id: d.id,
        label: d.core.title || "（無題）",
        startMin: vb.startMin,
        endMin: vb.endMin,
        tone: "draft" as const,
      };
    });

  const blocks = [...existingBlocks, ...placedBlocks];

  // 未配置 draft（必須充足のみ）= ドラッグ配置できるカード。A-0「未配置draftの表示」。
  const unplacedCards = drafts.filter(
    (d) => d.placement.status === "unplaced" && isPlaceable(d),
  );

  return (
    <ComposeBottomSheet isOpen={isOpen} onClose={onClose}>
      <div data-testid="compose-sheet" className="relative flex flex-col gap-3">
        {/* 日付ヘッダ（前後で対象日を移動） */}
        <div
          data-testid="compose-date-header"
          className="flex shrink-0 items-center justify-center gap-3"
        >
          <button
            type="button"
            data-testid="compose-date-prev"
            aria-label="前の日"
            onClick={onPrevDay}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-slate-800">{dateLabel}</span>
          <button
            type="button"
            data-testid="compose-date-next"
            aria-label="次の日"
            onClick={onNextDay}
            className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ›
          </button>
        </div>

        {/* 2カラム（常時左右。左=俯瞰タイムライン / 右=作成パネル）— 理想画像準拠 */}
        <div className="flex gap-3">
          {/* 左: 俯瞰タイムライン（コンパクト・1日俯瞰） */}
          <div
            ref={timelineRef}
            data-testid="compose-timeline-col"
            className="w-[40%] shrink-0"
          >
            <DayTimelineCanvas
              blocks={blocks}
              ghost={ghost}
              onRemoveBlock={onRemoveBlock}
              onUnplaceBlock={onUnplaceBlock}
            />
          </div>

          {/* 右: スクロールするフォーム + 固定の完了（高さは左タイムラインと一致） */}
          <div
            data-testid="compose-form-col"
            className="flex min-w-0 flex-1 flex-col"
            style={{ height: TIMELINE_HEIGHT_PX }}
          >
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              <ComposeFormPanel
                core={activeDraft.core}
                time={activeDraft.time}
                onCoreChange={onCoreChange}
                onTimeChange={onTimeChange}
              />

              {unplacedCards.length > 0 && (
                <div data-testid="compose-unplaced-list" className="space-y-2">
                  {unplacedCards.map((d) =>
                    renderCard ? (
                      <div key={d.id}>{renderCard(d)}</div>
                    ) : (
                      <ComposeCard key={d.id} draft={d} />
                    ),
                  )}
                  <p className="text-[11px] text-slate-400">
                    カードを左のタイムラインへドラッグして配置します
                  </p>
                </div>
              )}

              {notice}
            </div>

            {/* 完了（右下・full-width・purple で強く） */}
            <div className="shrink-0 pt-2" data-testid="compose-complete-btn">
              <GlassButton
                variant="primary"
                fullWidth
                onClick={() => onComplete?.()}
                className="rounded-2xl bg-indigo-600 shadow-md shadow-indigo-500/25 hover:bg-indigo-700"
              >
                完了
              </GlassButton>
            </div>
          </div>
        </div>

        {/* 日付切替確認などの overlay（A-3） */}
        {confirmOverlay}
      </div>
    </ComposeBottomSheet>
  );
}
