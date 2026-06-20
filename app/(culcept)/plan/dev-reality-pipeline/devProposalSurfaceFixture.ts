/**
 * devProposalSurfaceFixture — RO-6（2026-06-20）: dev-only synthetic RealityFrame fixture（**dev preview 専用**）
 *
 * 正本設計: docs/reality-os-ro6-dev-proposal-surface-wiring-design.md
 * 目的: RO-3→4→5 chain（previewProposalSurfaces）を dev preview で観測可能にするための **決定論的 synthetic frame**。
 *   real anchor/DB を読まず（realityCore real-data wiring は別トラック）、real builders で frame を組む。
 *
 * 安全/honest:
 *   - **dev-only**（operator-only/非 production の dev-reality-pipeline page からのみ呼ばれる）。
 *   - snapshot は real compile chain で組む（empty anchors=event なし・cast なし）。よって **protect は honest 空**
 *     （collapsed event がないため）。easy（gradient）/ push（task 完了）を demonstrate する。
 *   - **synthetic 明示**: 実データではない（operator には「dev fixture」と表示）。production では gate で不可視。
 *   - 乱数/Date.now を持たない（referenceInstantUtc は呼び元 server now から注入）。
 */
import { buildDayGraph } from "@/lib/plan/dayGraph/buildDayGraph";
import { compileEventRealityNodes } from "@/lib/plan/realityCore/compileEventRealityNodes";
import { compileMovementReality } from "@/lib/plan/realityCore/movementReality";
import { compileCommitmentSignals } from "@/lib/plan/realityCore/commitmentSignal";
import { deriveDecisionDebt } from "@/lib/plan/realityCore/decisionDebt";
import { deriveMomentState } from "@/lib/plan/dayState/deriveMomentState";
import { deriveMomentSnapshot } from "@/lib/plan/realityCore/momentSnapshot";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { assembleRealityGraph } from "@/lib/plan/realityCore/realityGraphSnapshot";
import { graphViewerKey } from "@/lib/plan/realityCore/graphIdentity";
import { buildRealityFrame } from "@/lib/plan/realityCore/realityFrame";
import { buildTaskRealityNode } from "@/lib/plan/realityCore/taskRealityNode";
import { inferredAttribute, heuristicAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import type { CorrectionGradientV0 } from "@/lib/plan/realityCore/correctionGradient";
import type { PreviewProposalSurfacesInputV0 } from "@/lib/plan/realityCore/proposalSurfacePreview";

const FIXTURE_DATE = "2026-06-20"; // 決定論的（synthetic・実日付でない）

const CE: ChangeEligibilityValue = {
  canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false,
  requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null,
};

/** empty anchors の real snapshot（event なし・cast なし・compile chain 経由）。 */
function buildEmptySnapshot(referenceInstantUtc: Date) {
  const { graph } = buildDayGraph({ anchors: [], date: FIXTURE_DATE });
  const ern = compileEventRealityNodes({ date: FIXTURE_DATE, graph, anchors: [] });
  const mv = compileMovementReality({ date: FIXTURE_DATE, graph });
  const cs = compileCommitmentSignals({ date: FIXTURE_DATE, graph, anchors: [] });
  const decisionDebt = deriveDecisionDebt({ subjectiveDate: FIXTURE_DATE, graph, ern, mv, cs });
  const instant = makeRealityInstantJst(referenceInstantUtc);
  const momentState = deriveMomentState({ nowHHMM: instant.wallClockHHMM, segments: [] });
  const momentSnapshot = deriveMomentSnapshot({ instant, momentState, ern, mv, cs, decisionDebt });
  return assembleRealityGraph({ ern, mv, cs, momentSnapshot, viewerKey: graphViewerKey("ro6-dev-preview") });
}

function demoTask(status: "not_started" | "done") {
  return buildTaskRealityNode({
    taskId: "ro6-demo",
    title: "デモ作業",
    deadline: inferredAttribute(`${FIXTURE_DATE}T18:00:00`, 0.7, ["dev_fixture"], { status: "confirmed" }),
    estimatedDuration: heuristicAttribute(60, 0.3, ["dev_fixture"]),
    cognitiveLoad: heuristicAttribute(0.5, 0.3, ["dev_fixture"]),
    canSplit: inferredAttribute(true, 0.6, ["dev_fixture"]),
    canMove: inferredAttribute(true, 0.6, ["dev_fixture"]),
    changeEligibility: inferredAttribute(CE, 0.6, ["dev_fixture"]),
    permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["dev_fixture"]),
    ...(status === "done"
      ? { completionStatus: inferredAttribute("done", 0.85, ["dev_fixture_outcome"], { status: "confirmed" }) }
      : {}),
  });
}

/** easy 根拠（負荷系 lower / energy higher）。injected gradient（synthetic）。 */
const DEMO_GRADIENTS: ReadonlyArray<CorrectionGradientV0> = [
  { axis: "duration", contextKey: "shift_day|packed", direction: "lower", confidenceDelta: 0.2, verdict: null, basis: ["dev_fixture_gradient"] },
];

/**
 * buildDevProposalSurfaceInput — RO-6 dev preview 用 synthetic input（prior=not_started / current=done で push 発火）。
 *   referenceInstantUtc は server now から注入（本 builder は Date.now/乱数なし）。
 */
export function buildDevProposalSurfaceInput(referenceInstantUtc: Date): PreviewProposalSurfacesInputV0 {
  const snapshot = buildEmptySnapshot(referenceInstantUtc); // prior/current で同一 snapshot（graphBaseId 一致→crossDay なし）
  const prior = buildRealityFrame({ snapshot, workLane: { tasks: [demoTask("not_started")] } });
  const current = buildRealityFrame({ snapshot, workLane: { tasks: [demoTask("done")] } });
  return { prior, current, gradients: DEMO_GRADIENTS, routeSetIdSeed: "ro6-dev" };
}
