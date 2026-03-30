/**
 * ガウシアン類似適合: 近いほど高得点
 *
 * 線形 (1 - |a-b|) では差0.3→0.7が一律。
 * ガウシアンカーブなら:
 *   - 差0.1 → 0.97（ほぼ完璧）
 *   - 差0.2 → 0.88（十分に近い）
 *   - 差0.3 → 0.74（まだ許容）
 *   - 差0.5 → 0.37（大きな乖離）
 *   - 差0.7 → 0.09（ほぼ不適合）
 *
 * σ=0.35 は「差0.35で約0.5」になるチューニング。
 * 近い者同士の微差を寛容に、遠い者同士を厳しく評価する。
 */
const SIGMA = 0.35;
const SIGMA_SQ_2 = 2 * SIGMA * SIGMA; // 0.245

export function similarityScore(a: number, b: number): number {
  const diff = a - b;
  return Math.exp(-(diff * diff) / SIGMA_SQ_2);
}

/**
 * 補完適合: 真逆ほど高得点（ガウシアン版）
 */
export function complementScore(a: number, b: number): number {
  const target = 1 - a;
  const diff = target - b;
  return Math.exp(-(diff * diff) / SIGMA_SQ_2);
}

/**
 * 混合適合: similarity_vs_complementarity に応じて類似と補完を混合
 * complementPreference: 0 = 類似のみ, 1 = 補完のみ
 */
export function mixedFitScore(
  selfValue: number,
  otherValue: number,
  complementPreference: number,
): number {
  const sim = similarityScore(selfValue, otherValue);
  const comp = complementScore(selfValue, otherValue);
  return sim * (1 - complementPreference) + comp * complementPreference;
}
