/**
 * TestOverrideContext — Phase 3 Invariant 38。
 *
 * ⚠️ IMPORTANT: dev / test / smoke harness 専用。
 * production code path (= app/ / components/) で **import 禁止**。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.6 Contract invariant 38 / §3.1 J-1c / §6 TestOverrideContext
 *
 * 役割:
 *   Onboarding Quietude / Entropy Budget / Reversibility threshold / Repetition threshold 等の
 *   不変原則 gate を test 時に bypass し、 proposal 機能を smoke テスト可能にする。
 *
 * 不変原則:
 *   - production 振る舞いは override なし (= 全 default invariant 厳守)
 *   - import は tests/ / lib/plan/proposal/__tests__/ のみ許可
 *   - 違反時、 build fail (= tests/unit/plan/testOverrideContextImportRule.test.ts で grep 検証)
 *
 * 将来の強化:
 *   - eslint.config.mjs に no-restricted-imports rule を追加 (= J-1c-3 で別 commit)
 */

import type { OnboardingPhase } from "./onboardingQuietude";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Interface
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface TestOverrideContext {
  /** Onboarding Quietude phase を強制 (= dev で proposal を smoke 可能化) */
  readonly forceOnboardingPhase?: OnboardingPhase;

  /** Entropy Budget 上限を強制 (= 通常 3、 test で N に固定可) */
  readonly forceEntropyBudget?: number;

  /** Reversibility threshold を強制 (= 通常 50、 test で 0 に下げて低 score 提案検証可) */
  readonly forceReversibilityThreshold?: number;

  /** 反復閾値を強制 (= 通常 3+、 test で 1 にして cold start でも proposal 出せる) */
  readonly forceRepetitionThreshold?: number;

  /** Cold start silent gate を bypass */
  readonly bypassColdStartSilence?: boolean;

  /** Theory-of-Mind Pause を bypass */
  readonly bypassUserStatePause?: boolean;
}

/**
 * Empty override context — production default を表現する sentinel。
 * 全 fields undefined であることを runtime 保証 (= Object.freeze)。
 */
export const EMPTY_TEST_OVERRIDE_CONTEXT: TestOverrideContext = Object.freeze({});
