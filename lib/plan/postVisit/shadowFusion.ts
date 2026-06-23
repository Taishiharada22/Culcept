/**
 * lib/plan/postVisit/shadowFusion.ts
 *   — 評価OS / ②-2: shadow 融合集計（階層ベイズ・partial pooling・pure・**順位を変えない**）
 *
 * ★狙い: 複合融合エンジンの核を **shadow（計算のみ）**で。観測を 3 分解の最小形に:
 *   B_u（ユーザー基準＝grand mean）/ Q_p（場所品質＝B_u へ partial-pool した posterior）/ I_{u,p}（個人×場所 interaction）。
 *   v1 は **I_{u,p}=0 凍結**（観測薄で不安定なため・co-equal driver 化は over-assertion として棄却済み）。
 * ★honest な改善: 単純平均（fitArcReadout）と違い、薄い場所は B_u へ縮約（partial pooling）して**過信を防ぐ**。
 *   Second Self Map L4 の cold-start partial-pooling と同じ原理。
 * ★shadow: ranking/推薦/UI に一切配線しない。読むだけ・決定論・pure（Date/IO なし）。
 */
import type { PostVisitObservation, PostVisitResponse } from "./postVisitObservation";

/** 回答 → 適合値（0..1・fitArcReadout と整合）。本人の答え合わせ由来（他者評価でない）。 */
const RESPONSE_FIT: Record<PostVisitResponse, number> = {
  keep: 1.0,
  conditional: 0.6,
  not_today: 0.35,
  no_more: 0.0,
};

/** prior 強度（擬似観測数 k）。大きいほど薄い場所を B_u へ強く縮約。 */
export const SHRINKAGE_PRIOR_STRENGTH = 2;
/** 観測ゼロ時の中立 prior（断定しない）。 */
export const NEUTRAL_PRIOR = 0.5;

function answeredFit(observations: readonly PostVisitObservation[]): number[] {
  const out: number[] = [];
  for (const o of observations) {
    if (o.response != null) out.push(RESPONSE_FIT[o.response]);
  }
  return out;
}
function mean(xs: readonly number[]): number {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NEUTRAL_PRIOR;
}

export interface UserBaseline {
  /** B_u = 全回答の grand mean（観測ゼロは中立 0.5）。 */
  readonly mean: number;
  readonly n: number;
}
export function computeUserBaseline(observations: readonly PostVisitObservation[]): UserBaseline {
  const fits = answeredFit(observations);
  return { mean: mean(fits), n: fits.length };
}

export interface PlacePosterior {
  readonly placeKey: string;
  readonly n: number;                 // 回答済み観測数
  readonly rawMean: number | null;    // 縮約前の place 平均（n=0 で null）
  readonly posteriorMean: number;     // Q_p = B_u へ partial-pool した posterior
  readonly shrinkage: number;         // B_u へ寄せた度合い k/(n+k)（0..1・大=baseline 寄り）
  readonly state: "insufficient" | "tentative" | "observed"; // fitArcReadout の件数閾値と整合
}

/**
 * place 品質 Q_p を B_u へ partial-pool（共役/縮約・pure・shadow）。
 *   posteriorMean = (rawMean·n + B_u·k) / (n + k)。薄い場所ほど baseline へ縮約＝過信しない。
 */
export function computePlacePosterior(
  observations: readonly PostVisitObservation[],
  placeKey: string,
  baseline: UserBaseline,
  k: number = SHRINKAGE_PRIOR_STRENGTH,
): PlacePosterior {
  const fits = answeredFit(observations.filter((o) => o.placeKey === placeKey));
  const n = fits.length;
  const rawMean = n ? mean(fits) : null;
  const posteriorMean = ((rawMean ?? baseline.mean) * n + baseline.mean * k) / (n + k);
  const shrinkage = k / (n + k);
  const state = n === 0 ? "insufficient" : n < 3 ? "tentative" : "observed";
  return { placeKey, n, rawMean, posteriorMean, shrinkage, state };
}

export interface ShadowFusion {
  readonly baseline: UserBaseline;             // B_u
  readonly places: readonly PlacePosterior[];  // Q_p（posteriorMean 降順）
  /** I_{u,p}（個人×場所 interaction）は v1 で 0 凍結。 */
  readonly interactionFrozen: true;
}

/**
 * 観測群 → shadow 融合（pure・shadow）。全 place の Q_p を B_u へ縮約して返す。
 *   ★これは shadow ログ計算のみ。candidate 順位・推薦・UI に一切影響しない。
 */
export function buildShadowFusion(observations: readonly PostVisitObservation[]): ShadowFusion {
  const baseline = computeUserBaseline(observations);
  const keys = [...new Set(observations.filter((o) => o.response != null).map((o) => o.placeKey))];
  const places = keys
    .map((key) => computePlacePosterior(observations, key, baseline))
    .sort((a, b) => b.posteriorMean - a.posteriorMean || (a.placeKey < b.placeKey ? -1 : 1));
  return { baseline, places, interactionFrozen: true };
}
