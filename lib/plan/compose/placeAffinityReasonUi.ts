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

/** ★P5 reason-only UI flag（**default OFF**）。 */
export const PLACE_AFFINITY_REASON_UI_ENABLED = false;

/** 場所候補に観測 reason を出してよいか（flag ON ∧ 非 production・default OFF）。 */
export function isPlaceAffinityReasonEnabled(): boolean {
  return PLACE_AFFINITY_REASON_UI_ENABLED && process.env.NODE_ENV !== "production"; // ★production hard block
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
