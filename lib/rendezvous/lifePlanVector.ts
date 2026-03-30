// ============================================================
// Life Plan Vector — Partner 枠専用の人生設計価値観評価
//
// 8次元の Life Plan Vector を質問回答から算出し、
// 2者間の人生設計価値観の適合度を評価する。
//
// 科学的根拠:
// - Dew et al. (2012): 金銭葛藤 = 離婚最強予測因子
// - Mark & Murray (2012): 欲求不一致 = 性的満足度の最強予測因子
// - Luo & Klohnen (2005): 態度の類似性 > 性格の類似性
// - Gaunt (2006): Conservation と Self-Transcendence の類似性が最重要
//
// スコアリング方式:
// - ガウシアン類似度（σ=0.30）: 人生設計は性格より不一致への耐性が低い
//   → σ を similarityScore.ts (σ=0.35) より狭くしている
// - 次元別重み付け: 離婚研究の効果量に基づく
// - 信頼度加重: 回答数が多い軸ほど信頼できる
// ============================================================

import type { LifePlanAxisKey } from "./lifePlanQuestions";
import { LIFE_PLAN_AXIS_KEYS, LIFE_PLAN_AXES, LIFE_PLAN_QUESTIONS } from "./lifePlanQuestions";

// ── 型定義 ──

/**
 * Life Plan Vector — 8次元
 * 各次元 0..1（セマンティックディファレンシャルの左端=0, 右端=1）
 */
export type LifePlanVector = Record<LifePlanAxisKey, number>;

/**
 * 各軸の信頼度情報
 */
export type LifePlanConfidence = Record<LifePlanAxisKey, {
  /** 回答数 */
  responseCount: number;
  /** 信頼度 (0..1): 回答数に基づく。1問=0.3, 2問=0.55, 3問=0.75, 4問=0.88, 5問=0.95 */
  confidence: number;
  /** 回答内の分散（一貫性の指標。低い=一貫的） */
  variance: number;
}>;

/**
 * Life Plan Profile — ベクトル + 信頼度 + メタデータ
 */
export type LifePlanProfile = {
  vector: LifePlanVector;
  confidence: LifePlanConfidence;
  /** プロファイル全体の平均信頼度 */
  overallConfidence: number;
  /** 最終更新日 */
  updatedAt: string;
};

/**
 * 質問回答の入力形式
 */
export type LifePlanResponse = {
  questionId: string;
  /** 回答値: 1-based（scale=5なら 1-5, scale=7なら 1-7） */
  value: number;
  /** 回答時間（ミリ秒、オプション） */
  responseTimeMs?: number;
};

/**
 * Life Plan Fit の結果
 */
export type LifePlanFitResult = {
  /** 総合スコア (0..1) */
  total: number;
  /** 次元別スコア */
  dimensions: Record<LifePlanAxisKey, number>;
  /** 不一致が大きい次元（caution 用） */
  riskDimensions: LifePlanAxisKey[];
  /** 強い一致がある次元（reason 用） */
  alignedDimensions: LifePlanAxisKey[];
};

// ── 定数 ──

/**
 * Life Plan 専用の類似度パラメータ
 * σ=0.30: 性格(σ=0.35)より厳しい。人生設計の不一致は性格より致命的
 *
 * 差0.1 → 0.95  差0.2 → 0.80  差0.3 → 0.61
 * 差0.4 → 0.41  差0.5 → 0.25  差0.7 → 0.06
 */
const LIFE_PLAN_SIGMA = 0.30;
const LIFE_PLAN_SIGMA_SQ_2 = 2 * LIFE_PLAN_SIGMA * LIFE_PLAN_SIGMA;

/**
 * 次元別重み — 離婚研究の効果量に基づく
 *
 * Dew et al. (2012): financial disagreement = strongest predictor → 0.20
 * 家庭裁判所統計: career/family + kinship が上位 → 0.15 each
 * 子供の有無: 妥協不可能 → 0.15 (but handled partly by dealbreaker)
 * intimacy: Mark & Murray effect size moderate → 0.10
 * living_standard: chronic dissatisfaction → 0.10
 * health/cultural: smaller effect sizes → 0.075 each
 */
const DIMENSION_WEIGHTS: Record<LifePlanAxisKey, number> = {
  financial_values: 0.20,
  career_family_balance: 0.15,
  family_planning_depth: 0.15,
  kinship_boundary: 0.15,
  living_standard: 0.10,
  intimacy_expectation: 0.10,
  health_lifestyle: 0.075,
  cultural_values: 0.075,
};

/**
 * 信頼度カーブ: 回答数 → 信頼度
 * 1 - exp(-0.35 * n) で飽和曲線
 * 1問: 0.30, 2問: 0.50, 3問: 0.65, 4問: 0.75, 5問: 0.83
 */
function responseCountToConfidence(count: number): number {
  if (count <= 0) return 0;
  return 1 - Math.exp(-0.35 * count);
}

// ── ベクトル算出 ──

/**
 * 質問回答から Life Plan Vector を算出
 *
 * アルゴリズム:
 * 1. 各回答を 0..1 にスケール正規化
 * 2. 質問の axes マッピングに従って、各軸に重み付き加算
 * 3. 各軸の加重平均を算出（invert フラグ考慮）
 * 4. 信頼度を回答数から算出
 */
export function computeLifePlanProfile(
  responses: LifePlanResponse[],
): LifePlanProfile {
  // 軸ごとの集計
  const axisAccum: Record<string, { weightedSum: number; totalWeight: number; values: number[] }> = {};
  for (const key of LIFE_PLAN_AXIS_KEYS) {
    axisAccum[key] = { weightedSum: 0, totalWeight: 0, values: [] };
  }

  // 質問マップ（高速参照用）
  const questionMap = new Map(LIFE_PLAN_QUESTIONS.map((q) => [q.id, q]));

  for (const response of responses) {
    const question = questionMap.get(response.questionId);
    if (!question) continue;

    // 回答を 0..1 に正規化（1-based → 0..1）
    const normalized = (response.value - 1) / (question.scale - 1);
    const clamped = Math.max(0, Math.min(1, normalized));

    for (const axisMapping of question.axes) {
      const accum = axisAccum[axisMapping.key];
      if (!accum) continue;

      // invert: 左端が高い意味の場合
      const effectiveValue = axisMapping.invert ? 1 - clamped : clamped;
      const weight = axisMapping.weight;

      accum.weightedSum += effectiveValue * weight;
      accum.totalWeight += weight;
      accum.values.push(effectiveValue);
    }
  }

  // ベクトルと信頼度を算出
  const vector = {} as LifePlanVector;
  const confidence = {} as LifePlanConfidence;

  for (const key of LIFE_PLAN_AXIS_KEYS) {
    const accum = axisAccum[key];
    // 回答がなければ中央値（0.5）
    vector[key] = accum.totalWeight > 0
      ? accum.weightedSum / accum.totalWeight
      : 0.5;

    // 分散計算
    const mean = vector[key];
    const variance = accum.values.length > 1
      ? accum.values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / accum.values.length
      : 0;

    confidence[key] = {
      responseCount: accum.values.length,
      confidence: responseCountToConfidence(accum.values.length),
      variance,
    };
  }

  // 全体信頼度
  let totalConf = 0;
  let totalWeight = 0;
  for (const key of LIFE_PLAN_AXIS_KEYS) {
    const w = DIMENSION_WEIGHTS[key];
    totalConf += confidence[key].confidence * w;
    totalWeight += w;
  }
  const overallConfidence = totalWeight > 0 ? totalConf / totalWeight : 0;

  return {
    vector,
    confidence,
    overallConfidence,
    updatedAt: new Date().toISOString(),
  };
}

// ── 適合度計算 ──

/**
 * Life Plan 専用ガウシアン類似度
 * σ=0.30 で性格より厳しい
 */
function lifePlanSimilarity(a: number, b: number): number {
  const diff = a - b;
  return Math.exp(-(diff * diff) / LIFE_PLAN_SIGMA_SQ_2);
}

/**
 * 2者間の Life Plan 適合度を算出
 *
 * スコアリング:
 * 1. 次元ごとにガウシアン類似度を算出
 * 2. 信頼度加重: 両者の信頼度が高い軸ほど重視
 *    - 両者の信頼度の幾何平均を使用
 *    - 信頼度が低い軸は 0.5（中立）に引き寄せる
 * 3. 次元別重み（離婚研究の効果量）で加重和
 * 4. financial_values の特別処理（最強予測因子）
 */
export function computeLifePlanFit(
  aProfile: LifePlanProfile,
  bProfile: LifePlanProfile,
): LifePlanFitResult {
  const dimensions = {} as Record<LifePlanAxisKey, number>;
  const riskDimensions: LifePlanAxisKey[] = [];
  const alignedDimensions: LifePlanAxisKey[] = [];

  let weightedTotal = 0;
  let effectiveWeightSum = 0;

  for (const key of LIFE_PLAN_AXIS_KEYS) {
    const aVal = aProfile.vector[key];
    const bVal = bProfile.vector[key];

    // ガウシアン類似度
    const rawSim = lifePlanSimilarity(aVal, bVal);

    // 信頼度加重: 両者の幾何平均
    const aConf = aProfile.confidence[key].confidence;
    const bConf = bProfile.confidence[key].confidence;
    const jointConfidence = Math.sqrt(aConf * bConf);

    // 信頼度が低い場合は 0.5（中立）に収束
    // adjustedSim = rawSim * confidence + 0.5 * (1 - confidence)
    const adjustedSim = rawSim * jointConfidence + 0.5 * (1 - jointConfidence);

    dimensions[key] = adjustedSim;

    // 次元別重みに信頼度を加味した有効重みを計算
    const baseWeight = DIMENSION_WEIGHTS[key];
    const effectiveWeight = baseWeight * (0.3 + 0.7 * jointConfidence);

    weightedTotal += adjustedSim * effectiveWeight;
    effectiveWeightSum += effectiveWeight;

    // リスク/アラインメント分類（信頼度が一定以上の場合のみ）
    if (jointConfidence >= 0.4) {
      if (rawSim < 0.45) {
        riskDimensions.push(key);
      } else if (rawSim > 0.80) {
        alignedDimensions.push(key);
      }
    }
  }

  // 基本スコア
  let total = effectiveWeightSum > 0 ? weightedTotal / effectiveWeightSum : 0.5;

  // financial_values 特別ペナルティ
  // Dew et al. (2012): 金銭葛藤は離婚の最強単独予測因子
  // 金銭感覚の大きな乖離は他の一致を打ち消す
  const finConf = Math.sqrt(
    aProfile.confidence.financial_values.confidence *
    bProfile.confidence.financial_values.confidence,
  );
  if (finConf >= 0.4) {
    const finDiff = Math.abs(aProfile.vector.financial_values - bProfile.vector.financial_values);
    if (finDiff > 0.4) {
      const penalty = (finDiff - 0.4) * 0.15 * finConf;
      total = Math.max(0, total - penalty);
    }
  }

  // family_planning_depth 特別ペナルティ
  // 子どもに関する価値観の大きな乖離も致命的
  const famConf = Math.sqrt(
    aProfile.confidence.family_planning_depth.confidence *
    bProfile.confidence.family_planning_depth.confidence,
  );
  if (famConf >= 0.4) {
    const famDiff = Math.abs(aProfile.vector.family_planning_depth - bProfile.vector.family_planning_depth);
    if (famDiff > 0.45) {
      const penalty = (famDiff - 0.45) * 0.10 * famConf;
      total = Math.max(0, total - penalty);
    }
  }

  return {
    total: clamp(total),
    dimensions,
    riskDimensions,
    alignedDimensions,
  };
}

// ── Life Plan Guard ──

/**
 * Life Plan Guard — Partner マッチの人生設計面での安全チェック
 *
 * 致命的な不一致がある場合にマッチを阻止:
 * 1. financial_values の極端な乖離（最強の離婚予測因子）
 * 2. family_planning_depth の極端な乖離（妥協不可能）
 * 3. 全体スコアが最低水準を下回る
 *
 * 注意: 信頼度が低い（回答が少ない）場合はブロックしない
 * → 情報不足でブロックするのはUXを損なう
 */
export function lifePlanGuard(
  aProfile: LifePlanProfile,
  bProfile: LifePlanProfile,
): { pass: boolean; failedDimension?: string; detail?: string } {
  // 信頼度が両者とも低い場合は通過（情報不足でブロックしない）
  if (aProfile.overallConfidence < 0.3 || bProfile.overallConfidence < 0.3) {
    return { pass: true };
  }

  // financial_values: 極端な乖離チェック
  const finConfA = aProfile.confidence.financial_values.confidence;
  const finConfB = bProfile.confidence.financial_values.confidence;
  if (finConfA >= 0.5 && finConfB >= 0.5) {
    const finDiff = Math.abs(aProfile.vector.financial_values - bProfile.vector.financial_values);
    if (finDiff > 0.65) {
      return {
        pass: false,
        failedDimension: "financial_values",
        detail: "金銭感覚の根本的な乖離（Dew et al.: 離婚の最強予測因子）",
      };
    }
  }

  // family_planning_depth: 極端な乖離チェック
  const famConfA = aProfile.confidence.family_planning_depth.confidence;
  const famConfB = bProfile.confidence.family_planning_depth.confidence;
  if (famConfA >= 0.5 && famConfB >= 0.5) {
    const famDiff = Math.abs(aProfile.vector.family_planning_depth - bProfile.vector.family_planning_depth);
    if (famDiff > 0.65) {
      return {
        pass: false,
        failedDimension: "family_planning_depth",
        detail: "家族計画に関する根本的な価値観の乖離",
      };
    }
  }

  // kinship_boundary: 極端な乖離チェック（日本固有の離婚因子）
  const kinConfA = aProfile.confidence.kinship_boundary.confidence;
  const kinConfB = bProfile.confidence.kinship_boundary.confidence;
  if (kinConfA >= 0.5 && kinConfB >= 0.5) {
    const kinDiff = Math.abs(aProfile.vector.kinship_boundary - bProfile.vector.kinship_boundary);
    if (kinDiff > 0.70) {
      return {
        pass: false,
        failedDimension: "kinship_boundary",
        detail: "親族との距離感に関する根本的な乖離",
      };
    }
  }

  // 総合スコアチェック
  const fitResult = computeLifePlanFit(aProfile, bProfile);
  if (fitResult.total < 0.35) {
    return {
      pass: false,
      failedDimension: "overall_life_plan",
      detail: "人生設計の総合的な不一致",
    };
  }

  return { pass: true };
}

// ── ユーティリティ ──

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Life Plan Vector を更新（追加回答を反映）
 *
 * 既存プロファイルに新しい回答を追加して再計算。
 * 既存の回答と新しい回答を結合して computeLifePlanProfile を呼び直す。
 */
export function updateLifePlanProfile(
  existingResponses: LifePlanResponse[],
  newResponses: LifePlanResponse[],
): LifePlanProfile {
  // 重複排除（新しい回答が優先）
  const responseMap = new Map<string, LifePlanResponse>();
  for (const r of existingResponses) {
    responseMap.set(r.questionId, r);
  }
  for (const r of newResponses) {
    responseMap.set(r.questionId, r);
  }
  return computeLifePlanProfile(Array.from(responseMap.values()));
}

/**
 * Life Plan Profile のダイジェスト（表示用）
 *
 * 各軸のスコアを人間が理解しやすい形で返す
 */
export function getLifePlanDigest(profile: LifePlanProfile): Array<{
  axis: LifePlanAxisKey;
  label: string;
  leftLabel: string;
  rightLabel: string;
  value: number;
  confidence: number;
  /** "left" | "center" | "right" */
  tendency: string;
}> {
  // LIFE_PLAN_AXES は top-level import 済み

  return LIFE_PLAN_AXIS_KEYS.map((key) => {
    const axisDef = LIFE_PLAN_AXES.find((a) => a.id === key);
    const value = profile.vector[key];
    const conf = profile.confidence[key].confidence;

    let tendency: string;
    if (value < 0.35) tendency = "left";
    else if (value > 0.65) tendency = "right";
    else tendency = "center";

    return {
      axis: key,
      label: axisDef?.description ?? key,
      leftLabel: axisDef?.labelLeft ?? "",
      rightLabel: axisDef?.labelRight ?? "",
      value,
      confidence: conf,
      tendency,
    };
  });
}
