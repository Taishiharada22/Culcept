// lib/stargazer/confidenceEngine.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Stargazer 確信度エンジン — Horizon Function
//
// 設計思想:
// 「人間のことを120問で理解できると思うな。100%は不可能。追求はできる。」
//
// 3つの独立したシグナルの加重幾何平均 × 到達不可能な上限 (0.85)
// ・C_volume — 観測量（何回観測したか）
// ・C_temporal — 時間分散（何日にわたって観測したか）
// ・C_consistency — 再観測一致性（同じ質問に日を開けて同じ答えが返るか）
//
// 100%は数学的に到達不可能。
// 矛盾は罰さない。矛盾は「その人が複雑である」という理解。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━ Types ━━━━━━━━━━━

export interface ReobservationPair {
  score1: number;
  score2: number;
  date1: string;
  date2: string;
  variantId: string;
}

export interface AxisConfidenceInput {
  axisId: TraitAxisKey;
  observationCount: number;
  uniqueDays: number;
  reobservationPairs: ReobservationPair[];
  stdDev: number;
}

export interface AxisConfidenceResult {
  confidence: number;        // 0 to HARD_CAP (0.85)
  volumeSignal: number;      // 0 to ~1 (never exactly 1)
  temporalSignal: number;    // 0 to ~1
  consistencySignal: number; // 0 to ~1
  complexityFlag: boolean;   // true = genuine human complexity on this axis
  pairCount: number;
}

export interface TypeMatch {
  code: string;
  label: string;
  emoji: string;
  score: number;
}

// ━━━━━━━━━━━ Tunable Constants ━━━━━━━━━━━

/** 到達不可能な確信度上限。年単位の観測でもこれを超えない。
 * 臨床心理の再検査信頼性が0.7-0.85。AIベースがそれに並ぶことはない。 */
export const HARD_CAP = 0.65;

/** 観測量の半飽和点。200問で飽和曲線の63%に到達（以前は30問で早すぎた）。 */
export const K_VOLUME = 200;

/** 時間分散の半飽和点。90日で63%（以前は20日で早すぎた）。 */
export const K_TEMPORAL = 90;

/** 再観測ペアの半飽和点。15ペアで63%（以前は5ペアで早すぎた）。 */
export const K_PAIRS = 15;

/** 加重幾何平均の重み */
export const W_VOLUME = 0.5;
export const W_TEMPORAL = 0.3;
export const W_CONSISTENCY = 0.2;

/** 再観測ペアなし時のベースライン確信度 */
export const CONSISTENCY_BASELINE = 0.3;

/** 時間分散の最低保証（初回セッション用） */
export const TEMPORAL_FLOOR = 0.15;

/** stdDev がこの値を超えると complexityFlag = true */
export const COMPLEXITY_THRESHOLD = 0.4;

// ━━━━━━━━━━━ Core Math ━━━━━━━━━━━

/**
 * 対数飽和曲線: 0から始まり1に漸近するが到達しない
 */
function saturation(x: number, k: number): number {
  if (x <= 0) return 0;
  return 1 - Math.exp(-x / k);
}

/**
 * シグモイド関数: 型の明確度（typeClarity）に使用
 */
function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// ━━━━━━━━━━━ Axis Confidence ━━━━━━━━━━━

/**
 * 軸別の確信度を計算する
 *
 * confidence = HARD_CAP × (C_volume^W_VOLUME × C_temporal^W_TEMPORAL × C_consistency^W_CONSISTENCY)
 */
export function computeAxisConfidence(
  input: AxisConfidenceInput
): AxisConfidenceResult {
  // C_volume: 観測量
  const volumeSignal = saturation(input.observationCount, K_VOLUME);

  // C_temporal: 時間分散（最低保証あり）
  const rawTemporal = saturation(input.uniqueDays, K_TEMPORAL);
  const temporalSignal = Math.max(TEMPORAL_FLOOR, rawTemporal);

  // C_consistency: 再観測一致性
  let consistencySignal: number;
  const pairCount = input.reobservationPairs.length;

  if (pairCount === 0) {
    // ペアなし — ベースライン
    consistencySignal = CONSISTENCY_BASELINE;
  } else {
    // ペアごとの安定性: 1 - |delta| / 2  (scoreは-1〜+1なので差の最大は2)
    const pairStabilities = input.reobservationPairs.map((pair) => {
      const delta = Math.abs(pair.score1 - pair.score2);
      return 1 - delta / 2;
    });
    const avgStability =
      pairStabilities.reduce((s, v) => s + v, 0) / pairStabilities.length;

    // ペア数が増えるほど一致性の確信が強まる
    const pairFactor = saturation(pairCount, K_PAIRS);
    consistencySignal = pairFactor * avgStability;
  }

  // 加重幾何平均
  const geometricMean =
    Math.pow(volumeSignal, W_VOLUME) *
    Math.pow(temporalSignal, W_TEMPORAL) *
    Math.pow(consistencySignal, W_CONSISTENCY);

  const confidence = HARD_CAP * geometricMean;

  // 複雑性フラグ: 矛盾は罰さない。理解として記録する。
  const complexityFlag = input.stdDev > COMPLEXITY_THRESHOLD;

  return {
    confidence,
    volumeSignal,
    temporalSignal,
    consistencySignal,
    complexityFlag,
    pairCount,
  };
}

// ━━━━━━━━━━━ Overall Type Confidence ━━━━━━━━━━━

/**
 * 全体の型確信度を計算する
 *
 * overallConfidence = HARD_CAP × weightedMean(axisConfidences) × typeClarity
 */
export function computeOverallTypeConfidence(
  axisConfidences: Record<string, AxisConfidenceResult>,
  topMatches: TypeMatch[],
  typeTraitWeights?: Record<string, number>
): number {
  // 軸確信度の加重平均
  const entries = Object.entries(axisConfidences);
  if (entries.length === 0) return 0;

  let weightSum = 0;
  let confidenceSum = 0;

  for (const [axisId, result] of entries) {
    // 型のtrait weightsがあれば、重要な軸ほど重みを大きくする
    const axisWeight = typeTraitWeights?.[axisId]
      ? Math.abs(typeTraitWeights[axisId]) + 0.1
      : 1;
    weightSum += axisWeight;
    confidenceSum += result.confidence * axisWeight;
  }

  const meanConfidence = weightSum > 0 ? confidenceSum / weightSum : 0;

  // 型の明確度: 1位と2位のスコア差が大きいほど高い
  let typeClarity = 0.5; // デフォルト（差がない場合）
  if (topMatches.length >= 2) {
    const scoreDiff = topMatches[0].score - topMatches[1].score;
    typeClarity = sigmoid(scoreDiff * 5);
  } else if (topMatches.length === 1) {
    typeClarity = 0.7; // 1タイプのみ → やや確信
  }

  // meanConfidenceは既にHARD_CAPの影響を受けているが、
  // typeClarityとの乗算で更に下がる。最終上限はHARD_CAP。
  return Math.min(HARD_CAP, meanConfidence * typeClarity);
}

// ━━━━━━━━━━━ Volume-Only Fallback ━━━━━━━━━━━

/**
 * スナップショットデータがない場合の簡易確信度（オンボーディング用）
 * 時間分散データがないので、最大0.5に制限
 */
export function computeVolumeOnlyConfidence(observationCount: number): number {
  const volume = saturation(observationCount, K_VOLUME);
  // 時間・一致性データなし → 大幅に制限
  return Math.min(0.5, HARD_CAP * volume * TEMPORAL_FLOOR);
}

// ━━━━━━━━━━━ Improved Type Confidence (v2) ━━━━━━━━━━━

/** 軸ごとの最小推奨観測数 — これ未満は「薄さペナルティ」 */
export const AXIS_MIN_OBSERVATIONS: Partial<Record<string, number>> = {
  classic_vs_trendy: 3,
  social_initiative: 3,
  minimal_vs_maximal: 3,
  tradition_vs_novelty: 3,
  // その他は 2 がデフォルト
};

const DEFAULT_MIN_OBSERVATIONS = 2;

/**
 * 改善版：全体の型確信度を計算する（v2）
 *
 * 改善点:
 * 1. 未観測軸を平均から除外（幾何平均の崩壊を防止）
 * 2. カバレッジファクターで「どれだけの関連軸を観測したか」を反映
 * 3. 薄さペナルティで観測数不足の軸の影響を調整
 * 4. 推論軸は低い重みで含める（完全無視よりは情報として有用）
 */
export function computeOverallTypeConfidenceV2(
  axisConfidences: Record<string, AxisConfidenceResult>,
  topMatches: TypeMatch[],
  typeTraitWeights?: Record<string, number>,
  inferredAxes?: Set<string>,
): number {
  if (Object.keys(axisConfidences).length === 0) return 0;

  // 型の関連軸を特定（typeTraitWeightsがあればそこに含まれる軸のみ）
  const relevantAxisIds = typeTraitWeights
    ? Object.keys(typeTraitWeights).filter((k) => Math.abs(typeTraitWeights[k]) > 0.05)
    : Object.keys(axisConfidences);

  // 観測済み + 推論済みに分割
  let observedWeightSum = 0;
  let observedConfidenceSum = 0;
  let inferredWeightSum = 0;
  let inferredConfidenceSum = 0;
  let observedCount = 0;

  for (const axisId of relevantAxisIds) {
    const result = axisConfidences[axisId];
    if (!result) continue;

    const baseWeight = typeTraitWeights?.[axisId]
      ? Math.abs(typeTraitWeights[axisId]) + 0.1
      : 1;

    // 薄さペナルティ: 観測数が最小推奨未満なら信頼度を割引
    const minObs = AXIS_MIN_OBSERVATIONS[axisId] ?? DEFAULT_MIN_OBSERVATIONS;
    let adjustedConfidence = result.confidence;
    if (result.pairCount === 0 && result.volumeSignal < saturationForCount(minObs)) {
      // 観測不足 → sqrt ペナルティ
      const ratio = Math.max(0.1, result.volumeSignal / saturationForCount(minObs));
      adjustedConfidence *= Math.sqrt(ratio);
    }

    if (inferredAxes?.has(axisId)) {
      // 推論軸は重みを半減
      inferredWeightSum += baseWeight * 0.5;
      inferredConfidenceSum += adjustedConfidence * baseWeight * 0.5;
    } else {
      observedWeightSum += baseWeight;
      observedConfidenceSum += adjustedConfidence * baseWeight;
      observedCount++;
    }
  }

  const totalWeight = observedWeightSum + inferredWeightSum;
  if (totalWeight === 0) return 0;

  const meanConfidence = (observedConfidenceSum + inferredConfidenceSum) / totalWeight;

  // カバレッジファクター: 関連軸のうち何割を観測したか
  const totalRelevant = relevantAxisIds.length;
  const coverageFactor = totalRelevant > 0
    ? Math.min(1, (observedCount + (inferredAxes?.size ?? 0) * 0.3) / totalRelevant)
    : 0.5;

  // 型の明確度
  let typeClarity = 0.5;
  if (topMatches.length >= 2) {
    const scoreDiff = topMatches[0].score - topMatches[1].score;
    typeClarity = sigmoid(scoreDiff * 5);
  } else if (topMatches.length === 1) {
    typeClarity = 0.7;
  }

  return Math.min(HARD_CAP, meanConfidence * coverageFactor * typeClarity);
}

/** saturation関数のcount版（K_VOLUMEベース） */
function saturationForCount(count: number): number {
  return saturation(count, K_VOLUME);
}

// ━━━━━━━━━━━ Snapshot → Input Helpers ━━━━━━━━━━━

export interface AxisSnapshot {
  axis_id: string;
  score: number;
  session_date: string;
  variant_id?: string | null;
}

/**
 * DBスナップショットから AxisConfidenceInput を構築する
 */
export function buildAxisConfidenceInputs(
  snapshots: AxisSnapshot[],
  axisIds: readonly string[]
): Record<string, AxisConfidenceInput> {
  const result: Record<string, AxisConfidenceInput> = {};

  for (const axisId of axisIds) {
    const axisSnapshots = snapshots.filter((s) => s.axis_id === axisId);
    const observationCount = axisSnapshots.length;

    // uniqueDays
    const uniqueDays = new Set(
      axisSnapshots.map((s) => s.session_date)
    ).size;

    // stdDev
    let stdDev = 0;
    if (axisSnapshots.length >= 2) {
      const scores = axisSnapshots.map((s) => s.score);
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance =
        scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
      stdDev = Math.sqrt(variance);
    }

    // reobservationPairs: 同じvariant_idで異なるsession_dateのペア
    const reobservationPairs: ReobservationPair[] = [];
    const byVariant = new Map<string, AxisSnapshot[]>();

    for (const snap of axisSnapshots) {
      if (!snap.variant_id) continue;
      const existing = byVariant.get(snap.variant_id) ?? [];
      existing.push(snap);
      byVariant.set(snap.variant_id, existing);
    }

    for (const [variantId, variantSnaps] of byVariant) {
      // 異日のペアを抽出
      const byDate = new Map<string, AxisSnapshot>();
      for (const snap of variantSnaps) {
        if (!byDate.has(snap.session_date)) {
          byDate.set(snap.session_date, snap);
        }
      }
      const dateEntries = Array.from(byDate.entries());
      // 全ペアの組み合わせ（最大10ペアまで）
      for (let i = 0; i < dateEntries.length && reobservationPairs.length < 10; i++) {
        for (let j = i + 1; j < dateEntries.length && reobservationPairs.length < 10; j++) {
          reobservationPairs.push({
            score1: dateEntries[i][1].score,
            score2: dateEntries[j][1].score,
            date1: dateEntries[i][0],
            date2: dateEntries[j][0],
            variantId,
          });
        }
      }
    }

    result[axisId] = {
      axisId: axisId as TraitAxisKey,
      observationCount,
      uniqueDays,
      reobservationPairs,
      stdDev,
    };
  }

  return result;
}
