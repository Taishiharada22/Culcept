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
import type { LocationUsage } from "@/lib/plan/compose/locationHistory";

import { ComposeBottomSheet } from "./ComposeBottomSheet";
import { ComposeCard } from "./ComposeCard";
import { ComposeFormPanel } from "./ComposeFormPanel";
import { ComposeTimeField } from "./ComposeTimeField";
import { FixedIcon, MovableIcon } from "./composeIcons";
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
  /** 保存中＝完了ボタン無効化（double-submit 防止の3点目・UI）。 */
  submitting?: boolean;

  // ── A-3 追加（optional・後方互換） ──
  ghost?: TimelineGhost | null;
  timelineRef?: Ref<HTMLDivElement>;
  /** 未配置 draft カードの描画委譲（container がドラッグ対応で wrap）。未指定なら静的 ComposeCard */
  renderCard?: (draft: ComposeDraftState) => ReactNode;
  onRemoveBlock?: (id: string) => void;
  onUnplaceBlock?: (id: string) => void;
  /** P4-4: placed block の移動 / 伸縮 */
  onBlockReposition?: (id: string, startMin: number, endMin: number) => void;
  windowStartMin?: number;
  onRepositionActive?: (active: boolean) => void;
  /** ②-1: placed draft クリック → 右フォーム再編集 */
  onBlockSelect?: (id: string) => void;
  /** ②-1: 編集中の placed draft id（左ブロックのハイライト + 編集バー表示） */
  activeBlockId?: string;
  /** ②-1: 「＋ 新しい予定」= 編集を終えて新しい空 draft を active に */
  onNewDraft?: () => void;
  /** ②-2/②-3: 既存(保存済)予定 block クリック → 編集（container が右フォームへインラインロード） */
  onExistingSelect?: (id: string) => void;
  /** ②-3: 編集中の既存 anchor id 群（その既存ブロックを隠す＝編集 draft と二重表示しない） */
  editingAnchorIds?: string[];
  /** ②-3: 編集キャンセル（編集 draft 破棄 → 既存ブロック復帰） */
  onCancelEdit?: (id: string) => void;
  /** ②-3: 編集の「完了」= 編集を確定（draft は pending で残す）して編集モードを抜ける。最終保存は下部の青ボタン。 */
  onCompleteEdit?: () => void;
  /** UI-polish: 現在時刻（分）。container が対象日=今日のときのみ渡す（左タイムラインの現在線） */
  nowMin?: number;
  /** P5-Height: タイムライン高さ(px)。canvas 描画と右フォーム列の高さに使う（drop は実測値＝同値） */
  heightPx?: number;
  /** ④ Phase 1a: 「どこで？」の場所利用ログ（client-side・任意）。panel が title 連動で集計 */
  locationUsages?: LocationUsage[];
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
  submitting,
  ghost = null,
  timelineRef,
  renderCard,
  onRemoveBlock,
  onUnplaceBlock,
  onBlockReposition,
  windowStartMin,
  onRepositionActive,
  onBlockSelect,
  activeBlockId,
  onNewDraft,
  onExistingSelect,
  editingAnchorIds,
  onCancelEdit,
  onCompleteEdit,
  nowMin,
  heightPx = TIMELINE_HEIGHT_PX,
  locationUsages,
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

  // ②-3: 編集中(インライン)の既存予定は、その既存ブロックを隠す（編集 draft が代わりに出る）。
  const blocks = [
    ...existingBlocks.filter(
      (b) => !(editingAnchorIds ?? []).includes(b.id),
    ),
    ...placedBlocks,
  ];

  // live preview = 編集中(active) draft。**title が入った時点**で「予定カード」として常時表示し、
  // 必須(なに＋どこ)が揃ったら**ドラッグ配置可能**にする（= show と drag を分離。Pass 4）。
  const activePlaceable = isPlaceable(activeDraft);
  // ②-1: placed draft を編集中はドラッグカードを出さない（既に配置済＝「ドラッグして配置」は不適）。
  const isEditingPlaced = activeDraft.placement.status === "placed";
  // ②-3: 既存(保存済)予定のインライン編集中か（=amber 編集アクセント + キャンセル + PATCH 保存）。
  const isEditingExisting = activeDraft.editingAnchorId != null;
  const showActivePreview =
    activeDraft.core.title.trim().length > 0 && !isEditingPlaced;
  // active 以外の未配置 placeable（戻す等）は別カードで表示（二重表示回避）。
  const otherCards = drafts.filter(
    (d) =>
      d.id !== activeDraft.id &&
      d.placement.status === "unplaced" &&
      isPlaceable(d),
  );
  const showCardsRegion =
    showActivePreview || otherCards.length > 0 || isEditingPlaced;

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
          {/* 動かせる / 動かせない トグル（日付横・SVG。クリックで切替） */}
          <button
            type="button"
            data-testid="compose-rigidity-toggle"
            aria-pressed={activeDraft.core.rigidity === "hard"}
            aria-label={
              activeDraft.core.rigidity === "hard"
                ? "動かせない（クリックで動かせるに）"
                : "動かせる（クリックで動かせないに）"
            }
            title={
              activeDraft.core.rigidity === "hard" ? "動かせない" : "動かせる"
            }
            onClick={() =>
              onCoreChange?.({
                rigidity:
                  activeDraft.core.rigidity === "hard" ? "soft" : "hard",
              })
            }
            className={
              "ml-1 flex h-7 w-7 items-center justify-center rounded-full transition " +
              (activeDraft.core.rigidity === "hard"
                ? "bg-rose-50 text-rose-500 hover:bg-rose-100"
                : "text-slate-400 hover:bg-slate-100 hover:text-slate-600")
            }
          >
            {activeDraft.core.rigidity === "hard" ? <FixedIcon /> : <MovableIcon />}
          </button>
        </div>

        {/* 2カラム（常時左右。左=俯瞰タイムライン / 右=作成パネル）— 理想画像準拠 */}
        <div className="flex gap-2">
          {/* 左: 俯瞰タイムライン（コンパクト・1日俯瞰。max-w で右フォーム潰れ回避） */}
          <div
            ref={timelineRef}
            data-testid="compose-timeline-col"
            className="w-[44%] max-w-[280px] shrink-0"
          >
            <DayTimelineCanvas
              blocks={blocks}
              ghost={ghost}
              onRemoveBlock={onRemoveBlock}
              onUnplaceBlock={onUnplaceBlock}
              onBlockReposition={onBlockReposition}
              windowStartMin={windowStartMin}
              onRepositionActive={onRepositionActive}
              onBlockSelect={onBlockSelect}
              activeBlockId={activeBlockId}
              activeIsEditing={isEditingExisting}
              onExistingSelect={onExistingSelect}
              nowMin={nowMin}
              heightPx={heightPx}
            />
          </div>

          {/* 右: スクロールするフォーム + 固定の完了（高さは左タイムラインと一致＝同一 heightPx） */}
          <div
            data-testid="compose-form-col"
            className="flex min-w-0 flex-1 flex-col border-l border-slate-100 pl-3"
            style={{ height: heightPx }}
          >
            <div className="flex-1 space-y-3 overflow-y-auto pr-1">
              {/* ①②③ なに / どこ / 誰と */}
              <ComposeFormPanel
                core={activeDraft.core}
                onCoreChange={onCoreChange}
                locationUsages={locationUsages}
              />

              {showCardsRegion && (
                <div data-testid="compose-unplaced-list" className="space-y-2">
                  {/* 編集中バー: ②-3 既存予定=amber+キャンセル / ②-1 新規 draft=indigo+新しい予定 */}
                  {isEditingPlaced && (
                    <div
                      data-testid="compose-editing-bar"
                      data-mode={isEditingExisting ? "existing" : "draft"}
                      className={
                        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2 " +
                        (isEditingExisting
                          ? "border-amber-300 bg-amber-50/70"
                          : "border-indigo-200 bg-indigo-50/60")
                      }
                    >
                      <span
                        className={
                          "min-w-0 truncate text-xs " +
                          (isEditingExisting ? "text-amber-800" : "text-indigo-700")
                        }
                      >
                        {isEditingExisting ? "既存の予定" : ""}「
                        {activeDraft.core.title || "（無題）"}」を編集中
                      </span>
                      {isEditingExisting ? (
                        <div className="flex shrink-0 items-center gap-1.5">
                          {/* 完了＝この「予定修正」だけを確定し編集モードを抜ける（draft は pending で残す）。
                              最終保存（予定追加全体）は下部の青い完了ボタン（onComplete）。 */}
                          <button
                            type="button"
                            data-testid="compose-complete-edit"
                            onClick={() => onCompleteEdit?.()}
                            className="rounded-full bg-amber-500 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-amber-600"
                          >
                            完了
                          </button>
                          <button
                            type="button"
                            data-testid="compose-cancel-edit"
                            onClick={() => onCancelEdit?.(activeDraft.id)}
                            className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-amber-700 shadow-sm transition hover:bg-amber-100"
                          >
                            キャンセル
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          data-testid="compose-new-draft"
                          onClick={() => onNewDraft?.()}
                          className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-indigo-600 shadow-sm transition hover:bg-indigo-100"
                        >
                          ＋ 新しい予定
                        </button>
                      )}
                    </div>
                  )}
                  {showActivePreview && (
                    <div data-testid="compose-active-preview" className="space-y-1">
                      {activePlaceable && renderCard ? (
                        renderCard(activeDraft)
                      ) : (
                        <ComposeCard draft={activeDraft} />
                      )}
                      <p className="text-[11px] text-slate-400">
                        {activePlaceable
                          ? "カードを左のタイムラインへドラッグして配置します"
                          : "「どこで？」も入れると配置できます"}
                      </p>
                    </div>
                  )}
                  {otherCards.map((d) =>
                    renderCard ? (
                      <div key={d.id}>{renderCard(d)}</div>
                    ) : (
                      <ComposeCard key={d.id} draft={d} />
                    ),
                  )}
                </div>
              )}

              {/* ⑤ 時間（開始 / 終了 / 間隔） */}
              <ComposeTimeField
                time={activeDraft.time}
                onTimeChange={onTimeChange}
              />

              {notice}
            </div>

            {/* 完了（右下・full-width・purple で強く）。double-submit 防止: 保存中は disabled。 */}
            <div className="shrink-0 pt-3" data-testid="compose-complete-btn">
              <GlassButton
                variant="primary"
                fullWidth
                type="button"
                disabled={submitting}
                onClick={() => onComplete?.()}
                className="rounded-2xl bg-indigo-600 shadow-md shadow-indigo-500/25 hover:bg-indigo-700"
              >
                {submitting ? "保存中…" : "完了"}
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
