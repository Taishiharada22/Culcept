"use client";

/**
 * PlanShiftImportEntry — 在 app シフト表取込 入口（flag gate ラッパー・S1）
 *
 * `PLAN_FLAGS.shiftImportEntryEnabled`（= NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED）が
 * **OFF（本番デフォルト）なら null** → /plan の UI 完全不変。ON のときだけ入口本体を出す。
 *
 * gate 分離（CEO 2026-06-04）: 入口 flag はこれ。保存は別 gate（PLAN_SHIFT_IMPORT_SAVE・OFF）、
 *   VLM live も別（PLAN_SHIFT_DRAFT_LIVE_ENABLED → draftLiveEnabled prop）。
 *
 * S3A-2-2-1: live VLM flag を `draftLiveEnabled` prop で受けて子へ素通し（server→prop・client 直読み禁止）。
 *   本段は plumbing のみ＝prop を受け渡すだけで live UI はまだ出さない（fixture fallback 不変）。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

import { ShiftImportEntryInner } from "./ShiftImportEntryInner";

export function PlanShiftImportEntry({
  now,
  draftLiveEnabled = false,
  vlmInputMode = "combined",
}: {
  now?: Date;
  draftLiveEnabled?: boolean;
  /** live draft flow の VLM 入力モード（server→prop・combined-biased）。default combined。 */
  vlmInputMode?: "split" | "combined";
}) {
  if (!PLAN_FLAGS.shiftImportEntryEnabled) return null;
  return (
    <ShiftImportEntryInner
      now={now}
      draftLiveEnabled={draftLiveEnabled}
      vlmInputMode={vlmInputMode}
    />
  );
}
