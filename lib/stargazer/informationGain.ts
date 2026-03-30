// lib/stargazer/informationGain.ts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Expected Information Gain (EIG) エンジン + 軸間相関モデル
//
// 従来の質問選択:
//   「未観測日数」「観測回数」「分散」等のヒューリスティック加算
//   → 代理指標の寄せ集め。真の情報利得とは乖離
//
// 新方式:
//   各候補質問について、回答による信念の不確実性減少量を直接計算する。
//   ガウス共役更新の場合、EIG は閉じた形で求まる:
//
//     EIG(q → axis) = 0.5 × ln(1 + evidencePrecision / prior.precision)
//
//   これは自然に以下を包含する:
//   - 低精度軸の優先（未知の軸ほど情報利得が大きい）
//   - 高精度軸の抑制（既知の軸は追加質問しても利得が小さい）
//   - 質問品質の反映（弁別力が高い質問ほど利得が大きい）
//   - 軸間相関による伝播（1問で複数軸の不確実性を同時に減らせる）
//
// 軸間相関モデル:
//   archetype weight 定義から軸間の暗黙的相関を推定する。
//   同じアーキタイプ次元に強く寄与する軸同士は高い相関を持つ。
//   相関がある軸への証拠伝播により、収束速度が 30-50% 向上する。
//
// 参考:
//   Lindley (1956) — On a Measure of the Information Provided by an Experiment
//   MacKay (1992) — Information-Based Objective Functions for Active Learning
//   Chaloner & Verdinelli (1995) — Bayesian Experimental Design: A Review
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

import { TRAIT_AXIS_KEYS, type TraitAxisKey } from "./traitAxes";
import type { AxisBelief, BeliefSet } from "./bayesianAxisUpdater";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 1. 軸間相関モデル
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸間の相関係数マトリクス
 *
 * archetype weight 定義から導出:
 * 同じ layer dimension に高い weight を持つ軸同士は正の相関、
 * 逆符号の weight を持つ軸同士は負の相関を持つ。
 *
 * 相関の強さ = Σ_dimensions (weight_i × weight_j) を正規化したもの。
 * |r| ≥ 0.30 のペアのみ保持（弱い相関は伝播のコストに見合わない）。
 *
 * 注: 将来的にはユーザーデータから経験的に推定すべきだが、
 * 初期段階ではドメイン知識ベースの事前相関で十分。
 */
const AXIS_CORRELATIONS: readonly [TraitAxisKey, TraitAxisKey, number][] = [
  // ── Social cluster ──
  // 内向/外向系: 本質的に同じ構造の異なる切り口
  ["introvert_vs_extrovert", "individual_vs_social", 0.75],
  ["introvert_vs_extrovert", "social_initiative", 0.65],
  ["introvert_vs_extrovert", "stress_isolation_vs_social", 0.60],
  ["individual_vs_social", "social_initiative", 0.55],
  ["individual_vs_social", "stress_isolation_vs_social", 0.50],
  ["social_initiative", "intimacy_pace", 0.45],
  ["social_initiative", "friend_mode_fit", 0.40],

  // ── Cognition cluster ──
  // 分析/直感/体感は互いに逆相関
  ["analytical_vs_intuitive", "abstract_structuring", -0.55],
  ["analytical_vs_intuitive", "decomposition", -0.45],
  ["plan_vs_spontaneous", "perfectionist_vs_pragmatic", 0.50],
  ["plan_vs_spontaneous", "exploration_closure", 0.45],
  ["abstract_structuring", "decomposition", 0.55],
  ["cognitive_updating", "growth_mindset", 0.45],

  // ── Emotion cluster ──
  // 感情制御系
  ["emotional_variability", "emotional_regulation", -0.65],
  ["emotional_variability", "reassurance_need", 0.55],
  ["emotional_variability", "rumination_tendency", 0.45],
  ["emotional_regulation", "public_private_gap", -0.40],
  ["reassurance_need", "attachment_style", 0.50],

  // ── Execution cluster ──
  // 行動パターン
  ["change_embrace_vs_resist", "tradition_vs_novelty", 0.55],
  ["change_embrace_vs_resist", "growth_mindset", 0.45],
  ["cautious_vs_bold", "change_embrace_vs_resist", 0.40],

  // ── Boundary / Safety cluster ──
  // 対人境界系
  ["boundary_awareness", "independence_vs_harmony", -0.50],
  ["boundary_awareness", "boundary_respect", 0.60],
  ["boundary_awareness", "direct_vs_diplomatic", 0.35],
  ["control_tendency", "intent_stability", 0.40],
  ["pressure_risk", "escalation_risk", 0.55],

  // ── Depth cluster ──
  // 深層心理
  ["locus_of_control", "growth_mindset", 0.40],
  ["shame_vs_guilt", "rumination_tendency", 0.45],
  ["attachment_style", "relationship_mode_split", 0.50],
] as const;

/** 相関ルックアップ用のインデックス（起動時に1回だけ構築） */
type CorrelationIndex = Map<TraitAxisKey, { peer: TraitAxisKey; r: number }[]>;

let _correlationIndex: CorrelationIndex | null = null;

function getCorrelationIndex(): CorrelationIndex {
  if (_correlationIndex) return _correlationIndex;

  const index: CorrelationIndex = new Map();

  for (const [a, b, r] of AXIS_CORRELATIONS) {
    if (!index.has(a)) index.set(a, []);
    if (!index.has(b)) index.set(b, []);
    index.get(a)!.push({ peer: b, r });
    index.get(b)!.push({ peer: a, r });
  }

  _correlationIndex = index;
  return index;
}

/**
 * 指定軸と相関のある全軸を取得
 */
export function getCorrelatedAxes(
  axisId: TraitAxisKey,
): { peer: TraitAxisKey; r: number }[] {
  return getCorrelationIndex().get(axisId) ?? [];
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 2. Expected Information Gain (EIG)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 単一軸に対するEIG（ガウス共役更新の閉形式）
 *
 * EIG = 0.5 × ln(1 + evidencePrecision / priorPrecision)
 *
 * 直感的解釈:
 *   priorPrecision が低い（不確実）→ evidencePrecision の相対的寄与が大きい → 高EIG
 *   priorPrecision が高い（確実）→ evidencePrecision の相対的寄与が小さい → 低EIG
 *
 * これが全てのヒューリスティックを包含する理由:
 *   - 「未観測軸の優先」→ priorPrecision = 0.5 なので自動的に高EIG
 *   - 「観測回数が少ない軸の優先」→ precision が低いので自動的に高EIG
 *   - 「高分散軸の優先」→ 高分散 ≈ 低precision → 高EIG
 *   - 「弁別力の反映」→ evidencePrecision に含まれる
 */
export function computeSingleAxisEIG(
  priorPrecision: number,
  evidencePrecision: number,
): number {
  if (evidencePrecision <= 0 || priorPrecision <= 0) return 0;
  return 0.5 * Math.log(1 + evidencePrecision / priorPrecision);
}

/**
 * 質問候補のEIG計算に使う証拠精度の推定値
 *
 * 実際の回答前なので期待値を使う:
 *   - 質問の平均的な重み（weight ≈ 0.4 for daily）
 *   - 回答時間の期待値（confidenceMultiplier ≈ 1.0）
 *   - 状態精度のデフォルト（1.0）
 *   - 日次観測のソース乗数（1.0）
 *   - 質問弁別力（デフォルト 1.0）
 *
 * @param questionWeight 質問の軸重み（0.4〜0.8 が典型的）
 * @param itemDiscrimination 質問の弁別力（0.1〜2.0）
 */
export function estimateEvidencePrecision(
  questionWeight: number = 0.4,
  itemDiscrimination: number = 1.0,
): number {
  const DAILY_SOURCE_MULTIPLIER = 1.0;
  const EXPECTED_RT_CONFIDENCE = 1.0;
  const EXPECTED_STATE_MULTIPLIER = 1.0;

  const raw = Math.abs(questionWeight)
    * EXPECTED_RT_CONFIDENCE
    * EXPECTED_STATE_MULTIPLIER
    * DAILY_SOURCE_MULTIPLIER
    * itemDiscrimination;

  return Math.max(0.01, Math.min(5.0, raw));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 3. 質問ランキング（EIG + 相関伝播）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface QuestionEIGScore {
  questionId: string;
  axisId: TraitAxisKey;
  /** 直接EIG: この質問の対象軸に対する情報利得 */
  directEIG: number;
  /** 伝播EIG: 相関軸への波及的情報利得 */
  propagatedEIG: number;
  /** 合計EIG */
  totalEIG: number;
}

/**
 * 候補質問群をEIGでランキング
 *
 * 各質問について:
 * 1. 直接EIG = 対象軸の不確実性減少量
 * 2. 伝播EIG = 相関軸への波及的不確実性減少量
 * 3. 合計 = 直接 + 伝播（1問あたりの総情報利得）
 *
 * @param candidates 候補質問のリスト（axisId, weight を持つ）
 * @param beliefs    現在の全軸ベイズ信念
 * @returns EIGスコア降順の質問ランキング
 */
export function rankQuestionsByEIG(
  candidates: { id: string; axisId: TraitAxisKey; weight?: number; discrimination?: number }[],
  beliefs: BeliefSet,
): QuestionEIGScore[] {
  const scores: QuestionEIGScore[] = [];

  for (const q of candidates) {
    const evidencePrecision = estimateEvidencePrecision(
      q.weight ?? 0.4,
      q.discrimination ?? 1.0,
    );

    // 直接EIG
    const prior = beliefs[q.axisId];
    if (!prior) continue;
    const directEIG = computeSingleAxisEIG(prior.precision, evidencePrecision);

    // 伝播EIG: 相関軸への波及
    let propagatedEIG = 0;
    const correlatedAxes = getCorrelatedAxes(q.axisId);
    for (const { peer, r } of correlatedAxes) {
      const peerBelief = beliefs[peer];
      if (!peerBelief) continue;

      // 伝播精度 = 元の精度 × r² (相関の二乗が伝播する情報の割合)
      const propagatedPrecision = evidencePrecision * r * r;
      propagatedEIG += computeSingleAxisEIG(peerBelief.precision, propagatedPrecision);
    }

    scores.push({
      questionId: q.id,
      axisId: q.axisId,
      directEIG,
      propagatedEIG,
      totalEIG: directEIG + propagatedEIG,
    });
  }

  // EIG降順（最も情報利得が大きい質問が先頭）
  scores.sort((a, b) => b.totalEIG - a.totalEIG);

  return scores;
}

/**
 * EIGベースで質問を選択（カテゴリバランス制約付き）
 *
 * 純粋なEIGだけだと同じカテゴリの質問に偏る可能性がある。
 * relationship / emotional のバランスを保ちつつ、
 * 各カテゴリ内ではEIG最大の質問を選ぶ。
 *
 * @param candidates      候補質問群
 * @param beliefs         現在のベイズ信念
 * @param targetCount     選択する質問数
 * @param excludeAxes     除外する軸（既に選択済みなど）
 * @param categoryMap     軸→カテゴリのマップ
 * @returns 選択された質問ID群（EIGスコア付き）
 */
export function selectByEIG(
  candidates: { id: string; axisId: TraitAxisKey; weight?: number; discrimination?: number }[],
  beliefs: BeliefSet,
  targetCount: number,
  excludeAxes?: Set<string>,
  categoryMap?: Record<string, string>,
): QuestionEIGScore[] {
  const ranked = rankQuestionsByEIG(candidates, beliefs);

  const selected: QuestionEIGScore[] = [];
  const usedAxes = new Set<string>(excludeAxes ?? []);

  // カテゴリバランス制約
  const categoryCount: Record<string, number> = {};
  const halfTarget = Math.ceil(targetCount / 2);

  for (const score of ranked) {
    if (selected.length >= targetCount) break;
    if (usedAxes.has(score.axisId)) continue;

    // カテゴリバランスチェック
    if (categoryMap) {
      const cat = categoryMap[score.axisId] ?? "other";
      if ((categoryCount[cat] ?? 0) >= halfTarget) continue;
      categoryCount[cat] = (categoryCount[cat] ?? 0) + 1;
    }

    selected.push(score);
    usedAxes.add(score.axisId);
  }

  // カテゴリ制約で足りない場合、制約を緩和して補充
  if (selected.length < targetCount) {
    for (const score of ranked) {
      if (selected.length >= targetCount) break;
      if (usedAxes.has(score.axisId)) continue;
      selected.push(score);
      usedAxes.add(score.axisId);
    }
  }

  return selected;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 4. 軸間信念伝播
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 軸の観測後、相関軸への信念伝播を実行
 *
 * 原理:
 *   軸 A の観測値 x_a が得られた時、相関 r を持つ軸 B の信念も更新できる。
 *   ガウスモデルでは、条件付き期待値: E[x_b | x_a] ≈ μ_b + r × (x_a - μ_a) × (σ_b/σ_a)
 *   条件付き精度: τ_b|a = τ_b + r² × evidencePrecision_a
 *
 *   ただし、伝播による更新は直接観測より弱くすべき:
 *   - 相関係数の推定自体に不確実性がある
 *   - 伝播が連鎖して偽の確信を生むリスクがある
 *
 *   安全策: 伝播精度にダンパー (0.3) を掛ける → 最大でも直接観測の 30% の影響
 *
 * @param beliefs          現在の全軸信念
 * @param observedAxis     観測した軸
 * @param observedValue    観測値 (-1 ~ +1)
 * @param evidencePrecision 観測の証拠精度
 * @returns 伝播後の信念セット
 */
export function propagateBeliefs(
  beliefs: BeliefSet,
  observedAxis: TraitAxisKey,
  observedValue: number,
  evidencePrecision: number,
): BeliefSet {
  /** 伝播ダンパー: 相関による間接更新は直接観測の最大30%の影響 */
  const PROPAGATION_DAMPER = 0.3;

  /** 伝播精度の上限: 過度な間接確信を防止 */
  const MAX_PROPAGATED_PRECISION = 0.5;

  const updated = { ...beliefs };
  const correlatedAxes = getCorrelatedAxes(observedAxis);

  const observedBelief = beliefs[observedAxis];
  if (!observedBelief) return updated;

  for (const { peer, r } of correlatedAxes) {
    const peerBelief = updated[peer];
    if (!peerBelief) continue;

    // 伝播する証拠精度 = r² × 元の精度 × ダンパー
    const propagatedPrecision = Math.min(
      MAX_PROPAGATED_PRECISION,
      r * r * evidencePrecision * PROPAGATION_DAMPER,
    );

    if (propagatedPrecision < 0.01) continue; // 無視できるほど小さい

    // 伝播する証拠値 = 元のμから相関方向へシフト
    // r > 0: 正の相関 → 同方向へ
    // r < 0: 負の相関 → 逆方向へ
    const peerStddev = 1 / Math.sqrt(peerBelief.precision);
    const observedStddev = 1 / Math.sqrt(observedBelief.precision);
    const propagatedValue = peerBelief.mu + r * (observedValue - observedBelief.mu) * (peerStddev / observedStddev);
    const clampedValue = Math.max(-1, Math.min(1, propagatedValue));

    // ベイズ更新（共役ガウス）
    const newPrecision = peerBelief.precision + propagatedPrecision;
    const newMu = (peerBelief.precision * peerBelief.mu + propagatedPrecision * clampedValue) / newPrecision;

    const HARD_CAP = 0.65;
    const CONFIDENCE_SATURATION = 30;
    const MAX_PRECISION = 50;
    const finalPrecision = Math.min(MAX_PRECISION, newPrecision);
    const stddev = 1 / Math.sqrt(finalPrecision);

    updated[peer] = {
      mu: Math.max(-1, Math.min(1, newMu)),
      precision: finalPrecision,
      confidence: HARD_CAP * (1 - Math.exp(-finalPrecision / CONFIDENCE_SATURATION)),
      credibleInterval: [
        Math.max(-1, newMu - 1.96 * stddev),
        Math.min(1, newMu + 1.96 * stddev),
      ],
    };
  }

  return updated;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 5. 不確実性加重アーキタイプスコアリング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 不確実性を考慮した重み付きスコアを計算
 *
 * 従来: score += axisValue × weight
 * 新方式: score += axisValue × weight × confidenceWeight(precision)
 *
 * confidenceWeight:
 *   precision が高い軸ほど重視し、低い軸は影響を減衰させる。
 *   これにより「ほぼ未知の軸」がアーキタイプ判定を不安定にする問題を解消する。
 *
 *   weight = sqrt(precision / (precision + referencePrec))
 *   referencePrec = 5.0 (~10回答分)
 *
 *   precision 0.5 (新規) → weight = 0.30
 *   precision 5.0 (10問) → weight = 0.71
 *   precision 20  (40問) → weight = 0.89
 *   precision 50  (上限) → weight = 0.95
 */
export function computeUncertaintyWeight(precision: number): number {
  const REFERENCE_PRECISION = 5.0;
  return Math.sqrt(precision / (precision + REFERENCE_PRECISION));
}

/**
 * 不確実性加重のアーキタイプレイヤースコア計算
 *
 * @param axes     軸スコア (mu 値)
 * @param beliefs  軸の信念 (precision を使用)
 * @param weights  レイヤーの重みマップ
 * @returns 不確実性で減衰されたスコア
 */
export function computeUncertaintyWeightedScore(
  axes: Partial<Record<TraitAxisKey, number>>,
  beliefs: BeliefSet,
  weights: Partial<Record<TraitAxisKey, number>>,
): number {
  let score = 0;
  let totalWeight = 0;

  for (const [axis, weight] of Object.entries(weights) as [TraitAxisKey, number][]) {
    const axisValue = axes[axis] ?? 0;
    const belief = beliefs[axis];
    const uncertaintyWeight = belief ? computeUncertaintyWeight(belief.precision) : 0.3;

    score += axisValue * weight * uncertaintyWeight;
    totalWeight += Math.abs(weight) * uncertaintyWeight;
  }

  // 正規化: 不確実性による減衰分を補正
  // → スコアの絶対値が precision に依存しすぎないようにする
  if (totalWeight > 0) {
    const rawTotalWeight = Object.values(weights).reduce((s, w) => s + Math.abs(w), 0);
    if (rawTotalWeight > 0) {
      score *= rawTotalWeight / totalWeight;
    }
  }

  return score;
}

/**
 * アーキタイプ判定の全体的な信頼度を信念精度から計算
 *
 * 従来: margin ベースのみ
 * 新方式: margin × precision coverage
 *
 * precision coverage = 「十分な precision を持つ軸の割合」
 * → 判定に使う軸の precision が低いと confidence を下げる
 */
export function computeBeliefBasedConfidence(
  beliefs: BeliefSet,
  layerWeights: Partial<Record<TraitAxisKey, number>>[],
  layerMargins: number[],
): number {
  // 各レイヤーの confidence = margin × 使用軸の平均 uncertaintyWeight
  let totalConfidence = 0;

  for (let i = 0; i < layerWeights.length; i++) {
    const weights = layerWeights[i];
    const margin = layerMargins[i] ?? 0;

    let totalUW = 0;
    let count = 0;
    for (const axis of Object.keys(weights) as TraitAxisKey[]) {
      const belief = beliefs[axis];
      if (belief) {
        totalUW += computeUncertaintyWeight(belief.precision);
        count++;
      }
    }

    const avgUW = count > 0 ? totalUW / count : 0.3;
    totalConfidence += margin * avgUW;
  }

  return Math.min(1, Math.max(0, totalConfidence / layerWeights.length));
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// § 6. 総合不確実性メトリクス
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 全軸の総不確実性を計算（情報エントロピーのプロキシ）
 *
 * ガウス分布のエントロピー H = 0.5 × ln(2πe/τ)
 * 総エントロピー = Σ_axes H(axis) = Σ 0.5 × ln(2πe / precision)
 *
 * UI で「分身があなたをどれだけ理解しているか」として表示可能。
 * precision が上がるほど総エントロピーが下がる ＝ 理解が深まる。
 */
export function computeTotalUncertainty(beliefs: BeliefSet): number {
  let totalEntropy = 0;
  const TWO_PI_E = 2 * Math.PI * Math.E;

  for (const key of TRAIT_AXIS_KEYS) {
    const belief = beliefs[key];
    if (belief) {
      totalEntropy += 0.5 * Math.log(TWO_PI_E / belief.precision);
    }
  }

  return totalEntropy;
}

/**
 * 同期率（sync percentage）の改善版
 *
 * 従来: 質問数ベース（答えた数 / 目標数）
 * 新方式: 不確実性の減少率
 *
 *   sync = 1 - (currentEntropy / maxEntropy)
 *
 * maxEntropy = 全軸が初期精度（0.5）の時のエントロピー
 * → sync は 0（全く未知）〜 1（全軸 MAX_PRECISION）の範囲
 */
export function computeSyncPercentage(beliefs: BeliefSet): number {
  const INITIAL_PRECISION = 0.5;
  const TWO_PI_E = 2 * Math.PI * Math.E;

  let currentEntropy = 0;
  let maxEntropy = 0;

  for (const key of TRAIT_AXIS_KEYS) {
    const belief = beliefs[key];
    const precision = belief?.precision ?? INITIAL_PRECISION;
    currentEntropy += 0.5 * Math.log(TWO_PI_E / precision);
    maxEntropy += 0.5 * Math.log(TWO_PI_E / INITIAL_PRECISION);
  }

  if (maxEntropy <= 0) return 0;

  return Math.max(0, Math.min(1, 1 - currentEntropy / maxEntropy));
}

/**
 * 次の質問で期待される同期率の増分を計算
 *
 * UI で「この質問に答えると ○○% → △△% に上がります」と表示できる。
 * → ユーザーのモチベーションを高める。
 */
export function estimateSyncGain(
  beliefs: BeliefSet,
  questionAxisId: TraitAxisKey,
  questionWeight: number = 0.4,
): number {
  const currentSync = computeSyncPercentage(beliefs);

  // シミュレーション: この質問に答えた後の信念を仮計算
  const evidencePrecision = estimateEvidencePrecision(questionWeight);
  const axisBelief = beliefs[questionAxisId];
  if (!axisBelief) return 0;

  const simBelief = {
    ...axisBelief,
    precision: Math.min(50, axisBelief.precision + evidencePrecision),
  };

  // 相関軸の伝播も含める
  const simBeliefs = { ...beliefs, [questionAxisId]: simBelief };
  const correlatedAxes = getCorrelatedAxes(questionAxisId);
  for (const { peer, r } of correlatedAxes) {
    const peerBelief = simBeliefs[peer];
    if (!peerBelief) continue;
    const propagatedPrecision = r * r * evidencePrecision * 0.3;
    simBeliefs[peer] = {
      ...peerBelief,
      precision: Math.min(50, peerBelief.precision + propagatedPrecision),
    };
  }

  const newSync = computeSyncPercentage(simBeliefs);
  return Math.max(0, newSync - currentSync);
}
