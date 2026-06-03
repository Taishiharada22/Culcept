"use client";

/**
 * DateChangeConfirmDialog — 未保存 draft があるまま日付を変えようとした時の確認（A-3・骨格）。
 *
 * 設計書: docs/alter-plan-add-anchor-timeline-redesign-proposal.md A-0-3
 *
 * 責務（A-3 = presentational・骨格）:
 *   - 未保存の配置済み draft がある状態で日付切替が要求された時に出す確認ダイアログ
 *   - 「保存する / 破棄する / 戻る」の 3 択（保存の実接続は A-4。onSave 未指定なら disabled）
 *
 * 範囲外（A-3）: 実保存（createAnchorBundle）/ 対象日の既存予定再取得（PlanClient 依存・A-4）。
 */

import type { ReactNode } from "react";

export interface DateChangeConfirmDialogProps {
  isOpen: boolean;
  /** A-4 で実保存に接続。未指定なら「保存する」は disabled（= まだ未配線の正直表示） */
  onSave?: () => void;
  onDiscard?: () => void;
  onCancel?: () => void;
}

export function DateChangeConfirmDialog({
  isOpen,
  onSave,
  onDiscard,
  onCancel,
}: DateChangeConfirmDialogProps): ReactNode {
  if (!isOpen) return null;
  return (
    <div
      data-testid="compose-datechange-confirm"
      className="absolute inset-0 z-10 flex items-center justify-center rounded-3xl bg-white/70 backdrop-blur-sm"
    >
      <div className="w-72 space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
        <p className="text-sm font-medium text-slate-800">
          未保存の予定があります
        </p>
        <p className="text-xs text-slate-500">
          日付を変えると、配置中の予定は失われます。
        </p>
        <div className="flex flex-col gap-2 pt-1">
          <button
            type="button"
            data-testid="compose-datechange-save"
            disabled={!onSave}
            onClick={() => onSave?.()}
            className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-40"
          >
            保存する
          </button>
          <button
            type="button"
            data-testid="compose-datechange-discard"
            onClick={() => onDiscard?.()}
            className="rounded-lg border border-rose-200 px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
          >
            破棄する
          </button>
          <button
            type="button"
            data-testid="compose-datechange-cancel"
            onClick={() => onCancel?.()}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-100"
          >
            戻る
          </button>
        </div>
      </div>
    </div>
  );
}
