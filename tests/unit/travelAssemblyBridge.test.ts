/**
 * AB3 — S4→A Assembly Bridge golden tests
 *
 * 設計正本: docs/t11-s4a-assembly-bridge-design.md（+ CEO 補正: 成功も server-only envelope）
 *
 * 主眼: valid candidate→server-only scheduled_draft envelope / 非 candidate(unresolved/rejected/needs_input/
 *   infeasible)→no_draft(non_candidate_input) / forged(serverOnly false/authoritative true/draft false)→not_server_only /
 *   readiness 失敗→not_assembly_ready / assembler 拒否→assembler_rejected / assembler は valid 時のみ 1 回呼ぶ /
 *   TravelCandidate/candidates/executionAuthority なし・authoritative:false/draft:true 保持・import 純度。
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeManualEntityEvidence } from "@/lib/shared/travel/entity-retrieval";
import { buildCompositionDraft } from "@/lib/shared/travel/composition-preflight";
import { computeSequencingFeasibility } from "@/lib/shared/travel/solver-sequencing-feasibility";
import { applySelectionLedger } from "@/lib/shared/travel/solver-finalization";
import { bridgeAssemblyCandidate } from "@/lib/shared/travel/solver-assembly-bridge";
import * as assemblerMod from "@/lib/shared/travel/scheduled-draft-assembler";
import type { S4ResolutionResult, ChoiceSelection, AssemblyInputCandidate } from "@/lib/shared/travel/solver-finalization-types";
import type { CompositionDraft } from "@/lib/shared/travel/composition-types";
import type { SolverScheduleInput } from "@/lib/shared/travel/solver-schedule-types";
import type { EntityEvidence } from "@/lib/shared/travel/entity-retrieval-types";
import type { TravelPlanScope } from "@/lib/shared/travel/core-types";

afterEach(() => vi.restoreAllMocks());

// ── fixtures ────────────────────────────────────────────────────────────────
const ev = (over: Partial<EntityEvidence> & { placeRefId: string; category: EntityEvidence["category"] }): EntityEvidence => ({ facts: [], ...over });
const place = (id: string) => normalizeManualEntityEvidence(ev({ placeRefId: id, category: "place", facts: [{ kind: "priceBand", lo: 1000, hi: 2000, currency: "JPY", provenance: "editorial" }] }));
const single: TravelPlanScope = { mode: "travel", window: { kind: "single_day", date: "2026-07-01" } };
const draftOf = (ids: string[], over = {}): CompositionDraft => {
  const r = buildCompositionDraft({ candidateId: "c:relaxed", entities: ids.map(place), bindings: ids.map((id) => ({ placeRefId: id })), ...over });
  if (r.outcome !== "draft") throw new Error("expected draft");
  return r;
};
const baseOf = (d: CompositionDraft, over: Partial<SolverScheduleInput> = {}): SolverScheduleInput => ({ draft: d, scope: single, nodeDurations: Object.fromEntries(d.candidateNodes.map((n) => [n.nodeId, 60])), edgeDurations: {}, ...over });
const timeSel = (ref: string, startMin: number): ChoiceSelection => ({ selectionId: `t:${ref}`, kind: "time_window_choice", ref, selected: { mode: "time", startMin }, origin: "user_explicit" });

/** 完全解決 candidate（a@540, b@720 → assembly_input_candidate） */
function validCandidate(): AssemblyInputCandidate {
  const d = draftOf(["a", "b"]);
  const [a, b] = d.candidateNodes.map((n) => n.nodeId);
  const base = baseOf(d);
  const r = applySelectionLedger({ base, sequencing: computeSequencingFeasibility(base), ledger: [timeSel(a, 540), timeSel(b, 720)] });
  if (r.outcome !== "assembly_input_candidate") throw new Error(`expected candidate, got ${r.outcome}`);
  return r;
}
const resolve4 = (over: Partial<{ ledger: ChoiceSelection[]; base: SolverScheduleInput }>, d: CompositionDraft): S4ResolutionResult => {
  const base = over.base ?? baseOf(d);
  return applySelectionLedger({ base, sequencing: computeSequencingFeasibility(base), ledger: over.ledger ?? [] });
};

// ── 1. valid → server-only scheduled_draft envelope ──────────────────────────
describe("1. valid candidate → bridge draft", () => {
  it("assembly_input_candidate → server-only scheduled_draft envelope（authoritative:false/draft:true 保持）", () => {
    const r = bridgeAssemblyCandidate(validCandidate());
    expect(r.outcome).toBe("scheduled_draft");
    if (r.outcome === "scheduled_draft") {
      expect(r.serverOnly).toBe(true);
      expect(r.draft.outcome).toBe("scheduled_draft");
      expect(r.draft.authoritative).toBe(false);
      expect(r.draft.draft).toBe(true);
      // TravelCandidate/candidates/executionAuthority/booking を含まない
      const json = JSON.stringify(r);
      for (const f of ["TravelCandidate", "candidates", "executionAuthority", "booking", "tradeoff"]) expect(json).not.toContain(f);
    }
  });
});

// ── 2. 非 candidate → no_draft(non_candidate_input) ───────────────────────────
describe("2. 非 candidate input", () => {
  it("unresolved → no_draft(non_candidate_input)", () => {
    const d = draftOf(["a"]);
    const r = bridgeAssemblyCandidate(resolve4({}, d));
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("non_candidate_input");
  });
  it("selection_rejected(stale) → no_draft(non_candidate_input)", () => {
    const d = draftOf(["a"]);
    const a = d.candidateNodes[0].nodeId;
    const sel: ChoiceSelection = { selectionId: "s", kind: "time_window_choice", ref: a, selected: { mode: "time", startMin: 0 }, origin: "accept_default", acceptedDefaultIdentity: "STALE" };
    const r = bridgeAssemblyCandidate(resolve4({ ledger: [sel] }, d));
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("non_candidate_input");
  });
  it("needs_input(duration 欠) → no_draft(non_candidate_input)", () => {
    const d = draftOf(["a"]);
    const r = bridgeAssemblyCandidate(resolve4({ base: baseOf(d, { nodeDurations: {} }) }, d));
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("non_candidate_input");
  });
  it("infeasible(同窓 overlap) → no_draft(non_candidate_input)", () => {
    const d = draftOf(["a", "b"]);
    const [a, b] = d.candidateNodes.map((n) => n.nodeId);
    const base = baseOf(d, { nodeDurations: { [a]: 120, [b]: 120 }, lockBounds: [
      { nodeId: a, kind: "timed_entry_lock", windowStartMin: 600, windowEndMin: 600 },
      { nodeId: b, kind: "timed_entry_lock", windowStartMin: 600, windowEndMin: 600 },
    ] });
    const r = bridgeAssemblyCandidate(resolve4({ base }, d));
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("non_candidate_input");
  });
});

// ── 3. forged invariant → not_server_only ────────────────────────────────────
describe("3. forged candidate → not_server_only", () => {
  it("serverOnly false → no_draft(not_server_only)", () => {
    const r = bridgeAssemblyCandidate({ ...validCandidate(), serverOnly: false } as unknown as S4ResolutionResult);
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("not_server_only");
  });
  it("authoritative true → no_draft(not_server_only)", () => {
    const r = bridgeAssemblyCandidate({ ...validCandidate(), authoritative: true } as unknown as S4ResolutionResult);
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("not_server_only");
  });
  it("draft false → no_draft(not_server_only)", () => {
    const r = bridgeAssemblyCandidate({ ...validCandidate(), draft: false } as unknown as S4ResolutionResult);
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("not_server_only");
  });
});

// ── 4. readiness 失敗 / assembler 拒否 ────────────────────────────────────────
describe("4. readiness / assembler gate", () => {
  it("assemblyInput 破損(interval 欠) → no_draft(not_assembly_ready)", () => {
    const c = validCandidate();
    const broken = { ...c, assemblyInput: { ...c.assemblyInput, nodeIntervals: {} } } as unknown as S4ResolutionResult;
    const r = bridgeAssemblyCandidate(broken);
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("not_assembly_ready");
  });
  it("assembler が scheduled_draft を返さない → no_draft(assembler_rejected)（defensive）", () => {
    vi.spyOn(assemblerMod, "assembleScheduledDraft").mockReturnValue({ outcome: "not_ready", gaps: [], diagnostics: [] });
    const r = bridgeAssemblyCandidate(validCandidate());
    expect(r.outcome).toBe("no_draft");
    if (r.outcome === "no_draft") expect(r.reason).toBe("assembler_rejected");
  });
});

// ── 5. assembler は valid 時のみ 1 回呼ぶ ──────────────────────────────────────
describe("5. assembler 呼出制御", () => {
  it("invalid 入力では assembler を呼ばない", () => {
    const spy = vi.spyOn(assemblerMod, "assembleScheduledDraft");
    const d = draftOf(["a"]);
    bridgeAssemblyCandidate(resolve4({}, d)); // unresolved
    bridgeAssemblyCandidate({ ...validCandidate(), serverOnly: false } as unknown as S4ResolutionResult); // forged
    expect(spy).not.toHaveBeenCalled();
  });
  it("valid 候補で assembler を 1 回だけ呼ぶ", () => {
    const spy = vi.spyOn(assemblerMod, "assembleScheduledDraft");
    const r = bridgeAssemblyCandidate(validCandidate());
    expect(r.outcome).toBe("scheduled_draft");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── 6. 境界 + import 純度（source-contract）───────────────────────────────────
describe("6. 境界 + import 純度", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const read = () => strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/solver-assembly-bridge.ts"), "utf8"));
  it("solve/reorder/repair/engine/evaluateFit/TravelCandidate を含まない", () => {
    const src = read();
    for (const f of ["runTravelPlanEngine", "evaluateFit", "TravelCandidate", "applySelectionLedger", "computeSequencingFeasibility", "computeTemporalFeasibility"]) expect(src).not.toContain(f);
  });
  it("assembler/readiness のみ呼ぶ（candidates 挿入なし）", () => {
    const src = read();
    expect(src).toContain("assembleScheduledDraft");
    expect(src).toContain("detectAssemblyReadiness");
    expect(src).not.toMatch(/candidates\s*[.[]/);
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
