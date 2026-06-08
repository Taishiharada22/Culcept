/**
 * lib/plan/compose/placeAffinityShadowRanking.ts — Place Affinity P5.3: shadow ranking 検証（pure・未適用）
 *
 * ★目的（A1 の「activate 前に shadow で検証」playbook を place ranking に適用）:
 *   P4 combiner が候補をどう並べ替える **であろうか** を **適用せずに** 算出し、一般則順との差分を計測する。
 *   実 ranking には一切影響しない（観測・検証のみ）。ranking 実反映は stop gate（別途 CEO 判断）。
 *
 * ★安全境界:
 *   - **適用しない**: 戻り値は分析のみ。候補の実順序を変えない。
 *   - pure / IO なし / 新規データなし / belief 非汚染。
 *   - 偽数値を出さない（順序＝placeKey 列・差分＝実カウント）。
 */
import {
  combinePlaceAffinity,
  type CombinerConfig,
  type CombinerInput,
  DEFAULT_COMBINER_CONFIG,
} from "@/lib/plan/compose/placeAffinityCombiner";
import type { PlaceAffinityReadiness } from "@/lib/plan/compose/placeAffinityReadiness";
import type { PlaceConditionAffinity } from "@/lib/plan/compose/placeConditionAffinity";

export interface ShadowRankingResult {
  /** 一般則順（generalScore 降順・同点は入力順）の placeKey 列。 */
  readonly generalOrder: readonly string[];
  /** combiner 反映時の順（shadow・combinedScore 降順）の placeKey 列。 */
  readonly combinedOrder: readonly string[];
  /** 順序が変わったか。 */
  readonly orderChanged: boolean;
  /** 位置が変わった候補数（実カウント）。 */
  readonly changedPositionCount: number;
  /** 最大の順位移動量（bounded nudge ゆえ小さいはず＝検証点）。 */
  readonly maxRankShift: number;
  /** personal nudge が効いた候補数。 */
  readonly personalAppliedCount: number;
}

/**
 * ★P5.3 core: shadow ranking を算出（pure・**適用しない**）。
 *   general 順 vs combiner 順を比較し差分を返す。combiner は P4（bounded nudge・clamp）を使用。
 */
export function buildShadowRanking(
  inputs: readonly CombinerInput[],
  personal: { readonly p2: PlaceAffinityReadiness; readonly p3?: PlaceConditionAffinity | null },
  config: CombinerConfig = DEFAULT_COMBINER_CONFIG,
): ShadowRankingResult {
  // 一般則順（安定ソート: generalScore 降順・同点は入力順）
  const generalOrder = inputs
    .map((inp, i) => ({ inp, i }))
    .sort((a, b) => b.inp.generalScore - a.inp.generalScore || a.i - b.i)
    .map(({ inp }) => inp.placeKey);

  // combiner 反映順（shadow）
  const combined = combinePlaceAffinity(inputs, personal, config);
  const combinedOrder = combined.map((c) => c.placeKey);

  // 差分
  const genIndex = new Map(generalOrder.map((k, i) => [k, i] as const));
  let changedPositionCount = 0;
  let maxRankShift = 0;
  combinedOrder.forEach((k, ci) => {
    const gi = genIndex.get(k) ?? ci;
    if (gi !== ci) changedPositionCount += 1;
    const shift = Math.abs(gi - ci);
    if (shift > maxRankShift) maxRankShift = shift;
  });

  return {
    generalOrder,
    combinedOrder,
    orderChanged: changedPositionCount > 0,
    changedPositionCount,
    maxRankShift,
    personalAppliedCount: combined.filter((c) => c.personalApplied).length,
  };
}

/**
 * ★P6-0: 現在の表示順（placeKey 列）→ shadow 用 CombinerInput[]（generalScore = 表示順の逆＝上位ほど高い）。pure。
 *   「今の候補順を personal がどう並べ替えるか」を shadow するための baseline。
 */
export function shadowInputsFromDisplayOrder(orderedKeys: readonly string[]): CombinerInput[] {
  const n = orderedKeys.length;
  return orderedKeys.map((placeKey, i) => ({ placeKey, generalScore: n - i }));
}
