/**
 * operatorDayPreview — RD1a operator 当日 one-off anchor の real-data preview orchestration（read-only・pure 部 + 注入 read）
 *
 * 正本: docs/reality-real-data-wiring-readiness-rd0.md（RD0）/ CEO RD1a 実装 GO（2026-06-14・one-off のみ・recurring 除外）
 *
 * 思想（既存の honest 層をそのまま実データに通す・field 変換でなく orchestration）: operator 本人の anchor を read-only で
 *   読み、**当日 one-off のみ**を RC2a（buildDayGraph + compile*・place→unknown/ETA→knownFalse の honest 経路）に流し、
 *   RJ2 chain → **safe DTO** にする。新規 field 変換ロジックを作らない（fake 禁止は RC2a が既に enforce）。
 *
 * RD1a 範囲（blast radius 抑制・CEO ③④）:
 *   - **one-off 当日 anchor のみ**当日 graph に入れる。**recurring は読む + 件数把握するが当日 graph に入れない**（展開しない）。
 *   - real-data unavailable（anchor 0 / 当日 one-off 0 / assemble 失敗 / leak）→ **fixture へ fallback しない**（fail-closed・unavailable status）。
 *   - **client へ raw anchor / internal graph / trace / recurrenceRule / companions / sourceId を渡さない**（safe DTO のみ）。
 *
 * 不変条件: read-only（listAnchors select のみ・write/seed/api/localStorage/service_role なし）・place/route/ETA/leaveBy
 *   /otherPeople/permission を fake しない（RC2a 経由）・currentLocation/weather 不使用・subjectiveDate は server now（JST v0）
 *   由来・deliveredNow=false・通知なし。pure 部は時刻 API/乱数なし（referenceInstantUtc は注入）。
 */

import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { resolveTodayRecurring } from "@/lib/plan/recurringDayResolver";
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { compileEventRealityNodes } from "./compileEventRealityNodes";
import { compileMovementReality } from "./movementReality";
import { compileCommitmentSignals } from "./commitmentSignal";
import { deriveDecisionDebt } from "./decisionDebt";
import { deriveMomentSnapshot } from "./momentSnapshot";
import { assembleRealityGraph, type RealityGraphSnapshotV0 } from "./realityGraphSnapshot";
import { LEAVEBY_LEAK_TOKENS } from "./leaveByLeakTokens";
import { graphViewerKey } from "./graphIdentity";
import { makeRealityInstantJst } from "./realityInstant";
import { buildRealityJudgmentInput } from "./realityJudgmentInput";
import { evaluateFeasibility } from "./feasibilityJudgment";
import { evaluateCollapseRisk } from "./collapseRisk";
import { evaluateCollapsePropagation } from "./collapsePropagation";
import { evaluateInterventionEligibility } from "./interventionEligibility";
import { evaluateInterventionDecision } from "./interventionDecision";
import { deriveSurfacePlan } from "./judgmentSurfacePlan";
import { deriveSurfaceClaims, bindClaimsToPlan } from "./surfaceClaim";
import { deriveClarificationQuestions } from "./clarificationQuestion";
import { deriveSurfaceProjection, surfaceProjectionConsumerViewViolations, type SurfaceProjectionConsumerViewV0 } from "./surfaceProjection";
import { renderCopy, copyViolations, type RenderedCopyV0 } from "./copySurface";
import { evaluateDeliveryEligibility } from "./deliveryGate";
import type { DeliverySafeSummaryV0 } from "./dogfoodPreview";

export const OPERATOR_DAY_PREVIEW_VERSION = 0;

export interface OperatorDayRealityPreviewInputV0 {
  readonly operatorUserId: string;
  readonly referenceInstantUtc: Date; // server now（境界が注入・pure 部は時刻を持たない）。JST v0
}

/** read 依存（注入・テスト可能化）。listAnchors は owner-RLS・select のみ */
export interface OperatorDayPreviewDeps {
  readonly listAnchors: (userId: string) => Promise<ExternalAnchor[]>;
}

/** safe summary（client へ渡してよい・raw anchor/internal を含まない・count のみ）。RD1b: recurring 内訳 4 種 */
export interface RealDaySurfaceSummaryV0 {
  readonly oneOffIncludedCount: number;
  readonly recurringIncludedCount: number; // 当日 occur して graph に入れた recurring（RD1b）
  readonly recurringExcludedCount: number; // valid だが当日でない recurring
  readonly recurringInvalidCount: number; // 展開不能（不正/非WEEKLY/期限外）→ 当日に入れない
}

/** real-day preview の safe DTO（client へ渡す唯一）。unavailable 時は consumerView 等 null・reasonCode は dev 用 generic status */
export interface RealDaySurfacePayloadV0 {
  readonly schemaVersion: 0;
  readonly mode: "real";
  readonly available: boolean;
  readonly reasonCode: string | null; // generic（no_anchor / no_today_oneoff / assemble_failed / walker_blocked / leak_blocked）
  readonly summary: RealDaySurfaceSummaryV0;
  readonly consumerView: SurfaceProjectionConsumerViewV0 | null;
  readonly renderedCopy: RenderedCopyV0 | null;
  readonly delivery: DeliverySafeSummaryV0 | null;
}

/** 当日 anchor 分離（pure・one-off 当日 + recurring 全件・recurring 展開は resolveTodayRecurring が担当） */
export function selectDayAnchors(anchors: ReadonlyArray<ExternalAnchor>, subjectiveDate: string): { oneOff: ExternalAnchor[]; recurring: ExternalAnchor[] } {
  const oneOff = anchors.filter((a) => a.anchorKind === "one_off" && a.date === subjectiveDate);
  const recurring = anchors.filter((a) => a.anchorKind === "recurring");
  return { oneOff: [...oneOff], recurring: [...recurring] };
}

/** 当日 anchor（one-off + 当日 occur recurring）から RealityGraphSnapshot を組む（pure・既存 honest compile を consume・fake しない） */
export function buildOperatorDaySnapshot(dayAnchors: ReadonlyArray<ExternalAnchor>, subjectiveDate: string, referenceInstantUtc: Date, operatorUserId: string): RealityGraphSnapshotV0 {
  const anchors = [...dayAnchors];
  const { graph } = buildDayGraph({ anchors, date: subjectiveDate });
  const ern = compileEventRealityNodes({ date: subjectiveDate, graph, anchors });
  const mv = compileMovementReality({ date: subjectiveDate, graph });
  const cs = compileCommitmentSignals({ date: subjectiveDate, graph, anchors });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate, graph, ern, mv, cs });
  const instant = makeRealityInstantJst(referenceInstantUtc);
  const momentState = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
  const momentSnapshot = deriveMomentSnapshot({ instant, momentState, ern, mv, cs, decisionDebt });
  return assembleRealityGraph({ ern, mv, cs, momentSnapshot, viewerKey: graphViewerKey(operatorUserId) });
}

function unavailable(reasonCode: string, summary: RealDaySurfaceSummaryV0): RealDaySurfacePayloadV0 {
  return { schemaVersion: 0, mode: "real", available: false, reasonCode, summary, consumerView: null, renderedCopy: null, delivery: null };
}

/**
 * operator 当日 one-off の real-data preview を組む（read-only・**fixture へ fallback しない**・fail-closed）。
 * listAnchors は注入（owner-RLS・select のみ）。subjectiveDate は server now（JST）由来。
 */
export async function buildOperatorDayRealPayload(input: OperatorDayRealityPreviewInputV0, deps: OperatorDayPreviewDeps): Promise<RealDaySurfacePayloadV0> {
  const instant = makeRealityInstantJst(input.referenceInstantUtc);
  const subjectiveDate = instant.subjectiveDate;

  let anchors: ExternalAnchor[];
  try {
    anchors = await deps.listAnchors(input.operatorUserId); // read-only select（owner-RLS）
  } catch {
    return unavailable("assemble_failed", { oneOffIncludedCount: 0, recurringIncludedCount: 0, recurringExcludedCount: 0, recurringInvalidCount: 0 });
  }

  const { oneOff, recurring } = selectDayAnchors(anchors, subjectiveDate);
  // RD1b: recurring を既存 expandRecurrence で当日展開（materialize しない・不正は invalid 計上・当日に入れない）
  const rec = resolveTodayRecurring(recurring, subjectiveDate);
  const dayAnchors = [...oneOff, ...rec.included];
  const summary: RealDaySurfaceSummaryV0 = {
    oneOffIncludedCount: oneOff.length,
    recurringIncludedCount: rec.included.length,
    recurringExcludedCount: rec.excludedCount,
    recurringInvalidCount: rec.invalidCount,
  };

  if (anchors.length === 0) return unavailable("no_anchor", summary);
  if (dayAnchors.length === 0) return unavailable("no_today_event", summary); // **fixture へ fallback しない**

  try {
    const snapshot = buildOperatorDaySnapshot(dayAnchors, subjectiveDate, input.referenceInstantUtc, input.operatorUserId);
    const scope = { kind: "day" } as const;
    const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, scope));
    const crp = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: fj });
    const prop = evaluateCollapsePropagation({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp });
    const elig = evaluateInterventionEligibility({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, targetScope: scope });
    const dec = evaluateInterventionDecision({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig });
    const plan = deriveSurfacePlan({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig, interventionDecision: dec });
    const claimSet = deriveSurfaceClaims({ surfacePlan: plan, feasibilityJudgment: fj, collapseRiskProfile: crp, interventionEligibility: elig, interventionDecision: dec });
    const bound = bindClaimsToPlan(plan, claimSet);
    const questionSet = deriveClarificationQuestions({ surfacePlan: plan, feasibilityJudgment: fj, collapseRiskProfile: crp, interventionEligibility: elig, interventionDecision: dec });
    const consumerView = deriveSurfaceProjection({ boundSurface: bound, questionSet }).consumerView;
    const renderedCopy = renderCopy(consumerView);
    const dgate = evaluateDeliveryEligibility({ interventionDecision: dec, userInAppSurfaceOptIn: true, recentSurfaceCount: 0, surfaceBudgetRemaining: 5 });

    // defense: unsafe なら出さない（fixture へ fallback しない・unavailable）
    if (surfaceProjectionConsumerViewViolations(consumerView).length > 0) return unavailable("walker_blocked", summary);
    if (copyViolations(renderedCopy).length > 0) return unavailable("walker_blocked", summary);

    const payload: RealDaySurfacePayloadV0 = {
      schemaVersion: 0,
      mode: "real",
      available: true,
      reasonCode: null,
      summary,
      consumerView,
      renderedCopy,
      delivery: { eligibility: dgate.eligibility, channelCeiling: dgate.channelCeiling, deliveredNow: dgate.deliveredNow },
    };
    if (realDayPayloadLeakViolations(payload).length > 0) return unavailable("leak_blocked", summary);
    return payload;
  } catch {
    return unavailable("assemble_failed", summary);
  }
}

/** token leak guard（dogfood + raw anchor token 拡張・fail-closed・CEO 列挙）。空=安全 */
const REAL_LEAK_TOKENS: ReadonlyArray<string> = [
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
  "graphviewerkey",
  // RD1a 追加: raw anchor leak token（title は anchor の raw PII・現状 payload に無いが defense-in-depth で監視）
  "recurrencerule",
  "externaluid",
  "sourceid",
  "companions",
  "title",
  // RD2f-wiring-P1: leaveBy internal field token（defense-in-depth・operator real-data path は本 slice で未配線）
  ...LEAVEBY_LEAK_TOKENS,
];

export function realDayPayloadLeakViolations(payload: RealDaySurfacePayloadV0): string[] {
  const json = JSON.stringify(payload).toLowerCase();
  return REAL_LEAK_TOKENS.filter((t) => json.includes(t)).map((t) => `operatorDayPreview: payload に leak token "${t}" が出現`);
}
