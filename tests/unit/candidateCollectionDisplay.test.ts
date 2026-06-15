/**
 * D3 — Candidate Collection Display Projection tests
 *
 * 設計正本: docs/t11-candidate-collection-display-preview-preflight.md（§10）
 *
 * 主眼:
 *   - CandidateCollectionDraft → DisplayCandidateCollection（status candidate_draft_collection）。
 *   - shared rationale は出る・forParticipant(private) は出ない。
 *   - serverOnly/authoritative/ranked/dominance/pareto/rank/accepted/authority/FitResult を出さない。
 *   - 入力順保持（ranking しない）・itinerary は DisplayDay 再利用（HH:MM・placeRefId 非露出）。
 *   - projection 純度（engine/converter/insertion/DB 非呼出・app/UI import なし）。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { projectDisplayCandidateCollection } from "@/lib/shared/travel/candidate-collection-display";
import type { CandidateCollectionDraft } from "@/lib/shared/travel/candidate-collection-draft-types";
import type { TravelCandidate } from "@/lib/shared/travel/core-types";

const yen = (lo: number, hi: number) => ({ lo, hi, confidence: 0.6, currency: "JPY" as const });
const PRIVATE_TEXT = "PRIVATE_VIEWER_ONLY_秘密の理由";

const cand = (id: string, title: string): TravelCandidate => ({
  candidateId: id,
  title,
  tags: ["relax", "onsen"],
  itinerary: {
    days: [
      {
        dayIndex: 0,
        date: "2026-07-01",
        nodes: [
          { nodeId: "n:onsen", startMin: 600, endMin: 690, place: { placeRefId: "onsen", externalId: "place_x", label: "渓谷の露天温泉" }, activityKind: "onsen", budgetBand: yen(1500, 2500), fatigueLoad: 2, nodeConfidence: "anchor" },
        ],
        edges: [],
      },
    ],
  },
  tradeoff: { cost: 4000, distance: 12, fatigue: 2, experienceVariety: 1 },
  constraints: [],
  rationale: { shared: "静かな環境で疲れを抜く一日", forParticipant: { p1: PRIVATE_TEXT } },
  uncertainty: "medium",
  reversal: { cancellable: true },
});

const draft = (): CandidateCollectionDraft => ({
  outcome: "candidate_collection_draft",
  serverOnly: true,
  authoritative: false,
  ranked: false,
  candidates: [cand("c1", "温泉でととのう"), cand("c2", "渓谷さんぽ")],
});

describe("1. projection 基本", () => {
  it("status candidate_draft_collection・cards を入力順で投影", () => {
    const d = projectDisplayCandidateCollection(draft());
    expect(d.status).toBe("candidate_draft_collection");
    expect(d.cards.map((c) => c.candidateId)).toEqual(["c1", "c2"]); // 入力順保持（ranking でない）
    expect(d.cards[0].title).toBe("温泉でととのう");
    expect(d.cards[0].tags).toEqual(["relax", "onsen"]);
  });
  it("shared rationale は出る・tradeoff/uncertainty/reversal の shared-safe 要約も出る", () => {
    const d = projectDisplayCandidateCollection(draft());
    expect(d.cards[0].rationaleShared).toBe("静かな環境で疲れを抜く一日");
    expect(d.cards[0].uncertaintyLabel).toBe("不確実性: 中");
    expect(d.cards[0].tradeoffSummary?.cost).toBe(4000);
    expect(d.cards[0].reversalNote).toContain("変更・キャンセル可");
  });
  it("itinerary は DisplayDay 再利用（HH:MM・place label・placeRefId 非露出・externalId inert）", () => {
    const d = projectDisplayCandidateCollection(draft());
    const node = d.cards[0].days[0].nodes[0];
    expect(node.startLabel).toBe("10:00");
    expect(node.place.label).toBe("渓谷の露天温泉");
    expect(node.place).not.toHaveProperty("placeRefId");
    const json = JSON.stringify(d);
    expect(json).not.toContain("placeRefId");
  });
});

describe("2. 非露出（private / serverOnly / ranking / authority / FitResult）", () => {
  it("forParticipant(private) を出さない", () => {
    const json = JSON.stringify(projectDisplayCandidateCollection(draft()));
    expect(json).not.toContain(PRIVATE_TEXT);
    expect(json).not.toContain("forParticipant");
  });
  it("serverOnly/authoritative/ranked/dominance/pareto/rank/accepted/authority/FitResult を出さない", () => {
    const json = JSON.stringify(projectDisplayCandidateCollection(draft()));
    for (const f of ["serverOnly", "authoritative", "\"ranked\"", "dominatedBy", "paretoOptimal", "\"rank\"", "accepted", "finalized", "executionAuthority", "booking", "calendar", "fitLabel", "hardBlocks"]) {
      expect(json).not.toContain(f);
    }
  });
  it("空 collection → cards 空（fail-safe）", () => {
    const empty: CandidateCollectionDraft = { outcome: "candidate_collection_draft", serverOnly: true, authoritative: false, ranked: false, candidates: [] };
    expect(projectDisplayCandidateCollection(empty).cards).toEqual([]);
  });
});

describe("3. source-contract（projection 純度）", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/candidate-collection-display.ts"), "utf8"));
  const TYPES = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/candidate-collection-display-types.ts"), "utf8"));

  it("engine/evaluateFit/converter/insertion helper を呼ばない・sort しない", () => {
    for (const f of ["runTravelPlanEngine", "evaluateFit", "convertScheduledDraftEnvelopeToTravelCandidate", "addTravelCandidateToCollectionDraft", ".sort(", "dominatedBy", "paretoOptimal"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("forParticipant を helper が参照しない（shared のみ）", () => {
    expect(SRC).not.toContain("forParticipant");
  });
  it("fetch/API/DB/Supabase/外部/M2/app/UI/react を import/呼出しない", () => {
    for (const src of [SRC, TYPES]) {
      expect(src).not.toMatch(/\bfetch\(/);
      expect(src).not.toMatch(/supabase/i);
      expect(src).not.toMatch(/\/api\//);
      expect(src).not.toMatch(/googleapis|maps/i);
      expect(src).not.toMatch(/from ["']next/);
      expect(src).not.toMatch(/from ["']react/);
      expect(src).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
    }
  });
});
