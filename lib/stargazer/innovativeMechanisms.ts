// lib/stargazer/innovativeMechanisms.ts
// 5つの革新メカニズム — 既存の心理テストを超える観測手法
//
// 1. Phantom Choice (幻影選択): 「選ばなかった選択肢」から本音を推測
// 2. Resonance Cascade (共鳴連鎖): 他ユーザーとの類似パターンから未知の傾向を予測
// 3. Temporal Diff (時間差分): 同じ質問への回答の変化から深層変化を検出
// 4. Meta-Observation Loop (メタ観測ループ): 「自分の観測結果」への反応を観測
// 5. Entropy Signature (エントロピー署名): 回答のバラツキパターンで人格構造を判別

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Phantom Choice — 幻影選択
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PhantomChoiceResult {
  /** 質問ID */
  questionId: string;
  /** 選んだ選択肢 */
  chosenOption: string;
  /** 最後まで迷った選択肢（幻影） */
  phantomOption: string | null;
  /** 幻影の心理的意味 */
  phantomInsight: string;
  /** 幻影が示唆する軸への影響 */
  phantomAxisInfluence?: { axisId: TraitAxisKey; direction: number };
}

/**
 * 幻影選択を分析
 * 回答履歴から「選ばなかった選択肢」のパターンを検出
 *
 * 原理: 人が最終的に選ばなかったが最後まで迷った選択肢は、
 * 抑圧された欲求や認めたくない傾向を示す
 */
export function analyzePhantomChoices(
  answerHistory: {
    questionId: string;
    chosenOptionId: string;
    responseTimeMs: number;
    optionChanges?: string[]; // 選択肢を変更した履歴
  }[],
): PhantomChoiceResult[] {
  const results: PhantomChoiceResult[] = [];

  for (const answer of answerHistory) {
    // 長い応答時間 = 迷いがあった
    const wasConflicted = answer.responseTimeMs > 5000;
    // 選択肢を変更した = 幻影選択が存在する
    const hasChanges = answer.optionChanges && answer.optionChanges.length > 0;

    if (!wasConflicted && !hasChanges) continue;

    const phantomOption = hasChanges
      ? answer.optionChanges![answer.optionChanges!.length - 2] // 最後に放棄した選択肢
      : null;

    results.push({
      questionId: answer.questionId,
      chosenOption: answer.chosenOptionId,
      phantomOption,
      phantomInsight: phantomOption
        ? "迷いの末に捨てた選択肢は、あなたの中の「もう一人の自分」の声かもしれない"
        : "この質問での長い迷いは、この領域に内的な葛藤があることを示唆している",
    });
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Resonance Cascade — 共鳴連鎖
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ResonancePrediction {
  /** 予測される傾向 */
  predictedAxis: TraitAxisKey;
  /** 予測スコア */
  predictedScore: number;
  /** 予測の確信度 */
  confidence: number;
  /** 共鳴元（類似ユーザーのパターン） */
  resonanceSource: string;
  /** まだ観測されていないか */
  isUnobserved: boolean;
  /** 信頼区間 */
  confidenceInterval?: { lower: number; upper: number };
  /** 理論的根拠の分類 */
  theoreticalGrounding?: string;
}

/**
 * 共鳴連鎖予測
 * 既知の軸スコアから、まだ観測されていない軸のスコアを予測
 *
 * 原理: 「AがXならBもYである確率が高い」という共起パターン
 * 集団データなしでも、軸間の心理学的相関から推測できる
 */
export function predictResonanceCascade(
  knownScores: Partial<Record<TraitAxisKey, number>>,
  observedAxes: Set<TraitAxisKey>,
): ResonancePrediction[] {
  const predictions: ResonancePrediction[] = [];

  // 軸間の心理学的相関マップ（符号あり）
  const correlations: { from: TraitAxisKey; to: TraitAxisKey; weight: number; rationale: string }[] = [
    { from: "introvert_vs_extrovert", to: "social_initiative", weight: 0.7, rationale: "内向性は社会的イニシアチブに影響する" },
    { from: "cautious_vs_bold", to: "perfectionist_vs_pragmatic", weight: -0.5, rationale: "慎重さは完璧主義と相関する" },
    { from: "analytical_vs_intuitive", to: "plan_vs_spontaneous", weight: -0.4, rationale: "分析的な人は計画的な傾向がある" },
    { from: "emotional_variability", to: "stress_isolation_vs_social", weight: -0.4, rationale: "感情変動が大きいとストレス時に孤立しやすい" },
    { from: "independence_vs_harmony", to: "direct_vs_diplomatic", weight: 0.5, rationale: "独立志向の人は直接的なコミュニケーションを好む" },
    { from: "reassurance_need", to: "boundary_awareness", weight: -0.5, rationale: "安心欲求が強いと境界感覚が薄くなりやすい" },
    { from: "tradition_vs_novelty", to: "change_embrace_vs_resist", weight: 0.6, rationale: "新奇志向は変化受容性と強く相関する" },
    { from: "function_vs_expression", to: "minimal_vs_maximal", weight: -0.4, rationale: "機能重視の人はミニマルを好む傾向がある" },
    { from: "control_tendency", to: "exclusivity_pressure", weight: 0.5, rationale: "コントロール傾向は排他的圧力につながりやすい" },
    { from: "emotional_regulation", to: "rejection_response_maturity", weight: 0.6, rationale: "感情制御力は拒絶への成熟度に影響する" },
    // ── 追加相関 (心理学的根拠付き) ──
    { from: "plan_vs_spontaneous", to: "perfectionist_vs_pragmatic", weight: -0.5, rationale: "計画性は完成度重視と相関（Conscientiousnessのサブファセット共変動）" },
    { from: "independence_vs_harmony", to: "boundary_awareness", weight: -0.4, rationale: "独立志向は境界感覚の希薄化と関連（対人関係円環モデル, Wiggins 1995）" },
    { from: "cautious_vs_bold", to: "intimacy_pace", weight: 0.5, rationale: "リスク許容度は関係構築ペースに転移する（Sensation Seeking理論, Zuckerman 1994）" },
    { from: "introvert_vs_extrovert", to: "stress_isolation_vs_social", weight: -0.6, rationale: "外向性はストレス対処の社会性を強く予測（Big Five因子間相関, Costa & McCrae 1992）" },
    { from: "emotional_regulation", to: "emotional_variability", weight: -0.6, rationale: "感情調整能力は感情変動性を直接的に抑制（感情調整モデル, Gross 1998）" },
    { from: "consent_maturity", to: "boundary_respect", weight: 0.5, rationale: "合意成熟度と相手への配慮は対人成熟度の共変指標（Gottman 1999）" },
    { from: "direct_vs_diplomatic", to: "social_initiative", weight: 0.4, rationale: "率直さは社交的主導性と関連（対人関係円環モデルの支配-従属軸）" },
    { from: "quality_vs_quantity", to: "classic_vs_trendy", weight: -0.3, rationale: "質重視は定番志向と緩やかに相関（Openness下位ファセットの分化パターン）" },
    { from: "public_private_gap", to: "relationship_mode_split", weight: 0.5, rationale: "表裏ギャップは関係モード分裂と強く共変（自己呈示管理理論, Goffman 1959）" },
    { from: "function_vs_expression", to: "tradition_vs_novelty", weight: -0.3, rationale: "機能重視は伝統志向と弱く相関（実用主義的保守性パターン）" },
    { from: "reassurance_need", to: "intimacy_pace", weight: 0.4, rationale: "安心欲求は親密化ペースを駆動する（不安型愛着の接近動機, Bartholomew 1991）" },
    { from: "pressure_risk", to: "control_tendency", weight: 0.5, rationale: "圧力傾向はコントロール欲と相互強化する（パワー動機理論, McClelland 1975）" },
  ];

  for (const corr of correlations) {
    const fromScore = knownScores[corr.from];
    if (fromScore === undefined) continue;
    if (observedAxes.has(corr.to)) continue; // 既に観測済みならスキップ

    const predictedScore = fromScore * corr.weight;
    const axis = TRAIT_AXES.find((a) => a.id === corr.to);
    if (!axis) continue;

    // Compute confidence interval based on weight strength
    const marginOfError = 0.3 * (1 - Math.abs(corr.weight)); // tighter for stronger correlations

    predictions.push({
      predictedAxis: corr.to,
      predictedScore: Math.max(-1, Math.min(1, predictedScore)),
      confidence: Math.abs(corr.weight) * Math.min(Math.abs(fromScore) + 0.3, 1),
      resonanceSource: corr.rationale,
      isUnobserved: !observedAxes.has(corr.to),
      confidenceInterval: {
        lower: Math.max(-1, predictedScore - marginOfError),
        upper: Math.min(1, predictedScore + marginOfError),
      },
      theoreticalGrounding: corr.rationale,
    });
  }

  return predictions.sort((a, b) => b.confidence - a.confidence);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Temporal Diff — 時間差分
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TemporalDiffResult {
  axisId: TraitAxisKey;
  /** 同じ質問への回答間隔（日数） */
  daysBetween: number;
  /** スコア変化量 */
  scoreDiff: number;
  /** 変化の方向 */
  direction: "strengthened" | "weakened" | "reversed" | "stable";
  /** 変化の心理的解釈 */
  interpretation: string;
  /** 信頼度 */
  confidence: number;
}

/**
 * 同じ質問への回答の時間差分を分析
 *
 * 原理: 同一質問への回答変化は、回答者のバイアスを除いた純粋な変化を示す
 * 「揺らぎ」と「変化」を区別するため、方向の一貫性を見る
 */
export function analyzeTemporalDiff(
  reobservations: {
    questionId: string;
    axisId: TraitAxisKey;
    currentScore: number;
    previousScore: number;
    currentDate: string;
    previousDate: string;
  }[],
): TemporalDiffResult[] {
  const results: TemporalDiffResult[] = [];

  for (const obs of reobservations) {
    const daysBetween = Math.round(
      (new Date(obs.currentDate).getTime() - new Date(obs.previousDate).getTime()) / 86400000,
    );
    const scoreDiff = obs.currentScore - obs.previousScore;

    let direction: TemporalDiffResult["direction"];
    if (Math.abs(scoreDiff) < 0.1) direction = "stable";
    else if (Math.sign(obs.currentScore) !== Math.sign(obs.previousScore)) direction = "reversed";
    else if (Math.abs(obs.currentScore) > Math.abs(obs.previousScore)) direction = "strengthened";
    else direction = "weakened";

    const axis = TRAIT_AXES.find((a) => a.id === obs.axisId);
    const interpretations: Record<typeof direction, string> = {
      stable: "この領域は安定している。同じ質問に対して一貫した回答。",
      strengthened: `${axis?.labelRight ?? ""}方向への傾向が${daysBetween}日で強まった。`,
      weakened: "以前の傾向が弱まっている。中間に近づいている可能性。",
      reversed: "方向が反転している。大きな内面的変化があった可能性。",
    };

    results.push({
      axisId: obs.axisId,
      daysBetween,
      scoreDiff,
      direction,
      interpretation: interpretations[direction],
      confidence: daysBetween > 7 ? 0.8 : 0.5, // 7日以上空いた再観測は信頼度高
    });
  }

  return results;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Meta-Observation Loop — メタ観測ループ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface MetaObservationInsight {
  /** 観測結果に対するユーザーの反応 */
  reactionType: "surprised" | "validated" | "denied" | "curious" | "indifferent";
  /** メタ観測から得られるインサイト */
  insight: string;
  /** この反応が示唆する深層構造 */
  deeperImplication: string;
  /** 関連する軸 */
  relatedAxes: TraitAxisKey[];
}

/**
 * メタ観測質問を生成
 * 「あなたの観測結果はXでした。これについてどう思いますか？」
 *
 * 原理: 自分の分析結果への反応パターンそのものが、
 * 自己認識の深さと正確さを示す重要なデータ
 */
export function generateMetaObservationQuestions(
  axisScores: Partial<Record<TraitAxisKey, number>>,
  archetypeCode?: string,
): {
  questionId: string;
  prompt: string;
  context: string;
  options: { id: string; label: string; reactionType: MetaObservationInsight["reactionType"] }[];
  targetAxis: TraitAxisKey;
}[] {
  const questions = [];

  // 最も極端なスコアの軸を選ぶ（反応が出やすい）
  const extremeAxes = Object.entries(axisScores)
    .map(([id, score]) => ({ id: id as TraitAxisKey, absScore: Math.abs(score ?? 0), score: score ?? 0 }))
    .sort((a, b) => b.absScore - a.absScore)
    .slice(0, 3);

  for (const axis of extremeAxes) {
    const def = TRAIT_AXES.find((a) => a.id === axis.id);
    if (!def) continue;

    const direction = axis.score > 0 ? def.labelRight : def.labelLeft;

    questions.push({
      questionId: `meta_${axis.id}`,
      prompt: `あなたの観測結果では「${direction}」の傾向が強いと出ています。これを聞いてどう感じますか？`,
      context: `${def.labelLeft} ⇔ ${def.labelRight} の軸`,
      options: [
        { id: "surprised", label: "意外。自分ではそう思っていなかった", reactionType: "surprised" as const },
        { id: "validated", label: "やっぱり。自分でもそう思う", reactionType: "validated" as const },
        { id: "denied", label: "違う気がする。これは正確ではない", reactionType: "denied" as const },
        { id: "curious", label: "面白い。もっと知りたい", reactionType: "curious" as const },
      ],
      targetAxis: axis.id,
    });
  }

  return questions;
}

/**
 * メタ観測の回答を解析
 */
export function interpretMetaObservation(
  reactionType: MetaObservationInsight["reactionType"],
  targetAxis: TraitAxisKey,
  currentScore: number,
): MetaObservationInsight {
  const axis = TRAIT_AXES.find((a) => a.id === targetAxis);
  const axisLabel = axis ? `${axis.labelLeft}—${axis.labelRight}` : targetAxis;

  const insights: Record<MetaObservationInsight["reactionType"], { insight: string; deeper: string }> = {
    surprised: {
      insight: "自己認識と実際の傾向にギャップがある。これは盲点の可能性。",
      deeper: "「意外」と感じたこと自体が、自己像を見直す機会。この驚きの中に成長のヒントがある。",
    },
    validated: {
      insight: "自己認識が正確。この領域の自己理解度は高い。",
      deeper: "確認できた安心感の裏に、「変わりたくない」という無意識の固定がないか注意。",
    },
    denied: {
      insight: "結果を否定する反応。これ自体が重要な観測データ。",
      deeper: "否定の強さは、この領域に触れてほしくない何かがある可能性を示す。防衛反応として観察する価値がある。",
    },
    curious: {
      insight: "開放的な反応。自己理解への積極的な姿勢。",
      deeper: "好奇心は変容の前兆。この領域が今、最も変化しやすい場所かもしれない。",
    },
    indifferent: {
      insight: "この領域に関心が薄い。重要度が低いか、または触れたくない領域。",
      deeper: "無関心は2つの意味がある：本当に影響が小さい、または深く抑圧している。",
    },
  };

  const result = insights[reactionType];

  return {
    reactionType,
    insight: result.insight,
    deeperImplication: result.deeper,
    relatedAxes: [targetAxis],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Entropy Signature — エントロピー署名
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface EntropySignature {
  /** 全体的なエントロピー (0 = 完全に一貫 / 1 = 完全にランダム) */
  overallEntropy: number;
  /** エントロピーによる人格構造タイプ */
  structureType: "crystallized" | "fluid" | "fragmented" | "evolving";
  /** 軸ごとのエントロピー */
  axisEntropy: { axisId: TraitAxisKey; entropy: number; label: string }[];
  /** エントロピー署名の解釈 */
  interpretation: string;
  /** 類似する心理プロファイル */
  archetype: string;
}

/**
 * 回答のバラツキパターンからエントロピー署名を算出
 *
 * 原理: 回答の一貫性パターンは人格構造の反映
 * - 低エントロピー = 結晶化した確固たる人格
 * - 高エントロピー = 流動的で状況適応的な人格
 * - 部分的高エントロピー = 特定領域の葛藤
 */
export function computeEntropySignature(
  axisScoreHistory: Record<TraitAxisKey, number[]>,
): EntropySignature {
  const axisEntropy: { axisId: TraitAxisKey; entropy: number; label: string }[] = [];
  let totalEntropy = 0;
  let axisCount = 0;

  for (const [axisId, scores] of Object.entries(axisScoreHistory) as [TraitAxisKey, number[]][]) {
    if (scores.length < 3) continue;

    // Shannon-like entropy from score distribution
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Normalize to 0-1 (stdDev of uniform [-1,1] distribution ≈ 0.577)
    const entropy = Math.min(stdDev / 0.577, 1);

    const axis = TRAIT_AXES.find((a) => a.id === axisId);
    const label = entropy > 0.6
      ? "流動的 — この領域は状況によって大きく変わる"
      : entropy > 0.3
      ? "やや揺れがある — 葛藤や成長の兆し"
      : "安定 — この領域は確立されている";

    axisEntropy.push({ axisId, entropy, label });
    totalEntropy += entropy;
    axisCount++;
  }

  const overallEntropy = axisCount > 0 ? totalEntropy / axisCount : 0;

  // 構造タイプ判定
  const highEntropyCount = axisEntropy.filter((a) => a.entropy > 0.5).length;
  const lowEntropyCount = axisEntropy.filter((a) => a.entropy < 0.2).length;

  let structureType: EntropySignature["structureType"];
  if (overallEntropy < 0.2) structureType = "crystallized";
  else if (overallEntropy > 0.5) structureType = "fluid";
  else if (highEntropyCount > lowEntropyCount) structureType = "evolving";
  else structureType = "fragmented";

  const interpretations: Record<typeof structureType, string> = {
    crystallized: "確立された人格構造。自己一致度が高く、状況に左右されにくい。安定の強さと変化への抵抗の両面がある。",
    fluid: "流動的な人格構造。状況に応じて柔軟に変化する。適応力は高いが、自己の軸を見失うリスクもある。",
    fragmented: "一部の領域に強い葛藤がある。安定した部分と揺れる部分のコントラストが特徴。",
    evolving: "変容過程にある人格構造。現在の自分と次の自分の間で移行中。この不安定さは成長の証。",
  };

  const archetypes: Record<typeof structureType, string> = {
    crystallized: "岩盤型 — ぶれない芯を持つ人",
    fluid: "水流型 — 場に溶け込む適応の人",
    fragmented: "モザイク型 — 複数の自分を使い分ける人",
    evolving: "変態型 — 脱皮の途中にある人",
  };

  axisEntropy.sort((a, b) => b.entropy - a.entropy);

  return {
    overallEntropy,
    structureType,
    axisEntropy: axisEntropy.slice(0, 10),
    interpretation: interpretations[structureType],
    archetype: archetypes[structureType],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Resonance Cascade Validation — 共鳴カスケード検証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type CascadeAgreement =
  | "strong_agree"     // |差| < 0.2: 予測と観測がほぼ一致
  | "agree"            // |差| < 0.4: おおむね一致
  | "neutral"          // |差| < 0.6: どちらともいえない
  | "disagree"         // |差| < 0.8: 乖離あり
  | "strong_disagree"; // |差| >= 0.8: 大きな乖離（複雑性フラグ）

export interface CascadeValidationResult {
  axisId: TraitAxisKey;
  observedScore: number;
  cascadePrediction: number;
  agreement: CascadeAgreement;
  /** 信頼度調整値（-0.05 〜 +0.05） */
  confidenceAdjustment: number;
  /** 乖離がある場合の解釈 */
  insight?: string;
}

export interface CascadeValidationSummary {
  /** 観測済み軸の検証結果 */
  validations: CascadeValidationResult[];
  /** 未観測軸のカスケード推定 */
  filledAxes: ResonancePrediction[];
  /** 軸別の信頼度調整マップ */
  confidenceAdjustments: Partial<Record<TraitAxisKey, number>>;
  /** 検証統計 */
  stats: {
    totalValidated: number;
    strongAgreeCount: number;
    disagreeCount: number;
    meanAgreementScore: number;
  };
}

/**
 * 共鳴カスケード検証
 *
 * 既に観測されている軸に対して、他の軸からのカスケード予測と比較し、
 * ・一致 → 信頼度を上げる
 * ・不一致 → 信頼度を下げ、complexityFlagをセット
 * ・未観測軸 → カスケード推定値を提供
 */
export function validateWithResonanceCascade(
  observedScores: Partial<Record<TraitAxisKey, number>>,
  observedAxes: Set<TraitAxisKey>,
): CascadeValidationSummary {
  // まず全軸を「観測済み」として扱ってカスケード予測を生成
  // → 各軸について「他の軸群からの予測値」を得る
  const validations: CascadeValidationResult[] = [];
  const confidenceAdjustments: Partial<Record<TraitAxisKey, number>> = {};
  let totalAgreementScore = 0;

  // 観測済み軸ごとに：その軸を「未観測」として扱い、他の軸から予測させる
  for (const axisId of observedAxes) {
    const observedScore = observedScores[axisId];
    if (observedScore === undefined) continue;

    // この軸を除外した観測セットを作る
    const reducedObserved = new Set(observedAxes);
    reducedObserved.delete(axisId);

    // カスケード予測を実行
    const predictions = predictResonanceCascade(observedScores, reducedObserved);
    const prediction = predictions.find((p) => p.predictedAxis === axisId);
    if (!prediction) continue;

    // 予測と観測の乖離を計算
    const diff = Math.abs(observedScore - prediction.predictedScore);

    let agreement: CascadeAgreement;
    let confidenceAdj: number;
    let insight: string | undefined;

    if (diff < 0.2) {
      agreement = "strong_agree";
      confidenceAdj = 0.05;
    } else if (diff < 0.4) {
      agreement = "agree";
      confidenceAdj = 0.02;
    } else if (diff < 0.6) {
      agreement = "neutral";
      confidenceAdj = 0;
    } else if (diff < 0.8) {
      agreement = "disagree";
      confidenceAdj = -0.02;
      insight = `${axisId} のスコアが他の軸パターンからの予測と異なります。独自の傾向を持っている可能性があります。`;
    } else {
      agreement = "strong_disagree";
      confidenceAdj = -0.03;
      insight = `${axisId} は他の軸との相関パターンから大きく外れています。この軸はあなたの複雑さを示す重要な特徴です。`;
    }

    // Agreement score: 1.0 (perfect) → 0.0 (maximum disagreement)
    const agreementScore = Math.max(0, 1 - diff);
    totalAgreementScore += agreementScore;

    confidenceAdjustments[axisId] = confidenceAdj;
    validations.push({
      axisId,
      observedScore,
      cascadePrediction: prediction.predictedScore,
      agreement,
      confidenceAdjustment: confidenceAdj,
      insight,
    });
  }

  // 未観測軸のカスケード推定
  const filledAxes = predictResonanceCascade(observedScores, observedAxes);

  // 統計
  const strongAgreeCount = validations.filter((v) => v.agreement === "strong_agree").length;
  const disagreeCount = validations.filter(
    (v) => v.agreement === "disagree" || v.agreement === "strong_disagree"
  ).length;

  return {
    validations,
    filledAxes,
    confidenceAdjustments,
    stats: {
      totalValidated: validations.length,
      strongAgreeCount,
      disagreeCount,
      meanAgreementScore: validations.length > 0
        ? totalAgreementScore / validations.length
        : 0,
    },
  };
}
