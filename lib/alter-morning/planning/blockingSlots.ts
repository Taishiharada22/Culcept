/**
 * blockingSlots — W3-PR-8 dialog-control 修復 (2026-04-22 CEO 承認)
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §2.8
 *
 * 責務:
 *   phase authority の一次判定。「質問が消えた」ではなく「問題が解けた」を見る。
 *   primary_clarify == null は UI 質問選定の結果であって、plan 昇格契約ではない。
 *
 * blocking の定義（CEO 2026-04-22 確定）:
 *   - whenSharpness="missing"                         → blocking
 *   - whenSharpness="vague" (timeHint のみ)            → blocking
 *   - whereSharpness="missing"                        → blocking
 *   - whereSharpness="vague" (anchor / category_chain / undecided すべて) → blocking
 *   - whatSharpness="missing"                         → blocking
 *   - whatSharpness="vague"                           → **non-blocking**
 *     （PR-8 は UI で「内容暫定」表示に留める、clarify 追加はしない）
 *
 * 設計原則:
 *   - pure function、LLM 呼び出しなし、副作用なし
 *   - Event schema は触らない（sharpness は都度計算）
 *   - anchor sub-kind も blocking（PR-9 search 実装後に non-blocking 化を検討）
 */
import type { Event } from "../comprehension/eventSchema";
import {
  computeWhenSharpness,
  computeWhereSharpness,
  computeWhatSharpness,
} from "../comprehension/eventSchema";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Single-event blocking
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一 event が blocking か判定する。
 *
 * 判定順（1 つでも true なら blocking）:
 *   1. when sharpness != "fixed"                    （missing / vague いずれも blocking）
 *   2. where sharpness ∈ {"missing", "vague"}        （vague 3 sub-kind すべて blocking）
 *   3. what sharpness === "missing"                 （what vague は non-blocking）
 */
export function blockingForEvent(event: Event): boolean {
  // When: fixed 以外は全て blocking
  const whenS = computeWhenSharpness(event.when);
  if (whenS !== "fixed") return true;

  // Where: missing / vague ともに blocking
  const whereS = computeWhereSharpness(event.where);
  if (whereS === "missing") return true;
  if (whereS === "vague") return true; // 3 sub-kind (anchor / category_chain / undecided) すべて blocking

  // What: missing のみ blocking（vague は non-blocking）
  const whatS = computeWhatSharpness(event.what);
  if (whatS === "missing") return true;

  return false;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Plan-level aggregation (phase authority)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * plan 全体として blocking な slot が残っているか。
 *
 * phase 昇格の正本:
 *   - true  → 最低 1 event に blocking slot が残る → phase=clarifying 維持
 *   - false → 全 event が blocking なし → plan_presented 昇格可
 *
 * 空配列は別契約（items=0 禁則、legacyAdapter が担当）で扱うため false を返す。
 * これは「blocking は無い」意ではなく「この関数の責務外」という意味で、
 * phase 決定は events 長さをもう一段別に判定する。
 */
export function hasBlockingUnresolvedSlots(events: Event[]): boolean {
  if (!events || events.length === 0) return false;
  return events.some(blockingForEvent);
}
