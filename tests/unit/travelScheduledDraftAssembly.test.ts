/**
 * A4 — ScheduledTravelItineraryDraft Assembly golden tests
 *
 * 設計正本: docs/t11-c-closeout-and-scheduled-draft-design.md §9（+ CEO 補正: explicit startMin 並びは
 *   stable display/copy 順であって solver 順序でない）
 *
 * 主眼: assembly-ready ⊂ feasible（duration だけでは不可・explicit interval 必須）/ 各 non-optional source 欠落の gap /
 *   copy-only（startMin/endMin/durationMin/dayIndex/date は explicit のみ）/ overlap は fail-closed・修復しない /
 *   lock 窓検査 / draft は authoritative:false・TravelCandidate でない / 並びは display/copy 順 / import 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeManualEntityEvidence } from "@/lib/shared/travel/entity-retrieval";
import { buildCompositionDraft } from "@/lib/shared/travel/composition-preflight";
import { detectAssemblyReadiness } from "@/lib/shared/travel/assembly-readiness-detector";
import { assembleScheduledDraft } from "@/lib/shared/travel/scheduled-draft-assembler";
import type { AssemblyInput } from "@/lib/shared/travel/assembly-types";
import type { CompositionDraft, CompositionInput } from "@/lib/shared/travel/composition-types";
import type { EntityEvidence } from "@/lib/shared/travel/entity-retrieval-types";
import type { RouteChainState } from "@/lib/shared/travel/fit-types";
import type { BudgetBand, TravelPlanScope } from "@/lib/shared/travel/core-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const ev = (over: Partial<EntityEvidence> & { placeRefId: string; category: EntityEvidence["category"] }): EntityEvidence => ({ facts: [], ...over });
const lodging = (id = "L1") => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "lodging", facts: [{ kind: "priceBand", lo: 10000, hi: 20000, currency: "JPY", provenance: "editorial" }] }));
const food = (id = "F1") => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "food", facts: [{ kind: "priceBand", lo: 3000, hi: 6000, provenance: "editorial" }] }));
const foodNoPrice = (id = "F1") => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "food" }));
const band: BudgetBand = { lo: 1000, hi: 2000, confidence: 0.5, currency: "JPY" };
const singleDay: TravelPlanScope = { mode: "travel", window: { kind: "single_day", date: "2026-07-01" } };
const range1: TravelPlanScope = { mode: "travel", window: { kind: "range", startDate: "2026-07-01", endDate: "2026-07-02", nights: 1 } };
const routeChain: RouteChainState = { connection: { fromRef: "L1", toRef: "F1", legs: [{ mode: "rail", legKind: "mainLeg", timeMin: 20 }], transferNodes: [] } };

const draftOf = (over: Partial<CompositionInput> = {}): CompositionDraft => {
  const r = buildCompositionDraft({ candidateId: "candidate:relaxed", entities: [lodging(), food()], bindings: [{ placeRefId: "L1" }, { placeRefId: "F1" }], ...over });
  if (r.outcome !== "draft") throw new Error(`expected draft, got ${r.outcome}`);
  return r;
};
/** 全 node に explicit interval（非重複・昇順割当） */
const intervalsFor = (d: CompositionDraft, start = 540, span = 60, gap = 30) =>
  Object.fromEntries(d.candidateNodes.map((n, i) => [n.nodeId, { startMin: start + i * (span + gap), endMin: start + i * (span + gap) + span }]));
const edgeDurFor = (d: CompositionDraft, m = 20) => Object.fromEntries(d.edges.filter((e) => e.kind === "route_transition").map((e) => [`${e.fromNodeId}>>${e.toNodeId}`, m]));
const asScheduled = (r: ReturnType<typeof assembleScheduledDraft>) => {
  if (r.outcome !== "scheduled_draft") throw new Error(`expected scheduled_draft, got ${r.outcome}`);
  return r;
};

// ── 1. assembly-ready ⊂ feasible（duration ≠ interval）────────────────────────
describe("1. assembly readiness gaps", () => {
  it("duration はあるが interval 無 → not assembly-ready / node_interval_missing", () => {
    const d = draftOf();
    const input: AssemblyInput = { draft: d, scope: singleDay, nodeIntervals: {}, edgeDurations: {} };
    const r = detectAssemblyReadiness(input);
    expect(r.assemblyReady).toBe(false);
    expect(r.gaps.map((g) => g.kind)).toContain("node_interval_missing");
  });
  it("budgetBand 欠落 → price_unknown", () => {
    const d = draftOf({ entities: [lodging(), foodNoPrice()], bindings: [{ placeRefId: "L1" }, { placeRefId: "F1" }] });
    const input: AssemblyInput = { draft: d, scope: singleDay, nodeIntervals: intervalsFor(d), edgeDurations: {} };
    expect(detectAssemblyReadiness(input).gaps.map((g) => g.kind)).toContain("price_unknown");
  });
  it("edge duration/transport/cost 欠落 → route_duration_missing/edge_transport_missing/edge_cost_missing", () => {
    const d = draftOf({ routeChains: [routeChain] });
    const input: AssemblyInput = { draft: d, scope: singleDay, nodeIntervals: intervalsFor(d), edgeDurations: {} };
    const kinds = detectAssemblyReadiness(input).gaps.map((g) => g.kind);
    expect(kinds).toContain("route_duration_missing");
    expect(kinds).toContain("edge_cost_missing"); // PreSolverEdge.cost 無
  });
  it("date(scope) 欠落 → date_missing", () => {
    const d = draftOf();
    expect(detectAssemblyReadiness({ draft: d, nodeIntervals: intervalsFor(d), edgeDurations: {} }).gaps.map((g) => g.kind)).toContain("date_missing");
  });
  it("多日(range) で node→day binding 欠落 → day_assignment_missing", () => {
    const d = draftOf();
    expect(detectAssemblyReadiness({ draft: d, scope: range1, nodeIntervals: intervalsFor(d), edgeDurations: {} }).gaps.map((g) => g.kind)).toContain("day_assignment_missing");
  });
  it("single_day は dayIndex 0 自明（day_assignment_missing なし）", () => {
    const d = draftOf();
    const r = detectAssemblyReadiness({ draft: d, scope: singleDay, nodeIntervals: intervalsFor(d), edgeDurations: {} });
    expect(r.gaps.map((g) => g.kind)).not.toContain("day_assignment_missing");
    expect(r.assemblyReady).toBe(true); // 全 explicit（PreSolverNode.budgetBand あり・edge なし）
  });
});

// ── 2. invalid / overlap / lock window（fail-closed・修復しない）────────────────
describe("2. fail-closed validation", () => {
  it("invalid interval（endMin<=startMin）→ invalid_interval・draft なし", () => {
    const d = draftOf();
    const bad = Object.fromEntries(d.candidateNodes.map((n) => [n.nodeId, { startMin: 600, endMin: 600 }]));
    const input: AssemblyInput = { draft: d, scope: singleDay, nodeIntervals: bad, edgeDurations: {} };
    expect(detectAssemblyReadiness(input).gaps.map((g) => g.kind)).toContain("invalid_interval");
    expect(assembleScheduledDraft(input).outcome).toBe("not_ready");
  });
  it("overlap → overlapping_interval・fail-closed（assembler は修復しない）", () => {
    const d = draftOf();
    const overlap = Object.fromEntries(d.candidateNodes.map((n) => [n.nodeId, { startMin: 600, endMin: 700 }])); // 全部同区間
    const input: AssemblyInput = { draft: d, scope: singleDay, nodeIntervals: overlap, edgeDurations: {} };
    expect(detectAssemblyReadiness(input).gaps.map((g) => g.kind)).toContain("overlapping_interval");
    expect(assembleScheduledDraft(input).outcome).toBe("not_ready");
  });
  it("explicit lock window 違反 → lock_window_violation・draft なし", () => {
    const d = draftOf();
    const iv = intervalsFor(d, 540); // L1 node は 09:00 開始
    const input: AssemblyInput = { draft: d, scope: singleDay, nodeIntervals: iv, edgeDurations: {}, lockWindows: { L1: { startMin: 900, endMin: 1080 } } };
    expect(detectAssemblyReadiness(input).gaps.map((g) => g.kind)).toContain("lock_window_violation");
    expect(assembleScheduledDraft(input).outcome).toBe("not_ready");
  });
});

// ── 3. copy-only assembler（全 explicit → draft）───────────────────────────────
describe("3. copy-only assembler", () => {
  it("全 explicit → ScheduledTravelItineraryDraft（copy のみ・authoritative:false/draft:true）", () => {
    const d = draftOf({ routeChains: [routeChain] });
    const iv = intervalsFor(d);
    const input: AssemblyInput = {
      draft: d, scope: singleDay, nodeIntervals: iv, edgeDurations: edgeDurFor(d),
      edgeTransports: {}, edgeCosts: Object.fromEntries(d.edges.filter((e) => e.kind === "route_transition").map((e) => [`${e.fromNodeId}>>${e.toNodeId}`, band])),
    };
    const out = asScheduled(assembleScheduledDraft(input));
    expect(out.outcome).toBe("scheduled_draft");
    expect(out.authoritative).toBe(false);
    expect(out.draft).toBe(true);
    // copy された startMin/endMin は explicit のみ
    const allNodes = out.itinerary.days.flatMap((day) => day.nodes);
    for (const tn of allNodes) expect(iv[tn.nodeId]).toEqual({ startMin: tn.startMin, endMin: tn.endMin });
    // durationMin は explicit のみ
    const allEdges = out.itinerary.days.flatMap((day) => day.edges);
    for (const te of allEdges) expect(te.durationMin).toBe(20);
    // TravelCandidate でない / candidates に入れない
    expect(JSON.stringify(out)).not.toContain("\"tradeoff\"");
    expect(Object.keys(out)).not.toContain("candidates");
    expect(Object.keys(out)).not.toContain("executionAuthority");
  });
  it("range 全 explicit（node→day binding）→ draft・date は scope 由来（offset）", () => {
    const d = draftOf();
    const bindings = Object.fromEntries(d.candidateNodes.map((n, i) => [n.nodeId, i === 0 ? 0 : 1]));
    const iv = intervalsFor(d); // 非重複 interval（同日 node が重ならない）
    const out = asScheduled(assembleScheduledDraft({ draft: d, scope: range1, nodeIntervals: iv, nodeDayBindings: bindings, edgeDurations: {} }));
    const dates = out.itinerary.days.map((day) => day.date);
    expect(dates).toContain("2026-07-01");
    expect(dates).toContain("2026-07-02"); // startDate + dayIndex 1（offset・guess でない）
  });
  it("day 内 node は explicit startMin の昇順（stable display/copy 順）", () => {
    const d = draftOf();
    const ids = d.candidateNodes.map((n) => n.nodeId);
    // 逆順の startMin を与える → 出力は startMin 昇順に並ぶ（explicit 値の反映）
    const iv = Object.fromEntries(d.candidateNodes.map((n, i) => [n.nodeId, { startMin: 1000 - i * 100, endMin: 1000 - i * 100 + 30 }]));
    const out = asScheduled(assembleScheduledDraft({ draft: d, scope: singleDay, nodeIntervals: iv, edgeDurations: {} }));
    const day0 = out.itinerary.days.find((day) => day.dayIndex === 0)!;
    const starts = day0.nodes.map((n) => n.startMin);
    expect([...starts]).toEqual([...starts].sort((a, b) => a - b)); // 昇順
    expect(ids.length).toBeGreaterThan(1);
  });
  it("not ready（interval 無）→ assembler は draft を作らず not_ready", () => {
    const d = draftOf();
    const r = assembleScheduledDraft({ draft: d, scope: singleDay, nodeIntervals: {}, edgeDurations: {} });
    expect(r.outcome).toBe("not_ready");
  });
});

// ── 4. 境界 + import 純度（source-contract）───────────────────────────────────
describe("4. 境界 + import 純度", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const read = (rel: string) => strip(readFileSync(resolve(process.cwd(), rel), "utf8"));
  const files = [
    "lib/shared/travel/assembly-types.ts",
    "lib/shared/travel/assembly-readiness-detector.ts",
    "lib/shared/travel/scheduled-draft-assembler.ts",
  ];
  it("solver を呼ばない（runTravelPlanEngine / evaluateFit 非呼出）", () => {
    for (const rel of files) {
      const src = read(rel);
      expect(src).not.toContain("runTravelPlanEngine");
      expect(src).not.toContain("evaluateFit");
    }
  });
  it("TravelCandidate を emit しない（型 import も持たない）", () => {
    for (const rel of files) expect(read(rel)).not.toMatch(/\bTravelCandidate\b/);
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
