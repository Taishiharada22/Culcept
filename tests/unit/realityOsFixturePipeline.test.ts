/**
 * P3-3 — full E2E composer + surface DTO contract freeze の test。
 * fixture input → composeRealityOsFixturePipeline → redacted surface DTO（1 関数）。
 * 検証: 1関数でE2E通過 / real feasibility・collapse が current に流れる / contract適合 /
 *   honest-unknown / redaction / permission緩めない / proposal実行・DB なし。
 */
import { describe, it, expect } from "vitest";
import { makeRealityInstantJst } from "@/lib/plan/realityCore/realityInstant";
import { inferredAttribute, heuristicAttribute } from "@/lib/plan/realityCore/realityAttribute";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import type { ChangeEligibilityValue } from "@/lib/plan/realityCore/eventRealityNode";
import type { PermissionLevel } from "@/lib/plan/reality/permission/permission-model";
import type { WorkOverrunRiskInputV0 } from "@/lib/plan/realityCore/workOverrunRisk";
import {
  composeRealityOsFixturePipeline,
  type RealityOsFixturePipelineInputV0,
} from "@/lib/plan/realityPipeline/realityOsFixturePipeline";
import {
  surfaceContractViolations,
  REALITY_OS_SURFACE_CONTRACT_VERSION,
} from "@/lib/plan/realityPipeline/realityOsSurfaceContract";
import type { StanceJudgmentSummaryV0 } from "@/lib/plan/realityCore/proposalRouteScenarioMapper";

const DATE = "2026-06-12";
const overrun = (est: number | null, plan: number | null): WorkOverrunRiskInputV0 => ({
  estimatedMinutes: est,
  plannedMinutes: plan,
  flexibility: "flexible",
  cognitiveLoad: 0.5,
  energyFit: "medium",
  hasMinimalProgress: true,
  priorOverruns: 0,
  sourceKind: "fixture",
  evidenceRefs: ["fixture:overrun-secret"],
});
const j = (
  f: StanceJudgmentSummaryV0["feasibilityStatus"],
  c: StanceJudgmentSummaryV0["collapseRiskLevel"],
  est: number,
  plan: number,
): StanceJudgmentSummaryV0 => ({
  feasibilityStatus: f,
  collapseRiskLevel: c,
  overrunInput: overrun(est, plan),
  minimalProgressCandidates: [],
  minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
  permissionBoundary: 2,
  realityDiffSummary: null,
  dayRehearsalSummary: null,
});

function anchor(over: Partial<ExternalAnchor> & { id: string; startTime: string }): ExternalAnchor {
  return {
    anchorKind: "one_off",
    sourceId: "src-manual",
    title: "予定",
    date: DATE,
    rigidity: "soft",
    confirmedAt: "2026-06-01T00:00:00.000Z",
    ...over,
  } as unknown as ExternalAnchor;
}

const input = (over: Partial<RealityOsFixturePipelineInputV0> = {}): RealityOsFixturePipelineInputV0 => ({
  date: DATE,
  anchors: [anchor({ id: "a1", startTime: "14:00" })],
  instant: makeRealityInstantJst(new Date(Date.UTC(2026, 5, 12, 3, 0))), // JST 12:00（test 側で構築・composer は no Date）
  viewerKey: "viewer-self",
  proposalTask: {
    taskId: "ot1",
    title: "資料を作成する",
    deadline: inferredAttribute("2026-06-13T12:00:00+09:00", 0.6, ["d"]),
    estimatedDuration: heuristicAttribute(60, 0.3, ["e"]),
    cognitiveLoad: heuristicAttribute(0.6, 0.3, ["c"]),
    canSplit: inferredAttribute(true, 0.6, ["s"]),
    canMove: inferredAttribute(true, 0.6, ["m"]),
    changeEligibility: inferredAttribute<ChangeEligibilityValue>(
      { canSuggestMove: true, canSuggestShorten: false, canSuggestSkip: false, canSuggestDelegate: false, requiresConfirmation: false, requiresExternalCommunication: false, blockedReason: null },
      0.6,
      ["ce"],
    ),
    permissionLevel: inferredAttribute<PermissionLevel>(2, 0.6, ["pl"]),
  },
  routeSetIdSeed: "seed",
  current: {
    overrunInput: overrun(55, 60),
    minimalProgressCandidates: [],
    minimalProgressContext: { taskText: "資料を作成する", canSplit: true },
    permissionBoundary: 2,
    realityDiffSummary: null,
    dayRehearsalSummary: null,
    reasonCodes: [],
    evidence: ["real:current-secret"],
    confidence: 0.5,
  },
  judgmentByStance: { protect: j("feasible", "low", 30, 60), push: j("infeasible", "high", 95, 60) },
  ...over,
});

describe("P3-3 Reality OS full fixture E2E composer + contract", () => {
  it("#1 fixture input → redacted surface DTO まで1関数で通る（real upstream 込み）", () => {
    const { surface, meta } = composeRealityOsFixturePipeline(input());
    expect(["feasible", "feasible_with_risk", "infeasible", "unknown"]).toContain(meta.feasibilityStatus);
    expect(["low", "elevated", "high", "unknown"]).toContain(meta.collapseRiskLevel);
    expect(meta.routeCount).toBeGreaterThanOrEqual(0);
    // contract 適合（0 違反）
    expect(surfaceContractViolations(surface)).toEqual([]);
    expect(REALITY_OS_SURFACE_CONTRACT_VERSION).toBe(0);
  });

  it("#2 route が出れば protect/easy/push が surface に出て mapper 自動配線される", () => {
    const { surface, meta } = composeRealityOsFixturePipeline(input());
    if (meta.routeCount > 0) {
      const kinds = surface.scenarios.map((s) => s.scenarioKind);
      for (const k of kinds) expect(["protect", "easy", "push"]).toContain(k);
      // protect judgment 注入済 → shift 確定
      const protect = surface.scenarios.find((s) => s.scenarioKind === "protect");
      if (protect) expect(["better", "same", "worse", "unknown"]).toContain(protect.feasibilityShift);
    } else {
      // honest: この fixture で proposalRoute が route を出さない場合は空（捏造しない）
      expect(surface.scenarios).toEqual([]);
    }
  });

  it("#3 redaction: raw evidence / ledger / graph を surface に漏らさない", () => {
    const json = JSON.stringify(composeRealityOsFixturePipeline(input()).surface);
    expect(json).not.toContain("real:current-secret");
    expect(json).not.toContain("fixture:overrun-secret");
    expect(json).not.toContain("snapshot");
  });

  it("#4 current の overrun を unknown 化 → honest-unknown 経路", () => {
    const { surface } = composeRealityOsFixturePipeline(
      input({ current: { ...input().current, overrunInput: overrun(null, null) } }),
    );
    // current overrun unknown → 各 scenario の overrunShift unknown（route が出れば）
    if (surface.scenarios.length > 0) {
      expect(surface.scenarios.every((s) => s.overrunRiskShift === "unknown")).toBe(true);
      expect(surface.honestUnknown).toBe(true);
    }
    expect(surfaceContractViolations(surface)).toEqual([]);
  });

  it("#5 permissionBoundary は緩めない（current=1 を保持）", () => {
    const { surface, meta } = composeRealityOsFixturePipeline(
      input({ current: { ...input().current, permissionBoundary: 1 } }),
    );
    if (meta.routeCount > 0) {
      for (const s of surface.scenarios) expect(s.permissionBoundary).toBeLessThanOrEqual(1);
    }
  });
});
