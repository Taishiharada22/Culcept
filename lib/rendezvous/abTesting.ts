// ============================================================
// A/Bテストフレームワーク
// マッチングウェイト実験のためのハッシュベース割当
// ============================================================

import type { CategoryWeights } from "./types";

export type WeightExperiment = {
  id: string;
  name: string;
  weightConfig: Partial<CategoryWeights>;
  samplePercent: number; // 0-1
  isActive: boolean;
};

/**
 * ユーザーを実験グループに割り当て
 * 決定論的ハッシュで一貫した割当を保証（同じユーザーは常に同じグループ）
 */
export function assignExperiment(
  userId: string,
  experiment: WeightExperiment,
): "control" | "treatment" {
  if (!experiment.isActive) return "control";

  const hash = simpleHash(`${userId}:${experiment.id}`);
  const bucket = (hash % 1000) / 1000; // 0..0.999

  return bucket < experiment.samplePercent ? "treatment" : "control";
}

/**
 * アクティブな実験のウェイト設定を取得
 * treatment群なら実験ウェイトを返す。control群またはアクティブ実験なしならnull。
 */
export function getExperimentWeights(
  userId: string,
  experiments: WeightExperiment[],
  baseWeights: CategoryWeights,
): { weights: CategoryWeights; experimentId: string | null } {
  const active = experiments.find((e) => e.isActive);
  if (!active) return { weights: baseWeights, experimentId: null };

  const group = assignExperiment(userId, active);
  if (group === "control") return { weights: baseWeights, experimentId: null };

  // treatment: 実験ウェイトでベースを上書き
  const merged: CategoryWeights = { ...baseWeights };
  for (const [key, value] of Object.entries(active.weightConfig)) {
    if (key in merged && typeof value === "number") {
      (merged as Record<string, number>)[key] = value;
    }
  }

  // 正規化（合計1.0）
  const keys = Object.keys(merged) as (keyof CategoryWeights)[];
  const sum = keys.reduce((s, k) => s + merged[k], 0);
  for (const key of keys) {
    merged[key] = merged[key] / sum;
  }

  return { weights: merged, experimentId: active.id };
}

/**
 * 簡易ハッシュ関数（FNV-1a inspired）
 */
function simpleHash(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash;
}
