/**
 * InterventionEligibilityV0 — RC2c-1 「どこまで介入してよいか」action boundary（pure core 限定）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md（§2 提案境界 / §1 safetyFlags）/ CEO RC2c-1 GO（2026-06-13）
 *
 * 思想（安全の背骨）: **現実を読んだ結果（Feasibility/CollapseRisk/Propagation）は、行動の許可ではない**。
 *   high risk でも infeasible でも**自動実行・自動変更しない**。これは提案生成ではなく、提案・変更・連絡・実行の
 *   前に通す **eligibility / action boundary** 層（Aneurasync 哲学「AI は提案・実行候補まで、最終決定はユーザー」の機械化）。
 *
 * 不変条件（CEO・default-deny）:
 *   - **unknown → allowed にしない**（permission/材料が不明なら許可しない）
 *   - otherPeople possible → requires_confirmation 以上 / reservation・payment → blocked or requires_confirmation /
 *     work・shift → requires_confirmation 以上 / external communication → requires_confirmation 以上 / sensitive → 強 gate
 *   - exact_time_collision_ambiguous → ask_clarification / observe（**自動 move/skip しない**）
 *   - sourceRevisionPending → confidence を下げるが **permission を緩めない**
 *   - permission missing → blocked or unknown / high collapse risk・infeasible → 介入候補の材料であって**実行許可ではない**
 *   - memory/correction で confirmation requirement を消さない（v0 は memory 未入力 = 構造的に消せない）
 *   - display_only でも **redaction / evidence visibility gate** を通す
 *
 * 意味論の固定（RC2c-1A）:
 *   - **eligibilityLevel=allowed は action permission ではない**。**actionBoundary=draft_only は将来の最大境界**であり
 *     RC2c-1 は draft も提案文も生成しない（no proposal / user-facing copy / message draft / schedule draft）。
 *     write_anchor / send_message / book_pay / external_communication は常に不可。draft_only を UI/実行層へ直結しない。
 *   - **sensitiveFlagged=false は「未検出 / 未確認」であって confirmed safe ではない**（false を allowed の根拠にしない）。
 *   - **unknown 系 gate（otherPeople/reservation/work が unknown or missing）を false 扱いしない**。不在を確認できない
 *     限り gate engaged（*_unverified reason → requires_confirmation）。allowed は全 gate confirmed-absent の時のみ。
 *   - **display permission と action permission を分ける**。display_only は「全部表示してよい」ではなく per-viewer
 *     redaction / evidence visibility gate を要する。evidenceRefs は **field 識別子のみ**で raw content を含まない。
 *
 * 規律（CEO）: no action / proposal / 3案 / 出発線 / intervention ladder / notification / user-facing copy /
 *   automatic schedule change / send message / booking・payment / external communication / DB write / API / localStorage /
 *   location / LLM 推定。v0 で write_anchor / send_message / book_pay / external_communication は actionBoundary 天井に
 *   しない（必ず requires_confirmation/blocked 側）。全 reason に field-level evidenceRefs。
 *   pure（I/O・時刻 API・乱数なし）。INTERVENTION_ELIGIBILITY_VERSION は graph manifest と独立。
 */

import type { RealityGraphSnapshotV0 } from "./realityGraphSnapshot";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { CommitmentSignalV0 } from "./commitmentSignal";
import type { MissingInputRef } from "./momentSnapshot";
import type { RealityAttribute } from "./realityAttribute";
import type { RealityInstant } from "./realityInstant";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import type { FeasibilityJudgmentV0, FeasibilityReason, JudgmentConfidence } from "./feasibilityJudgment";
import type { CollapseRiskProfileV0 } from "./collapseRisk";
import type { CollapsePropagationMapV0 } from "./collapsePropagation";
import { targetScopeKey, type TargetScope } from "./realityJudgmentInput";

export const INTERVENTION_ELIGIBILITY_VERSION = 0;

export type EligibilityLevel = "allowed" | "requires_confirmation" | "blocked" | "unknown";

/** action 境界（提案・実行の上限）。v0 は write_anchor 以上を天井にしない */
export type ActionBoundary =
  | "display_only"
  | "draft_only"
  | "ask_confirmation"
  | "write_anchor"
  | "send_message"
  | "book_pay"
  | "external_communication"
  | "blocked";

export interface InterventionEligibilityV0 {
  readonly schemaVersion: 0;
  readonly targetScope: TargetScope;
  readonly targetNodeId: string | null;
  readonly eligibilityLevel: EligibilityLevel;
  // ── 提案してよい intervention shape（提案そのものではない・後続 RJ2 の eligibility 面）──
  readonly canSuggestMove: boolean;
  readonly canSuggestShorten: boolean;
  readonly canSuggestSkip: boolean;
  readonly canSuggestDelegate: boolean;
  readonly canSuggestAskClarification: boolean;
  readonly canSuggestPrepare: boolean;
  readonly canSuggestObserve: boolean;
  readonly requiresConfirmation: boolean;
  readonly requiresExternalCommunication: boolean;
  readonly blockedReasons: ReadonlyArray<FeasibilityReason>;
  readonly confirmationReasons: ReadonlyArray<FeasibilityReason>;
  readonly actionBoundary: ActionBoundary;
  /** display でも redaction gate を通す（v0 構造保証: evaluator は redact 済み displayLabel/id のみ参照・raw text 不接触） */
  readonly displayRedactionRequired: boolean;
  readonly missingInputs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly sourceRefs: {
    readonly dayGraphSnapshotId: string;
    readonly snapshotId: string;
    readonly feasibilityJudgmentId: string;
    readonly collapseRiskProfileId: string;
    readonly collapsePropagationId: string;
  };
  readonly evidenceRefs: ReadonlyArray<string>;
  /** evidence completeness（成功確率でない・permission を緩めない）。sourceRevisionPending で high にしない */
  readonly confidence: JudgmentConfidence;
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly trace: EligibilityTrace;
}

export interface EligibilityTrace {
  readonly schemaVersion: 0;
  readonly eligibilityId: string;
  readonly eligibilityVersion: number;
  readonly graphBaseId: string;
  readonly snapshotId: string;
  readonly feasibilityJudgmentId: string;
  readonly collapseRiskProfileId: string;
  readonly collapsePropagationId: string;
  readonly usedInputRefs: ReadonlyArray<string>;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly evaluatedAtInstant: RealityInstant;
}

export interface EvaluateInterventionEligibilityInput {
  readonly graphSnapshot: RealityGraphSnapshotV0;
  readonly feasibilityJudgment: FeasibilityJudgmentV0;
  readonly collapseRiskProfile: CollapseRiskProfileV0;
  readonly collapsePropagationMap: CollapsePropagationMapV0;
  readonly targetScope: TargetScope;
}

function reason(code: string, targetNodeId: string | null, evidenceRefs: ReadonlyArray<string>): FeasibilityReason {
  return { code, targetNodeId, evidenceRefs };
}

export function evaluateInterventionEligibility(input: EvaluateInterventionEligibilityInput): InterventionEligibilityV0 {
  const snapshot = input.graphSnapshot;
  const fj = input.feasibilityJudgment;
  const crp = input.collapseRiskProfile;
  const prop = input.collapsePropagationMap;
  const scope = input.targetScope;

  // ── 整合性 guard（同一 snapshot / chain / scope 由来か）──
  if (fj.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("evaluateInterventionEligibility: feasibilityJudgment の snapshotId 不一致");
  if (crp.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("evaluateInterventionEligibility: collapseRiskProfile の snapshotId 不一致");
  if (prop.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("evaluateInterventionEligibility: collapsePropagationMap の snapshotId 不一致");
  if (crp.sourceRefs.feasibilityJudgmentId !== fj.judgmentTrace.judgmentId) throw new Error("evaluateInterventionEligibility: collapseRiskProfile が別 feasibilityJudgment 由来");
  if (prop.sourceRefs.collapseRiskProfileId !== crp.trace.collapseRiskId) throw new Error("evaluateInterventionEligibility: collapsePropagationMap が別 collapseRiskProfile 由来");
  if (targetScopeKey(fj.judgmentTrace.targetScope) !== targetScopeKey(scope)) throw new Error("evaluateInterventionEligibility: feasibilityJudgment の targetScope 不一致");

  const csByTarget = new Map<string, CommitmentSignalV0>();
  for (const cs of snapshot.commitmentSignals) csByTarget.set(cs.targetNodeId, cs);

  // ── 対象 event 群（event scope = 1 件 / day scope = active+upcoming・最も restrictive に集約）──
  let targetErns: EventRealityNodeV0[];
  let targetNodeId: string | null;
  if (scope.kind === "event") {
    const t = snapshot.eventRealityNodes.find((e) => e.eventRealityNodeId === scope.eventRealityNodeId);
    targetErns = t ? [t] : [];
    targetNodeId = scope.eventRealityNodeId;
  } else {
    const ids = new Set([
      ...snapshot.momentSnapshot.relevantNodes.activeEventNodeIds,
      ...snapshot.momentSnapshot.relevantNodes.upcomingEventNodeIds,
    ]);
    targetErns = snapshot.eventRealityNodes.filter((e) => ids.has(e.eventRealityNodeId));
    targetNodeId = null;
  }

  // ── per-event の gate を集約（最も restrictive・default-deny）──
  const confirmationReasons: FeasibilityReason[] = [];
  const blockedReasons: FeasibilityReason[] = [];
  const usedRefs = new Set<string>();
  let otherPeoplePresent = false;
  let otherPeopleUnverified = false;
  let reservationPresent = false;
  let reservationUnverified = false;
  let workPresent = false;
  let workUnverified = false;
  let sensitiveFlagged = false;
  let permissionUnknown = false;
  let permissionBlocked = false;

  // gate は **confirmed-absent（status≠unknown ∧ value===false）の時のみ clear**。unknown/missing は不在を
  // 確認できない = default-deny で engaged（RC2c-1A #4: unknown gate を false 扱いして allowed に倒さない）。
  const gateState = (attr: RealityAttribute<boolean> | undefined): "present" | "absent" | "unverified" => {
    if (!attr) return "unverified";
    if (attr.value === true) return "present";
    if (attr.status !== "unknown" && attr.value === false) return "absent";
    return "unverified";
  };

  for (const ern of targetErns) {
    const id = ern.eventRealityNodeId;
    const cs = csByTarget.get(id);
    usedRefs.add(id);
    usedRefs.add(`${id}#permissionLevel`);
    usedRefs.add(`${id}#sensitiveFlagged`);

    const opRef = cs ? `${cs.commitmentSignalId}#otherPeoplePossible` : `${id}#otherPeoplePossible`;
    const op = gateState(cs?.otherPeoplePossible);
    if (op === "present") { otherPeoplePresent = true; confirmationReasons.push(reason("other_people_involved", id, [opRef, ...(cs?.otherPeoplePossible.evidenceRefs ?? [])])); }
    else if (op === "unverified") { otherPeopleUnverified = true; confirmationReasons.push(reason("other_people_unverified", id, [opRef, "absence_not_confirmed"])); }

    const rsRef = cs ? `${cs.commitmentSignalId}#reservationOrPaymentPossible` : `${id}#reservationOrPaymentPossible`;
    const rs = gateState(cs?.reservationOrPaymentPossible);
    if (rs === "present") { reservationPresent = true; confirmationReasons.push(reason("reservation_or_payment", id, [rsRef, ...(cs?.reservationOrPaymentPossible.evidenceRefs ?? [])])); }
    else if (rs === "unverified") { reservationUnverified = true; confirmationReasons.push(reason("reservation_or_payment_unverified", id, [rsRef, "absence_not_confirmed"])); }

    const wkRef = cs ? `${cs.commitmentSignalId}#workOrShiftPossible` : `${id}#workOrShiftPossible`;
    const wk = gateState(cs?.workOrShiftPossible);
    if (wk === "present") { workPresent = true; confirmationReasons.push(reason("work_or_shift", id, [wkRef, ...(cs?.workOrShiftPossible.evidenceRefs ?? [])])); }
    else if (wk === "unverified") { workUnverified = true; confirmationReasons.push(reason("work_or_shift_unverified", id, [wkRef, "absence_not_confirmed"])); }

    // sensitive flag: true → 強 gate。**false は未検出（neutral）= confirmed safe にしない**（reason を出さない・permission を緩める根拠にしない）。
    if (ern.sensitiveFlagged) { sensitiveFlagged = true; confirmationReasons.push(reason("sensitive_flagged", id, [`${id}#sensitiveFlagged`, "sensitive_derived_material"])); }

    if (ern.permissionLevel.status === "unknown") { permissionUnknown = true; blockedReasons.push(reason("permission_unknown", id, [`${id}#permissionLevel`, ...ern.permissionLevel.evidenceRefs])); }
    else if ((ern.permissionLevel.value ?? 0) <= 0) { permissionBlocked = true; blockedReasons.push(reason("permission_blocked", id, [`${id}#permissionLevel`, ...ern.permissionLevel.evidenceRefs])); }
  }

  // ── scope-level の reality signal（行動許可の材料であって許可ではない）──
  const hasAmbiguity = crp.failureModes.some((m) => m.mode === "exact_time_collision_ambiguous");
  const realityUnknown = fj.unresolvedCriticalInputs.length > 0;
  const collapseHigh = crp.riskLevel === "high";
  const feasInfeasible = fj.feasibilityStatus === "infeasible";
  const externalImplied = otherPeoplePresent || reservationPresent; // confirmed present のみ（unverified では external 断定しない）
  const sourcePending = fj.judgmentTrace.sourcesRevisionPending || fj.judgmentTrace.sourceRecordRevisionPending;
  const strongGatePresent = otherPeoplePresent || reservationPresent || workPresent || sensitiveFlagged;
  const gateUnverified = otherPeopleUnverified || reservationUnverified || workUnverified; // 不在を確認できない = allowed にしない

  if (hasAmbiguity) confirmationReasons.push(reason("exact_time_collision_ambiguous", targetNodeId, ["collapse:exact_time_collision_ambiguous"]));
  if (realityUnknown) confirmationReasons.push(reason("reality_unresolved", targetNodeId, fj.unresolvedCriticalInputs.flatMap((r) => r.evidenceRefs).slice(0, 8)));
  if (collapseHigh) confirmationReasons.push(reason("high_collapse_risk", targetNodeId, ["collapse:riskLevel:high"])); // 実行許可ではない
  if (feasInfeasible) confirmationReasons.push(reason("feasibility_infeasible", targetNodeId, ["feasibility:infeasible"])); // 自動変更にしない
  if (externalImplied) confirmationReasons.push(reason("external_communication_required", targetNodeId, ["external_communication_gate"]));

  // ── eligibilityLevel（default-deny の precedence）──
  let eligibilityLevel: EligibilityLevel;
  if (permissionBlocked) eligibilityLevel = "blocked";
  else if (permissionUnknown) eligibilityLevel = "unknown"; // unknown → allowed にしない
  else if (strongGatePresent || gateUnverified || hasAmbiguity || realityUnknown || collapseHigh || feasInfeasible || externalImplied) eligibilityLevel = "requires_confirmation";
  else eligibilityLevel = "allowed"; // 全 gate confirmed-absent ∧ permission ok ∧ clear のみ

  // ── actionBoundary（v0 天井 = ask_confirmation。write_anchor 以上は天井にしない・draft_only も生成しない）──
  const actionBoundary: ActionBoundary =
    eligibilityLevel === "blocked" ? "blocked" : eligibilityLevel === "unknown" ? "display_only" : eligibilityLevel === "requires_confirmation" ? "ask_confirmation" : "draft_only";

  // ── canSuggest（change 系は ambiguity / blocked / unknown / 未確認 gate で停止・safe shape は広く許す）──
  const reservationGated = reservationPresent || reservationUnverified;
  const workGated = workPresent || workUnverified;
  const noChange = eligibilityLevel === "blocked" || eligibilityLevel === "unknown" || hasAmbiguity;
  const canSuggestObserve = true; // observe は常に安全（行動しない）
  const canSuggestAskClarification = hasAmbiguity || realityUnknown || strongGatePresent || gateUnverified; // 不確実/gate 時に聞く
  const canSuggestPrepare = eligibilityLevel !== "blocked" && eligibilityLevel !== "unknown"; // prepare は schedule を変えない
  const canSuggestMove = !noChange;
  const canSuggestShorten = !noChange;
  const canSuggestSkip = !noChange && !reservationGated && !workGated; // 予約/勤務（present or 未確認）の skip は高 consequence → 不可
  const canSuggestDelegate = false; // v0: 他人への委譲 = 強 gate（外部）

  const requiresConfirmation = eligibilityLevel === "requires_confirmation";
  const requiresExternalCommunication = externalImplied;

  // ── confidence = evidence completeness（permission を緩めない・sourcePending で high にしない）──
  const lowCompleteness = permissionUnknown || realityUnknown;
  const confidence: JudgmentConfidence = lowCompleteness ? "low" : sourcePending ? "moderate" : "high";

  const eligibilityId = `elig:${fnv1a64Hex(
    canonicalSerialize({ s: snapshot.snapshotId, scope: targetScopeKey(scope), k: "intervention_eligibility", v: INTERVENTION_ELIGIBILITY_VERSION }),
  )}`;
  const evidenceList = [...new Set([...confirmationReasons, ...blockedReasons].flatMap((r) => r.evidenceRefs))].sort();

  const trace: EligibilityTrace = {
    schemaVersion: 0,
    eligibilityId,
    eligibilityVersion: INTERVENTION_ELIGIBILITY_VERSION,
    graphBaseId: snapshot.graphBaseId,
    snapshotId: snapshot.snapshotId,
    feasibilityJudgmentId: fj.judgmentTrace.judgmentId,
    collapseRiskProfileId: crp.trace.collapseRiskId,
    collapsePropagationId: prop.trace.collapsePropagationId,
    usedInputRefs: [...usedRefs].sort(),
    evidenceRefs: evidenceList,
    missingInputRefs: crp.missingInputRefs, // carry（source trace 不失）
    evaluatedAtInstant: fj.judgmentTrace.evaluatedAtInstant,
  };

  return {
    schemaVersion: 0,
    targetScope: scope,
    targetNodeId,
    eligibilityLevel,
    canSuggestMove,
    canSuggestShorten,
    canSuggestSkip,
    canSuggestDelegate,
    canSuggestAskClarification,
    canSuggestPrepare,
    canSuggestObserve,
    requiresConfirmation,
    requiresExternalCommunication,
    blockedReasons,
    confirmationReasons,
    actionBoundary,
    displayRedactionRequired: true, // 構造保証（redact 済み displayLabel/id のみ参照）
    missingInputs: crp.missingInputs, // carry
    missingInputRefs: crp.missingInputRefs, // carry
    sourceRefs: {
      dayGraphSnapshotId: snapshot.sourceRefs.dayGraphSnapshotId,
      snapshotId: snapshot.snapshotId,
      feasibilityJudgmentId: fj.judgmentTrace.judgmentId,
      collapseRiskProfileId: crp.trace.collapseRiskId,
      collapsePropagationId: prop.trace.collapsePropagationId,
    },
    evidenceRefs: evidenceList,
    confidence,
    displayPolicy: eligibilityLevel === "allowed" ? "visible" : "notActionable",
    trace,
  };
}

const ELIGIBILITY_LEVELS: ReadonlySet<string> = new Set(["allowed", "requires_confirmation", "blocked", "unknown"]);
/** v0 で actionBoundary 天井にしてはいけない action class（必ず gate/blocked 側） */
const FORBIDDEN_V0_BOUNDARIES: ReadonlySet<string> = new Set(["write_anchor", "send_message", "book_pay", "external_communication"]);

/** eligibility の構造健全性検証（空 = 適合）。fixture / 監査が使用 */
export function interventionEligibilityViolations(e: InterventionEligibilityV0): string[] {
  const out: string[] = [];
  if (!ELIGIBILITY_LEVELS.has(e.eligibilityLevel)) out.push(`eligibility: eligibilityLevel 不正 "${e.eligibilityLevel}"`);
  // v0: write_anchor 以上を天井にしない
  if (FORBIDDEN_V0_BOUNDARIES.has(e.actionBoundary)) out.push(`eligibility: v0 で actionBoundary "${e.actionBoundary}" を天井にしている`);
  // unknown / blocked は change 系を提案しない（default-deny）
  if ((e.eligibilityLevel === "unknown" || e.eligibilityLevel === "blocked") && (e.canSuggestMove || e.canSuggestShorten || e.canSuggestSkip)) {
    out.push("eligibility: unknown/blocked なのに change 系を提案可にしている");
  }
  // allowed は強 gate / blockedReasons を持たない
  if (e.eligibilityLevel === "allowed" && e.blockedReasons.length > 0) out.push("eligibility: allowed なのに blockedReasons がある");
  // gate（present or **unverified**）があれば allowed にしない（unknown gate を false 扱いして allowed に倒さない）
  const gateReasonCodes = new Set([
    "other_people_involved",
    "other_people_unverified",
    "reservation_or_payment",
    "reservation_or_payment_unverified",
    "work_or_shift",
    "work_or_shift_unverified",
    "sensitive_flagged",
  ]);
  if (e.eligibilityLevel === "allowed" && e.confirmationReasons.some((r) => gateReasonCodes.has(r.code))) {
    out.push("eligibility: gate(present/unverified) があるのに allowed（unknown gate を false 扱いの疑い）");
  }
  // ambiguity は自動 move/skip しない
  if (e.confirmationReasons.some((r) => r.code === "exact_time_collision_ambiguous") && (e.canSuggestMove || e.canSuggestSkip)) {
    out.push("eligibility: exact_time_collision_ambiguous なのに move/skip 提案可");
  }
  // confidence は permission/material 不明で high にしない
  if (e.confidence === "high" && e.blockedReasons.some((r) => r.code === "permission_unknown")) out.push("eligibility: permission unknown なのに confidence high");
  // 全 reason に evidenceRefs（code だけで作文させない）
  for (const r of [...e.confirmationReasons, ...e.blockedReasons]) {
    if (r.evidenceRefs.length === 0) out.push(`eligibility: reason "${r.code}" の evidenceRefs 欠落`);
  }
  if (!e.displayRedactionRequired) out.push("eligibility: displayRedactionRequired が false（display gate を外している）");
  return out;
}
