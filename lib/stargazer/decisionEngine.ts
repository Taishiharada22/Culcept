// lib/stargazer/decisionEngine.ts
// Decision Engine — 小判断（日常判断）向け MVP
//
// 既存の decisionOracle.ts（大きな決断向け）とは独立した新エンジン。
// 「未来の自分が先に試す」シミュレーションを、
// 軸スコア・矛盾マップ・現在の状態・過去パターンから算出する。
//
// 設計原則:
// - 断定ではなく確率ベースの提示
// - 「提案しない勇気」: 不確実性が高ければ withheld = true
// - 認知バイアスの検出と警告

import type { TraitAxisKey } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SmallDecisionType =
  | "social"
  | "reply"
  | "priority"
  | "rest"
  | "purchase"
  | "free";

export interface SmallDecisionQuery {
  type: SmallDecisionType;
  /** ユーザーの質問（自然言語） */
  question: string;
  /** 選択肢（指定がなければ自動生成） */
  options?: string[];
  /** 追加コンテキスト */
  context?: string;
  /** 緊急度 */
  urgency?: "low" | "medium" | "high";
}

export interface DecisionSimulation {
  option: string;
  /** 合いやすさ 0-1 */
  compatibility: number;
  /** 消耗しやすさ 0-1 */
  exhaustionRisk: number;
  /** 後悔しやすさ 0-1 */
  regretProbability: number;
  /** 回復しやすさ 0-1 */
  recoveryEase: number;
  /** 不確実性 0-1 */
  uncertainty: number;
  /** シミュレーション物語（日本語） */
  narrative: string;
  /** 時系列の予測 */
  timelineEvents: TimelineEvent[];
}

export interface TimelineEvent {
  /** 「直後」「1時間後」「翌日」等 */
  timing: string;
  /** 何が起きるか */
  prediction: string;
  /** 0-1 */
  confidence: number;
}

export interface DecisionEngineInput {
  query: SmallDecisionQuery;
  // ── 長期的個人モデル ──
  axisScores: Record<string, number>;
  archetypeCode: string;
  contradictionMap?: Record<string, ContradictionEntry>;
  defensePatterns?: string[];
  regretPatterns?: string[];
  // ── 今日の状態 ──
  currentState: CurrentState;
  // ── 過去パターン ──
  pastDecisions?: PastDecision[];
}

export interface ContradictionEntry {
  isDual?: boolean;
  contradictionStrength?: number;
  poles?: [number, number] | null;
}

export interface CurrentState {
  /** 社交バッテリー 0-1 */
  socialBattery: number;
  /** 認知負荷 0-1 */
  cognitiveLoad: number;
  /** エネルギーレベル -1 to 1 */
  energyLevel: number;
  /** ストレスレベル 0-1 */
  stressLevel: number;
}

export interface PastDecision {
  type: SmallDecisionType;
  chose: string;
  regretted: boolean;
  context?: string;
}

export interface DecisionEngineOutput {
  simulations: DecisionSimulation[];
  /** 後悔が最も少ない選択（nullなら提案保留） */
  recommended?: string;
  /** 提案を保留したか */
  withheld: boolean;
  /** 保留理由 */
  withheldReason?: string;
  /** 認知パターン警告 */
  blindSpotWarning?: string;
  /** 全体の不確実性 */
  overallUncertainty: number;
}

export interface WithholdConditions {
  /** 不確実性が高い */
  highUncertainty: boolean;
  /** 類似データが少ない */
  insufficientData: boolean;
  /** 今日の状態推定が不安定 */
  unstableState: boolean;
  /** 文脈情報が不足 */
  insufficientContext: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 判断タイプごとの関連軸 */
const DECISION_RELEVANT_AXES: Record<SmallDecisionType, TraitAxisKey[]> = {
  social: [
    "introvert_vs_extrovert",
    "individual_vs_social",
    "social_initiative",
    "stress_isolation_vs_social",
    "boundary_awareness",
    "emotional_regulation",
  ],
  reply: [
    "direct_vs_diplomatic",
    "independence_vs_harmony",
    "emotional_regulation",
    "reassurance_need",
    "decision_tempo",
  ],
  priority: [
    "plan_vs_spontaneous",
    "analytical_vs_intuitive",
    "perfectionist_vs_pragmatic",
    "abstract_structuring",
    "decomposition",
    "exploration_closure",
  ],
  rest: [
    "introvert_vs_extrovert",
    "stress_isolation_vs_social",
    "emotional_variability",
    "function_vs_expression",
    "energyLevel" as TraitAxisKey,
  ],
  purchase: [
    "cautious_vs_bold",
    "quality_vs_quantity",
    "function_vs_expression",
    "minimal_vs_maximal",
    "tradition_vs_novelty",
    "classic_vs_trendy",
  ],
  free: [
    "analytical_vs_intuitive",
    "cautious_vs_bold",
    "independence_vs_harmony",
    "emotional_regulation",
    "decision_tempo",
  ],
};

/** 提案保留の閾値 */
const WITHHOLD_UNCERTAINTY_THRESHOLD = 0.7;
const MIN_PAST_DECISIONS_FOR_PATTERN = 2;

/** デフォルトの選択肢（タイプ別） */
const DEFAULT_OPTIONS: Record<SmallDecisionType, string[]> = {
  social: ["参加する", "今日はパスする", "短時間だけ顔を出す"],
  reply: ["すぐ返信する", "少し時間をおいてから返す", "明日返す"],
  priority: ["今すぐ取りかかる", "他のタスクを先にやる", "今日はやらない"],
  rest: ["しっかり休む", "軽く体を動かす", "趣味に没頭する"],
  purchase: ["買う", "もう少し検討する", "今は見送る"],
  free: ["やる", "やらない", "保留する"],
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Entry
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 小判断シミュレーションのメイン関数。
 * 各選択肢についてシミュレーションを実行し、
 * 提案しない条件に該当すれば withheld=true で返す。
 */
export function evaluateDecision(
  input: DecisionEngineInput,
): DecisionEngineOutput {
  const { query } = input;

  // 選択肢を確定（未指定ならデフォルトから補充）
  const options =
    query.options && query.options.length > 0
      ? query.options
      : DEFAULT_OPTIONS[query.type] ?? ["はい", "いいえ"];

  // 提案しない条件をチェック
  const withhold = checkWithholdConditions(input);
  const shouldWithhold =
    withhold.highUncertainty ||
    withhold.insufficientData ||
    withhold.unstableState ||
    withhold.insufficientContext;

  // 各選択肢のシミュレーション
  const simulations = options.map((opt) => simulateOption(opt, input));

  // 全体の不確実性
  const overallUncertainty =
    simulations.length > 0
      ? simulations.reduce((sum, s) => sum + s.uncertainty, 0) /
        simulations.length
      : 1;

  // 認知バイアス検出
  const blindSpotWarning = detectCognitiveBias(query, input);

  // 推奨の決定
  let recommended: string | undefined;
  let withheldReason: string | undefined;

  if (shouldWithhold) {
    withheldReason = buildWithholdReason(withhold);
  } else {
    // 後悔確率が最も低い選択を推奨
    const sorted = [...simulations].sort(
      (a, b) => a.regretProbability - b.regretProbability,
    );
    // ただし上位2つの差が不確実性の範囲内なら推奨しない
    if (
      sorted.length >= 2 &&
      sorted[1].regretProbability - sorted[0].regretProbability <
        overallUncertainty * 0.3
    ) {
      withheldReason =
        "上位の選択肢間の差が小さく、どちらを選んでも後悔の度合いは近いです。直感を信じてよい場面です。";
    } else if (sorted.length > 0) {
      recommended = sorted[0].option;
    }
  }

  return {
    simulations,
    recommended,
    withheld: shouldWithhold || !recommended,
    withheldReason,
    blindSpotWarning,
    overallUncertainty,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Withhold Conditions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 提案しない条件を判定。
 * 4つの条件のいずれかに該当すれば、提案を保留すべき。
 */
export function checkWithholdConditions(
  input: DecisionEngineInput,
): WithholdConditions {
  const { query, pastDecisions, currentState } = input;

  // 1. 文脈情報が不足: optionsもcontextもない
  const insufficientContext =
    (!query.options || query.options.length === 0) && !query.context;

  // 2. 類似データが少ない: pastDecisionsで同タイプが2件未満
  const similarPast = (pastDecisions ?? []).filter(
    (d) => d.type === query.type,
  );
  const insufficientData = similarPast.length < MIN_PAST_DECISIONS_FOR_PATTERN;

  // 3. 状態が不安定: 極端な値の組み合わせ
  const unstableState = detectUnstableState(currentState);

  // 4. 不確実性が高い: 関連軸のスコアが弱い（0に近い）ものが多い
  const relevantAxes = DECISION_RELEVANT_AXES[query.type] ?? [];
  const weakAxes = relevantAxes.filter((key) => {
    const s = input.axisScores[key];
    return s === undefined || Math.abs(s) < 0.15;
  });
  const highUncertainty =
    relevantAxes.length > 0 &&
    weakAxes.length / relevantAxes.length > WITHHOLD_UNCERTAINTY_THRESHOLD;

  return {
    highUncertainty,
    insufficientData,
    unstableState,
    insufficientContext,
  };
}

function detectUnstableState(state: CurrentState): boolean {
  // 極端な消耗 + 高ストレスの同時発生は不安定
  const extremeDepletion =
    state.socialBattery < 0.15 && state.energyLevel < -0.5;
  const highCogStress =
    state.cognitiveLoad > 0.85 && state.stressLevel > 0.8;
  return extremeDepletion || highCogStress;
}

function buildWithholdReason(w: WithholdConditions): string {
  const reasons: string[] = [];
  if (w.highUncertainty)
    reasons.push(
      "あなたの判断傾向データがまだ十分に蓄積されていません",
    );
  if (w.insufficientData)
    reasons.push(
      "この種類の判断についての過去パターンが少なく、精度が保証できません",
    );
  if (w.unstableState)
    reasons.push(
      "現在の状態が通常と大きく異なるため、今の判断は普段のあなたを反映しない可能性があります",
    );
  if (w.insufficientContext)
    reasons.push(
      "判断の背景情報が不足しています。もう少し状況を教えていただければ、より精度の高い分析が可能です",
    );
  return reasons.join("。") + "。";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Simulation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 1つの選択肢についてシミュレーションを実行。
 * compatibility, exhaustionRisk, regretProbability, recoveryEase を算出し、
 * 「直後」「1時間後」「翌日」の3段階タイムラインを生成。
 */
export function simulateOption(
  option: string,
  input: DecisionEngineInput,
): DecisionSimulation {
  const { query, axisScores, currentState, contradictionMap, regretPatterns, pastDecisions } =
    input;

  const relevantAxes = DECISION_RELEVANT_AXES[query.type] ?? [];

  // ── compatibility: 関連軸との整合性 ──
  const compatibility = computeCompatibility(
    option,
    query,
    relevantAxes,
    axisScores,
  );

  // ── exhaustionRisk: 状態ベースの消耗予測 ──
  const exhaustionRisk = computeExhaustionRisk(
    option,
    query,
    currentState,
    axisScores,
  );

  // ── regretProbability: 後悔パターンとの一致度 ──
  const regretProbability = computeRegretProbability(
    option,
    query,
    regretPatterns ?? [],
    pastDecisions ?? [],
    compatibility,
    exhaustionRisk,
  );

  // ── recoveryEase: 可逆性 + 回復パターン ──
  const recoveryEase = computeRecoveryEase(option, query);

  // ── uncertainty: 矛盾マップ + データ量 ──
  const uncertainty = computeUncertainty(
    relevantAxes,
    axisScores,
    contradictionMap ?? {},
    pastDecisions ?? [],
    query.type,
  );

  // ── narrative ──
  const narrative = generateNarrative(
    option,
    query,
    compatibility,
    exhaustionRisk,
    regretProbability,
    currentState,
    axisScores,
  );

  // ── timeline ──
  const timelineEvents = generateTimeline(
    option,
    query,
    compatibility,
    exhaustionRisk,
    currentState,
  );

  return {
    option,
    compatibility,
    exhaustionRisk,
    regretProbability,
    recoveryEase,
    uncertainty,
    narrative,
    timelineEvents,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Scoring Functions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 選択肢と軸スコアの整合性を 0-1 で算出。
 * 高い = その選択肢はあなたの性格と合いやすい。
 */
function computeCompatibility(
  option: string,
  query: SmallDecisionQuery,
  relevantAxes: TraitAxisKey[],
  axisScores: Record<string, number>,
): number {
  if (relevantAxes.length === 0) return 0.5;

  // 選択肢が「積極的」方向か「消極的」方向かを推定
  const optionPolarity = estimateOptionPolarity(option, query);

  // 関連軸のスコアの方向性と選択肢の方向性の一致度
  let alignmentSum = 0;
  let validAxes = 0;

  for (const axisKey of relevantAxes) {
    const score = axisScores[axisKey];
    if (score === undefined) continue;
    validAxes++;

    // 軸のスコアが正なら右側（外向/大胆/直感 etc.）に親和性
    // 選択肢の方向と軸の方向が一致すれば高スコア
    const alignment = score * optionPolarity;
    alignmentSum += (alignment + 1) / 2; // -1~1 を 0~1 に正規化
  }

  return validAxes > 0 ? clamp(alignmentSum / validAxes, 0, 1) : 0.5;
}

/**
 * 消耗リスクを算出。0-1。
 * 社交バッテリーが低い時にsocial系の「参加する」は消耗リスクが高い、など。
 */
function computeExhaustionRisk(
  option: string,
  query: SmallDecisionQuery,
  state: CurrentState,
  axisScores: Record<string, number>,
): number {
  const polarity = estimateOptionPolarity(option, query);
  let risk = 0;

  if (query.type === "social") {
    // 社交系: バッテリー低 + 積極的選択 = 高消耗
    if (polarity > 0) {
      risk = (1 - state.socialBattery) * 0.6 + state.stressLevel * 0.2;
      // 内向的な人はさらにリスク加算
      const introversion = axisScores["introvert_vs_extrovert"] ?? 0;
      if (introversion < -0.3) risk += 0.15;
    } else {
      // パスする場合は消耗リスク低い
      risk = 0.1 + state.stressLevel * 0.1;
    }
  } else if (query.type === "priority") {
    // 優先度系: 認知負荷高 + 今すぐやる = 高消耗
    if (polarity > 0) {
      risk = state.cognitiveLoad * 0.5 + (1 - normalize01(state.energyLevel)) * 0.3;
    } else {
      risk = 0.15;
    }
  } else if (query.type === "reply") {
    // 返信系: ストレス高 + すぐ返す = 中程度消耗
    if (polarity > 0) {
      risk = state.stressLevel * 0.4 + state.cognitiveLoad * 0.2;
    } else {
      risk = 0.1;
    }
  } else if (query.type === "rest") {
    // 休息系: 基本的に消耗リスクは低い
    risk = 0.05 + state.stressLevel * 0.1;
  } else if (query.type === "purchase") {
    // 購入系: ストレス下の衝動買い
    if (polarity > 0) {
      risk = state.stressLevel * 0.3 + state.cognitiveLoad * 0.2;
    } else {
      risk = 0.05;
    }
  }

  return clamp(risk, 0, 1);
}

/**
 * 後悔確率を算出。0-1。
 * 過去パターン + regretPatterns + compatibility/exhaustion から総合判断。
 */
function computeRegretProbability(
  option: string,
  query: SmallDecisionQuery,
  regretPatterns: string[],
  pastDecisions: PastDecision[],
  compatibility: number,
  exhaustionRisk: number,
): number {
  let regretScore = 0;
  let factors = 0;

  // 1. 互換性が低い選択 → 後悔しやすい
  regretScore += (1 - compatibility) * 0.35;
  factors++;

  // 2. 消耗リスクが高い選択 → 後悔しやすい
  regretScore += exhaustionRisk * 0.25;
  factors++;

  // 3. regretPatterns にキーワード一致 → 後悔しやすい
  const optionLower = option.toLowerCase();
  const patternMatch = regretPatterns.some(
    (p) =>
      optionLower.includes(p.toLowerCase()) ||
      p.toLowerCase().includes(optionLower),
  );
  if (patternMatch) {
    regretScore += 0.3;
    factors++;
  }

  // 4. 過去の同タイプで同じ選択をして後悔したことがある
  const similarRegretted = pastDecisions.filter(
    (d) => d.type === query.type && d.regretted && d.chose === option,
  );
  if (similarRegretted.length > 0) {
    regretScore += 0.25 * Math.min(similarRegretted.length, 3) / 3;
    factors++;
  }

  return clamp(factors > 0 ? regretScore / Math.max(factors * 0.3, 1) : 0.5, 0, 1);
}

/**
 * 回復しやすさを算出。0-1。
 * 高い = 選択を撤回/修正しやすい。
 */
function computeRecoveryEase(
  option: string,
  query: SmallDecisionQuery,
): number {
  // タイプ別のベース可逆性
  const baseRecovery: Record<SmallDecisionType, number> = {
    social: 0.7, // 飲み会をパスしても致命的ではない
    reply: 0.8, // 返信は後から修正できる
    priority: 0.75, // タスクの優先度は変更可能
    rest: 0.9, // 休息の選択は可逆的
    purchase: 0.4, // 購入は返品不可の場合がある
    free: 0.6, // 自由入力は種類不明のため中間値
  };

  let recovery = baseRecovery[query.type] ?? 0.6;

  // 消極的選択（やらない/見送る）は一般に可逆性が高い
  const polarity = estimateOptionPolarity(option, query);
  if (polarity < 0) {
    recovery = Math.min(recovery + 0.15, 1);
  }

  return clamp(recovery, 0, 1);
}

/**
 * 不確実性を算出。0-1。
 * 矛盾が多い軸 + データが少ない → 不確実性が高い。
 */
function computeUncertainty(
  relevantAxes: TraitAxisKey[],
  axisScores: Record<string, number>,
  contradictionMap: Record<string, ContradictionEntry>,
  pastDecisions: PastDecision[],
  decisionType: SmallDecisionType,
): number {
  if (relevantAxes.length === 0) return 0.8;

  let uncertaintySum = 0;
  let count = 0;

  for (const axisKey of relevantAxes) {
    count++;
    const score = axisScores[axisKey];

    // スコアが未定義 → 高不確実性
    if (score === undefined) {
      uncertaintySum += 0.9;
      continue;
    }

    // スコアが中立付近 → 方向性が不明確
    const neutralUncertainty = 1 - Math.abs(score);

    // 矛盾がある軸 → 二面性による不確実性
    const contradiction = contradictionMap[axisKey];
    const contradictionUncertainty =
      contradiction?.isDual && contradiction.contradictionStrength
        ? contradiction.contradictionStrength * 0.5
        : 0;

    uncertaintySum += Math.min(
      neutralUncertainty * 0.6 + contradictionUncertainty,
      1,
    );
  }

  // 過去データの不足も加味
  const similarCount = pastDecisions.filter(
    (d) => d.type === decisionType,
  ).length;
  const dataUncertainty =
    similarCount < 5 ? (5 - similarCount) / 5 * 0.3 : 0;

  const baseUncertainty = count > 0 ? uncertaintySum / count : 0.8;
  return clamp(baseUncertainty + dataUncertainty, 0, 1);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Cognitive Bias Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 認知バイアスを検出して警告文を返す。
 * - 二択固定: 2つの選択肢しか見えていない
 * - 衝動的判断: 急ぎでない判断を急いでいる
 * - 回避パターン: 「やらない」がデフォルトになっている
 */
export function detectCognitiveBias(
  query: SmallDecisionQuery,
  input: DecisionEngineInput,
): string | undefined {
  const warnings: string[] = [];

  // 二択固定: options が 2 で、第三の選択肢がありうる場合
  if (query.options && query.options.length === 2) {
    const defaults = DEFAULT_OPTIONS[query.type];
    if (defaults && defaults.length > 2) {
      warnings.push(
        `「${query.options[0]}」と「${query.options[1]}」の二択に見えていますが、` +
          `「${defaults[2]}」のような中間的な選択肢も考えられます。`,
      );
    }
  }

  // 衝動的判断: urgency=high だが、実際は急がなくてよい場合
  if (
    query.urgency === "high" &&
    (query.type === "rest" || query.type === "purchase")
  ) {
    warnings.push(
      "「急がないといけない」と感じていますが、この種の判断は少し時間をおいても大丈夫なことが多いです。",
    );
  }

  // 回避パターン: 過去の同タイプの判断で消極的選択ばかり
  const pastSameType = (input.pastDecisions ?? []).filter(
    (d) => d.type === query.type,
  );
  if (pastSameType.length >= 3) {
    const negativeChoices = pastSameType.filter((d) => {
      const pol = estimateChoicePolarity(d.chose);
      return pol < 0;
    });
    if (negativeChoices.length / pastSameType.length > 0.75) {
      warnings.push(
        "この種類の判断では「やらない」方向を選ぶ傾向が続いています。" +
          "それが本当にあなたの望む方向か、一度立ち止まって考えてみてもよいかもしれません。",
      );
    }
  }

  return warnings.length > 0 ? warnings.join(" ") : undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Narrative Generation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateNarrative(
  option: string,
  query: SmallDecisionQuery,
  compatibility: number,
  exhaustionRisk: number,
  regretProbability: number,
  state: CurrentState,
  axisScores: Record<string, number>,
): string {
  const parts: string[] = [];

  // 互換性に基づく冒頭
  if (compatibility > 0.7) {
    parts.push(
      `「${option}」はあなたの判断パターンと整合性が高い選択です。`,
    );
  } else if (compatibility > 0.4) {
    parts.push(
      `「${option}」はあなたにとって可もなく不可もない選択に見えます。`,
    );
  } else {
    parts.push(
      `「${option}」はあなたの普段の判断パターンとはやや異なる方向です。`,
    );
  }

  // 状態ベースの補足
  if (query.type === "social" && state.socialBattery < 0.3) {
    parts.push("今日は社交バッテリーが低めなので、対人場面での消耗が普段より大きくなりそうです。");
  } else if (query.type === "priority" && state.cognitiveLoad > 0.7) {
    parts.push("認知負荷が高い状態なので、集中力が必要な作業のパフォーマンスは普段より落ちる可能性があります。");
  }

  // 後悔リスク
  if (regretProbability > 0.6) {
    parts.push("過去のパターンから、後でモヤモヤが残りやすい選択です。");
  } else if (regretProbability < 0.3) {
    parts.push("この方向で後悔するケースは少なそうです。");
  }

  // 消耗リスク
  if (exhaustionRisk > 0.6) {
    parts.push("ただし、今の状態を考えると消耗が心配です。");
  }

  return parts.join("");
}

function generateTimeline(
  option: string,
  query: SmallDecisionQuery,
  compatibility: number,
  exhaustionRisk: number,
  state: CurrentState,
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const polarity = estimateOptionPolarity(option, query);

  // 直後
  if (polarity > 0) {
    // 積極的選択
    events.push({
      timing: "直後",
      prediction:
        compatibility > 0.5
          ? "決めたことへの安心感と、少しの緊張が共存します"
          : "少しの不安を感じつつも、動き出した実感があります",
      confidence: 0.7,
    });
  } else {
    events.push({
      timing: "直後",
      prediction:
        exhaustionRisk > 0.5
          ? "正直ほっとした気持ちが大きいでしょう"
          : "一瞬の迷いの後、気持ちが楽になります",
      confidence: 0.65,
    });
  }

  // 1時間後
  if (query.type === "social") {
    events.push({
      timing: "1時間後",
      prediction:
        polarity > 0
          ? state.socialBattery > 0.5
            ? "会話が弾んでいる自分を感じられそうです"
            : "少し疲れを感じ始めますが、まだ楽しめる範囲です"
          : "自分の時間を使えている充実感があります",
      confidence: 0.55,
    });
  } else {
    events.push({
      timing: "1時間後",
      prediction:
        polarity > 0
          ? "取り組みの結果が少しずつ見え始め、手応えを感じます"
          : "別のことに意識が向いていますが、判断したこと自体は忘れています",
      confidence: 0.5,
    });
  }

  // 翌日
  events.push({
    timing: "翌日",
    prediction:
      exhaustionRisk > 0.6
        ? "昨日の消耗が残っている可能性があります。回復のための時間を確保しましょう"
        : compatibility > 0.5
          ? "この判断について特に引きずることはなさそうです"
          : "少しだけ「あの時こうしていれば」と思う瞬間があるかもしれません",
    confidence: 0.4,
  });

  return events;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 選択肢の極性を推定。
 * +1 = 積極的（参加する/買う/すぐやる）
 * -1 = 消極的（パスする/見送る/やらない）
 *  0 = 中立
 */
function estimateOptionPolarity(
  option: string,
  query: SmallDecisionQuery,
): number {
  const o = option.toLowerCase();

  // 積極ワード
  const positiveWords = [
    "参加", "行く", "する", "買う", "やる", "始める", "取りかかる",
    "返信", "返す", "出す", "動く", "会う", "試す", "挑戦",
  ];
  // 消極ワード
  const negativeWords = [
    "パス", "やめ", "見送", "やらない", "しない", "断る", "休む",
    "後で", "明日", "検討", "保留", "控え",
  ];

  const posMatch = positiveWords.some((w) => o.includes(w));
  const negMatch = negativeWords.some((w) => o.includes(w));

  if (posMatch && !negMatch) return 1;
  if (negMatch && !posMatch) return -1;
  if (posMatch && negMatch) return 0;

  // options 配列での位置も参考（先頭が積極的であることが多い）
  if (query.options) {
    const idx = query.options.indexOf(option);
    if (idx === 0) return 0.5;
    if (idx === query.options.length - 1) return -0.5;
  }

  return 0;
}

function estimateChoicePolarity(choice: string): number {
  const c = choice.toLowerCase();
  const negativeWords = [
    "パス", "やめ", "見送", "やらない", "しない", "断る",
    "後で", "明日", "検討", "保留", "控え",
  ];
  return negativeWords.some((w) => c.includes(w)) ? -1 : 1;
}

function normalize01(value: number): number {
  // -1~1 を 0~1 に
  return (value + 1) / 2;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
