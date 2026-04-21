/**
 * L2.1d What Slot Classifier — Comprehension-First v1.3+ Wave 3 (W3-PR-7 Commit 1)
 *
 * 設計書: docs/alter-morning-comprehension-first-wave3-pr7-design.md §3, §4.4
 *
 * 責務:
 *   Event.what の確定度を FIXED/PROVISIONAL/ASK で判定する。
 *
 * 三層判定:
 *   - FIXED:       activity が具体的（VAGUE_ACTIVITY_SET に無い）
 *   - PROVISIONAL: （本 PR では未使用。Wave 4+ で activity category default 経路）
 *   - ASK:         activity が missing、または VAGUE_ACTIVITY_SET に一致（「仕事」等）
 *
 * 設計原則:
 *   - 純関数・副作用なし・LLM 呼び出しなし
 *   - sharpness は eventSchema の computeWhatSharpness に委譲（単一真実源）
 */
import type { Event } from "../comprehension/eventSchema";
import { computeWhatSharpness } from "../comprehension/eventSchema";

export type WhatSlotStatus =
  | { kind: "fixed"; reason: "specific_activity" }
  | { kind: "ask"; reason: "missing_activity" | "vague_activity" };

export interface WhatClassifierCtx {
  events: Event[];
  index: number;
}

/**
 * Event.what を三層判定する。
 *
 * 判定順:
 *   1. sharpness==="fixed"    → FIXED
 *   2. sharpness==="missing"  → ASK (missing_activity)
 *   3. sharpness==="vague"    → ASK (vague_activity)  ※「仕事って具体的には？」
 *
 * Note:
 *   Wave 4+ では vague な activity（「仕事」）に対し category default
 *   （リモート/会議/作業）を引いて PROVISIONAL を返す拡張を入れる想定。
 *   W3-PR-7 では保守的に ASK に倒す。
 */
export function classifyWhatSlot(
  ev: Event,
  _ctx: WhatClassifierCtx,
): WhatSlotStatus {
  const s = computeWhatSharpness(ev.what);
  if (s === "fixed") return { kind: "fixed", reason: "specific_activity" };
  if (s === "missing") return { kind: "ask", reason: "missing_activity" };
  return { kind: "ask", reason: "vague_activity" };
}
