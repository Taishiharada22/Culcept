// lib/rendezvous/similarityComplementarityMatrix.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Similarity-Complementarity Matrix（類似×相補マトリクス）
//
// 脳科学的根拠:
// 社会的結合のオキシトシン経路は「安全な違い」に最も強く反応する。
// 完全一致 → ミラーリング → 安心するが飽きる
// 適度な差異 → 持続的好奇心 → 持続的ドーパミン
//
// Gottman研究:
// 成功する関係は「価値観は類似、アプローチは相補的」
// - 共有された意味体系（shared meaning system） → 価値観の類似
// - 相互補完的な役割分担 → アプローチの相補性
//
// 既存システムとの統合:
// evaluateDirection.ts で各軸の fit を計算する際に、
// このマトリクスを参照して similarityScore / complementScore を切り替える。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { MatchingVector } from "./types";
import type { RendezvousCategory } from "./types";
import { similarityScore, complementScore } from "./similarityScore";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. Strategy Definitions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 軸ごとのマッチング戦略 */
export type MatchingStrategy = "similarity" | "complementary" | "adaptive";

/**
 * 各軸の戦略定義
 *
 * similarity: 近い値ほど高スコア（価値観の共有）
 * complementary: 反対の値ほど高スコア（役割の補完）
 * adaptive: カテゴリと文脈に応じて動的に決定
 */
export interface AxisStrategy {
  strategy: MatchingStrategy;
  /** なぜこの戦略か（心理学的根拠） */
  rationale: string;
  /** 相補マッチング時の理想的な差分（0-1） */
  idealComplementGap?: number;
  /** カテゴリ別のオーバーライド */
  categoryOverrides?: Partial<Record<RendezvousCategory, MatchingStrategy>>;
}

/**
 * 10軸の Similarity-Complementarity マトリクス
 *
 * Gottman研究 + Aneurasyncの独自設計を統合:
 * - 価値観軸（WHY）→ 類似（合わないと根本的に持続不可能）
 * - アプローチ軸（HOW）→ 相補（違うから補い合える）
 * - 文脈軸（CONTEXT）→ 適応的（カテゴリに依存）
 */
export const AXIS_STRATEGY_MATRIX: Record<keyof MatchingVector, AxisStrategy> = {
  // ━━━ 価値観軸 — SIMILARITY（合わないと根本的に無理） ━━━

  depth_speed: {
    strategy: "similarity",
    rationale: "関係の深まるスピードへの期待が異なると、一方が「重い」一方が「冷たい」と感じる。Gottmanの「受容可能な差異」の閾値を超える",
    categoryOverrides: {
      community: "adaptive", // コミュニティでは深さの速度は重要度が低い
    },
  },

  stability_need: {
    strategy: "similarity",
    rationale: "安定性への欲求の不一致は、最も根本的な関係ストレッサー。片方が変化を求め片方が安定を求めると、両方が不満を感じる",
    categoryOverrides: {
      cocreation: "complementary", // 共創では安定派×冒険派が良い組み合わせ
    },
  },

  emotional_openness: {
    strategy: "similarity",
    rationale: "感情的開放度の差は「理解されていない」感覚を生む。Gottmanの4つの馬=感情的引きこもり（stonewalling）の主因",
  },

  // ━━━ アプローチ軸 — COMPLEMENTARY（違うから面白い） ━━━

  initiative: {
    strategy: "complementary",
    rationale: "リーダー×フォロワーの相補構造。両方がリードしたいと衝突、両方がフォローだと停滞。Tuckmanの集団発達理論",
    idealComplementGap: 0.4, // 完全な逆(1.0)ではなく、適度な差異(0.4)が理想
    categoryOverrides: {
      community: "similarity", // コミュニティではイニシアチブが近い方が自然に混ざる
    },
  },

  conversation_temperature: {
    strategy: "complementary",
    rationale: "熱い会話×冷静な聞き手のバランス。両方が熱いと消耗、両方が冷静だと沈黙。社交的知性の補完",
    idealComplementGap: 0.3,
    categoryOverrides: {
      friendship: "similarity", // 友情では会話テンポの近さが重要
    },
  },

  conflict_directness: {
    strategy: "complementary",
    rationale: "直接型×間接型の組み合わせ。直接型が問題を表面化し、間接型が感情的緩衝材になる。Gottmanの「修復の試み」の多様性",
    idealComplementGap: 0.35,
    categoryOverrides: {
      partner: "adaptive", // パートナーでは極端な差は危険（修復不全のリスク）
    },
  },

  structure_preference: {
    strategy: "complementary",
    rationale: "計画型×即興型の補完。計画型が安定を提供し、即興型が新しさを提供する。両方が計画型だと硬直、両方が即興型だと混乱",
    idealComplementGap: 0.3,
  },

  // ━━━ 文脈軸 — ADAPTIVE（カテゴリに依存） ━━━

  social_energy: {
    strategy: "adaptive",
    rationale: "社会的エネルギーは活動パターンに直結。同じ場に行く関係（romantic/friendship）では近い方が良い。共創では多様性が力",
    categoryOverrides: {
      romantic: "similarity",
      friendship: "similarity",
      cocreation: "complementary",
      community: "similarity",
      partner: "similarity",
    },
  },

  distance_need: {
    strategy: "adaptive",
    rationale: "距離感の不一致は最も日常的なストレッサーの一つ。ただし共創では個人作業×協働作業の補完が有効",
    categoryOverrides: {
      romantic: "similarity",
      friendship: "similarity",
      cocreation: "complementary",
      community: "similarity",
      partner: "similarity",
    },
  },

  stimulation_need: {
    strategy: "adaptive",
    rationale: "刺激欲求は関係の「ペース」を決める。ロマンティックでは差異が新鮮さを生むが、パートナーでは合わないとストレスに",
    categoryOverrides: {
      romantic: "complementary",
      friendship: "similarity",
      cocreation: "complementary",
      community: "similarity",
      partner: "similarity",
    },
  },
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Score Computation with Strategy
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸ごとの適合スコアを計算（戦略マトリクス適用版）
 *
 * 既存の similarityScore / complementScore を戦略に基づいて切り替える。
 */
export function computeAxisFitWithStrategy(
  axis: keyof MatchingVector,
  selfValue: number,
  otherValue: number,
  category: RendezvousCategory,
  /** ユーザーの類似/相補プリファレンス: "similar"|"complementary"|"mixed"|"no_preference" */
  userSimilarityPref?: string,
): {
  score: number;
  strategy: MatchingStrategy;
  actualStrategy: "similarity" | "complementary";
} {
  const axisDef = AXIS_STRATEGY_MATRIX[axis];

  // カテゴリオーバーライドがあれば適用
  let effectiveStrategy = axisDef.strategy;
  if (axisDef.categoryOverrides?.[category]) {
    effectiveStrategy = axisDef.categoryOverrides[category]!;
  }

  // ── ユーザーの明示的な好みでオーバーライド ──
  // "similar" → 全軸を類似寄りにシフト
  // "complementary" → adaptive軸を相補に解決
  // "mixed" → adaptive軸のみ相補に（デフォルト定義の similarity/complementary は維持）
  if (userSimilarityPref === "similar" && effectiveStrategy === "adaptive") {
    effectiveStrategy = "similarity";
  } else if (userSimilarityPref === "complementary") {
    // 安全性関連以外の軸を相補に
    if (effectiveStrategy === "adaptive" || effectiveStrategy === "similarity") {
      effectiveStrategy = "complementary";
    }
  } else if (userSimilarityPref === "mixed" && effectiveStrategy === "adaptive") {
    effectiveStrategy = "complementary";
  }

  // adaptive → カテゴリでデフォルト戦略を解決
  if (effectiveStrategy === "adaptive") {
    // デフォルトはsimilarity
    effectiveStrategy = "similarity";
  }

  if (effectiveStrategy === "complementary") {
    // 相補スコア計算
    // idealComplementGap がある場合、完全な逆(gap=1)ではなく
    // 理想的な差分の近くで最高スコアを出す
    const idealGap = axisDef.idealComplementGap;
    if (idealGap !== undefined) {
      const actualGap = Math.abs(selfValue - otherValue);
      const gapDiff = actualGap - idealGap;
      // 理想ギャップからの乖離にガウシアンペナルティ
      const SIGMA_GAP = 0.3;
      const score = Math.exp(-(gapDiff * gapDiff) / (2 * SIGMA_GAP * SIGMA_GAP));
      return { score, strategy: axisDef.strategy, actualStrategy: "complementary" };
    }
    return {
      score: complementScore(selfValue, otherValue),
      strategy: axisDef.strategy,
      actualStrategy: "complementary",
    };
  }

  // similarity
  return {
    score: similarityScore(selfValue, otherValue),
    strategy: axisDef.strategy,
    actualStrategy: "similarity",
  };
}

/**
 * 全10軸の適合スコアを一括計算（戦略マトリクス適用版）
 *
 * evaluateDirection() の vectorTotal 計算の代替/拡張として使用。
 */
export function computeFullVectorFitWithStrategy(
  selfVector: MatchingVector,
  otherVector: MatchingVector,
  category: RendezvousCategory,
  weights: Record<string, number>,
): {
  total: number;
  axisFits: Record<keyof MatchingVector, {
    score: number;
    strategy: MatchingStrategy;
    actualStrategy: "similarity" | "complementary";
    weight: number;
  }>;
  /** 類似軸の平均適合度 */
  similarityAvg: number;
  /** 相補軸の平均適合度 */
  complementaryAvg: number;
  /** 相補性から生まれる成長ポテンシャル */
  growthPotential: number;
} {
  const axisFits: Record<string, {
    score: number;
    strategy: MatchingStrategy;
    actualStrategy: "similarity" | "complementary";
    weight: number;
  }> = {};

  let total = 0;
  let simSum = 0;
  let simCount = 0;
  let compSum = 0;
  let compCount = 0;

  const axisKeys = Object.keys(selfVector) as (keyof MatchingVector)[];

  for (const axis of axisKeys) {
    const weight = weights[axis] ?? (1 / axisKeys.length);
    const fit = computeAxisFitWithStrategy(
      axis,
      selfVector[axis],
      otherVector[axis],
      category,
    );

    axisFits[axis] = { ...fit, weight };
    total += fit.score * weight;

    if (fit.actualStrategy === "similarity") {
      simSum += fit.score;
      simCount++;
    } else {
      compSum += fit.score;
      compCount++;
    }
  }

  const similarityAvg = simCount > 0 ? simSum / simCount : 0;
  const complementaryAvg = compCount > 0 ? compSum / compCount : 0;

  // 成長ポテンシャル: 相補軸の適合度が高い = 互いの違いが補完的
  // 高い相補適合度 = 違いがあるが「良い違い」
  const growthPotential = complementaryAvg * (compCount / Math.max(1, axisKeys.length));

  return {
    total,
    axisFits: axisFits as Record<keyof MatchingVector, typeof axisFits[string]>,
    similarityAvg,
    complementaryAvg,
    growthPotential,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. Strategy Balance Analysis
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** マッチングペアの戦略バランスレポート */
export interface StrategyBalanceReport {
  /** 価値観の一致度（安全の土台） */
  valueAlignment: number;
  /** アプローチの補完度（成長のエンジン） */
  approachComplementarity: number;
  /** バランス品質（両方が高いのが理想） */
  balanceQuality: "excellent" | "good" | "imbalanced" | "poor";
  /** バランスの解釈 */
  interpretation: string;
  /** このペアの持続可能性の推定 */
  sustainabilityEstimate: "high" | "moderate" | "low";
}

/**
 * マッチングペアの戦略バランスを分析
 *
 * Gottman研究の核心:
 * - 価値観の一致 ≥ 0.7 が関係持続の最低条件
 * - アプローチの補完性が高いほど関係が豊かになる
 * - 両方が高い = 最も持続可能な関係
 */
export function analyzeStrategyBalance(
  selfVector: MatchingVector,
  otherVector: MatchingVector,
  category: RendezvousCategory,
): StrategyBalanceReport {
  // 価値観軸のスコア平均
  const valueAxes: (keyof MatchingVector)[] = [
    "depth_speed",
    "stability_need",
    "emotional_openness",
  ];
  const valueScores = valueAxes.map((axis) =>
    similarityScore(selfVector[axis], otherVector[axis]),
  );
  const valueAlignment =
    valueScores.reduce((s, v) => s + v, 0) / valueScores.length;

  // アプローチ軸のスコア平均
  const approachAxes: (keyof MatchingVector)[] = [
    "initiative",
    "conversation_temperature",
    "conflict_directness",
    "structure_preference",
  ];
  const approachScores = approachAxes.map((axis) => {
    const fit = computeAxisFitWithStrategy(axis, selfVector[axis], otherVector[axis], category);
    return fit.score;
  });
  const approachComplementarity =
    approachScores.reduce((s, v) => s + v, 0) / approachScores.length;

  // バランス品質
  let balanceQuality: StrategyBalanceReport["balanceQuality"];
  if (valueAlignment >= 0.7 && approachComplementarity >= 0.6) {
    balanceQuality = "excellent";
  } else if (valueAlignment >= 0.6 && approachComplementarity >= 0.5) {
    balanceQuality = "good";
  } else if (valueAlignment >= 0.5 || approachComplementarity >= 0.7) {
    balanceQuality = "imbalanced";
  } else {
    balanceQuality = "poor";
  }

  // 解釈
  let interpretation: string;
  switch (balanceQuality) {
    case "excellent":
      interpretation = "価値観の土台が強く、アプローチが互いを補完している。最も持続可能な組み合わせ";
      break;
    case "good":
      interpretation = "価値観が十分に近く、アプローチの違いが適度。自然に発展しやすい関係";
      break;
    case "imbalanced":
      interpretation = valueAlignment > approachComplementarity
        ? "価値観は近いがアプローチが似すぎている。新しさが不足する可能性"
        : "アプローチは補完的だが、価値観にズレがある。短期的には刺激的だが長期的にストレスになる可能性";
      break;
    default:
      interpretation = "価値観とアプローチの両方に大きなギャップがある。接続には意識的な努力が必要";
  }

  // 持続可能性
  let sustainabilityEstimate: StrategyBalanceReport["sustainabilityEstimate"];
  if (valueAlignment >= 0.65 && approachComplementarity >= 0.5) {
    sustainabilityEstimate = "high";
  } else if (valueAlignment >= 0.5) {
    sustainabilityEstimate = "moderate";
  } else {
    sustainabilityEstimate = "low";
  }

  return {
    valueAlignment,
    approachComplementarity,
    balanceQuality,
    interpretation,
    sustainabilityEstimate,
  };
}
