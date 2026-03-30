// lib/stargazer/predictiveClone.ts
// 予測的分身 — 蓄積された人格データから「次の判断」を予測する
//
// 原理: 十分な観測データが揃うと、特定の状況での判断を高確率で予測できる。
// この「予測的分身」の精度が上がるほど、システムは真の第二の自己に近づく。
// 予測と実際の差分が生まれた瞬間こそ、ユーザーの「変容」が起きた瞬間。

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 状況コンテキスト */
export interface SituationContext {
  timeOfDay: "morning" | "afternoon" | "night";
  energy: "very_low" | "low" | "moderate" | "high" | "very_high";
  social: "alone" | "few_people" | "many_people";
  /** オプション: 特定の関係性コンテキスト */
  relationship?: "friends" | "romance" | "work" | "family";
}

/** 予測シナリオ */
export interface PredictionScenario {
  id: string;
  /** シナリオの説明 */
  scenario: string;
  /** カテゴリ */
  category: "decision" | "social" | "stress" | "creative" | "conflict";
  /** 予測に使う軸 */
  relevantAxes: TraitAxisKey[];
  /** 選択肢 */
  options: {
    id: string;
    label: string;
    /** この選択肢を選ぶ条件：各軸スコアの重み */
    axisWeights: Partial<Record<TraitAxisKey, number>>;
  }[];
}

/** 予測結果 */
export interface ClonePrediction {
  scenarioId: string;
  scenario: string;
  category: PredictionScenario["category"];
  /** 最も可能性の高い選択 */
  predictedChoice: {
    optionId: string;
    label: string;
    probability: number;
  };
  /** 全選択肢の確率分布 */
  distribution: {
    optionId: string;
    label: string;
    probability: number;
  }[];
  /** 予測の確信度 (0-1) */
  confidence: number;
  /** 分身のコメント（なぜこの選択をするか） */
  cloneReasoning: string;
  /** コンテキスト依存度 — 状況によって予測が変わるか */
  contextSensitivity: number;
}

/** 予測的分身の全体結果 */
export interface PredictiveCloneResult {
  /** 各シナリオの予測 */
  predictions: ClonePrediction[];
  /** 分身の精度指標 (0-1) */
  cloneAccuracy: number;
  /** データ充足度 (0-1) */
  dataCompleteness: number;
  /** 分身の性格要約 */
  cloneSummary: string;
  /** 最も予測しやすい領域 */
  predictableAreas: { area: string; confidence: number }[];
  /** 最も予測困難な領域（内的葛藤の指標） */
  unpredictableAreas: { area: string; reason: string }[];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Prediction Scenarios
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SCENARIOS: PredictionScenario[] = [
  {
    id: "weekend_plan",
    scenario: "週末に予定がなくなった。あなたはどうする？",
    category: "decision",
    relevantAxes: ["introvert_vs_extrovert", "plan_vs_spontaneous", "social_initiative"],
    options: [
      {
        id: "solo_recharge",
        label: "一人で過ごす — 読書や散歩など",
        axisWeights: { introvert_vs_extrovert: -0.8, plan_vs_spontaneous: -0.2 },
      },
      {
        id: "spontaneous_out",
        label: "突発的に出かける — 新しい場所を探索",
        axisWeights: { plan_vs_spontaneous: 0.7, tradition_vs_novelty: 0.5, change_embrace_vs_resist: 0.3 },
      },
      {
        id: "call_friends",
        label: "誰かを誘う — 友人に連絡する",
        axisWeights: { introvert_vs_extrovert: 0.6, social_initiative: 0.8 },
      },
      {
        id: "productive",
        label: "やるべきことを片付ける — 掃除や整理",
        axisWeights: { plan_vs_spontaneous: -0.6, perfectionist_vs_pragmatic: -0.5 },
      },
    ],
  },
  {
    id: "team_conflict",
    scenario: "チームで意見が対立した。あなたの最初の反応は？",
    category: "conflict",
    relevantAxes: ["direct_vs_diplomatic", "independence_vs_harmony", "emotional_regulation"],
    options: [
      {
        id: "speak_up",
        label: "自分の意見をはっきり言う",
        axisWeights: { direct_vs_diplomatic: 0.8, independence_vs_harmony: -0.6 },
      },
      {
        id: "mediate",
        label: "双方の意見を聞いて調整する",
        axisWeights: { direct_vs_diplomatic: -0.5, independence_vs_harmony: 0.6, emotional_regulation: 0.4 },
      },
      {
        id: "observe_first",
        label: "少し様子を見てから発言する",
        axisWeights: { cautious_vs_bold: -0.6, analytical_vs_intuitive: -0.4 },
      },
      {
        id: "avoid",
        label: "対立を避けて別の話題に移す",
        axisWeights: { stress_isolation_vs_social: -0.5, independence_vs_harmony: 0.7 },
      },
    ],
  },
  {
    id: "surprise_gift",
    scenario: "親しい人に贈り物を選ぶとき、何を重視する？",
    category: "social",
    relevantAxes: ["function_vs_expression", "quality_vs_quantity", "minimal_vs_maximal"],
    options: [
      {
        id: "practical",
        label: "実用的で役に立つもの",
        axisWeights: { function_vs_expression: -0.7, quality_vs_quantity: -0.3 },
      },
      {
        id: "emotional",
        label: "気持ちが伝わるもの — 手紙や体験",
        axisWeights: { function_vs_expression: 0.6, reassurance_need: 0.3, intimacy_pace: 0.4 },
      },
      {
        id: "aesthetic",
        label: "美しくてセンスのいいもの",
        axisWeights: { function_vs_expression: 0.4, minimal_vs_maximal: 0.3, classic_vs_trendy: 0.2 },
      },
      {
        id: "surprise",
        label: "相手が予想しないような意外なもの",
        axisWeights: { tradition_vs_novelty: 0.6, cautious_vs_bold: 0.5 },
      },
    ],
  },
  {
    id: "high_stress",
    scenario: "強いストレスを感じたとき、あなたはまず何をする？",
    category: "stress",
    relevantAxes: ["stress_isolation_vs_social", "emotional_regulation", "emotional_variability"],
    options: [
      {
        id: "isolate",
        label: "一人になって心を落ち着ける",
        axisWeights: { stress_isolation_vs_social: -0.8, introvert_vs_extrovert: -0.4 },
      },
      {
        id: "talk",
        label: "誰かに話を聞いてもらう",
        axisWeights: { stress_isolation_vs_social: 0.7, reassurance_need: 0.5 },
      },
      {
        id: "action",
        label: "体を動かす・行動で発散する",
        axisWeights: { cautious_vs_bold: 0.4, plan_vs_spontaneous: 0.3 },
      },
      {
        id: "analyze",
        label: "原因を分析して対策を考える",
        axisWeights: { analytical_vs_intuitive: -0.7, emotional_regulation: 0.5 },
      },
    ],
  },
  {
    id: "new_opportunity",
    scenario: "まったく新しい分野へのチャンスが来た。あなたの反応は？",
    category: "creative",
    relevantAxes: ["change_embrace_vs_resist", "cautious_vs_bold", "tradition_vs_novelty"],
    options: [
      {
        id: "leap",
        label: "即座に飛びつく — やってみないとわからない",
        axisWeights: { change_embrace_vs_resist: 0.8, cautious_vs_bold: 0.7, tradition_vs_novelty: 0.5 },
      },
      {
        id: "research",
        label: "まず徹底的に調べてから判断する",
        axisWeights: { cautious_vs_bold: -0.7, analytical_vs_intuitive: -0.5, plan_vs_spontaneous: -0.4 },
      },
      {
        id: "consult",
        label: "信頼できる人に相談する",
        axisWeights: { individual_vs_social: 0.5, reassurance_need: 0.4 },
      },
      {
        id: "decline",
        label: "今の道を続ける — 集中が大事",
        axisWeights: { change_embrace_vs_resist: -0.7, tradition_vs_novelty: -0.5, perfectionist_vs_pragmatic: -0.3 },
      },
    ],
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Engine
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 予測的分身を構築
 * 蓄積された軸スコアから、各シナリオでの判断を予測する
 */
export function buildPredictiveClone(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  context?: SituationContext,
  /** 軸スコアの時系列変動データ（あれば精度向上） */
  axisVariance?: Partial<Record<TraitAxisKey, number>>,
): PredictiveCloneResult {
  const observedAxes = Object.keys(axisScores) as TraitAxisKey[];
  const dataCompleteness = Math.min(observedAxes.length / 20, 1);

  const predictions: ClonePrediction[] = [];

  for (const scenario of SCENARIOS) {
    const prediction = predictForScenario(scenario, axisScores, context, axisVariance);
    predictions.push(prediction);
  }

  // 予測しやすい / 予測しにくい領域
  const sortedByConfidence = [...predictions].sort((a, b) => b.confidence - a.confidence);

  const predictableAreas = sortedByConfidence
    .filter((p) => p.confidence > 0.6)
    .map((p) => ({
      area: getCategoryLabel(p.category),
      confidence: p.confidence,
    }));

  const unpredictableAreas = sortedByConfidence
    .filter((p) => p.confidence < 0.4)
    .map((p) => ({
      area: getCategoryLabel(p.category),
      reason:
        p.contextSensitivity > 0.6
          ? "状況によって大きく変わる領域 — 固定的な予測が困難"
          : "データが不足しているか、内的葛藤がある領域",
    }));

  // 分身の精度指標
  const avgConfidence = predictions.reduce((s, p) => s + p.confidence, 0) / predictions.length;
  const cloneAccuracy = avgConfidence * dataCompleteness;

  // 分身の性格サマリー
  const cloneSummary = generateCloneSummary(predictions, axisScores);

  return {
    predictions,
    cloneAccuracy,
    dataCompleteness,
    cloneSummary,
    predictableAreas,
    unpredictableAreas,
  };
}

/**
 * 単一シナリオの予測
 */
function predictForScenario(
  scenario: PredictionScenario,
  scores: Partial<Record<TraitAxisKey, number>>,
  context?: SituationContext,
  axisVariance?: Partial<Record<TraitAxisKey, number>>,
): ClonePrediction {
  // 各選択肢のスコアを計算
  const optionScores: { optionId: string; label: string; score: number }[] = [];

  for (const option of scenario.options) {
    let score = 0;
    let weightSum = 0;

    for (const [axisId, weight] of Object.entries(option.axisWeights) as [TraitAxisKey, number][]) {
      const axisScore = scores[axisId];
      if (axisScore === undefined) continue;

      // 軸スコアと選択肢の重みの積 — 高いほどこの選択肢を選びやすい
      score += axisScore * weight;
      weightSum += Math.abs(weight);
    }

    // 正規化
    const normalizedScore = weightSum > 0 ? score / weightSum : 0;
    optionScores.push({
      optionId: option.id,
      label: option.label,
      score: normalizedScore,
    });
  }

  // softmax で確率分布に変換
  const temperature = 1.5; // 温度パラメータ（高い = より均等な分布）
  const expScores = optionScores.map((o) => ({
    ...o,
    exp: Math.exp(o.score / temperature),
  }));
  const expSum = expScores.reduce((s, o) => s + o.exp, 0);

  const distribution = expScores
    .map((o) => ({
      optionId: o.optionId,
      label: o.label,
      probability: expSum > 0 ? o.exp / expSum : 1 / optionScores.length,
    }))
    .sort((a, b) => b.probability - a.probability);

  const predicted = distribution[0];

  // 確信度: 最高確率と2位の差 + データの充足度
  const gap = distribution.length > 1 ? predicted.probability - distribution[1].probability : 0;
  const axisDataRatio =
    scenario.relevantAxes.filter((a) => scores[a] !== undefined).length / scenario.relevantAxes.length;

  const confidence = Math.min(gap * 2 + axisDataRatio * 0.5, 1);

  // コンテキスト依存度 (高い変動 = 状況による)
  let contextSensitivity = 0;
  if (axisVariance) {
    const relevantVariance = scenario.relevantAxes
      .map((a) => axisVariance[a] ?? 0)
      .filter((v) => v > 0);
    if (relevantVariance.length > 0) {
      contextSensitivity = relevantVariance.reduce((s, v) => s + v, 0) / relevantVariance.length;
    }
  }

  // 推論コメント生成
  const reasoning = generateReasoning(scenario, predicted, scores);

  return {
    scenarioId: scenario.id,
    scenario: scenario.scenario,
    category: scenario.category,
    predictedChoice: {
      optionId: predicted.optionId,
      label: predicted.label,
      probability: predicted.probability,
    },
    distribution,
    confidence,
    cloneReasoning: reasoning,
    contextSensitivity,
  };
}

/**
 * 予測の推論コメントを生成
 */
function generateReasoning(
  scenario: PredictionScenario,
  predicted: { optionId: string; label: string; probability: number },
  scores: Partial<Record<TraitAxisKey, number>>,
): string {
  // 最も影響力の大きい軸を特定
  const option = scenario.options.find((o) => o.id === predicted.optionId);
  if (!option) return "データから推測した予測です。";

  const influences = Object.entries(option.axisWeights)
    .map(([axisId, weight]) => {
      const axisScore = scores[axisId as TraitAxisKey];
      if (axisScore === undefined) return null;
      const axis = TRAIT_AXES.find((a) => a.id === axisId);
      return {
        axis,
        influence: Math.abs(axisScore * (weight as number)),
        direction: axisScore > 0 ? axis?.labelRight : axis?.labelLeft,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b!.influence - a!.influence) as {
    axis: (typeof TRAIT_AXES)[0];
    influence: number;
    direction: string | undefined;
  }[];

  if (influences.length === 0) return "データから推測した予測です。";

  const topInfluence = influences[0];
  const prob = Math.round(predicted.probability * 100);

  return `${topInfluence.direction}の傾向が強いあなたは、${prob}%の確率でこの選択をすると予測。`;
}

/**
 * 分身の性格サマリーを生成
 */
function generateCloneSummary(
  predictions: ClonePrediction[],
  scores: Partial<Record<TraitAxisKey, number>>,
): string {
  const traits: string[] = [];

  const introScore = scores["introvert_vs_extrovert"];
  if (introScore !== undefined) {
    traits.push(introScore < -0.3 ? "一人の時間を大切にし" : introScore > 0.3 ? "人との関わりからエネルギーを得て" : "状況に応じて内向と外向を切り替え");
  }

  const cautionScore = scores["cautious_vs_bold"];
  if (cautionScore !== undefined) {
    traits.push(cautionScore < -0.3 ? "慎重に判断し" : cautionScore > 0.3 ? "果敢に行動し" : "バランスよく判断する");
  }

  const changeScore = scores["change_embrace_vs_resist"];
  if (changeScore !== undefined) {
    traits.push(changeScore > 0.3 ? "変化を歓迎する" : changeScore < -0.3 ? "安定を重んじる" : "変化に柔軟に対応する");
  }

  if (traits.length === 0) return "まだデータ収集中。分身の解像度を上げるには、観測を続けてください。";

  return `あなたの分身は、${traits.join("、")}人物です。`;
}

/**
 * カテゴリラベル
 */
function getCategoryLabel(category: PredictionScenario["category"]): string {
  const labels: Record<typeof category, string> = {
    decision: "意思決定",
    social: "対人関係",
    stress: "ストレス対処",
    creative: "新しい挑戦",
    conflict: "対立場面",
  };
  return labels[category];
}
