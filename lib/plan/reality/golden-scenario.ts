/**
 * Reality Control OS — Golden Scenario fixture + runner（Slice 2E-B / 検証器）
 *
 * 親設計: docs/aneurasync-live-plan-controller-golden-scenarios.md Part B（35 シナリオ）
 *
 * シナリオを「説明文」でなく **実行可能な fixture**（input + expected）にし、
 * best-action（Gate first→score）・receptivity-gate（配信判断）・invariant-check を
 * 実際に走らせて期待出力と照合する純粋 runner。
 *
 * 制約: 純関数のみ。DB/push/PRM 更新/LLM/既存 Plan 接続なし（検証器であり実行器ではない）。
 * fixtures（具体シナリオ）はテスト側に置く（本 module は型 + runner のみ）。
 */

import { rankCandidates, type BestActionCandidate, type GateKind } from "./best-action";
import { evaluateReceptivityGate, type DeliveryMode, type ReceptivityInput } from "./receptivity-gate";
import {
  allInvariantsHold,
  invariantViolations,
  type DecisionContext,
  type EngineMode,
  type InvariantId,
} from "./invariant-check";
import type { PrmEventKind } from "./prm-event";

export interface ScenarioExpectation {
  /** 期待される best 候補 id（null = 採用なし／ユーザー選択待ち） */
  readonly bestId: string | null;
  /** rejected に含まれるべき候補 id */
  readonly rejectedIds?: readonly string[];
  /** rejected 候補が落ちるべき gate（id → gate） */
  readonly rejectedGates?: Readonly<Record<string, GateKind>>;
  /** best に対する配信判断（receptivity を与えた時） */
  readonly deliveryMode?: DeliveryMode;
  /** best の決定文脈で全 invariant が成立すべきか（既定 true） */
  readonly invariantsHoldOnBest?: boolean;
  /** best 文脈で違反していてはならない invariant（明示確認用） */
  readonly mustNotViolate?: readonly InvariantId[];
  // --- documentary（producing engine 未実装。意図のピン留め） ---
  readonly dayGraphChange?: string;
  readonly prmEvents?: readonly PrmEventKind[];
}

export interface ScenarioFixture {
  readonly id: string; // 例: "S25"
  readonly title: string;
  readonly mode: EngineMode;
  readonly intervened: boolean;
  readonly conditionPresent: boolean;
  readonly candidates: readonly BestActionCandidate[];
  readonly receptivity?: ReceptivityInput;
  readonly expect: ScenarioExpectation;
}

export interface ScenarioRunResult {
  readonly id: string;
  readonly ok: boolean;
  readonly failures: readonly string[];
}

/** fixture を実行し、期待出力と照合する（純関数）。 */
export function runScenario(f: ScenarioFixture): ScenarioRunResult {
  const failures: string[] = [];
  const rank = rankCandidates(f.candidates);

  // best id
  const bestId = rank.best?.candidate.id ?? null;
  if (bestId !== f.expect.bestId) {
    failures.push(`best: expected ${String(f.expect.bestId)}, got ${String(bestId)}`);
  }

  // rejected ids
  const rejectedIds = new Set(rank.rejected.map((r) => r.candidate.id));
  for (const id of f.expect.rejectedIds ?? []) {
    if (!rejectedIds.has(id)) failures.push(`rejected: expected ${id} to be rejected`);
  }

  // rejected gates
  for (const [id, gate] of Object.entries(f.expect.rejectedGates ?? {})) {
    const r = rank.rejected.find((x) => x.candidate.id === id);
    if (!r) {
      failures.push(`rejectedGate: ${id} not in rejected`);
    } else if (!r.gates.some((g) => !g.pass && g.gate === gate)) {
      failures.push(`rejectedGate: ${id} did not fail gate ${gate}`);
    }
  }

  // delivery
  let deliveryMode: DeliveryMode | undefined;
  if (f.receptivity) {
    deliveryMode = evaluateReceptivityGate(f.receptivity).mode;
    if (f.expect.deliveryMode && deliveryMode !== f.expect.deliveryMode) {
      failures.push(`delivery: expected ${f.expect.deliveryMode}, got ${deliveryMode}`);
    }
  }

  // invariants on best
  if (rank.best) {
    const ctx: DecisionContext = {
      mode: f.mode,
      candidate: rank.best.candidate,
      delivery: f.receptivity ? evaluateReceptivityGate(f.receptivity) : undefined,
      intervened: f.intervened,
      conditionPresent: f.conditionPresent,
    };
    if (f.expect.invariantsHoldOnBest !== false && !allInvariantsHold(ctx)) {
      failures.push(`invariants: best violates ${invariantViolations(ctx).map((v) => v.id).join(",")}`);
    }
    for (const id of f.expect.mustNotViolate ?? []) {
      if (invariantViolations(ctx).some((v) => v.id === id)) failures.push(`invariant: best violates ${id}`);
    }
  }

  return { id: f.id, ok: failures.length === 0, failures };
}

/** 複数 fixture を実行 */
export function runScenarios(fixtures: readonly ScenarioFixture[]): ScenarioRunResult[] {
  return fixtures.map(runScenario);
}
