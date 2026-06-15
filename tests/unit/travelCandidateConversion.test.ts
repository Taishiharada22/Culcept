/**
 * C3 — TravelCandidate Conversion helper tests
 *
 * 設計正本: docs/t11-candidate-insertion-preflight.md（§11 C3・§12）
 *
 * 主眼:
 *   - 完全明示入力 → core-types TravelCandidate（構築のみ・未挿入）。
 *   - rich field は明示由来（draft から生成しない）・空/欠落は fail-closed reject。
 *   - factual itinerary は scheduled draft 由来のみ。
 *   - target は **core-types** TravelCandidate（CoAlter 側でない）。
 *   - engine/evaluateFit/assembler/projection 非呼出・insert/ranking なし。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { convertScheduledDraftEnvelopeToTravelCandidate } from "@/lib/shared/travel/travel-candidate-conversion";
import type {
  TravelCandidateConversionInput,
  TravelCandidateConverted,
} from "@/lib/shared/travel/travel-candidate-conversion-types";
import type { ScheduledTravelItineraryDraft } from "@/lib/shared/travel/assembly-types";
import type { TravelCandidate, TravelCorePlan } from "@/lib/shared/travel/core-types";
import type { TravelCandidate as CoAlterTravelCandidate } from "@/lib/coalter/travel/types";

const yen = (lo: number, hi: number) => ({ lo, hi, confidence: 0.6, currency: "JPY" as const });
const DRAFT: ScheduledTravelItineraryDraft = {
  outcome: "scheduled_draft",
  authoritative: false,
  draft: true,
  candidateId: "candidate:demo",
  itinerary: {
    days: [
      {
        dayIndex: 0,
        date: "2026-07-01",
        nodes: [
          { nodeId: "n:onsen", startMin: 600, endMin: 690, place: { placeRefId: "onsen", label: "渓谷の露天温泉" }, activityKind: "onsen", budgetBand: yen(1500, 2500), fatigueLoad: 2, nodeConfidence: "anchor" },
        ],
        edges: [],
      },
    ],
  },
  provenance: { nodeBudget: {}, edgeTransport: {}, edgeCost: {}, dayIndexSource: "single_day_zero" },
};

const baseInput = (): TravelCandidateConversionInput => ({
  source: { outcome: "scheduled_draft_candidate_envelope", serverOnly: true, authoritative: false, draft: true, insertable: false, candidateId: "candidate:demo", scheduledDraft: DRAFT },
  explicitInterpretation: {
    title: "温泉でととのう休日",
    tags: ["relax", "onsen"],
    rationale: { shared: "静かな環境で疲れを抜く一日", forParticipant: { p1: "あなたの回復志向に合う" } },
    uncertainty: "medium",
    tradeoff: { cost: 4000, distance: 12, fatigue: 2, experienceVariety: 1 },
  },
  explicitCandidateMetadata: { candidateId: "candidate:demo", proposalId: "proposal:x" },
  derivedAllowed: { itinerarySource: "scheduled_draft", constraints: [] },
});

// ── 1. 正常系: 完全明示 → core-types TravelCandidate ───────────────────────────
describe("1. 完全明示入力 → TravelCandidate（構築のみ・未挿入）", () => {
  it("converted を返し、core-types TravelCandidate を内包（全 field 明示/factual 由来）", () => {
    const r = convertScheduledDraftEnvelopeToTravelCandidate(baseInput());
    expect(r.outcome).toBe("converted");
    if (r.outcome !== "converted") throw new Error("unreachable");
    expect(r.serverOnly).toBe(true);
    expect(r.insertable).toBe(false);
    expect(r.targetType).toBe("core_types_travel_candidate");
    const c = r.candidate;
    expect(c.candidateId).toBe("candidate:demo");
    expect(c.title).toBe("温泉でととのう休日");
    expect(c.tags).toEqual(["relax", "onsen"]);
    expect(c.uncertainty).toBe("medium");
    expect(c.tradeoff.cost).toBe(4000);
    expect(c.rationale.shared).toBe("静かな環境で疲れを抜く一日");
  });
  it("itinerary は scheduled draft の factual 構造をそのまま採用（同一参照）", () => {
    const r = convertScheduledDraftEnvelopeToTravelCandidate(baseInput());
    if (r.outcome !== "converted") throw new Error("unreachable");
    expect(r.candidate.itinerary).toBe(DRAFT.itinerary);
  });
  it("title/tags/rationale は draft から生成しない（明示値であり place label ではない）", () => {
    const r = convertScheduledDraftEnvelopeToTravelCandidate(baseInput());
    if (r.outcome !== "converted") throw new Error("unreachable");
    // draft の place label "渓谷の露天温泉" は title/tags/rationale に流入しない
    expect(r.candidate.title).not.toContain("渓谷の露天温泉");
    expect(r.candidate.tags).not.toContain("渓谷の露天温泉");
    expect(r.candidate.rationale.shared).not.toContain("渓谷の露天温泉");
  });
  it("rationale は core-types 形（shared/forParticipant）＝ CoAlter 形(perUserA/synthesis)でない", () => {
    const r = convertScheduledDraftEnvelopeToTravelCandidate(baseInput());
    if (r.outcome !== "converted") throw new Error("unreachable");
    expect(r.candidate.rationale).toHaveProperty("shared");
    expect(r.candidate.rationale).toHaveProperty("forParticipant");
    expect(r.candidate.rationale).not.toHaveProperty("perUserA");
    expect(r.candidate.rationale).not.toHaveProperty("synthesis");
  });
});

// ── 2. fail-closed reject ─────────────────────────────────────────────────────
describe("2. 欠落/空 placeholder は fail-closed reject", () => {
  const rejectReason = (mut: (i: TravelCandidateConversionInput) => void) => {
    const i = baseInput(); mut(i);
    const r = convertScheduledDraftEnvelopeToTravelCandidate(i);
    if (r.outcome !== "conversion_rejected") throw new Error("expected reject");
    return r.diagnostic;
  };
  it("explicitInterpretation 欠落 → missing_explicit_interpretation", () => {
    // @ts-expect-error 意図的欠落（runtime fail-closed を検証）
    expect(rejectReason((i) => { delete i.explicitInterpretation; }).reason).toBe("missing_explicit_interpretation");
  });
  it("空 title → reject（missingFields に title）", () => {
    const d = rejectReason((i) => { i.explicitInterpretation.title = "   "; });
    expect(d.reason).toBe("missing_explicit_interpretation");
    expect(d.missingFields).toContain("title");
  });
  it("空 tags → reject（missingFields に tags）", () => {
    const d = rejectReason((i) => { i.explicitInterpretation.tags = []; });
    expect(d.missingFields).toContain("tags");
  });
  it("空 rationale → reject（missingFields に rationale）", () => {
    const d = rejectReason((i) => { i.explicitInterpretation.rationale = { shared: "", forParticipant: {} }; });
    expect(d.missingFields).toContain("rationale");
  });
  it("explicitCandidateMetadata 欠落 / 空 candidateId → missing_explicit_metadata", () => {
    // @ts-expect-error 意図的欠落
    expect(rejectReason((i) => { delete i.explicitCandidateMetadata; }).reason).toBe("missing_explicit_metadata");
    expect(rejectReason((i) => { i.explicitCandidateMetadata.candidateId = ""; }).reason).toBe("missing_explicit_metadata");
  });
  it("derivedAllowed の itinerary consent 欠如 → fabrication_not_allowed", () => {
    // @ts-expect-error 不正 consent 値（factual を勝手に作らせない）
    expect(rejectReason((i) => { i.derivedAllowed.itinerarySource = "fabricated"; }).reason).toBe("fabrication_not_allowed");
  });
});

// ── 3. 型 firewall（@ts-expect-error・実行しない）─────────────────────────────
export function _conversionHelperTypeFirewall(plan: TravelCorePlan, conv: TravelCandidateConverted) {
  // 正常: 構築された candidate は core-types TravelCandidate（target 正しい）
  const okTarget: TravelCandidate = conv.candidate;
  // @ts-expect-error result 自体は TravelCandidate でない
  const notCandidate: TravelCandidate = conv;
  // @ts-expect-error result を candidates[] に push 不可（insert は別 adapter）
  plan.candidates.push(conv);
  // @ts-expect-error 構築された candidate は CoAlter TravelCandidate ではない（target は core-types のみ）
  const notCoAlter: CoAlterTravelCandidate = conv.candidate;
  return [okTarget, notCandidate, notCoAlter, plan];
}

// ── 4. source-contract（helper 純度・target・非呼出）──────────────────────────
describe("4. helper source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/travel-candidate-conversion.ts"), "utf8"));

  it("target は core-types TravelCandidate（CoAlter 側を import しない）", () => {
    expect(SRC).toMatch(/from ["']\.\/core-types["']/);
    expect(SRC).not.toMatch(/coalter/i);
  });
  it("engine/evaluateFit/assembler/display projection を呼ばない", () => {
    for (const f of ["runTravelPlanEngine", "evaluateFit", "assembleScheduledDraft", "projectDisplayScheduledItinerary", "DisplayScheduledItinerary", "FitResult"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("insert / ranking / acceptance / authority をしない", () => {
    // 注: `.push(` 単体は diagnostic 用 `missing.push(...)` に誤反応するため、insertion は `.candidates` で判定。
    for (const f of [".candidates", "candidates.push", "dominatedBy", "paretoOptimal", "executionAuthority", "booking", "calendar", "accepted", "acceptance", "finalized"]) {
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
