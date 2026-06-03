"use client";

/**
 * PlanShiftImportEntry — 在 app シフト表取込 入口（flag gate ラッパー・S1）
 *
 * `PLAN_FLAGS.shiftImportEntryEnabled`（= NEXT_PUBLIC_PLAN_SHIFT_IMPORT_ENTRY_ENABLED）が
 * **OFF（本番デフォルト）なら null** → /plan の UI 完全不変。ON のときだけ入口本体を出す。
 *
 * gate 分離（CEO 2026-06-04）: 入口 flag はこれ。保存は別 gate（PLAN_SHIFT_IMPORT_SAVE・OFF）、
 *   VLM live も別（S2 は fixture cells で live 不発火）。
 */

import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

import { ShiftImportEntryInner } from "./ShiftImportEntryInner";

export function PlanShiftImportEntry({ now }: { now?: Date }) {
  if (!PLAN_FLAGS.shiftImportEntryEnabled) return null;
  return <ShiftImportEntryInner now={now} />;
}
