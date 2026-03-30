// lib/avatar-fitting/weights.ts
export type LayerWeights = { l1: number; l2: number; l3: number; l4: number };
export type UseCaseWeights = { size: LayerWeights; visual: LayerWeights; color: LayerWeights; preference: LayerWeights };
export type OverallWeights = { size: number; color: number; visual: number; preference: number };

export const DEFAULT_USE_CASE_WEIGHTS: UseCaseWeights = {
  size: { l1: 0.50, l2: 0.05, l3: 0.05, l4: 0.40 },
  visual: { l1: 0.10, l2: 0.50, l3: 0.25, l4: 0.15 },
  color: { l1: 0.55, l2: 0.25, l3: 0.10, l4: 0.10 },
  preference: { l1: 0.05, l2: 0.50, l3: 0.30, l4: 0.15 },
};

export const DEFAULT_OVERALL_WEIGHTS: OverallWeights = {
  size: 0.30, color: 0.25, visual: 0.25, preference: 0.20,
};

export function adjustScoreByLayerCoverage(
  baseScore: number,
  layerWeights: LayerWeights,
  layerCoverages: { l1: number; l2: number; l3: number; l4: number },
): { adjustedScore: number; effectiveCoverage: number } {
  const effectiveCoverage =
    layerWeights.l1 * layerCoverages.l1 +
    layerWeights.l2 * layerCoverages.l2 +
    layerWeights.l3 * layerCoverages.l3 +
    layerWeights.l4 * layerCoverages.l4;
  const adjustedScore = Math.round(50 + (baseScore - 50) * effectiveCoverage);
  return {
    adjustedScore: Math.max(0, Math.min(100, adjustedScore)),
    effectiveCoverage: Math.round(effectiveCoverage * 1000) / 1000,
  };
}
