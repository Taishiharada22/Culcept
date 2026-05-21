/**
 * Pattern Repetition Counter — Phase 3 Invariant 24 + Idea ι (= 3+ 回反復閾値)。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §3.1 J-1e / §10.4 Smoke 26-37
 *
 * 役割:
 *   特定 feature (= 同 weekday + 同 hourOfDay + 同 category 等) の反復 anchor を count。
 *   反復閾値 (= default 3+) を満たすか判定する。
 *
 *   既存 Calendar AI は 「同等」 反復扱い、 Aneurasync は **3+ 回反復のみ propose** (= Idea ι)。
 *   1 回しか起きていないパターンは propose しない (= 「初めて」 になり気づき発火しない)。
 *
 * 不変原則:
 *   - Invariant 24 Self-Contradiction → Observation: 3+ 反復 + 直近乖離検出
 *   - Idea ι Reverse-Engineered Pattern Highlight: 3+ 回反復のみ気づき発火閾値
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { TestOverrideContext } from "./testOverrideContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const DEFAULT_WEEK_WINDOW = 4;
export const DEFAULT_MIN_REPETITION = 3;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface PatternRepetitionInput {
  /**
   * 観測対象 anchor 群 (= caller 責任で同 feature 一致のみ filter)。
   *
   * 例: caller は 「同 weekday + 同 hourOfDay + 同 category」 で
   *     historicalAnchors を絞ってから渡す。
   */
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  /** 観測 window 週 (= default 4) */
  readonly weekWindow?: number;
  /** test override (= forceRepetitionThreshold 使用) */
  readonly testOverride?: TestOverrideContext;
}

export interface PatternRepetitionResult {
  /** 反復回数 */
  readonly count: number;
  /** 反復 window 週 (= echo back) */
  readonly weekWindow: number;
  /** 適用された閾値 */
  readonly threshold: number;
  /** 閾値を満たすか */
  readonly meetsThreshold: boolean;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Counting
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 反復 anchor を count し、 閾値判定を返す。
 *
 * caller 責任:
 *   - anchors は同 feature 絞り済 (= 本関数は count のみ)
 *   - sensitive anchor は除外して渡す (= Invariant 4)
 *
 * threshold 優先度:
 *   1. testOverride.forceRepetitionThreshold (= dev/test only)
 *   2. DEFAULT_MIN_REPETITION (= 3)
 */
export function countPatternRepetition(
  input: PatternRepetitionInput,
): PatternRepetitionResult {
  const count = input.anchors.length;
  const weekWindow = input.weekWindow ?? DEFAULT_WEEK_WINDOW;

  const overrideThreshold = input.testOverride?.forceRepetitionThreshold;
  const threshold = overrideThreshold ?? DEFAULT_MIN_REPETITION;

  return {
    count,
    weekWindow,
    threshold,
    meetsThreshold: count >= threshold,
  };
}
