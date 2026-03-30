// lib/stargazer/experimentEngine.ts
// Experiment Engine — 週1の小さな行動実験
//
// Decision Engine とは完全に分離。
// - Decision Engine: ユーザー起点、今の迷い、モデル変更なし
// - Experiment Engine: AI起点、週単位の試行、結果でモデル更新
//
// BeliefSet を書き換えるのは bayesianAxisUpdater 経由のみ。

import type { TraitAxisKey } from "./traitAxes";
import { TRAIT_AXES } from "./traitAxes";
import type { BeliefSet, AxisBelief } from "./bayesianAxisUpdater";
import {
  updateAxisBelief,
  computeEvidencePrecision,
} from "./bayesianAxisUpdater";
import type { ContradictionMap } from "./contradictionEngine";
import { ReasonTraceBuilder, type ReasonTrace } from "./reasonTrace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ExperimentTargetPattern =
  | "avoidance"
  | "fixation"
  | "contradiction"
  | "blind_spot";

export type ExperimentDifficulty = "micro" | "small" | "medium";

export type ExperimentStatus = "proposed" | "accepted" | "completed" | "skipped";

export type ExperimentOutcome =
  | "did_it"
  | "tried_but_different"
  | "could_not"
  | "skipped";

/** 1件の週次実験 */
export interface WeeklyExperiment {
  id: string;
  userId: string;
  weekStart: string; // YYYY-MM-DD (月曜日)
  title: string;
  description: string;
  targetAxis: TraitAxisKey;
  targetPattern: ExperimentTargetPattern;
  difficulty: ExperimentDifficulty;
  expectedShift: {
    axis: TraitAxisKey;
    direction: "+" | "-";
    magnitude: number;
  };
  reportPrompt: string;
  status: ExperimentStatus;
  reasonTrace?: ReasonTrace;
}

/** 実験結果の報告 */
export interface ExperimentReport {
  experimentId: string;
  outcome: ExperimentOutcome;
  reflection?: string;
  surpriseLevel: 1 | 2 | 3 | 4 | 5;
  wouldRepeat: boolean;
}

/** モデル更新結果 */
export interface ExperimentModelUpdate {
  axisUpdates: {
    axis: TraitAxisKey;
    previousMu: number;
    newMu: number;
    previousPrecision: number;
    newPrecision: number;
  }[];
  insightGenerated: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 入力型
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 回避パターン（外部で検出・提供される） */
export interface AvoidancePattern {
  axisId: TraitAxisKey;
  evidenceType: "skip" | "fast_dismiss" | "neutral_cluster";
  frequency: number;
  confidence: number;
}

/** 固定化パターン（外部で検出・提供される） */
export interface FixationPattern {
  axisId: TraitAxisKey;
  fixedValue: number;
  precision: number;
  duration: number; // 日数
  confidence: number;
}

export interface ExperimentProposalInput {
  userId: string;
  axisBeliefs: BeliefSet;
  contradictionMap: ContradictionMap;
  archetypeCode: string;
  avoidancePatterns: AvoidancePattern[];
  fixationPatterns: FixationPattern[];
  blindSpotAxes: TraitAxisKey[];
  recentExperiments: WeeklyExperiment[];
  observationDepth: number;
  totalSessions: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 実験からの BeliefSet 更新の source multiplier。
 * 日次観測 (1.0) より高いが、オンボーディング (2.0) より低い。
 * 意図: 1回の実験でモデルが大きく跳ねないよう制御。
 */
const EXPERIMENT_SOURCE_MULTIPLIER = 0.8;

/**
 * surprise level ごとの mu 変化倍率。
 * 驚きが大きい = モデルの予測が外れていた → 変化は大きくするが、
 * precision も下げて「学び直し」モードに入る。
 */
const SURPRISE_MU_FACTOR: Record<number, number> = {
  1: 0.3,  // 予想通り → 確認データ、小さな変化
  2: 0.5,
  3: 0.7,
  4: 0.9,
  5: 1.0,  // 全然違った → 最大変化
};

/**
 * surprise level ごとの precision 低下量。
 * 高 surprise → precision を下げてモデルの不確実性を上げる。
 */
const SURPRISE_PRECISION_PENALTY: Record<number, number> = {
  1: 0,     // 予想通り → precision そのまま
  2: 0.5,
  3: 1.0,
  4: 2.0,
  5: 3.0,   // 全然違った → precision を大きく下げる
};

/** outcome ごとの更新強度倍率 */
const OUTCOME_STRENGTH: Record<ExperimentOutcome, number> = {
  did_it: 1.0,
  tried_but_different: 0.6,
  could_not: 0,    // mu は動かさない
  skipped: 0,      // 変更なし
};

/** 同一軸への実験の最小間隔（週） */
const MIN_AXIS_INTERVAL_WEEKS = 4;

/** 同一テンプレートIDの最小間隔（週） */
const MIN_TEMPLATE_INTERVAL_WEEKS = 8;

/** 実験提案の最低観測深度 */
const MIN_OBSERVATION_DEPTH = 10;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テンプレート
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ExperimentTemplate {
  id: string;
  targetPattern: ExperimentTargetPattern;
  applicableAxes: TraitAxisKey[];
  difficulty: ExperimentDifficulty;
  titleTemplate: string;
  descriptionTemplate: string;
  reportPromptTemplate: string;
  minObservationDepth: number;
}

const EXPERIMENT_TEMPLATES: ExperimentTemplate[] = [
  // ── avoidance: micro ──
  {
    id: "avd_social_micro",
    targetPattern: "avoidance",
    applicableAxes: ["introvert_vs_extrovert", "individual_vs_social", "social_initiative"],
    difficulty: "micro",
    titleTemplate: "1回だけ、誘いに乗ってみる",
    descriptionTemplate: "普段なら断る誘いや集まりを、今週1回だけ受けてみてください。",
    reportPromptTemplate: "参加してみてどうでしたか？ 予想と違ったことはありましたか？",
    minObservationDepth: 10,
  },
  {
    id: "avd_direct_micro",
    targetPattern: "avoidance",
    applicableAxes: ["direct_vs_diplomatic", "independence_vs_harmony", "boundary_awareness"],
    difficulty: "micro",
    titleTemplate: "1回だけ、本音を先に言ってみる",
    descriptionTemplate: "いつもなら相手の様子を見てから発言する場面で、今週1回だけ先に自分の意見を伝えてみてください。",
    reportPromptTemplate: "先に言ってみた結果はどうでしたか？ 相手の反応は？",
    minObservationDepth: 10,
  },

  // ── avoidance: small ──
  {
    id: "avd_social_small",
    targetPattern: "avoidance",
    applicableAxes: ["introvert_vs_extrovert", "individual_vs_social", "stress_isolation_vs_social"],
    difficulty: "small",
    titleTemplate: "自分から1回だけ誘ってみる",
    descriptionTemplate: "いつも誘われる側なら、今週は自分から誰かを誘ってみてください。",
    reportPromptTemplate: "自分から誘ってみてどうでしたか？ 普段と違う感覚はありましたか？",
    minObservationDepth: 30,
  },

  // ── fixation: micro ──
  {
    id: "fix_analytical_micro",
    targetPattern: "fixation",
    applicableAxes: ["analytical_vs_intuitive", "plan_vs_spontaneous"],
    difficulty: "micro",
    titleTemplate: "1つの判断を直感だけで決めてみる",
    descriptionTemplate: "いつもなら比較検討する場面で、今週1回だけ「最初に思った方」を選んでみてください。",
    reportPromptTemplate: "直感で決めた結果はどうでしたか？ 後悔しましたか？",
    minObservationDepth: 10,
  },
  {
    id: "fix_cautious_micro",
    targetPattern: "fixation",
    applicableAxes: ["cautious_vs_bold", "change_embrace_vs_resist"],
    difficulty: "micro",
    titleTemplate: "いつもと違う選択を1つだけ試す",
    descriptionTemplate: "ランチ、通勤路、服装など、日常のどこかでいつもと違う選択を1つだけしてみてください。",
    reportPromptTemplate: "いつもと違う選択をしてみて、気づいたことはありますか？",
    minObservationDepth: 10,
  },

  // ── contradiction: micro ──
  {
    id: "con_freedom_micro",
    targetPattern: "contradiction",
    applicableAxes: ["independence_vs_harmony", "individual_vs_social"],
    difficulty: "micro",
    titleTemplate: "普段選ばない方を、1回だけ試す",
    descriptionTemplate: "あなたの中にある二面性の、普段表に出さない方を1回だけ試してみてください。",
    reportPromptTemplate: "普段と逆の選択をしてみて、どんな感覚でしたか？",
    minObservationDepth: 15,
  },

  // ── contradiction: small ──
  {
    id: "con_generic_small",
    targetPattern: "contradiction",
    applicableAxes: [
      "introvert_vs_extrovert", "cautious_vs_bold", "analytical_vs_intuitive",
      "plan_vs_spontaneous", "direct_vs_diplomatic", "independence_vs_harmony",
    ],
    difficulty: "small",
    titleTemplate: "逆の自分を3日間だけ意識してみる",
    descriptionTemplate: "あなたの中の二面性のうち、普段抑えている面を3日間だけ意識的に出してみてください。",
    reportPromptTemplate: "逆の面を意識した3日間で、新しい発見はありましたか？",
    minObservationDepth: 30,
  },

  // ── blind_spot: micro ──
  {
    id: "bs_mirror_micro",
    targetPattern: "blind_spot",
    applicableAxes: [
      "emotional_regulation", "reassurance_need", "emotional_variability",
      "public_private_gap", "shame_vs_guilt",
    ],
    difficulty: "micro",
    titleTemplate: "盲点の軸を1日だけ意識して過ごす",
    descriptionTemplate: "あなたが気づいていない傾向を1日だけ観察してみてください。行動を変える必要はありません。気づくだけで十分です。",
    reportPromptTemplate: "意識してみて、何か気づいたことはありましたか？",
    minObservationDepth: 15,
  },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 提案ロジック
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface CandidateTarget {
  axisId: TraitAxisKey;
  pattern: ExperimentTargetPattern;
  priority: number; // 高いほど優先
  reason: string;
}

/**
 * 今週の実験を1つ提案する。
 * 提案条件を満たさない場合は null を返す。
 */
export function proposeWeeklyExperiment(
  input: ExperimentProposalInput,
): WeeklyExperiment | null {
  // 最低観測深度チェック
  if (input.observationDepth < MIN_OBSERVATION_DEPTH) {
    return null;
  }

  // 介入対象の候補を収集
  const candidates = collectCandidates(input);

  if (candidates.length === 0) {
    return null;
  }

  // 重複排除
  const filtered = filterByRecency(candidates, input.recentExperiments);

  if (filtered.length === 0) {
    return null;
  }

  // 最優先の候補を選択
  const target = filtered[0];

  // 難易度の決定
  const difficulty = resolveDifficulty(input.observationDepth, input.recentExperiments);

  // マッチするテンプレートを探す
  const template = findTemplate(target, difficulty);
  if (!template) {
    return null;
  }

  // 期待される変化
  const currentMu = input.axisBeliefs[target.axisId]?.mu ?? 0;
  const expectedDirection: "+" | "-" = target.pattern === "avoidance"
    ? (currentMu < 0 ? "+" : "-") // 回避: 逆方向に揺らす
    : (currentMu > 0 ? "-" : "+"); // 固定: 現在の固定方向の逆

  const weekStart = getMonday(new Date()).toISOString().slice(0, 10);

  // Reason Trace
  const traceBuilder = new ReasonTraceBuilder("experiment", `exp_${weekStart}_${input.userId.slice(0, 8)}`);

  if (target.pattern === "contradiction") {
    const c = input.contradictionMap[target.axisId];
    if (c?.isDual && c.contradictionStrength) {
      traceBuilder.addContradictionEvidence(target.axisId, c.contradictionStrength, 0.8);
    }
  }
  if (target.pattern === "avoidance") {
    const avd = input.avoidancePatterns.find((a) => a.axisId === target.axisId);
    if (avd) {
      traceBuilder.addPatternEvidence(
        `${axisLabel(target.axisId)}に関する質問を${avd.frequency}回避けている`,
        0.7,
      );
    }
  }
  if (target.pattern === "fixation") {
    const fix = input.fixationPatterns.find((f) => f.axisId === target.axisId);
    if (fix) {
      traceBuilder.addAxisEvidence(
        target.axisId,
        fix.fixedValue,
        0.7,
        `${axisLabel(target.axisId)}が${fix.duration}日間固定（${fix.fixedValue.toFixed(2)}）`,
      );
    }
  }
  if (target.pattern === "blind_spot") {
    traceBuilder.addEvidence({
      type: "mirror_divergence",
      source: target.axisId,
      value: "盲点検出",
      weight: 0.7,
      humanLabel: `${axisLabel(target.axisId)}で三面鏡の乖離を検出`,
    });
  }

  const reasonTrace = traceBuilder.build(target.reason);

  return {
    id: `exp_${weekStart}_${input.userId.slice(0, 8)}`,
    userId: input.userId,
    weekStart,
    title: template.titleTemplate,
    description: template.descriptionTemplate,
    targetAxis: target.axisId,
    targetPattern: target.pattern,
    difficulty,
    expectedShift: {
      axis: target.axisId,
      direction: expectedDirection,
      magnitude: 0.05, // 初期は控えめ
    },
    reportPrompt: template.reportPromptTemplate,
    status: "proposed",
    reasonTrace,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 介入対象の収集
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function collectCandidates(input: ExperimentProposalInput): CandidateTarget[] {
  const candidates: CandidateTarget[] = [];

  // 1. 矛盾が強い軸（優先度: 高）
  for (const [axisId, stats] of Object.entries(input.contradictionMap)) {
    if (stats?.isDual && stats.contradictionStrength && stats.contradictionStrength > 0.6) {
      candidates.push({
        axisId: axisId as TraitAxisKey,
        pattern: "contradiction",
        priority: 4 + stats.contradictionStrength,
        reason: `「${axisLabel(axisId as TraitAxisKey)}」に強い二面性があります。普段表に出さない面を小さく試すことで、新しい側面が見えるかもしれません。`,
      });
    }
  }

  // 2. 回避パターンがある軸（優先度: 高）
  for (const avd of input.avoidancePatterns) {
    if (avd.confidence > 0.7) {
      candidates.push({
        axisId: avd.axisId,
        pattern: "avoidance",
        priority: 3.5 + avd.confidence,
        reason: `「${axisLabel(avd.axisId)}」に関する場面を避ける傾向が続いています。避けている理由を小さな試行で確かめてみませんか。`,
      });
    }
  }

  // 3. 固定化している軸（優先度: 中）
  for (const fix of input.fixationPatterns) {
    if (fix.duration > 21 && input.observationDepth >= 50) {
      candidates.push({
        axisId: fix.axisId,
        pattern: "fixation",
        priority: 2.5 + fix.confidence,
        reason: `「${axisLabel(fix.axisId)}」が${fix.duration}日間動いていません。実態と乖離していないか、逆の選択で確かめてみませんか。`,
      });
    }
  }

  // 4. 盲点軸（優先度: 中）
  for (const axisId of input.blindSpotAxes) {
    candidates.push({
      axisId,
      pattern: "blind_spot",
      priority: 2.0,
      reason: `「${axisLabel(axisId)}」で自己認識と行動に乖離があります。意識して観察するだけでも発見があるかもしれません。`,
    });
  }

  // priority 降順ソート
  candidates.sort((a, b) => b.priority - a.priority);

  return candidates;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 重複排除
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function filterByRecency(
  candidates: CandidateTarget[],
  recentExperiments: WeeklyExperiment[],
): CandidateTarget[] {
  return candidates.filter((c) => {
    // 同一軸への実験は MIN_AXIS_INTERVAL_WEEKS 週空ける
    const sameAxisRecent = recentExperiments.find(
      (e) => e.targetAxis === c.axisId,
    );
    if (sameAxisRecent) {
      const weeksSince = weeksBetween(sameAxisRecent.weekStart, todayString());
      if (weeksSince < MIN_AXIS_INTERVAL_WEEKS) return false;
    }

    return true;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 難易度の決定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function resolveDifficulty(
  observationDepth: number,
  recentExperiments: WeeklyExperiment[],
): ExperimentDifficulty {
  // 直近2件がskipなら難易度を下げる
  const lastTwo = recentExperiments.slice(0, 2);
  const consecutiveSkips = lastTwo.filter((e) => e.status === "skipped").length;

  if (consecutiveSkips >= 2) return "micro";

  // 観測深度に応じた基本難易度
  if (observationDepth < 30) return "micro";
  if (observationDepth < 70) return "small";
  return "medium";
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// テンプレート選択
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function findTemplate(
  target: CandidateTarget,
  difficulty: ExperimentDifficulty,
): ExperimentTemplate | null {
  // 完全一致: pattern + axis + difficulty
  const exact = EXPERIMENT_TEMPLATES.find(
    (t) =>
      t.targetPattern === target.pattern &&
      t.difficulty === difficulty &&
      t.applicableAxes.includes(target.axisId),
  );
  if (exact) return exact;

  // pattern + axis のみ一致（difficulty 柔軟）
  const patternMatch = EXPERIMENT_TEMPLATES.find(
    (t) =>
      t.targetPattern === target.pattern &&
      t.applicableAxes.includes(target.axisId),
  );
  if (patternMatch) return patternMatch;

  // pattern のみ一致 + difficulty 一致
  const difficultyMatch = EXPERIMENT_TEMPLATES.find(
    (t) =>
      t.targetPattern === target.pattern &&
      t.difficulty === difficulty,
  );
  if (difficultyMatch) return difficultyMatch;

  // pattern のみ一致
  const anyMatch = EXPERIMENT_TEMPLATES.find(
    (t) => t.targetPattern === target.pattern,
  );
  return anyMatch ?? null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// モデル更新
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 実験結果から BeliefSet を更新する。
 *
 * 設計原則:
 * - 1回の実験でモデルが大きく跳ねない（EXPERIMENT_SOURCE_MULTIPLIER = 0.8）
 * - surprise が大きいほど mu の変化は大きいが、同時に precision も下がる
 * - could_not / skipped では mu を動かさない
 */
export function updateFromExperimentResult(
  beliefs: BeliefSet,
  experiment: WeeklyExperiment,
  report: ExperimentReport,
): { updatedBeliefs: BeliefSet; modelUpdate: ExperimentModelUpdate } {
  const updated = { ...beliefs };
  const axisUpdates: ExperimentModelUpdate["axisUpdates"] = [];

  const strength = OUTCOME_STRENGTH[report.outcome];

  if (strength > 0) {
    const targetAxis = experiment.targetAxis;
    const prior = updated[targetAxis];
    if (!prior) {
      return { updatedBeliefs: updated, modelUpdate: { axisUpdates: [], insightGenerated: "" } };
    }

    const previousMu = prior.mu;
    const previousPrecision = prior.precision;

    // mu の変化量
    const muFactor = SURPRISE_MU_FACTOR[report.surpriseLevel] ?? 0.5;
    const magnitude = experiment.expectedShift.magnitude;
    const direction = experiment.expectedShift.direction === "+" ? 1 : -1;
    const muDelta = direction * magnitude * muFactor * strength;

    // 新しい evidence value
    const evidenceValue = Math.max(-1, Math.min(1, prior.mu + muDelta));

    // evidence precision の計算
    const evidencePrecision = computeEvidencePrecision({
      questionAxisWeight: magnitude,
      responseTimeConfidence: 1.0, // 実験には回答速度なし
      statePrecisionMultiplier: 1.0,
      sourceMultiplier: EXPERIMENT_SOURCE_MULTIPLIER,
      itemDiscrimination: 1.0,
    });

    // ベイズ更新
    let newBelief = updateAxisBelief(prior, evidenceValue, evidencePrecision);

    // surprise による precision ペナルティ
    const precisionPenalty = SURPRISE_PRECISION_PENALTY[report.surpriseLevel] ?? 0;
    if (precisionPenalty > 0) {
      const adjustedPrecision = Math.max(0.5, newBelief.precision - precisionPenalty);
      const stddev = 1 / Math.sqrt(adjustedPrecision);
      newBelief = {
        ...newBelief,
        precision: adjustedPrecision,
        confidence: 0.65 * (1 - Math.exp(-adjustedPrecision / 30)),
        credibleInterval: [
          Math.max(-1, newBelief.mu - 1.96 * stddev),
          Math.min(1, newBelief.mu + 1.96 * stddev),
        ],
      };
    }

    updated[targetAxis] = newBelief;

    axisUpdates.push({
      axis: targetAxis,
      previousMu,
      newMu: newBelief.mu,
      previousPrecision,
      newPrecision: newBelief.precision,
    });
  }

  // インサイト生成
  const insightGenerated = generateExperimentInsight(experiment, report, axisUpdates);

  return {
    updatedBeliefs: updated,
    modelUpdate: { axisUpdates, insightGenerated },
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// インサイト生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function generateExperimentInsight(
  experiment: WeeklyExperiment,
  report: ExperimentReport,
  axisUpdates: ExperimentModelUpdate["axisUpdates"],
): string {
  const label = axisLabel(experiment.targetAxis);

  if (report.outcome === "skipped") {
    return "今回の実験はスキップされました。次回、別の角度から提案します。";
  }

  if (report.outcome === "could_not") {
    return `実験を試みましたが実行できませんでした。「${label}」の回避傾向は想定より根深いかもしれません。次回はもう少し小さなステップで試みます。`;
  }

  if (axisUpdates.length === 0) {
    return "結果を記録しました。";
  }

  const update = axisUpdates[0];
  const muDelta = update.newMu - update.previousMu;
  const direction = muDelta > 0 ? "上方" : "下方";
  const magnitude = Math.abs(muDelta);

  const parts: string[] = [];

  if (report.surpriseLevel >= 4) {
    parts.push(`予想と大きく違う結果でした。`);
    parts.push(`「${label}」を${direction}に${(magnitude * 100).toFixed(1)}%修正しました。`);
    parts.push(`モデルの確信度も下げ、学び直しモードに入りました。`);
  } else if (report.surpriseLevel >= 2) {
    parts.push(`「${label}」を${direction}に${(magnitude * 100).toFixed(1)}%微調整しました。`);
  } else {
    parts.push(`予想通りの結果でした。「${label}」の現在の推定が確認されました。`);
  }

  if (report.wouldRepeat) {
    parts.push("この体験を繰り返したいとのこと。今後の提案に反映します。");
  }

  return parts.join("");
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function axisLabel(key: TraitAxisKey): string {
  const def = TRAIT_AXES.find((a) => a.id === key);
  return def ? `${def.labelLeft} / ${def.labelRight}` : key;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

function weeksBetween(dateStr1: string, dateStr2: string): number {
  const d1 = new Date(dateStr1);
  const d2 = new Date(dateStr2);
  const diffMs = Math.abs(d2.getTime() - d1.getTime());
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
}
