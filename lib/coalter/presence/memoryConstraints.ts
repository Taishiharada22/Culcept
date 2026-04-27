/**
 * CoAlter Stage 2 — §8.3.4 有効組み合わせ制約 (L2-i)
 *
 * 正本: UI spec §8.3.4 有効組み合わせ制約
 *
 * 3 軸は概念上は独立だが、UI 上の有効組み合わせには制約がある。
 *
 * 由来ごとの可視性昇格ルール:
 *   - explicit_shared    : 初期から both_visible 可、自動昇格 ✓
 *   - inferred           : both_visible 到達は明示共有 (§8.4 share 操作) または
 *                          確認付き昇格 (§7 Pattern C 経由) を経由した場合のみ。自動昇格 ✗
 *   - transient_summary  : 原則 internal_only または片側表示止まり。
 *                          both_visible 昇格は二段階確認 (明示共有 + 確定度 medium 以上)
 *                          が必要。自動昇格 ✗
 *
 * 禁止される組み合わせ (自動的には到達できない状態):
 *   - inferred × high × both_visible (明示共有経由なし)
 *   - transient_summary × high × both_visible
 *   - transient_summary × medium × both_visible (二段階確認経由なし)
 *
 * 不可侵原則 (§8.3.4):
 *   - 「CoAlter の推定」が「両者の共有事実」に見える状態を構造的に防ぐ
 *   - 一時要約が永続的な共有事実に見える状態を防ぐ
 */

import type { Certainty, Origin, Visibility } from "./memoryTypes";

/**
 * 禁止組み合わせ (UI 上で生成不可)。
 */
export interface ForbiddenCombination {
  origin: Origin;
  certainty: Certainty;
  visibility: Visibility;
  reason: string;
}

export const FORBIDDEN_COMBINATIONS: ReadonlyArray<ForbiddenCombination> = [
  {
    origin: "inferred",
    certainty: "high",
    visibility: "both_visible",
    reason: "推定が両者の共有事実に見える (明示共有経由なし、§8.3.4)",
  },
  {
    origin: "transient_summary",
    certainty: "high",
    visibility: "both_visible",
    reason: "一時要約が永続的な共有事実に見える (§8.3.4)",
  },
  {
    origin: "transient_summary",
    certainty: "medium",
    visibility: "both_visible",
    reason: "一時要約 medium が共有事実化 (二段階確認経由なし、§8.3.4)",
  },
];

/**
 * 与えられた 3 軸組み合わせが禁止 (§8.3.4) されているか。
 */
export function isForbiddenCombination(
  origin: Origin,
  certainty: Certainty,
  visibility: Visibility,
): boolean {
  return FORBIDDEN_COMBINATIONS.some(
    (f) =>
      f.origin === origin &&
      f.certainty === certainty &&
      f.visibility === visibility,
  );
}

/**
 * 禁止組み合わせの理由を返す (debug / log 用)。許可組み合わせなら null。
 */
export function getForbiddenReason(
  origin: Origin,
  certainty: Certainty,
  visibility: Visibility,
): string | null {
  const f = FORBIDDEN_COMBINATIONS.find(
    (x) =>
      x.origin === origin &&
      x.certainty === certainty &&
      x.visibility === visibility,
  );
  return f ? f.reason : null;
}

/**
 * 由来ごとの both_visible 自動昇格可否 (§8.3.4 表)。
 *
 * - explicit_shared: 自動昇格可
 * - inferred / transient_summary: 自動昇格禁止 (明示 share 経由必須)
 */
export function canAutoPromoteToBothVisible(origin: Origin): boolean {
  return origin === "explicit_shared";
}
