/**
 * Onboarding Quietude — Phase 3 Invariant 36 + Idea 24。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.5 補正 invariant 36 / §3.1 J-1c
 *
 * 役割:
 *   利用初期 7 日 silent (= proposal 0)、 8-30 日 max 1/週、 30+ 日 通常運用。
 *   既存 Calendar AI が初日からフル稼働するのと逆方向 (= 「まず観察、 話すのは後」)。
 *
 * 不変原則:
 *   - Day 0-7:   proposal 0 (= silent observation のみ)
 *   - Day 8-30:  max 1 proposal / 週
 *   - Day 30+:   通常運用 (= Entropy Budget 等で制御)
 *
 * TestOverride: forceOnboardingPhase で固定可。
 */

import type { TestOverrideContext } from "./testOverrideContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const QUIETUDE_DAYS = 7;
const LIMITED_DAYS = 30;
const MS_PER_DAY = 86400000;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type OnboardingPhase = "quietude_0_7d" | "limited_8_30d" | "normal_30d_plus";

export interface OnboardingQuietudeInput {
  /** Plan tab 利用開始日 (= ISO 8601 date string) */
  readonly firstUseDate: string;
  /** 現在 (= ISO 8601 date string) */
  readonly now: string;
  /** test override context (= production では undefined / EMPTY) */
  readonly testOverride?: TestOverrideContext;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function parseIso(iso: string): number {
  const t = Date.parse(iso);
  return isNaN(t) ? 0 : t;
}

/**
 * 2 つの ISO 日時間の経過日数 (= floor)。 不正入力なら 0。
 */
function daysSince(startIso: string, endIso: string): number {
  const start = parseIso(startIso);
  const end = parseIso(endIso);
  if (start === 0 || end === 0) return 0;
  return Math.floor((end - start) / MS_PER_DAY);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 経過日数から phase を判定。
 *
 * TestOverride.forceOnboardingPhase が指定されたら最優先。
 * production では firstUseDate と now の差 で判定。
 */
export function classifyOnboardingPhase(input: OnboardingQuietudeInput): OnboardingPhase {
  const override = input.testOverride?.forceOnboardingPhase;
  if (override) return override;

  const elapsed = daysSince(input.firstUseDate, input.now);
  if (elapsed < QUIETUDE_DAYS) return "quietude_0_7d";
  if (elapsed < LIMITED_DAYS) return "limited_8_30d";
  return "normal_30d_plus";
}

/**
 * phase から 1 日提案上限を返す。
 *
 * - quietude_0_7d:    0 (= 完全沈黙)
 * - limited_8_30d:    1 (= 週 1 = 日次でも 1 max、 加えて Entropy Budget でさらに制御可)
 * - normal_30d_plus:  Number.POSITIVE_INFINITY (= Entropy Budget が制御主体)
 */
export function dailyProposalLimitForPhase(phase: OnboardingPhase): number {
  switch (phase) {
    case "quietude_0_7d":
      return 0;
    case "limited_8_30d":
      return 1;
    case "normal_30d_plus":
      return Number.POSITIVE_INFINITY;
  }
}

/**
 * phase が proposal を発火可能か (= dailyProposalLimit > 0)。
 */
export function isProposalAllowed(phase: OnboardingPhase): boolean {
  return dailyProposalLimitForPhase(phase) > 0;
}
