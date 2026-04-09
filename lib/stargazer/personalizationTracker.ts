/**
 * Personalization Tracker — Wall 1 + Wall 6
 *
 * Wall 1: defensePredictionStreak — Alter が「次にこのパートが出る」と
 *   予測し、実際にその通りだったかを追跡する。Phase 1→2 の主条件。
 *
 * Wall 6: voluntaryTopicExpansionCount — ユーザーが Alter の probe
 *   とは無関係に自発的に新しいドメインの話題を持ち込んだ回数。
 *   Phase 0→1 の主条件。
 *
 * 設計原則:
 * - 純関数 + fail-open
 * - HdmPhaseState に結果を書き戻す（呼び出し側で hdmStateDirty = true）
 * - 予測は rule-based（LLM 不使用）
 */
import "server-only";

import type { PartsActivationState, DominantPart } from "./partsLens";
import type { HdmPhaseState } from "./hdmPhase";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wall 1: Defense Prediction
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 現在の Parts 状態から「次のターンで支配的になるパート」を予測する。
 *
 * ルール:
 * - 活性の高いパートは慣性で持続しやすい（IFS の自己強化ループ）
 * - balanced/unclear → 予測しない（null）
 * - activationLevel が 0.3 未満 → 弱すぎて予測不能（null）
 */
export function predictNextDefensePattern(
  partsState: PartsActivationState | null,
): string | null {
  if (!partsState) return null;
  if (partsState.dominantPart === "balanced" || partsState.dominantPart === "unclear") {
    return null;
  }

  // 支配パートの activation が弱すぎる場合は予測しない
  const dominant = partsState.dominantPart;
  const activation = partsState[dominant]?.activationLevel ?? 0;
  if (activation < 0.3) return null;

  // 予測: 現在の dominant がそのまま持続する
  // （将来的には mode の遷移パターンも考慮できるが、まずは最小実装）
  return dominant;
}

/**
 * 前ターンの予測を今ターンの実測と比較し、streak を更新する。
 *
 * @returns 更新後の HdmPhaseState の部分フィールド
 */
export function evaluateDefensePrediction(
  state: HdmPhaseState,
  actualPartsState: PartsActivationState | null,
): Pick<HdmPhaseState, "defensePredictionStreak"> {
  const prediction = state.lastDefensePrediction;

  // 予測がなかった → streak 変更なし
  if (!prediction) {
    return { defensePredictionStreak: state.defensePredictionStreak };
  }

  // 実測がない or unclear → 判定不能、streak 変更なし
  if (!actualPartsState || actualPartsState.dominantPart === "unclear") {
    return { defensePredictionStreak: state.defensePredictionStreak };
  }

  // balanced は「防衛なし」— 予測が balanced 以外なら外れ
  const actual: DominantPart = actualPartsState.dominantPart;

  if (prediction === actual) {
    // 的中 → streak +1
    return { defensePredictionStreak: state.defensePredictionStreak + 1 };
  }

  // 不的中 → streak リセット
  return { defensePredictionStreak: 0 };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Wall 6: Voluntary Topic Expansion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * ユーザーが Alter の probe と無関係なドメインに自発的に話題を広げたかを検出する。
 *
 * 判定ロジック:
 * 1. ユーザーの active_domains を取得
 * 2. 前ターンで Alter が probe したドメインを lastProbedDomains から取得
 * 3. active_domains のうち lastProbedDomains に含まれないものがあれば「自発展開」
 *
 * 除外:
 * - active_domains が空 → 検出不能
 * - lastProbedDomains が空（初回ターンなど）→ 全ドメインが自発扱い
 *   → ただし初回は probe も domains もないので実質スキップ
 */
export function detectVoluntaryTopicExpansion(
  userActiveDomains: string[],
  lastProbedDomains: string[],
): { expanded: boolean; newDomains: string[] } {
  if (userActiveDomains.length === 0) {
    return { expanded: false, newDomains: [] };
  }

  // probe がなかった場合、全てが自発
  // ただし「何も probe していない」は初回ターンなどで起こりうるので
  // その場合も自発展開としてカウントする（ユーザーが自ら話題を持ってきた）
  const probedSet = new Set(lastProbedDomains);
  const newDomains = userActiveDomains.filter(d => !probedSet.has(d));

  return {
    expanded: newDomains.length > 0,
    newDomains,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 統合: HdmPhaseState 更新
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PersonalizationTrackingResult {
  /** 更新後の HdmPhaseState フィールド群 */
  stateUpdates: Partial<HdmPhaseState>;
  /** analytics 用 */
  analytics: {
    defense_prediction_hit: boolean | null;
    defense_prediction_streak: number;
    voluntary_expansion_detected: boolean;
    voluntary_expansion_new_domains: string[];
    voluntary_expansion_total: number;
  };
}

/**
 * 1ターン分の本人化追跡を実行し、HdmPhaseState の更新差分を返す。
 *
 * 呼び出しタイミング: Parts 推定完了後、proactive engine 出力取得後
 */
export function runPersonalizationTracking(
  state: HdmPhaseState,
  actualPartsState: PartsActivationState | null,
  userActiveDomains: string[],
  currentProbedDomains: string[],
): PersonalizationTrackingResult {
  // 1. Defense prediction 評価
  const predictionEval = evaluateDefensePrediction(state, actualPartsState);
  const predictionHit = state.lastDefensePrediction
    ? predictionEval.defensePredictionStreak > state.defensePredictionStreak
    : null;

  // 2. 次ターンの予測を生成
  const nextPrediction = predictNextDefensePattern(actualPartsState);

  // 3. Voluntary topic expansion 検出
  const expansion = detectVoluntaryTopicExpansion(
    userActiveDomains,
    state.lastProbedDomains,
  );
  const newExpansionCount = state.voluntaryTopicExpansionCount
    + (expansion.expanded ? 1 : 0);

  return {
    stateUpdates: {
      defensePredictionStreak: predictionEval.defensePredictionStreak,
      lastDefensePrediction: nextPrediction,
      voluntaryTopicExpansionCount: newExpansionCount,
      lastProbedDomains: currentProbedDomains,
    },
    analytics: {
      defense_prediction_hit: predictionHit,
      defense_prediction_streak: predictionEval.defensePredictionStreak,
      voluntary_expansion_detected: expansion.expanded,
      voluntary_expansion_new_domains: expansion.newDomains,
      voluntary_expansion_total: newExpansionCount,
    },
  };
}
