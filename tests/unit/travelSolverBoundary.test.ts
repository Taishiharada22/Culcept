/**
 * T11-C5 — Solver / Scheduler Boundary golden tests
 *
 * 設計正本: docs/t11-c-solver-scheduler-boundary-design.md §15（+ CEO 補正: scheduled draft を生成しない）
 *
 * 主眼: feasibility 分類 / 不足 schedule 入力検出 / 適格判定(boolean のみ) / fail-closed(捏造なし) /
 *   非relaxable cycle vs relaxable-only / 多日 day-assignment / privacy 二層 / 境界(no itinerary/candidate/
 *   schedule・no engine/evaluateFit) / import 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeManualEntityEvidence } from "@/lib/shared/travel/entity-retrieval";
import { buildCompositionDraft } from "@/lib/shared/travel/composition-preflight";
import { classifyFeasibility } from "@/lib/shared/travel/solver-feasibility-classifier";
import { detectScheduleGaps } from "@/lib/shared/travel/solver-missing-data-detector";
import { checkScheduledDraftEligibility } from "@/lib/shared/travel/solver-scheduled-draft-eligibility";
import { buildSolverFeasibilityReport, projectSharedFeasibilityReport } from "@/lib/shared/travel/solver-feasibility-report";
import type { CompositionDraft, CompositionInput } from "@/lib/shared/travel/composition-types";
import type { SolverFeasibilityInput } from "@/lib/shared/travel/solver-boundary-types";
import type { EntityEvidence } from "@/lib/shared/travel/entity-retrieval-types";
import type { FitResult, RouteChainState, OrderingConstraint } from "@/lib/shared/travel/fit-types";
import type { TravelPlanScope } from "@/lib/shared/travel/core-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const ev = (over: Partial<EntityEvidence> & { placeRefId: string; category: EntityEvidence["category"] }): EntityEvidence => ({ facts: [], ...over });
const lodging = (id = "L1") =>
  normalizeManualEntityEvidence(ev({ placeRefId: id, category: "lodging", facts: [
    { kind: "priceBand", lo: 10000, hi: 20000, currency: "JPY", provenance: "editorial" },
    { kind: "timeLock", lockKind: "checkin_window_lock", rawTime: "15:00", provenance: "editorial" },
  ] }));
const food = (id = "F1") => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "food", facts: [{ kind: "priceBand", lo: 3000, hi: 6000, provenance: "editorial" }] }));

const fakeFit = (over: Partial<FitResult> = {}): FitResult => ({
  authoritative: false, fitLabel: "good", components: [], hardBlocks: [], mismatchReasons: [], whyFits: [], whyMayFail: [],
  riskFlags: [], rationale: { shared: "", forParticipant: {} }, perParticipantFit: [], groupAggregateFit: null, conflicts: [],
  confidence: 0.7, labelStability: "stable", labelCap: null, missingDataQuestions: [], placeRefId: "X", subjectKind: "solo", ...over,
});

const singleDay: TravelPlanScope = { mode: "travel", window: { kind: "single_day", date: "2026-07-01" } };
const range1: TravelPlanScope = { mode: "travel", window: { kind: "range", startDate: "2026-07-01", endDate: "2026-07-02", nights: 1 } };

const baseInput = (over: Partial<CompositionInput> = {}): CompositionInput => ({
  candidateId: "candidate:relaxed", entities: [lodging(), food()], bindings: [{ placeRefId: "L1" }, { placeRefId: "F1" }], ...over,
});
const draftOf = (over: Partial<CompositionInput> = {}): CompositionDraft => {
  const r = buildCompositionDraft(baseInput(over));
  if (r.outcome !== "draft") throw new Error(`expected draft, got ${r.outcome}`);
  return r;
};
const allNodeDur = (d: CompositionDraft, m = 45) => Object.fromEntries(d.candidateNodes.map((n) => [n.nodeId, m]));
const allEdgeDur = (d: CompositionDraft, m = 20) => Object.fromEntries(d.edges.filter((e) => e.kind === "route_transition").map((e) => [`${e.fromNodeId}>>${e.toNodeId}`, m]));
const allLockWin = (d: CompositionDraft) => Object.fromEntries(d.constraints.filter((c) => c.axis === "time").map((c) => [c.constraintId, true]));
const routeChain: RouteChainState = { connection: { fromRef: "L1", toRef: "F1", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: 20 }], transferNodes: [] } };

// ── 1. failure 分類 ────────────────────────────────────────────────────────
describe("1. failure classification", () => {
  it("CompositionFailure(no_bound_entities) → not_enough_information", () => {
    const r = buildCompositionDraft(baseInput({ entities: [], bindings: [] }));
    expect(classifyFeasibility({ result: r }).state).toBe("not_enough_information");
  });
  it("全 entity hard-blocked → blocked_by_hard_constraint", () => {
    const r = buildCompositionDraft(baseInput({ fitInputs: [
      { candidateId: "L1", fit: fakeFit({ hardBlocks: [{ reason: "red_line_violation", visibility: "shared", ownerParticipantId: null }] }) },
      { candidateId: "F1", fit: fakeFit({ hardBlocks: [{ reason: "hard_constraint_violation", visibility: "shared", ownerParticipantId: null }] }) },
    ] }));
    expect(classifyFeasibility({ result: r }).state).toBe("blocked_by_hard_constraint");
  });
  it("非relaxable cycle → infeasible_constraints", () => {
    const r = buildCompositionDraft(baseInput({ orderingConstraints: [
      { kind: "must_precede", subjectRef: "L1", objectRef: "F1", relaxable: false },
      { kind: "must_precede", subjectRef: "F1", objectRef: "L1", relaxable: false },
    ] }));
    const c = classifyFeasibility({ result: r });
    expect(c.state).toBe("infeasible_constraints");
    expect(c.infeasibleConstraints.map((x) => x.reason)).toContain("impossible_time_lock");
  });
});

// ── 2. draft 分類 + gap 検出 ─────────────────────────────────────────────────
describe("2. draft classification + gaps", () => {
  it("relaxable-only cycle は hard failure でない（ordering_cycle carry・infeasible でない）", () => {
    const d = draftOf({ orderingConstraints: [
      { kind: "must_precede", subjectRef: "L1", objectRef: "F1", relaxable: true },
      { kind: "must_precede", subjectRef: "F1", objectRef: "L1", relaxable: true },
    ] });
    const c = classifyFeasibility({ result: d });
    expect(c.state).not.toBe("infeasible_constraints");
    expect(d.unsatisfiedConstraints.map((u) => u.reason)).toContain("ordering_cycle");
  });
  it("node duration 無 → needs_node_duration / node_duration_missing", () => {
    const d = draftOf();
    const input: SolverFeasibilityInput = { result: d, scope: singleDay, lockWindows: allLockWin(d) };
    expect(classifyFeasibility(input).state).toBe("needs_node_duration");
    expect(detectScheduleGaps(input).map((g) => g.kind)).toContain("node_duration_missing");
  });
  it("edge duration 無 → needs_route_duration / route_duration_missing", () => {
    const d = draftOf({ routeChains: [routeChain] });
    const input: SolverFeasibilityInput = { result: d, scope: singleDay, nodeDurations: allNodeDur(d), lockWindows: allLockWin(d) };
    expect(classifyFeasibility(input).state).toBe("needs_route_duration");
    expect(detectScheduleGaps(input).map((g) => g.kind)).toContain("route_duration_missing");
  });
  it("trip window 無 → needs_time_window / time_window_missing", () => {
    const d = draftOf();
    const input: SolverFeasibilityInput = { result: d, nodeDurations: allNodeDur(d), lockWindows: allLockWin(d) };
    expect(classifyFeasibility(input).state).toBe("needs_time_window");
    expect(detectScheduleGaps(input).map((g) => g.kind)).toContain("time_window_missing");
  });
  it("checkin lock の explicit window 無 → explicit_window_missing", () => {
    const d = draftOf({ timeLocks: lodging("L1").timeLocks }); // checkin_window_lock を制約として持ち込む
    expect(d.constraints.some((c) => c.axis === "time")).toBe(true);
    const input: SolverFeasibilityInput = { result: d, scope: singleDay, nodeDurations: allNodeDur(d) };
    expect(detectScheduleGaps(input).map((g) => g.kind)).toContain("explicit_window_missing");
  });
});

// ── 3. ★多日 day-assignment（scope から推論しない）─────────────────────────────
describe("3. multi-day day assignment", () => {
  it("多日(range) で node→day binding 無 → day_assignment_missing", () => {
    const d = draftOf();
    const input: SolverFeasibilityInput = { result: d, scope: range1, nodeDurations: allNodeDur(d), lockWindows: allLockWin(d) };
    expect(detectScheduleGaps(input).map((g) => g.kind)).toContain("day_assignment_missing");
  });
  it("single_day は node→day binding を要しない（day_assignment_missing なし）", () => {
    const d = draftOf();
    const input: SolverFeasibilityInput = { result: d, scope: singleDay, nodeDurations: allNodeDur(d), lockWindows: allLockWin(d) };
    expect(detectScheduleGaps(input).map((g) => g.kind)).not.toContain("day_assignment_missing");
  });
});

// ── 4. 適格判定（boolean のみ・draft を構築しない）─────────────────────────────
describe("4. scheduled-draft eligibility (boolean only)", () => {
  it("全 explicit → eligibleForScheduledDraft=true・state feasible_scheduled_draft・itinerary を作らない", () => {
    const d = draftOf({ routeChains: [routeChain] });
    const input: SolverFeasibilityInput = {
      result: d, scope: singleDay, nodeDurations: allNodeDur(d), edgeDurations: allEdgeDur(d), lockWindows: allLockWin(d),
    };
    const elig = checkScheduledDraftEligibility(input);
    expect(elig.eligibleForScheduledDraft).toBe(true);
    expect(elig.unmetRequirements).toHaveLength(0);
    const report = buildSolverFeasibilityReport(input);
    expect(report.state).toBe("feasible_scheduled_draft");
    // ★ report は scheduled draft / itinerary / candidate を含まない
    expect(Object.keys(report)).not.toContain("scheduledDraft");
    expect(Object.keys(report)).not.toContain("itinerary");
    expect(JSON.stringify(report)).not.toContain("startMin");
    expect(JSON.stringify(report)).not.toContain("dayIndex");
  });
  it("不足あり → eligible=false + unmetRequirements", () => {
    const d = draftOf();
    const elig = checkScheduledDraftEligibility({ result: d, scope: singleDay });
    expect(elig.eligibleForScheduledDraft).toBe(false);
    expect(elig.unmetRequirements.length).toBeGreaterThan(0);
  });
});

// ── 5. report shape + authority + privacy ────────────────────────────────────
describe("5. report authority + privacy", () => {
  it("report は authoritative:false / draft:true / executionAuthority なし", () => {
    const report = buildSolverFeasibilityReport({ result: draftOf(), scope: singleDay });
    expect(report.authoritative).toBe(false);
    expect(report.draft).toBe(true);
    expect(Object.keys(report)).not.toContain("executionAuthority");
  });
  it("private blocker は feasibility を server-side で変えるが shared 投影で reason を漏らさない", () => {
    const r = buildCompositionDraft(baseInput({ fitInputs: [
      { candidateId: "L1", fit: fakeFit({ hardBlocks: [{ reason: "safety_escalation", visibility: "private", ownerParticipantId: "p1" }] }) },
      { candidateId: "F1", fit: fakeFit({ hardBlocks: [{ reason: "red_line_violation", visibility: "private", ownerParticipantId: "p1" }] }) },
    ] }));
    const full = buildSolverFeasibilityReport({ result: r });
    expect(full.state).toBe("blocked_by_hard_constraint"); // server-side で反映
    const shared = projectSharedFeasibilityReport(full);
    expect(shared.hardBlockers).toHaveLength(0); // private は strip
    expect(JSON.stringify(shared)).not.toContain("safety_escalation");
    expect(JSON.stringify(shared)).not.toContain("p1");
  });
});

// ── 6. solver 境界 + import 純度（source-contract）─────────────────────────────
describe("6. solver 境界 + import 純度", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const read = (rel: string) => strip(readFileSync(resolve(process.cwd(), rel), "utf8"));
  const files = [
    "lib/shared/travel/solver-boundary-types.ts",
    "lib/shared/travel/solver-missing-data-detector.ts",
    "lib/shared/travel/solver-feasibility-classifier.ts",
    "lib/shared/travel/solver-scheduled-draft-eligibility.ts",
    "lib/shared/travel/solver-feasibility-report.ts",
  ];
  it("schedule field(startMin/endMin/dayIndex/durationMin) を code に持たない（solver 所有）", () => {
    for (const rel of files) {
      const src = read(rel);
      for (const f of ["startMin", "endMin", "dayIndex", "durationMin"]) expect(src).not.toContain(f);
    }
  });
  it("最終 TravelItinerary / TravelCandidate / scheduled draft を construct しない（型 import も持たない）", () => {
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toMatch(/\bTravelItinerary\b/);
      expect(src).not.toMatch(/\bTravelCandidate\b/);
      expect(src).not.toMatch(/ScheduledTravelItineraryDraft/);
    }
  });
  it("runTravelPlanEngine / evaluateFit を呼ばない", () => {
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toContain("runTravelPlanEngine");
      expect(src).not.toContain("evaluateFit");
    }
  });
  it("外部 fetch/API/DB/Supabase/M2/app/UI を import しない", () => {
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
      expect(src).not.toMatch(/from ["']react/);
    }
  });
});
