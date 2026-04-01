// lib/stargazer/expansionQuestionSelector.ts
// P4 Phase D: 拡張軸質問の選択ロジック
//
// CEO条件:
//   1. 1日最大1問 — 「毎日の軽さ」を壊さない
//   2. 発見済み / 解放条件に近い / 輪郭が出始めた / 矛盾の再確認が必要な軸にだけ出す
//   3. archetype / core 45軸へは逆流させない（この質問は expansion 軸のみを更新する）
//
// 設計:
//   質問を増やすのではなく、必要な人に必要な1問を混ぜる

import type { TraitAxisKey } from "./traitAxes";
import { EXPANSION_AXIS_KEYS, isExpansionAxis } from "./traitAxes";
import {
  type ExpansionQuestion,
  EXPANSION_QUESTIONS,
  getExpansionQuestionsForAxis,
} from "./expansionQuestions";
import type { AxisBelief } from "./bayesianAxisUpdater";
import {
  getExpansionDisplayTier,
  type ExpansionConfidenceTier,
} from "./expansionDiscovery";
import {
  EXPANSION_MIN_SESSIONS,
  EXPANSION_MIN_DAYS,
  NEAR_EMERGING_CONFIDENCE,
  CONTRADICTION_BOOST,
  LOW_PRECISION_BOOST,
  LOW_PRECISION_THRESHOLD,
  DEPTH_2_PRECISION,
  DEPTH_3_PRECISION,
  EXPANSION_EVIDENCE_PRECISION,
  FAST_ANSWER_THRESHOLD_MS,
  FAST_ANSWER_PENALTY,
  SLOW_ANSWER_THRESHOLD_MS,
  SLOW_ANSWER_BOOST,
} from "./expansionTuning";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface ExpansionSelectionInput {
  /** 各拡張軸の現在の信念 */
  expansionBeliefs: Partial<Record<TraitAxisKey, AxisBelief>>;
  /** 各拡張軸の矛盾検出回数 */
  contradictionCounts: Partial<Record<TraitAxisKey, number>>;
  /** ユーザーの総セッション数 */
  totalSessions: number;
  /** 初回観測からの日数 */
  daysSinceFirst: number;
  /** 最近14日以内に出題した拡張質問ID */
  recentExpansionQuestionIds: Set<string>;
  /** 本日既に拡張質問が出題されたか */
  todayAlreadyAsked: boolean;
}

export interface ExpansionSelectionResult {
  /** 選択された質問（null = 今日は出題なし） */
  question: ExpansionQuestion | null;
  /** 選択理由（ログ用） */
  reason: string;
  /** 対象軸 */
  targetAxisId?: TraitAxisKey;
  /** 軸の現在のティア */
  currentTier?: ExpansionConfidenceTier;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Selection Logic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 今日の拡張質問を最大1問選択する
 *
 * 選択基準:
 * 1. todayAlreadyAsked === true → null（1日最大1問）
 * 2. セッション数 < 20 or 日数 < 7 → null（まだ早い）
 * 3. 対象候補のスコアリング:
 *    - 解放条件に近い軸（emerging/forming tier）→ 高優先
 *    - 矛盾が検出された軸 → 高優先（再確認のため）
 *    - precision が低い軸 → 中優先（情報利得が高い）
 *    - hidden 軸でも confidence > 0.08 なら候補（解放に近づいている）
 *    - confidence = 0 の軸 → 対象外（まだ推論すらされていない）
 * 4. 最近14日以内に使った質問は除外
 * 5. 深さ（depth）は precision に応じて段階的に解放
 */
export function selectExpansionQuestion(
  input: ExpansionSelectionInput,
): ExpansionSelectionResult {
  // ── Gate 1: 1日最大1問 ──
  if (input.todayAlreadyAsked) {
    return { question: null, reason: "今日は既に拡張質問を出題済み" };
  }

  // ── Gate 2: 最低条件 ──
  if (input.totalSessions < EXPANSION_MIN_SESSIONS) {
    return {
      question: null,
      reason: `セッション数不足 (${input.totalSessions}/${EXPANSION_MIN_SESSIONS})`,
    };
  }
  if (input.daysSinceFirst < EXPANSION_MIN_DAYS) {
    return {
      question: null,
      reason: `観測日数不足 (${input.daysSinceFirst}/${EXPANSION_MIN_DAYS})`,
    };
  }

  // ── Step 1: 候補軸のスコアリング ──
  const axisCandidates: {
    axisId: TraitAxisKey;
    priority: number;
    tier: ExpansionConfidenceTier;
    precision: number;
    reason: string;
  }[] = [];

  for (const axisId of EXPANSION_AXIS_KEYS) {
    const belief = input.expansionBeliefs[axisId];
    const contradictions = input.contradictionCounts[axisId] ?? 0;

    // confidence がゼロの軸はまだ推論すらされていない → スキップ
    if (!belief || belief.confidence <= 0) continue;

    const { tier } = getExpansionDisplayTier(belief.confidence);
    let priority = 0;
    const reasons: string[] = [];

    // 輪郭が出始めた軸（emerging/forming）を優先
    if (tier === "emerging") {
      priority += 3;
      reasons.push("emerging tier");
    } else if (tier === "forming") {
      priority += 4;
      reasons.push("forming tier");
    } else if (tier === "visible") {
      priority += 2;
      reasons.push("visible tier");
    } else if (tier === "hidden" && belief.confidence > NEAR_EMERGING_CONFIDENCE) {
      // hidden だが解放に近づいている
      priority += 1;
      reasons.push("near-emerging");
    } else {
      // hidden で confidence も低い → 対象外
      continue;
    }

    // 矛盾検出された軸を優先（再確認のため）
    if (contradictions > 0) {
      priority *= CONTRADICTION_BOOST;
      reasons.push(`contradiction×${contradictions}`);
    }

    // 低精度（情報利得が高い）
    if (belief.precision < LOW_PRECISION_THRESHOLD) {
      priority *= LOW_PRECISION_BOOST;
      reasons.push("low-precision");
    }

    axisCandidates.push({
      axisId,
      priority,
      tier,
      precision: belief.precision,
      reason: reasons.join(", "),
    });
  }

  if (axisCandidates.length === 0) {
    return {
      question: null,
      reason: "対象となる拡張軸がありません（全て hidden or 未推論）",
    };
  }

  // 優先度降順
  axisCandidates.sort((a, b) => b.priority - a.priority);

  // ── Step 2: 軸ごとに質問を選択 ──
  for (const candidate of axisCandidates) {
    const questions = getExpansionQuestionsForAxis(candidate.axisId);

    // 深さフィルタ: precision に応じて解放
    const maxDepth = getMaxDepthForPrecision(candidate.precision);
    const eligible = questions.filter(
      (q) =>
        q.depth <= maxDepth &&
        !input.recentExpansionQuestionIds.has(q.id),
    );

    if (eligible.length === 0) continue;

    // 深さ昇順（まだ聞いていない浅い方から）
    eligible.sort((a, b) => a.depth - b.depth);
    const selected = eligible[0];

    return {
      question: selected,
      reason: `軸 ${candidate.axisId} (${candidate.reason}) → depth=${selected.depth}`,
      targetAxisId: candidate.axisId,
      currentTier: candidate.tier,
    };
  }

  return {
    question: null,
    reason: "全候補軸の質問が最近出題済み",
  };
}

/**
 * precision に応じた最大質問深度
 * 低精度 → 浅い質問から、精度が上がると深い質問へ
 */
function getMaxDepthForPrecision(precision: number): 1 | 2 | 3 {
  if (precision < DEPTH_2_PRECISION) return 1;   // 表層のみ
  if (precision < DEPTH_3_PRECISION) return 2;   // 中間まで
  return 3;                                       // 深層まで解放
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Answer Processing (expansion only — core isolation)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 拡張質問の回答を拡張軸の信念更新入力に変換する
 *
 * CEO条件3: core 45軸への逆流を防止
 * - 返却される axisId は必ず expansion 軸
 * - isExpansionAxis() で二重チェック
 * - 呼び出し側で core 軸の BeliefSet に書き込まないこと
 */
export function processExpansionAnswer(params: {
  question: ExpansionQuestion;
  /** スライダー値 1-5 */
  value: number;
  responseTimeMs?: number;
}): {
  axisId: TraitAxisKey;
  /** -1 ~ +1 正規化スコア */
  score: number;
  /** 証拠精度（expansion 用の低めの重み） */
  evidencePrecision: number;
} | null {
  const { question, value, responseTimeMs } = params;

  // Safety: expansion 軸以外は処理しない
  if (!isExpansionAxis(question.axisId)) {
    console.error(
      `[expansion-question] BUG: non-expansion axis ${question.axisId} in expansion question ${question.id}`,
    );
    return null;
  }

  // 1-5 → -1 ~ +1
  let normalized = (value - 3) / 2;
  if (question.invert) {
    normalized = -normalized;
  }

  // evidence precision: expansion 質問は daily より低め
  // （推論よりは信頼できるが、core 質問ほどの精度はない）
  const basePrecision = EXPANSION_EVIDENCE_PRECISION;

  // 回答時間による微調整（極端に速い回答は精度を下げる）
  let timeMod = 1.0;
  if (responseTimeMs !== undefined) {
    if (responseTimeMs < FAST_ANSWER_THRESHOLD_MS) {
      timeMod = FAST_ANSWER_PENALTY;
    } else if (responseTimeMs > SLOW_ANSWER_THRESHOLD_MS) {
      timeMod = SLOW_ANSWER_BOOST;
    }
  }

  return {
    axisId: question.axisId,
    score: Math.max(-1, Math.min(1, normalized)),
    evidencePrecision: basePrecision * timeMod,
  };
}
