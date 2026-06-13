/**
 * SurfaceClaimV0 — RJ2b 判断 → 「主張してよいことの構造化 envelope」（pure core 限定）
 *
 * 正本: docs/reality-surface-claim-impl-design-rj2b-0.md（RJ2b-0/RJ2b-0A）+ docs/reality-judgment-surface-boundary-rj2-0.md
 *   （G3 EVIDENCE/CLAIM + G4 REDACTION）/ CEO RJ2b 実装 GO（2026-06-14・claimId uniqueness / BoundSurface non-payload /
 *   bind failure-loud の 3 追加ガード付き）
 *
 * 思想（claim = envelope であって文面ではない）: RJ2a の JudgmentSurfacePlan（exposure 包絡）を consume して、
 *   **この判断について真実として主張してよいことの構造化 envelope**を組む。**文章生成ではない**（自然言語化は RJ2e）。
 *   最重要安全則を**構造で**担保:
 *     ① feasibility verdict（feasible/infeasible/will_fail/will_be_late/on_time）を claimType に含めない（assert 経路が無い）
 *     ② 文面は claimTextDraft=null で持てない（copy RJ2e HOLD）
 *     ③ evidence は internal_trace_only（consumer payload / user display に出さない）
 *     ④ sensitive は genericize（subject は id のみ・category hint なし）
 *     ⑤ claimSet/BoundSurface は binding walker を通らねば surface emission に進めない
 *
 * 不変条件（CEO・RJ2b-0A 3-walker 責務分離）:
 *   - exposure none/internal_only → claims []（internal_only は claim exposure に使わない・早期遮断）
 *   - claim exposureBinding ≤ plan.exposureLevel（**userFacingExposureRank** 比較・文字列順/配列順で比較しない）
 *   - assertable は confirmed bucket 由来のみ / inferred→hedged / unresolved→observation_only / confirmation_needed→hedged 上限
 *   - confirmation_needed は **claim であって question ではない**（文面なし・ClarificationQuestionCandidate でない・
 *     ask_eligible 以外で生成しない・ambiguity 単独で claim 化しない）
 *   - **claimId uniqueness**（CEO 追加 #1）: set 内 claimId 重複 → FAIL。claimId 同一を内容同一の証明としない
 *   - **SurfaceClaimSetV0 / BoundSurfaceV0 は consumer payload でない**（CEO 追加 #2）: UI/renderer/projection direct read 禁止・
 *     consumer-facing projection は RJ2d 以降・evidenceRefs/sourceRefs/missingInputRefs は internal_trace_only
 *   - **bindClaimsToPlan は failure-loud**（CEO 追加 #3）: 違反時 throw（静かに捨てない・suppression は derive 側の正直な抑制で
 *     あって binding 違反の隠蔽ではない）
 *
 * 規律（CEO）: judgmentSurfacePlan.ts 不接触・既存 6 判断器不接触・ern/cs/mv/snapshot/identity 不接触（型 import のみ）。
 *   consume only / one-way。no UI / API / DB・Supabase write / localStorage / migration / external read / location /
 *   notification / action / user-facing copy / proposal / 3案 / departure line / question text。
 *   pure（I/O・時刻 API・乱数なし）。SURFACE_CLAIM_VERSION は graph manifest と独立。
 */

import type { RealityInstant } from "./realityInstant";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import { type TargetScope } from "./realityJudgmentInput";
import type { FeasibilityJudgmentV0, FeasibilityReason } from "./feasibilityJudgment";
import type { CollapseRiskProfileV0 } from "./collapseRisk";
import type { InterventionEligibilityV0 } from "./interventionEligibility";
import type { InterventionDecisionV0 } from "./interventionDecision";
import type { JudgmentSurfacePlanV0, SurfaceExposureLevel, SuppressedSurfaceRef } from "./judgmentSurfacePlan";
import { exposureForDecisionKind } from "./judgmentSurfacePlan";

export const SURFACE_CLAIM_VERSION = 0;

/**
 * 主張してよい claim の種別。**feasibility verdict を含めない**（CEO: feasibility_state assert 禁止）。全て descriptive。
 *   collapse_fragility_present    : 崩れる兆候がある（脆さ要因の存在・断定でない）
 *   unresolved_input_present      : 判断材料が欠けている（unknown の存在・記述）
 *   confirmation_needed           : 確認を要する gate がある（**claim であって質問でない**・ask_eligible 時のみ）
 *   passive_observation           : 中立な passive 言及（observe・状態の記述のみ）
 *   movement_unresolved_reference : 移動材料が未解決（出発線は出さない・参照のみ）
 */
export type SurfaceClaimType =
  | "collapse_fragility_present"
  | "unresolved_input_present"
  | "confirmation_needed"
  | "passive_observation"
  | "movement_unresolved_reference";

/**
 * claim をどこまで主張してよいか（assertability cap）。judgmentConfidence + bucket + exposure で上限が決まる。
 *   assertable / hedged / observation_only / withheld（順序: withheld < observation_only < hedged < assertable）
 */
export type ClaimAssertability = "assertable" | "hedged" | "observation_only" | "withheld";

/** claim-level evidence contract（internal trace 専用・consumer payload に出さない） */
export interface ClaimEvidenceContract {
  readonly evidenceRefs: ReadonlyArray<string>; // field 識別子（node#field）・raw content 不含
  readonly evidenceVisibility: "internal_trace_only"; // v0 固定
  readonly derivedFromBucket: "confirmed" | "inferred" | "unresolved" | "risk" | "gate";
}

/** G4 redaction policy（sensitive genericize） */
export interface ClaimRedactionPolicy {
  readonly genericizeRequired: boolean; // displayRedactionRequired || sensitiveFlagged 由来
  readonly subjectExposesCategory: false; // v0 固定: subject は category hint を持たない（構造保証）
  readonly redactionReason: ReadonlyArray<string>; // field-level
}

export interface SurfaceClaimTrace {
  readonly schemaVersion: 0;
  readonly claimId: string;
  readonly claimVersion: number;
  readonly surfacePlanId: string;
  readonly snapshotId: string;
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly evaluatedAtInstant: RealityInstant; // identity 対象外
}

export interface SurfaceClaimV0 {
  readonly schemaVersion: 0;
  readonly claimId: string; // 決定的・raw viewerId 不含
  readonly claimType: SurfaceClaimType; // feasibility verdict を含まない
  readonly subjectScope: TargetScope;
  readonly subjectNodeId: string | null; // **id のみ**（displayLabel/raw text を持たない）
  readonly assertability: ClaimAssertability; // cap 適用後
  readonly exposureBinding: SurfaceExposureLevel; // ≤ plan.exposureLevel（internal_only/none は使わない）
  readonly actionAffordance: "none"; // RJ2b 常に none（notActionable passive reference）
  readonly claimTextDraft: null; // **RJ2e HOLD**（v0 常に null）
  readonly evidenceContract: ClaimEvidenceContract;
  readonly redactionPolicy: ClaimRedactionPolicy;
  readonly whyAssertable: ReadonlyArray<FeasibilityReason>;
  readonly whyCapped: ReadonlyArray<FeasibilityReason>;
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly sourceRefs: {
    readonly surfacePlanId: string;
    readonly interventionDecisionId: string;
    readonly snapshotId: string;
  };
  readonly trace: SurfaceClaimTrace;
}

export interface SurfaceClaimSetTrace {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string;
  readonly snapshotId: string;
  readonly claimCount: number;
  readonly evaluatedAtInstant: RealityInstant;
}

export interface SurfaceClaimSetV0 {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string; // どの plan の claim か
  readonly claims: ReadonlyArray<SurfaceClaimV0>; // exposure none/internal_only なら必ず空
  readonly suppressedClaimRefs: ReadonlyArray<SuppressedSurfaceRef>; // 出さなかった claim と理由
  readonly trace: SurfaceClaimSetTrace;
}

/** binding 検証を通過した plan + claimSet の対（CEO #2: これも consumer payload でない）。これ無しに surface emission に渡せない */
export interface BoundSurfaceV0 {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string;
  readonly surfacePlan: JudgmentSurfacePlanV0;
  readonly claimSet: SurfaceClaimSetV0;
}

export interface DeriveSurfaceClaimsInput {
  readonly surfacePlan: JudgmentSurfacePlanV0;
  readonly feasibilityJudgment: FeasibilityJudgmentV0;
  readonly collapseRiskProfile: CollapseRiskProfileV0;
  readonly interventionEligibility: InterventionEligibilityV0;
  readonly interventionDecision: InterventionDecisionV0;
}

function reason(code: string, targetNodeId: string | null, evidenceRefs: ReadonlyArray<string>): FeasibilityReason {
  return { code, targetNodeId, evidenceRefs };
}

/** user-facing exposure rank（internal_only は user-facing 0）。judgmentSurfacePlan の private 関数をローカル再定義（不接触） */
function userFacingExposureRank(e: SurfaceExposureLevel): number {
  switch (e) {
    case "none":
      return 0;
    case "internal_only":
      return 0;
    case "passive_only":
      return 1;
    case "ask_eligible":
      return 2;
  }
}

// ── assertability lattice（withheld < observation_only < hedged < assertable）──
const A_RANK: Record<ClaimAssertability, number> = { withheld: 0, observation_only: 1, hedged: 2, assertable: 3 };
function minAssert(a: ClaimAssertability, b: ClaimAssertability): ClaimAssertability {
  return A_RANK[a] <= A_RANK[b] ? a : b;
}
function bucketBase(bucket: ClaimEvidenceContract["derivedFromBucket"]): ClaimAssertability {
  switch (bucket) {
    case "confirmed":
      return "assertable"; // confirmed bucket 由来のみ assertable（CEO assertability 不変条件）
    case "inferred":
    case "risk":
    case "gate":
      return "hedged";
    case "unresolved":
      return "observation_only";
  }
}
function typeCap(t: SurfaceClaimType): ClaimAssertability {
  if (t === "passive_observation") return "observation_only"; // 中立言及・断定しない
  if (t === "confirmation_needed") return "hedged"; // 確認を促すが断定しない
  return "assertable"; // collapse_fragility/unresolved/movement は bucket cap に委ねる
}
function exposureCap(e: SurfaceExposureLevel): ClaimAssertability {
  return e === "ask_eligible" ? "assertable" : "hedged"; // passive_only → hedged 上限
}

/** movement 未解決系 unresolved code か */
const MOVEMENT_UNRESOLVED_CODES: ReadonlySet<string> = new Set([
  "leave_by_unresolved",
  "eta_source_missing",
  "route_unresolved",
  "movement_requirement_unknown",
]);

/** id 形式（raw label/text でない）か */
function isIdLike(id: string): boolean {
  return id.startsWith("ern:") || id.startsWith("day") || id.startsWith("mv:") || id.startsWith("cs:");
}

/**
 * RJ2a plan + 判断チェーンを consume して claim envelope を組む（pure・一方向・plan を mutate しない）。
 * integrity guard（不一致 throw）を先に通す。
 */
export function deriveSurfaceClaims(input: DeriveSurfaceClaimsInput): SurfaceClaimSetV0 {
  const plan = input.surfacePlan;
  const fj = input.feasibilityJudgment;
  const crp = input.collapseRiskProfile;
  const elig = input.interventionEligibility;
  const dec = input.interventionDecision;

  // ── integrity guard（plan が同一 chain 由来か）──
  if (plan.sourceRefs.interventionDecisionId !== dec.trace.decisionId) throw new Error("deriveSurfaceClaims: plan が別 interventionDecision 由来");
  if (plan.sourceRefs.feasibilityJudgmentId !== fj.judgmentTrace.judgmentId) throw new Error("deriveSurfaceClaims: plan が別 feasibilityJudgment 由来");
  if (plan.sourceRefs.eligibilityId !== elig.trace.eligibilityId) throw new Error("deriveSurfaceClaims: plan が別 interventionEligibility 由来");
  if (plan.sourceRefs.collapseRiskProfileId !== crp.trace.collapseRiskId) throw new Error("deriveSurfaceClaims: plan が別 collapseRiskProfile 由来");
  if (fj.sourceRefs.snapshotId !== plan.sourceRefs.snapshotId) throw new Error("deriveSurfaceClaims: feasibilityJudgment の snapshotId 不一致");
  if (crp.sourceRefs.snapshotId !== plan.sourceRefs.snapshotId) throw new Error("deriveSurfaceClaims: collapseRiskProfile の snapshotId 不一致");
  if (elig.sourceRefs.snapshotId !== plan.sourceRefs.snapshotId) throw new Error("deriveSurfaceClaims: interventionEligibility の snapshotId 不一致");
  if (dec.sourceRefs.snapshotId !== plan.sourceRefs.snapshotId) throw new Error("deriveSurfaceClaims: interventionDecision の snapshotId 不一致");

  const exposure = plan.exposureLevel;
  const surfacePlanId = plan.trace.surfacePlanId;
  const snapshotId = plan.sourceRefs.snapshotId;
  const subjectScope = plan.targetScope;
  const subjectNodeId = plan.targetNodeId;
  const evaluatedAtInstant = dec.trace.evaluatedAtInstant;

  // ── genericize（sensitive / displayRedactionRequired）──
  const sensitiveReasons = elig.confirmationReasons.filter((r) => r.code === "sensitive_flagged");
  const genericizeRequired = plan.displayRedactionRequired || sensitiveReasons.length > 0;
  const redactionReason: string[] = [
    ...(plan.displayRedactionRequired ? ["displayRedactionRequired"] : []),
    ...sensitiveReasons.flatMap((r) => r.evidenceRefs).slice(0, 4),
  ];
  if (redactionReason.length === 0) redactionReason.push("redaction_default_gate");

  const suppressedClaimRefs: SuppressedSurfaceRef[] = [];
  const suppress = (code: string, surfaceKind: string, ev: ReadonlyArray<string>): void => {
    suppressedClaimRefs.push({ surfaceKind, reason: reason(code, subjectNodeId, ev) });
  };

  // 常に suppress（HOLD・正直化）
  suppress("question_text_hold_rj2c", "clarification_question_text", ["question_text_hold_rj2c"]);
  suppress("proposal_hold_rj2d", "proposal_candidate", ["proposal_hold_rj2d"]);
  suppress("departure_hold_rj2d", "departure_line", ["departure_hold_rj2d"]);

  // ── exposure none/internal_only → claims []（早期遮断・internal_only も user-facing claim を出さない）──
  if (exposure === "none" || exposure === "internal_only") {
    for (const t of ["collapse_fragility_present", "unresolved_input_present", "confirmation_needed", "passive_observation", "movement_unresolved_reference"] as const) {
      suppress(`claim_suppressed_exposure_${exposure}`, t, [`exposure:${exposure}`, `decision:${plan.carriedDecisionKind}`]);
    }
    return {
      schemaVersion: 0,
      surfacePlanId,
      claims: [],
      suppressedClaimRefs,
      trace: { schemaVersion: 0, surfacePlanId, snapshotId, claimCount: 0, evaluatedAtInstant },
    };
  }

  // ── claim 候補（passive_only / ask_eligible のみ）──
  const claims: SurfaceClaimV0[] = [];
  const seenClaimId = new Set<string>();

  const makeClaim = (
    claimType: SurfaceClaimType,
    bucket: ClaimEvidenceContract["derivedFromBucket"],
    evidenceRefs: ReadonlyArray<string>,
    whyAssertable: ReadonlyArray<FeasibilityReason>,
  ): void => {
    const assertability = minAssert(minAssert(bucketBase(bucket), typeCap(claimType)), exposureCap(exposure));
    const claimId = `cl:${fnv1a64Hex(
      canonicalSerialize({ sp: surfacePlanId, t: claimType, n: subjectNodeId, k: "surface_claim", v: SURFACE_CLAIM_VERSION }),
    )}`;
    if (seenClaimId.has(claimId)) return; // 同一 (plan,type,subject) は 1 件（uniqueness 構造保証）
    seenClaimId.add(claimId);
    const evRefs = evidenceRefs.length > 0 ? evidenceRefs.slice(0, 8) : [`${claimType}_descriptive`];
    claims.push({
      schemaVersion: 0,
      claimId,
      claimType,
      subjectScope,
      subjectNodeId,
      assertability,
      exposureBinding: exposure, // ≤ plan.exposureLevel（= exposure 自身）
      actionAffordance: "none",
      claimTextDraft: null,
      evidenceContract: { evidenceRefs: evRefs, evidenceVisibility: "internal_trace_only", derivedFromBucket: bucket },
      redactionPolicy: { genericizeRequired, subjectExposesCategory: false, redactionReason },
      whyAssertable,
      whyCapped: [reason("assertability_capped", subjectNodeId, [`exposure:${exposure}`, `bucket:${bucket}`, `assertability:${assertability}`])],
      displayPolicy: "notActionable", // claim は内部 envelope・action none
      sourceRefs: { surfacePlanId, interventionDecisionId: dec.trace.decisionId, snapshotId },
      trace: { schemaVersion: 0, claimId, claimVersion: SURFACE_CLAIM_VERSION, surfacePlanId, snapshotId, evidenceRefs: evRefs, evaluatedAtInstant },
    });
  };

  // collapse_fragility_present（兆候・inferred 扱い・verdict にしない）
  const hasFragility = fj.inferredBlockingReasons.length > 0 || crp.riskLevel === "elevated" || crp.riskLevel === "high";
  if (hasFragility) {
    makeClaim(
      "collapse_fragility_present",
      "inferred",
      [...fj.inferredBlockingReasons.flatMap((r) => r.evidenceRefs), `collapse:riskLevel:${crp.riskLevel}`],
      fj.inferredBlockingReasons.length > 0 ? fj.inferredBlockingReasons : [reason("collapse_risk_active", subjectNodeId, [`collapse:riskLevel:${crp.riskLevel}`])],
    );
  }

  // unresolved_input_present
  if (fj.unresolvedCriticalInputs.length > 0) {
    makeClaim("unresolved_input_present", "unresolved", fj.unresolvedCriticalInputs.flatMap((r) => r.evidenceRefs), fj.unresolvedCriticalInputs);
  }

  // movement_unresolved_reference（出発線は出さない・参照のみ）
  const movementReasons = fj.unresolvedCriticalInputs.filter((r) => MOVEMENT_UNRESOLVED_CODES.has(r.code));
  if (movementReasons.length > 0) {
    makeClaim("movement_unresolved_reference", "unresolved", movementReasons.flatMap((r) => r.evidenceRefs), movementReasons);
  }

  // confirmation_needed（**ask_eligible 時のみ**・claim であって question でない）
  if (exposure === "ask_eligible" && elig.confirmationReasons.length > 0) {
    makeClaim("confirmation_needed", "gate", elig.confirmationReasons.flatMap((r) => r.evidenceRefs), elig.confirmationReasons);
  } else if (exposure !== "ask_eligible") {
    // passive_only では confirmation_needed を作らない（正直に suppress）
    suppress("confirmation_needed_requires_ask_eligible", "confirmation_needed", [`exposure:${exposure}`]);
  }

  // passive_observation（中立言及・常に 1 件・descriptive）
  makeClaim("passive_observation", "risk", [`passive_observation_neutral`, `decision:${plan.carriedDecisionKind}`], [
    reason("decision_permits_passive_surface", subjectNodeId, [`decision:${plan.carriedDecisionKind}`]),
  ]);

  return {
    schemaVersion: 0,
    surfacePlanId,
    claims,
    suppressedClaimRefs,
    trace: { schemaVersion: 0, surfacePlanId, snapshotId, claimCount: claims.length, evaluatedAtInstant },
  };
}

// ── 許可 claimType / 禁止 verdict トークン ──
const CLAIM_TYPES: ReadonlySet<string> = new Set([
  "collapse_fragility_present",
  "unresolved_input_present",
  "confirmation_needed",
  "passive_observation",
  "movement_unresolved_reference",
]);
/** claimType / claim object に混入してはいけない feasibility verdict 相当トークン */
const FORBIDDEN_VERDICT_TOKENS: ReadonlyArray<string> = ["feasible", "infeasible", "will_fail", "will_be_late", "on_time", "verdict"];
/** 型に存在してはいけない field（copy/notification/contact/dispatch/action/authority leak）。構造 assert */
const FORBIDDEN_FIELDS: ReadonlyArray<string> = [
  "claimText",
  "text",
  "copy",
  "userMessage",
  "message",
  "questionText",
  "proposal",
  "proposals",
  "threeOptions",
  "departureLine",
  "departureLines",
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

/**
 * claim 単体検証（plan 文脈なし・空=適合）。CEO surfaceClaimSetViolations 必須 13 項 + claimId uniqueness。
 */
export function surfaceClaimSetViolations(set: SurfaceClaimSetV0): string[] {
  const out: string[] = [];

  // #2 duplicate claimId（CEO 追加 #1）
  const seen = new Set<string>();
  for (const c of set.claims) {
    if (seen.has(c.claimId)) out.push(`surfaceClaim: duplicate claimId "${c.claimId}"`);
    seen.add(c.claimId);
  }

  for (const c of set.claims) {
    // #3 claimTextDraft !== null
    if (c.claimTextDraft !== null) out.push(`surfaceClaim: claimTextDraft が null でない（${c.claimId}・copy RJ2e HOLD 違反）`);
    // #4 actionAffordance !== none
    if (c.actionAffordance !== "none") out.push(`surfaceClaim: actionAffordance が none でない（${c.claimId}）`);
    // #5 evidenceVisibility !== internal_trace_only
    if (c.evidenceContract.evidenceVisibility !== "internal_trace_only") out.push(`surfaceClaim: evidenceVisibility が internal_trace_only でない（${c.claimId}・evidence leak）`);
    // #6 claimType が feasibility verdict 相当
    if (!CLAIM_TYPES.has(c.claimType)) out.push(`surfaceClaim: claimType 不正 "${c.claimType}"（verdict 混入の疑い）`);
    if (FORBIDDEN_VERDICT_TOKENS.some((t) => c.claimType.includes(t))) out.push(`surfaceClaim: claimType に verdict トークン混入 "${c.claimType}"`);
    // #7 assertable なのに confirmed bucket 由来でない
    if (c.assertability === "assertable" && c.evidenceContract.derivedFromBucket !== "confirmed") {
      out.push(`surfaceClaim: assertable なのに derivedFromBucket が confirmed でない（${c.claimId}・過剰主張）`);
    }
    // #8 confirmation_needed が ask_eligible 以外で出る（claim 自身の exposureBinding で判定）
    if (c.claimType === "confirmation_needed" && c.exposureBinding !== "ask_eligible") {
      out.push(`surfaceClaim: confirmation_needed が ask_eligible 以外で出ている（${c.claimId}・exposureBinding=${c.exposureBinding}）`);
    }
    // exposureBinding に internal_only/none を使わない
    if (c.exposureBinding === "internal_only" || c.exposureBinding === "none") {
      out.push(`surfaceClaim: claim exposureBinding に "${c.exposureBinding}" を使用（claim 経路に乗せない）`);
    }
    // #9 genericizeRequired なのに category 露出
    if (c.redactionPolicy.subjectExposesCategory !== false) out.push(`surfaceClaim: subjectExposesCategory が false でない（${c.claimId}）`);
    if (c.redactionPolicy.genericizeRequired && c.redactionPolicy.redactionReason.length === 0) out.push(`surfaceClaim: genericizeRequired なのに redactionReason 欠落（${c.claimId}）`);
    // #10 subjectNodeId が raw label/text 形式
    if (c.subjectNodeId !== null && !isIdLike(c.subjectNodeId)) out.push(`surfaceClaim: subjectNodeId が id 形式でない（${c.claimId}・raw label の疑い）`);
    // #12 evidenceRefs が field-level（非空）でない
    if (c.evidenceContract.evidenceRefs.length === 0) out.push(`surfaceClaim: evidenceRefs 欠落（${c.claimId}）`);
    for (const r of c.evidenceContract.evidenceRefs) if (!r) out.push(`surfaceClaim: 空 evidenceRef（${c.claimId}）`);
    // #11 copy/notification/contact/dispatch/action field 構造 assert
    for (const f of FORBIDDEN_FIELDS) {
      if (f in (c as unknown as Record<string, unknown>)) out.push(`surfaceClaim: 禁止 field "${f}" が claim に存在（${c.claimId}）`);
    }
    // displayPolicy 妥当
    if (!["visible", "hidden", "debugOnly", "notActionable"].includes(c.displayPolicy)) out.push(`surfaceClaim: displayPolicy 不正（${c.claimId}）`);
  }

  // #13 suppressedClaimRefs の reason に evidenceRefs
  for (const s of set.suppressedClaimRefs) {
    if (s.reason.evidenceRefs.length === 0) out.push(`surfaceClaim: suppressedClaimRef "${s.surfaceKind}" の evidenceRefs 欠落`);
  }
  // set 構造 assert（consumer payload field を持たない）
  for (const f of FORBIDDEN_FIELDS) {
    if (f in (set as unknown as Record<string, unknown>)) out.push(`surfaceClaim: 禁止 field "${f}" が claimSet に存在`);
  }
  return out;
}

/**
 * plan と claimSet の整合検証（空=適合）。**surface emission の前提ゲート**。CEO surfaceClaimBindingViolations 必須 10 項。
 */
export function surfaceClaimBindingViolations(plan: JudgmentSurfacePlanV0, set: SurfaceClaimSetV0): string[] {
  const out: string[] = [];
  // #1 surfacePlanId 一致
  if (set.surfacePlanId !== plan.trace.surfacePlanId) out.push(`binding: claimSet.surfacePlanId が plan.trace.surfacePlanId と不一致`);
  // #2 exposure none/internal_only なのに claims 非空
  if ((plan.exposureLevel === "none" || plan.exposureLevel === "internal_only") && set.claims.length > 0) {
    out.push(`binding: exposure "${plan.exposureLevel}" なのに claims が非空`);
  }
  const planRank = userFacingExposureRank(plan.exposureLevel);
  const seen = new Set<string>();
  for (const c of set.claims) {
    // #6 duplicate claimId（binding 時にも）
    if (seen.has(c.claimId)) out.push(`binding: duplicate claimId "${c.claimId}"`);
    seen.add(c.claimId);
    // #1 surfacePlanId（claim sourceRefs）
    if (c.sourceRefs.surfacePlanId !== plan.trace.surfacePlanId) out.push(`binding: claim "${c.claimId}" が別 plan 由来`);
    // #4 exposureBinding が internal_only
    if (c.exposureBinding === "internal_only" || c.exposureBinding === "none") out.push(`binding: claim "${c.claimId}" の exposureBinding が "${c.exposureBinding}"（claim 経路に乗せない）`);
    // #3 exposureBinding が plan.exposureLevel を超える（userFacingExposureRank 比較）
    if (userFacingExposureRank(c.exposureBinding) > planRank) out.push(`binding: claim "${c.claimId}" の exposureBinding が plan.exposureLevel を超える`);
    // #5 withheld claim を bind
    if (c.assertability === "withheld") out.push(`binding: withheld claim "${c.claimId}" を bind しようとしている`);
    // #7 confirmation_needed が plan ask_eligible 以外
    if (c.claimType === "confirmation_needed" && (plan.exposureLevel !== "ask_eligible" || !plan.clarificationOnly)) {
      out.push(`binding: confirmation_needed claim "${c.claimId}" が plan ask_eligible/clarificationOnly でない場面で出ている`);
    }
  }
  // #9/#10 claimSet/claim を consumer payload 扱いする field が無い（direct read / payload leak 構造遮断）
  for (const f of FORBIDDEN_FIELDS) {
    if (f in (set as unknown as Record<string, unknown>)) out.push(`binding: claimSet に consumer payload field "${f}"`);
  }
  return out;
}

/**
 * 検証通過時のみ BoundSurfaceV0 を返す（CEO #3: failure-loud = 違反時 throw・静かに捨てない）。
 * plan を mutate しない。**BoundSurfaceV0 も consumer payload ではない**（internal bundle）。
 */
export function bindClaimsToPlan(plan: JudgmentSurfacePlanV0, set: SurfaceClaimSetV0): BoundSurfaceV0 {
  const setV = surfaceClaimSetViolations(set);
  const bindV = surfaceClaimBindingViolations(plan, set);
  const all = [...setV, ...bindV];
  if (all.length > 0) {
    throw new Error(`bindClaimsToPlan: binding 違反のため bind 不可（${all.length} 件）: ${all.join(" / ")}`);
  }
  return { schemaVersion: 0, surfacePlanId: plan.trace.surfacePlanId, surfacePlan: plan, claimSet: set };
}
