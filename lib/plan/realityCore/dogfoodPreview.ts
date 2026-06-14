/**
 * dogfoodPreview — RJ2g 内部 dogfood preview の **safe payload 構築 + token leak guard**（pure・server-side 用）
 *
 * 正本: docs/reality-surface-dogfood-preview-boundary-rj2g-0.md（RJ2g-0）/ CEO RJ2g 実装 GO（2026-06-14・client props 専用 DTO）
 *
 * 思想（最初の UI は最小・最安全）: RJ2 chain（RJ2a–2f）の出力を operator が観測するための **safe payload** を作る。
 *   v0 は **代表シナリオ（決定論的 fixture・DB read なし）**で全 decision type の surface を見せる。read-only は DB に
 *   触れないことで**構造的に保証**。実 operator anchor 配線は別 GO（RC2a 初の実データ配線ゆえ first UI と分離・CEO ③④）。
 *
 * 不変条件:
 *   - client へ渡すのは `RealitySurfaceDogfoodPreviewPayloadV0` のみ（consumerView[RJ2d] / renderedCopy[RJ2e] /
 *     delivery safe subset[eligibility/channelCeiling/deliveredNow]）。**internal object/trace/id を含まない**。
 *   - `deliveredNow=false` 維持（RJ2f kill-switch）。
 *   - 各シナリオは RJ2d/RJ2e walker を通過したもののみ（unsafe は除外）。
 *   - **token leak guard**: payload を JSON 化して raw/internal token が出ないことを検証（fail-closed・呼び元が render 中止）。
 *   - pure（I/O・時刻 API・乱数なし）。reference instant は呼び元（page）が constant で渡す（lib は new Date しない）。
 */

import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { compileEventRealityNodes } from "./compileEventRealityNodes";
import { compileMovementReality } from "./movementReality";
import { compileCommitmentSignals, type CommitmentSignalV0 } from "./commitmentSignal";
import { deriveDecisionDebt } from "./decisionDebt";
import { deriveMomentSnapshot } from "./momentSnapshot";
import { assembleRealityGraph } from "./realityGraphSnapshot";
import { graphViewerKey } from "./graphIdentity";
import { makeRealityInstantJst } from "./realityInstant";
import { inferredAttribute } from "./realityAttribute";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import { buildRealityJudgmentInput, type TargetScope } from "./realityJudgmentInput";
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
import { evaluateDeliveryEligibility, type DeliveryChannelV0, type DeliveryEligibilityV0 } from "./deliveryGate";

export const DOGFOOD_PREVIEW_VERSION = 0;

/** client が読んでよい唯一の delivery 表現（safe subset・suppressedReasons/carriedDecisionKind/trace を含まない） */
export interface DeliverySafeSummaryV0 {
  readonly eligibility: DeliveryEligibilityV0;
  readonly channelCeiling: DeliveryChannelV0;
  readonly deliveredNow: false;
}

/** 1 シナリオの safe payload（internal object を含まない） */
export interface DogfoodScenarioV0 {
  readonly scenarioKey: string; // token-free（leak token を含まない）
  readonly label: string; // 表示ラベル（leak token を含まない）
  readonly consumerView: SurfaceProjectionConsumerViewV0; // RJ2d safe-by-construction
  readonly renderedCopy: RenderedCopyV0; // RJ2e exact catalog
  readonly delivery: DeliverySafeSummaryV0;
}

/** client props 専用 DTO（client へ渡してよい唯一の payload） */
export interface RealitySurfaceDogfoodPreviewPayloadV0 {
  readonly schemaVersion: 0;
  readonly scenarios: ReadonlyArray<DogfoodScenarioV0>;
}

const DATE = "2026-06-12";
const VIEWER = graphViewerKey("dogfood-operator-preview");
const place = () => inferredAttribute(0.9, 0.9, ["preview"], { status: "confirmed", displayPolicy: "visible" });
const noMv = () => inferredAttribute(false, 0.9, ["preview"], { status: "confirmed", displayPolicy: "visible" });
const perm = (n: number) => inferredAttribute(n, 0.7, ["preview"], { status: "inferred" }) as EventRealityNodeV0["permissionLevel"];
const yes = () => inferredAttribute(true, 0.7, ["preview"], { status: "inferred", displayPolicy: "visible" });
const no = () => inferredAttribute(false, 0.7, ["preview"], { status: "inferred", displayPolicy: "visible" });
const gatesAbsent = () => ({ otherPeoplePossible: no(), reservationOrPaymentPossible: no(), workOrShiftPossible: no() });
const CLEAR = { placeCertainty: place(), movementRequired: noMv(), permissionLevel: perm(2) };

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return { anchorKind: "one_off", sourceId: "preview-src", title: "予定", date: DATE, rigidity: "soft", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}
const ERN = (id: string) => `ern:${DATE}:${id}`;

interface ScenarioDef {
  readonly key: string;
  readonly label: string;
  readonly anchors: ReadonlyArray<ExternalAnchor>;
  readonly scope: TargetScope;
  readonly overrides: (ernBase: ReadonlyArray<EventRealityNodeV0>) => {
    ernOverrides: Record<string, Partial<EventRealityNodeV0>>;
    csOverrides: Record<string, Partial<CommitmentSignalV0>>;
  };
}

function confHard(ernBase: ReadonlyArray<EventRealityNodeV0>, id: string): Partial<EventRealityNodeV0> {
  const fx = ernBase.find((e) => e.eventRealityNodeId === id)!.fixedness;
  return { placeCertainty: place(), movementRequired: noMv(), permissionLevel: perm(2), fixedness: { ...fx, status: "confirmed", source: "known_from_user", displayPolicy: "visible" } };
}

const SCENARIOS: ReadonlyArray<ScenarioDef> = [
  {
    key: "scenario_observe",
    label: "観測のみ（届けない）",
    anchors: [anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })],
    scope: { kind: "event", eventRealityNodeId: ERN("a1") },
    overrides: () => ({ ernOverrides: { [ERN("a1")]: CLEAR }, csOverrides: { [ERN("a1")]: gatesAbsent() } }),
  },
  {
    key: "scenario_ask",
    label: "確認したいことがある",
    anchors: [anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })],
    scope: { kind: "event", eventRealityNodeId: ERN("a1") },
    overrides: () => ({ ernOverrides: { [ERN("a1")]: CLEAR }, csOverrides: { [ERN("a1")]: { otherPeoplePossible: yes(), reservationOrPaymentPossible: no(), workOrShiftPossible: no() } } }),
  },
  {
    key: "scenario_overlap",
    label: "重なって見える予定の確認",
    anchors: [anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" }), anchor({ id: "a2", startTime: "14:00", endTime: "15:00", locationText: "渋谷", rigidity: "hard" })],
    scope: { kind: "day" },
    overrides: (ernBase) => ({ ernOverrides: { [ERN("a1")]: confHard(ernBase, ERN("a1")), [ERN("a2")]: confHard(ernBase, ERN("a2")) }, csOverrides: { [ERN("a1")]: gatesAbsent(), [ERN("a2")]: gatesAbsent() } }),
  },
  {
    key: "scenario_silent",
    label: "非表示（沈黙）",
    anchors: [anchor({ id: "a1", startTime: "14:00", endTime: "15:00", locationText: "渋谷" })],
    scope: { kind: "event", eventRealityNodeId: ERN("a1") },
    overrides: () => ({ ernOverrides: { [ERN("a1")]: { placeCertainty: place(), movementRequired: noMv(), permissionLevel: perm(0) } }, csOverrides: {} }),
  },
];

/** 1 シナリオを RJ2 chain で組み、safe payload にする（unsafe walker 検出時は null で除外） */
function buildScenario(def: ScenarioDef, referenceInstantUtc: Date): DogfoodScenarioV0 | null {
  try {
    const { graph } = buildDayGraph({ anchors: [...def.anchors], date: DATE });
    const ernBase = compileEventRealityNodes({ date: DATE, graph, anchors: [...def.anchors] });
    const mv = compileMovementReality({ date: DATE, graph });
    const csBase = compileCommitmentSignals({ date: DATE, graph, anchors: [...def.anchors] });
    const decisionDebt = deriveDecisionDebt({ subjectiveDate: DATE, graph, ern: ernBase, mv, cs: csBase });
    const instant = makeRealityInstantJst(referenceInstantUtc);
    const momentState = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
    const momentSnapshot = deriveMomentSnapshot({ instant, momentState, ern: ernBase, mv, cs: csBase, decisionDebt });

    const { ernOverrides, csOverrides } = def.overrides(ernBase);
    const ern = ernBase.map((e) => (ernOverrides[e.eventRealityNodeId] ? { ...e, ...ernOverrides[e.eventRealityNodeId] } : e));
    const cs = csBase.map((c) => (csOverrides[c.targetNodeId] ? { ...c, ...csOverrides[c.targetNodeId] } : c));
    const snapshot = assembleRealityGraph({ ern, mv, cs, momentSnapshot, viewerKey: VIEWER });

    const fj = evaluateFeasibility(buildRealityJudgmentInput(snapshot, def.scope));
    const crp = evaluateCollapseRisk({ graphSnapshot: snapshot, feasibilityJudgment: fj });
    const prop = evaluateCollapsePropagation({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp });
    const elig = evaluateInterventionEligibility({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, targetScope: def.scope });
    const dec = evaluateInterventionDecision({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig });
    const plan = deriveSurfacePlan({ graphSnapshot: snapshot, feasibilityJudgment: fj, collapseRiskProfile: crp, collapsePropagationMap: prop, interventionEligibility: elig, interventionDecision: dec });
    const claimSet = deriveSurfaceClaims({ surfacePlan: plan, feasibilityJudgment: fj, collapseRiskProfile: crp, interventionEligibility: elig, interventionDecision: dec });
    const bound = bindClaimsToPlan(plan, claimSet);
    const questionSet = deriveClarificationQuestions({ surfacePlan: plan, feasibilityJudgment: fj, collapseRiskProfile: crp, interventionEligibility: elig, interventionDecision: dec });
    const consumerView = deriveSurfaceProjection({ boundSurface: bound, questionSet }).consumerView;
    const renderedCopy = renderCopy(consumerView);
    const delivery = evaluateDeliveryEligibility({ interventionDecision: dec, userInAppSurfaceOptIn: true, recentSurfaceCount: 0, surfaceBudgetRemaining: 5 });

    // defense: unsafe なシナリオは出さない（RJ2d/RJ2e walker 再実行）
    if (surfaceProjectionConsumerViewViolations(consumerView).length > 0) return null;
    if (copyViolations(renderedCopy).length > 0) return null;

    return {
      scenarioKey: def.key,
      label: def.label,
      consumerView,
      renderedCopy,
      delivery: { eligibility: delivery.eligibility, channelCeiling: delivery.channelCeiling, deliveredNow: delivery.deliveredNow },
    };
  } catch {
    return null; // fail-closed: 組めないシナリオは除外
  }
}

/**
 * dogfood preview の safe payload を組む（pure・DB read なし・決定論的）。
 * referenceInstantUtc は呼び元（page）が constant で渡す（lib は new Date しない＝決定論的）。
 */
export function buildDogfoodPreviewScenarios(referenceInstantUtc: Date): RealitySurfaceDogfoodPreviewPayloadV0 {
  const scenarios = SCENARIOS.map((d) => buildScenario(d, referenceInstantUtc)).filter((s): s is DogfoodScenarioV0 => s !== null);
  return { schemaVersion: 0, scenarios };
}

/** token leak guard（payload に raw/internal token が出ないか・fail-closed・CEO 列挙 + 構造）。空=安全 */
const LEAK_TOKENS: ReadonlyArray<string> = [
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
];

export function dogfoodPayloadLeakViolations(payload: RealitySurfaceDogfoodPreviewPayloadV0): string[] {
  const json = JSON.stringify(payload).toLowerCase();
  const out: string[] = [];
  for (const t of LEAK_TOKENS) if (json.includes(t)) out.push(`dogfoodPreview: payload に leak token "${t}" が出現`);
  return out;
}
