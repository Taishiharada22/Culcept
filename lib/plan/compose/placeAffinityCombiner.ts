/**
 * lib/plan/compose/placeAffinityCombiner.ts — Place Affinity P4: 一般則 × 本人固有の結合（pure・未配線）
 *
 * ★目的: P1A 一般則 scorer（distance/type/freq/history）に、P2 revealed preference（よく行く）+
 *   P3 条件付き（今日の条件に合う）を **bounded nudge** で穏やかに反映する。★UI/候補生成に **未配線**（pure）。
 *
 * ★設計原則（A2 context modifier の規律を場所に適用）:
 *   - general を主、personal は **bounded な押し上げのみ**: combinedScore = generalScore + clamp(nudge, 0, maxNudge)。
 *   - ★nudge ≥ 0（**未訪問 place を罰しない**）→ filter bubble を作らず探索を潰さない（over-personalization防止）。
 *   - ★clamp（maxNudge）: 明確な general 勝者を personal が覆せない。
 *   - ★sufficient gate: P2/P3 が "ready" のときだけ反映・薄ければ general-only（fallback）。
 *   - conflict: bounded ゆえ general 優先。reason は P3（今日の条件）> P2（よく行く）で最も具体的な 1 つ。
 *   - privacy: P2/P3（既に sensitive 除外・座標なし）を placeKey で照合のみ。**新規データなし**・pure。
 *   - ★人格診断にしない（reason は観測トーン・P2/P3 builder に委譲）。偽の確率を表示しない（score は内部順位用）。
 */
import {
  placeAffinityReasonLine,
  type PlaceAffinityReadiness,
  type PlaceVisitStrength,
} from "@/lib/plan/compose/placeAffinityReadiness";
import {
  placeConditionReasonLine,
  type PlaceCondition,
  type PlaceConditionAffinity,
} from "@/lib/plan/compose/placeConditionAffinity";

/** 一般則で score 済みの候補（placeKey は P2/P3 照合用の正規化 locationText）。 */
export interface CombinerInput {
  readonly placeKey: string;
  /** P1A baseScore（内部順位用・表示しない）。 */
  readonly generalScore: number;
}

/** personal の根拠（reason 用・P3 を優先）。 */
export type PersonalPlaceNote =
  | { readonly kind: "condition_fit"; readonly condition: PlaceCondition }
  | { readonly kind: "frequent_place"; readonly strength: PlaceVisitStrength };

export interface CombinedPlace {
  readonly placeKey: string;
  readonly generalScore: number;
  /** [0, maxNudge]（押し上げのみ・未訪問は 0）。 */
  readonly personalNudge: number;
  readonly combinedScore: number;
  readonly rank: number;
  readonly personalNote: PersonalPlaceNote | null;
  readonly personalApplied: boolean;
}

export interface CombinerConfig {
  /** personal nudge の上限（general を強く上書きしない）。 */
  readonly maxNudge: number;
  readonly habitualBoost: number;
  readonly frequentBoost: number;
  /** 今日の条件に skew している place の押し上げ。 */
  readonly conditionFitBoost: number;
}

/** ★固定初期値（保守的・較正 backlog）。baseScore 上限 ~2.15 に対し maxNudge 0.25 ≒ 1 割強。 */
export const DEFAULT_COMBINER_CONFIG: CombinerConfig = {
  maxNudge: 0.25,
  habitualBoost: 0.15,
  frequentBoost: 0.08,
  conditionFitBoost: 0.1,
};

/**
 * ★P4 core: 一般則候補 + P2/P3 → 結合ランキング（pure・未配線）。
 *   sufficient gate（ready のみ）・bounded nudge（≥0・clamp）・general 優先。
 */
export function combinePlaceAffinity(
  inputs: readonly CombinerInput[],
  personal: { readonly p2: PlaceAffinityReadiness; readonly p3?: PlaceConditionAffinity | null },
  config: CombinerConfig = DEFAULT_COMBINER_CONFIG,
): CombinedPlace[] {
  // combinedScore 降順・同点は入力（general）順を保つ（安定）。rank を付与。
  return scorePlaceCandidates(inputs, personal, config)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.combinedScore - a.c.combinedScore || a.i - b.i)
    .map(({ c }, idx) => ({ ...c, rank: idx + 1 }));
}

/**
 * ★per-item scoring（**入力順・未ソート**・pure）。combinePlaceAffinity と P6-1 ranking が共有。
 *   sufficient gate / bounded nudge≥0 / clamp は同一。rank は 0（呼び側が付与）。
 */
export function scorePlaceCandidates(
  inputs: readonly CombinerInput[],
  personal: { readonly p2: PlaceAffinityReadiness; readonly p3?: PlaceConditionAffinity | null },
  config: CombinerConfig = DEFAULT_COMBINER_CONFIG,
): CombinedPlace[] {
  // ★sufficient gate: ready のときだけ map 化（not_enough は空＝general-only fallback）
  const p2Map = new Map(
    personal.p2.status === "ready" ? personal.p2.profiles.map((p) => [p.placeKey, p] as const) : [],
  );
  const p3 = personal.p3 && personal.p3.status === "ready" ? personal.p3 : null;
  const p3Map = new Map(p3 ? p3.profiles.map((p) => [p.placeKey, p] as const) : []);

  return inputs.map((inp) => {
    let nudge = 0;
    let note: PersonalPlaceNote | null = null;

    // P3（今日の条件に合う）— note を優先（「今日のあなたなら」が最も具体的）
    const cond = p3Map.get(inp.placeKey);
    if (cond && cond.skewsToCondition && cond.strength !== "occasional") {
      nudge += config.conditionFitBoost;
      note = { kind: "condition_fit", condition: p3!.condition };
    }

    // P2（よく行く）
    const fav = p2Map.get(inp.placeKey);
    if (fav) {
      if (fav.strength === "habitual") nudge += config.habitualBoost;
      else if (fav.strength === "frequent") nudge += config.frequentBoost;
      if (note === null && fav.strength !== "occasional") note = { kind: "frequent_place", strength: fav.strength };
    }

    // ★over-personalization防止: clamp [0, maxNudge]（≥0 ゆえ未訪問を罰しない）
    nudge = Math.min(config.maxNudge, Math.max(0, nudge));

    return {
      placeKey: inp.placeKey,
      generalScore: inp.generalScore,
      personalNudge: nudge,
      combinedScore: inp.generalScore + nudge,
      rank: 0,
      personalNote: note,
      personalApplied: nudge > 0,
    };
  });
}

/**
 * ★personalNote → 観測トーンの 1 行（P2/P3 の reason builder に委譲＝copy の単一源・人格診断にしない）。
 * note なし → null（沈黙）。
 */
export function combinedPersonalReasonLine(note: PersonalPlaceNote | null): string | null {
  if (!note) return null;
  if (note.kind === "frequent_place") {
    return placeAffinityReasonLine({ placeKey: "", visitCount: 0, strength: note.strength });
  }
  // condition_fit: P3 builder に委譲（profile の count 系は reason で未使用）
  return placeConditionReasonLine(
    { placeKey: "", underConditionCount: 0, totalCount: 0, skewsToCondition: true, strength: "frequent" },
    note.condition,
  );
}
