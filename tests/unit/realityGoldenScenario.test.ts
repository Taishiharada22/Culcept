import { describe, it, expect } from "vitest";
import { runScenario, runScenarios, type ScenarioFixture } from "@/lib/plan/reality/golden-scenario";
import type { BestActionCandidate, CandidateMetrics } from "@/lib/plan/reality/best-action";
import type { ChangeSet } from "@/lib/plan/reality/change-set";
import type { SourceTrace } from "@/lib/plan/reality/source-trace";
import type { ReceptivityInput, DeliveryAction } from "@/lib/plan/reality/receptivity-gate";
import type { PlanItemGovernance } from "@/lib/plan/reality/authority";
import { effectivePolarity, validatePrmEvent, computeDedupeKey, type PrmEvent } from "@/lib/plan/reality/prm-event";

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
  // --- 移動/Repair 系 ---
  { id: "S1", title: "遠方重要 → push", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s1")], receptivity: recep({ allowedActions: ["leave_now"] }), expect: { bestId: "s1", deliveryMode: "push" } },
  { id: "S2", title: "近場任意 → on_open", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s2")], receptivity: recep({ stakes: "low", allowedActions: ["open_plan"], receptivity: 0.6 }), expect: { bestId: "s2", deliveryMode: "on_open" } },
  { id: "S3", title: "数分前未到着 Final Check → urgent_push", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s3")], receptivity: recep({ isFinalCheck: true, timeCritical: true, allowedActions: ["mark_arrived", "leave_now"] }), expect: { bestId: "s3", deliveryMode: "urgent_push" } },
  { id: "S4", title: "前予定長引き → push", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s4")], receptivity: recep({ allowedActions: ["one_tap_confirm", "leave_now"] }), expect: { bestId: "s4", deliveryMode: "push" } },
  { id: "S5", title: "雨で徒歩遅延 → push", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s5")], receptivity: recep(), expect: { bestId: "s5", deliveryMode: "push" } },
  { id: "S6", title: "電車遅延 cascade（無視案 whole_part reject）", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s6_ignore", { metrics: metrics({ wholePartCoherent: false }) }), cand("s6_replan")], receptivity: recep({ timeCritical: true, allowedActions: ["one_tap_confirm", "view_alternative"] }), expect: { bestId: "s6_replan", rejectedGates: { s6_ignore: "whole_part" }, deliveryMode: "urgent_push" } },
  { id: "S7", title: "駅構内移動 → push", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s7")], receptivity: recep(), expect: { bestId: "s7", deliveryMode: "push" } },
  { id: "S8", title: "病院予約 → push", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s8")], receptivity: recep({ allowedActions: ["one_tap_confirm"] }), expect: { bestId: "s8", deliveryMode: "push" } },
  { id: "S9", title: "面接 catastrophic → urgent_push", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s9")], receptivity: recep({ stakes: "critical", timeCritical: true }), expect: { bestId: "s9", deliveryMode: "urgent_push" } },
  { id: "S10", title: "空港 catastrophic → urgent_push", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s10")], receptivity: recep({ stakes: "critical", timeCritical: true }), expect: { bestId: "s10", deliveryMode: "urgent_push" } },
  // --- 状態/Optimize 系 ---
  { id: "S11", title: "食事消失（食事削る案 recovery reject）", mode: "optimize", intervened: true, conditionPresent: true, candidates: [cand("s11_cutmeal", { metrics: metrics({ recoveryProtected: false }) }), cand("s11_protect")], expect: { bestId: "s11_protect", rejectedGates: { s11_cutmeal: "recovery_core" } } },
  { id: "S12", title: "休息消失（休息削る案 recovery reject）", mode: "optimize", intervened: true, conditionPresent: true, candidates: [cand("s12_cutrest", { metrics: metrics({ recoveryProtected: false }) }), cand("s12_protect")], expect: { bestId: "s12_protect", rejectedGates: { s12_cutrest: "recovery_core" } } },
  { id: "S19", title: "低confidence → on_open（push しない）", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s19")], receptivity: recep({ confidence: 0.3, receptivity: 0.35 }), expect: { bestId: "s19", deliveryMode: "on_open" } },
  { id: "S20", title: "cascade 連鎖破綻（放置案 whole_part reject）", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s20_cascade", { metrics: metrics({ wholePartCoherent: false }) }), cand("s20_repair")], receptivity: recep({ timeCritical: true, allowedActions: ["one_tap_confirm"] }), expect: { bestId: "s20_repair", rejectedGates: { s20_cascade: "whole_part" }, deliveryMode: "urgent_push" } },
  { id: "S21", title: "1つだけ Complete → on_open", mode: "complete", intervened: true, conditionPresent: true, candidates: [cand("s21")], receptivity: recep({ stakes: "low", allowedActions: ["one_tap_confirm", "open_plan"], receptivity: 0.6 }), expect: { bestId: "s21", deliveryMode: "on_open" } },
  { id: "S23", title: "前夜疲労→翌日軽く（multi-day Optimize）", mode: "optimize", intervened: true, conditionPresent: true, candidates: [cand("s23")], receptivity: recep({ stakes: "low", allowedActions: ["one_tap_confirm"], receptivity: 0.6 }), expect: { bestId: "s23", deliveryMode: "on_open" } },
  { id: "S24", title: "前予定が早く終了（opportunity）", mode: "complete", intervened: true, conditionPresent: true, candidates: [cand("s24")], receptivity: recep({ stakes: "low", allowedActions: ["one_tap_confirm", "open_plan"], receptivity: 0.6 }), expect: { bestId: "s24", deliveryMode: "on_open" } },
  // --- Degradation 系 ---
  { id: "S29", title: "通信なし（channel down → on_open + local fallback）", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s29")], receptivity: recep({ degradationMode: "no_network", allowedActions: ["one_tap_confirm"] }), expect: { bestId: "s29", deliveryMode: "on_open", dayGraphChange: "ローカル事前計算で leave-by 提示" } },
  { id: "S30", title: "低電力（低 stakes 抑制 → on_open）", mode: "repair", intervened: true, conditionPresent: true, candidates: [cand("s30")], receptivity: recep({ degradationMode: "low_battery", stakes: "low", allowedActions: ["one_tap_confirm"] }), expect: { bestId: "s30", deliveryMode: "on_open" } },
];

describe("reality/golden-scenario — 30 decision fixtures (S1–S15, S19–S35)", () => {
  it("all decision fixtures pass their executable expectations", () => {
    const results = runScenarios(FIXTURES);
    const failed = results.filter((r) => !r.ok);
    expect(failed.map((f) => `${f.id}: ${f.failures.join("; ")}`)).toEqual([]);
    expect(results).toHaveLength(30);
  });

  it("covers all 30 decision scenario ids (S16/17/18/22/31 = learning, below)", () => {
    const ids = new Set(FIXTURES.map((f) => f.id));
    const decision = [
      "S1", "S2", "S3", "S4", "S5", "S6", "S7", "S8", "S9", "S10",
      "S11", "S12", "S13", "S14", "S15", "S19", "S20", "S21", "S23", "S24",
      "S25", "S26", "S27", "S28", "S29", "S30", "S32", "S33", "S34", "S35",
    ];
    for (const id of decision) expect(ids.has(id), `missing ${id}`).toBe(true);
    expect(ids.size).toBe(30);
  });

  it("runScenario reports failures for a wrong expectation (self-check)", () => {
    const broken: ScenarioFixture = { ...FIXTURES[0], expect: { ...FIXTURES[0].expect, bestId: "wrong" } };
    expect(runScenario(broken).ok).toBe(false);
  });
});

describe("reality/golden-scenario — learning scenarios (PRM event level: S16/17/18/22/31)", () => {
  const ev = (p: Partial<PrmEvent> & Pick<PrmEvent, "kind">): PrmEvent => ({ eventId: `e_${p.kind}`, occurredAt: 540, ...p });

  it("S16 通知無視 → negative; S31 朝提案無視 dedupe 安定", () => {
    const s16 = ev({ kind: "proposal_ignored", proposalId: "p1", ignoredReason: "seen_no_action" });
    expect(effectivePolarity(s16)).toBe("negative");
    expect(validatePrmEvent(s16).ok).toBe(true);
    const s31a = ev({ kind: "proposal_ignored", eventId: "a", proposalId: "morning" });
    const s31b = ev({ kind: "proposal_ignored", eventId: "b", proposalId: "morning" });
    expect(computeDedupeKey(s31a)).toBe(computeDedupeKey(s31b)); // 二重学習しない
  });

  it("S17 採用 → positive + valid", () => {
    const s17 = ev({ kind: "proposal_adopted", itemId: "p1", sourceTraces: [{ kind: "seed", ref: "s", reason: "目的", confidence: 0.8 }] });
    expect(effectivePolarity(s17)).toBe("positive");
    expect(validatePrmEvent(s17).ok).toBe(true);
  });

  it("S18 別案 / S22 部分修正 → mixed（単純 negative にしない）+ valid", () => {
    const edited = ev({ kind: "proposal_edited", itemId: "p1", editedFields: ["startMin"] });
    expect(effectivePolarity(edited)).toBe("mixed");
    expect(validatePrmEvent(edited).ok).toBe(true);
  });
});
