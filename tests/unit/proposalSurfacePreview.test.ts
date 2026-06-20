/**
 * RO-6 — proposalSurfacePreview: RO-3→4→5 の fail-closed 連結 orchestration。
 *   buildRealityLearningSignal → buildProposalRoutes → proposalRouteViolations → buildProposalSurface →
 *   proposalSurfaceViolations を連結し safe DTO のみ返す。pure・dev-only wiring の本体。
 * 正本設計: docs/reality-os-ro6-dev-proposal-surface-wiring-design.md
 */
import { describe, it, expect } from "vitest";
import { previewProposalSurfaces } from "@/lib/plan/realityCore/proposalSurfacePreview";
import { buildRealityFrame, type RealityFrameV0 } from "@/lib/plan/realityCore/realityFrame";
import type { RealityGraphSnapshotV0 } from "@/lib/plan/realityCore/realityGraphSnapshot";
import { buildTaskRealityNode, type TaskRealityNodeInputV0, type TaskRealityNodeV0 } from "@/lib/plan/realityCore/taskRealityNode";
import type { CorrectionGradientV0 } from "@/lib/plan/realityCore/correctionGradient";
import type { TaskLedgerSignalV0 } from "@/lib/plan/realityCore/taskOutcome";
import { inferredAttribute, heuristicAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";

const CE: ChangeEligibilityValue = {
  canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false,
  requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null,
};
function task(id: string, over: Partial<TaskRealityNodeInputV0> = {}): TaskRealityNodeV0 {
  return buildTaskRealityNode({
    taskId: id, title: "作業",
    deadline: inferredAttribute("2026-06-21T18:00:00", 0.7, ["d"], { status: "confirmed" }),
    estimatedDuration: heuristicAttribute(60, 0.3, ["dur"]), cognitiveLoad: heuristicAttribute(0.5, 0.3, ["load"]),
    canSplit: inferredAttribute(true, 0.6, ["s"]), canMove: inferredAttribute(true, 0.6, ["m"]),
    changeEligibility: inferredAttribute(CE, 0.6, ["gov"]), permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["gov"]),
    ...over,
  });
}
function snap(): RealityGraphSnapshotV0 {
  return { schemaVersion: 0, graphBaseId: "rgb:2026-06-20:vk1:hashA", snapshotId: "rgs:x:780",
    subjectiveDate: "2026-06-20", minuteOfSubjectiveDay: 780, eventRealityNodes: [], movementRealityNodes: [], commitmentSignals: [] } as unknown as RealityGraphSnapshotV0;
}
const grad = (axis: CorrectionGradientV0["axis"], direction: CorrectionGradientV0["direction"]): CorrectionGradientV0 =>
  ({ axis, contextKey: "shift_day|packed", direction, confidenceDelta: 0.2, verdict: null, basis: ["e"] });

describe("RO-6 previewProposalSurfaces — fail-closed 連結", () => {
  it("#1 task 1 件 → surface 1 件（常に 3 route・conceptKind=reaction_stance）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const res = previewProposalSurfaces({ prior: null, current: frame, routeSetIdSeed: "s" });
    expect(res.surfaces).toHaveLength(1);
    expect(res.surfaces[0].conceptKind).toBe("reaction_stance");
    expect(res.surfaces[0].cards).toHaveLength(3);
    expect(res.diagnostics.rendered).toBe(1);
    expect(res.diagnostics.skippedForSurfaceViolation).toBe(0);
  });

  it("#2 easy gradient + push task change が surface に反映", () => {
    const prior = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const bt = task("t1", { completionStatus: inferredAttribute("done", 0.85, ["o"], { status: "confirmed" }) });
    const current = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [bt] } });
    const res = previewProposalSurfaces({ prior, current, gradients: [grad("duration", "lower")], routeSetIdSeed: "s" });
    const v = res.surfaces[0];
    expect(v.cards.find((c) => c.stanceLabelKey === "easy_label")!.hasNoBasis).toBe(false); // gradient
    expect(v.cards.find((c) => c.stanceLabelKey === "push_label")!.hasNoBasis).toBe(false); // task done
    expect(v.cards.find((c) => c.stanceLabelKey === "protect_label")!.hasNoBasis).toBe(true); // event なし→honest 空
  });

  it("#3 task なし → surface 0（route を発明しない）", () => {
    const frame = buildRealityFrame({ snapshot: snap() });
    const res = previewProposalSurfaces({ prior: null, current: frame, routeSetIdSeed: "s" });
    expect(res.surfaces).toEqual([]);
    expect(res.diagnostics.totalSets).toBe(0);
  });

  it("#4 全 surface が leak-free（raw id token 非出現）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1"), task("t2")] } });
    const ledger: TaskLedgerSignalV0 = { taskRealityNodeId: "trn:t1", outcome: "completed", observedAt: "2026-06-20T21:00:00+09:00" };
    const res = previewProposalSurfaces({ prior: null, current: frame, ledgerSignals: [ledger], gradients: [grad("energy", "higher")], routeSetIdSeed: "s" });
    const json = JSON.stringify(res.surfaces);
    for (const tok of ["proute:", "trn:", "anchor_", "gap_", "ern:"]) expect(json.includes(tok)).toBe(false);
  });

  it("#5 diagnostics は counts のみ（trace/raw を含まない）", () => {
    const frame = buildRealityFrame({ snapshot: snap(), workLane: { tasks: [task("t1")] } });
    const res = previewProposalSurfaces({ prior: null, current: frame, routeSetIdSeed: "s" });
    expect(Object.keys(res.diagnostics).sort()).toEqual(["rendered", "skippedForRouteViolation", "skippedForSurfaceViolation", "totalSets"]);
    for (const v of Object.values(res.diagnostics)) expect(typeof v).toBe("number");
  });
});
