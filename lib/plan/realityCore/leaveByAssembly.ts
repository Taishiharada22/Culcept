/**
 * leaveByAssembly — RD2f-assembly（2026-06-15）: leaveBy enrichment pass（pure）
 *
 * 設計書: docs/reality-leaveby-assembly-injection-rd2f-assembly-0.md
 *
 * 思想: `EventRealityNodeV0[]` と computed leaveBy 候補群を受け取り、対象 ERN に `leaveByComputed` を **安全に attach した
 *   新 ERN 配列**を返す pure enrichment pass。**compileMovementReality と assembleRealityGraph の間**に挟める「関数」を作る段階
 *   （本 slice は call-site 接続・preview 表示・MovementReality 更新・leaveByKnown 反映を**しない**）。
 *
 * 不変条件:
 *   - ern[] を authoritative に駆動・id key = `eventRealityNodeId === leaveBy.subjectNodeId`（anchorId parse / partial / empty 禁止）。
 *   - **`attachComputedLeaveBy` を必ず通す**（direct assignment 禁止・唯一 writer・再検証 + staleness）。
 *   - cardinality（候補 ≠ 1）/ orphan（ERN なし）/ duplicate ERN id → attach せず trace。supply なし → same-ref no-op。
 *   - **bundle は input に持ち込まない**（candidate は leaveBy + computedScope のみ）→ durationValue/capability/origin/buffer は ERN に入らない。
 *   - MovementReality / leaveByKnown / routeKnown / etaKnown / mobilityStatus / missingInputRefs / feasibility / risk / permission を**変更しない**。
 *   - IO / UI / route / preview なし。
 */

import {
  attachComputedLeaveBy,
  type LeaveByGraphBindingViolation,
} from "./leaveByGraphBinding";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { LeaveByComputationV0 } from "./leaveByComputation";
import type { LeaveBySupplyScopeV0 } from "./leaveBySupply";
import type { RealityInstant } from "./realityInstant";

export const LEAVEBY_ASSEMBLY_VERSION = 0;

export type LeaveByAssemblyViolation =
  | "duplicate_supply"
  | "duplicate_ern_id"
  | "orphan_supply"
  | "ern_scope_missing"
  | "attach_failed";

/** computed leaveBy 候補（bundle を含まない・leaveBy + その計算 scope のみ） */
export interface LeaveBySupplyCandidateV0 {
  /** = leaveBy.subjectNodeId（この leaveBy が属する ERN の eventRealityNodeId） */
  readonly eventRealityNodeId: string;
  readonly leaveBy: LeaveByComputationV0;
  readonly computedScope: LeaveBySupplyScopeV0;
}
export type LeaveBySupplyByNodeIdV0 = ReadonlyArray<LeaveBySupplyCandidateV0>;

export interface LeaveByAssemblyInputV0 {
  readonly eventRealityNodes: ReadonlyArray<EventRealityNodeV0>;
  readonly supplyCandidates: LeaveBySupplyByNodeIdV0;
  readonly consumingInstant: RealityInstant;
  /** 各 ERN の movement に期待される scope（caller 供給・候補がある ERN のみ必要） */
  readonly ernScopeByNodeId: Readonly<Record<string, LeaveBySupplyScopeV0>>;
}

export interface LeaveByAssemblyTrace {
  readonly attachedNodeIds: ReadonlyArray<string>;
  readonly skippedNoSupply: number;
  readonly orphanSupplyNodeIds: ReadonlyArray<string>;
  readonly cardinalityRejectedNodeIds: ReadonlyArray<string>;
  readonly duplicateErnIds: ReadonlyArray<string>;
  readonly attachFailures: ReadonlyArray<{
    readonly eventRealityNodeId: string;
    readonly violations: ReadonlyArray<LeaveByGraphBindingViolation>;
  }>;
  readonly violations: ReadonlyArray<LeaveByAssemblyViolation>;
}

export interface LeaveByAssemblyResultV0 {
  readonly eventRealityNodes: ReadonlyArray<EventRealityNodeV0>;
  readonly trace: LeaveByAssemblyTrace;
}

/** eventRealityNodeId → 候補配列（cardinality 検出用） */
export function buildLeaveBySupplyMap(candidates: LeaveBySupplyByNodeIdV0): Map<string, LeaveBySupplyCandidateV0[]> {
  const map = new Map<string, LeaveBySupplyCandidateV0[]>();
  for (const cand of candidates) {
    const arr = map.get(cand.eventRealityNodeId) ?? [];
    arr.push(cand);
    map.set(cand.eventRealityNodeId, arr);
  }
  return map;
}

/**
 * assembleLeaveByBindings — ern[] を authoritative に enrich（pure）。
 * compileMovementReality と assembleRealityGraph の間で使える「関数」。call-site 接続は別 slice。
 */
export function assembleLeaveByBindings(input: LeaveByAssemblyInputV0): LeaveByAssemblyResultV0 {
  const supplyMap = buildLeaveBySupplyMap(input.supplyCandidates);

  // ERN id の重複検出（identity ガード）
  const ernIdCount = new Map<string, number>();
  for (const e of input.eventRealityNodes) ernIdCount.set(e.eventRealityNodeId, (ernIdCount.get(e.eventRealityNodeId) ?? 0) + 1);
  const duplicateErnIds = Array.from(ernIdCount.entries()).filter(([, n]) => n > 1).map(([id]) => id);
  const dupErnSet = new Set(duplicateErnIds);
  const ernIdSet = new Set(input.eventRealityNodes.map((e) => e.eventRealityNodeId));

  // orphan supply（ERN に存在しない id を指す候補）
  const orphanSupplyNodeIds = Array.from(supplyMap.keys()).filter((id) => !ernIdSet.has(id));

  const attachedNodeIds: string[] = [];
  const cardinalityRejectedNodeIds: string[] = [];
  const attachFailures: { eventRealityNodeId: string; violations: ReadonlyArray<LeaveByGraphBindingViolation> }[] = [];
  let skippedNoSupply = 0;

  const out: EventRealityNodeV0[] = input.eventRealityNodes.map((ern) => {
    const id = ern.eventRealityNodeId;
    // 重複 ERN id → attach しない（identity 不確実）
    if (dupErnSet.has(id)) return ern;
    const cands = supplyMap.get(id) ?? [];
    if (cands.length === 0) {
      skippedNoSupply += 1;
      return ern; // same-ref no-op
    }
    if (cands.length > 1) {
      cardinalityRejectedNodeIds.push(id); // 複数候補 → attach しない
      return ern;
    }
    const cand = cands[0];
    const ernScope = input.ernScopeByNodeId[id];
    if (ernScope === undefined) {
      attachFailures.push({ eventRealityNodeId: id, violations: [] }); // scope 不明 → attach しない
      return ern;
    }
    // 唯一の writer。bundle/durationValue 等は input に存在しないため ERN に入りようがない。
    const r = attachComputedLeaveBy({
      ern,
      computed: cand.leaveBy,
      computedScope: cand.computedScope,
      ernScope,
      consumingInstant: input.consumingInstant,
    });
    if (r.attached) {
      attachedNodeIds.push(id);
      return r.ern;
    }
    attachFailures.push({ eventRealityNodeId: id, violations: r.violations });
    return ern;
  });

  let violations: LeaveByAssemblyViolation[] = [];
  const add = (cond: boolean, v: LeaveByAssemblyViolation): void => {
    violations = cond ? violations.concat([v]) : violations;
  };
  add(duplicateErnIds.length > 0, "duplicate_ern_id");
  add(orphanSupplyNodeIds.length > 0, "orphan_supply");
  add(cardinalityRejectedNodeIds.length > 0, "duplicate_supply");
  add(attachFailures.some((f) => f.violations.length === 0), "ern_scope_missing");
  add(attachFailures.some((f) => f.violations.length > 0), "attach_failed");

  return {
    eventRealityNodes: out,
    trace: {
      attachedNodeIds,
      skippedNoSupply,
      orphanSupplyNodeIds,
      cardinalityRejectedNodeIds,
      duplicateErnIds,
      attachFailures,
      violations,
    },
  };
}
