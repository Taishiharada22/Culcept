"use client";

/**
 * AddAnchorComposeSheet — 予定追加 2カラム体験の親シート（A-2・presentational 骨格）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md §4.1 / §4.2 / A-0-5 / A-0-6
 *
 * 責務（A-2 = 見た目の骨格・props 駆動）:
 *   - GlassModal(size=lg) 内に「日付ヘッダ + 左タイムライン + 右作成パネル + 完了」を
 *     レスポンシブ 2カラムで配置
 *   - 配置済み draft を左タイムラインに静的描画、作成中 draft を右パネル + カードに表示
 *
 * 範囲外（A-2 で触れない・後続 stop gate）:
 *   - 状態保持（useReducer）・ドラッグ・吸着・placed 削除/戻す（A-3）
 *   - 保存（createAnchorBundle）・PlanClient 統合・flag 分岐・AddAnchorModal 置換（A-4）
 *   - 候補検索（PlaceCandidatesPanel）/ 日付切替ブロックの本格挙動 / Phase B/C
 *
 * → このシートは「dumb」。A-3 で useReducer(composeReducer) を持つ container が
 *   同じ props を供給し、ジェスチャを配線する。
 */

import { GlassButton, GlassModal } from "@/components/ui/glassmorphism-design";
import {
  type ComposeDraftCore,
  type ComposeDraftState,
  isPlaceable,
} from "@/lib/plan/compose/composeDraft";
import {
  type ComposeTimeConstraint,
  visualBlock,
} from "@/lib/plan/compose/composeTimeResolver";

import { ComposeCard } from "./ComposeCard";
import { ComposeFormPanel } from "./ComposeFormPanel";
import { DayTimelineCanvas, type TimelineBlock } from "./DayTimelineCanvas";

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
}: AddAnchorComposeSheetProps) {
  // 配置済み draft → タイムライン block（仮長は visualBlock で算出）。
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
  const canPreviewCard = isPlaceable(activeDraft);

  return (
    <GlassModal isOpen={isOpen} onClose={onClose} title="予定をつくる" size="lg">
      <div data-testid="compose-sheet" className="space-y-4">
        {/* 日付ヘッダ（前後で対象日を移動） */}
        <div
          data-testid="compose-date-header"
          className="flex items-center justify-center gap-4"
        >
          <button
            type="button"
            data-testid="compose-date-prev"
            aria-label="前の日"
            onClick={onPrevDay}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ‹
          </button>
          <span className="text-sm font-semibold text-slate-800">{dateLabel}</span>
          <button
            type="button"
            data-testid="compose-date-next"
            aria-label="次の日"
            onClick={onNextDay}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            ›
          </button>
        </div>

        {/* 2カラム（レスポンシブ: スマホ縦積み / md 以上で左右） */}
        <div className="flex flex-col gap-4 md:flex-row md:gap-5">
          {/* 左: 俯瞰タイムライン */}
          <div data-testid="compose-timeline-col" className="md:w-[42%] md:shrink-0">
            <DayTimelineCanvas blocks={blocks} />
          </div>

          {/* 右: 作成パネル + カード + 完了 */}
          <div data-testid="compose-form-col" className="min-w-0 flex-1 space-y-4">
            <ComposeFormPanel
              core={activeDraft.core}
              time={activeDraft.time}
              onCoreChange={onCoreChange}
              onTimeChange={onTimeChange}
            />

            {canPreviewCard && (
              <div className="space-y-1">
                <ComposeCard draft={activeDraft} />
                <p className="text-[11px] text-slate-400">
                  左のタイムラインへドラッグして配置します（操作は後続で有効化）
                </p>
              </div>
            )}

            <div className="flex justify-end pt-1" data-testid="compose-complete-btn">
              <GlassButton variant="primary" onClick={() => onComplete?.()}>
                完了
              </GlassButton>
            </div>
          </div>
        </div>
      </div>
    </GlassModal>
  );
}
