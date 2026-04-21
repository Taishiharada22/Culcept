/**
 * Anchor Search Gate — W3-PR-9 予約スタブ（PR-8 で interface のみ確定）
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §2.7, §7.1
 *
 * PR-9（Anchor-Based Search）が実装する、検索発火判断の唯一の場所。
 * PR-8 ではこのファイルを throw stub として置き、interface と
 * deterministic 発火条件を JSDoc に固定する。
 *
 * **判断の分散 = 過去の崩れの主因** なので、PR-9 で必ずこの関数に集約する。
 * morningProtocol / planningEngine / placeResolver が独自に
 * 「もしかしてここで検索？」の判断を持つことを禁止する。
 *
 * 発火条件（deterministic, LLM 非依存）:
 *
 * ```
 * shouldFireAnchorSearch(item, session) =
 *     item.whereSharpness === "vague"
 *  && item.whereVagueSubKind === "category_chain"    // C 分類のみ
 *  && anchorHint(item, session) != null               // 近傍 anchor / baseline / 直前 fixed
 *  && !alreadyResolved(item)                          // 既に解決済みの候補がある場合は非対象
 * ```
 *
 *   - anchor sub-kind は検索対象ではない（それ自体が位置情報 = B 分類）
 *   - undecided sub-kind は clarify が必要（検索前）
 *   - LLM / session 状態に依存する「気持ち」での発火は禁止
 */

import type { NormalizedPlanItem } from "../normalizedPlanItem";
import type { MorningSession } from "../types";

/**
 * Anchor search を発火すべきかの deterministic 判定。
 *
 * **PR-9 で実装**。PR-8 ではこの関数を呼ぶコードは存在しない。
 *
 * @throws Error PR-9 未実装のため、呼ばれたら throw する。
 */
export function shouldFireAnchorSearch(
  _item: NormalizedPlanItem,
  _session: MorningSession,
): boolean {
  throw new Error(
    "[anchorSearchGate] PR-9 not implemented. " +
      "Do not call shouldFireAnchorSearch from PR-8 code. " +
      "See docs/alter-morning-strict-confirmation-design.md §2.7 / §7.1.",
  );
}
