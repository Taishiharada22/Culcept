/**
 * Phase 3-N List impl sub-phase 7 — ImportedLockEscapeModal component (= first-pass、 第 7 補正 #2 imported lock 逃がし道)
 *
 * 設計原則 (= Spec audit §5.8 + IA 拘束 #5 + 第 7 補正 #2 + 第 14/15 補正 first-pass + CEO 案 A + sub-phase 7 追加条件):
 *   - imported event は default で `import_locked` (= 時刻 / 場所 編集不可、 由来真実性ロック)
 *   - user が編集したい時に 「逃がし道」 modal を提供
 *   - 2 affordance:
 *     - **override**: 同じ event を自由に編集 (= sourceModel `imported + import_locked` → `imported + user_owned`)
 *     - **clone**: 元 imported を保持しつつ user 作成の新 event として複製 (= sourceModel `user + user_owned + clonedFrom`)
 *
 *   - CEO + GPT 合議 (= sub-phase 7 追加条件): override / clone は意味が混ざらないように文言を明確化
 *     - 「この予定を上書きして編集」 (= override)
 *     - 「複製して別の予定として編集」 (= clone)
 *
 *   - 第 14 補正 first-pass: 本 sub-phase 7 では modal UI + a11y + 2 affordance label + render contract test まで
 *     → 実 plan data 更新 logic 接続は **sub-phase 8+** (= EventCard tap → modal trigger / factory 呼出 / 永続化)
 *
 *   - 第 15 補正範囲制限:
 *     - 既存画面への反映 0 (= FlowTab / SummaryTab 不触)
 *     - 既存画面 component 改変 0 (= wave 1/2/3/3a / sub-phase 4-6 既存 component 不触)
 *     - 統合前の新規 component 追加のみ
 *
 *   - 規約 24-extended (= focus surface): focus-visible:border-slate-300 全 interactive 要素
 *   - 自然な日本語維持 (= 第 2 補正、 命令形 / 評価 / push 系単語狩り禁止)
 *
 *   - a11y: role='dialog' + aria-labelledby (= heading id) + aria-modal='true' + backdrop aria-hidden
 *
 * 設計書:
 *   - docs/alter-plan-list-redesign-spec-audit.md §5.8 + §19.7 (= 第 10 補正 2 軸 source model) + §19.13
 *   - docs/alter-plan-list-map-ia-audit.md §2.2 #5 (= imported lock 逃がし道)
 *   - lib/plan/list/sourceProvenance.ts (= overrideImported / cloneImported factory、 sub-phase 8+ で接続)
 *   - decision-log (= sub-phase 7 採用 + 案 A + 追加条件 引き継ぎ)
 */

import { type ReactNode } from "react";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ImportedLockEscapeModal component
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ImportedLockEscapeModalProps = {
  /** modal 開閉状態 (= false なら null return、 DOM 出さない) */
  readonly isOpen: boolean;
  /** modal close handler (= cancel button / backdrop click 両方) */
  readonly onClose: () => void;
  /**
   * override 選択 handler (= sourceModel `imported + import_locked` → `imported + user_owned`)
   *
   * 本 sub-phase 7 では callback 呼出のみ、 実 plan data 更新 logic は sub-phase 8+ で接続
   */
  readonly onOverride: () => void;
  /**
   * clone 選択 handler (= sourceModel `user + user_owned + clonedFrom` 新規生成)
   *
   * 本 sub-phase 7 では callback 呼出のみ、 実 plan data 更新 logic は sub-phase 8+ で接続
   */
  readonly onClone: () => void;
  /** imported source 名 (= 「シフト表」 等、 sub-text に表示) */
  readonly importedFrom: string;
};

/**
 * ImportedLockEscapeModal — imported event の 「逃がし道」 modal
 *
 * UI 構造:
 *   - backdrop (= fixed inset-0、 subdued bg、 tap → onClose)
 *   - modal panel (= 中央、 rounded-2xl、 max-w-md)
 *   - 見出し: 「予定の編集」
 *   - sub-text: 「${importedFrom} から取り込んだ予定です」
 *   - 2 affordance button:
 *     - override: 「この予定を上書きして編集」 + 補足
 *     - clone: 「複製して別の予定として編集」 + 補足
 *   - cancel: 「閉じる」
 *
 * 範囲 (= sub-phase 7 first-pass):
 *   - props callback 呼出のみ、 実 logic は親 component で接続 (= sub-phase 8+)
 *   - focus trap / Esc キー / outside click 完全制御は sub-phase 8+
 */
export function ImportedLockEscapeModal({
  isOpen,
  onClose,
  onOverride,
  onClone,
  importedFrom,
}: ImportedLockEscapeModalProps): ReactNode {
  if (!isOpen) {
    return null;
  }

  const headingId = "imported-lock-escape-modal-heading";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={headingId}
      data-testid="plan-list-imported-lock-escape-modal"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {/* backdrop (= tap → onClose) */}
      <button
        type="button"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className={[
          "absolute inset-0",
          "bg-slate-900/30",
          "cursor-default",
        ].join(" ")}
        data-testid="plan-list-imported-lock-escape-modal-backdrop"
      />

      {/* modal panel */}
      <div
        className={[
          "relative",
          "w-full max-w-md mx-4",
          "rounded-2xl bg-white",
          "border border-slate-100",
          "shadow-lg",
          "p-6",
        ].join(" ")}
      >
        {/* 見出し */}
        <h2
          id={headingId}
          className="text-lg font-semibold text-slate-900"
        >
          予定の編集
        </h2>

        {/* sub-text (= imported source 表示) */}
        <p className="text-sm text-slate-500 mt-2">
          {importedFrom}から取り込んだ予定です
        </p>

        {/* 2 affordance button (= override + clone) */}
        <div className="mt-5 flex flex-col gap-3">
          {/* override (= 第 1 affordance) */}
          <button
            type="button"
            onClick={onOverride}
            data-testid="plan-list-imported-lock-escape-modal-override"
            className={[
              "block w-full text-left",
              "rounded-xl bg-white",
              "border border-slate-200",
              "p-4",
              "transition-colors duration-150",
              "hover:bg-slate-50",
              "focus:outline-none focus-visible:border-slate-300",
            ].join(" ")}
          >
            <p className="text-base font-medium text-slate-900">
              この予定を上書きして編集
            </p>
            <p className="text-xs text-slate-500 mt-1">
              元の予定が編集後の内容に置き換わります
            </p>
          </button>

          {/* clone (= 第 2 affordance) */}
          <button
            type="button"
            onClick={onClone}
            data-testid="plan-list-imported-lock-escape-modal-clone"
            className={[
              "block w-full text-left",
              "rounded-xl bg-white",
              "border border-slate-200",
              "p-4",
              "transition-colors duration-150",
              "hover:bg-slate-50",
              "focus:outline-none focus-visible:border-slate-300",
            ].join(" ")}
          >
            <p className="text-base font-medium text-slate-900">
              複製して別の予定として編集
            </p>
            <p className="text-xs text-slate-500 mt-1">
              元の予定はそのまま残り、新しい予定が追加されます
            </p>
          </button>
        </div>

        {/* cancel button */}
        <button
          type="button"
          onClick={onClose}
          data-testid="plan-list-imported-lock-escape-modal-cancel"
          className={[
            "mt-4 w-full",
            "text-sm text-slate-500",
            "rounded-xl",
            "p-3",
            "border border-transparent",
            "transition-colors duration-150",
            "hover:bg-slate-50",
            "focus:outline-none focus-visible:border-slate-300",
          ].join(" ")}
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
