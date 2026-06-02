import { describe, it, expect } from "vitest";
import { runScenario, runScenarios, type ScenarioFixture } from "@/lib/plan/reality/golden-scenario";
import type { BestActionCandidate, CandidateMetrics } from "@/lib/plan/reality/best-action";
import type { ChangeSet } from "@/lib/plan/reality/change-set";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";
import type { ReceptivityInput, DeliveryAction } from "@/lib/plan/reality/receptivity-gate";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";

const strongTrace: SourceTrace[] = [
  { kind: "seed", ref: "seed_1", reason: "企画が目的", confidence: 0.8 },
  { kind: "prm", ref: "prm_morning", reason: "午前集中", confidence: 0.6 },
];

function cs(id: string): ChangeSet {
  return { id, ops: [{ kind: "add", itemId: `${id}_a`, after: { itemId: `${id}_a`, startMin: 540, endMin: 600 } }], reason: "r", sourceTraces: strongTrace };
}

function hardExternalCs(id: string): ChangeSet {
  const g: PlanItemGovernance = { origin: "imported", authority: "import_locked", flexibility: "movable", protectionReasons: ["hard_external"] };
  return {
    id,
    ops: [{ kind: "update", itemId: "friend", before: { itemId: "friend", startMin: 960, endMin: 1020, governance: g }, after: { itemId: "friend", startMin: 975, endMin: 1035, governance: g } }],
    reason: "move friend's event",
    sourceTraces: strongTrace,
  };
}

function metrics(p: Partial<CandidateMetrics> = {}): CandidateMetrics {
  return {
    feasible: true,
    wholePartCoherent: true,
    recoveryProtected: true,
    deadlineSatisfied: true,
    goalAttainment: 0.8,
    rhythmFit: 0.7,
    slackHealth: 0.7,
    overpack: 0.1,
    contextSwitches: 1,
    instability: 0,
    correctionMisalignment: 0.1,
    ...p,
  };
}

function cand(id: string, p: Partial<BestActionCandidate> = {}): BestActionCandidate {
  return { id, changeSet: cs(id), sourceTraces: strongTrace, metrics: metrics(), proposedDisposition: "confirm", ...p };
}

function recep(p: Partial<ReceptivityInput> = {}): ReceptivityInput {
  return {
    stakes: "high",
    actionable: true,
    allowedActions: ["one_tap_confirm"] as DeliveryAction[],
    confidence: 0.8,
    sourceTraceStrength: 0.8,
    receptivity: 0.7,
    timeCritical: false,
    pushPermission: true,
    budget: { remaining: 5, recentDismissals: 0, trust: 0.9 },
    ...p,
  };
}

const FIXTURES: ScenarioFixture[] = [
  // --- Daily Plan 系 ---
  {
    id: "S13",
    title: "予定なし Build → 朝 push",
    mode: "build",
    intervened: true,
    conditionPresent: true,
    candidates: [cand("s13_plan")],
    receptivity: recep({ stakes: "low", isMorningDailyPlan: true, dailyPlanQualityPassed: true, allowedActions: ["one_tap_confirm", "adjust"], receptivity: 0.6 }),
    expect: { bestId: "s13_plan", deliveryMode: "push", dayGraphChange: "空の一日に node 群生成", prmEvents: ["proposal_shown"] },
  },
  {
    id: "S33",
    title: "seedなし完全空白 → on_open（弱根拠で push しない）",
    mode: "build",
    intervened: true,
    conditionPresent: true,
    candidates: [cand("s33_plan", { metrics: metrics({ goalAttainment: 0.4 }) })],
    receptivity: recep({ stakes: "low", isMorningDailyPlan: true, dailyPlanQualityPassed: true, sourceTraceStrength: 0.4, allowedActions: ["one_tap_confirm", "open_plan"] }),
    expect: { bestId: "s33_plan", deliveryMode: "on_open" },
  },
  {
    id: "S14",
    title: "余白多め Complete",
    mode: "complete",
    intervened: true,
    conditionPresent: true,
    candidates: [cand("s14_plan")],
    receptivity: recep({ stakes: "low", actionable: true, allowedActions: ["one_tap_confirm", "open_plan"], receptivity: 0.6 }),
    expect: { bestId: "s14_plan", deliveryMode: "on_open" },
  },
  {
    id: "S15",
    title: "過密 Optimize（詰める案は recovery gate で reject）",
    mode: "optimize",
    intervened: true,
    conditionPresent: true,
    candidates: [
      cand("s15_keepall", { metrics: metrics({ overpack: 0.9, recoveryProtected: false }) }),
      cand("s15_deferred", { metrics: metrics({ overpack: 0.3 }) }),
    ],
    expect: { bestId: "s15_deferred", rejectedIds: ["s15_keepall"], rejectedGates: { s15_keepall: "recovery_core" } },
  },
  {
    id: "S27",
    title: "目的不一致 Optimize（目的に資する再配置が best）",
    mode: "optimize",
    intervened: true,
    conditionPresent: true,
    candidates: [
      cand("s27_asis", { metrics: metrics({ goalAttainment: 0.1 }) }),
      cand("s27_rearranged", { metrics: metrics({ goalAttainment: 0.9 }) }),
    ],
    expect: { bestId: "s27_rearranged" },
  },
  // --- 全体×一部 系 ---
  {
    id: "S25",
    title: "休息削れば成立だが翌日崩れる（whole_part で reject）",
    mode: "optimize",
    intervened: true,
    conditionPresent: true,
    candidates: [
      cand("s25_cram", { metrics: metrics({ wholePartCoherent: false, recoveryProtected: false }) }),
      cand("s25_defer", { metrics: metrics({}) }),
    ],
    expect: { bestId: "s25_defer", rejectedIds: ["s25_cram"], rejectedGates: { s25_cram: "whole_part" } },
  },
  {
    id: "S26",
    title: "作業入れれば空白埋まるが移動余白消える（whole_part で reject）",
    mode: "complete",
    intervened: true,
    conditionPresent: true,
    candidates: [
      cand("s26_fill", { metrics: metrics({ wholePartCoherent: false }) }),
      cand("s26_short", { metrics: metrics({}) }),
    ],
    expect: { bestId: "s26_short", rejectedGates: { s26_fill: "whole_part" } },
  },
  {
    id: "S32",
    title: "他人予定の変更（auto は permission gate で reject、confirm が best）",
    mode: "repair",
    intervened: true,
    conditionPresent: true,
    candidates: [
      cand("s32_auto", { changeSet: hardExternalCs("s32_auto"), proposedDisposition: "auto" }),
      cand("s32_confirm", { changeSet: hardExternalCs("s32_confirm"), proposedDisposition: "confirm" }),
    ],
    receptivity: recep({ stakes: "high", allowedActions: ["one_tap_confirm", "adjust"] }),
    expect: { bestId: "s32_confirm", rejectedIds: ["s32_auto"], rejectedGates: { s32_auto: "permission" }, deliveryMode: "push" },
  },
  {
    id: "S34",
    title: "物理的に不可能な予定（keepall は safety gate で reject、protect が best）",
    mode: "repair",
    intervened: true,
    conditionPresent: true,
    candidates: [
      cand("s34_keepall", { metrics: metrics({ feasible: false }) }),
      cand("s34_protect", { metrics: metrics({}) }),
    ],
    receptivity: recep({ stakes: "high", allowedActions: ["choose_priority", "adjust"] }),
    expect: { bestId: "s34_protect", rejectedIds: ["s34_keepall"], rejectedGates: { s34_keepall: "safety" }, deliveryMode: "push" },
  },
  // --- Degradation 系 ---
  {
    id: "S28",
    title: "位置情報なし（時刻ベースで push 継続）",
    mode: "repair",
    intervened: true,
    conditionPresent: true,
    candidates: [cand("s28_plan")],
    receptivity: recep({ stakes: "high", degradationMode: "no_location", allowedActions: ["leave_now"] }),
    expect: { bestId: "s28_plan", deliveryMode: "push" },
  },
  {
    id: "S35",
    title: "通知権限なし重要予定（permission_prompt）",
    mode: "repair",
    intervened: true,
    conditionPresent: true,
    candidates: [cand("s35_plan")],
    receptivity: recep({ stakes: "high", pushPermission: false, allowedActions: ["one_tap_confirm", "request_permission"] }),
    expect: { bestId: "s35_plan", deliveryMode: "permission_prompt" },
  },
];

describe("reality/golden-scenario — 11 representative fixtures (GPT 必須)", () => {
  it("all fixtures pass their executable expectations", () => {
    const results = runScenarios(FIXTURES);
    const failed = results.filter((r) => !r.ok);
    expect(failed.map((f) => `${f.id}: ${f.failures.join("; ")}`)).toEqual([]);
    expect(results).toHaveLength(11);
  });

  it("covers Daily-Plan, whole×part, and degradation families", () => {
    const ids = new Set(FIXTURES.map((f) => f.id));
    for (const dp of ["S13", "S33", "S14", "S15", "S27"]) expect(ids.has(dp)).toBe(true);
    for (const wp of ["S25", "S26", "S32", "S34"]) expect(ids.has(wp)).toBe(true);
    for (const dg of ["S28", "S35"]) expect(ids.has(dg)).toBe(true);
  });

  it("runScenario reports failures for a wrong expectation (self-check)", () => {
    const broken: ScenarioFixture = { ...FIXTURES[0], expect: { ...FIXTURES[0].expect, bestId: "wrong" } };
    expect(runScenario(broken).ok).toBe(false);
  });
});
