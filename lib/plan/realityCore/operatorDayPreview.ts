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
import { assembleLeaveByBindings } from "./leaveByAssembly";
import { LEAVEBY_LEAK_TOKENS } from "./leaveByLeakTokens";
import {
  buildOperatorRealityReadiness,
  OPERATOR_REALITY_READINESS_INITIAL,
  type OperatorRealityReadinessSummaryV0,
} from "./operatorRealityReadiness";
import { graphViewerKey } from "./graphIdentity";
import {
  deriveOperatorPreviewLeaveByComputedPresent,
  deriveOperatorPreviewDepartureLineResult,
} from "./operatorPreviewLeaveByPresence";
import type { DurationConfirmationRowV0 } from "./durationConfirmation";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";
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
  /**
   * RD3x-P2: operator 本人の active duration_confirmations を read-only で供給（owner-RLS・select のみ・**任意**）。
   * flag OFF / 未注入 → consume を走らせず `leaveByComputedPresent=false`（fail-closed）。DB write しない。
   */
  readonly listDurationConfirmations?: (userId: string) => Promise<DurationConfirmationRowV0[]>;
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
  /**
   * RD3b-P1: operator real-data supply readiness 集計（safe・client へ渡してよい）。
   * v0 は provider 未注入ゆえ routeEtaCapability/durationValue/supply/computedPresent 系は常に 0。
   * raw anchor（title/locationText/sourceId/externalUid/companions/exact instant）を**一切含まない**。
   */
  readonly readiness: OperatorRealityReadinessSummaryV0;
  /**
   * RD3x-P2: **schema-state boolean のみ**（operator real-data preview 専用・safe）。
   * 「当日のどれかの event に internal computed leaveBy が attach されたか」だけを表す。
   * **departure-semantics でない**（leaveByKnown でない・exact instant / 出発時刻 / 間に合う / 遅れる ではない）。
   * exact instant / leaveByInstant / arrivalTargetInstant / timeContract / *Ref / durationValue / capability は出さない。
   * flag OFF / dep 未注入 / 当日 row 0 / computed 0 → false（fail-closed・本番デフォルト）。
   */
  readonly leaveByComputedPresent: boolean;
  /**
   * RD3g-P1: **L2 dev-only departure line candidate の schema-state boolean**（safe・leaveByComputedPresent とは独立）。
   * 「当日のどれかの event に **Gate B 全 AND を満たした** computed leaveBy が存在するか」だけを表す。
   * leaveByComputedPresent より厳しい（computed 存在に加え walker green / refs / planning-grade source / 非currentLocation 等を再確認）。
   * **departure line そのものでない・exact instant でない**（presence-only・出発時刻/間に合う/遅れる ではない）。
   * flag(realityOperatorDepartureLinePreview) OFF / dep 未注入 / Gate B 不成立 → false（fail-closed・本番デフォルト）。
   */
  readonly departureLineCandidatePresent: boolean;
  /**
   * RD3g-P2: **L2 dev-only departure HH:MM タイムスタンプ**（Gate B 全 AND 満足ノードの leaveByInstant から HH:MM のみ抽出）。
   * full ISO instant（YYYY-MM-DDTHH:MM:SS+09:00）/ 日付 / 秒 / TZ offset は**一切含まない**（HH:MM のみ）。
   * 「出発目安時刻として internal に計算された HH:MM を dev 観測用に出す」だけ。表示コピー・確定判断・notification でない。
   * flag(realityOperatorDepartureLineTimestampDev) OFF / Gate B 不成立 / leaveByInstant null → null（fail-closed）。
   */
  readonly departureLineTimestampHHMM: string | null;
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

  // RD2f-wiring-P2: flag-gated leaveBy enrichment seam（real-data path・empty supply ゆえ no-op = 何も attach されない）。
  // supplyCandidates: [] 固定・ernScopeByNodeId: {} 固定・RD2e-SUPPLY/computeLeaveBy 非呼び出し・trace 破棄（client 非露出）。
  // OFF（本番デフォルト）→ 完全 skip・ern そのまま（payload 差分ゼロ）。consumingInstant は既存 instant を流用。
  // mv は by-reference 不変（leaveByKnown/routeKnown/etaKnown/missingInputs を触らない）。
  const ernForGraph = PLAN_FLAGS.realityLeaveByEnrichPreview
    ? assembleLeaveByBindings({ eventRealityNodes: ern, supplyCandidates: [], consumingInstant: instant, ernScopeByNodeId: {} }).eventRealityNodes
    : ern;
  return assembleRealityGraph({ ern: ernForGraph, mv, cs, momentSnapshot, viewerKey: graphViewerKey(operatorUserId) });
}

function unavailable(reasonCode: string, summary: RealDaySurfaceSummaryV0, readiness: OperatorRealityReadinessSummaryV0 = OPERATOR_REALITY_READINESS_INITIAL): RealDaySurfacePayloadV0 {
  // RD3x-P2/RD3g-P1/RD3g-P2: unavailable は常に全 boolean/timestamp false/null（consume/Gate B へ進まない・fail-closed）。
  return { schemaVersion: 0, mode: "real", available: false, reasonCode, summary, consumerView: null, renderedCopy: null, delivery: null, readiness, leaveByComputedPresent: false, departureLineCandidatePresent: false, departureLineTimestampHHMM: null };
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
  // RD3b-P1: dayAnchors に到達した時点で readiness を集計（pure・raw 値を抽出しない・safe count + safe generic blocker code のみ）。
  const readiness = buildOperatorRealityReadiness({ allAnchorCount: anchors.length, dayAnchors });

  if (anchors.length === 0) return unavailable("no_anchor", summary, readiness);
  if (dayAnchors.length === 0) return unavailable("no_today_event", summary, readiness); // **fixture へ fallback しない**

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
    if (surfaceProjectionConsumerViewViolations(consumerView).length > 0) return unavailable("walker_blocked", summary, readiness);
    if (copyViolations(renderedCopy).length > 0) return unavailable("walker_blocked", summary, readiness);

    // RD3x-P2（L1 safe boolean）+ RD3g-P1（L2 departure candidate boolean）+ RD3g-P2（L2 departure HH:MM）:
    //   flag-gated・read-only consume → boolean/HH:MM のみ抽出（exact ISO instant / 内部 ref を payload に出さない）。
    //   各 flag は独立（exact 化・timestamp 化を別軸で kill 可能）。全 flag OFF / dep 未注入 → false/null 固定（consume 非実行）。
    //   rows は1回だけ read。wantDeparture || wantTimestamp → `deriveOperatorPreviewDepartureLineResult` で1回 buildAttachedNodes。
    //   read/consume 失敗 → 全 false/null（fail-closed・preview は継続）。
    let leaveByComputedPresent = false;
    let departureLineCandidatePresent = false;
    let departureLineTimestampHHMM: string | null = null;
    const wantLeaveBy = PLAN_FLAGS.realityOperatorPreviewLeaveBy;
    const wantDeparture = PLAN_FLAGS.realityOperatorDepartureLinePreview;
    const wantTimestamp = PLAN_FLAGS.realityOperatorDepartureLineTimestampDev;
    if ((wantLeaveBy || wantDeparture || wantTimestamp) && deps.listDurationConfirmations) {
      try {
        const rows = await deps.listDurationConfirmations(input.operatorUserId); // read-only select（owner-RLS・1 回だけ）
        const evaluatedAtIso = `${instant.calendarDate}T${instant.wallClockHHMM}:00+09:00`; // skew 0 = consuming instant
        const consumeInput = {
          dayAnchors,
          durationConfirmationRows: rows,
          subjectiveDate,
          evaluatedAtIso,
          consumingInstant: instant,
          nowIso: evaluatedAtIso,
        };
        if (wantLeaveBy) leaveByComputedPresent = await deriveOperatorPreviewLeaveByComputedPresent(consumeInput);
        if (wantDeparture || wantTimestamp) {
          // 共有: buildAttachedNodes は1回だけ（presence boolean と HH:MM timestamp を同時に取得）
          const dr = await deriveOperatorPreviewDepartureLineResult(consumeInput);
          if (wantDeparture) departureLineCandidatePresent = dr.present;
          if (wantTimestamp) departureLineTimestampHHMM = dr.timestampHHMM;
        }
      } catch {
        leaveByComputedPresent = false; // read/consume 失敗は全 false/null（preview 自体は継続）
        departureLineCandidatePresent = false;
        departureLineTimestampHHMM = null;
      }
    }

    const payload: RealDaySurfacePayloadV0 = {
      schemaVersion: 0,
      mode: "real",
      available: true,
      reasonCode: null,
      summary,
      consumerView,
      renderedCopy,
      delivery: { eligibility: dgate.eligibility, channelCeiling: dgate.channelCeiling, deliveredNow: dgate.deliveredNow },
      readiness,
      leaveByComputedPresent,
      departureLineCandidatePresent,
      departureLineTimestampHHMM,
    };
    if (realDayPayloadLeakViolations(payload).length > 0) return unavailable("leak_blocked", summary, readiness);
    return payload;
  } catch {
    return unavailable("assemble_failed", summary, readiness);
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
  // RD2f-wiring-P1: leaveBy internal field token（defense-in-depth）
  ...LEAVEBY_LEAK_TOKENS,
  // RD3x-P2: consume loop の internal object（durationValue / capability / originValidity / supply bundle）が
  //   万一 payload に serialize された場合に検出する distinctive 内部キー token（safe 集計 field と衝突しない・
  //   bare "capability"/"durationvalue" は readiness の *ReadyCount を誤検出するため使わない）。
  "usableforleavebycomputation", // PlanningGradeDurationValueV0 内部
  "arrivalprojectionknown", // RouteEtaCapabilityV0 内部
  "origintemporalvalidity", // supply bundle 内部
  "durationupperbound", // durationValue 内部
];

export function realDayPayloadLeakViolations(payload: RealDaySurfacePayloadV0): string[] {
  // RD3b-P1/RD3x-P2: `leaveByComputedPresentCount`（readiness 内 count）と `leaveByComputedPresent`（RD3x-P2 safe boolean）は
  //   意図的 safe field（exact instant でない）。但し token "leavebycomputed" の substring を含むため、走査前に**この既知
  //   safe key 文字列のみ除去**する（"leavebycomputedpresent" を除去すれば count キーの prefix も同時に消える）。
  //   内部 object `leaveByComputed: {leaveByInstant,timeContract,…}` が漏れた場合は依然 content token で検出される。
  // RD3g-P1: `departureLineCandidatePresent`（L2 safe boolean）も意図的 safe field（exact instant でない）。
  // RD3g-P2: `departureLineTimestampHHMM`（L2 dev-only HH:MM）も意図的 safe field。HH:MM 値（"16:00" 等）は
  //   ISO instant でなく REAL_LEAK_TOKENS と衝突しないが、defense-in-depth で key 文字列を走査前に除去する。
  const json = JSON.stringify(payload)
    .toLowerCase()
    .split("leavebycomputedpresent").join("")
    .split("departurelinecandidatepresent").join("")
    .split("departurelinetimestamphhmm").join("");
  return REAL_LEAK_TOKENS.filter((t) => json.includes(t)).map((t) => `operatorDayPreview: payload に leak token "${t}" が出現`);
}
