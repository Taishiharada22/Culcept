"use client";

/**
 * ShiftDraftInApp — 在app入口の live VLM 下書き取り込み flow（S3A-2-2-2・product presentation）
 *
 * 役割: 画像選択 → 本人行/ヘッダ帯選択 → crop 確認 → live VLM 抽出 → cells_loaded →
 *   確認画面（ShiftImportModal / ShiftReviewGrid）まで。保存導線は `saveEnabled` prop（既定 false=dormant）。
 *
 * 設計（CEO 2026-06-04）:
 *   - dev route（DevShiftDraftClient）と**同じ `useShiftDraftFlow` hook**を消費し、危険ロジック
 *     （state machine / ObjectURL lifecycle / crop / VLM submit / 連打防止 / safe error）を共有。
 *     presentation のみ product 版（debug chrome なし・モーダル）。
 *   - **saveEnabled は prop**（server-only PLAN_SHIFT_IMPORT_SAVE → server→prop・既定 false=dormant）。
 *     client は flag を直読みしない（prop のみ）。action 側も isShiftImportSaveEnabled で再 gate（多重防御）。
 *   - VLM は user が「この画像で読み取る」を押した時のみ（auto 実行なし）。連打は state machine が防止。
 *   - 画像は ObjectURL のみ（base64/dataURL 不使用）。結果は cells のみ（raw response 非保持）。
 *   - ObjectURL revoke は hook 所有（画像差し替え / cancel / unmount）。**cells_loaded 直後は
 *     revoke しない**（元画像を確認画面の原稿照合に使うため・hook の lifecycle を継承）。
 *   - 本 component は親（ShiftImportEntryInner）が **conditional mount**。onClose → 親が unmount →
 *     hook の unmount effect が残 URL を revoke。
 *
 * 不変: live VLM は明示 flag 下（draftLiveEnabled prop + action gate）でのみ発火。DB write なし。
 */

import { GlassCard } from "@/components/ui/glassmorphism-design";
import { selectImportModalProps } from "@/lib/plan/shift/devShiftDraftModalSelector";
import { daysInMonth } from "@/lib/plan/shift/targetMonth";

import { AssistedRowSelector } from "./AssistedRowSelector";
import { ShiftImportModal } from "./ShiftImportModal";
import { useShiftDraftFlow } from "./useShiftDraftFlow";

export interface ShiftDraftInAppProps {
  /**
   * VLM 画像入力モード（server→prop で受ける・combined-biased）。**既定 combined**
   *   （Phase A/B 検証済みの成功経路。split は明示時のみ）。
   * 注: action は split-bias なので client==action には env を明示設定（smoke で combined）。
   */
  vlmInputMode?: "split" | "combined";
  /**
   * S-save-2: 確認画面の保存導線を出すか（server-only PLAN_SHIFT_IMPORT_SAVE → server→prop で受ける）。
   * **既定 false で dormant**（保存ボタン無効・controller が disabled を返し action 未呼出・DB write なし）。
   * client は本 flag を直読みしない（prop のみ）。action 側も isShiftImportSaveEnabled で再 gate（多重防御）。
   */
  saveEnabled?: boolean;
  /** モーダルを閉じる（親が conditional mount を解除＝unmount → hook が ObjectURL revoke）。 */
  onClose?: () => void;
}

export function ShiftDraftInApp({
  vlmInputMode = "combined",
  saveEnabled = false,
  onClose,
}: ShiftDraftInAppProps) {
  const {
    state,
    fileInputRef,
    targetMonthValue,
    setTargetMonthValue,
    notice,
    onFileInputChange,
    triggerFilePicker,
    onRowChange,
    onRowConfirm,
    onCancel,
    handlePrepareCrops,
    onBackToRowSelect,
    handleExtract,
    onRetry,
    onOpenReview,
    onCloseReview,
    onSaveSucceeded,
  } = useShiftDraftFlow({ vlmInputMode });

  // narrowing 用ローカル導出（hook 由来 boolean では JSX 内 state を narrow できないため）。
  const isSelecting =
    state.kind === "image_loaded" || state.kind === "row_selected";

  // 確認画面（ShiftImportModal）— cells_loaded.reviewOpen のみ mount。saveEnabled は prop（既定 false=dormant）。
  const modalProps = selectImportModalProps(state, { saveEnabled });

  return (
    <div
      data-testid="plan-shift-draft-inapp"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-sm sm:items-center sm:p-4"
    >
      <div className="w-full max-w-md">
        <GlassCard className="relative max-h-[90vh] overflow-y-auto">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-800">
              シフト表を取り込む
            </h2>
            <button
              type="button"
              data-testid="plan-shift-draft-inapp-close"
              onClick={() => onClose?.()}
              className="text-xs text-gray-400"
            >
              閉じる
            </button>
          </div>

          {/* hidden file input（全 state で DOM に存在＝再 trigger 可能） */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            data-testid="plan-shift-draft-inapp-file-input"
            onChange={onFileInputChange}
            className="hidden"
          />

          {notice && (
            <p
              data-testid="plan-shift-draft-inapp-notice"
              className="mb-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] text-amber-800"
            >
              {notice}
            </p>
          )}

          {state.kind === "idle" && (
            <div
              data-testid="plan-shift-draft-inapp-idle"
              className="rounded-xl border border-slate-200/70 bg-white/50 p-4 text-[12px] leading-relaxed text-slate-600"
            >
              <p className="mb-3">
                シフト表の画像（PNG / JPEG）を選んで、下書きを取り出します。読み取り後に
                元の表と見比べて確認できます。
              </p>
              <button
                type="button"
                data-testid="plan-shift-draft-inapp-pick"
                onClick={triggerFilePicker}
                className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-medium text-white"
              >
                画像を選ぶ
              </button>
            </div>
          )}

          {isSelecting && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[11px] text-slate-600">
                <span>対象の年月</span>
                <input
                  type="month"
                  value={targetMonthValue}
                  data-testid="plan-shift-draft-inapp-target-month"
                  onChange={(e) => setTargetMonthValue(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-[12px]"
                />
              </label>

              <AssistedRowSelector
                imageObjectUrl={state.imageObjectUrl}
                imageW={state.imageMeta.width}
                imageH={state.imageMeta.height}
                initialSelection={
                  state.kind === "row_selected" ? state.selection : undefined
                }
                onChange={onRowChange}
                onConfirm={onRowConfirm}
                onCancel={onCancel}
              />

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={triggerFilePicker}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-700"
                >
                  画像を選び直す
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-600"
                >
                  やり直す
                </button>
              </div>

              {state.kind === "row_selected" && (
                <button
                  type="button"
                  data-testid="plan-shift-draft-inapp-prepare-crops"
                  onClick={() => void handlePrepareCrops()}
                  className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-medium text-white"
                >
                  クロップを確認
                </button>
              )}
            </div>
          )}

          {state.kind === "crop_review" && (
            <div className="space-y-3 text-[12px] text-slate-600">
              <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] text-sky-800">
                対象の年月: <b>{`${state.year}年${state.month}月`}</b>
                {`（日数 ${daysInMonth(state.year, state.month)}）。`}
                <br />
                元画像の年月と一致していますか？ ズレていると日付がずれます。
              </div>

              <p className="font-medium">読み取りに使う画像</p>
              <img
                data-testid="plan-shift-draft-inapp-combined-preview"
                src={state.combinedCropUrl}
                alt="結合プレビュー"
                className="w-full rounded border border-slate-300"
              />
              <div className="grid grid-cols-2 gap-2">
                <img
                  src={state.headerCropUrl}
                  alt="ヘッダ"
                  className="w-full rounded border border-slate-300"
                />
                <img
                  src={state.personRowCropUrl}
                  alt="本人行"
                  className="w-full rounded border border-slate-300"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onBackToRowSelect}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-700"
                >
                  行指定に戻る
                </button>
                <button
                  type="button"
                  data-testid="plan-shift-draft-inapp-extract"
                  onClick={() => void handleExtract()}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-medium text-white"
                >
                  この画像で読み取る
                </button>
              </div>
            </div>
          )}

          {state.kind === "extracting" && (
            <div
              data-testid="plan-shift-draft-inapp-extracting"
              className="rounded-xl border border-slate-200 bg-white/60 p-4 text-[12px] text-slate-500"
            >
              {`${state.year}年${state.month}月の下書きを取り出しています…`}
            </div>
          )}

          {state.kind === "cells_loaded" && (
            <div
              data-testid="plan-shift-draft-inapp-cells-loaded"
              className="space-y-2 rounded-xl border border-slate-200 bg-white/60 p-4 text-[12px] text-slate-600"
            >
              <p className="font-medium">
                {`${state.year}年${state.month}月 — ${state.cells.length} 件の下書きを読み取りました。`}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="plan-shift-draft-inapp-open-review"
                  onClick={onOpenReview}
                  className="rounded-lg bg-indigo-600 px-3 py-2 text-[12px] font-medium text-white"
                >
                  確認画面を開く
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-[11px] text-slate-600"
                >
                  最初からやり直す
                </button>
              </div>
            </div>
          )}

          {state.kind === "error" && (
            <div
              data-testid="plan-shift-draft-inapp-error"
              className="space-y-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-[12px] leading-relaxed text-rose-700"
            >
              <p>{state.message}</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-medium text-white"
                >
                  もう一度試す
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-[11px] text-rose-600"
                >
                  やり直す
                </button>
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* 確認画面（ShiftImportModal / ShiftReviewGrid）。cells_loaded.reviewOpen のみ mount。
          saveEnabled は prop（server-only PLAN_SHIFT_IMPORT_SAVE → server→prop・既定 false=dormant）。
          imageSrc は元画像 ObjectURL（原稿照合用）。 */}
      {modalProps && (
        <ShiftImportModal
          open={modalProps.open}
          year={modalProps.year}
          month={modalProps.month}
          cells={modalProps.cells}
          saveEnabled={saveEnabled}
          imageSrc={modalProps.imageSrc}
          riskReviewEnabled
          chunkBoundaries={modalProps.chunkBoundaries}
          onSuccess={onSaveSucceeded}
          onClose={onCloseReview}
        />
      )}
    </div>
  );
}
