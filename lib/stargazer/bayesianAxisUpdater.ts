// lib/stargazer/bayesianAxisUpdater.ts
// ベイズ共役ガウス更新による軸スコアリングエンジン
//
// 従来の重み付き平均を置き換え、不確実性を明示的に追跡する。
// 各軸を正規分布 N(μ, 1/τ) でモデル化:
//   μ = 軸スコアの最良推定値 (-1 ~ +1)
//   τ = 精度 (precision) = 確信の強さ
//
// 共役更新:
//   posterior_μ = (prior_τ × prior_μ + evidence_τ × evidence) / (prior_τ + evidence_τ)
//   posterior_τ = prior_τ + evidence_τ
//
// これにより:
//   - τ が高い（確信あり）→ 新証拠の影響が自然に小さい（自然なヒステリシス）
//   - τ が低い（不確実） → 新証拠で大きく動く（新規ユーザーへの即応性）
//   - アドホックな snapshotWeight や maxDeltaPerBlend が不要になる
//
// 参考: Murphy (2012) — Machine Learning: A Probabilistic Perspective, Ch. 4
//       Bishop (2006) — Pattern Recognition and Machine Learning, Ch. 2.3

import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "./traitAxes";
import { QUESTIONS } from "./questions";
import type { QuestionAnswer } from "./typeResolver";
import { computeResponseTimeSignal, type ResponseTimeSignal } from "./responseTimeEngine";
import { computeStatePrecisionMultiplier, type ObservationStateInput } from "./stateWeighting";
import {
  accumulateForContradiction,
  buildContradictionMap,
  type ContradictionMap,
  type AxisAnswerAccumulator,
} from "./contradictionEngine";
import { propagateBeliefs } from "./informationGain";

// ── 型定義 ──

/** 単一軸のベイズ信念 */
export interface AxisBelief {
  /** 現在の最良推定値 [-1, 1] */
  mu: number;
  /** 精度 (分散の逆数)。高い = 確信が強い */
  precision: number;
  /** 表示用 confidence [0, HARD_CAP] */
  confidence: number;
  /** 95% 信用区間 */
  credibleInterval: [number, number];
}

/** 全軸の beliefs */
export type BeliefSet = Record<TraitAxisKey, AxisBelief>;

/** ベイズスコアリングの結果（後方互換 + 追加情報） */
export interface BayesianScoringResult {
  /** 軸スコア (mu 値) — 既存の calculateAxisScores と同じ形式 */
  axisScores: Record<TraitAxisKey, number>;
  /** 全軸のベイズ信念 */
  beliefs: BeliefSet;
  /** 矛盾マップ（二面性検出結果） */
  contradictionMap: ContradictionMap;
  /** 回答時間シグナルの集約 */
  responseTimeStats: {
    meanConflict: number;
    meanConviction: number;
    totalAnswers: number;
  };
}

// ── 定数 ──

/** 新規ユーザーの弱い事前分布の精度 */
const PRIOR_PRECISION = 0.5;

/** 精度の上限（硬直化防止） */
const MAX_PRECISION = 50;

/** confidence のハードキャップ（既存の confidenceEngine と一致） */
const HARD_CAP = 0.65;

/** confidence の飽和速度 — precision 30 で ~0.41, 50 で ~0.52 */
const CONFIDENCE_SATURATION = 30;

/** オンボーディング時のソース乗数 */
const ONBOARDING_SOURCE_MULTIPLIER = 2.0;

/** 日次観測のソース乗数 */
const DAILY_SOURCE_MULTIPLIER = 1.0;

// ── コア関数 ──

/** 空のベイズ信念を生成 */
export function createEmptyBelief(): AxisBelief {
  return {
    mu: 0,
    precision: PRIOR_PRECISION,
    confidence: 0,
    credibleInterval: [-1, 1] as [number, number],
  };
}

/** 全軸の空の beliefs を生成 */
export function createEmptyBeliefSet(): BeliefSet {
  const beliefs: Partial<BeliefSet> = {};
  for (const key of TRAIT_AXIS_KEYS) {
    beliefs[key] = createEmptyBelief();
  }
  return beliefs as BeliefSet;
}

/**
 * 単一軸のベイズ更新
 *
 * @param prior           事前信念
 * @param evidenceValue   新しい証拠の値 (-1 ~ +1)
 * @param evidencePrecision 証拠の精度（質問weight × 回答時間信頼度 × 状態精度 × ソース乗数 × 弁別力）
 * @returns 更新された信念
 */
export function updateAxisBelief(
  prior: AxisBelief,
  evidenceValue: number,
  evidencePrecision: number,
): AxisBelief {
  // 精度の更新（上限あり — MAX_PRECISION で硬直化を防止）
  const newPrecision = Math.min(MAX_PRECISION, prior.precision + evidencePrecision);

  // μ の更新（共役ガウス更新）
  const rawMu = (prior.precision * prior.mu + evidencePrecision * evidenceValue) / newPrecision;
  const mu = Math.max(-1, Math.min(1, rawMu));

  // 95% 信用区間
  const stddev = 1 / Math.sqrt(newPrecision);
  const credibleInterval: [number, number] = [
    Math.max(-1, mu - 1.96 * stddev),
    Math.min(1, mu + 1.96 * stddev),
  ];

  // Confidence: precision → [0, HARD_CAP] の飽和曲線
  const confidence = HARD_CAP * (1 - Math.exp(-newPrecision / CONFIDENCE_SATURATION));

  return { mu, precision: newPrecision, confidence, credibleInterval };
}

// ── 回答 → 証拠精度 の変換 ──

interface EvidenceParams {
  questionAxisWeight: number;  // 質問定義の軸重み (e.g., 0.8)
  responseTimeConfidence: number; // 回答時間からの信頼度乗数 (0.5~1.2)
  statePrecisionMultiplier: number; // 状態からの精度乗数 (0.3~1.5)
  sourceMultiplier: number; // ソース乗数 (onboarding=2.0, daily=1.0)
  itemDiscrimination: number; // 質問弁別力 (0.1~2.0, default 1.0)
}

/**
 * 証拠の精度を計算
 * 全てのシグナルを掛け合わせて最終的な evidence precision を決定
 */
export function computeEvidencePrecision(params: EvidenceParams): number {
  const raw = Math.abs(params.questionAxisWeight)
    * params.responseTimeConfidence
    * params.statePrecisionMultiplier
    * params.sourceMultiplier
    * params.itemDiscrimination;

  // 最小 0.01（ゼロ精度の証拠は意味がない）、最大 5.0
  return Math.max(0.01, Math.min(5.0, raw));
}

// ── オンボーディング: 一括初期化 ──

/**
 * オンボーディングの Core 35 問から beliefs を一括初期化
 *
 * @param answers      QuestionAnswer[] — 35問の回答
 * @param userBaselineMs ユーザーの回答時間ベースライン (ms)
 * @returns BayesianScoringResult
 */
export function initializeFromOnboarding(
  answers: QuestionAnswer[],
  userBaselineMs?: number,
): BayesianScoringResult {
  const beliefs = createEmptyBeliefSet();
  const contradictionAccum = new Map<string, AxisAnswerAccumulator>();
  let totalConflict = 0;
  let totalConviction = 0;

  for (const answer of answers) {
    const question = QUESTIONS.find((q) => q.id === answer.questionId);
    if (!question) continue;

    // 回答時間シグナル
    const rtSignal = computeResponseTimeSignal(
      answer.responseTimeMs,
      userBaselineMs,
    );
    totalConflict += rtSignal.conflictIndicator;
    totalConviction += rtSignal.convictionIndicator;

    // 回答を正規化 (1-5 → -1..+1)
    const normalized = (answer.value - 3) / 2;

    // 各軸への影響を更新
    for (const axis of question.axes) {
      const effectiveScore = axis.invert ? -normalized : normalized;

      // 証拠精度の算出
      const evidencePrecision = computeEvidencePrecision({
        questionAxisWeight: axis.weight,
        responseTimeConfidence: rtSignal.confidenceMultiplier,
        statePrecisionMultiplier: 1.0, // オンボーディングは状態重み付けなし
        sourceMultiplier: ONBOARDING_SOURCE_MULTIPLIER,
        itemDiscrimination: 1.0, // 初期は弁別力デフォルト
      });

      // ベイズ更新
      beliefs[axis.key] = updateAxisBelief(beliefs[axis.key], effectiveScore, evidencePrecision);

      // 矛盾検出用に蓄積
      accumulateForContradiction(contradictionAccum, axis.key, effectiveScore, Math.abs(axis.weight));
    }
  }

  // 軸スコアを beliefs から抽出（後方互換）
  const axisScores = beliefsToScores(beliefs);

  // 矛盾マップ構築
  const contradictionMap = buildContradictionMap(contradictionAccum);

  return {
    axisScores,
    beliefs,
    contradictionMap,
    responseTimeStats: {
      meanConflict: answers.length > 0 ? totalConflict / answers.length : 0,
      meanConviction: answers.length > 0 ? totalConviction / answers.length : 0,
      totalAnswers: answers.length,
    },
  };
}

// ── 日次観測: 逐次更新 ──

export interface DailyObservationInput {
  axisId: TraitAxisKey;
  score: number; // -1 ~ +1
  weight: number; // 質問の軸重み
  responseTimeMs?: number;
  observationState?: ObservationStateInput | null;
  itemDiscrimination?: number;
}

/**
 * 日次観測で beliefs を逐次更新
 *
 * @param beliefs        現在の beliefs
 * @param observations   日次観測の回答群
 * @param userBaselineMs ユーザーの回答時間ベースライン
 * @returns 更新された beliefs
 */
export function updateFromDailyObservation(
  beliefs: BeliefSet,
  observations: DailyObservationInput[],
  userBaselineMs?: number,
): BeliefSet {
  let updated = { ...beliefs };

  for (const obs of observations) {
    const rtSignal = computeResponseTimeSignal(obs.responseTimeMs, userBaselineMs);
    const stateMult = computeStatePrecisionMultiplier(obs.observationState, obs.axisId);

    const evidencePrecision = computeEvidencePrecision({
      questionAxisWeight: obs.weight,
      responseTimeConfidence: rtSignal.confidenceMultiplier,
      statePrecisionMultiplier: stateMult,
      sourceMultiplier: DAILY_SOURCE_MULTIPLIER,
      itemDiscrimination: obs.itemDiscrimination ?? 1.0,
    });

    // 1. 直接観測軸のベイズ更新
    updated[obs.axisId] = updateAxisBelief(
      updated[obs.axisId] ?? createEmptyBelief(),
      obs.score,
      evidencePrecision,
    );

    // 2. 相関軸への信念伝播（間接更新）
    //    1問の回答が相関する複数軸の信念も同時に改善する
    updated = propagateBeliefs(
      updated,
      obs.axisId,
      obs.score,
      evidencePrecision,
    );
  }

  return updated;
}

// ── RV 質問（オンボーディング内）の更新 ──

export interface RvQuestionAxis {
  key: TraitAxisKey;
  weight: number;
  invert?: boolean;
}

export interface RvAnswerInput {
  questionId: string;
  value: number; // 1-5
  responseTimeMs?: number;
  axes: RvQuestionAxis[];
  isFollowUp: boolean; // follow-up は weight が低い
}

/**
 * RV質問の回答で beliefs を更新
 * Core 35問の後に呼ばれる
 */
export function updateFromRvAnswers(
  beliefs: BeliefSet,
  rvAnswers: RvAnswerInput[],
  userBaselineMs?: number,
): BeliefSet {
  const updated = { ...beliefs };

  for (const answer of rvAnswers) {
    const rtSignal = computeResponseTimeSignal(answer.responseTimeMs, userBaselineMs);
    const normalized = (answer.value - 3) / 2;

    // RV通常問: source multiplier 1.2、フォロー問: 0.6
    const rvSourceMultiplier = answer.isFollowUp ? 0.6 : 1.2;

    for (const axis of answer.axes) {
      const effectiveScore = axis.invert ? -normalized : normalized;

      const evidencePrecision = computeEvidencePrecision({
        questionAxisWeight: axis.weight,
        responseTimeConfidence: rtSignal.confidenceMultiplier,
        statePrecisionMultiplier: 1.0, // オンボーディング中
        sourceMultiplier: rvSourceMultiplier,
        itemDiscrimination: 1.0,
      });

      updated[axis.key] = updateAxisBelief(
        updated[axis.key] ?? createEmptyBelief(),
        effectiveScore,
        evidencePrecision,
      );
    }
  }

  return updated;
}

// ── Micro 3問の更新 ──

/**
 * Micro 質問の直接軸スコアで beliefs を更新
 * (Micro 質問は選択肢に直接 axes が埋め込まれている)
 */
export function updateFromMicroAxes(
  beliefs: BeliefSet,
  microAxes: Partial<Record<TraitAxisKey, number>>,
): BeliefSet {
  const updated = { ...beliefs };

  for (const [key, score] of Object.entries(microAxes)) {
    if (score == null || Math.abs(score) < 0.001) continue;

    const axisKey = key as TraitAxisKey;
    // Micro は弱い証拠（精度低め）
    const evidencePrecision = computeEvidencePrecision({
      questionAxisWeight: Math.abs(score),
      responseTimeConfidence: 1.0,
      statePrecisionMultiplier: 1.0,
      sourceMultiplier: 0.5, // Micro は弱いソース
      itemDiscrimination: 1.0,
    });

    updated[axisKey] = updateAxisBelief(
      updated[axisKey] ?? createEmptyBelief(),
      score > 0 ? 1 : -1, // 方向のみ（スコアの大きさは weight で反映済み）
      evidencePrecision,
    );
  }

  return updated;
}

// ── ユーティリティ ──

/** beliefs から軸スコア (mu 値) を抽出 — 後方互換用 */
export function beliefsToScores(beliefs: BeliefSet): Record<TraitAxisKey, number> {
  const scores: Partial<Record<TraitAxisKey, number>> = {};
  for (const key of TRAIT_AXIS_KEYS) {
    scores[key] = beliefs[key]?.mu ?? 0;
  }
  return scores as Record<TraitAxisKey, number>;
}

/** beliefs から confidence マップを抽出 */
export function beliefsToConfidences(beliefs: BeliefSet): Record<TraitAxisKey, number> {
  const confidences: Partial<Record<TraitAxisKey, number>> = {};
  for (const key of TRAIT_AXIS_KEYS) {
    confidences[key] = beliefs[key]?.confidence ?? 0;
  }
  return confidences as Record<TraitAxisKey, number>;
}

/** beliefs を JSON 保存用に変換 */
export function serializeBeliefs(beliefs: BeliefSet): Record<string, { mu: number; precision: number }> {
  const result: Record<string, { mu: number; precision: number }> = {};
  for (const key of TRAIT_AXIS_KEYS) {
    const b = beliefs[key];
    if (b && (b.precision > PRIOR_PRECISION || Math.abs(b.mu) > 0.001)) {
      result[key] = { mu: b.mu, precision: b.precision };
    }
  }
  return result;
}

/** JSON から beliefs を復元 */
export function deserializeBeliefs(
  data: Record<string, { mu: number; precision: number }> | null | undefined,
): BeliefSet {
  const beliefs = createEmptyBeliefSet();
  if (!data) return beliefs;

  for (const [key, val] of Object.entries(data)) {
    if (val && typeof val.mu === "number" && typeof val.precision === "number") {
      const axisKey = key as TraitAxisKey;
      if (beliefs[axisKey]) {
        const mu = Math.max(-1, Math.min(1, val.mu));
        const precision = Math.max(PRIOR_PRECISION, Math.min(MAX_PRECISION, val.precision));
        const stddev = 1 / Math.sqrt(precision);
        beliefs[axisKey] = {
          mu,
          precision,
          confidence: HARD_CAP * (1 - Math.exp(-precision / CONFIDENCE_SATURATION)),
          credibleInterval: [
            Math.max(-1, mu - 1.96 * stddev),
            Math.min(1, mu + 1.96 * stddev),
          ],
        };
      }
    }
  }

  return beliefs;
}

// ── ヒステリシス（信用区間ベース） ──

/**
 * アーキタイプの変更を許可すべきか、信用区間に基づいて判定
 *
 * 旧方式: 固定 25% margin threshold
 * 新方式: 各レイヤーの主要軸の信用区間が十分に狭く、
 *          勝者が次点を確実に上回っている場合のみ変更を許可
 *
 * @param beliefs        現在の beliefs
 * @param layerMargins   各レイヤーの margin (resolveArchetype から取得)
 * @param minRequiredMargin 最低必要なマージン (default: 0.20)
 * @returns true if type change should be allowed
 */
export function shouldAllowTypeChange(
  beliefs: BeliefSet,
  layerMargins: number[],
  minRequiredMargin: number = 0.20,
): boolean {
  // 全レイヤーの margin が閾値以上 → 変更許可
  const minMargin = Math.min(...layerMargins);

  if (minMargin >= minRequiredMargin) {
    // さらに: 平均 precision が十分に高い → 証拠が十分
    const avgPrecision = TRAIT_AXIS_KEYS.reduce(
      (sum, key) => sum + (beliefs[key]?.precision ?? PRIOR_PRECISION), 0
    ) / TRAIT_AXIS_KEYS.length;

    // precision 5 以上（~10回答分）で信頼できる
    return avgPrecision >= 5.0;
  }

  return false;
}
