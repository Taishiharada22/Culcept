/**
 * CollapsePropagationMapV0 — RC2b-2 「崩れたらどこへ広がり得るか」impact surface（pure core 限定）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md / CEO RC2b-2 GO（2026-06-13）
 *
 * 3 軸の峻別（混ぜない）:
 *   - Feasibility = 成立するか / 判断できるか
 *   - CollapseRisk = どこが崩れやすいか
 *   - **CollapsePropagation = 崩れた場合に、どの対象へ影響が広がり得るか**（本型・impact surface）
 *
 * 不変条件（CEO）— **候補であって確定ではない**:
 *   - high collapse risk = 必ず波及する、ではない / propagation candidate = 因果確定ではない
 *   - downstream candidate = 影響し得る対象であり影響確定ではない / movement unresolved = 遅延確定ではない
 *   - time conflict = 後続全滅ではない / commitment high = propagation source でなく impact severity modifier
 *   - permission blocked = propagation source でなく action boundary / missingInputs = failure でなく未解決材料
 *   - exact_time_collision_ambiguous = causality にしない（edge を作らない・RJ1b-A 継承）
 *
 * 2 軸分離（RC2b-1A の教訓を踏襲）: **propagationLevel = known surface**（confirmed/inferred time conflict 由来のみ）。
 *   movement/ambiguous/decision/source は `unresolvedPropagationInputs`（別軸）に保持し、known surface を作らない。
 *   known surface 無 + 未解決あり → propagationLevel unknown / それも無 → none。
 *
 * 方向性（CEO 強調）: propagation は**方向を持つ**（時間は前方にのみ流れる = earlier→later）。
 *   directional edge は **sorted id を使わない**（fromNodeId/toNodeId を保持・edgeId に方向を残す）。
 *   対称な PairwiseTimeRelation（sorted id）と directional propagation edge を混同しない。backward propagation を作らない。
 *
 * 規律（CEO）: no probability/% / no 波及確率 / no proposal/3案/出発線/intervention/通知/action/permission 緩和 /
 *   fake ETA・leaveBy・prep なし / currentLocation・weather 不使用 / **no causality 断定** / knownComponentSummary 非参照 /
 *   LLM 不使用。全 edge/source に sourceRefs/evidenceRefs/relationRefs/missingInputRefs を持たせ code だけで作文させない。
 *   pure（I/O・時刻 API・乱数なし）。COLLAPSE_PROPAGATION_VERSION は graph manifest と独立。
 */

import type { RealityGraphSnapshotV0 } from "./realityGraphSnapshot";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { MissingInputRef } from "./momentSnapshot";
import type { RealityInstant } from "./realityInstant";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import { toSubjectiveMin } from "@/lib/plan/dayState/timeOfDay";
import type { FeasibilityJudgmentV0 } from "./feasibilityJudgment";
import type { CollapseRiskProfileV0 } from "./collapseRisk";

/** propagation derive 版（graph manifest と独立 — collapsePropagationId basis のみ） */
export const COLLAPSE_PROPAGATION_VERSION = 0;

/** 影響範囲の分類（**確率ではない**）。none/local/downstream/day_scope/unknown */
export type PropagationLevel = "none" | "local" | "downstream" | "day_scope" | "unknown";

export type PropagationEdgeKind =
  | "time_relation_edge"
  | "adjacent_event_order_edge"
  | "unresolved_movement_edge"
  | "same_day_carryover_candidate_edge" // v0 未実装（cross-day model 待ち）
  | "decision_dependency_edge"; // v0 未実装（dependency model 待ち）

export interface CollapsePropagationEdge {
  /** **directional**（sorted でない・方向を保持）: `pedge:<kind>:<from>-><to>` */
  readonly edgeId: string;
  readonly edgeKind: PropagationEdgeKind;
  readonly fromNodeId: string; // 崩れの起点（earlier / cause 側）
  readonly toNodeId: string; // 影響し得る対象（later / downstream 側）
  readonly direction: "forward"; // v0: 時間前方のみ（backward propagation なし）
  /** この edge を生んだ failure mode code（複数可） */
  readonly sourceFailureModes: ReadonlyArray<string>;
  /** known surface（confirmed/inferred conflict 由来）= true / 未解決 candidate（movement 等）= false */
  readonly resolved: boolean;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<string>;
  readonly sourceRefs: { readonly dayGraphSnapshotId: string };
}

export interface CollapsePropagationTrace {
  readonly schemaVersion: 0;
  readonly collapsePropagationId: string;
  readonly collapsePropagationVersion: number;
  readonly graphBaseId: string;
  readonly snapshotId: string;
  readonly feasibilityJudgmentId: string;
  readonly collapseRiskProfileId: string;
  readonly usedInputRefs: ReadonlyArray<string>;
  readonly failureModeRefs: ReadonlyArray<string>;
  readonly relationRefs: ReadonlyArray<string>;
  readonly affectedNodeRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly evaluatedAtInstant: RealityInstant;
}

export interface CollapsePropagationMapV0 {
  readonly schemaVersion: 0;
  /** 影響範囲の分類（確率でない・known surface = conflict 由来のみ） */
  readonly propagationLevel: PropagationLevel;
  readonly propagationEdges: ReadonlyArray<CollapsePropagationEdge>;
  /** edge の to-node（直接リンクされた対象） */
  readonly affectedNodeRefs: ReadonlyArray<string>;
  /** 崩れの後方（時間的に後）の候補対象（影響し得る・確定でない） */
  readonly downstreamImpactCandidates: ReadonlyArray<string>;
  /** 翌日への持ち越し候補（v0 [] = cross-day model 未実装） */
  readonly carryoverCandidates: ReadonlyArray<string>;
  /** propagation 判断の未解決材料（movement/ambiguous/decision/source — known surface にしない） */
  readonly unresolvedPropagationInputs: ReadonlyArray<string>;
  readonly missingInputs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly sourceRefs: {
    readonly dayGraphSnapshotId: string;
    readonly snapshotId: string;
    readonly feasibilityJudgmentId: string;
    readonly collapseRiskProfileId: string;
  };
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly trace: CollapsePropagationTrace;
}

export interface EvaluateCollapsePropagationInput {
  readonly graphSnapshot: RealityGraphSnapshotV0;
  readonly feasibilityJudgment: FeasibilityJudgmentV0;
  readonly collapseRiskProfile: CollapseRiskProfileV0;
}

interface SubjWindow {
  readonly start: number;
  readonly end: number;
}

function subjWindow(ern: EventRealityNodeV0): SubjWindow | null {
  const s = toSubjectiveMin(ern.timeWindow.startHHMM);
  const e = toSubjectiveMin(ern.timeWindow.endHHMM);
  if (s === null || e === null || e < s) return null; // boundary 跨ぎ/parse 不能は propagation 判定から除外
  return { start: s, end: e };
}

const RELATION_KIND_TO_MODE: Record<string, string> = {
  confirmed_time_conflict: "time_conflict_confirmed",
  inferred_time_tension: "time_tension_inferred",
};

const MOVEMENT_UNRESOLVED_MODES: ReadonlySet<string> = new Set(["movement_unresolved", "eta_unresolved", "leave_by_unresolved"]);

export function evaluateCollapsePropagation(input: EvaluateCollapsePropagationInput): CollapsePropagationMapV0 {
  const snapshot = input.graphSnapshot;
  const fj = input.feasibilityJudgment;
  const crp = input.collapseRiskProfile;
  // 整合性 guard（同一 snapshot / fj 由来か）
  if (fj.sourceRefs.snapshotId !== snapshot.snapshotId) {
    throw new Error("evaluateCollapsePropagation: feasibilityJudgment と graphSnapshot の snapshotId が食い違う");
  }
  if (crp.sourceRefs.snapshotId !== snapshot.snapshotId) {
    throw new Error("evaluateCollapsePropagation: collapseRiskProfile と graphSnapshot の snapshotId が食い違う");
  }
  if (crp.sourceRefs.feasibilityJudgmentId !== fj.judgmentTrace.judgmentId) {
    throw new Error("evaluateCollapsePropagation: collapseRiskProfile が別の feasibilityJudgment 由来");
  }

  const dgsId = snapshot.sourceRefs.dayGraphSnapshotId;
  const ernById = new Map<string, EventRealityNodeV0>();
  for (const e of snapshot.eventRealityNodes) ernById.set(e.eventRealityNodeId, e);
  const winById = new Map<string, SubjWindow | null>();
  const winOf = (id: string): SubjWindow | null => {
    if (!winById.has(id)) winById.set(id, ((): SubjWindow | null => { const e = ernById.get(id); return e ? subjWindow(e) : null; })());
    return winById.get(id) ?? null;
  };
  /** subjStart が境界 t 以降の event（時間前方の候補対象） */
  const eventsStartingAtOrAfter = (t: number, excludeIds: ReadonlySet<string>): string[] =>
    snapshot.eventRealityNodes
      .filter((e) => !excludeIds.has(e.eventRealityNodeId))
      .filter((e) => { const w = winOf(e.eventRealityNodeId); return w !== null && w.start >= t; })
      .sort((a, b) => (winOf(a.eventRealityNodeId)!.start - winOf(b.eventRealityNodeId)!.start))
      .map((e) => e.eventRealityNodeId);

  const edgesById = new Map<string, CollapsePropagationEdge>();
  const addEdge = (e: CollapsePropagationEdge): void => {
    if (!edgesById.has(e.edgeId)) edgesById.set(e.edgeId, e);
  };
  const buildEdge = (
    edgeKind: PropagationEdgeKind,
    fromNodeId: string,
    toNodeId: string,
    resolved: boolean,
    sourceFailureModes: ReadonlyArray<string>,
    evidenceRefs: ReadonlyArray<string>,
    missingInputRefs: ReadonlyArray<string>,
  ): CollapsePropagationEdge => ({
    edgeId: `pedge:${edgeKind}:${fromNodeId}->${toNodeId}`, // directional・NOT sorted
    edgeKind,
    fromNodeId,
    toNodeId,
    direction: "forward",
    sourceFailureModes,
    resolved,
    evidenceRefs,
    missingInputRefs,
    sourceRefs: { dayGraphSnapshotId: dgsId },
  });

  const downstream = new Set<string>();
  const unresolvedInputs = new Set<string>();
  const failureModeRefs = new Set<string>();
  let hasConflictSurface = false;
  let maxConflictReach = -1; // 0 → local / 1 → downstream / ≥2 → day_scope

  // ── 1. confirmed/inferred time conflict → known surface（directional earlier→later + 後続 adjacent）──
  const relations = fj.judgmentTrace.timeRelations;
  for (const rel of relations) {
    if (rel.relationKind === "exact_time_collision_ambiguous") {
      // ambiguous は causality にしない（edge を作らない・known surface にしない）→ 未解決のみ
      unresolvedInputs.add(`ambiguous:${rel.relationId}`);
      continue;
    }
    const mode = RELATION_KIND_TO_MODE[rel.relationKind];
    if (!mode) continue;
    const wa = winOf(rel.fromEventRealityNodeId);
    const wb = winOf(rel.toEventRealityNodeId);
    if (!wa || !wb) continue; // boundary 跨ぎは propagation から除外
    failureModeRefs.add(mode);
    hasConflictSurface = true;
    const earlier = wa.start <= wb.start ? rel.fromEventRealityNodeId : rel.toEventRealityNodeId;
    const later = earlier === rel.fromEventRealityNodeId ? rel.toEventRealityNodeId : rel.fromEventRealityNodeId;
    const evid = [`${earlier}#timeWindow`, `${later}#timeWindow`, `relation:${rel.relationId}`];
    // 対の directional 解釈（earlier 崩れ → later 影響）。conflict 自体の対称関係は relationRefs で別途保持
    addEdge(buildEdge("time_relation_edge", earlier, later, true, [mode], evid, []));
    // 後続（pair window の後）への adjacent edge
    const pairEnd = Math.max(wa.end, wb.end);
    const laterEvents = eventsStartingAtOrAfter(pairEnd, new Set([rel.fromEventRealityNodeId, rel.toEventRealityNodeId]));
    for (const z of laterEvents) downstream.add(z);
    if (laterEvents.length > 0) {
      const next = laterEvents[0]!;
      addEdge(buildEdge("adjacent_event_order_edge", later, next, true, [mode], [`${later}#timeWindow`, `${next}#timeWindow`], []));
    }
    maxConflictReach = Math.max(maxConflictReach, laterEvents.length);
  }

  // ── 2. movement/ETA/leaveBy unresolved → 候補 edge（resolved:false・delay 確定にしない）+ 未解決 ──
  for (const fm of crp.failureModes) {
    if (!MOVEMENT_UNRESOLVED_MODES.has(fm.mode) || !fm.targetNodeId) continue;
    failureModeRefs.add(fm.mode);
    unresolvedInputs.add(`${fm.mode}:${fm.targetNodeId}`);
    const w = winOf(fm.targetNodeId);
    if (!w) continue;
    const laterEvents = eventsStartingAtOrAfter(w.end, new Set([fm.targetNodeId]));
    if (laterEvents.length > 0) {
      const next = laterEvents[0]!;
      addEdge(
        buildEdge("unresolved_movement_edge", fm.targetNodeId, next, false, [fm.mode], [...fm.evidenceRefs, `${next}#timeWindow`], fm.missingInputRefs),
      );
      // movement は candidate（unresolved）= known surface にしない → downstream には足すが maxConflictReach は据え置き
    }
  }

  // ── 3. decision/boundary は v0 で edge を作れない（dependency/分類モデル未実装）→ 未解決のみ ──
  for (const fm of crp.failureModes) {
    if (fm.mode === "decision_unresolved" || fm.mode === "boundary_spanning_unsupported") {
      failureModeRefs.add(fm.mode);
      unresolvedInputs.add(`${fm.mode}:${fm.targetNodeId ?? ""}`);
    }
  }

  const propagationEdges = [...edgesById.values()].sort((a, b) => a.edgeId.localeCompare(b.edgeId));
  const affectedNodeRefs = [...new Set(propagationEdges.map((e) => e.toNodeId))].sort();
  const downstreamImpactCandidates = [...downstream].sort();
  const unresolvedPropagationInputs = [...unresolvedInputs].sort();

  // propagationLevel = known surface（conflict 由来のみ）/ 無 + 未解決 → unknown / それも無 → none
  const propagationLevel: PropagationLevel = hasConflictSurface
    ? maxConflictReach >= 2
      ? "day_scope"
      : maxConflictReach === 1
        ? "downstream"
        : "local"
    : unresolvedPropagationInputs.length > 0
      ? "unknown"
      : "none";

  const collapseRiskProfileId = crp.trace.collapseRiskId;
  const feasibilityJudgmentId = fj.judgmentTrace.judgmentId;
  const collapsePropagationId = `cprop:${fnv1a64Hex(
    canonicalSerialize({ s: snapshot.snapshotId, fj: feasibilityJudgmentId, cr: collapseRiskProfileId, k: "collapse_propagation", v: COLLAPSE_PROPAGATION_VERSION }),
  )}`;

  const usedInputRefs = [...new Set(propagationEdges.flatMap((e) => e.evidenceRefs))].sort();
  const relationRefs = [...new Set(relations.map((r) => r.relationId))].sort();

  const trace: CollapsePropagationTrace = {
    schemaVersion: 0,
    collapsePropagationId,
    collapsePropagationVersion: COLLAPSE_PROPAGATION_VERSION,
    graphBaseId: snapshot.graphBaseId,
    snapshotId: snapshot.snapshotId,
    feasibilityJudgmentId,
    collapseRiskProfileId,
    usedInputRefs,
    failureModeRefs: [...failureModeRefs].sort(),
    relationRefs,
    affectedNodeRefs,
    missingInputRefs: crp.missingInputRefs, // carry（source trace 不失）
    evidenceRefs: ["collapse_propagation_map_v0"],
    evaluatedAtInstant: fj.judgmentTrace.evaluatedAtInstant,
  };

  return {
    schemaVersion: 0,
    propagationLevel,
    propagationEdges,
    affectedNodeRefs,
    downstreamImpactCandidates,
    carryoverCandidates: [], // v0: cross-day model 未実装
    unresolvedPropagationInputs,
    missingInputs: crp.missingInputs, // carry
    missingInputRefs: crp.missingInputRefs, // carry
    sourceRefs: { dayGraphSnapshotId: dgsId, snapshotId: snapshot.snapshotId, feasibilityJudgmentId, collapseRiskProfileId },
    evidenceRefs: ["collapse_propagation_map_v0"],
    trace,
  };
}

const PROPAGATION_LEVELS: ReadonlySet<string> = new Set(["none", "local", "downstream", "day_scope", "unknown"]);

/** map の構造健全性検証（空 = 適合）。fixture / 監査が使用 */
export function collapsePropagationViolations(m: CollapsePropagationMapV0): string[] {
  const out: string[] = [];
  if (!PROPAGATION_LEVELS.has(m.propagationLevel)) out.push(`propagation: propagationLevel 不正 "${m.propagationLevel}"`);
  if (!m.trace.collapsePropagationId) out.push("propagation: collapsePropagationId が空");
  if (!m.trace.feasibilityJudgmentId) out.push("propagation: feasibilityJudgmentId が空");
  if (!m.trace.collapseRiskProfileId) out.push("propagation: collapseRiskProfileId が空");
  // directional edge は sorted でない（from→to を保持・id に方向）
  for (const e of m.propagationEdges) {
    if (e.edgeId !== `pedge:${e.edgeKind}:${e.fromNodeId}->${e.toNodeId}`) out.push(`propagation: edge "${e.edgeId}" の id が directional 規約に反する`);
    if (e.fromNodeId === e.toNodeId) out.push(`propagation: edge "${e.edgeId}" が自己ループ`);
    if (e.evidenceRefs.length === 0) out.push(`propagation: edge "${e.edgeId}" の evidenceRefs 欠落`);
    if (!e.sourceRefs.dayGraphSnapshotId) out.push(`propagation: edge "${e.edgeId}" の sourceRefs 欠落`);
  }
  // known surface（local/downstream/day_scope）は conflict 由来 resolved edge が要る（movement だけで surface にしない）
  if (m.propagationLevel === "downstream" || m.propagationLevel === "day_scope" || m.propagationLevel === "local") {
    if (!m.propagationEdges.some((e) => e.resolved && e.edgeKind === "time_relation_edge")) {
      out.push("propagation: known surface なのに conflict 由来 resolved edge が無い（movement/未解決で surface 化の疑い）");
    }
  }
  for (const r of m.missingInputRefs) {
    if (!r.sourceNodeId || !r.dedupeKey) out.push(`propagation: missingInputRef "${r.code}" の source trace 欠落`);
  }
  return out;
}
