/**
 * lib/plan/compose/placeAffinityReasonUi.ts — Place Affinity P5: 場所候補の reason-only UI 補助（pure core + flag）
 *
 * ★目的（P5 案A reason-only）: 場所候補に「よく行く場所のようです」等の **控えめな観測 reason だけ**を添える。
 *   ★順位は変えない（ranking に combiner を使わない）。候補の並びは P1A-2a のまま。
 *
 * ★安全境界（CEO 方針）:
 *   - flag default OFF ∧ dev-only（production hard block）。実 UI は flag ON のときだけ。
 *   - 候補の canonical text を **正規化 key で観測 destKey と照合**するだけ（座標/住所/placeId 非関与）。
 *   - frequent/habitual のみ reason・occasional/sparse(not_enough)/未訪問 → null（沈黙）。
 *   - sensitive/redacted は P2 集計時に既に除外済（destKey null）。
 *   - raw score/visitCount/strength/内部値を出さない（reason 文字列のみ）。人格診断にしない。
 */
import { normalizeLocationText } from "@/lib/plan/mobility/mobilityObservationStore";
import { placeAffinityReasonLine, type PlaceAffinityReadiness } from "@/lib/plan/compose/placeAffinityReadiness";
import {
  placeConditionLabel,
  type PlaceCondition,
  type PlaceConditionAffinity,
} from "@/lib/plan/compose/placeConditionAffinity";

/** ★P5 reason-only UI flag（**default OFF**）。 */
export const PLACE_AFFINITY_REASON_UI_ENABLED = false;

/** 場所候補に観測 reason を出してよいか（flag ON ∧ 非 production・default OFF）。 */
export function isPlaceAffinityReasonEnabled(): boolean {
  return PLACE_AFFINITY_REASON_UI_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/**
 * ★P6-1 ranking 実反映 flag（**default OFF**・reason-only とは独立）。
 * ON で場所候補の **実順序** を combiner で穏やかに調整（familiar/condition-fit を上位へ・bounded）。
 * 候補挙動が変わる user-facing なので dev-only + 別 flag。
 */
export const PLACE_AFFINITY_RANKING_ENABLED = false;

/** 場所候補の順位を personal で調整してよいか（flag ON ∧ 非 production・default OFF）。 */
export function isPlaceAffinityRankingEnabled(): boolean {
  return PLACE_AFFINITY_RANKING_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
}

/**
 * 候補の canonical text を P2 profiles と照合し、frequent/habitual なら観測 reason を返す（pure）。
 * ★順位に影響しない（reason のみ）。not_enough / 未訪問 / occasional → null（沈黙）。
 */
export function placeCandidatePersonalReason(
  candidateCanonicalText: string,
  p2: PlaceAffinityReadiness,
): string | null {
  if (p2.status !== "ready") return null;
  const key = normalizeLocationText(candidateCanonicalText);
  if (key == null) return null;
  const profile = p2.profiles.find((p) => p.placeKey === key);
  if (!profile) return null;
  return placeAffinityReasonLine(profile); // habitual/frequent → 1 行 / occasional → null
}

/** 条件 → 表示フレーズ（P5.1）。timeband は時刻を露わさず「この時間帯」・weekday/weather はラベル。 */
function conditionPhrase(condition: PlaceCondition): string | null {
  if (condition.dimension === "timeband") return "この時間帯"; // ★具体時刻を出さない（privacy）
  if (condition.dimension === "weekday") return condition.value === "weekend" ? "週末" : "平日";
  return placeConditionLabel(condition); // weather: 雨の日/雪の日/… or null（normal）
}

/**
 * ★P5.1: 候補の最良 reason（pure）。条件付き（p3List を優先順で）→ 該当 place が skew + sufficient なら
 *   「{この時間帯/週末/雨の日 …}に選ばれやすい場所のようです」。無ければ無条件 P2（「よく行く」）に fallback。
 *   ★順位に影響しない（reason のみ）。not_enough / occasional / skew 無 / 未訪問 → 沈黙。
 */
export function placeCandidateBestReason(
  candidateCanonicalText: string,
  p2: PlaceAffinityReadiness,
  p3List: readonly PlaceConditionAffinity[],
): string | null {
  const key = normalizeLocationText(candidateCanonicalText);
  if (key == null) return null;

  for (const p3 of p3List) {
    if (p3.status !== "ready") continue;
    const prof = p3.profiles.find((p) => p.placeKey === key);
    if (prof && prof.skewsToCondition && prof.strength !== "occasional") {
      const phrase = conditionPhrase(p3.condition);
      if (phrase) return `${phrase}に選ばれやすい場所のようです。`;
    }
  }
  // fallback: 無条件「よく行く」
  return placeCandidatePersonalReason(candidateCanonicalText, p2);
}
