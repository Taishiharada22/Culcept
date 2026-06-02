/**
 * Reality Control OS — Invariant Checker（Slice 2E-A / 検証器）
 *
 * 親設計: docs/aneurasync-live-plan-controller-golden-scenarios.md Part A（24 Invariant）
 *
 * Invariant を「説明文」でなく **fail 可能なチェック**にする。合否基準。
 *   checkInvariant(id, ctx) → { id, applicable, pass, reason }
 *
 * 決定時に検証できる invariant をここで実装する。モデル時 invariant（INV-3 Safety Floor /
 * INV-8 confidence / INV-21 lead-time 単調性 / INV-12 学習閉包 等）は各 module の unit test
 * で担保済み（realityLsat / realityPrmEvent）。本 checker は「ある決定が出る瞬間」の検証。
 *
 * 制約: 純関数のみ。DB/push/PRM 更新/LLM/既存 Plan 接続なし（検証器であり実行器ではない）。
 */

import { type BestActionCandidate } from "./best-action";
import { changeSetRequiresConfirmation, validateUndoability } from "./change-set";
import { isImmovable } from "./authority";
import { isTraceable, traceConfidence } from "./source-trace";
import { type DeliveryDecision } from "./receptivity-gate";

export type EngineMode = "build" | "complete" | "repair" | "optimize" | "none";

/** 決定の文脈（invariant が検査する対象を束ねる） */
export interface DecisionContext {
  readonly mode: EngineMode;
  /** 採用された候補（変更差分・根拠・metrics・disposition を含む） */
  readonly candidate?: BestActionCandidate;
  /** 配信判断 */
  readonly delivery?: DeliveryDecision;
  /** 介入したか（INV-15） */
  readonly intervened: boolean;
  /** 実条件（empty/gap/risk/mismatch）があったか（INV-15） */
  readonly conditionPresent: boolean;
}

export type InvariantId =
  | "INV-1" // 行動可能性
  | "INV-4" // Traceable（No Phantom）
  | "INV-5" // 自動実行の境界
  | "INV-7" // 既存予定の尊重
  | "INV-15" // mode 正当性
  | "INV-16" // Whole-Part Coherence
  | "INV-19" // Recovery Core 保護
  | "INV-22" // Daily Plan Quality
  | "INV-23" // Source Traceability
  | "INV-24"; // Reversibility

export interface InvariantResult {
  readonly id: InvariantId;
  readonly applicable: boolean;
  readonly pass: boolean;
  readonly reason?: string;
}

const SOURCE_TRACE_MIN = 0.5;
const OVERPACK_MAX = 0.6;
const GOAL_MIN = 0.3;

const ok = (id: InvariantId): InvariantResult => ({ id, applicable: true, pass: true });
const na = (id: InvariantId): InvariantResult => ({ id, applicable: false, pass: true });
const fail = (id: InvariantId, reason: string): InvariantResult => ({ id, applicable: true, pass: false, reason });

function isPushMode(d?: DeliveryDecision): boolean {
  return d?.mode === "push" || d?.mode === "urgent_push";
}

/** INV-1 行動可能性: push/urgent は必ず行動導線を持つ */
export function checkActionability(ctx: DecisionContext): InvariantResult {
  if (!ctx.delivery || !isPushMode(ctx.delivery)) return na("INV-1");
  return ctx.delivery.allowedActions.length > 0
    ? ok("INV-1")
    : fail("INV-1", "push without an action (no-action notification)");
}

/** INV-4 Traceable: 提案は根拠に追跡可能 */
export function checkTraceable(ctx: DecisionContext): InvariantResult {
  if (!ctx.candidate) return na("INV-4");
  return isTraceable(ctx.candidate.sourceTraces) ? ok("INV-4") : fail("INV-4", "no source trace (phantom)");
}

/** INV-5 自動実行の境界: auto で確認必須(他人/予約/import_locked) を触らない */
export function checkPermissionBoundary(ctx: DecisionContext): InvariantResult {
  if (!ctx.candidate) return na("INV-5");
  if (ctx.candidate.proposedDisposition === "auto" && changeSetRequiresConfirmation(ctx.candidate.changeSet)) {
    return fail("INV-5", "auto-applies a change requiring confirmation");
  }
  return ok("INV-5");
}

/** INV-7 既存予定の尊重: immovable(hard/import_locked/user_owned∧locked) を auto で動かさない */
export function checkRespectExisting(ctx: DecisionContext): InvariantResult {
  if (!ctx.candidate) return na("INV-7");
  if (ctx.candidate.proposedDisposition !== "auto") return ok("INV-7");
  const touchesImmovable = ctx.candidate.changeSet.ops.some((op) => {
    const snap = op.kind === "remove" ? op.before : op.after;
    return snap.governance ? isImmovable(snap.governance) : false;
  });
  return touchesImmovable ? fail("INV-7", "auto-moves an immovable item") : ok("INV-7");
}

/** INV-15 mode 正当性: 実条件が無いのに介入しない（捏造禁止） */
export function checkModeCorrectness(ctx: DecisionContext): InvariantResult {
  if (ctx.intervened && !ctx.conditionPresent) {
    return fail("INV-15", "intervened without a real condition (manufactured intervention)");
  }
  return ok("INV-15");
}

/** INV-16 Whole-Part Coherence: 局所最適が全体（下流/翌日/回復/予算）を壊さない */
export function checkWholePart(ctx: DecisionContext): InvariantResult {
  if (!ctx.intervened || !ctx.candidate) return na("INV-16");
  return ctx.candidate.metrics.wholePartCoherent
    ? ok("INV-16")
    : fail("INV-16", "breaks whole-day / downstream / next-day / budget");
}

/** INV-19 Recovery Core 保護: 回復核を安全下限以下に削らない */
export function checkRecoveryCore(ctx: DecisionContext): InvariantResult {
  if (!ctx.intervened || !ctx.candidate) return na("INV-19");
  return ctx.candidate.metrics.recoveryProtected
    ? ok("INV-19")
    : fail("INV-19", "cuts a protected recovery core");
}

/** INV-22 Daily Plan Quality: Build/Complete は「良い1日」基準を満たす */
export function checkDailyPlanQuality(ctx: DecisionContext): InvariantResult {
  if (ctx.mode !== "build" && ctx.mode !== "complete") return na("INV-22");
  if (!ctx.candidate) return na("INV-22");
  const m = ctx.candidate.metrics;
  const problems: string[] = [];
  if (!m.deadlineSatisfied) problems.push("重要予定が守られない");
  if (!m.recoveryProtected) problems.push("食事/休息が守られない");
  if (m.overpack > OVERPACK_MAX) problems.push("過密");
  if (m.goalAttainment < GOAL_MIN) problems.push("目的を満たさない");
  if (!m.wholePartCoherent) problems.push("全体整合を欠く");
  if (ctx.delivery && ctx.delivery.allowedActions.length === 0) problems.push("1タップ確定不可");
  return problems.length === 0 ? ok("INV-22") : fail("INV-22", `Daily Plan 品質不足: ${problems.join(" / ")}`);
}

/** INV-23 Source Traceability: 根拠あり、push 時は弱根拠でない */
export function checkSourceTraceability(ctx: DecisionContext): InvariantResult {
  if (!ctx.candidate) return na("INV-23");
  if (!isTraceable(ctx.candidate.sourceTraces)) return fail("INV-23", "untraceable proposal");
  if (isPushMode(ctx.delivery) && traceConfidence(ctx.candidate.sourceTraces) < SOURCE_TRACE_MIN) {
    return fail("INV-23", "pushing a weakly-grounded proposal");
  }
  return ok("INV-23");
}

/** INV-24 Reversibility: 変更は atomic に undo 可能 */
export function checkReversibility(ctx: DecisionContext): InvariantResult {
  if (!ctx.candidate) return na("INV-24");
  const v = validateUndoability(ctx.candidate.changeSet);
  return v.ok ? ok("INV-24") : fail("INV-24", `not undoable: ${v.errors.join("; ")}`);
}

const CHECKERS: ReadonlyArray<(ctx: DecisionContext) => InvariantResult> = [
  checkActionability,
  checkTraceable,
  checkPermissionBoundary,
  checkRespectExisting,
  checkModeCorrectness,
  checkWholePart,
  checkRecoveryCore,
  checkDailyPlanQuality,
  checkSourceTraceability,
  checkReversibility,
];

/** 全 invariant を検査 */
export function checkAllInvariants(ctx: DecisionContext): InvariantResult[] {
  return CHECKERS.map((c) => c(ctx));
}

/** 違反のみ（applicable ∧ !pass） */
export function invariantViolations(ctx: DecisionContext): InvariantResult[] {
  return checkAllInvariants(ctx).filter((r) => r.applicable && !r.pass);
}

/** 全 invariant を満たすか */
export function allInvariantsHold(ctx: DecisionContext): boolean {
  return invariantViolations(ctx).length === 0;
}
