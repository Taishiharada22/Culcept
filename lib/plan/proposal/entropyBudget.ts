/**
 * Entropy Budget — Phase 3 Invariant 20。
 *
 * 設計書: docs/alter-plan-phase3-predictive-day-orchestration-architecture.md
 *   §2.3 Self-Direction invariant 20 / §3.1 J-1c
 *
 * 役割:
 *   提案の認知負荷を point 制で管理。 数ではなく 「user の負荷」 で上限を制御する。
 *   既存 Calendar AI が 「提案数」 で gate するのに対し、
 *   Aneurasync は 「認知負荷 point」 で gate (= 革命的差別化)。
 *
 * Point 配分:
 *   - single (= 1 提案 chip):           1pt
 *   - modify (= 修正必要、 EditAnchorModal): 2pt
 *   - bulk  (= 一括提案、 ProposalSheet): 3pt
 *
 * Default daily budget: 3pt
 *
 * Auto-scale: 直近 7 日 dismiss 3+ で budget 1 削減 (= 最低 2pt)
 *
 * TestOverride: forceEntropyBudget で固定可 (= test で 0 / 10 等)。
 */

import type { TestOverrideContext } from "./testOverrideContext";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const DEFAULT_DAILY_BUDGET = 3;
const HIGH_DISMISS_RATE_THRESHOLD = 3; // 直近 7 日 dismiss 3+ で budget -1
const LOW_BUDGET_FLOOR = 2; // budget は最低 2 まで縮小

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ProposalLoadKind = "single" | "modify" | "bulk";

export const PROPOSAL_LOAD_COST: Readonly<Record<ProposalLoadKind, number>> = Object.freeze({
  single: 1,
  modify: 2,
  bulk: 3,
});

export interface EntropyBudgetInput {
  /** 直近 7 日の dismiss 回数 (= auto-scale 用) */
  readonly recentDismissCount: number;
  /** test override context */
  readonly testOverride?: TestOverrideContext;
}

export interface EntropyBudgetState {
  readonly maxDailyBudget: number;
  readonly spentBudget: number;
  readonly remainingBudget: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Budget computation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * input から 1 日 budget 上限を計算。
 *
 * 判定順:
 *   1. testOverride.forceEntropyBudget があれば最優先 (= test/dev only)
 *   2. recentDismissCount >= 3 → budget -1 (= 最低 2)
 *   3. その他 → DEFAULT_DAILY_BUDGET (= 3)
 */
export function computeMaxDailyBudget(input: EntropyBudgetInput): number {
  const override = input.testOverride?.forceEntropyBudget;
  if (override != null) return Math.max(0, override);

  if (input.recentDismissCount >= HIGH_DISMISS_RATE_THRESHOLD) {
    return Math.max(LOW_BUDGET_FLOOR, DEFAULT_DAILY_BUDGET - 1);
  }
  return DEFAULT_DAILY_BUDGET;
}

/**
 * 初期 state を作る (= spent = 0)。
 */
export function initEntropyBudgetState(input: EntropyBudgetInput): EntropyBudgetState {
  const max = computeMaxDailyBudget(input);
  return {
    maxDailyBudget: max,
    spentBudget: 0,
    remainingBudget: max,
  };
}

/**
 * 候補 load を消費しても budget 内に収まるか判定。
 */
export function canConsumeBudget(
  state: EntropyBudgetState,
  loadKind: ProposalLoadKind,
): boolean {
  const cost = PROPOSAL_LOAD_COST[loadKind];
  return state.spentBudget + cost <= state.maxDailyBudget;
}

/**
 * Budget を消費した新 state を返す (= immutable update)。
 *
 * 上限超過時も実消費は実行する (= caller 責任で canConsume 経由)、
 * remainingBudget は floor 0。
 */
export function consumeBudget(
  state: EntropyBudgetState,
  loadKind: ProposalLoadKind,
): EntropyBudgetState {
  const cost = PROPOSAL_LOAD_COST[loadKind];
  const newSpent = state.spentBudget + cost;
  return {
    maxDailyBudget: state.maxDailyBudget,
    spentBudget: newSpent,
    remainingBudget: Math.max(0, state.maxDailyBudget - newSpent),
  };
}
