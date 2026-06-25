"use client";

/**
 * ShiftImportEntryInner — 在 app シフト表取込 入口の本体（S2）
 *
 * button → ShiftImportModal（確認画面 = ShiftReviewGrid）。
 * flag gating は親 `PlanShiftImportEntry` が担当（本体は常時 render = test 可能）。
 *
 * 安全設計（CEO 2026-06-04・gate 分離）:
 *   - **cells は fixture 注入**（`buildShiftFixture`）→ **live VLM を発火させない**（S2 段階）。
 *   - **fixture fallback は `saveEnabled={false}` 固定** → ShiftImportModal の保存 controller は disabled → **DB write しない**。
 *   - 実 VLM 抽出 / 保存は後段（別 gate: `PLAN_SHIFT_IMPORT_SAVE` / VLM live）で接続する。
 *
 * S3A-2-2-1: `draftLiveEnabled` prop を server→prop で受ける（client 直読み禁止）。data 属性にも反映。
 * S3A-2-2-2: `draftLiveEnabled=true` で **live VLM flow（ShiftDraftInApp）** を出す。
 *   `false`（既定/本番）では従来の **fixture modal**（debug fallback・saveEnabled 固定 false）を維持。
 *   ShiftDraftInApp は conditional mount（閉じる/unmount で hook が ObjectURL revoke）。
 * S-save-2: 保存 flag を `saveEnabled` prop（server-only PLAN_SHIFT_IMPORT_SAVE → server→prop）で受け、
 *   **live 経路（ShiftDraftInApp）にのみ素通し**。default false で dormant（保存ボタン無効・action 未呼出）。
 *   本 component は保存 flag を**直読みしない**（prop で受けるだけ）。
 */

import { useEffect, useMemo, useState } from "react";

import { registerHomeSwipeModalOpen } from "@/lib/home-swipe-modal-lock";
import { buildShiftFixture } from "@/lib/plan/shift/devFixtureHost";
import { ShiftDraftInApp } from "./ShiftDraftInApp";
import { ShiftImportModal } from "./ShiftImportModal";

export function ShiftImportEntryInner({
  now,
  draftLiveEnabled = false,
  vlmInputMode = "combined",
  saveEnabled = false,
  onSuccess,
}: {
  now?: Date;
  draftLiveEnabled?: boolean;
  /** live draft flow の VLM 入力モード（server→prop・combined-biased）。default combined。 */
  vlmInputMode?: "split" | "combined";
  /** S-save-2: 保存導線（server-only PLAN_SHIFT_IMPORT_SAVE → prop）。default false で dormant。live 経路へ素通し。 */
  saveEnabled?: boolean;
  /**
   * RD-2 bug fix: 保存成功時に親（PlanShiftImportEntry 経由で PlanClient）へ通知する seam。
   * live 経路（ShiftDraftInApp）と fallback 経路（ShiftImportModal）両方で wire される。
   * 未指定なら従来通り modal 閉じるのみ（後方互換）。
   */
  onSuccess?: () => void;
}) {
  const [open, setOpen] = useState(false);
  // HOME-SWIPE-PLAN-PARITY（2026-06-25）: Home swipe pane 内で開いた時、横スワイプで modal/確認画面が
  //   pane と一緒に流れるのを防ぐ（AddAnchorModal 等と同パターン）。route 単独表示では no-op。
  //   open は ShiftImportModal / ShiftDraftInApp 両経路を gate するので、ここ 1 箇所で両方を覆える。
  useEffect(() => {
    if (!open) return;
    return registerHomeSwipeModalOpen();
  }, [open]);
  // 確認画面に流す cells（fixture・live VLM 非依存・deterministic）。now は test 注入可。
  const fixture = useMemo(() => buildShiftFixture(now ?? new Date()), [now]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        data-testid="plan-shift-import-entry"
        data-draft-live={draftLiveEnabled ? "true" : "false"}
        aria-label="シフト表（画像・PDF）を取り込む"
        className="text-[10px] px-2 py-1 rounded-md text-indigo-600 hover:text-purple-700 hover:bg-indigo-50 transition-colors inline-flex items-center gap-1.5 font-medium"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect
            x="3"
            y="4"
            width="18"
            height="16"
            rx="2"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M3 9h18M9 4v16" stroke="currentColor" strokeWidth="2" />
        </svg>
        <span>シフト表</span>
      </button>

      {draftLiveEnabled ? (
        // live VLM 経路（S3A-2-2-2）: conditional mount → 閉じる/unmount で hook が ObjectURL revoke。
        //   VLM は ShiftDraftInApp 内の「この画像で読み取る」押下時のみ発火（auto なし）。
        open && (
          <ShiftDraftInApp
            vlmInputMode={vlmInputMode}
            saveEnabled={saveEnabled}
            onClose={() => setOpen(false)}
            onSuccess={onSuccess}
          />
        )
      ) : (
        // fixture fallback（debug・既存挙動不変）。live で詰まった時の確認手段として残す。
        // RD-2 bug fix: 親 onSuccess も呼ぶ（saveEnabled=false 固定なので実 DB write は起きないが、
        //   親 callback 経路の整合性のため fallback でも wire しておく）。
        <ShiftImportModal
          open={open}
          year={fixture.year}
          month={fixture.month}
          cells={fixture.cells}
          saveEnabled={false}
          riskReviewEnabled
          onSuccess={() => {
            setOpen(false);
            onSuccess?.();
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
