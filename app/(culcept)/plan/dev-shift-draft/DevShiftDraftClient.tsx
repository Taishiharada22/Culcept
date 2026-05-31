"use client";

/**
 * DevShiftDraftClient — fixture host の client shell（SR B1b-2C-8-b）
 *
 * 本コミット（B1b-2C-8-b）の scope:
 *   - 警告文（staging/dev 限定の検証 host・製品の取り込み入口ではない）
 *   - 次段で接続する内容の placeholder
 *
 * 範囲外（**B1b-2C-8-c で接続**）:
 *   - file input / ObjectURL / Blob / File state
 *   - AssistedRowSelector mount
 *   - generateAssistedCrops
 *   - FormData / extractShiftDraftAction 呼び出し
 *   - ShiftImportModal 接続 / 保存 / DB write
 *
 * safe copy: 「検証 host」「製品の取り込み入口ではありません」で統一。
 *   「本流」「正式入口」「保存できます」「取り込み完了」は使わない（CEO 補正・2026-06-01）。
 */

export function DevShiftDraftClient() {
  return (
    <div
      data-testid="dev-shift-draft-host"
      className="min-h-screen bg-slate-50 p-4"
    >
      <div className="mx-auto max-w-md space-y-3">
        <p
          data-testid="dev-shift-draft-warning"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800"
        >
          ⚠ staging/dev 限定の <b>下書き取り込み検証 host</b> です。
          製品の取り込み入口ではありません。
        </p>
        <div
          data-testid="dev-shift-draft-shell-placeholder"
          className="rounded-xl border border-slate-200 bg-white p-4 text-[12px] leading-relaxed text-slate-600"
        >
          次の段階で、画像選択・行指定・下書き抽出を接続します。
        </div>
      </div>
    </div>
  );
}
