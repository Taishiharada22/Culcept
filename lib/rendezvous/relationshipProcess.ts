// ============================================================
// Relationship Process Vector — Partner 枠専用の関係プロセス評価
//
// 科学的根拠:
// - Gottman (1994): Four Horsemen → 離婚予測精度 80-93%
// - Gottman (2001): Bid 応答率 → 6年後離婚: 33%, 継続: 86%
// - Knee (1998): Growth belief → 困難時に建設的対処
// - Gottman (1994): 葛藤スタイルの一致 → 関係安定性
//
// Stargazer 45軸のうち関係性評価に使用する軸（30軸）:
// Core: introvert_vs_extrovert, individual_vs_social, cautious_vs_bold,
//        change_embrace_vs_resist, independence_vs_harmony, direct_vs_diplomatic,
//        stress_isolation_vs_social
// Stage 1: intimacy_pace, reassurance_need, emotional_variability,
//           social_initiative, boundary_awareness
// Stage 2: boundary_respect, consent_maturity, pressure_risk, escalation_risk,
//           intent_stability, rejection_response_maturity, control_tendency,
//           exclusivity_pressure, long_term_shift_risk, public_private_gap,
//           emotional_regulation
// Stage 3: attachment_style, locus_of_control, growth_mindset, shame_vs_guilt,
//           rumination_tendency, fairness_sensitivity
// ============================================================

import { similarityScore } from "./similarityScore";

// ── 型定義 ──

/**
 * Stargazer 45軸のスコア（-1..+1）
 * 必要な軸のみ partial で受け取る
 */
export type StargazerAxesPartial = Partial<Record<string, number>>;

/**
 * Gottman の葛藤解決3類型
 * - validator: 感情を認め合いながら妥協を見つける。穏やか
 * - volatile: 情熱的に争い、情熱的に仲直り。5:1比率を維持すれば安定
 * - avoider: 対立を最小化、共通点を重視。双方が回避型なら安定し得る
 *
 * 同型同士が安定。異型の組み合わせ（特に volatile × avoider）は不安定。
 * 出典: Gottman (1994), "What Predicts Divorce"
 */
export type ConflictStyle = "validator" | "volatile" | "avoider";

export type ConflictStyleProfile = {
  /** 各スタイルへの傾向スコア (0..1) */
  validator: number;
  volatile: number;
  avoider: number;
  /** 最も強い傾向 */
  primary: ConflictStyle;
};

/**
 * Four Horsemen リスクプロファイル
 * Gottman の「離婚予測の四騎士」の個人レベルの傾向
 *
 * 各次元 0..1（低いほど健全）
 */
export type FourHorsemenProfile = {
  /** 批判傾向: パートナーの人格への攻撃パターン */
  criticismRisk: number;
  /** 軽蔑傾向: 見下し・皮肉・冷笑（離婚の最強単独予測因子） */
  contemptRisk: number;
  /** 防衛傾向: 責任回避・逆非難 */
  defensivenessRisk: number;
  /** 石壁化傾向: 会話からの撤退・無反応 */
  stonewallingRisk: number;
  /** 総合リスクスコア (0..1, 低いほど良い) */
  overallRisk: number;
};

/**
 * Cognitive Profile — 認知スタイルの6次元
 * 「話が通じるか」の土台。思考の組み立て方・意思決定のテンポ・結論の出し方
 */
export type CognitiveProfile = {
  /** 抽象⇔具体: 概念的に掴むか、事実を積み上げるか */
  abstractStructuring: number;
  /** 分解力: 問題を要素に分ける傾向 */
  decomposition: number;
  /** 認知更新: 新情報で考えを修正する柔軟さ */
  cognitiveUpdating: number;
  /** 決断テンポ: 即決⇔熟考 */
  decisionTempo: number;
  /** 社会モデリング: 他者の思考を読む力 */
  socialModeling: number;
  /** 探索⇔閉合: 可能性を広げ続けるか、結論を出すか */
  explorationClosure: number;
};

/**
 * Relationship Process Vector — 7次元
 * Partner カテゴリのスコアリングに使用
 */
export type RelationshipProcessVector = {
  /** Gottman Four Horsemen の総合リスク (0..1, 低いほど良い) */
  fourHorsemenRisk: number;
  /** 愛着互換性スコア (0..1) — attachmentProfile.ts から取得 */
  attachmentFit: number;
  /** 葛藤解決スタイルの一致度 (0..1) */
  conflictStyleMatch: number;
  /** 修復能力の互換性 (0..1) — conflictRepair.ts から取得 */
  repairCapacity: number;
  /** Bid（日常の注意引き試み）への応答傾向 (0..1) */
  bidResponsiveness: number;
  /** 成長信念 vs 運命信念 (0..1, 高い=成長信念) */
  growthVsDestiny: number;
  /** 認知的相性 (0..1) — 思考スタイルの互換性 */
  cognitiveFit: number;
};

/**
 * 関係性評価に使用する全35軸
 * process-profile API でデータ充足率の計算に使用
 */
export const RELATIONSHIP_AXES = [
  // Core
  "introvert_vs_extrovert", "individual_vs_social", "cautious_vs_bold",
  "change_embrace_vs_resist", "independence_vs_harmony", "direct_vs_diplomatic",
  "stress_isolation_vs_social",
  // Stage 1
  "intimacy_pace", "reassurance_need", "emotional_variability",
  "social_initiative", "boundary_awareness",
  // Stage 2
  "boundary_respect", "consent_maturity", "pressure_risk", "escalation_risk",
  "intent_stability", "rejection_response_maturity", "control_tendency",
  "exclusivity_pressure", "long_term_shift_risk", "public_private_gap",
  "emotional_regulation",
  // Stage 3
  "attachment_style", "locus_of_control", "growth_mindset", "shame_vs_guilt",
  "rumination_tendency", "fairness_sensitivity",
  // Cognitive (認知的相性 — 話が通じるかの土台)
  "abstract_structuring", "decomposition", "cognitive_updating",
  "decision_tempo", "social_modeling", "exploration_closure",
] as const;

/**
 * 観測済み軸の充足率を計算
 * @returns 0..1 (例: 13/30 = 0.43)
 */
export function computeAxisCoverage(scores: StargazerAxesPartial): number {
  let observed = 0;
  for (const axis of RELATIONSHIP_AXES) {
    if (scores[axis] !== undefined) observed++;
  }
  return observed / RELATIONSHIP_AXES.length;
}

// ── Four Horsemen Risk 計算 ──

/**
 * Stargazer 45軸から Four Horsemen リスクを算出
 *
 * マッピング根拠:
 * - criticism ← control_tendency (支配的→批判的), direct_vs_diplomatic (直接的→攻撃的になりうる),
 *               pressure_risk (圧力リスク), boundary_respect⁻¹ (境界無視→攻撃的)
 * - contempt ← emotional_regulation⁻¹ (感情制御低い), public_private_gap (二面性→軽蔑),
 *              shame_vs_guilt (恥志向→他者を貶める傾向)
 * - defensiveness ← rejection_response_maturity⁻¹ (拒絶への未熟な反応), fairness_sensitivity (過敏→被害者意識),
 *                   locus_of_control⁻¹ (外的統制→責任転嫁)
 * - stonewalling ← stress_isolation_vs_social (ストレス時孤立), introvert_vs_extrovert⁻¹ (内向→撤退),
 *                  emotional_variability⁻¹ (感情の平坦さ→無反応), individual_vs_social⁻¹ (個人志向→撤退)
 */
export function computeFourHorsemenProfile(
  scores: StargazerAxesPartial,
): FourHorsemenProfile {
  const norm = (axis: string, fallback: number) => {
    const v = scores[axis];
    return v !== undefined ? (v + 1) / 2 : fallback;
  };

  // --- Criticism Risk ---
  const controlTendency = norm("control_tendency", 0.3);
  const directness = norm("direct_vs_diplomatic", 0.5);
  const emotionalReg = norm("emotional_regulation", 0.5);
  const pressureRisk = norm("pressure_risk", 0.3);
  const boundaryRespect = norm("boundary_respect", 0.5);
  const criticismRisk = clamp(
    controlTendency * 0.30 +
    directness * 0.20 +
    (1 - emotionalReg) * 0.20 +
    pressureRisk * 0.15 +
    (1 - boundaryRespect) * 0.15,
  );

  // --- Contempt Risk（最強の離婚予測因子）---
  const publicPrivateGap = norm("public_private_gap", 0.3);
  const exclusivityPressure = norm("exclusivity_pressure", 0.3);
  const shameVsGuilt = norm("shame_vs_guilt", 0.5);
  const contemptRisk = clamp(
    (1 - emotionalReg) * 0.25 +
    publicPrivateGap * 0.25 +
    controlTendency * 0.15 +
    exclusivityPressure * 0.15 +
    shameVsGuilt * 0.20, // 恥志向 → 他者を貶めて自己防衛
  );

  // --- Defensiveness Risk ---
  const rejectionMaturity = norm("rejection_response_maturity", 0.5);
  const fairnessSensitivity = norm("fairness_sensitivity", 0.5);
  const locusOfControl = norm("locus_of_control", 0.5);
  const defensivenessRisk = clamp(
    (1 - rejectionMaturity) * 0.40 +
    fairnessSensitivity * 0.25 +
    (1 - locusOfControl) * 0.35,
  );

  // --- Stonewalling Risk ---
  const stressIsolation = norm("stress_isolation_vs_social", 0.5);
  const introversion = 1 - norm("introvert_vs_extrovert", 0.5);
  const emotionalVar = norm("emotional_variability", 0.5);
  const individualVsSocial = norm("individual_vs_social", 0.5);
  const stonewallingRisk = clamp(
    stressIsolation * 0.25 +
    introversion * 0.15 +
    (1 - emotionalVar) * 0.20 + // 感情の平坦さ → 無反応・撤退
    (1 - individualVsSocial) * 0.15 + // 個人志向 → 撤退しやすい
    (1 - emotionalReg) * 0.25,
  );

  // --- Overall Risk ---
  const overallRisk = clamp(
    contemptRisk * 0.35 +
    criticismRisk * 0.25 +
    defensivenessRisk * 0.20 +
    stonewallingRisk * 0.20,
  );

  return {
    criticismRisk,
    contemptRisk,
    defensivenessRisk,
    stonewallingRisk,
    overallRisk,
  };
}

/**
 * 2者間の Four Horsemen 互換性スコア
 */
export function computeFourHorsemenFit(
  aProfile: FourHorsemenProfile,
  bProfile: FourHorsemenProfile,
): number {
  const avgRisk = (aProfile.overallRisk + bProfile.overallRisk) / 2;
  const maxContempt = Math.max(aProfile.contemptRisk, bProfile.contemptRisk);
  const contemptPenalty = maxContempt > 0.6 ? (maxContempt - 0.6) * 0.5 : 0;
  const cdLoop1 = aProfile.criticismRisk * bProfile.defensivenessRisk;
  const cdLoop2 = bProfile.criticismRisk * aProfile.defensivenessRisk;
  const cdLoopPenalty = Math.max(cdLoop1, cdLoop2) > 0.35
    ? (Math.max(cdLoop1, cdLoop2) - 0.35) * 0.3
    : 0;
  return clamp(1 - avgRisk - contemptPenalty - cdLoopPenalty);
}

// ── Conflict Style 分類 ──

/**
 * Stargazer 45軸から Gottman の葛藤解決3類型を分類
 *
 * 追加軸:
 * - escalation_risk: volatile の強化シグナル
 * - cautious_vs_bold: avoider 傾向の補助
 * - intimacy_pace: 関係の深め方の速度
 */
export function classifyConflictStyle(
  scores: StargazerAxesPartial,
): ConflictStyleProfile {
  const norm = (axis: string, fallback: number) => {
    const v = scores[axis];
    return v !== undefined ? (v + 1) / 2 : fallback;
  };

  const emotionalReg = norm("emotional_regulation", 0.5);
  const emotionalVar = norm("emotional_variability", 0.5);
  const conflictDir = norm("direct_vs_diplomatic", 0.5);
  const independence = norm("independence_vs_harmony", 0.5);
  const boundaryAware = norm("boundary_awareness", 0.5);
  const consentMaturity = norm("consent_maturity", 0.5);
  const changeEmbrace = norm("change_embrace_vs_resist", 0.5);
  const escalationRisk = norm("escalation_risk", 0.3);
  const cautiousVsBold = norm("cautious_vs_bold", 0.5);
  const intimacyPace = norm("intimacy_pace", 0.5);

  // Validator: 感情制御能力が高く、適度に直接的で、合意形成が得意
  const validator = clamp(
    emotionalReg * 0.30 +
    (1 - Math.abs(conflictDir - 0.55) * 2) * 0.25 +
    consentMaturity * 0.30 +
    (1 - escalationRisk) * 0.15, // エスカレーションしない
  );

  // Volatile: 感情の波が大きく、直接的で、変化を恐れない
  const volatile = clamp(
    emotionalVar * 0.25 +
    conflictDir * 0.25 +
    changeEmbrace * 0.20 +
    escalationRisk * 0.15 + // エスカレーションしやすい
    cautiousVsBold * 0.15, // 大胆
  );

  // Avoider: 対立を避け、独立性を重視し、境界を明確に保つ
  const avoider = clamp(
    (1 - conflictDir) * 0.25 +
    independence * 0.20 +
    boundaryAware * 0.25 +
    (1 - cautiousVsBold) * 0.15 + // 慎重
    (1 - intimacyPace) * 0.15, // 親密さのペースが遅い
  );

  // 正規化（合計を1に）
  const total = validator + volatile + avoider;
  const normFactor = total > 0 ? 1 / total : 1 / 3;

  const normalizedValidator = validator * normFactor;
  const normalizedVolatile = volatile * normFactor;
  const normalizedAvoider = avoider * normFactor;

  let primary: ConflictStyle = "validator";
  if (normalizedVolatile > normalizedValidator && normalizedVolatile > normalizedAvoider) {
    primary = "volatile";
  } else if (normalizedAvoider > normalizedValidator && normalizedAvoider > normalizedVolatile) {
    primary = "avoider";
  }

  return {
    validator: normalizedValidator,
    volatile: normalizedVolatile,
    avoider: normalizedAvoider,
    primary,
  };
}

/**
 * 2者間の葛藤解決スタイル互換性
 */
export function computeConflictStyleFit(
  a: ConflictStyleProfile,
  b: ConflictStyleProfile,
): number {
  const dotProduct = a.validator * b.validator + a.volatile * b.volatile + a.avoider * b.avoider;
  const magA = Math.sqrt(a.validator ** 2 + a.volatile ** 2 + a.avoider ** 2);
  const magB = Math.sqrt(b.validator ** 2 + b.volatile ** 2 + b.avoider ** 2);
  const cosineSim = magA > 0 && magB > 0 ? dotProduct / (magA * magB) : 0.5;
  const primaryMatch = a.primary === b.primary ? 0.15 : 0;
  const vaConflict = a.volatile * b.avoider + b.volatile * a.avoider;
  const vaPenalty = vaConflict > 0.4 ? (vaConflict - 0.4) * 0.3 : 0;
  return clamp(cosineSim * 0.85 + primaryMatch - vaPenalty);
}

// ── Bid Responsiveness ──

/**
 * Bid への応答傾向 — Gottman (2001) "The Relationship Cure"
 *
 * 追加軸:
 * - intimacy_pace: bid への応答速度に影響
 * - boundary_respect: 相手の bid を尊重する能力
 * - individual_vs_social: 社会的志向がbid応答に影響
 */
export function computeBidResponsiveness(
  scores: StargazerAxesPartial,
): number {
  const norm = (axis: string, fallback: number) => {
    const v = scores[axis];
    return v !== undefined ? (v + 1) / 2 : fallback;
  };

  const socialInit = norm("social_initiative", 0.5);
  const emotionalVar = norm("emotional_variability", 0.5); // 感情が動く → bid に反応しやすい
  const reassurance = norm("reassurance_need", 0.5);
  const extroversion = norm("introvert_vs_extrovert", 0.5);
  const boundaryAware = norm("boundary_awareness", 0.5);
  const emotionalReg = norm("emotional_regulation", 0.5);
  const intimacyPace = norm("intimacy_pace", 0.5);
  const boundaryRespect = norm("boundary_respect", 0.5);
  const individualVsSocial = norm("individual_vs_social", 0.5);

  const responsiveBase = clamp(
    emotionalVar * 0.20 + // 感情が動く人は bid に気づきやすい
    socialInit * 0.20 +
    extroversion * 0.10 +
    boundaryAware * 0.10 +
    emotionalReg * 0.10 +
    intimacyPace * 0.10 + // 親密さへの積極性
    boundaryRespect * 0.10 + // 相手を尊重する姿勢
    individualVsSocial * 0.10, // 社会志向
  );

  // 過剰反応ペナルティ
  const overreactionPenalty = reassurance > 0.75
    ? (reassurance - 0.75) * 0.3
    : 0;

  return clamp(responsiveBase - overreactionPenalty);
}

/**
 * 2者間の Bid 応答互換性
 */
export function computeBidResponsivenessFit(
  aBid: number,
  bBid: number,
): number {
  const avgBid = (aBid + bBid) / 2;
  const gap = Math.abs(aBid - bBid);
  const asymmetryPenalty = gap > 0.25 ? (gap - 0.25) * 0.25 : 0;
  const bothLowPenalty = Math.min(aBid, bBid) < 0.35
    ? (0.35 - Math.min(aBid, bBid)) * 0.3
    : 0;
  return clamp(avgBid - asymmetryPenalty - bothLowPenalty);
}

// ── Growth vs Destiny Belief ──

/**
 * 成長信念 vs 運命信念 — Knee (1998), Finkel et al. (2013)
 *
 * 追加軸:
 * - intent_stability: 意図の安定性 → 関係への長期コミットメント
 * - long_term_shift_risk⁻¹: 長期変化リスクが低い → 安定した成長志向
 */
export function computeGrowthVsDestiny(
  scores: StargazerAxesPartial,
): number {
  const norm = (axis: string, fallback: number) => {
    const v = scores[axis];
    return v !== undefined ? (v + 1) / 2 : fallback;
  };

  const growthMindset = norm("growth_mindset", 0.5);
  const changeEmbrace = norm("change_embrace_vs_resist", 0.5);
  const locusOfControl = norm("locus_of_control", 0.5);
  const rumination = norm("rumination_tendency", 0.5);
  const intentStability = norm("intent_stability", 0.5);
  const longTermShiftRisk = norm("long_term_shift_risk", 0.5);

  return clamp(
    growthMindset * 0.30 +
    changeEmbrace * 0.20 +
    locusOfControl * 0.15 +
    (1 - rumination) * 0.10 +
    intentStability * 0.15 + // 意図が安定 → 成長を信じて続けられる
    (1 - longTermShiftRisk) * 0.10, // 長期変化リスクが低い → 安定
  );
}

/**
 * 2者間の Growth/Destiny 信念互換性
 */
export function computeGrowthVsDestinyFit(
  aGrowth: number,
  bGrowth: number,
): number {
  const avgGrowth = (aGrowth + bGrowth) / 2;
  const sim = similarityScore(aGrowth, bGrowth);
  const bothHighBonus = Math.min(aGrowth, bGrowth) > 0.6
    ? (Math.min(aGrowth, bGrowth) - 0.6) * 0.2
    : 0;
  return clamp(avgGrowth * 0.50 + sim * 0.35 + bothHighBonus + 0.10);
}

// ── Cognitive Fit（認知的相性）──

/**
 * Stargazer 認知6軸から Cognitive Profile を算出
 *
 * 認知的相性 = 「話が通じるか」の土台
 * - abstract_structuring: 「概念で掴む」vs「事実を積む」— 思考の抽象度
 * - decomposition: 問題を分解する力 — 議論の構造化能力
 * - cognitive_updating: 新情報で柔軟に考えを更新できるか
 * - decision_tempo: 即決 vs 熟考 — 意思決定のテンポ不一致はストレス
 * - social_modeling: 相手の思考を読む力 — コミュニケーションの齟齬を防ぐ
 * - exploration_closure: 探索を続けるか結論を出すか — 会話の着地点の違い
 */
export function computeCognitiveProfile(
  scores: StargazerAxesPartial,
): CognitiveProfile {
  const norm = (axis: string, fallback: number) => {
    const v = scores[axis];
    return v !== undefined ? (v + 1) / 2 : fallback;
  };

  return {
    abstractStructuring: norm("abstract_structuring", 0.5),
    decomposition: norm("decomposition", 0.5),
    cognitiveUpdating: norm("cognitive_updating", 0.5),
    decisionTempo: norm("decision_tempo", 0.5),
    socialModeling: norm("social_modeling", 0.5),
    explorationClosure: norm("exploration_closure", 0.5),
  };
}

/**
 * 2者間の認知的相性を算出
 *
 * 重要な知見:
 * - decision_tempo の不一致が最もストレスフル（「早く決めて」vs「もう少し考えたい」）
 * - abstract_structuring の不一致は会話の噛み合わなさに直結
 * - exploration_closure の不一致は議論の終わらなさ/打ち切り感に
 * - social_modeling は両者高い方が良い（相互理解能力）
 * - cognitive_updating は両者高い方が良い（柔軟性）
 * - decomposition は類似度より平均（ある程度高い方が良い）
 */
export function computeCognitiveFit(
  a: CognitiveProfile,
  b: CognitiveProfile,
): number {
  // テンポの類似度（最重要: 不一致は日常的なフラストレーション）
  const tempoSim = similarityScore(a.decisionTempo, b.decisionTempo);

  // 抽象度の類似度（会話が噛み合うか）
  const abstractSim = similarityScore(a.abstractStructuring, b.abstractStructuring);

  // 探索/閉合の類似度（議論の着地点が合うか）
  const closureSim = similarityScore(a.explorationClosure, b.explorationClosure);

  // 相互理解能力（両者の平均 — 高い方が良い）
  const avgModeling = (a.socialModeling + b.socialModeling) / 2;

  // 柔軟性（両者の平均 — 高い方が良い。差があっても柔軟なら吸収できる）
  const avgUpdating = (a.cognitiveUpdating + b.cognitiveUpdating) / 2;

  // 分解力の平均（議論の構造化能力）
  const avgDecomp = (a.decomposition + b.decomposition) / 2;

  return clamp(
    tempoSim * 0.25 +        // 決断テンポの一致
    abstractSim * 0.20 +     // 抽象度の一致
    closureSim * 0.15 +      // 探索/閉合の一致
    avgModeling * 0.20 +     // 相互理解能力
    avgUpdating * 0.10 +     // 認知的柔軟性
    avgDecomp * 0.10,        // 構造化能力
  );
}

// ── Relationship Process Vector 統合 ──

/**
 * 2者間の Relationship Process Vector を算出
 */
export function computeRelationshipProcessVector(params: {
  aStargazerScores: StargazerAxesPartial;
  bStargazerScores: StargazerAxesPartial;
  attachmentFit: number;
  repairCapacity: number;
}): RelationshipProcessVector {
  const { aStargazerScores, bStargazerScores, attachmentFit, repairCapacity } = params;

  const aHorsemen = computeFourHorsemenProfile(aStargazerScores);
  const bHorsemen = computeFourHorsemenProfile(bStargazerScores);
  const fourHorsemenFit = computeFourHorsemenFit(aHorsemen, bHorsemen);

  const aStyle = classifyConflictStyle(aStargazerScores);
  const bStyle = classifyConflictStyle(bStargazerScores);
  const conflictStyleMatch = computeConflictStyleFit(aStyle, bStyle);

  const aBid = computeBidResponsiveness(aStargazerScores);
  const bBid = computeBidResponsiveness(bStargazerScores);
  const bidResponsiveness = computeBidResponsivenessFit(aBid, bBid);

  const aGrowth = computeGrowthVsDestiny(aStargazerScores);
  const bGrowth = computeGrowthVsDestiny(bStargazerScores);
  const growthVsDestiny = computeGrowthVsDestinyFit(aGrowth, bGrowth);

  const aCog = computeCognitiveProfile(aStargazerScores);
  const bCog = computeCognitiveProfile(bStargazerScores);
  const cognitiveFit = computeCognitiveFit(aCog, bCog);

  return {
    fourHorsemenRisk: 1 - fourHorsemenFit,
    attachmentFit,
    conflictStyleMatch,
    repairCapacity,
    bidResponsiveness,
    growthVsDestiny,
    cognitiveFit,
  };
}

/**
 * Process Vector から総合 Process Fit スコアを算出
 *
 * 重み配分:
 * - fourHorsemenRisk (0.20): 離婚予測精度 80-93%
 * - attachmentFit (0.15): 関係満足度と r=-.35~-.40
 * - conflictStyleMatch (0.12): 同型一致が安定性の基盤
 * - repairCapacity (0.18): 修復能力は全ての関係問題のバッファ
 * - bidResponsiveness (0.10): 日常の微細なインタラクション
 * - growthVsDestiny (0.10): 困難時のレジリエンス
 * - cognitiveFit (0.15): 認知的相性 — 話が通じるかの土台
 */
export function computeProcessFitScore(
  vector: RelationshipProcessVector,
): number {
  const score =
    (1 - vector.fourHorsemenRisk) * 0.20 +
    vector.attachmentFit * 0.15 +
    vector.conflictStyleMatch * 0.12 +
    vector.repairCapacity * 0.18 +
    vector.bidResponsiveness * 0.10 +
    vector.growthVsDestiny * 0.10 +
    vector.cognitiveFit * 0.15;
  return clamp(score);
}

/**
 * Process Vector 用の Guard チェック
 */
export function processGuard(
  vector: RelationshipProcessVector,
): { pass: boolean; failedDimension?: string } {
  if (vector.fourHorsemenRisk > 0.75) {
    return { pass: false, failedDimension: "four_horsemen_risk" };
  }
  if (vector.attachmentFit < 0.35) {
    return { pass: false, failedDimension: "attachment_fit" };
  }
  if (vector.repairCapacity < 0.30) {
    return { pass: false, failedDimension: "repair_capacity" };
  }
  return { pass: true };
}

// ── ユーティリティ ──

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}
