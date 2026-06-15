/**
 * C4-C — Candidate Collection Draft tests
 *
 * 設計正本: docs/t11-candidate-insertion-adapter-design.md（§11 C4-C・§12）
 *
 * 主眼:
 *   - 完成 core-types TravelCandidate → CandidateCollectionDraft に追加（added_to_collection_draft）。
 *   - prev 非変更（immutable）・serverOnly/authoritative:false/ranked:false。
 *   - 重複/空 candidateId・禁止種別（envelope/conversion/display/CoAlter/FitResult）を fail-closed。
 *   - insertion order ≠ ranking・dominance/pareto/acceptance/authority フィールド不在。
 *   - 型 firewall: 禁止入力は型でも拒否・draft は TravelCorePlan / candidates[] に非代入。
 *   - helper 純度（converter/engine/display/ranking/DB 非呼出）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { addTravelCandidateToCollectionDraft } from "@/lib/shared/travel/candidate-collection-draft";
import type { CandidateCollectionDraft } from "@/lib/shared/travel/candidate-collection-draft-types";
import type { TravelCandidate, TravelCorePlan } from "@/lib/shared/travel/core-types";
import type { ScheduledDraftCandidateEnvelope } from "@/lib/shared/travel/travel-candidate-boundary-types";
import type { TravelCandidateConversionReady, TravelCandidateConversionRejected } from "@/lib/shared/travel/travel-candidate-conversion-types";
import type { DisplayScheduledItinerary } from "@/lib/shared/travel/scheduled-draft-display-types";
import type { FitResult } from "@/lib/shared/travel/fit-types";
import type { TravelCandidate as CoAlterTravelCandidate } from "@/lib/coalter/travel/types";

const cand = (id: string): TravelCandidate => ({
  candidateId: id,
  title: "温泉でととのう休日",
  tags: ["relax", "onsen"],
  itinerary: { days: [] },
  tradeoff: { cost: 4000, distance: 12, fatigue: 2, experienceVariety: 1 },
  constraints: [],
  rationale: { shared: "静かな環境で疲れを抜く", forParticipant: { p1: "回復志向に合う" } },
  uncertainty: "medium",
});

// ── 1. 正常系: 追加・immutable・marker ────────────────────────────────────────
describe("1. core-types TravelCandidate を CandidateCollectionDraft に追加", () => {
  it("null prev → added_to_collection_draft（serverOnly/authoritative:false/ranked:false）", () => {
    const r = addTravelCandidateToCollectionDraft(null, cand("c1"));
    expect(r.outcome).toBe("added_to_collection_draft");
    if (r.outcome !== "added_to_collection_draft") throw new Error("unreachable");
    expect(r.serverOnly).toBe(true);
    expect(r.collection.outcome).toBe("candidate_collection_draft");
    expect(r.collection.serverOnly).toBe(true);
    expect(r.collection.authoritative).toBe(false);
    expect(r.collection.ranked).toBe(false);
    expect(r.collection.candidates.map((c) => c.candidateId)).toEqual(["c1"]);
  });
  it("既存 prev に追加しても prev を mutate しない（immutable）", () => {
    const first = addTravelCandidateToCollectionDraft(null, cand("c1"));
    if (first.outcome !== "added_to_collection_draft") throw new Error("unreachable");
    const prev = first.collection;
    const second = addTravelCandidateToCollectionDraft(prev, cand("c2"));
    if (second.outcome !== "added_to_collection_draft") throw new Error("unreachable");
    expect(second.collection.candidates.map((c) => c.candidateId)).toEqual(["c1", "c2"]);
    // prev は不変
    expect(prev.candidates.map((c) => c.candidateId)).toEqual(["c1"]);
    expect(second.collection).not.toBe(prev);
  });
  it("insertion order は保管/表示順であって ranking でない（dominance/pareto/rank なし）", () => {
    const a = addTravelCandidateToCollectionDraft(null, cand("a"));
    if (a.outcome !== "added_to_collection_draft") throw new Error("unreachable");
    const b = addTravelCandidateToCollectionDraft(a.collection, cand("b"));
    if (b.outcome !== "added_to_collection_draft") throw new Error("unreachable");
    const json = JSON.stringify(b.collection);
    for (const f of ["dominatedBy", "paretoOptimal", "\"rank\"", "accepted", "acceptance", "finalized", "executionAuthority", "booking", "calendar", "planState"]) {
      expect(json).not.toContain(f);
    }
    expect(b.collection.ranked).toBe(false);
  });
});

// ── 2. fail-closed reject ─────────────────────────────────────────────────────
describe("2. 重複/空/禁止種別は fail-closed", () => {
  it("重複 candidateId → duplicate_candidate_id", () => {
    const a = addTravelCandidateToCollectionDraft(null, cand("dup"));
    if (a.outcome !== "added_to_collection_draft") throw new Error("unreachable");
    const r = addTravelCandidateToCollectionDraft(a.collection, cand("dup"));
    if (r.outcome !== "insertion_rejected") throw new Error("expected reject");
    expect(r.diagnostic.reason).toBe("duplicate_candidate_id");
    expect(r.diagnostic.candidateId).toBe("dup");
  });
  it("空 candidateId → empty_candidate_id", () => {
    const r = addTravelCandidateToCollectionDraft(null, cand("   "));
    if (r.outcome !== "insertion_rejected") throw new Error("expected reject");
    expect(r.diagnostic.reason).toBe("empty_candidate_id");
  });
  it("envelope（forbidden 種別）→ forbidden_input_kind（cast 越し runtime guard）", () => {
    const env = { outcome: "scheduled_draft_candidate_envelope", serverOnly: true, authoritative: false, draft: true, insertable: false, candidateId: "x", scheduledDraft: {} };
    const r = addTravelCandidateToCollectionDraft(null, env as unknown as TravelCandidate);
    if (r.outcome !== "insertion_rejected") throw new Error("expected reject");
    expect(r.diagnostic.reason).toBe("forbidden_input_kind");
  });
  it("DisplayScheduledItinerary（status:draft_proposal）→ forbidden_input_kind", () => {
    const disp = { status: "draft_proposal", candidateId: "x", days: [] };
    const r = addTravelCandidateToCollectionDraft(null, disp as unknown as TravelCandidate);
    if (r.outcome !== "insertion_rejected") throw new Error("expected reject");
    expect(r.diagnostic.reason).toBe("forbidden_input_kind");
  });
  it("CoAlter 形（perUserA・shared 無）→ not_core_types_candidate", () => {
    const coalter = { candidateId: "x", itinerary: {}, rationale: { perUserA: "a", perUserB: "b", synthesis: "s" }, paretoAxis: "cost", appliedConstraints: [] };
    const r = addTravelCandidateToCollectionDraft(null, coalter as unknown as TravelCandidate);
    if (r.outcome !== "insertion_rejected") throw new Error("expected reject");
    expect(r.diagnostic.reason).toBe("not_core_types_candidate");
  });
  it("raw FitResult 形 → not_core_types_candidate（title/tags/tradeoff 無）", () => {
    const fit = { authoritative: false, fitLabel: "good", placeRefId: "p", confidence: 0.5 };
    const r = addTravelCandidateToCollectionDraft(null, fit as unknown as TravelCandidate);
    if (r.outcome !== "insertion_rejected") throw new Error("expected reject");
    // authoritative:false は foreign marker でない（serverOnly でない）ので種別でなく shape で弾く
    expect(r.diagnostic.reason).toBe("not_core_types_candidate");
  });
});

// ── 3. 型 firewall（@ts-expect-error・実行しない）─────────────────────────────
export function _collectionTypeFirewall(
  plan: TravelCorePlan,
  draft: CandidateCollectionDraft,
  env: ScheduledDraftCandidateEnvelope,
  ready: TravelCandidateConversionReady,
  rejected: TravelCandidateConversionRejected,
  disp: DisplayScheduledItinerary,
  fr: FitResult,
  coalter: CoAlterTravelCandidate,
) {
  // @ts-expect-error envelope は candidate 引数にできない
  addTravelCandidateToCollectionDraft(null, env);
  // @ts-expect-error conversion_ready は candidate 引数にできない
  addTravelCandidateToCollectionDraft(null, ready);
  // @ts-expect-error conversion_rejected は candidate 引数にできない
  addTravelCandidateToCollectionDraft(null, rejected);
  // @ts-expect-error DisplayScheduledItinerary は candidate 引数にできない
  addTravelCandidateToCollectionDraft(null, disp);
  // @ts-expect-error CoAlter TravelCandidate は candidate 引数にできない
  addTravelCandidateToCollectionDraft(null, coalter);
  // @ts-expect-error raw FitResult は candidate 引数にできない
  addTravelCandidateToCollectionDraft(null, fr);
  // @ts-expect-error CandidateCollectionDraft は TravelCorePlan に代入不可
  const notPlan: TravelCorePlan = draft;
  // @ts-expect-error CandidateCollectionDraft を candidates[] として使えない
  const notArray: TravelCandidate[] = draft;
  // @ts-expect-error CandidateCollectionDraft を TravelCorePlan.candidates に直接代入不可
  plan.candidates = draft;
  return [notPlan, notArray, plan];
}

// ── 4. source-contract（helper 純度）──────────────────────────────────────────
describe("4. helper source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/candidate-collection-draft.ts"), "utf8"));

  it("TravelCorePlan を mutate/copy/insert しない・CoAlter を import しない", () => {
    expect(SRC).not.toContain("TravelCorePlan");
    expect(SRC).not.toMatch(/coalter/i);
  });
  it("converter/engine/evaluateFit/display projection/ranking を呼ばない", () => {
    for (const f of ["convertScheduledDraftEnvelopeToTravelCandidate", "runTravelPlanEngine", "evaluateFit", "projectDisplayScheduledItinerary", "assembleScheduledDraft", "dominatedBy", "paretoOptimal"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("acceptance/authority を作らない", () => {
    for (const f of ["accepted", "finalized", "executionAuthority", "booking", "calendar"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("fetch/API/DB/Supabase/外部/M2/app/UI を import/呼出しない", () => {
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/googleapis|maps/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
  });
});
