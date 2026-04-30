/**
 * CoAlter Stage 2 — §8.3.3 ラベル階層ルール (L2-i)
 *
 * 正本: UI spec §8.3.3 ラベル階層ルール
 *
 * 項目状態ごとに、3 軸ラベルの表示要否を決定する。
 *
 * 不変原則 (§8.3.3 不可侵):
 *   - 由来は常に表示 (省略禁止) — 本節の最大ガードレール
 *   - 片側可視性 (`_only`) は必ず明示文言で示す (誤認防止、§8.3.3)
 *
 * 表示判定マトリクス (§8.3.3):
 * | 項目状態                                 | 由来  | 確定度  | 可視性 |
 * |---|---|---|---|
 * | explicit_shared × high × both_visible  | ✓    | 省略可  | 省略可  |
 * | inferred (全)                           | ✓    | ✓      | both 時のみ省略可 |
 * | transient_summary (全)                  | ✓    | ✓      | ✓ (時間経過で消える旨含む) |
 * | いずれかが _only の可視性               | ✓    | ✓      | ✓     |
 */

import type { Certainty, Origin, Visibility } from "./memoryTypes";

/**
 * 各軸ラベルの表示要否。
 */
export interface LabelDisplayHints {
  showOrigin: boolean;       // §8.3.3 不可侵: 常に true
  showCertainty: boolean;
  showVisibility: boolean;
}

/**
 * §8.3.3 ラベル階層ルールに従って表示要否を決定。
 *
 * 由来は常に showOrigin = true。
 * 確定度・可視性は項目状態で省略可かを判定。
 */
export function resolveLabelDisplay(
  origin: Origin,
  certainty: Certainty,
  visibility: Visibility,
): LabelDisplayHints {
  // §8.3.3 不変: 由来は常に表示
  const showOrigin = true;

  // 片側可視性は必ず表示 (誤認防止)
  const isSideOnly =
    visibility === "user_a_only" || visibility === "user_b_only";
  const isInternalOnly = visibility === "internal_only";

  // explicit_shared × high × both_visible の base case では確定度・可視性 省略可
  if (
    origin === "explicit_shared" &&
    certainty === "high" &&
    visibility === "both_visible"
  ) {
    return { showOrigin, showCertainty: false, showVisibility: false };
  }

  // inferred: 確定度必須、可視性は both のみ省略可
  if (origin === "inferred") {
    return {
      showOrigin,
      showCertainty: true,
      showVisibility: isSideOnly || isInternalOnly,
    };
  }

  // transient_summary: 全軸必須 (時間経過で消える旨含む)
  if (origin === "transient_summary") {
    return { showOrigin, showCertainty: true, showVisibility: true };
  }

  // explicit_shared だが high × both_visible 以外: 確定度・可視性 表示が安全側
  return {
    showOrigin,
    showCertainty: certainty !== "high",
    showVisibility: isSideOnly || isInternalOnly,
  };
}
