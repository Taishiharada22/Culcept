/**
 * SurfaceProjection — RJ2d 内部 object → consumer-facing payload の唯一の境界（pure core 限定）
 *
 * 正本: docs/reality-surface-projection-impl-design-rj2d-0.md（RJ2d-0A revised・red-team 反映）/ docs/reality-judgment-surface-boundary-rj2-0.md
 *   / CEO RJ2d 実装 GO（2026-06-14・5 walker validated binding 必須ガード付き）
 *
 * 思想（consumer 境界・ただし文面ではない）: RJ2a plan / RJ2b BoundSurface(plan+claimSet) / RJ2c questionSet を consume して
 *   初めて **consumer-facing object** を作る。ただし **copy（文面）は出さない**（RJ2e HOLD）。consumer view が運ぶのは
 *   「表示してよい最小構造」（display 可否・consumer-safe kind・opaque subject ref）であって、文・選択肢・ラベル・
 *   assertability・evidence・decision metadata ではない。
 *
 * 中核原則（red-team 反映）:
 *   ① **allowlist 構築（strip しない）**: consumer view object は安全 field のみを 1 つずつ明示構築する。内部 object を
 *      spread/copy しない → 内部 field が consumer view に入る経路を構造的に無くす（field 追加 leak-by-omission 不可）。
 *   ② **ConsumerView と InternalBundle の型分離**: trace/id/decision metadata は InternalBundle のみ。consumer は
 *      bundle.consumerView のみ受け取る。
 *   ③ **consumer-safe kind 完全変換**: internal kind（11）を category-free な consumer-safe kind（7）に変換。4 gate
 *      question を needs_verification 1 値に潰し sensitive/work/reservation/otherPeople を区別不能化。
 *   ④ **id/trace/decision metadata 全除去**・opaque projection-local ref・boundary boolean only。
 *   ⑤ **serialization backstop**: JSON.stringify(consumerView) に禁止トークンが出ないことを walker で検証。
 *   ⑥ **validated binding failure-loud**: 5 walker（plan/claimSet/claim binding/questionSet/question binding）+ 整合を
 *      全実行し、どれか 1 つでも violation があれば throw（BoundSurfaceV0 は TS 上偽造可能ゆえ上流を信頼しすぎない）。
 *
 * 規律（CEO）: RJ2a/b/c 3 ファイル不接触（consume only）・既存 6 判断器不接触・ern/cs/mv/snapshot/identity 不接触。
 *   no UI / API / DB write / localStorage / migration / external read / location / notification / action / copy /
 *   proposal content / 3案 / departure content / question text / answer choice text。pure（I/O・時刻 API・乱数なし）。
 */

import type { RealityInstant } from "./realityInstant";
import { LEAVEBY_LEAK_TOKENS } from "./leaveByLeakTokens";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import { surfacePlanViolations, type JudgmentSurfacePlanV0 } from "./judgmentSurfacePlan";
import {
  surfaceClaimSetViolations,
  surfaceClaimBindingViolations,
  type BoundSurfaceV0,
  type SurfaceClaimSetV0,
  type SurfaceClaimType,
} from "./surfaceClaim";
import {
  clarificationQuestionSetViolations,
  clarificationQuestionBindingViolations,
  type ClarificationQuestionSetV0,
  type ClarificationQuestionKind,
} from "./clarificationQuestion";

export const SURFACE_PROJECTION_VERSION = 0;

/** consumer-safe claim kind（4・category を漏らさない） */
export type ProjectedClaimKind = "observation" | "status_note" | "info_incomplete" | "needs_confirmation";
/** consumer-safe question kind（3・gate category を漏らさない） */
export type ProjectedQuestionKind = "needs_verification" | "resolve_overlap" | "resolve_missing_info";

/** internal claimType → consumer-safe（category-free） */
const PROJECTED_CLAIM_KIND: Record<SurfaceClaimType, ProjectedClaimKind> = {
  passive_observation: "observation",
  collapse_fragility_present: "status_note",
  unresolved_input_present: "info_incomplete",
  movement_unresolved_reference: "info_incomplete",
  confirmation_needed: "needs_confirmation",
};
/** internal questionKind → consumer-safe（4 gate を needs_verification 1 値に潰す） */
const PROJECTED_QUESTION_KIND: Record<ClarificationQuestionKind, ProjectedQuestionKind> = {
  confirm_other_people: "needs_verification",
  confirm_reservation_payment: "needs_verification",
  confirm_work_shift: "needs_verification",
  confirm_sensitive_handling: "needs_verification",
  resolve_time_collision_ambiguity: "resolve_overlap",
  resolve_unresolved_input: "resolve_missing_info",
};

/** consumer に見せてよい claim（**allowlist 構築・decision metadata なし**） */
export interface ProjectedClaimView {
  readonly kind: ProjectedClaimKind;
  readonly subjectRef: string | null; // opaque projection-local（"subject_1" 等）
}

/** consumer に見せてよい question（**allowlist 構築・decision metadata なし**） */
export interface ProjectedQuestionView {
  readonly kind: ProjectedQuestionKind;
  readonly subjectRef: string | null; // opaque projection-local
  readonly relationRef: string | null; // opaque projection-local（resolve_overlap の grouping のみ）
}

/** consumer が読む唯一の object（trace なし・id なし・decision metadata なし） */
export interface SurfaceProjectionConsumerViewV0 {
  readonly schemaVersion: 0;
  readonly display: "render" | "suppress";
  readonly claims: ReadonlyArray<ProjectedClaimView>;
  readonly questions: ReadonlyArray<ProjectedQuestionView>;
  readonly proposalAvailable: false;
  readonly departureAvailable: false;
}

export interface SurfaceProjectionTrace {
  readonly schemaVersion: 0;
  readonly projectionId: string;
  readonly projectionVersion: number;
  readonly surfacePlanId: string;
  readonly snapshotId: string;
  readonly claimCount: number;
  readonly questionCount: number;
  readonly evaluatedAtInstant: RealityInstant;
}

/** internal only（consumer へ直接渡さない） */
export interface SurfaceProjectionInternalBundleV0 {
  readonly schemaVersion: 0;
  readonly consumerView: SurfaceProjectionConsumerViewV0; // 唯一の consumer 出口
  readonly projectionId: string; // internal（consumer view には出さない）
  readonly surfacePlanId: string;
  readonly snapshotId: string;
  readonly internalReasons: { readonly proposal: "proposal_hold_content"; readonly departure: "departure_blocked" };
  readonly subjectRefMap: ReadonlyArray<{ readonly opaque: string; readonly internalNodeId: string }>;
  readonly relationRefMap: ReadonlyArray<{ readonly opaque: string; readonly internalRelationId: string }>;
  readonly projectionTrace: SurfaceProjectionTrace;
}

export interface DeriveSurfaceProjectionInput {
  readonly boundSurface: BoundSurfaceV0;
  readonly questionSet: ClarificationQuestionSetV0;
}

/**
 * plan↔claimSet↔questionSet の整合 + 5 walker を全実行（空=適合）。**surface emission の前提ゲート**。
 * CEO 追加ガード: BoundSurfaceV0 は TS 上偽造可能ゆえ、plan 単体 / claimSet 単体 / claim binding / questionSet 単体 /
 * question binding の全層を再検査する。
 */
export function surfaceProjectionBindingViolations(bound: BoundSurfaceV0, questionSet: ClarificationQuestionSetV0): string[] {
  const out: string[] = [];
  const plan = bound.surfacePlan;
  // 整合
  if (bound.surfacePlanId !== plan.trace.surfacePlanId) out.push("projectionBinding: bound.surfacePlanId が plan.trace.surfacePlanId と不一致");
  if (bound.claimSet.surfacePlanId !== plan.trace.surfacePlanId) out.push("projectionBinding: claimSet.surfacePlanId が plan.trace.surfacePlanId と不一致");
  if (questionSet.surfacePlanId !== plan.trace.surfacePlanId) out.push("projectionBinding: questionSet.surfacePlanId が plan.trace.surfacePlanId と不一致");
  // 5 walker 全実行
  out.push(...surfacePlanViolations(plan)); // #1 plan 単体
  out.push(...surfaceClaimSetViolations(bound.claimSet)); // #2 claimSet 単体
  out.push(...surfaceClaimBindingViolations(plan, bound.claimSet)); // #3 claim binding
  out.push(...clarificationQuestionSetViolations(questionSet)); // #4 questionSet 単体
  out.push(...clarificationQuestionBindingViolations(plan, questionSet)); // #5 question binding
  return out;
}

/**
 * BoundSurface + questionSet を consume して consumer projection を組む（pure・allowlist 構築・plan/claim/question を mutate しない）。
 * **failure-loud**: validated binding（5 walker + 整合）に違反があれば throw。
 */
export function deriveSurfaceProjection(input: DeriveSurfaceProjectionInput): SurfaceProjectionInternalBundleV0 {
  const bound = input.boundSurface;
  const questionSet = input.questionSet;
  const plan = bound.surfacePlan;
  const claimSet: SurfaceClaimSetV0 = bound.claimSet;

  // ── validated binding（failure-loud・5 walker 全実行）──
  const bindingViolations = surfaceProjectionBindingViolations(bound, questionSet);
  if (bindingViolations.length > 0) {
    throw new Error(`deriveSurfaceProjection: validated binding 違反のため projection 不可（${bindingViolations.length} 件）: ${bindingViolations.join(" / ")}`);
  }

  const surfacePlanId = plan.trace.surfacePlanId;
  const snapshotId = plan.sourceRefs.snapshotId;

  // ── opaque map（raw id → projection-local・**配列出現順採番**・raw へ戻せない）──
  const subjectMap = new Map<string, string>();
  const relationMap = new Map<string, string>();
  const opaqueSubject = (id: string | null): string | null => {
    if (id === null) return null;
    let o = subjectMap.get(id);
    if (!o) {
      o = `subject_${subjectMap.size + 1}`;
      subjectMap.set(id, o);
    }
    return o;
  };
  const opaqueRelation = (id: string | null): string | null => {
    if (id === null) return null;
    let o = relationMap.get(id);
    if (!o) {
      o = `relation_${relationMap.size + 1}`;
      relationMap.set(id, o);
    }
    return o;
  };

  const display: "render" | "suppress" = plan.exposureLevel === "none" || plan.exposureLevel === "internal_only" ? "suppress" : "render";

  // ── claim view を allowlist 構築（spread しない・withheld 除外・出現順で opaque 採番）──
  const claims: ProjectedClaimView[] =
    display === "suppress"
      ? []
      : claimSet.claims
          .filter((c) => c.assertability !== "withheld")
          .map((c) => ({ kind: PROJECTED_CLAIM_KIND[c.claimType], subjectRef: opaqueSubject(c.subjectNodeId) }));

  // ── question view を allowlist 構築（spread しない・ask_eligible のみ）──
  const questions: ProjectedQuestionView[] =
    plan.exposureLevel === "ask_eligible"
      ? questionSet.questions.map((q) => ({
          kind: PROJECTED_QUESTION_KIND[q.questionKind],
          subjectRef: opaqueSubject(q.subjectNodeId),
          relationRef: opaqueRelation(q.relationRef),
        }))
      : [];

  // ── consumer view（許可 field のみ・id/trace/metadata なし）──
  const consumerView: SurfaceProjectionConsumerViewV0 = {
    schemaVersion: 0,
    display,
    claims,
    questions,
    proposalAvailable: false,
    departureAvailable: false,
  };

  const projectionId = `pj:${fnv1a64Hex(canonicalSerialize({ sp: surfacePlanId, k: "surface_projection", v: SURFACE_PROJECTION_VERSION }))}`;

  return {
    schemaVersion: 0,
    consumerView,
    projectionId, // internal only
    surfacePlanId,
    snapshotId,
    internalReasons: { proposal: "proposal_hold_content", departure: "departure_blocked" },
    subjectRefMap: [...subjectMap.entries()].map(([internalNodeId, opaque]) => ({ opaque, internalNodeId })),
    relationRefMap: [...relationMap.entries()].map(([internalRelationId, opaque]) => ({ opaque, internalRelationId })),
    projectionTrace: {
      schemaVersion: 0,
      projectionId,
      projectionVersion: SURFACE_PROJECTION_VERSION,
      surfacePlanId,
      snapshotId,
      claimCount: claims.length,
      questionCount: questions.length,
      evaluatedAtInstant: plan.trace.evaluatedAtInstant,
    },
  };
}

// ── consumer view 許可 key 集合（完全一致強制）──
const VIEW_KEYS: ReadonlyArray<string> = ["schemaVersion", "display", "claims", "questions", "proposalAvailable", "departureAvailable"];
const CLAIM_VIEW_KEYS: ReadonlyArray<string> = ["kind", "subjectRef"];
const QUESTION_VIEW_KEYS: ReadonlyArray<string> = ["kind", "subjectRef", "relationRef"];
const PROJECTED_CLAIM_KINDS: ReadonlySet<string> = new Set(["observation", "status_note", "info_incomplete", "needs_confirmation"]);
const PROJECTED_QUESTION_KINDS: ReadonlySet<string> = new Set(["needs_verification", "resolve_overlap", "resolve_missing_info"]);
/** serialization backstop の禁止トークン（lowercase 比較・leak 最終防壁・CEO 指定） */
const FORBIDDEN_TOKENS: ReadonlyArray<string> = [
  "ern:",
  "cl:",
  "q:",
  "sp:",
  "pj:",
  "snapshot",
  "evidence",
  "sourcerefs",
  "missinginput",
  "trace",
  "gate",
  "derivedfrom",
  "why",
  "sensitive",
  "reservation",
  "work",
  "otherpeople",
  "confirmed",
  "inferred",
  "rj2d",
  "_v0",
  "graphviewerkey",
  // RD2f-wiring-P1: leaveBy internal field token（consumerView に exact instant / timeContract が漏れないことを保証）
  ...LEAVEBY_LEAK_TOKENS,
];

function keysExact(obj: Record<string, unknown>, allowed: ReadonlyArray<string>): boolean {
  const k = Object.keys(obj);
  if (k.length !== allowed.length) return false;
  const s = new Set(allowed);
  return k.every((x) => s.has(x));
}

/** consumer view 検証（許可 key 完全一致 + consumer-safe kind + opaque ref + serialization backstop・空=適合） */
export function surfaceProjectionConsumerViewViolations(v: SurfaceProjectionConsumerViewV0): string[] {
  const out: string[] = [];
  const rec = v as unknown as Record<string, unknown>;

  // #1 top-level 許可 key 完全一致
  if (!keysExact(rec, VIEW_KEYS)) out.push(`projectionView: top-level key が許可集合と不一致（${Object.keys(rec).join(",")}）`);
  // #7 display
  if (v.display !== "render" && v.display !== "suppress") out.push(`projectionView: display 不正 "${v.display}"`);
  // #8 suppress なのに非空
  if (v.display === "suppress" && (v.claims.length > 0 || v.questions.length > 0)) out.push("projectionView: display suppress なのに claims/questions が非空");
  // #9 boundary boolean
  if (v.proposalAvailable !== false) out.push("projectionView: proposalAvailable が false でない");
  if (v.departureAvailable !== false) out.push("projectionView: departureAvailable が false でない");

  // #2/#4/#6 claim item
  for (const c of v.claims) {
    const cr = c as unknown as Record<string, unknown>;
    if (!keysExact(cr, CLAIM_VIEW_KEYS)) out.push(`projectionView: claim item key が {kind,subjectRef} と不一致（${Object.keys(cr).join(",")}）`);
    if (!PROJECTED_CLAIM_KINDS.has(c.kind)) out.push(`projectionView: claim kind が consumer-safe 集合外 "${c.kind}"（internal kind 混入）`);
    if (c.subjectRef !== null && !c.subjectRef.startsWith("subject_")) out.push(`projectionView: claim subjectRef が opaque でない "${c.subjectRef}"`);
  }
  // #3/#5/#6 question item
  for (const q of v.questions) {
    const qr = q as unknown as Record<string, unknown>;
    if (!keysExact(qr, QUESTION_VIEW_KEYS)) out.push(`projectionView: question item key が {kind,subjectRef,relationRef} と不一致（${Object.keys(qr).join(",")}）`);
    if (!PROJECTED_QUESTION_KINDS.has(q.kind)) out.push(`projectionView: question kind が consumer-safe 集合外 "${q.kind}"（internal kind 混入）`);
    if (q.subjectRef !== null && !q.subjectRef.startsWith("subject_")) out.push(`projectionView: question subjectRef が opaque でない "${q.subjectRef}"`);
    if (q.relationRef !== null && !q.relationRef.startsWith("relation_")) out.push(`projectionView: question relationRef が opaque でない "${q.relationRef}"`);
  }

  // #10 serialization backstop（全 leak の最終防壁）
  const json = JSON.stringify(v).toLowerCase();
  for (const t of FORBIDDEN_TOKENS) {
    if (json.includes(t)) out.push(`projectionView: serialization に禁止トークン "${t}" が出現（leak）`);
  }
  return out;
}
