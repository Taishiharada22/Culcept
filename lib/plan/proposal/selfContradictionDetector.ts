/**
 * Self-Contradiction Detector — Phase 3 Invariant 24。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.3 Self-Direction invariant 24 / §3.1 J-1e / §10.4 Smoke 22
 *
 * 役割:
 *   過去の反復パターンと最近行動の乖離を検出し、
 *   提案ではなく **観測文** として表示する。
 *
 *   例: 過去 4 週月曜朝にジム 4 回 → 直近 2 週月曜朝にジムなし
 *       → 「最近 月曜のジムが空いていますね」 (= 観測文、 Past-Self Voice)
 *
 * 不変原則:
 *   - Invariant 24 Self-Contradiction → Observation: 乖離は提案ではなく観測文
 *   - Invariant 29 Past-Self Voice: 「あなたは」 「最近」 文体
 *   - Invariant 39 No Penalty for Ignore: 警告色禁止、 sentiment 中立
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_MIN_REPETITION = 3;
const DEFAULT_MIN_RECENT_DEVIATION = 2;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SelfContradictionInput {
  /**
   * 過去反復 count (= 4 週 window 内で同 feature 観測回数)。
   * caller 責任で同 feature 絞り込んで count を渡す。
   */
  readonly pastRepetitionCount: number;
  /**
   * 直近乖離 count (= 反復パターンと feature 不一致の直近観測数)。
   * 例: 過去 月曜ジム 4 回 → 直近 2 週月曜ジムなし → 2
   */
  readonly recentDeviationCount: number;
  /**
   * 人間可読 feature label (= 例: "月曜のジム" / "火曜の朝カフェ")。
   * caller 側で localize する想定。
   */
  readonly featureLabel: string;
  /** 反復閾値 (= default 3+) */
  readonly minRepetition?: number;
  /** 直近乖離閾値 (= default 2+) */
  readonly minRecentDeviation?: number;
}

export interface SelfContradictionResult {
  /** contradiction 検出フラグ */
  readonly hasContradiction: boolean;
  /** 入力 past repetition count (= echo back) */
  readonly pastRepetitionCount: number;
  /** 入力 recent deviation count (= echo back) */
  readonly recentDeviationCount: number;
  /**
   * 観測文 (= contradiction 時のみ非 null)。
   *
   * 文体は Past-Self Voice、 「最近 X が空いていますね」 形式。
   * 警告色禁止、 sentiment 中立。
   * 採用 / 拒否 button なし (= 純粋な観測、 行動誘導しない)。
   */
  readonly observationCopy: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Detection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 過去反復と直近乖離の比較から contradiction を検出。
 *
 * 判定:
 *   - pastRepetitionCount >= 3 AND recentDeviationCount >= 2 → contradiction
 *   - 観測文を Past-Self Voice 文体で生成
 *
 * caller 責任:
 *   - 同 feature の anchor を pre-filter して count を渡す
 *   - sensitive anchor は除外して count に含めない (= Invariant 4)
 *   - featureLabel を localize された人間可読形式で渡す
 */
export function detectSelfContradiction(
  input: SelfContradictionInput,
): SelfContradictionResult {
  const minRep = input.minRepetition ?? DEFAULT_MIN_REPETITION;
  const minDev = input.minRecentDeviation ?? DEFAULT_MIN_RECENT_DEVIATION;

  const hasContradiction =
    input.pastRepetitionCount >= minRep && input.recentDeviationCount >= minDev;

  const observationCopy = hasContradiction
    ? `最近 ${input.featureLabel} が空いていますね`
    : null;

  return {
    hasContradiction,
    pastRepetitionCount: input.pastRepetitionCount,
    recentDeviationCount: input.recentDeviationCount,
    observationCopy,
  };
}
