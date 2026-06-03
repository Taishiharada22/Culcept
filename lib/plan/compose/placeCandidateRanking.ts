/**
 * Place candidate ranking — P1A-2a: Google Places パネルの opt-in gentle reorder
 *
 * 設計: docs/alter-plan-place-affinity-prior-phase1-design.md / 合意フロー P1A-2a
 *
 * 役割:
 *   Google Places 候補（≤5件）を「予定タイプ(activityKey)に寄せる」**gentle** reorder。
 *   Google の関連度順を土台に、type 整合候補を**最大1ポジションだけ**浮かせる（強制並べ替えしない）。
 *   pure・副作用なし（persona / 履歴 / 距離 / 外部API / storage を使わない）。
 *
 * 不変原則（CEO×GPT P1A-2a 確定）:
 *   1. activityKey === "generic"（title 空含む）→ **一切並べ替えない**（Google 順を維持）。
 *   2. type 整合は gentle nudge（TYPE_NUDGE=1.5）＝ matched は最大 1 つ上に浮くだけ。
 *      遠い/弱い候補が「タイトルに少し合うだけ」で最上位に来ない（GPT NG 回避）。
 *   3. reason は fact-only かつ **type 整合のみ**（「この予定タイプに近い場所です」）。非整合は null。
 *   4. distance は使わない（Google の locationBias が既に距離を反映済＝Google 順位を壊さない）。
 *   5. persona は一切関与しない（signature に persona 無し）。
 *
 * full scorer rerankPlaceAffinity は使わない（距離で強く再ソートし「Google 順を壊さない」に反するため）。
 * 本modは同モジュールの純 helper activityTypeMatch のみ再利用。full scorer は P1A-3 の土台として保持。
 */

import type { ActivityIconKey } from "./activityIcon";
import { activityTypeMatch } from "./placeAffinity";

/** type 整合候補が浮く最大量（Google index 単位）。1.5 ＝ 最大 1 ポジション上昇・最上位への飛び越し無し。 */
export const TYPE_NUDGE = 1.5;

const TYPE_REASON = "この予定タイプに近い場所です";

/** reorder に必要な最小形（Google PlaceCandidate も構造的に適合）。 */
export interface RankableGoogleCandidate {
  placeId: string;
  types?: string[];
}

export interface RankedGoogleCandidate<T> {
  candidate: T;
  /** type 整合の fact reason（非整合は null）。 */
  typeReason: string | null;
}

/**
 * Google 候補を activityKey に寄せて gentle reorder（pure・安定）。
 *   - generic → Google 順を完全維持（reason 全 null）。
 *   - else    → type 整合候補を最大 1 ポジションだけ上昇（score = TYPE_NUDGE*match - googleIndex）。
 */
export function rerankGoogleCandidatesByActivity<T extends RankableGoogleCandidate>(
  results: readonly T[],
  activityKey: ActivityIconKey,
): RankedGoogleCandidate<T>[] {
  if (activityKey === "generic") {
    return results.map((candidate) => ({ candidate, typeReason: null }));
  }
  const scored = results.map((candidate, idx) => {
    const match = activityTypeMatch(candidate.types, activityKey); // 0 | 1
    return { candidate, idx, match, score: TYPE_NUDGE * match - idx };
  });
  scored.sort((a, b) => b.score - a.score || a.idx - b.idx); // 安定: Google 順を tiebreak
  return scored.map(({ candidate, match }) => ({
    candidate,
    typeReason: match === 1 ? TYPE_REASON : null,
  }));
}
