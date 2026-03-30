// ============================================================
// 3層合成ロジック
// 固定層 (60%) / 可変層 (25%) / 当日層 (15%)
// ============================================================

import type {
  ContextType,
  UserQuestionResponse,
  UserDynamicPreference,
  UserFeatureVector,
  ContextScoreResult,
} from "./types";
import { ALL_CONTEXTS } from "./types";
import { DEFAULT_LAYER_WEIGHTS } from "./constants";
import { computeContextScores } from "./contextScore";

// ---------- Layer Types ----------

export type MergedScoreResult = {
  /** 合成後のスコア (0..100) */
  scores: Record<ContextType, number>;
  /** 各層のスコア (デバッグ用) */
  layers: {
    fixed: Record<ContextType, number>;
    variable: Record<ContextType, number>;
    daily: Record<ContextType, number>;
  };
  bestContext: ContextType;
};

// ---------- Main Merge ----------

/**
 * 固定層 / 可変層 / 当日層を合成してスコアを算出
 *
 * 固定層: 初回オンボーディングの回答ベース（安定した価値観）
 * 可変層: ここ数週間の傾向反映
 * 当日層: 今日の気分・温度
 *
 * 合成比率: 60 / 25 / 15 (定数で管理)
 */
export function mergeLayerScores(params: {
  /** 固定層: 初回回答ベースのcontextScores */
  fixedScores: ContextScoreResult;
  /** 可変層: 動的プリファレンス（数週間の傾向） */
  variablePreference?: UserDynamicPreference | null;
  /** 当日層: 今日の動的プリファレンス */
  dailyPreference?: UserDynamicPreference | null;
  /** 合成比率のオーバーライド */
  layerWeights?: typeof DEFAULT_LAYER_WEIGHTS;
}): MergedScoreResult {
  const { fixedScores, variablePreference, dailyPreference } = params;
  const weights = params.layerWeights ?? DEFAULT_LAYER_WEIGHTS;

  const fixedLayer: Record<ContextType, number> = {
    friend: fixedScores.friend,
    romance: fixedScores.romance,
    orbiter: fixedScores.orbiter,
    cocreation: fixedScores.cocreation,
  };

  // 可変層: contextBias + moodAdjustmentsを反映
  const variableLayer = computeDynamicLayerScores(
    fixedLayer,
    variablePreference,
  );

  // 当日層: 同様
  const dailyLayer = computeDynamicLayerScores(fixedLayer, dailyPreference);

  // 合成
  const merged: Record<ContextType, number> = {
    friend: 0,
    romance: 0,
    orbiter: 0,
    cocreation: 0,
  };

  for (const ctx of ALL_CONTEXTS) {
    merged[ctx] = Math.round(
      fixedLayer[ctx] * weights.fixed +
        variableLayer[ctx] * weights.variable +
        dailyLayer[ctx] * weights.daily,
    );
    // 0..100にクランプ
    merged[ctx] = Math.max(0, Math.min(100, merged[ctx]));
  }

  // bestContext
  const bestContext = (
    Object.entries(merged) as [ContextType, number][]
  ).sort((a, b) => b[1] - a[1])[0][0];

  return {
    scores: merged,
    layers: {
      fixed: fixedLayer,
      variable: variableLayer,
      daily: dailyLayer,
    },
    bestContext,
  };
}

// ---------- Dynamic Layer Scores ----------

/**
 * 動的プリファレンスからレイヤースコアを計算
 *
 * contextBias: どの文脈を今は開きたいか (0..1)
 *   → biasが高い文脈のスコアを引き上げる
 *
 * moodAdjustments: 今の気分による微調整
 *   → 関連する特徴量を持つ質問群のスコアに影響
 */
function computeDynamicLayerScores(
  baseScores: Record<ContextType, number>,
  preference?: UserDynamicPreference | null,
): Record<ContextType, number> {
  if (!preference) return { ...baseScores };

  const result: Record<ContextType, number> = { ...baseScores };

  for (const ctx of ALL_CONTEXTS) {
    // contextBiasによる調整
    // biasが0.5より高い → スコアを引き上げ
    // biasが0.5より低い → スコアを引き下げ
    const bias = preference.contextBias[ctx] ?? 0.5;
    const biasDelta = (bias - 0.5) * 20; // ±10ポイント程度の影響

    // moodAdjustmentsによる微調整
    let moodDelta = 0;
    if (preference.moodAdjustments) {
      const { calmness, novelty, depth, socialEnergy } =
        preference.moodAdjustments;

      // 友達: socialEnergy, calmnessが効く
      if (ctx === "friend") {
        moodDelta += (socialEnergy ?? 0) * 5;
        moodDelta += (calmness ?? 0) * 3;
      }
      // 恋愛: depth, noveltyが効く
      if (ctx === "romance") {
        moodDelta += (depth ?? 0) * 5;
        moodDelta += (novelty ?? 0) * 3;
      }
      // Orbiter: calmness, depthが効く
      if (ctx === "orbiter") {
        moodDelta += (calmness ?? 0) * 5;
        moodDelta += (depth ?? 0) * 3;
      }
      // 共創: novelty, depthが効く
      if (ctx === "cocreation") {
        moodDelta += (novelty ?? 0) * 5;
        moodDelta += (depth ?? 0) * 3;
      }
    }

    result[ctx] = Math.max(
      0,
      Math.min(100, Math.round(baseScores[ctx] + biasDelta + moodDelta)),
    );
  }

  return result;
}

// ---------- Convenience: Full Pipeline ----------

/**
 * 全パイプライン: 回答 + 動的プリファレンス → 最終スコア
 */
export function computeFullMergedScores(params: {
  fixedResponsesA: UserQuestionResponse[];
  fixedResponsesB: UserQuestionResponse[];
  variablePreferenceA?: UserDynamicPreference | null;
  variablePreferenceB?: UserDynamicPreference | null;
  dailyPreferenceA?: UserDynamicPreference | null;
  dailyPreferenceB?: UserDynamicPreference | null;
}): MergedScoreResult {
  // 固定層のcontextScoresを算出
  const fixedScores = computeContextScores(
    params.fixedResponsesA,
    params.fixedResponsesB,
  );

  // 動的プリファレンスは双方の平均を使う
  const mergedVariablePref = mergePreferences(
    params.variablePreferenceA,
    params.variablePreferenceB,
  );

  const mergedDailyPref = mergePreferences(
    params.dailyPreferenceA,
    params.dailyPreferenceB,
  );

  return mergeLayerScores({
    fixedScores,
    variablePreference: mergedVariablePref,
    dailyPreference: mergedDailyPref,
  });
}

/**
 * 2ユーザーの動的プリファレンスを平均化
 */
function mergePreferences(
  a?: UserDynamicPreference | null,
  b?: UserDynamicPreference | null,
): UserDynamicPreference | null {
  if (!a && !b) return null;
  if (!a) return b!;
  if (!b) return a;

  return {
    userId: "merged",
    contextBias: {
      friend: (a.contextBias.friend + b.contextBias.friend) / 2,
      romance: (a.contextBias.romance + b.contextBias.romance) / 2,
      orbiter: (a.contextBias.orbiter + b.contextBias.orbiter) / 2,
      cocreation: (a.contextBias.cocreation + b.contextBias.cocreation) / 2,
    },
    moodAdjustments: {
      calmness:
        ((a.moodAdjustments.calmness ?? 0) +
          (b.moodAdjustments.calmness ?? 0)) /
        2,
      novelty:
        ((a.moodAdjustments.novelty ?? 0) +
          (b.moodAdjustments.novelty ?? 0)) /
        2,
      depth:
        ((a.moodAdjustments.depth ?? 0) + (b.moodAdjustments.depth ?? 0)) / 2,
      socialEnergy:
        ((a.moodAdjustments.socialEnergy ?? 0) +
          (b.moodAdjustments.socialEnergy ?? 0)) /
        2,
    },
    validUntil: a.validUntil < b.validUntil ? a.validUntil : b.validUntil,
    source: "daily_update",
  };
}
