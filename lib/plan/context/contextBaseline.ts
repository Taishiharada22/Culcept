/**
 * lib/plan/context/contextBaseline.ts — Phase A2-4: Personal Baseline（本人の「普段」）pure helper
 *
 * ★目的（Personal Reality Graph の核）: context modifier の「普段より」を **一般則**でなく
 *   **この人の分布**を基準に判定するための baseline を、本人の最近の日々から純粋に算出する。
 *   packed が常態の人にとって packed は tightening でない＝「あなたにとっての普段」を知る。
 *
 * ★安全境界（CEO 方針）:
 *   - 薄いデータで断定しない: n<minDays は sufficient=false（personalize しない＝一般則 fallback）。
 *   - tie（明確な最頻が無い）は typical=null（断定しない）。
 *   - 偽数値を出さない（n は実カウント）。保存しない（決定時 read-only・belief 非汚染）。
 *   - pure / Date 不使用 / DB・network なし。
 *
 * ★v0 制約: 母集団は呼び出し側が渡す「見えている日々の density」（完全な履歴でない）。closeout に明記。
 */
import type { DensityLevel } from "@/lib/plan/context/contextModifier";

export interface DensityBaseline {
  /** 本人の典型 density（最頻・明確な最頻が無い/薄い → null）。 */
  readonly typical: DensityLevel | null;
  /** baseline の母数（観測日数）。 */
  readonly n: number;
  /** personalize に足るか（n≥minDays ∧ typical≠null）。false なら一般則 fallback。 */
  readonly sufficient: boolean;
}

export interface DensityBaselineConfig {
  /** personalize に必要な最小観測日数（薄いデータで断定しない）。 */
  readonly minDays: number;
}

export const DEFAULT_DENSITY_BASELINE_CONFIG: DensityBaselineConfig = {
  minDays: 5,
};

const DENSITY_LEVELS: readonly DensityLevel[] = ["sparse", "balanced", "packed"];

/**
 * 本人の density baseline を算出（pure）。
 * typical = 厳密な最頻（同率トップが複数 → null＝断定しない）。sufficient = n≥minDays ∧ typical≠null。
 */
export function buildDensityBaseline(
  densities: readonly DensityLevel[],
  config: DensityBaselineConfig = DEFAULT_DENSITY_BASELINE_CONFIG,
): DensityBaseline {
  const n = densities.length;
  if (n === 0) return { typical: null, n: 0, sufficient: false };

  const counts: Record<DensityLevel, number> = { sparse: 0, balanced: 0, packed: 0 };
  for (const d of densities) counts[d] += 1;

  let topLevel: DensityLevel | null = null;
  let topCount = -1;
  let tie = false;
  for (const lvl of DENSITY_LEVELS) {
    const c = counts[lvl];
    if (c > topCount) {
      topCount = c;
      topLevel = lvl;
      tie = false;
    } else if (c === topCount) {
      tie = true; // 同率トップ → 明確な最頻なし
    }
  }

  const typical = tie ? null : topLevel;
  const sufficient = n >= config.minDays && typical !== null;
  return { typical, n, sufficient };
}
