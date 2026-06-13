/**
 * JudgmentSurfacePlanV0 — RJ2a 判断 → surface 露出境界の包絡（pure core 限定）
 *
 * 正本: docs/reality-judgment-surface-boundary-rj2-0.md（RJ2-0/RJ2-0A）+ docs/reality-surface-plan-impl-design-rj2a-0.md
 *   （RJ2a-0/RJ2a-0A 実装設計）/ CEO RJ2a 実装 GO（2026-06-14・actionBoundary cap 防御検証ガード付き）
 *
 * 思想（surface boundary = internal judgment が user-facing object に近づく唯一の入口）:
 *   InterventionDecision（今この瞬間に黙る/観測/確認/内部準備/ブロック）を受けて、**何を surface 化してよいかの
 *   包絡（exposure envelope）+ 何を・なぜ出さなかったかの正直化（suppression honesty）+ 機械検証（walker）**だけを
 *   組む。**user-facing copy でも通知でも提案でも質問文でも出発線でもない**。claim 生成（RJ2b）・question 生成
 *   （RJ2c）・proposal/departure 実動（RJ2d）・copy（RJ2e）・notification（RJ2f）は HOLD（型に存在させない）。
 *
 * 不変条件（CEO・default-deny・INV-0/4/9/10/11）:
 *   - **core 直結禁止**: surface 化は必ず本 plan を経由（INV-0）。
 *   - **exposure ≤ decisionKind ≤ actionBoundary**（INV-4）。decisionKind は core で actionBoundary に capped 済みゆえ
 *     exposureLevel は decisionKind の**直接写像**で導く（min-rank をやめる — RJ2a-0A）。
 *   - **internal_only と passive_only を混ぜない**（RJ2a-0A）: internal_prepare → internal_only（**user-facing でない**）。
 *     passive_only（observe・L1 user-facing passive 可能性）と非線形・別枝。user-facing rank: none=internal_only<passive_only<ask_eligible。
 *   - **notActionable で kill しない**（INV-9）: exposureLevel は decisionKind 由来。notActionable は「表示可・操作不可」。
 *   - **surface object ≠ user display**（INV-10）: 本 plan は internal object。consumer payload でも表示でもない。
 *   - **active_prompt 非配信 / dispatch 命令でない**（INV-11）: plan に delivery/dispatch field を持たせない。
 *   - **default-deny**: allowedClaimRefs/clarificationCandidateRefs/proposalCandidateRefs/departureLineRefs は v0 常に []。
 *   - **actionBoundary cap 防御検証（CEO 追加ガード）**: core が正しい前提に依存しすぎない。surfacePlanViolations で
 *     exposureLevel が actionBoundary ceiling を超えたら FAIL。ask_eligible は decisionKind==="ask_clarification" かつ
 *     actionBoundary が許す時のみ。display_only/blocked で ask_eligible にしない。draft_only を user-facing ask に進ませない。
 *
 * 規律（CEO）: no UI / API / DB・Supabase write / localStorage / migration / external read / location / notification /
 *   action / user-facing copy / proposal / 3案 / departure line。consume only（surface → core の一方向・逆流なし）。
 *   既存 6 判断器ファイル不接触（feasibility/collapseRisk/collapsePropagation/interventionEligibility/
 *   interventionDecision/realityJudgmentInput）。ern/cs/mv/snapshot/identity も型 import のみ。
 *   pure（I/O・時刻 API・乱数なし）。SURFACE_PLAN_VERSION は graph manifest と独立。
 */

import type { RealityGraphSnapshotV0 } from "./realityGraphSnapshot";
import type { MissingInputRef } from "./momentSnapshot";
import type { RealityInstant } from "./realityInstant";
import { fnv1a64Hex, canonicalSerialize } from "./graphIdentity";
import { targetScopeKey, type TargetScope } from "./realityJudgmentInput";
import type { FeasibilityJudgmentV0, FeasibilityReason, JudgmentConfidence } from "./feasibilityJudgment";
import type { CollapseRiskProfileV0 } from "./collapseRisk";
import type { CollapsePropagationMapV0 } from "./collapsePropagation";
import type { InterventionEligibilityV0, ActionBoundary } from "./interventionEligibility";
import type { InterventionDecisionV0, DecisionKind } from "./interventionDecision";

export const SURFACE_PLAN_VERSION = 0;

/**
 * surface 露出の包絡（RJ2a-0A: 4 値・**非線形**）。decisionKind/actionBoundary を超えない。
 *   none          : 何も surface 化しない（silent/blocked）
 *   internal_only : internal prepared material boundary。**user-facing 不可**（internal_prepare・準備のみ許可）
 *   passive_only  : L1 passive object を将来作れる可能性（observe・copy/UI はまだ不可）
 *   ask_eligible  : L2 clarification candidate object を将来作れる可能性（ask_clarification・文面はまだ不可）
 * user-facing exposure 順: none = internal_only < passive_only < ask_eligible（internal_only は user-facing 0）。
 */
export type SurfaceExposureLevel = "none" | "internal_only" | "passive_only" | "ask_eligible";

/** 抑制された surface の正直な記録（何を・なぜ出さなかったか） */
export interface SuppressedSurfaceRef {
  readonly surfaceKind: string; // "user_facing_judgment" / "internal_material" / "clarification" / "proposal_candidate" / "three_option" / "departure_line" / "notification" / "contact"
  readonly reason: FeasibilityReason; // code + targetNodeId + field-level evidenceRefs
}

export interface SurfacePlanTrace {
  readonly schemaVersion: 0;
  readonly surfacePlanId: string; // 決定的 cache key・内容証明でない・raw viewerId 不含
  readonly surfacePlanVersion: number;
  readonly graphBaseId: string;
  readonly snapshotId: string;
  readonly feasibilityJudgmentId: string;
  readonly collapseRiskProfileId: string;
  readonly collapsePropagationId: string;
  readonly eligibilityId: string;
  readonly interventionDecisionId: string;
  readonly usedInputRefs: ReadonlyArray<string>; // field-level
  readonly evidenceRefs: ReadonlyArray<string>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>;
  readonly evaluatedAtInstant: RealityInstant; // = decision.evaluatedAtInstant・identity 対象外
}

export interface JudgmentSurfacePlanV0 {
  readonly schemaVersion: 0;
  readonly targetScope: TargetScope;
  readonly targetNodeId: string | null;
  // ── 露出包絡（decisionKind/actionBoundary を超えない） ──
  readonly exposureLevel: SurfaceExposureLevel;
  readonly carriedDecisionKind: DecisionKind; // carry（監査）
  readonly carriedActionBoundary: ActionBoundary; // carry
  // ── 許可された surface 集合（default-deny・RJ2a は content を埋めない＝空） ──
  readonly allowedClaimRefs: ReadonlyArray<string>; // RJ2b が埋める。RJ2a 常に []
  readonly clarificationCandidateRefs: ReadonlyArray<string>; // RJ2c が埋める。RJ2a 常に []
  readonly proposalCandidateRefs: ReadonlyArray<string>; // v0 常に []
  readonly departureLineRefs: ReadonlyArray<string>; // v0 常に []（G2.5 構造遮断）
  // ── surface gate（carry・無視不可） ──
  readonly redactionPolicyRef: string | null; // RJ2b。RJ2a 常に null
  readonly permissionGateRef: string | null; // RJ2d。RJ2a 常に null
  readonly displayRedactionRequired: boolean; // eligibility から carry
  readonly clarificationOnly: boolean; // decisionKind==="ask_clarification" のみ true（INV-CLAR-A）
  // ── 正直さ ──
  readonly suppressedSurfaces: ReadonlyArray<SuppressedSurfaceRef>;
  readonly whyExposable: ReadonlyArray<FeasibilityReason>;
  readonly whyNotExposable: ReadonlyArray<FeasibilityReason>;
  readonly missingInputRefs: ReadonlyArray<MissingInputRef>; // carry
  readonly evidenceRefs: ReadonlyArray<string>; // field-level・carry
  readonly confidence: JudgmentConfidence; // decision から carry
  readonly displayPolicy: "visible" | "hidden" | "debugOnly" | "notActionable";
  readonly sourceRefs: {
    readonly dayGraphSnapshotId: string;
    readonly snapshotId: string;
    readonly feasibilityJudgmentId: string;
    readonly collapseRiskProfileId: string;
    readonly collapsePropagationId: string;
    readonly eligibilityId: string;
    readonly interventionDecisionId: string;
  };
  readonly trace: SurfacePlanTrace;
}

export interface DeriveSurfacePlanInput {
  readonly graphSnapshot: RealityGraphSnapshotV0;
  readonly feasibilityJudgment: FeasibilityJudgmentV0;
  readonly collapseRiskProfile: CollapseRiskProfileV0;
  readonly collapsePropagationMap: CollapsePropagationMapV0;
  readonly interventionEligibility: InterventionEligibilityV0;
  readonly interventionDecision: InterventionDecisionV0;
}

function reason(code: string, targetNodeId: string | null, evidenceRefs: ReadonlyArray<string>): FeasibilityReason {
  return { code, targetNodeId, evidenceRefs };
}

/**
 * decisionKind → exposureLevel の**直接写像**（min-rank ではない — RJ2a-0A）。
 * internal_only と passive_only は非線形・別枝ゆえ単一 rank で min を取ると internal_prepare→passive_only に化ける。
 * decisionKind は core で actionBoundary に capped 済み（decisionKind ≤ actionBoundary）なので直接写像で十分。
 */
export function exposureForDecisionKind(dk: DecisionKind): SurfaceExposureLevel {
  switch (dk) {
    case "blocked":
      return "none";
    case "silent":
      return "none";
    case "observe":
      return "passive_only";
    case "internal_prepare":
      return "internal_only"; // ★ user-facing でない（passive_only にしない）
    case "ask_clarification":
      return "ask_eligible";
  }
}

/** user-facing exposure rank（internal_only は user-facing 0）。defense / walker 用 */
function userFacingExposureRank(e: SurfaceExposureLevel): number {
  switch (e) {
    case "none":
      return 0;
    case "internal_only":
      return 0; // user-facing 無し
    case "passive_only":
      return 1;
    case "ask_eligible":
      return 2;
  }
}

/** actionBoundary が許す user-facing exposure の天井 rank（CEO 防御ガード） */
function actionBoundaryUserFacingCeiling(b: ActionBoundary): number {
  switch (b) {
    case "blocked":
      return 0; // 何も surface 化しない
    case "display_only":
      return 1; // observe → passive_only まで
    case "draft_only":
      return 1; // internal_prepare→internal_only / observe→passive_only。**user-facing ask に進ませない**
    case "ask_confirmation":
      return 2; // ask_clarification → ask_eligible
    // v0 で write_anchor 以上は eligibility が天井にしない（来ても ask_eligible まで保守 cap）
    case "write_anchor":
    case "send_message":
    case "book_pay":
    case "external_communication":
      return 2;
  }
}

/**
 * RJ 判断チェーン（6 入力）を consume して surface 露出包絡を組む（pure・複製しない・一方向）。
 * **integrity guard**（不一致 throw・同一 snapshot / chain 由来か）を先に通す。
 */
export function deriveSurfacePlan(input: DeriveSurfacePlanInput): JudgmentSurfacePlanV0 {
  const snapshot = input.graphSnapshot;
  const fj = input.feasibilityJudgment;
  const crp = input.collapseRiskProfile;
  const prop = input.collapsePropagationMap;
  const elig = input.interventionEligibility;
  const dec = input.interventionDecision;

  // ── integrity guard: snapshotId が graphSnapshot 一致（×5）──
  if (fj.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("deriveSurfacePlan: feasibilityJudgment の snapshotId 不一致");
  if (crp.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("deriveSurfacePlan: collapseRiskProfile の snapshotId 不一致");
  if (prop.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("deriveSurfacePlan: collapsePropagationMap の snapshotId 不一致");
  if (elig.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("deriveSurfacePlan: interventionEligibility の snapshotId 不一致");
  if (dec.sourceRefs.snapshotId !== snapshot.snapshotId) throw new Error("deriveSurfacePlan: interventionDecision の snapshotId 不一致");
  // ── integrity guard: chain（別 slice 由来でないか）──
  if (crp.sourceRefs.feasibilityJudgmentId !== fj.judgmentTrace.judgmentId) throw new Error("deriveSurfacePlan: collapseRiskProfile が別 feasibilityJudgment 由来");
  if (prop.sourceRefs.collapseRiskProfileId !== crp.trace.collapseRiskId) throw new Error("deriveSurfacePlan: collapsePropagationMap が別 collapseRiskProfile 由来");
  if (elig.sourceRefs.feasibilityJudgmentId !== fj.judgmentTrace.judgmentId) throw new Error("deriveSurfacePlan: interventionEligibility が別 feasibilityJudgment 由来");
  if (dec.sourceRefs.eligibilityId !== elig.trace.eligibilityId) throw new Error("deriveSurfacePlan: interventionDecision が別 interventionEligibility 由来");
  // ── scope: decision を正本とし eligibility と一致確認 ──
  if (targetScopeKey(dec.targetScope) !== targetScopeKey(elig.targetScope)) throw new Error("deriveSurfacePlan: decision と eligibility の targetScope 不一致");

  const scope = dec.targetScope;
  const targetNodeId = dec.targetNodeId;
  const decisionKind = dec.decisionKind;
  const boundary = dec.actionBoundary;

  // ── exposureLevel = decisionKind 直接写像（min-rank ではない・RJ2a-0A）──
  const exposureLevel = exposureForDecisionKind(decisionKind);

  const clarificationOnly = decisionKind === "ask_clarification"; // INV-CLAR-A
  const displayRedactionRequired = elig.displayRedactionRequired; // carry
  const confidence = dec.confidence; // carry（permission 緩めない）
  const displayPolicy: JudgmentSurfacePlanV0["displayPolicy"] =
    exposureLevel === "none" || exposureLevel === "internal_only" ? "notActionable" : "visible"; // internal_only も user-facing でない

  // ── suppressedSurfaces（正直化・RJ2a-0A: 4 状態を理由で分離）──
  const suppressed: SuppressedSurfaceRef[] = [];
  const supp = (code: string, surfaceKind: string, ev: ReadonlyArray<string>): void => {
    suppressed.push({ surfaceKind, reason: reason(code, targetNodeId, ev) });
  };

  if (decisionKind === "blocked") {
    // 全 user-facing + internal を suppress（internal 準備も不可）
    const ev = ["decision:blocked", ...dec.blockedReasons.flatMap((r) => r.evidenceRefs).slice(0, 6)];
    supp("surface_suppressed_blocked", "user_facing_judgment", ev.length > 1 ? ev : ["decision:blocked", "eligibility_blocked"]);
    supp("surface_suppressed_blocked", "internal_material", ["decision:blocked"]);
    supp("surface_suppressed_blocked", "clarification", ["decision:blocked"]);
  } else if (decisionKind === "silent") {
    // 全 surface suppress（contact/output なし）
    supp("surface_suppressed_silent_no_contact", "user_facing_judgment", ["decision:silent", "no_contact"]);
    supp("surface_suppressed_silent_no_contact", "internal_material", ["decision:silent"]);
    supp("surface_suppressed_silent_no_contact", "clarification", ["decision:silent"]);
  } else if (decisionKind === "internal_prepare") {
    // internal-only boundary: user-facing 層のみ suppress（internal 準備は allowed・blocked/silent とは別理由）
    supp("user_facing_suppressed_internal_only_boundary", "user_facing_judgment", ["decision:internal_prepare", "internal_only_boundary"]);
    supp("user_facing_suppressed_internal_only_boundary", "clarification", ["decision:internal_prepare", "internal_only_boundary"]);
  } else if (decisionKind === "observe") {
    // passive surface eligible・user-facing passive 可。ask を suppress（passive は eligible）
    supp("clarification_suppressed_by_decisionKind:observe", "clarification", ["decision:observe"]);
  }
  // ask_clarification: clarification は eligible（候補生成は RJ2c）→ clarification を suppress しない

  // 構造的・常に suppress（v0 HOLD / 構造遮断）
  supp("departure_suppressed_movement_unresolved", "departure_line", ["leaveBy_unresolved_v0", "movement_input_gate"]); // INV-DEP-A
  supp("proposal_hold_v0", "proposal_candidate", ["proposal_hold_v0"]);
  supp("proposal_hold_v0", "three_option", ["proposal_hold_v0"]);
  supp("contact_hold_rj2f", "notification", ["contact_hold_rj2f"]);
  supp("contact_hold_rj2f", "contact", ["contact_hold_rj2f"]);

  // ── whyExposable / whyNotExposable ──
  const whyExposable: FeasibilityReason[] = [];
  if (exposureLevel === "passive_only") {
    whyExposable.push(reason("decision_permits_passive_surface", targetNodeId, ["decision:observe", ...dec.whyNowFactors.flatMap((r) => r.evidenceRefs).slice(0, 4)]));
  } else if (exposureLevel === "ask_eligible") {
    whyExposable.push(reason("decision_permits_clarification_eligible", targetNodeId, ["decision:ask_clarification", ...dec.whyNowFactors.flatMap((r) => r.evidenceRefs).slice(0, 4)]));
  }
  const whyNotExposable: FeasibilityReason[] = [
    ...dec.whyNotFactors,
    ...(decisionKind === "blocked" ? dec.blockedReasons : []),
  ];

  // ── identity（決定的 cache key・raw viewerId 不含[snapshotId 擬名化済]）──
  const surfacePlanId = `sp:${fnv1a64Hex(
    canonicalSerialize({ s: snapshot.snapshotId, scope: targetScopeKey(scope), dk: decisionKind, k: "surface_plan", v: SURFACE_PLAN_VERSION }),
  )}`;

  const usedInputRefs = [
    ...new Set([
      `decision:${decisionKind}`,
      `actionBoundary:${boundary}`,
      `exposure:${exposureLevel}`,
      dec.trace.decisionId,
      elig.trace.eligibilityId,
      fj.judgmentTrace.judgmentId,
      crp.trace.collapseRiskId,
      prop.trace.collapsePropagationId,
    ]),
  ].sort();

  const trace: SurfacePlanTrace = {
    schemaVersion: 0,
    surfacePlanId,
    surfacePlanVersion: SURFACE_PLAN_VERSION,
    graphBaseId: snapshot.graphBaseId,
    snapshotId: snapshot.snapshotId,
    feasibilityJudgmentId: fj.judgmentTrace.judgmentId,
    collapseRiskProfileId: crp.trace.collapseRiskId,
    collapsePropagationId: prop.trace.collapsePropagationId,
    eligibilityId: elig.trace.eligibilityId,
    interventionDecisionId: dec.trace.decisionId,
    usedInputRefs,
    evidenceRefs: dec.evidenceRefs, // carry（field-level）
    missingInputRefs: dec.missingInputRefs, // carry（source trace 不失）
    evaluatedAtInstant: dec.trace.evaluatedAtInstant, // identity 対象外
  };

  return {
    schemaVersion: 0,
    targetScope: scope,
    targetNodeId,
    exposureLevel,
    carriedDecisionKind: decisionKind,
    carriedActionBoundary: boundary,
    allowedClaimRefs: [], // RJ2b
    clarificationCandidateRefs: [], // RJ2c
    proposalCandidateRefs: [], // v0
    departureLineRefs: [], // v0（構造遮断）
    redactionPolicyRef: null, // RJ2b
    permissionGateRef: null, // RJ2d
    displayRedactionRequired,
    clarificationOnly,
    suppressedSurfaces: suppressed,
    whyExposable,
    whyNotExposable,
    missingInputRefs: dec.missingInputRefs, // carry
    evidenceRefs: dec.evidenceRefs, // carry（field-level）
    confidence,
    displayPolicy,
    sourceRefs: {
      dayGraphSnapshotId: snapshot.sourceRefs.dayGraphSnapshotId,
      snapshotId: snapshot.snapshotId,
      feasibilityJudgmentId: fj.judgmentTrace.judgmentId,
      collapseRiskProfileId: crp.trace.collapseRiskId,
      collapsePropagationId: prop.trace.collapsePropagationId,
      eligibilityId: elig.trace.eligibilityId,
      interventionDecisionId: dec.trace.decisionId,
    },
    trace,
  };
}

const EXPOSURE_LEVELS: ReadonlySet<string> = new Set(["none", "internal_only", "passive_only", "ask_eligible"]);
/** 型に存在してはいけない field 名（copy / notification / contact / dispatch / action / authority leak）。構造 assert */
const FORBIDDEN_FIELDS: ReadonlyArray<string> = [
  "claimTextDraft",
  "draftText",
  "copy",
  "text",
  "userMessage",
  "message",
  "proposal",
  "proposals",
  "departureLine",
  "departureLines",
  "threeOptions",
  "notify",
  "notification",
  "notifications",
  "contact",
  "push",
  "dispatch",
  "deliveryMode",
  "deliveryModeCeiling",
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
 * surface plan の構造健全性検証（空 = 適合）。fixture / 監査が使用。
 * **RJ2a-real**（plan 段で検証可能）/ **RJ2b-defer**（claim/projection 段）を区別。CEO 防御ガード（actionBoundary cap）込み。
 */
export function surfacePlanViolations(p: JudgmentSurfacePlanV0): string[] {
  const out: string[] = [];
  if (!EXPOSURE_LEVELS.has(p.exposureLevel)) out.push(`surfacePlan: exposureLevel 不正 "${p.exposureLevel}"`);

  const userFacingRefsNonEmpty =
    p.allowedClaimRefs.length > 0 || p.clarificationCandidateRefs.length > 0 || p.proposalCandidateRefs.length > 0 || p.departureLineRefs.length > 0;

  // #1 blocked なのに refs 非空
  if (p.carriedDecisionKind === "blocked" && userFacingRefsNonEmpty) out.push("surfacePlan: blocked なのに surface refs が非空");
  // #2 silent なのに refs 非空
  if (p.carriedDecisionKind === "silent" && userFacingRefsNonEmpty) out.push("surfacePlan: silent なのに surface refs が非空");
  // #3 decisionKind !== ask_clarification なのに clarificationOnly=true
  if (p.carriedDecisionKind !== "ask_clarification" && p.clarificationOnly) out.push("surfacePlan: ask_clarification でないのに clarificationOnly=true");
  // #3' ask_clarification なのに clarificationOnly=false（双方向整合）
  if (p.carriedDecisionKind === "ask_clarification" && !p.clarificationOnly) out.push("surfacePlan: ask_clarification なのに clarificationOnly=false");
  // #4 decisionKind !== ask_clarification なのに clarificationCandidateRefs 非空
  if (p.carriedDecisionKind !== "ask_clarification" && p.clarificationCandidateRefs.length > 0) out.push("surfacePlan: ask_clarification でないのに clarificationCandidateRefs が非空");
  // #5 departureLineRefs 非空（v0 常に []）
  if (p.departureLineRefs.length > 0) out.push("surfacePlan: departureLineRefs が非空（v0 構造遮断違反）");
  // #6 proposalCandidateRefs 非空（v0 常に []）
  if (p.proposalCandidateRefs.length > 0) out.push("surfacePlan: proposalCandidateRefs が非空（v0 HOLD 違反）");
  // #6' allowedClaimRefs 非空（RJ2b 未実装・v0 常に []）
  if (p.allowedClaimRefs.length > 0) out.push("surfacePlan: allowedClaimRefs が非空（RJ2b 未実装・v0 []）");
  // #8 exposureLevel none（notActionable/blocked/silent 含む）なのに user-facing refs 非空
  if (p.exposureLevel === "none" && userFacingRefsNonEmpty) out.push("surfacePlan: exposureLevel none なのに surface refs が非空");

  // #11 exposureLevel が decisionKind / actionBoundary ceiling を超える（CEO 防御ガード）
  const eRank = userFacingExposureRank(p.exposureLevel);
  const decRank = userFacingExposureRank(exposureForDecisionKind(p.carriedDecisionKind));
  const boundaryCeiling = actionBoundaryUserFacingCeiling(p.carriedActionBoundary);
  if (eRank > decRank) out.push("surfacePlan: exposureLevel が decisionKind 由来 exposure を超える");
  if (eRank > boundaryCeiling) out.push(`surfacePlan: exposureLevel "${p.exposureLevel}" が actionBoundary "${p.carriedActionBoundary}" の ceiling を超える`);
  // ask_eligible は decisionKind===ask_clarification かつ actionBoundary が許す時のみ（CEO 防御ガード）
  if (p.exposureLevel === "ask_eligible" && (p.carriedDecisionKind !== "ask_clarification" || boundaryCeiling < 2)) {
    out.push("surfacePlan: ask_eligible が ask_clarification/actionBoundary の許可なく出ている");
  }

  // #18 exposureLevel が decisionKind 直接写像と厳密一致（min-rank 由来の化けを防ぐ・RJ2a-0A）
  if (p.exposureLevel !== exposureForDecisionKind(p.carriedDecisionKind)) {
    out.push(`surfacePlan: exposureLevel "${p.exposureLevel}" が decisionKind "${p.carriedDecisionKind}" の直接写像と不一致`);
  }

  // #15 internal_prepare なのに passive_only（internal_only 必須）
  if (p.carriedDecisionKind === "internal_prepare" && p.exposureLevel === "passive_only") out.push("surfacePlan: internal_prepare なのに exposureLevel passive_only（internal_only 必須）");
  // #16 internal_prepare なのに user-facing refs 非空
  if (p.carriedDecisionKind === "internal_prepare" && userFacingRefsNonEmpty) out.push("surfacePlan: internal_prepare なのに user-facing refs が非空");
  // #17 internal_prepare なのに clarificationOnly=true
  if (p.carriedDecisionKind === "internal_prepare" && p.clarificationOnly) out.push("surfacePlan: internal_prepare なのに clarificationOnly=true");

  // displayPolicy 整合（none/internal_only → notActionable / passive_only・ask_eligible → visible）
  if ((p.exposureLevel === "none" || p.exposureLevel === "internal_only") && p.displayPolicy !== "notActionable") {
    out.push("surfacePlan: exposureLevel none/internal_only なのに displayPolicy が notActionable でない");
  }
  if ((p.exposureLevel === "passive_only" || p.exposureLevel === "ask_eligible") && p.displayPolicy !== "visible") {
    out.push("surfacePlan: exposureLevel passive_only/ask_eligible なのに displayPolicy が visible でない");
  }

  // #9/#10/#12/#13/#19 構造 assert（型に copy/notification/contact/dispatch/action/authority leak field が無い）
  for (const f of FORBIDDEN_FIELDS) {
    if (f in (p as unknown as Record<string, unknown>)) out.push(`surfacePlan: 禁止 field "${f}" が存在する（copy/notification/dispatch/authority leak）`);
  }
  // graphViewerKey は sourceRefs/trace にも出さない（authority/payload leak 防止）
  if ("graphViewerKey" in (p.sourceRefs as unknown as Record<string, unknown>) || "graphViewerKey" in (p.trace as unknown as Record<string, unknown>)) {
    out.push("surfacePlan: graphViewerKey が sourceRefs/trace に露出している");
  }

  // carry 健全性
  if (!p.trace.surfacePlanId) out.push("surfacePlan: surfacePlanId が空");
  if (typeof p.displayRedactionRequired !== "boolean") out.push("surfacePlan: displayRedactionRequired が boolean でない");
  for (const r of p.missingInputRefs) {
    if (!r.sourceNodeId || !r.dedupeKey) out.push(`surfacePlan: missingInputRef "${r.code}" の source trace 欠落`);
  }
  for (const s of p.suppressedSurfaces) {
    if (s.reason.evidenceRefs.length === 0) out.push(`surfacePlan: suppressedSurface "${s.surfaceKind}" の evidenceRefs 欠落`);
  }
  return out;
}
