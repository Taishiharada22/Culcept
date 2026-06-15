/**
 * T11-B5 — Itinerary Composition / Solver Boundary golden tests
 *
 * 設計正本: docs/t11-b-itinerary-composition-solver-boundary-preflight.md §14
 *
 * 主眼: entity→node 写像 / hard-block fail-closed / 制約 carry（schedule しない）/ reorderable=hint /
 *   cycle 検出（resolve しない）/ 非relaxable cycle→failure / route placeholder（duration 捏造なし）/
 *   budgetBand optional / fatigueLoad 数値 / accessibility=TriState / fallback carry+private strip /
 *   solver 境界（startMin/endMin/dayIndex/durationMin なし・engine/evaluateFit 非呼出）/ import 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeManualEntityEvidence } from "@/lib/shared/travel/entity-retrieval";
import { mapEntityToNodes } from "@/lib/shared/travel/composition-node-mapper";
import { collectConstraints } from "@/lib/shared/travel/composition-constraint-collector";
import { buildCompositionDraft } from "@/lib/shared/travel/composition-preflight";
import type { CompositionInput } from "@/lib/shared/travel/composition-types";
import type { EntityEvidence } from "@/lib/shared/travel/entity-retrieval-types";
import type { OrderingConstraint, FitResult, RouteChainState } from "@/lib/shared/travel/fit-types";
import type { ContingencyBranch } from "@/lib/shared/travel/contingency-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const ev = (over: Partial<EntityEvidence> & { placeRefId: string; category: EntityEvidence["category"] }): EntityEvidence => ({
  facts: [],
  ...over,
});
const lodging = (id = "L1") =>
  normalizeManualEntityEvidence(ev({
    placeRefId: id, category: "lodging",
    facts: [
      { kind: "priceBand", lo: 10000, hi: 20000, currency: "JPY", provenance: "editorial" },
      { kind: "timeLock", lockKind: "checkin_window_lock", rawTime: "15:00-18:00", provenance: "editorial" },
      { kind: "burden", axis: "physicalLoad", value: 0.4, provenance: "editorial" },
    ],
  }));
const food = (id = "F1") =>
  normalizeManualEntityEvidence(ev({ placeRefId: id, category: "food", facts: [{ kind: "priceBand", lo: 3000, hi: 6000, provenance: "editorial" }] }));
const support = (id = "S1") =>
  normalizeManualEntityEvidence(ev({ placeRefId: id, category: "support", facts: [{ kind: "supportRelief", reliefAxis: "luggage", necessity: "recommended", provenance: "editorial" }] }));
const transport = (id = "T1") => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "transport" }));
const placeNoPrice = (id = "P1") => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "place" }));

const fakeFit = (over: Partial<FitResult> = {}): FitResult => ({
  authoritative: false, fitLabel: "good", components: [], hardBlocks: [], mismatchReasons: [],
  whyFits: [], whyMayFail: [], riskFlags: [], rationale: { shared: "", forParticipant: {} },
  perParticipantFit: [], groupAggregateFit: null, conflicts: [], confidence: 0.7,
  labelStability: "stable", labelCap: null, missingDataQuestions: [], placeRefId: "X", subjectKind: "solo",
  ...over,
});

const baseInput = (over: Partial<CompositionInput> = {}): CompositionInput => ({
  candidateId: "candidate:relaxed",
  entities: [lodging(), food()],
  bindings: [{ placeRefId: "L1" }, { placeRefId: "F1" }],
  ...over,
});
const asDraft = (r: ReturnType<typeof buildCompositionDraft>) => {
  if (r.outcome !== "draft") throw new Error(`expected draft, got ${r.outcome}`);
  return r;
};

// ── 1. entity → node 写像 ─────────────────────────────────────────────────────
describe("1. entity→node mapping", () => {
  it("fitted lodging → lodging_checkin node・checkin_window_lock で anchor", () => {
    const m = mapEntityToNodes(lodging(), { fit: fakeFit() });
    const checkin = m.nodes.find((n) => n.activityKind === "lodging_checkin");
    expect(checkin).toBeDefined();
    expect(checkin!.nodeConfidence).toBe("anchor"); // firm lock
    expect(checkin!.budgetBand).toEqual({ lo: 10000, hi: 20000, confidence: expect.any(Number), currency: "JPY" });
  });
  it("hard-blocked lodging → node 0 + hardBlocker（reason は code のみ）", () => {
    const m = mapEntityToNodes(lodging(), { fit: fakeFit({ hardBlocks: [{ reason: "red_line_violation", visibility: "shared", ownerParticipantId: null }] }) });
    expect(m.nodes).toHaveLength(0);
    expect(m.hardBlocker?.reasonCode).toBe("red_line_violation");
  });
  it("private hard block → node 0・visibility=private を carry（reason 自体は code）", () => {
    const m = mapEntityToNodes(lodging(), { fit: fakeFit({ hardBlocks: [{ reason: "hard_constraint_violation", visibility: "private", ownerParticipantId: "p1" }] }) });
    expect(m.nodes).toHaveLength(0);
    expect(m.hardBlocker?.visibility).toBe("private");
  });
  it("restaurant → meal node", () => {
    expect(mapEntityToNodes(food()).nodes.map((n) => n.activityKind)).toContain("meal");
  });
  it("support(luggage) → other node（ActivityKind に support 無）", () => {
    expect(mapEntityToNodes(support()).nodes.map((n) => n.activityKind)).toEqual(["other"]);
  });
  it("transport → node を作らない（edge/transition）", () => {
    expect(mapEntityToNodes(transport()).nodes).toHaveLength(0);
  });
});

// ── 2. budgetBand optional / fatigueLoad 数値 / accessibility TriState ──────────
describe("2. field 規律", () => {
  it("price 未供給 → budgetBand 省略 + price_unknown question（捏造しない）", () => {
    const m = mapEntityToNodes(placeNoPrice());
    expect(m.nodes[0].budgetBand).toBeUndefined();
    expect(m.missingQuestions.map((q) => q.reason)).toContain("price_unknown");
  });
  it("fatigueLoad は数値 1..5", () => {
    const n = mapEntityToNodes(lodging()).nodes[0];
    expect(typeof n.fatigueLoad).toBe("number");
    expect([1, 2, 3, 4, 5]).toContain(n.fatigueLoad);
  });
  it("accessibility は hardProfile の TriState（Observed でない）", () => {
    const acc = normalizeManualEntityEvidence(ev({ placeRefId: "A1", category: "place", facts: [{ kind: "accessibilityStepFree", value: "unknown", provenance: "editorial" }] }));
    expect(acc.entity.hardProfile?.accessibility?.stepFree).toBe("unknown");
  });
  it("node は startMin/endMin/dayIndex を持たない", () => {
    const n = mapEntityToNodes(lodging()).nodes[0];
    expect(Object.keys(n)).not.toContain("startMin");
    expect(Object.keys(n)).not.toContain("endMin");
    expect(Object.keys(n)).not.toContain("dayIndex");
  });
});

// ── 3. 制約 collector（carry・schedule しない）─────────────────────────────────
describe("3. constraint collector", () => {
  const lk = (kind: OrderingConstraint["kind"], relaxable = false): OrderingConstraint => ({ kind, subjectRef: "L1", objectRef: "L1", relaxable });
  it("checkin/open-hours/meal lock → time constraint", () => {
    const c = collectConstraints({ orderingConstraints: [lk("checkin_window_lock"), lk("open_hours_window_lock"), lk("meal_time_lock")] });
    expect(c.constraints).toHaveLength(3);
    expect(c.constraints.every((x) => x.axis === "time")).toBe(true);
    expect(c.constraints.every((x) => x.severity === "hard")).toBe(true);
  });
  it("last_departure_lock → time constraint/risk（live timetable でない・descriptor のみ）", () => {
    const c = collectConstraints({ orderingConstraints: [lk("last_departure_lock")] });
    expect(c.constraints[0].axis).toBe("time");
    expect(c.constraints[0].descriptor).toContain("last_departure_lock");
  });
  it("must_precede → 方向 precedence・luggage_drop_enables → ordering carrier（解かない）", () => {
    const c = collectConstraints({ orderingConstraints: [
      { kind: "must_precede", subjectRef: "L1", objectRef: "F1", relaxable: false },
      { kind: "luggage_drop_enables", subjectRef: "S1", objectRef: "P1", relaxable: false },
    ] });
    expect(c.precedence.map((p) => p.kind).sort()).toEqual(["luggage_drop_enables", "must_precede"]);
  });
  it("reorderable → reorderable carrier（precedence/edge にしない）", () => {
    const c = collectConstraints({ orderingConstraints: [{ kind: "reorderable", subjectRef: "L1", objectRef: "F1", relaxable: true }] });
    expect(c.reorderable).toHaveLength(1);
    expect(c.precedence).toHaveLength(0);
  });
  it("derive_shortest_from_terminal → solver hint（preflight 解かない）", () => {
    const c = collectConstraints({ orderingConstraints: [{ kind: "derive_shortest_from_terminal", subjectRef: "X", objectRef: "Y", relaxable: false }] });
    expect(c.solverHints).toHaveLength(1);
  });
  it("relaxable cycle → 検出のみ（ordering_cycle・非relaxable cycle なし）", () => {
    const c = collectConstraints({ orderingConstraints: [
      { kind: "must_precede", subjectRef: "A", objectRef: "B", relaxable: true },
      { kind: "must_precede", subjectRef: "B", objectRef: "A", relaxable: true },
    ] });
    expect(c.unsatisfied.map((u) => u.reason)).toContain("ordering_cycle");
    expect(c.hasNonRelaxableCycle).toBe(false);
  });
});

// ── 4. preflight 合成 ─────────────────────────────────────────────────────────
describe("4. buildCompositionDraft", () => {
  it("draft は authoritative:false / draft:true / candidateNodes フラット", () => {
    const d = asDraft(buildCompositionDraft(baseInput()));
    expect(d.authoritative).toBe(false);
    expect(d.draft).toBe(true);
    expect(d.candidateNodes.length).toBeGreaterThan(0);
  });
  it("entity 未束縛 → entity_unbound question・node 化しない", () => {
    const d = asDraft(buildCompositionDraft(baseInput({ bindings: [{ placeRefId: "L1" }, { placeRefId: "GHOST" }] })));
    expect(d.missingCompositionQuestions.map((q) => q.reason)).toContain("entity_unbound");
  });
  it("全 entity hard-blocked → CompositionFailure(all_nodes_hard_blocked・代替必要)", () => {
    const r = buildCompositionDraft(baseInput({
      fitInputs: [
        { candidateId: "L1", fit: fakeFit({ hardBlocks: [{ reason: "red_line_violation", visibility: "shared", ownerParticipantId: null }] }) },
        { candidateId: "F1", fit: fakeFit({ hardBlocks: [{ reason: "hard_constraint_violation", visibility: "shared", ownerParticipantId: null }] }) },
      ],
    }));
    expect(r.outcome).toBe("failure");
    if (r.outcome === "failure") {
      expect(r.reason).toBe("all_nodes_hard_blocked");
      expect(r.needsAlternative).toBe(true);
    }
  });
  it("非relaxable cycle → CompositionFailure(impossible_time_lock)・順序を解かない", () => {
    const r = buildCompositionDraft(baseInput({ orderingConstraints: [
      { kind: "must_precede", subjectRef: "L1", objectRef: "F1", relaxable: false },
      { kind: "must_precede", subjectRef: "F1", objectRef: "L1", relaxable: false },
    ] }));
    expect(r.outcome).toBe("failure");
    if (r.outcome === "failure") expect(r.reason).toBe("impossible_time_lock");
  });
  it("relaxable cycle → draft + ordering_cycle 検出（resolve/reorder しない・両 edge 残存）", () => {
    const d = asDraft(buildCompositionDraft(baseInput({ orderingConstraints: [
      { kind: "must_precede", subjectRef: "L1", objectRef: "F1", relaxable: true },
      { kind: "must_precede", subjectRef: "F1", objectRef: "L1", relaxable: true },
    ] })));
    expect(d.unsatisfiedConstraints.map((u) => u.reason)).toContain("ordering_cycle");
    expect(d.edges.filter((e) => e.kind === "must_precede")).toHaveLength(2);
  });
  it("reorderable → reorderableHint（directed edge でない）", () => {
    const d = asDraft(buildCompositionDraft(baseInput({ orderingConstraints: [{ kind: "reorderable", subjectRef: "L1", objectRef: "F1", relaxable: true }] })));
    expect(d.reorderableHints).toHaveLength(1);
    expect(d.edges.some((e) => e.kind === "must_precede")).toBe(false);
  });
  it("luggage_drop_enables → ordering を制約するが startMin/endMin を割らない", () => {
    const d = asDraft(buildCompositionDraft(baseInput({
      entities: [lodging("L1"), food("F1"), support("S1")],
      bindings: [{ placeRefId: "L1" }, { placeRefId: "F1" }, { placeRefId: "S1" }],
      orderingConstraints: [{ kind: "luggage_drop_enables", subjectRef: "S1", objectRef: "F1", relaxable: false }],
    })));
    const e = d.edges.find((x) => x.kind === "luggage_drop_enables");
    expect(e).toBeDefined();
    expect(Object.keys(e!)).not.toContain("durationMin");
    d.candidateNodes.forEach((n) => { expect(Object.keys(n)).not.toContain("startMin"); });
  });
  it("route-chain → edge placeholder（node でない・durationMin 捏造なし）", () => {
    const rc: RouteChainState = { connection: { fromRef: "L1", toRef: "F1", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: 20 }], transferNodes: [] } };
    const d = asDraft(buildCompositionDraft(baseInput({ routeChains: [rc] })));
    const route = d.edges.find((e) => e.kind === "route_transition");
    expect(route?.transport).toBe("train");
    expect(Object.keys(route!)).not.toContain("durationMin");
  });
  it("欠落 route data（legs 空）→ route_duration_missing question", () => {
    const rc: RouteChainState = { connection: { fromRef: "L1", toRef: "F1", legs: [], transferNodes: [] } };
    const d = asDraft(buildCompositionDraft(baseInput({ routeChains: [rc] })));
    expect(d.missingCompositionQuestions.map((q) => q.reason)).toContain("route_duration_missing");
  });
});

// ── 5. fallback carry（live signal でない・private strip）────────────────────────
describe("5. fallback branch carry", () => {
  const branch = (over: Partial<ContingencyBranch>): ContingencyBranch => ({
    trigger: "rain_or_weather", fallbackAction: "switch_proposal", switchToProposalId: "candidate:indoor",
    question: null, readinessImpact: "needs_confirmation", triggerThreshold: 0.5, visibility: "shared",
    rationale: { shared: "", forParticipant: {} }, ...over,
  });
  it("rain fallback → branch carry（trigger rain_or_weather・live weather でない）", () => {
    const d = asDraft(buildCompositionDraft(baseInput({ contingencyBranches: [branch({})] })));
    expect(d.fallbackBranches.map((b) => b.trigger)).toContain("rain_or_weather");
  });
  it("fatigue fallback → downgrade_to_easy branch", () => {
    const d = asDraft(buildCompositionDraft(baseInput({ contingencyBranches: [branch({ trigger: "fatigue", fallbackAction: "downgrade_to_easy", switchToProposalId: null })] })));
    expect(d.fallbackBranches.find((b) => b.trigger === "fatigue")?.fallbackAction).toBe("downgrade_to_easy");
  });
  it("private branch は shared draft から除去（privacy）", () => {
    const d = asDraft(buildCompositionDraft(baseInput({ contingencyBranches: [branch({ visibility: "private" }), branch({})] })));
    expect(d.fallbackBranches.every((b) => b.visibility !== "private")).toBe(true);
    expect(d.fallbackBranches).toHaveLength(1);
  });
});

// ── 6. solver 境界 + import 純度（source-contract）──────────────────────────────
describe("6. solver 境界 + import 純度", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const read = (rel: string) => strip(readFileSync(resolve(process.cwd(), rel), "utf8"));
  const files = [
    "lib/shared/travel/composition-types.ts",
    "lib/shared/travel/composition-node-mapper.ts",
    "lib/shared/travel/composition-constraint-collector.ts",
    "lib/shared/travel/composition-preflight.ts",
  ];
  it("型に startMin/endMin/dayIndex/durationMin の field を持たない（solver 所有）", () => {
    const src = read("lib/shared/travel/composition-types.ts");
    for (const f of ["startMin", "endMin", "dayIndex", "durationMin"]) expect(src).not.toContain(f);
  });
  it("mapper/preflight は runTravelPlanEngine / evaluateFit を呼ばない", () => {
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
  it("最終 TravelItinerary / TravelCandidate / TravelDay を construct しない（型 import も持たない）", () => {
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toMatch(/\bTravelItinerary\b/);
      expect(src).not.toMatch(/\bTravelCandidate\b/);
      expect(src).not.toMatch(/\bTravelDay\b/);
    }
  });
});
