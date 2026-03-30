// lib/stargazer/reasonTrace.ts
// Reason Trace — AI判断根拠の開示レイヤー
//
// 独立した機能ではなく、Decision Engine / Self vs Oracle / Daily Intervention
// など全提案系機能に付随する横断レイヤー。
//
// 責務: AIがなぜその判断・提案をしたかを、ユーザーが読める形で構造化する。
// 既存の narrative / oracleReason / unlockHint を統一フォーマットに収束させる先。

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 根拠の種類 */
export type EvidenceType =
  | "axis_score"        // 軸スコアの値
  | "response_time"     // 回答速度
  | "contradiction"     // 矛盾検出
  | "state"             // 今日の状態（エネルギー、ストレス等）
  | "past_pattern"      // 過去の行動パターン
  | "mirror_divergence" // 三面鏡の乖離
  | "archetype"         // アーキタイプ特性
  | "observation";      // 個別の観測回答

/** 1つの根拠 */
export interface Evidence {
  /** 根拠の種類 */
  type: EvidenceType;
  /** データソースの特定（例: "introvert_vs_extrovert", "2026-03-15 Q12"） */
  source: string;
  /** 値の要約（例: "-0.42", "1.2秒で即答"） */
  value: string;
  /** この根拠の判断への寄与度 0-1 */
  weight: number;
  /** 人間が読める1行説明 */
  humanLabel: string;
}

/** Reason Trace が付与される対象の種類 */
export type TraceTargetType =
  | "decision"
  | "self_vs_oracle"
  | "daily_intervention"
  | "prophecy"
  | "blind_spot"
  | "experiment"
  | "axis_update";

/** 完成した Reason Trace */
export interface ReasonTrace {
  /** 対象の種類 */
  targetType: TraceTargetType;
  /** 対象のID（例: challenge_2026-03-28_abc） */
  targetId: string;
  /** 根拠リスト（weight 降順でソート済み） */
  evidences: Evidence[];
  /** 因果説明テキスト（2-4文、日本語） */
  reasoning: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Reason Trace を組み立てるビルダー */
export class ReasonTraceBuilder {
  private targetType: TraceTargetType;
  private targetId: string;
  private evidences: Evidence[] = [];

  constructor(targetType: TraceTargetType, targetId: string) {
    this.targetType = targetType;
    this.targetId = targetId;
  }

  /** 軸スコアを根拠として追加 */
  addAxisEvidence(
    axisKey: TraitAxisKey,
    score: number,
    weight: number,
    context?: string,
  ): this {
    const axisDef = TRAIT_AXES.find((a) => a.id === axisKey);
    const label = axisDef
      ? `${axisDef.labelLeft} / ${axisDef.labelRight}`
      : axisKey;
    const direction = score > 0.1
      ? `${axisDef?.labelRight ?? "右"}寄り`
      : score < -0.1
        ? `${axisDef?.labelLeft ?? "左"}寄り`
        : "中立";

    this.evidences.push({
      type: "axis_score",
      source: axisKey,
      value: score.toFixed(2),
      weight,
      humanLabel: context
        ? context
        : `「${label}」が${direction}`,
    });
    return this;
  }

  /** 現在の状態を根拠として追加 */
  addStateEvidence(
    stateName: string,
    value: number,
    weight: number,
    humanLabel: string,
  ): this {
    this.evidences.push({
      type: "state",
      source: stateName,
      value: value.toFixed(2),
      weight,
      humanLabel,
    });
    return this;
  }

  /** 矛盾を根拠として追加 */
  addContradictionEvidence(
    axisKey: TraitAxisKey,
    strength: number,
    weight: number,
  ): this {
    const axisDef = TRAIT_AXES.find((a) => a.id === axisKey);
    const label = axisDef
      ? `${axisDef.labelLeft} / ${axisDef.labelRight}`
      : axisKey;

    this.evidences.push({
      type: "contradiction",
      source: axisKey,
      value: `強度 ${strength.toFixed(2)}`,
      weight,
      humanLabel: `「${label}」に二面性がある`,
    });
    return this;
  }

  /** 過去パターンを根拠として追加 */
  addPatternEvidence(
    description: string,
    weight: number,
  ): this {
    this.evidences.push({
      type: "past_pattern",
      source: "行動パターン",
      value: description,
      weight,
      humanLabel: description,
    });
    return this;
  }

  /** アーキタイプを根拠として追加 */
  addArchetypeEvidence(
    archetypeCode: string,
    influence: string,
    weight: number,
  ): this {
    this.evidences.push({
      type: "archetype",
      source: archetypeCode,
      value: influence,
      weight,
      humanLabel: `アーキタイプ「${archetypeCode}」の傾向: ${influence}`,
    });
    return this;
  }

  /** 任意の根拠を追加 */
  addEvidence(evidence: Evidence): this {
    this.evidences.push(evidence);
    return this;
  }

  /** reasoning テキストを生成して Trace を完成させる */
  build(reasoning: string): ReasonTrace {
    // weight 降順ソート
    const sorted = [...this.evidences].sort((a, b) => b.weight - a.weight);

    return {
      targetType: this.targetType,
      targetId: this.targetId,
      evidences: sorted,
      reasoning,
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Decision Engine 用 Trace 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type {
  DecisionEngineInput,
  DecisionEngineOutput,
  SmallDecisionType,
} from "./decisionEngine";

/** Decision Engine の結果にReason Traceを付与する */
export function buildDecisionTrace(
  input: DecisionEngineInput,
  output: DecisionEngineOutput,
): ReasonTrace {
  const builder = new ReasonTraceBuilder(
    "decision",
    `decision_${Date.now().toString(36)}`,
  );

  // 関連軸のスコアを根拠に追加（上位3つ）
  const relevantAxes = getRelevantAxes(input.query.type);
  const axisByStrength = relevantAxes
    .map((key) => ({ key, score: input.axisScores[key] ?? 0 }))
    .filter((a) => Math.abs(a.score) > 0.1)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, 3);

  for (const { key, score } of axisByStrength) {
    builder.addAxisEvidence(key as TraitAxisKey, score, 0.7);
  }

  // 状態を根拠に追加
  const { currentState } = input;
  if (currentState.socialBattery < 0.3) {
    builder.addStateEvidence(
      "socialBattery",
      currentState.socialBattery,
      0.6,
      "人と会うエネルギーが少なめ",
    );
  }
  if (currentState.stressLevel > 0.6) {
    builder.addStateEvidence(
      "stressLevel",
      currentState.stressLevel,
      0.5,
      "ストレスがやや高い",
    );
  }
  if (currentState.cognitiveLoad > 0.7) {
    builder.addStateEvidence(
      "cognitiveLoad",
      currentState.cognitiveLoad,
      0.5,
      "頭を使うタスクが多い状態",
    );
  }

  // 矛盾を根拠に追加
  if (input.contradictionMap) {
    for (const axisKey of relevantAxes) {
      const c = input.contradictionMap[axisKey];
      if (c?.isDual && c.contradictionStrength && c.contradictionStrength > 0.5) {
        builder.addContradictionEvidence(
          axisKey as TraitAxisKey,
          c.contradictionStrength,
          0.6,
        );
      }
    }
  }

  // 過去パターンを根拠に追加
  const pastSameType = (input.pastDecisions ?? []).filter(
    (d) => d.type === input.query.type,
  );
  if (pastSameType.length > 0) {
    const regretted = pastSameType.filter((d) => d.regretted);
    if (regretted.length > 0) {
      builder.addPatternEvidence(
        `過去に似た判断で${regretted.length}回後悔している`,
        0.5,
      );
    }
  }

  // reasoning 生成
  const reasoning = buildDecisionReasoning(input, output, axisByStrength);

  return builder.build(reasoning);
}

function buildDecisionReasoning(
  input: DecisionEngineInput,
  output: DecisionEngineOutput,
  topAxes: { key: string; score: number }[],
): string {
  const parts: string[] = [];

  if (output.withheld) {
    parts.push(
      "今回は提案を保留しました。",
      output.withheldReason ?? "不確実性が高いためです。",
    );
    return parts.join("");
  }

  if (output.recommended) {
    parts.push(`「${output.recommended}」が合いそうです。`);
  }

  if (topAxes.length > 0) {
    const axisDesc = topAxes
      .slice(0, 2)
      .map((a) => {
        const def = TRAIT_AXES.find((d) => d.id === a.key);
        return def ? `${def.labelLeft}/${def.labelRight}` : a.key;
      })
      .join("と");
    parts.push(`あなたの${axisDesc}のバランスから判断しています。`);
  }

  const { currentState } = input;
  if (currentState.socialBattery < 0.3 || currentState.stressLevel > 0.6) {
    parts.push("今日のコンディションも考慮に入れています。");
  }

  if (output.overallUncertainty > 0.5) {
    parts.push("まだデータが少ないので、最終的にはあなたの直感も大切にしてください。");
  }

  return parts.join("");
}

// Decision Engine の関連軸マッピング（decisionEngine.ts と同じ定義を参照）
function getRelevantAxes(type: SmallDecisionType): string[] {
  const map: Record<SmallDecisionType, string[]> = {
    social: ["introvert_vs_extrovert", "individual_vs_social", "social_initiative", "stress_isolation_vs_social", "boundary_awareness", "emotional_regulation"],
    reply: ["direct_vs_diplomatic", "independence_vs_harmony", "emotional_regulation", "reassurance_need", "decision_tempo"],
    priority: ["plan_vs_spontaneous", "analytical_vs_intuitive", "perfectionist_vs_pragmatic", "abstract_structuring", "decomposition", "exploration_closure"],
    rest: ["introvert_vs_extrovert", "stress_isolation_vs_social", "emotional_variability", "function_vs_expression"],
    purchase: ["cautious_vs_bold", "quality_vs_quantity", "function_vs_expression", "minimal_vs_maximal", "tradition_vs_novelty", "classic_vs_trendy"],
    free: ["analytical_vs_intuitive", "cautious_vs_bold", "independence_vs_harmony", "emotional_regulation", "decision_tempo"],
  };
  return map[type] ?? [];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Self vs Oracle 用 Trace 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import type { ChallengeScenario } from "./selfVsOracle";

/** Self vs Oracle のシナリオ単位で Reason Trace を生成 */
export function buildOracleTrace(
  scenario: ChallengeScenario,
  axisScores: Partial<Record<TraitAxisKey, number>>,
  contradictionMap?: Record<string, { isDual?: boolean; contradictionStrength?: number }>,
): ReasonTrace {
  const builder = new ReasonTraceBuilder(
    "self_vs_oracle",
    scenario.id,
  );

  // 関連軸のスコアを根拠に追加
  for (const axisKey of scenario.relevantAxes) {
    const score = axisScores[axisKey] ?? 0;
    builder.addAxisEvidence(axisKey, score, 0.7);
  }

  // 矛盾がある場合
  if (contradictionMap) {
    for (const axisKey of scenario.relevantAxes) {
      const c = contradictionMap[axisKey];
      if (c?.isDual && c.contradictionStrength && c.contradictionStrength > 0.5) {
        builder.addContradictionEvidence(axisKey, c.contradictionStrength, 0.6);
      }
    }
  }

  // reasoning: oracleReason をベースに、根拠を補足
  const reasoning = scenario.oracleReason
    ? `${scenario.oracleReason}`
    : "あなたの性格傾向のパターンから予測しています。";

  return builder.build(reasoning);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Daily Intervention 用 Trace 生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface DailyInterventionTraceInput {
  phase: string;
  estimatedEnergy?: number;
  estimatedSocialBattery?: number;
  estimatedCognitiveLoad?: number;
  estimatedStress?: number;
  vulnerabilityScore?: number;
  vulnerabilityFactors?: string[];
  topInfluentialAxes?: { key: TraitAxisKey; score: number }[];
}

/** Daily Intervention に Reason Trace を生成 */
export function buildInterventionTrace(
  input: DailyInterventionTraceInput,
  interventionMessage: string,
): ReasonTrace {
  const builder = new ReasonTraceBuilder(
    "daily_intervention",
    `intervention_${input.phase}_${Date.now().toString(36)}`,
  );

  // 状態推定の根拠
  if (input.estimatedEnergy != null) {
    const level = input.estimatedEnergy > 0.6 ? "充実している" : input.estimatedEnergy >= 0.4 ? "普通" : "低め";
    builder.addStateEvidence(
      "energy",
      input.estimatedEnergy,
      0.5,
      `エネルギーが${level}`,
    );
  }

  if (input.estimatedSocialBattery != null && input.estimatedSocialBattery < 0.4) {
    builder.addStateEvidence(
      "socialBattery",
      input.estimatedSocialBattery,
      0.5,
      "人と会うエネルギーが少なめ",
    );
  }

  if (input.estimatedStress != null && input.estimatedStress > 0.5) {
    builder.addStateEvidence(
      "stress",
      input.estimatedStress,
      0.6,
      "ストレスがやや高い",
    );
  }

  if (input.estimatedCognitiveLoad != null && input.estimatedCognitiveLoad > 0.6) {
    builder.addStateEvidence(
      "cognitiveLoad",
      input.estimatedCognitiveLoad,
      0.4,
      "頭を使うタスクが多い状態",
    );
  }

  // 脆弱性要因
  for (const factor of input.vulnerabilityFactors ?? []) {
    builder.addEvidence({
      type: "state",
      source: "vulnerability",
      value: factor,
      weight: 0.4,
      humanLabel: factor,
    });
  }

  // 影響力の大きい軸
  for (const axis of (input.topInfluentialAxes ?? []).slice(0, 2)) {
    builder.addAxisEvidence(axis.key, axis.score, 0.3);
  }

  // reasoning — 「説明」ではなく「納得」を目指す
  const reasonParts: string[] = [];
  if (input.estimatedStress != null && input.estimatedStress > 0.5) {
    reasonParts.push("ストレスが高めなので、無理しない方向を優先しています。");
  }
  if (input.estimatedEnergy != null && input.estimatedEnergy < 0.4) {
    reasonParts.push("エネルギーが低めなので、回復を意識した提案にしています。");
  }
  if (input.vulnerabilityScore != null && input.vulnerabilityScore > 2.5) {
    reasonParts.push("今日は判断がブレやすい状態。大きな決断は明日に回すのも手です。");
  }
  if (reasonParts.length === 0) {
    if (input.estimatedEnergy != null && input.estimatedEnergy >= 0.4) {
      reasonParts.push("今の状態は安定しています。いつも通りの判断ができそうです。");
    } else {
      reasonParts.push("特別なシグナルは検出されていません。");
    }
  }

  return builder.build(reasonParts.join(""));
}
