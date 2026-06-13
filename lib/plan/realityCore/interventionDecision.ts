/**
 * InterventionDecisionV0 — RC2c-2 介入判断の内部状態（silent/observe/ask/internal_prepare/blocked）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md / CEO RC2c-2 GO（2026-06-13）
 *
 * 思想（抑制 = restraint の層）: Eligibility（何が許されるか）を受けて、**今この瞬間に黙るべきか / 観測すべきか /
 *   確認を求めるべきか / 内部準備まで許されるか / ブロックすべきか**を決める内部状態。
 *   **ユーザー向け文面生成でも通知でも提案生成でもない**。「介入できる」≠「今介入する」。
 *
 * 不変条件（CEO）:
 *   - **decisionKind は eligibility.actionBoundary を超えない**（cap）: blocked→blocked / display_only→observe まで /
 *     draft_only→internal_prepare まで / ask_confirmation→ask_clarification まで。
 *   - **silent と observe を混同しない**: silent = 何もしない・再評価なし（or 外部 trigger 待ち）/ observe = 出さないが
 *     再評価条件（nextEvaluationAt / reevaluationTrigger / stopCondition）を持つ。
 *   - high risk だから通知にしない / infeasible だから提案にしない / **unknown だから勝手に聞くに寄せすぎない**
 *     （実質的理由＝confirmed gate/ambiguity/infeasible が無ければ ask せず observe）。
 *   - exact_time_collision_ambiguous → ask_clarification or observe（move/skip 提案にしない）。
 *   - sourceRevisionPending only → observe（即 ask/通知にしない）。
 *   - **gate（otherPeople/reservation/payment/work/sensitive）下では internal_prepare-to-action しない**
 *     （gate あれば ask_clarification or observe/blocked。internal_prepare は gate 無し時のみ）。
 *   - blocked なら internal_prepare 以上に進まない。display_only redaction gate を無視しない。
 *
 * 規律（CEO）: no user-facing copy / proposal / 3案 / 出発線 / intervention ladder / notification / action /
 *   automatic schedule change / send message / booking・payment / external communication / DB write / API / localStorage /
 *   location / LLM 推定。contactPolicy / deliveryModeCeiling は**将来の接触上限**であって配信命令ではない（v0 は配信しない）。
 *   pure（I/O・時刻 API・乱数なし）。INTERVENTION_DECISION_VERSION は graph manifest と独立。
 */

import type { RealityGraphSnapshotV0 } from "./realityGraphSnapshot";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { MissingInputRef } from "./momentSnapshot";
import type { RealityInstant } from "./realityInstant";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import { toSubjectiveMin } from "@/lib/plan/dayState/timeOfDay";
import type { FeasibilityJudgmentV0, FeasibilityReason, JudgmentConfidence } from "./feasibilityJudgment";
import type { CollapseRiskProfileV0 } from "./collapseRisk";
import type { CollapsePropagationMapV0 } from "./collapsePropagation";
import type { InterventionEligibilityV0, ActionBoundary } from "./interventionEligibility";
import { targetScopeKey, type TargetScope } from "./realityJudgmentInput";

export const INTERVENTION_DECISION_VERSION = 0;

/** 介入判断の内部状態。exposure 順: silent < observe < internal_prepare(無接触) < ask_clarification(接触) */
export type DecisionKind = "silent" | "observe" | "ask_clarification" | "internal_prepare" | "blocked";
/** 将来の接触上限（v0 は配信しない・実配信命令ではない） */
export type ContactPolicy = "none" | "internal_only" | "ask_permission_required" | "blocked";
/** 将来の配信モード上限（v0 は active_prompt/push/external に進まない） */
export type DeliveryModeCeiling = "none" | "passive_surface" | "active_prompt";

export interface InterventionDecisionTrace {
  readonly schemaVersion: 0;
  readonly decisionId: string;
  readonly decisionVersion: number;
  readonly graphBaseId: string;
  readonly snapshotId: string;
  readonly feasibilityJudgmentId: string;
  readonly collapseRiskProfileId: string;
  readonly collapsePropagationId: string;
  readonly eligibilityId: string;
  readonly usedInputRefs: ReadonlyArray<string>;
  readonly eligibilityRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly evaluatedAtInstant: RealityInstant;
}

export interface InterventionDecisionV0 {
  readonly schemaVersion: 0;
  readonly decisionKind: DecisionKind;
  readonly contactPolicy: ContactPolicy;
  readonly deliveryModeCeiling: DeliveryModeCeiling;
  /** eligibility から carry した ceiling（decision はこれを超えない） */
  readonly actionBoundary: ActionBoundary;
  readonly targetScope: TargetScope;
  readonly targetNodeId: string | null;
  /** 今介入を後押しした要素（confirmed gate / ambiguity / infeasible / collapse 等） */
  readonly whyNowFactors: ReadonlyArray<FeasibilityReason>;
  /** 今介入を控えた要素（boundary cap / 実質理由なし / unknown は ask に寄せない 等） */
  readonly whyNotFactors: ReadonlyArray<FeasibilityReason>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly confirmationReasons: ReadonlyArray<FeasibilityReason>;
  readonly blockedReasons: ReadonlyArray<FeasibilityReason>;
  /** observe のみ: 再評価する主観分（次の fixed event 等）。それ以外は null */
  readonly nextEvaluationAt: number | null;
  /** observe のみ: 再評価の trigger。silent/その他は null */
  readonly reevaluationTrigger: string | null;
  /** observe のみ: 観測を止める条件。silent/その他は null */
  readonly stopCondition: string | null;
  readonly sourceRefs: {
    readonly dayGraphSnapshotId: string;
    readonly snapshotId: string;
    readonly feasibilityJudgmentId: string;
    readonly collapseRiskProfileId: string;
    readonly collapsePropagationId: string;
    readonly eligibilityId: string;
  };
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly confidence: JudgmentConfidence;
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly trace: InterventionDecisionTrace;
}

export interface EvaluateInterventionDecisionInput {
  readonly graphSnapshot: RealityGraphSnapshotV0;
  readonly feasibilityJudgment: FeasibilityJudgmentV0;
  readonly collapseRiskProfile: CollapseRiskProfileV0;
  readonly collapsePropagationMap: CollapsePropagationMapV0;
  readonly interventionEligibility: InterventionEligibilityV0;
}

function reason(code: string, targetNodeId: string | null, evidenceRefs: ReadonlyArray<string>): FeasibilityReason {
  return { code, targetNodeId, evidenceRefs };
}

// exposure rank
const RANK = { silent: 0, observe: 1, internal_prepare: 2, ask_clarification: 3 } as const;
function rankToKind(rank: number): Exclude<DecisionKind, "blocked"> {
  return rank >= 3 ? "ask_clarification" : rank === 2 ? "internal_prepare" : rank === 1 ? "observe" : "silent";
}
/** boundary が許す decisionKind の上限 rank。blocked は -1（blocked 専用） */
function capRankFor(boundary: ActionBoundary): number {
  switch (boundary) {
    case "blocked":
      return -1;
    case "display_only":
      return RANK.observe; // 1
    case "draft_only":
      return RANK.internal_prepare; // 2
    case "ask_confirmation":
      return RANK.ask_clarification; // 3
    default:
      // v0 で write_anchor 以上は eligibility が天井にしない（来たら ask_clarification まで保守 cap）
      return RANK.ask_clarification;
  }
}

/** clarification（ユーザーに聞く）を正当化する confirmation code = confirmed gate + ambiguity + infeasible + external */
const CLARIFY_CODES: ReadonlySet<string> = new Set([
  "other_people_involved",
  "reservation_or_payment",
  "work_or_shift",
  "sensitive_flagged",
  "exact_time_collision_ambiguous",
  "feasibility_infeasible",
  "external_communication_required",
]);
/** gate code（present or unverified）。下では internal_prepare-to-action しない */
const GATE_CODES: ReadonlySet<string> = new Set([
  "other_people_involved",
  "other_people_unverified",
  "reservation_or_payment",
  "reservation_or_payment_unverified",
  "work_or_shift",
  "work_or_shift_unverified",
  "sensitive_flagged",
]);

export function evaluateInterventionDecision(input: EvaluateInterventionDecisionInput): InterventionDecisionV0 {
  const snapshot = input.graphSnapshot;
  const fj = input.feasibilityJudgment;
  const crp = input.collapseRiskProfile;
  const prop = input.collapsePropagationMap;
  const elig = input.interventionEligibility;

  // ── 整合性 guard（同一 snapshot / chain 由来か）──
  if (fj.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("evaluateInterventionDecision: feasibilityJudgment snapshotId 不一致");
  if (crp.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("evaluateInterventionDecision: collapseRiskProfile snapshotId 不一致");
  if (prop.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("evaluateInterventionDecision: collapsePropagationMap snapshotId 不一致");
  if (elig.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("evaluateInterventionDecision: interventionEligibility snapshotId 不一致");
  if (elig.sourceRefs.feasibilityJudgmentId !== fj.judgmentTrace.judgmentId) throw new Error("evaluateInterventionDecision: eligibility が別 feasibilityJudgment 由来");
  if (elig.sourceRefs.collapseRiskProfileId !== crp.trace.collapseRiskId) throw new Error("evaluateInterventionDecision: eligibility が別 collapseRiskProfile 由来");
  if (elig.sourceRefs.collapsePropagationId !== prop.trace.collapsePropagationId) throw new Error("evaluateInterventionDecision: eligibility が別 collapsePropagationMap 由来");

  const scope = elig.targetScope;
  const targetNodeId = elig.targetNodeId;
  const boundary = elig.actionBoundary;
  const capRank = capRankFor(boundary);

  const confCodes = new Set(elig.confirmationReasons.map((r) => r.code));
  const clarificationWarranted = [...confCodes].some((c) => CLARIFY_CODES.has(c));
  const anyGate = [...confCodes].some((c) => GATE_CODES.has(c));
  const collapseActive = crp.riskLevel === "elevated" || crp.riskLevel === "high";
  const sourcePending = fj.judgmentTrace.sourcesRevisionPending || fj.judgmentTrace.sourceRecordRevisionPending;
  const hasUnresolved = fj.unresolvedCriticalInputs.length > 0 || crp.hasUnresolvedRiskInputs;
  const propagationActive = prop.propagationLevel !== "none";
  const upcoming = new Set([
    ...snapshot.momentSnapshot.relevantNodes.activeEventNodeIds,
    ...snapshot.momentSnapshot.relevantNodes.upcomingEventNodeIds,
  ]);
  const hasUpcoming = upcoming.size > 0;

  // ── decisionKind（warranted を boundary cap で制限）──
  const whyNowFactors: FeasibilityReason[] = [];
  const whyNotFactors: FeasibilityReason[] = [];
  let decisionKind: DecisionKind;

  if (elig.eligibilityLevel === "blocked" || boundary === "blocked") {
    decisionKind = "blocked";
    whyNotFactors.push(reason("eligibility_blocked", targetNodeId, ["eligibility:blocked", ...elig.blockedReasons.flatMap((r) => r.evidenceRefs).slice(0, 6)]));
  } else {
    // **prepare は gate 無し時のみ**（gate 下では internal_prepare-to-action しない）
    const prepareWarranted = collapseActive && !anyGate;
    const watchWarranted =
      collapseActive || hasUnresolved || propagationActive || anyGate || confCodes.size > 0 || (sourcePending && hasUpcoming);

    let warrantedRank: number;
    if (clarificationWarranted) warrantedRank = RANK.ask_clarification;
    else if (prepareWarranted) warrantedRank = RANK.internal_prepare;
    else if (watchWarranted) warrantedRank = RANK.observe;
    else warrantedRank = RANK.silent;

    const finalRank = Math.min(warrantedRank, capRank);
    decisionKind = rankToKind(finalRank);

    // whyNow（後押し）
    if (clarificationWarranted) for (const r of elig.confirmationReasons) if (CLARIFY_CODES.has(r.code)) whyNowFactors.push(r);
    if (collapseActive) whyNowFactors.push(reason("collapse_risk_active", targetNodeId, [`collapse:riskLevel:${crp.riskLevel}`]));
    if (hasUnresolved) whyNowFactors.push(reason("unresolved_inputs", targetNodeId, ["feasibility:unresolved", "collapse:unresolved"]));
    if (propagationActive) whyNowFactors.push(reason("propagation_surface", targetNodeId, [`propagation:${prop.propagationLevel}`]));
    if (anyGate && !clarificationWarranted) whyNowFactors.push(reason("gate_unverified_watch", targetNodeId, [...confCodes].filter((c) => c.endsWith("_unverified")).slice(0, 4)));

    // whyNot（抑制）
    if (warrantedRank > finalRank) whyNotFactors.push(reason("capped_by_action_boundary", targetNodeId, [`boundary:${boundary}`]));
    if (elig.eligibilityLevel === "unknown") whyNotFactors.push(reason("permission_unknown_no_ask", targetNodeId, ["eligibility:unknown"])); // unknown は ask に寄せない
    if (anyGate && !clarificationWarranted) whyNotFactors.push(reason("gate_unverified_not_overasked", targetNodeId, ["gate_unverified_observe_not_ask"]));
    if (sourcePending) whyNotFactors.push(reason("source_revision_pending", targetNodeId, ["sources_revision_pending"])); // confidence を下げる・permission は緩めない
    if (warrantedRank === RANK.silent && finalRank === RANK.silent) whyNotFactors.push(reason("no_actionable_signal", targetNodeId, ["nothing_to_do"]));
  }

  // ── contactPolicy / deliveryModeCeiling（将来の上限・v0 は配信しない）──
  const contactPolicy: ContactPolicy =
    decisionKind === "blocked" ? "blocked" : decisionKind === "ask_clarification" ? "ask_permission_required" : decisionKind === "internal_prepare" ? "internal_only" : "none";
  const deliveryModeCeiling: DeliveryModeCeiling = decisionKind === "ask_clarification" ? "passive_surface" : "none"; // v0: active_prompt/push/external なし

  // ── observe の再評価条件 / silent は再評価なし ──
  let nextEvaluationAt: number | null = null;
  let reevaluationTrigger: string | null = null;
  let stopCondition: string | null = null;
  if (decisionKind === "observe") {
    const nextFixedId = snapshot.momentSnapshot.relevantNodes.nextFixedEventNodeIds[0];
    const nextErn = nextFixedId ? snapshot.eventRealityNodes.find((e: EventRealityNodeV0) => e.eventRealityNodeId === nextFixedId) : undefined;
    nextEvaluationAt = nextErn ? toSubjectiveMin(nextErn.timeWindow.startHHMM) : null;
    reevaluationTrigger = hasUnresolved
      ? "critical_input_resolved_or_minute_tick"
      : collapseActive || propagationActive
        ? "risk_or_propagation_change_or_minute_tick"
        : sourcePending
          ? "source_revision_available_or_minute_tick"
          : "snapshot_change_or_minute_tick";
    stopCondition = "target_resolved_or_past_or_day_end";
  }

  // ── confidence = evidence completeness（permission を緩めない・eligibility の confidence を carry/踏襲）──
  const confidence: JudgmentConfidence = elig.confidence;

  const decisionId = `idec:${fnv1a64Hex(
    canonicalSerialize({ s: snapshot.snapshotId, el: elig.trace.eligibilityId, scope: targetScopeKey(scope), k: "intervention_decision", v: INTERVENTION_DECISION_VERSION }),
  )}`;
  const eligibilityRefs = [elig.trace.eligibilityId, `eligibilityLevel:${elig.eligibilityLevel}`, `actionBoundary:${boundary}`];
  const evidenceList = [...new Set([...whyNowFactors, ...whyNotFactors].flatMap((r) => r.evidenceRefs))].sort();

  const trace: InterventionDecisionTrace = {
    schemaVersion: 0,
    decisionId,
    decisionVersion: INTERVENTION_DECISION_VERSION,
    graphBaseId: snapshot.graphBaseId,
    snapshotId: snapshot.snapshotId,
    feasibilityJudgmentId: fj.judgmentTrace.judgmentId,
    collapseRiskProfileId: crp.trace.collapseRiskId,
    collapsePropagationId: prop.trace.collapsePropagationId,
    eligibilityId: elig.trace.eligibilityId,
    usedInputRefs: [...new Set([...whyNowFactors, ...whyNotFactors].map((r) => r.code))].sort(),
    eligibilityRefs,
    evidenceRefs: evidenceList,
    missingInputRefs: elig.missingInputRefs, // carry（source trace 不失）
    evaluatedAtInstant: fj.judgmentTrace.evaluatedAtInstant,
  };

  return {
    schemaVersion: 0,
    decisionKind,
    contactPolicy,
    deliveryModeCeiling,
    actionBoundary: boundary, // carry した ceiling（超えない）
    targetScope: scope,
    targetNodeId,
    whyNowFactors,
    whyNotFactors,
    missingInputRefs: elig.missingInputRefs,
    confirmationReasons: elig.confirmationReasons, // carry
    blockedReasons: elig.blockedReasons, // carry
    nextEvaluationAt,
    reevaluationTrigger,
    stopCondition,
    sourceRefs: {
      dayGraphSnapshotId: snapshot.sourceRefs.dayGraphSnapshotId,
      snapshotId: snapshot.snapshotId,
      feasibilityJudgmentId: fj.judgmentTrace.judgmentId,
      collapseRiskProfileId: crp.trace.collapseRiskId,
      collapsePropagationId: prop.trace.collapsePropagationId,
      eligibilityId: elig.trace.eligibilityId,
    },
    evidenceRefs: evidenceList,
    confidence,
    displayPolicy: decisionKind === "blocked" || decisionKind === "silent" ? "notActionable" : "visible",
    trace,
  };
}

const DECISION_KINDS: ReadonlySet<string> = new Set(["silent", "observe", "ask_clarification", "internal_prepare", "blocked"]);

/** decision の構造健全性検証（空 = 適合）。fixture / 監査が使用 */
export function interventionDecisionViolations(d: InterventionDecisionV0): string[] {
  const out: string[] = [];
  if (!DECISION_KINDS.has(d.decisionKind)) out.push(`decision: decisionKind 不正 "${d.decisionKind}"`);
  // boundary ceiling を超えない
  const rank = d.decisionKind === "blocked" ? -1 : RANK[d.decisionKind];
  const cap = capRankFor(d.actionBoundary);
  if (d.decisionKind !== "blocked" && rank > cap) out.push(`decision: decisionKind "${d.decisionKind}" が actionBoundary "${d.actionBoundary}" の cap を超える`);
  // blocked boundary なら blocked
  if (d.actionBoundary === "blocked" && d.decisionKind !== "blocked") out.push("decision: blocked boundary なのに blocked でない");
  // observe は再評価条件を持つ / silent は持たない（silent ≠ observe）
  if (d.decisionKind === "observe" && !d.reevaluationTrigger && d.nextEvaluationAt === null) out.push("decision: observe なのに再評価条件（trigger/nextEvaluationAt）が無い");
  if (d.decisionKind === "observe" && !d.stopCondition) out.push("decision: observe なのに stopCondition が無い");
  if (d.decisionKind === "silent" && (d.reevaluationTrigger || d.stopCondition || d.nextEvaluationAt !== null)) out.push("decision: silent なのに再評価条件を持つ（observe と混同）");
  // silent は no contact / blocked は no contact
  if ((d.decisionKind === "silent" || d.decisionKind === "blocked") && d.contactPolicy !== "none" && d.contactPolicy !== "blocked") out.push("decision: silent/blocked なのに contact がある");
  // v0: deliveryModeCeiling は active_prompt 以上にしない
  if (d.deliveryModeCeiling === "active_prompt") out.push("decision: v0 で deliveryModeCeiling active_prompt にしている");
  return out;
}
