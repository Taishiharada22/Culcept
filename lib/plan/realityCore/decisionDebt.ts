/**
 * DecisionDebtV0 + Moment integration（RC2a-4・pure core 限定）
 *
 * 正本: docs/reality-graph-contract-hardening-rg06.md §5 / docs/reality-graph-state-model-addendum.md §4 /
 *       CEO RC2a-4 GO（2026-06-13）
 *
 * Department: Risk/Plan joint（未決の集約は Risk が統合・Plan が予定材料を提供）。
 *
 * 思想: decisionDebt は「未決定がどれだけ溜まっているか」= **介入方法が成分ごとに違う**ため、
 *   単一スコアに潰さず **components を正本**にする（合成は known のみの debugOnly 派生）。
 *
 * 不変条件（CEO 指示）:
 *  - **unknown を 0 にしない**（根拠の無い成分は value=null・status unknown。0/false 捏造禁止）
 *  - **decisionDebt 合計値だけを正本にしない**（components が正本・composite は debugOnly 派生）
 *  - debt 高 ≠ 自動介入 / debt 高 ≠ permission 緩和（本型は permission を持たない）
 *  - **commitment 高 = debt ではない**（commitment は changeDebt の材料の 1 つに留める）
 *  - **MovementReality absence を mobilityDebt 0 と解釈しない**（no movement node ≠ no mobility risk）
 *  - LLM 推定なし・UI 接続なし・pure（I/O・時刻 API・乱数なし。RealityInstant は注入）
 */

import type { DayGraph, EventNode } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { MomentStateV0 } from "@/lib/plan/dayState/dayStateTypes";
import {
  inferredAttribute,
  realityAttributeViolations,
  unknownAttribute,
  type RealityAttribute,
} from "./realityAttribute";
import type { EventRealityNodeV0 } from "./eventRealityNode";
import type { MovementRealityV0 } from "./movementReality";
import type { CommitmentSignalV0 } from "./commitmentSignal";
import type { RealityInstant } from "./realityInstant";

/** derive version（RC2a-1b §4 — manifest 一致 fixture） */
export const DECISION_DEBT_DERIVE_VERSION = 0;

/** 各成分 = 未決件数（count・事実）の RealityAttribute + 不足入力。0-1 スコアの捏造はしない */
export type DecisionDebtComponentV0 = RealityAttribute<number> & {
  readonly missingInputs: ReadonlyArray<string>;
};

export interface DecisionDebtComponents {
  /** 場所未指定（locationText 欠落）の予定数 */
  readonly placeDebt: DecisionDebtComponentV0;
  /** 時間不確実（durationSource=assumed_default）の予定数 */
  readonly timeDebt: DecisionDebtComponentV0;
  /** 移動未解決（mv の ETA 未供給）件数。mv 不在でも place 欠落があれば unknown（0 にしない） */
  readonly mobilityDebt: DecisionDebtComponentV0;
  /** 確認待ち。OriginInference 未実装 → unknown（材料候補: cs otherPeople/reservation unknown） */
  readonly confirmationDebt: DecisionDebtComponentV0;
  /** 候補選択待ち。RequestRealityFrame/PlaceCandidate 未実装 → unknown */
  readonly candidateDebt: DecisionDebtComponentV0;
  /** 返信/フォロー待ち。communication follow-up source 未実装 → unknown */
  readonly followupDebt: DecisionDebtComponentV0;
  /** 未確定の予定変更。drift tracking 未実装 → 弱材料（高 changeCost 件数）+ missingInput */
  readonly changeDebt: DecisionDebtComponentV0;
  /** スヌーズ反復。intervention reaction source 未実装 → unknown */
  readonly snoozeDebt: DecisionDebtComponentV0;
}

export const DECISION_DEBT_COMPONENT_KEYS = [
  "placeDebt",
  "timeDebt",
  "mobilityDebt",
  "confirmationDebt",
  "candidateDebt",
  "followupDebt",
  "changeDebt",
  "snoozeDebt",
] as const;
export type DecisionDebtComponentKey = (typeof DECISION_DEBT_COMPONENT_KEYS)[number];

export interface DecisionDebtV0 {
  readonly schemaVersion: 0;
  readonly subjectiveDate: string;
  readonly components: DecisionDebtComponents;
  /** known 成分の件数合計（**debugOnly・正本ではない**・unknown 成分は除外）。single score に潰さない */
  readonly knownComponentSummary: RealityAttribute<number>;
  /** unknown（材料未供給）の成分名 */
  readonly unknownComponents: ReadonlyArray<DecisionDebtComponentKey>;
  readonly missingInputs: ReadonlyArray<string>;
  readonly sourceRefs: { readonly dayGraphSnapshotId: string };
  readonly evidenceRefs: ReadonlyArray<string>;
}

function knownCount(value: number, evidenceRefs: string[], missingInputs: string[] = []): DecisionDebtComponentV0 {
  return { ...inferredAttribute(value, 0.6, evidenceRefs, { source: "derived", displayPolicy: "debugOnly" }), missingInputs };
}
function unknownComp(evidenceRefs: string[], missingInputs: string[]): DecisionDebtComponentV0 {
  return { ...unknownAttribute<number>({ evidenceRefs, displayPolicy: "hidden" }), missingInputs };
}

export interface DeriveDecisionDebtInput {
  subjectiveDate: string;
  graph: DayGraph;
  ern: ReadonlyArray<EventRealityNodeV0>;
  mv: ReadonlyArray<MovementRealityV0>;
  cs: ReadonlyArray<CommitmentSignalV0>;
}

export function deriveDecisionDebt(input: DeriveDecisionDebtInput): DecisionDebtV0 {
  const eventNodes = input.graph.nodes.filter((n): n is EventNode => n.kind === "event");

  // placeDebt: locationText 欠落（= 真に場所未指定。RC1 placeCertainty は全 event unknown ゆえ使わない）
  const placeMissing = eventNodes.filter((n) => n.locationText === undefined).length;
  const placeDebt = knownCount(placeMissing, placeMissing > 0 ? ["events_without_location_text"] : ["all_events_have_location_text"]);

  // timeDebt: durationSource assumed_default（時間が仮置き）
  const timeUncertain = eventNodes.filter((n) => n.durationSource === "assumed_default").length;
  const timeDebt = knownCount(timeUncertain, timeUncertain > 0 ? ["assumed_default_duration"] : ["explicit_durations"]);

  // mobilityDebt: mv の ETA 未供給件数。mv 不在 ∧ place 欠落あり → unknown（0 にしない — CEO #3）
  const unresolvedMv = input.mv.filter((m) => m.etaKnown.value === false).length;
  let mobilityDebt: DecisionDebtComponentV0;
  if (input.mv.length > 0) {
    mobilityDebt = knownCount(unresolvedMv, ["movement_eta_unresolved"], ["eta_source_missing"]);
  } else if (placeMissing > 0) {
    // 移動ノードは無いが場所未指定 → 移動の有無が判らない（リスクなしと読まない）
    mobilityDebt = unknownComp(["movement_hidden_by_place_missing"], ["place_missing", "eta_source_missing"]);
  } else {
    mobilityDebt = knownCount(0, ["no_movement_and_places_known"]);
  }

  // changeDebt: 弱材料（changeCost high の件数）。真の未確定変更は drift tracking 待ち
  const highChangeCost = input.cs.filter((c) => (c.changeCost.value ?? 0) >= 0.5).length;
  const changeDebt = knownCount(highChangeCost, ["high_change_cost_events"], ["drift_tracking_pending"]);

  // 未供給 source の成分 = unknown（0/false にしない）
  const confirmationDebt = unknownComp(["origin_inference_pending"], ["origin_inference_pending"]);
  const candidateDebt = unknownComp(["request_frame_pending"], ["request_frame_pending", "place_candidate_pending"]);
  const followupDebt = unknownComp(["communication_followup_pending"], ["communication_followup_pending"]);
  const snoozeDebt = unknownComp(["intervention_reaction_pending"], ["intervention_reaction_pending"]);

  const components: DecisionDebtComponents = {
    placeDebt,
    timeDebt,
    mobilityDebt,
    confirmationDebt,
    candidateDebt,
    followupDebt,
    changeDebt,
    snoozeDebt,
  };

  const unknownComponents = DECISION_DEBT_COMPONENT_KEYS.filter((k) => components[k].status === "unknown");
  const knownSum = DECISION_DEBT_COMPONENT_KEYS.filter((k) => components[k].status !== "unknown").reduce(
    (acc, k) => acc + (components[k].value ?? 0),
    0,
  );
  // composite は debugOnly 派生（known のみ・unknown を 0 として混ぜない＝missingInputs に明示）
  const knownComponentSummary: RealityAttribute<number> = inferredAttribute(
    knownSum,
    0.4,
    ["known_components_only"],
    { source: "derived", displayPolicy: "debugOnly" },
  );

  return {
    schemaVersion: 0,
    subjectiveDate: input.subjectiveDate,
    components,
    knownComponentSummary,
    unknownComponents,
    missingInputs: [...new Set(unknownComponents.map((k) => `${k}_unsupplied`))],
    sourceRefs: { dayGraphSnapshotId: input.graph.snapshotId },
    evidenceRefs: ["decision_debt_components_v0"],
  };
}

// ── Moment integration（RealityInstant + decisionDebt + active window。pure・instant は注入） ──

export interface MomentDecisionContextV0 {
  readonly schemaVersion: 0;
  /** RealityInstant（makeRealityInstantJst が唯一正本・ここでは carry のみ・再計算しない） */
  readonly instant: RealityInstant;
  /** 今いる区間（MomentStateV0.nowSegment 由来） */
  readonly activeWindow: { readonly kind: "event" | "travel" | "gap"; readonly startHHMM: string; readonly endHHMM: string } | null;
  /** 次に効く ern（次の fixed event）の id 群 */
  readonly nextRelevantNodeIds: ReadonlyArray<string>;
  readonly decisionDebt: DecisionDebtV0;
  readonly missingInputs: ReadonlyArray<string>;
  readonly sourceRefs: { readonly dayGraphSnapshotId: string };
  readonly evidenceRefs: ReadonlyArray<string>;
}

export interface BuildMomentDecisionContextInput {
  instant: RealityInstant;
  moment: MomentStateV0;
  ern: ReadonlyArray<EventRealityNodeV0>;
  decisionDebt: DecisionDebtV0;
}

export function buildMomentDecisionContext(input: BuildMomentDecisionContextInput): MomentDecisionContextV0 {
  const nextAt = input.moment.nextFixedEventAt;
  const nextRelevantNodeIds = nextAt
    ? input.ern.filter((e) => e.timeWindow.startHHMM === nextAt).map((e) => e.eventRealityNodeId)
    : [];
  return {
    schemaVersion: 0,
    instant: input.instant,
    activeWindow: input.moment.nowSegment,
    nextRelevantNodeIds,
    decisionDebt: input.decisionDebt,
    missingInputs: input.decisionDebt.missingInputs,
    sourceRefs: input.decisionDebt.sourceRefs,
    evidenceRefs: ["moment_decision_context_v0"],
  };
}

/** components の INV-RC1 違反列挙（空 = 適合）。fixture / 監査が使用 */
export function decisionDebtViolations(dd: DecisionDebtV0): string[] {
  const out: string[] = [];
  for (const key of DECISION_DEBT_COMPONENT_KEYS) {
    out.push(...realityAttributeViolations(`decisionDebt.${key}`, dd.components[key]));
  }
  return out;
}
