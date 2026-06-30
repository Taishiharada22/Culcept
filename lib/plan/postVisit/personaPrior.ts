/**
 * lib/plan/postVisit/personaPrior.ts
 *   — 評価OS / ②-4: persona prior 推定（ユーザーの粗い判断傾向・pure・shadow・**順位非反映/UI 非配線**）
 *
 * ★狙い: post-visit 観測 + contextSnapshot から「この人の判断軸の傾き」を粗く推定（CEO 構想の内部土台）。
 *   例: solo_vs_with_someone / short_gap_safety_pref / time_of_day_tendency / location_category_tendency。
 * ★安全原則（false-aliveness 回避）:
 *   - 観測不足 → confidence=insufficient / preferredValue=null（断定しない）。
 *   - strength は **bounded ±PERSONA_EPSILON**（base score を逆転させる強い prior にしない）。
 *   - confidence / evidenceCount を必須で同伴。
 *   - weather/fatigue/mobilityLoad は live signal 未配線（常時 null）→ 永久 insufficient（捏造しない）。
 * ★pure: I/O/Date なし・決定論。ranking/推薦/UI に一切配線しない（読むだけ）。
 */
import type { PostVisitObservation, PostVisitResponse } from "./postVisitObservation";
import { hasContextSnapshot } from "./postVisitObservation";
import type { PostVisitContextSnapshot } from "./postVisitContext";
import { SHRINKAGE_PRIOR_STRENGTH } from "./shadowFusion";

const RESPONSE_FIT: Record<PostVisitResponse, number> = { keep: 1.0, conditional: 0.6, not_today: 0.35, no_more: 0.0 };

/** prior の強さの上限（既存 placeAffinity の PERSONA_EPSILON と同値・base 逆転しない）。 */
export const PERSONA_EPSILON = 0.05;
const MIN_PER_VALUE = 2; // 各値の最小観測数
const MIN_TOTAL = 4;     // 軸全体の最小観測数（hypothesis 入口）
const OBSERVED_TOTAL = 8; // observed 入口

/** live で populate される軸（意味を持つ）。 */
export const LIVE_PERSONA_AXES = ["companion", "gapBucket", "timeOfDay", "dayType", "locationCategory"] as const;
/** signal 未配線で常時 null＝永久 insufficient（dormant）。 */
export const DORMANT_PERSONA_AXES = ["weatherKind", "fatigue", "mobilityLoad"] as const;
type PersonaAxis = (typeof LIVE_PERSONA_AXES)[number] | (typeof DORMANT_PERSONA_AXES)[number];

const AXIS_LABEL: Record<PersonaAxis, string> = {
  companion: "solo_vs_with_someone",
  gapBucket: "short_gap_safety_pref",
  timeOfDay: "time_of_day_tendency",
  dayType: "day_type_tendency",
  locationCategory: "location_category_tendency",
  weatherKind: "weather_sensitivity",
  fatigue: "fatigue_sensitivity",
  mobilityLoad: "low_mobility_load_pref",
};

export type PersonaConfidence = "insufficient" | "hypothesis" | "observed";

export interface PersonaTendency {
  readonly axis: PersonaAxis;
  readonly label: string;
  /** fit が最も高い値（insufficient では null＝断定しない）。 */
  readonly preferredValue: string | null;
  /** baseline からの fit 差を ±PERSONA_EPSILON に clamp した bounded prior。 */
  readonly strength: number;
  readonly confidence: PersonaConfidence;
  readonly evidenceCount: number; // 軸の回答済み総数
  readonly note: string;
}

function clampEps(x: number): number {
  return Math.max(-PERSONA_EPSILON, Math.min(PERSONA_EPSILON, x));
}

/** 1 軸の傾向推定（pure）。値ごとの平均 fit を比べ、最大の値を bounded prior で返す。 */
export function estimateAxisTendency(observations: readonly PostVisitObservation[], axis: PersonaAxis): PersonaTendency {
  const label = AXIS_LABEL[axis];
  const byValue = new Map<string, { sum: number; n: number }>();
  let total = 0;
  let grandSum = 0;
  for (const o of observations) {
    if (o.response == null || !hasContextSnapshot(o)) continue;
    const v = o.contextSnapshot[axis as keyof PostVisitContextSnapshot] as string | null;
    if (v == null) continue;
    const fit = RESPONSE_FIT[o.response];
    const cur = byValue.get(v) ?? { sum: 0, n: 0 };
    cur.sum += fit;
    cur.n += 1;
    byValue.set(v, cur);
    total += 1;
    grandSum += fit;
  }

  // 各値 MIN_PER_VALUE 以上のものだけ候補に
  const eligible = [...byValue.entries()].filter(([, s]) => s.n >= MIN_PER_VALUE);
  if (total < MIN_TOTAL || eligible.length === 0) {
    return { axis, label, preferredValue: null, strength: 0, confidence: "insufficient", evidenceCount: total, note: "観測不足（推定しません）" };
  }
  const baseline = grandSum / total;
  // ★partial pooling（shadowFusion と同じ k を共有）: 各値の平均を baseline へ n/(n+k) 縮約してから比較・strength 化。
  //   証拠量が少ない値ほど baseline 寄り＝「2件でも clamp 上限」という証拠量解離を解消（cold-start 過信防止）。
  const k = SHRINKAGE_PRIOR_STRENGTH;
  const shrunkMean = (s: { sum: number; n: number }) => (s.sum + baseline * k) / (s.n + k);
  // 縮約後の平均が最大の値（同点は値名で安定）
  eligible.sort((a, b) => shrunkMean(b[1]) - shrunkMean(a[1]) || (a[0] < b[0] ? -1 : 1));
  const [topValue, topStat] = eligible[0]!;
  // strength = clampEps((rawMean − baseline) · n/(n+k))＝証拠量で減衰した bounded prior。
  const strength = clampEps(shrunkMean(topStat) - baseline);
  const confidence: PersonaConfidence = total >= OBSERVED_TOTAL && eligible.length >= 2 ? "observed" : "hypothesis";
  return {
    axis,
    label,
    preferredValue: topValue,
    strength,
    confidence,
    evidenceCount: total,
    note: confidence === "observed" ? "観測にもとづく傾向" : "まだ仮説です",
  };
}

/**
 * 全軸の persona prior 推定（pure・shadow）。live 軸 + dormant 軸（後者は常時 insufficient）。
 *   ★これは shadow ログのみ。base score を逆転させない（strength は ±ε bounded）・ranking/UI 非配線。
 */
export function estimatePersonaPrior(observations: readonly PostVisitObservation[]): PersonaTendency[] {
  const axes: PersonaAxis[] = [...LIVE_PERSONA_AXES, ...DORMANT_PERSONA_AXES];
  return axes.map((axis) => estimateAxisTendency(observations, axis));
}
