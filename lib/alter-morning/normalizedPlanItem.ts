/**
 * NormalizedPlanItem — W3-PR-8 Strict Confirmation
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §3.4
 *
 * PlanItem は型互換のため PR-8 追加フィールドを optional に持つ。
 * UI 側で `??` fallback を書かせないため、adapter 出口でこの normalizer を
 * 通して「PR-8 追加フィールドが required」な狭められた型に変換する。
 *
 * 運用規則（設計書 §3.4）:
 *   1. `adaptPipelineToLegacy` の戻り値直前で全 item を normalize
 *   2. `MorningPlanCard` は NormalizedPlanItem[] を参照
 *   3. UI コード内で `confirmationState ?? "confirmed"` のような defensive fallback は禁止
 *   4. 旧 session 由来の item（sharpness 未セット）が来た場合は "missing" 扱い → provisional に倒れる
 */

import type { SlotSharpness } from "./comprehension/eventSchema";
import type {
  ConfirmationState,
  PlanItem,
  WhereVagueSubKind,
} from "./types";

/**
 * PlanItem を UI 側で strict に扱うための狭められた型。
 *
 * すべての PR-8 追加フィールドが required。`whereVagueSubKind` のみ null 許容
 * （vague 以外では null で表現）。
 *
 * adapter 通過後の PlanItem を一度ここを通してから UI に渡す。
 * UI は NormalizedPlanItem のみを参照する。
 */
export interface NormalizedPlanItem extends PlanItem {
  /** required 化: adapter 通過後は必ず値が入る */
  confirmationState: ConfirmationState;
  whenSharpness: SlotSharpness;
  whereSharpness: SlotSharpness;
  whatSharpness: SlotSharpness;
  /**
   * vague 時のみ値を持つ。fixed/missing では undefined。
   *
   * PlanItem.whereVagueSubKind が `WhereVagueSubKind | undefined` のため、
   * NormalizedPlanItem でも同じ shape を保つ（`| null` にすると構造的 subtype
   * の互換が崩れて plan.items への代入ができなくなる）。
   *
   * 意味:
   *   - whereSharpness === "vague" のとき: WhereVagueSubKind（必ず値あり）
   *   - その他: undefined
   *
   * UI 側は whereSharpness を先に見てから分岐する（設計書 §6.3）。
   */
  whereVagueSubKind?: WhereVagueSubKind;
}

/**
 * PlanItem → NormalizedPlanItem。
 *
 * 欠損時のフォールバック:
 *   - confirmationState: "provisional"（安全側に倒す。defensive）
 *   - whenSharpness / whereSharpness / whatSharpness: "missing"
 *   - whereVagueSubKind: vague なのに sub-kind 無しなら "undecided"（最保守）、
 *                        それ以外は null
 */
export function normalizePlanItem(item: PlanItem): NormalizedPlanItem {
  const whenSharpness: SlotSharpness = item.whenSharpness ?? "missing";
  const whereSharpness: SlotSharpness = item.whereSharpness ?? "missing";
  const whatSharpness: SlotSharpness = item.whatSharpness ?? "missing";
  const confirmationState: ConfirmationState =
    item.confirmationState ?? "provisional";

  // whereVagueSubKind: vague 時のみ値。それ以外は undefined に確実に落とす。
  const whereVagueSubKind: WhereVagueSubKind | undefined =
    whereSharpness === "vague"
      ? item.whereVagueSubKind ?? "undecided" // vague なのに sub-kind 無し → 最保守
      : undefined;

  return {
    ...item,
    confirmationState,
    whenSharpness,
    whereSharpness,
    whatSharpness,
    whereVagueSubKind,
  };
}
