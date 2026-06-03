/**
 * shared WornHistory — conflict policy（Phase 3-A: pure・副作用なし）
 *
 * 同日に複数の着用記録が存在し得るときの「基本判断」だけを返す。 overwrite はしない。
 * 何をすべきか（calendar 維持 / plan 採用 / 確認 / 学習しない）の判断のみ。
 */

import type { WornHistoryEntry } from "./types";

export type WornHistoryConflictDecision =
  | { action: "use_existing_calendar" } // calendar 既存を学習正本として維持（plan で上書きしない）
  | { action: "use_plan_diary" } // calendar 既存なし & plan が学習可 → plan を採用
  | { action: "needs_confirmation" } // calendar 既存ありだが学習不可 & plan が学習可 → ユーザー確認
  | { action: "skip_learning" }; // どちらも学習対象外 → diary は保持しつつ学習しない

/**
 * 既存 canonical entry（多くは calendar 由来）と新規 entry（多くは plan diary）から判断を返す。
 *
 * 方針（CEO Phase 3-A）:
 *   1. calendar 既存がある日は plan で勝手に上書きしない。
 *      - calendar が学習可 → use_existing_calendar（calendar 優先）
 *      - calendar 学習不可 & plan 学習可 → needs_confirmation
 *      - どちらも不可 → skip_learning
 *   2. calendar 既存なし（existing が null か plan 由来）。
 *      - plan が学習可 → use_plan_diary
 *      - そうでなければ skip_learning
 *      - （incoming が calendar 由来の稀ケースは calendar 側に倒す）
 */
export function resolveWornHistoryConflict(
  existing: WornHistoryEntry | null,
  incoming: WornHistoryEntry,
): WornHistoryConflictDecision {
  // 1) calendar 既存は勝手に上書きしない。
  if (existing && existing.origin === "calendar") {
    if (existing.learningEligible) return { action: "use_existing_calendar" };
    if (incoming.learningEligible) return { action: "needs_confirmation" };
    return { action: "skip_learning" };
  }

  // 2) calendar 既存なし（existing が null か plan 由来）。
  if (incoming.origin === "calendar") {
    return incoming.learningEligible
      ? { action: "use_existing_calendar" }
      : { action: "skip_learning" };
  }
  return incoming.learningEligible
    ? { action: "use_plan_diary" }
    : { action: "skip_learning" };
}
