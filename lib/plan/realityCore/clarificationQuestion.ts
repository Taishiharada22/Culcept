/**
 * ClarificationQuestionCandidateV0 — RJ2c 何について確認するかの構造化 slot（pure core 限定）
 *
 * 正本: docs/reality-clarification-question-impl-design-rj2c-0.md（RJ2c-0/RJ2c-0A）+ docs/reality-judgment-surface-boundary-rj2-0.md
 *   / CEO RJ2c 実装 GO（2026-06-14・trace-hint / 3-condition hard gate / unresolved allowlist / relationRef 必須の 4 追加ガード付き）
 *
 * 思想（question = slot であって文面ではない）: RJ2a plan を consume して「**何について確認するかの構造化 slot**」を
 *   組む。**質問文生成ではない**（自然言語化は RJ2e）。RJ2b の `confirmation_needed` claim（状態記述）とは別オブジェクト
 *   （question = 確認 slot）。最重要安全則を**構造で**担保:
 *     ① ask_clarification hard gate（exposureLevel ask_eligible ∧ clarificationOnly ∧ carriedDecisionKind の 3 揃い）
 *     ② 文面は questionTextDraft=null で持てない（copy RJ2e HOLD）・answerShape は internal structure only（label/choices なし）
 *     ③ leaveBy/departure 逆算 question を作らない（questionKind に存在しない）
 *     ④ exact_time_collision_ambiguous を duplicate と断定しない（assertsDuplicate=false・relationRef 単位）
 *     ⑤ unresolved は allowlist 方式（movement/eta/leaveBy/place/source-pending/duplicate を question 化しない）
 *     ⑥ evidence は internal_trace_only・sensitive genericize（category 非露出）
 *
 * identity（RJ2c-0A）: questionId/dedupe = surfacePlanId + questionKind + subjectScope + subjectNodeId + relationRef +
 *   gateReasonCode + evidence basis + version。**同 kind でも subject/relation/evidence が違えば別 question**。dedupe で
 *   evidenceRefs/sourceRefs/missingInputRefs を失わない（union）。
 *
 * relatedClaimRefs（CEO 追加ガード #1）: **trace hint / deterministic expected link であって存在証明ではない**。RJ2c 単体で
 *   claim 実在を断定しない。空でも gate reason/evidenceRefs から question の正当性を説明できる。claimSet との実在照合は
 *   RJ2d projection/binding 側。question は claim を mutate も user-facing 文面へ昇格もしない。
 *
 * 規律（CEO）: judgmentSurfacePlan.ts 不接触・surfaceClaim.ts は consume のみ（SURFACE_CLAIM_VERSION 参照・不変）・既存 6
 *   判断器不接触・ern/cs/mv/snapshot/identity 不接触（型 import のみ）。consume only / one-way。no UI / API / DB write /
 *   localStorage / migration / external read / location / notification / action / user-facing copy / proposal / 3案 /
 *   departure line / question text / answer choice text。pure（I/O・時刻 API・乱数なし）。SURFACE_QUESTION_VERSION は独立。
 */

import type { MissingInputRef } from "./momentSnapshot";
import type { RealityInstant } from "./realityInstant";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import { targetScopeKey, type TargetScope } from "./realityJudgmentInput";
import type { FeasibilityJudgmentV0, FeasibilityReason } from "./feasibilityJudgment";
import type { CollapseRiskProfileV0 } from "./collapseRisk";
import type { InterventionEligibilityV0 } from "./interventionEligibility";
import type { InterventionDecisionV0 } from "./interventionDecision";
import type { JudgmentSurfacePlanV0, SuppressedSurfaceRef } from "./judgmentSurfacePlan";
import { SURFACE_CLAIM_VERSION } from "./surfaceClaim"; // consume only（surfaceClaim.ts は不変・relatedClaimRefs hint の単一真実源）

export const SURFACE_QUESTION_VERSION = 0;

/**
 * 確認 question の種別（**kind のみ・文面なし**）。gate→question の構造写像。
 *   confirm_other_people / confirm_reservation_payment / confirm_work_shift / confirm_sensitive_handling : gate 確認
 *   resolve_time_collision_ambiguity : 同一 timeWindow の曖昧性（**duplicate 断定しない**・両義を開く・relationRef 必須）
 *   resolve_unresolved_input : 判断材料の欠落（**allowlist 方式**・leaveBy/departure/movement を含めない）
 */
export type ClarificationQuestionKind =
  | "confirm_other_people"
  | "confirm_reservation_payment"
  | "confirm_work_shift"
  | "confirm_sensitive_handling"
  | "resolve_time_collision_ambiguity"
  | "resolve_unresolved_input";

/** question-level evidence contract（internal trace 専用） */
export interface QuestionEvidenceContract {
  readonly evidenceRefs: ReadonlyArray<string>; // field 識別子（node#field）・raw content 不含
  readonly evidenceVisibility: "internal_trace_only"; // v0 固定
  readonly derivedFromGate: "other_people" | "reservation" | "work" | "sensitive" | "time_collision" | "unresolved";
}

export interface QuestionRedactionPolicy {
  readonly genericizeRequired: boolean; // displayRedactionRequired || sensitive 由来
  readonly subjectExposesCategory: false; // v0 固定（sensitive でも category hint なし）
  readonly assertsDuplicate: false; // **v0 固定**: time collision で duplicate を断定しない（構造保証）
  readonly redactionReason: ReadonlyArray<string>;
}

export interface ClarificationQuestionTrace {
  readonly schemaVersion: 0;
  readonly questionId: string;
  readonly questionVersion: number;
  readonly surfacePlanId: string;
  readonly snapshotId: string;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly evaluatedAtInstant: RealityInstant; // identity 対象外
}

export interface ClarificationQuestionCandidateV0 {
  readonly schemaVersion: 0;
  readonly questionId: string; // full tuple identity・raw viewerId 不含
  readonly questionKind: ClarificationQuestionKind;
  readonly subjectScope: TargetScope;
  readonly subjectNodeId: string | null; // **id のみ**（gate reason の targetNodeId・per-event）
  readonly relationRef: string | null; // time collision の relationId（pairwise 単位）。gate question は null
  readonly gateReasonCode: string | null; // 由来 gate code（other_people_involved 等）
  readonly relatedClaimRefs: ReadonlyArray<string>; // **trace hint**（confirmation_needed claimId・存在証明でない）
  readonly exposureBinding: "ask_eligible"; // **v0 固定**: hard gate
  readonly questionTextDraft: null; // **RJ2e HOLD**（v0 常に null）
  readonly answerShape: "binary_confirm" | "disambiguate_two_way" | "open_unresolved"; // **internal structure only**
  readonly evidenceContract: QuestionEvidenceContract;
  readonly redactionPolicy: QuestionRedactionPolicy;
  readonly whyAsked: ReadonlyArray<FeasibilityReason>;
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly sourceRefs: {
    readonly surfacePlanId: string;
    readonly interventionDecisionId: string;
    readonly snapshotId: string;
  };
  readonly trace: ClarificationQuestionTrace;
}

export interface ClarificationQuestionSetTrace {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string;
  readonly snapshotId: string;
  readonly questionCount: number;
  readonly evaluatedAtInstant: RealityInstant;
}

export interface ClarificationQuestionSetV0 {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string;
  readonly questions: ReadonlyArray<ClarificationQuestionCandidateV0>; // ask_eligible 以外は必ず []
  readonly suppressedQuestionRefs: ReadonlyArray<SuppressedSurfaceRef>; // 出さなかった question と理由（departure/allowlist 外等）
  readonly trace: ClarificationQuestionSetTrace;
}

export interface DeriveClarificationQuestionsInput {
  readonly surfacePlan: JudgmentSurfacePlanV0;
  readonly feasibilityJudgment: FeasibilityJudgmentV0;
  readonly collapseRiskProfile: CollapseRiskProfileV0;
  readonly interventionEligibility: InterventionEligibilityV0;
  readonly interventionDecision: InterventionDecisionV0;
}

function reason(code: string, targetNodeId: string | null, evidenceRefs: ReadonlyArray<string>): FeasibilityReason {
  return { code, targetNodeId, evidenceRefs };
}

/**
 * **unresolved allowlist（CEO 追加ガード #3・RJ2c-0A §11.3）**。allowlist 外の unresolved は question 化しない。
 * v0 は **空**（= movement/eta/leaveBy/route/place/source-pending/duplicate-identity を全除外）。最も保守的。
 * 除外された unresolved は suppressedQuestionRefs + missingInputRefs に残す（question にすると departure/ETA/位置推定の入口）。
 */
const ALLOWED_UNRESOLVED_FOR_QUESTION: ReadonlySet<string> = new Set<string>();

/** gate code → question kind 写像（per-event）。null = question 化しない */
function gateMapping(code: string): { kind: ClarificationQuestionKind; gate: QuestionEvidenceContract["derivedFromGate"] } | null {
  switch (code) {
    case "other_people_involved":
    case "other_people_unverified":
      return { kind: "confirm_other_people", gate: "other_people" };
    case "reservation_or_payment":
    case "reservation_or_payment_unverified":
      return { kind: "confirm_reservation_payment", gate: "reservation" };
    case "work_or_shift":
    case "work_or_shift_unverified":
      return { kind: "confirm_work_shift", gate: "work" };
    case "sensitive_flagged":
      return { kind: "confirm_sensitive_handling", gate: "sensitive" };
    default:
      return null; // external_communication_required / high_collapse_risk / feasibility_infeasible / reality_unresolved は question 化しない
  }
}

function answerShapeFor(kind: ClarificationQuestionKind): ClarificationQuestionCandidateV0["answerShape"] {
  if (kind === "resolve_time_collision_ambiguity") return "disambiguate_two_way";
  if (kind === "resolve_unresolved_input") return "open_unresolved";
  return "binary_confirm";
}

function isIdLike(id: string): boolean {
  return id.startsWith("ern:") || id.startsWith("day") || id.startsWith("mv:") || id.startsWith("cs:");
}

interface RawCandidate {
  kind: ClarificationQuestionKind;
  subjectNodeId: string | null;
  relationRef: string | null;
  gateReasonCode: string | null;
  gate: QuestionEvidenceContract["derivedFromGate"];
  evidenceRefs: string[];
  missingInputRefs: MissingInputRef[];
  whyAsked: FeasibilityReason[];
  relatedClaimRefs: string[];
}

/**
 * RJ2a plan + 判断チェーンを consume して question slot を組む（pure・一方向・plan/claim を mutate しない）。
 * integrity guard（不一致 throw）を先に通す。
 */
export function deriveClarificationQuestions(input: DeriveClarificationQuestionsInput): ClarificationQuestionSetV0 {
  const plan = input.surfacePlan;
  const fj = input.feasibilityJudgment;
  const crp = input.collapseRiskProfile;
  const elig = input.interventionEligibility;
  const dec = input.interventionDecision;

  // ── integrity guard ──
  if (plan.sourceRefs.interventionDecisionId !== dec.trace.decisionId) throw new Error("deriveClarificationQuestions: plan が別 interventionDecision 由来");
  if (plan.sourceRefs.feasibilityJudgmentId !== fj.judgmentTrace.judgmentId) throw new Error("deriveClarificationQuestions: plan が別 feasibilityJudgment 由来");
  if (plan.sourceRefs.eligibilityId !== elig.trace.eligibilityId) throw new Error("deriveClarificationQuestions: plan が別 interventionEligibility 由来");
  if (plan.sourceRefs.collapseRiskProfileId !== crp.trace.collapseRiskId) throw new Error("deriveClarificationQuestions: plan が別 collapseRiskProfile 由来");
  if (fj.sourceRefs.snapshotId !== plan.sourceRefs.snapshotId) throw new Error("deriveClarificationQuestions: feasibilityJudgment の snapshotId 不一致");
  if (crp.sourceRefs.snapshotId !== plan.sourceRefs.snapshotId) throw new Error("deriveClarificationQuestions: collapseRiskProfile の snapshotId 不一致");
  if (elig.sourceRefs.snapshotId !== plan.sourceRefs.snapshotId) throw new Error("deriveClarificationQuestions: interventionEligibility の snapshotId 不一致");
  if (dec.sourceRefs.snapshotId !== plan.sourceRefs.snapshotId) throw new Error("deriveClarificationQuestions: interventionDecision の snapshotId 不一致");

  const surfacePlanId = plan.trace.surfacePlanId;
  const snapshotId = plan.sourceRefs.snapshotId;
  const subjectScope = plan.targetScope;
  const evaluatedAtInstant = dec.trace.evaluatedAtInstant;

  const suppressedQuestionRefs: SuppressedSurfaceRef[] = [];
  const suppress = (code: string, surfaceKind: string, targetNodeId: string | null, ev: ReadonlyArray<string>): void => {
    suppressedQuestionRefs.push({ surfaceKind, reason: reason(code, targetNodeId, ev.length > 0 ? ev : [code]) });
  };

  // ── 常に suppress: departure/leaveBy 逆算（構造遮断・question 化経路を持たない）──
  suppress("departure_question_blocked_v0", "departure_line", plan.targetNodeId, ["leaveBy_departure_backcalc_blocked", "movement_input_gate"]);

  // ── hard gate（CEO 追加ガード #2・3 条件揃い）──
  const gateOpen = plan.exposureLevel === "ask_eligible" && plan.clarificationOnly === true && plan.carriedDecisionKind === "ask_clarification";
  if (!gateOpen) {
    for (const k of ["confirm_other_people", "confirm_reservation_payment", "confirm_work_shift", "confirm_sensitive_handling", "resolve_time_collision_ambiguity", "resolve_unresolved_input"] as const) {
      suppress(`question_suppressed_not_ask_eligible:${plan.exposureLevel}`, k, plan.targetNodeId, [`exposure:${plan.exposureLevel}`, `clarificationOnly:${plan.clarificationOnly}`, `decisionKind:${plan.carriedDecisionKind}`]);
    }
    return { schemaVersion: 0, surfacePlanId, questions: [], suppressedQuestionRefs, trace: { schemaVersion: 0, surfacePlanId, snapshotId, questionCount: 0, evaluatedAtInstant } };
  }

  // ── genericize ──
  const sensitiveReasons = elig.confirmationReasons.filter((r) => r.code === "sensitive_flagged");
  const genericizeRequired = plan.displayRedactionRequired || sensitiveReasons.length > 0;
  const redactionReason: string[] = [...(plan.displayRedactionRequired ? ["displayRedactionRequired"] : []), ...sensitiveReasons.flatMap((r) => r.evidenceRefs).slice(0, 4)];
  if (redactionReason.length === 0) redactionReason.push("redaction_default_gate");

  // ── relatedClaimRefs（trace hint）: confirmation_needed claimId を決定的に算出（RJ2b 公式 mirror・存在証明でない）──
  // RJ2b: claimId = cl:fnv64(canonical({sp, t:"confirmation_needed", n:plan.targetNodeId, k:"surface_claim", v:SURFACE_CLAIM_VERSION}))
  const confirmationClaimIdHint = `cl:${fnv1a64Hex(
    canonicalSerialize({ sp: surfacePlanId, t: "confirmation_needed", n: plan.targetNodeId, k: "surface_claim", v: SURFACE_CLAIM_VERSION }),
  )}`;

  const raw: RawCandidate[] = [];

  // (a) gate question（per-event・per-reason）
  for (const r of elig.confirmationReasons) {
    const m = gateMapping(r.code);
    if (!m) continue;
    raw.push({
      kind: m.kind,
      subjectNodeId: r.targetNodeId,
      relationRef: null,
      gateReasonCode: r.code,
      gate: m.gate,
      evidenceRefs: [...r.evidenceRefs],
      missingInputRefs: [],
      whyAsked: [r],
      relatedClaimRefs: [confirmationClaimIdHint], // trace hint（RJ2d が実在照合）
    });
  }

  // (b) time collision question（per-relation・relationRef 必須・duplicate 断定なし）
  for (const rel of fj.judgmentTrace.timeRelations) {
    if (rel.relationKind !== "exact_time_collision_ambiguous") continue;
    raw.push({
      kind: "resolve_time_collision_ambiguity",
      subjectNodeId: rel.fromEventRealityNodeId,
      relationRef: rel.relationId,
      gateReasonCode: "exact_time_collision_ambiguous",
      gate: "time_collision",
      evidenceRefs: [...rel.evidenceRefs], // 両 event の #timeWindow/#fixedness/#durationSource
      missingInputRefs: [],
      whyAsked: [reason("exact_time_collision_ambiguous", rel.fromEventRealityNodeId, rel.evidenceRefs)],
      relatedClaimRefs: [], // time collision は confirmation_needed claim に直接対応しない
    });
  }

  // (c) unresolved question（**allowlist 方式**・allowlist 外は suppress）
  for (const r of fj.unresolvedCriticalInputs) {
    if (ALLOWED_UNRESOLVED_FOR_QUESTION.has(r.code)) {
      raw.push({
        kind: "resolve_unresolved_input",
        subjectNodeId: r.targetNodeId,
        relationRef: null,
        gateReasonCode: r.code,
        gate: "unresolved",
        evidenceRefs: [...r.evidenceRefs],
        missingInputRefs: [],
        whyAsked: [r],
        relatedClaimRefs: [],
      });
    } else {
      // allowlist 外（movement/eta/leaveBy/route/place/source-pending/duplicate）→ question 化しない・trace を残す
      suppress(`unresolved_not_question_allowlisted:${r.code}`, "unresolved_input", r.targetNodeId, r.evidenceRefs);
    }
  }

  // ── dedupe by questionId（full tuple）・衝突時は evidenceRefs/whyAsked/relatedClaimRefs を union（trace 失わない）──
  const byId = new Map<string, RawCandidate & { questionId: string }>();
  for (const c of raw) {
    const evidenceBasisKey = [...new Set(c.evidenceRefs)].sort().join("|");
    const questionId = `q:${fnv1a64Hex(
      canonicalSerialize({ sp: surfacePlanId, k: c.kind, scope: targetScopeKey(subjectScope), n: c.subjectNodeId, rel: c.relationRef, g: c.gateReasonCode, ev: evidenceBasisKey, kind: "clarification_question", v: SURFACE_QUESTION_VERSION }),
    )}`;
    const existing = byId.get(questionId);
    if (existing) {
      existing.evidenceRefs = [...new Set([...existing.evidenceRefs, ...c.evidenceRefs])];
      existing.whyAsked = [...existing.whyAsked, ...c.whyAsked];
      existing.relatedClaimRefs = [...new Set([...existing.relatedClaimRefs, ...c.relatedClaimRefs])];
      existing.missingInputRefs = [...existing.missingInputRefs, ...c.missingInputRefs];
    } else {
      byId.set(questionId, { ...c, questionId });
    }
  }

  const questions: ClarificationQuestionCandidateV0[] = [...byId.values()].map((c) => {
    const evidenceRefs = c.evidenceRefs.length > 0 ? [...new Set(c.evidenceRefs)].sort() : [`${c.kind}_basis`];
    return {
      schemaVersion: 0,
      questionId: c.questionId,
      questionKind: c.kind,
      subjectScope,
      subjectNodeId: c.subjectNodeId,
      relationRef: c.relationRef,
      gateReasonCode: c.gateReasonCode,
      relatedClaimRefs: c.relatedClaimRefs,
      exposureBinding: "ask_eligible",
      questionTextDraft: null,
      answerShape: answerShapeFor(c.kind),
      evidenceContract: { evidenceRefs, evidenceVisibility: "internal_trace_only", derivedFromGate: c.gate },
      redactionPolicy: { genericizeRequired, subjectExposesCategory: false, assertsDuplicate: false, redactionReason },
      whyAsked: c.whyAsked,
      displayPolicy: "notActionable",
      sourceRefs: { surfacePlanId, interventionDecisionId: dec.trace.decisionId, snapshotId },
      trace: { schemaVersion: 0, questionId: c.questionId, questionVersion: SURFACE_QUESTION_VERSION, surfacePlanId, snapshotId, evidenceRefs, missingInputRefs: c.missingInputRefs, evaluatedAtInstant },
    };
  });

  return { schemaVersion: 0, surfacePlanId, questions, suppressedQuestionRefs, trace: { schemaVersion: 0, surfacePlanId, snapshotId, questionCount: questions.length, evaluatedAtInstant } };
}

const QUESTION_KINDS: ReadonlySet<string> = new Set([
  "confirm_other_people",
  "confirm_reservation_payment",
  "confirm_work_shift",
  "confirm_sensitive_handling",
  "resolve_time_collision_ambiguity",
  "resolve_unresolved_input",
]);
const GATE_KINDS: ReadonlySet<string> = new Set(["confirm_other_people", "confirm_reservation_payment", "confirm_work_shift", "confirm_sensitive_handling"]);
/** departure/leaveBy/ETA/route 逆算を示す禁止トークン（questionKind/field に混入したら FAIL） */
const FORBIDDEN_BACKCALC_TOKENS: ReadonlyArray<string> = ["departure", "leave_by", "leaveby", "eta", "route_plan", "backcalc"];
/** 型に存在してはいけない field（文面/選択肢/notification/contact/dispatch/action/authority leak）。構造 assert */
const FORBIDDEN_FIELDS: ReadonlyArray<string> = [
  "questionText",
  "text",
  "copy",
  "choices",
  "answerChoices",
  "options",
  "labels",
  "label",
  "yesLabel",
  "noLabel",
  "message",
  "departureLine",
  "leaveBy",
  "eta",
  "notify",
  "notification",
  "contact",
  "push",
  "dispatch",
  "deliveryMode",
  "send",
  "execute",
  "action",
  "write",
  "book",
  "pay",
  "graphViewerKey",
  "viewerId",
  "viewerKey",
];

/** question 単体検証（plan 文脈なし・空=適合）。CEO 必須 15 項。 */
export function clarificationQuestionSetViolations(set: ClarificationQuestionSetV0): string[] {
  const out: string[] = [];

  const seen = new Set<string>();
  for (const q of set.questions) {
    if (seen.has(q.questionId)) out.push(`clarificationQuestion: duplicate questionId "${q.questionId}"`); // #1
    seen.add(q.questionId);

    if (q.questionTextDraft !== null) out.push(`clarificationQuestion: questionTextDraft が null でない（${q.questionId}）`); // #2
    if (q.exposureBinding !== "ask_eligible") out.push(`clarificationQuestion: exposureBinding が ask_eligible でない（${q.questionId}）`); // #3
    if (q.evidenceContract.evidenceVisibility !== "internal_trace_only") out.push(`clarificationQuestion: evidenceVisibility が internal_trace_only でない（${q.questionId}）`); // #4
    if (!QUESTION_KINDS.has(q.questionKind)) out.push(`clarificationQuestion: questionKind 不正 "${q.questionKind}"`); // #5
    if (FORBIDDEN_BACKCALC_TOKENS.some((t) => q.questionKind.includes(t))) out.push(`clarificationQuestion: questionKind に departure/leaveBy/ETA 逆算トークン混入 "${q.questionKind}"`); // #7
    if (q.redactionPolicy.assertsDuplicate !== false) out.push(`clarificationQuestion: assertsDuplicate が false でない（${q.questionId}・duplicate 断定）`); // #6
    if (q.redactionPolicy.subjectExposesCategory !== false) out.push(`clarificationQuestion: subjectExposesCategory が false でない（${q.questionId}）`); // #8
    if (q.subjectNodeId !== null && !isIdLike(q.subjectNodeId)) out.push(`clarificationQuestion: subjectNodeId が id 形式でない（${q.questionId}・raw label の疑い）`); // #9
    // #10 relationRef 必須 kind（time collision）で null
    if (q.questionKind === "resolve_time_collision_ambiguity" && q.relationRef === null) out.push(`clarificationQuestion: resolve_time_collision_ambiguity なのに relationRef が null（${q.questionId}）`);
    // #14 gate question で gateReasonCode null（identity/trace 欠落）
    if (GATE_KINDS.has(q.questionKind) && q.gateReasonCode === null) out.push(`clarificationQuestion: gate question なのに gateReasonCode が null（${q.questionId}）`);
    // #15 resolve_unresolved_input が allowlist 外 code
    if (q.questionKind === "resolve_unresolved_input" && (q.gateReasonCode === null || !ALLOWED_UNRESOLVED_FOR_QUESTION.has(q.gateReasonCode))) {
      out.push(`clarificationQuestion: resolve_unresolved_input の gateReasonCode が allowlist 外（${q.questionId}・movement/eta/leaveBy 等の question 化）`);
    }
    if (q.evidenceContract.evidenceRefs.length === 0) out.push(`clarificationQuestion: evidenceRefs 欠落（${q.questionId}）`); // #13
    for (const r of q.evidenceContract.evidenceRefs) if (!r) out.push(`clarificationQuestion: 空 evidenceRef（${q.questionId}）`);
    if (!["visible", "hidden", "debugOnly", "notActionable"].includes(q.displayPolicy)) out.push(`clarificationQuestion: displayPolicy 不正（${q.questionId}）`);
    // #11/#12 文面/選択肢/notification/contact/dispatch/action field 構造 assert
    for (const f of FORBIDDEN_FIELDS) {
      if (f in (q as unknown as Record<string, unknown>)) out.push(`clarificationQuestion: 禁止 field "${f}" が question に存在（${q.questionId}）`);
    }
  }
  // #14 suppressedQuestionRefs の reason に evidenceRefs
  for (const s of set.suppressedQuestionRefs) {
    if (s.reason.evidenceRefs.length === 0) out.push(`clarificationQuestion: suppressedQuestionRef "${s.surfaceKind}" の evidenceRefs 欠落`);
  }
  for (const f of FORBIDDEN_FIELDS) {
    if (f in (set as unknown as Record<string, unknown>)) out.push(`clarificationQuestion: 禁止 field "${f}" が questionSet に存在`);
  }
  return out;
}

/** plan と questionSet の整合検証（空=適合）。**surface emission の前提ゲート**。CEO 必須 10 項。 */
export function clarificationQuestionBindingViolations(plan: JudgmentSurfacePlanV0, set: ClarificationQuestionSetV0): string[] {
  const out: string[] = [];
  // #1 surfacePlanId 一致
  if (set.surfacePlanId !== plan.trace.surfacePlanId) out.push("binding: questionSet.surfacePlanId が plan.trace.surfacePlanId と不一致");
  // #2/#3/#4 hard gate（3 条件揃わないのに questions 非空）
  if (plan.exposureLevel !== "ask_eligible" && set.questions.length > 0) out.push(`binding: exposure "${plan.exposureLevel}" なのに questions 非空（hard gate）`);
  if (plan.clarificationOnly !== true && set.questions.length > 0) out.push("binding: clarificationOnly でないのに questions 非空（hard gate）");
  if (plan.carriedDecisionKind !== "ask_clarification" && set.questions.length > 0) out.push(`binding: decisionKind "${plan.carriedDecisionKind}" なのに questions 非空（hard gate）`);

  const seen = new Set<string>();
  for (const q of set.questions) {
    if (seen.has(q.questionId)) out.push(`binding: duplicate questionId "${q.questionId}"`); // #6
    seen.add(q.questionId);
    if (q.exposureBinding !== "ask_eligible") out.push(`binding: question "${q.questionId}" の exposureBinding が ask_eligible でない`); // #5
    if (q.sourceRefs.surfacePlanId !== plan.trace.surfacePlanId) out.push(`binding: question "${q.questionId}" が別 plan 由来`); // #7
    if (q.questionKind === "resolve_time_collision_ambiguity" && q.relationRef === null) out.push(`binding: time collision question "${q.questionId}" に relationRef 欠落`); // #8
    for (const ref of q.relatedClaimRefs) if (ref && !ref.startsWith("cl:")) out.push(`binding: relatedClaimRef が id 形式でない（${q.questionId}・raw の疑い）`);
  }
  // #9/#10 questionSet を consumer payload 扱いする field（direct read 構造遮断）
  for (const f of FORBIDDEN_FIELDS) {
    if (f in (set as unknown as Record<string, unknown>)) out.push(`binding: questionSet に consumer payload field "${f}"`);
  }
  return out;
}
