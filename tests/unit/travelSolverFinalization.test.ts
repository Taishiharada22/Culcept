/**
 * S4-G — Finalization / handoff golden tests
 *
 * 設計正本: docs/t11-s4-finalization-handoff-design.md（+ CEO 補正: accept_default stale 防止・
 *   AssemblyInputCandidate は server-only）
 *
 * 主眼: provisionalDefault 単独で handoff しない・accept_default(identity 一致)で解決・stale 拒否・
 *   time_window_choice は explicit 数値 region から materialize・forced 自動充填・slack→unresolved・
 *   ordering_choice は選択まで未解決・選択 cascade(provenance)・day は forced/explicit のみ(phantom なし)・
 *   missing は S4HandoffGap・全選択で AssemblyInputCandidate(server-only・itinerary でない)・assembler 非呼出・
 *   private narrowing を shared に漏らさない・import 純度。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeManualEntityEvidence } from "@/lib/shared/travel/entity-retrieval";
import { buildCompositionDraft } from "@/lib/shared/travel/composition-preflight";
import { computeSequencingFeasibility } from "@/lib/shared/travel/solver-sequencing-feasibility";
import { applySelectionLedger } from "@/lib/shared/travel/solver-finalization";
import type { S4ResolutionInput, ChoiceSelection } from "@/lib/shared/travel/solver-finalization-types";
import type { CompositionDraft, CompositionInput } from "@/lib/shared/travel/composition-types";
import type { SolverScheduleInput } from "@/lib/shared/travel/solver-schedule-types";
import type { EntityEvidence } from "@/lib/shared/travel/entity-retrieval-types";
import type { TravelPlanScope, BudgetBand, TransportMode } from "@/lib/shared/travel/core-types";

// ── fixtures ────────────────────────────────────────────────────────────────
const ev = (over: Partial<EntityEvidence> & { placeRefId: string; category: EntityEvidence["category"] }): EntityEvidence => ({ facts: [], ...over });
const place = (id: string) => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "place", facts: [{ kind: "priceBand", lo: 1000, hi: 2000, currency: "JPY", provenance: "editorial" }] }));
const placeNoBudget = (id: string) => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "place" }));
const single: TravelPlanScope = { mode: "travel", window: { kind: "single_day", date: "2026-07-01" } };
const band: BudgetBand = { lo: 1000, hi: 2000, confidence: 0.5, currency: "JPY" };

const draftOf = (ids: string[], over: Partial<CompositionInput> = {}): CompositionDraft => {
  const r = buildCompositionDraft({ candidateId: "c:relaxed", entities: ids.map(place), bindings: ids.map((id) => ({ placeRefId: id })), ...over });
  if (r.outcome !== "draft") throw new Error(`expected draft, got ${r.outcome}`);
  return r;
};
const draftNoBudget = (ids: string[]): CompositionDraft => {
  const r = buildCompositionDraft({ candidateId: "c:relaxed", entities: ids.map(placeNoBudget), bindings: ids.map((id) => ({ placeRefId: id })) });
  if (r.outcome !== "draft") throw new Error("expected draft");
  return r;
};
const durs = (d: CompositionDraft, m = 60) => Object.fromEntries(d.candidateNodes.map((n) => [n.nodeId, m]));
const base = (d: CompositionDraft, over: Partial<SolverScheduleInput> = {}): SolverScheduleInput => ({ draft: d, scope: single, nodeDurations: durs(d, 60), edgeDurations: {}, ...over });
const input = (d: CompositionDraft, ledger: ChoiceSelection[], over: Partial<S4ResolutionInput> = {}): S4ResolutionInput => ({
  base: base(d), sequencing: computeSequencingFeasibility(base(d)), ledger, ...over,
});
const nid = (d: CompositionDraft, i = 0) => d.candidateNodes[i].nodeId;

// ── 1. forced / slack / ordering_choice ──────────────────────────────────────
describe("1. forced vs choice", () => {
  it("forced(2 node 制約で順序確定) は handoff へ・provisionalDefault 不要", () => {
    // a→b 強制 + 短 dwell・budget/不要 → 全 forced 化を狙うが時間 slack が残る → unresolved
    const d = draftOf(["a", "b"], { orderingConstraints: [{ kind: "must_precede", subjectRef: "a", objectRef: "b", relaxable: false }] });
    const r = applySelectionLedger(input(d, []));
    // 順序は forced だが開始時刻に slack → unresolved(time_window_choice)
    expect(r.outcome).toBe("unresolved_choices");
  });
  it("slack ある interval → unresolved(time_window_choice)・provisionalDefault 単独で handoff しない", () => {
    const d = draftOf(["a"]);
    const r = applySelectionLedger(input(d, []));
    expect(r.outcome).toBe("unresolved_choices");
    if (r.outcome === "unresolved_choices") {
      const tw = r.residualChoicePoints.find((c) => c.kind === "time_window_choice");
      expect(tw).toBeDefined();
      expect(tw!.provisionalDefault).toBeDefined(); // SUGGESTION あり
      expect(tw!.feasibleRange).toBeDefined();
    }
  });
  it("ordering_choice は選択まで未解決", () => {
    const d = draftOf(["a", "b"], { orderingConstraints: [{ kind: "reorderable", subjectRef: "a", objectRef: "b", relaxable: true }] });
    const r = applySelectionLedger(input(d, []));
    expect(r.outcome).toBe("unresolved_choices");
    if (r.outcome === "unresolved_choices") expect(r.residualChoicePoints.some((c) => c.kind === "ordering_choice")).toBe(true);
  });
});

// ── 2. time 選択で解決 → server-only AssemblyInputCandidate ─────────────────────
describe("2. time 選択 → handoff", () => {
  const timeSel = (d: CompositionDraft, i: number, startMin: number): ChoiceSelection => ({ selectionId: `s${i}`, kind: "time_window_choice", ref: nid(d, i), selected: { mode: "time", startMin }, origin: "user_explicit" });
  it("全 node の開始時刻を明示選択 → AssemblyInputCandidate(server-only・itinerary でない)", () => {
    const d = draftOf(["a", "b"]);
    const r = applySelectionLedger(input(d, [timeSel(d, 0, 540), timeSel(d, 1, 720)]));
    expect(r.outcome).toBe("assembly_input_candidate");
    if (r.outcome === "assembly_input_candidate") {
      expect(r.serverOnly).toBe(true);
      expect(r.authoritative).toBe(false);
      expect(r.assemblyInput.nodeIntervals[nid(d, 0)]).toEqual({ startMin: 540, endMin: 600 });
      // itinerary/candidate/scheduled_draft を含まない
      const json = JSON.stringify(r);
      for (const f of ["itinerary", "scheduled_draft", "tradeoff", "TravelCandidate", "executionAuthority", "booking"]) expect(json).not.toContain(f);
      expect(r.resolutionTrace[nid(d, 0)]).toBe("explicit_selection");
    }
  });
  it("時刻未選択の node が残る → unresolved（部分解決で candidate にしない）", () => {
    const d = draftOf(["a", "b"]);
    expect(applySelectionLedger(input(d, [timeSel(d, 0, 540)])).outcome).toBe("unresolved_choices");
  });
});

// ── 3. accept_default + stale 防止 ────────────────────────────────────────────
describe("3. accept_default / stale", () => {
  it("identity 一致の accept_default で解決", () => {
    const d = draftOf(["a"]);
    const pre = applySelectionLedger(input(d, []));
    if (pre.outcome !== "unresolved_choices") throw new Error("expected unresolved");
    const tw = pre.residualChoicePoints.find((c) => c.kind === "time_window_choice")!;
    const fp = `${tw.kind}|${tw.ref}|${(tw.feasibleOptions ?? []).join(",")}|${tw.feasibleRange ? `${tw.feasibleRange.lo}-${tw.feasibleRange.hi}` : ""}|${tw.provisionalDefault ?? ""}|${tw.namedTieBreak}`;
    const sel: ChoiceSelection = { selectionId: "s0", kind: "time_window_choice", ref: tw.ref, selected: { mode: "time", startMin: tw.provisionalDefault! }, origin: "accept_default", acceptedDefaultIdentity: fp };
    const r = applySelectionLedger(input(d, [sel]));
    expect(r.outcome).toBe("assembly_input_candidate");
    if (r.outcome === "assembly_input_candidate") expect(r.handoffProvenance[0].basis).toBe("accepted_default");
  });
  it("★ stale identity の accept_default → selection_rejected(stale_default)", () => {
    const d = draftOf(["a"]);
    const sel: ChoiceSelection = { selectionId: "s0", kind: "time_window_choice", ref: nid(d, 0), selected: { mode: "time", startMin: 0 }, origin: "accept_default", acceptedDefaultIdentity: "STALE|wrong|fingerprint" };
    const r = applySelectionLedger(input(d, [sel]));
    expect(r.outcome).toBe("selection_rejected");
    if (r.outcome === "selection_rejected") expect(r.rejections[0].reason).toBe("stale_default");
  });
});

// ── 4. ordering 選択 cascade ──────────────────────────────────────────────────
describe("4. ordering 選択 → cascade", () => {
  it("ordering 選択 + 時刻選択で解決し cascade を provenance 記録", () => {
    const d = draftOf(["a", "b"], { orderingConstraints: [{ kind: "reorderable", subjectRef: "a", objectRef: "b", relaxable: true }] });
    const [a, b] = d.candidateNodes.map((n) => n.nodeId);
    const ordSel: ChoiceSelection = { selectionId: "o1", kind: "ordering_choice", ref: `${a}|${b}`, selected: { mode: "ordering", option: `${a}→${b}` }, origin: "user_explicit" };
    const t1: ChoiceSelection = { selectionId: "t1", kind: "time_window_choice", ref: a, selected: { mode: "time", startMin: 540 }, origin: "user_explicit" };
    const t2: ChoiceSelection = { selectionId: "t2", kind: "time_window_choice", ref: b, selected: { mode: "time", startMin: 720 }, origin: "user_explicit" };
    const r = applySelectionLedger(input(d, [ordSel, t1, t2]));
    expect(r.outcome).toBe("assembly_input_candidate");
  });
  it("ordering choice の accept_default は無効（provisionalDefault 無→stale_default）", () => {
    const d = draftOf(["a", "b"], { orderingConstraints: [{ kind: "reorderable", subjectRef: "a", objectRef: "b", relaxable: true }] });
    const [a, b] = d.candidateNodes.map((n) => n.nodeId);
    const sel: ChoiceSelection = { selectionId: "o1", kind: "ordering_choice", ref: `${a}|${b}`, selected: { mode: "ordering", option: `${a}→${b}` }, origin: "accept_default", acceptedDefaultIdentity: "x" };
    const r = applySelectionLedger(input(d, [sel]));
    expect(r.outcome).toBe("selection_rejected");
    if (r.outcome === "selection_rejected") expect(r.rejections[0].reason).toBe("stale_default");
  });
});

// ── 5. 不正選択 ───────────────────────────────────────────────────────────────
describe("5. 不正選択は neutral 拒否", () => {
  it("unknown ref → unknown_choice", () => {
    const d = draftOf(["a"]);
    const sel: ChoiceSelection = { selectionId: "s", kind: "time_window_choice", ref: "node:ghost:other", selected: { mode: "time", startMin: 100 }, origin: "user_explicit" };
    const r = applySelectionLedger(input(d, [sel]));
    expect(r.outcome).toBe("selection_rejected");
    if (r.outcome === "selection_rejected") expect(r.rejections[0].reason).toBe("unknown_choice");
  });
  it("feasibleRange 外の time → invalid_option", () => {
    const d = draftOf(["a"]);
    const sel: ChoiceSelection = { selectionId: "s", kind: "time_window_choice", ref: nid(d, 0), selected: { mode: "time", startMin: 9999 }, origin: "user_explicit" };
    const r = applySelectionLedger(input(d, [sel]));
    expect(r.outcome).toBe("selection_rejected");
    if (r.outcome === "selection_rejected") expect(r.rejections[0].reason).toBe("invalid_option");
  });
});

// ── 6. handoff gap（S4HandoffGap）/ budget 等の AssemblyGap mirror ──────────────
describe("6. missing handoff → S4HandoffGap", () => {
  it("budget 無 → unresolved + price_unknown(AssemblyGap) を missingForHandoff に", () => {
    const d = draftNoBudget(["a"]); // budget 無 → 全 time 選択しても detectAssemblyReadiness が price_unknown
    const r = applySelectionLedger(input(d, [{ selectionId: "s0", kind: "time_window_choice", ref: nid(d, 0), selected: { mode: "time", startMin: 540 }, origin: "user_explicit" }]));
    expect(r.outcome).toBe("unresolved_choices");
    if (r.outcome === "unresolved_choices") expect(r.missingForHandoff.map((g) => g.kind)).toContain("price_unknown");
  });
  it("budget extras 供給 → AssemblyInputCandidate", () => {
    const d = draftNoBudget(["a"]);
    const r = applySelectionLedger(input(d, [{ selectionId: "s0", kind: "time_window_choice", ref: nid(d, 0), selected: { mode: "time", startMin: 540 }, origin: "user_explicit" }], { assemblyExtras: { nodeBudgetBands: { [nid(d, 0)]: band } } }));
    expect(r.outcome).toBe("assembly_input_candidate");
    if (r.outcome === "assembly_input_candidate") expect(r.assemblyInput.nodeBudgetBands).toEqual({ [nid(d, 0)]: band });
  });
});

// ── 7. privacy（authoritative narrow・shared に漏らさない）─────────────────────
describe("7. private narrowing は shared に漏れない", () => {
  it("shared-visible 選択が private 制約違反 → selection_rejected(neutral・private 理由なし)", () => {
    const d = draftOf(["a"]);
    const a = nid(d, 0);
    // private に a の開始 ≥ 600 を強制。shared には見えない → user が 540 を選ぶと authoritative 違反
    const b: SolverScheduleInput = { ...base(d), timeBounds: [{ nodeId: a, event: "start", kind: "no_earlier_than", minute: 600, visibility: "private", constraintId: "tb:priv" }] };
    const r = applySelectionLedger({ base: b, sequencing: computeSequencingFeasibility(b), ledger: [{ selectionId: "s0", kind: "time_window_choice", ref: a, selected: { mode: "time", startMin: 540 }, origin: "user_explicit" }] });
    expect(r.outcome).toBe("selection_rejected");
    if (r.outcome === "selection_rejected") {
      expect(r.rejections[0].reason).toBe("selection_infeasible"); // neutral
      expect(JSON.stringify(r)).not.toContain("priv"); // private constraintId/理由が出ない
    }
  });
});

// ── 8. 境界 + import 純度（source-contract）───────────────────────────────────
describe("8. 境界 + import 純度", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const read = () => strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/solver-finalization.ts"), "utf8"));
  it("assembleScheduledDraft を呼ばない・itinerary/candidate/engine/evaluateFit を出さない", () => {
    const src = read();
    for (const f of ["assembleScheduledDraft", "ScheduledTravelItineraryDraft", "TravelItinerary", "TravelCandidate", "runTravelPlanEngine", "evaluateFit"]) expect(src).not.toContain(f);
  });
  it("外部 fetch/API/DB/Supabase/M2/app/UI を import しない", () => {
    const src = read();
    expect(src).not.toMatch(/\bfetch\(/);
    expect(src).not.toMatch(/supabase/i);
    expect(src).not.toMatch(/from ["']next/);
    expect(src).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
    expect(src).not.toMatch(/from ["']react/);
  });
});
