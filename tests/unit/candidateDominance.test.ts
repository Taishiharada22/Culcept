/**
 * B2-C — Candidate Dominance tests
 *
 * 設計正本: docs/t11-travel-candidate-display-closeout-bundle2-design.md（PART2 §2.10）
 *
 * 主眼:
 *   - Pareto 半順序: 全軸 no worse + 1 軸 strict で支配・同値は非支配・0→空・1→frontier。
 *   - 軸方向: cost/distance/fatigue 低い方良い・experienceVariety 高い方良い。
 *   - reorder しない・scalar/rank/totalOrder を作らない・collection を mutate しない・ranked 反転なし。
 *   - private(forParticipant)/raw FitResult を読まない・CoAlter Pareto/decide/compareProposals 非 import。
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { computeCandidateDominance } from "@/lib/shared/travel/candidate-dominance";
import type { CandidateCollectionDraft } from "@/lib/shared/travel/candidate-collection-draft-types";
import type { TravelCandidate, TradeoffProfile } from "@/lib/shared/travel/core-types";

const PRIVATE_TEXT = "PRIVATE_VIEWER_秘密";
const cand = (id: string, t: Partial<TradeoffProfile>): TravelCandidate => ({
  candidateId: id,
  title: `t:${id}`,
  tags: ["x"],
  itinerary: { days: [] },
  tradeoff: { cost: 100, distance: 10, fatigue: 2, experienceVariety: 3, ...t },
  constraints: [],
  rationale: { shared: "s", forParticipant: { p1: PRIVATE_TEXT } },
  uncertainty: "medium",
});
const draftOf = (cands: TravelCandidate[]): CandidateCollectionDraft => ({
  outcome: "candidate_collection_draft",
  serverOnly: true,
  authoritative: false,
  ranked: false,
  candidates: cands,
});

// ── 1. 基本（0 / 1 / 支配 / 同値）─────────────────────────────────────────────
describe("1. Pareto 基本", () => {
  it("0 候補 → 空 overlay", () => {
    const o = computeCandidateDominance(draftOf([]));
    expect(o.outcome).toBe("candidate_dominance_overlay");
    expect(o.serverOnly).toBe(true);
    expect(o.authoritative).toBe(false);
    expect(o.advisory).toBe(true);
    expect(o.entries).toEqual([]);
    expect(o.paretoOptimalIds).toEqual([]);
  });
  it("1 候補 → frontier（paretoOptimal・dominatedBy 空）", () => {
    const o = computeCandidateDominance(draftOf([cand("a", {})]));
    expect(o.entries).toHaveLength(1);
    expect(o.entries[0].paretoOptimal).toBe(true);
    expect(o.entries[0].dominatedBy).toEqual([]);
    expect(o.paretoOptimalIds).toEqual(["a"]);
  });
  it("A が全軸 no worse + 1 軸 strict で B を支配", () => {
    // A: cost 安い・distance 同・fatigue 低い・variety 高い → A dominates B
    const A = cand("A", { cost: 100, distance: 10, fatigue: 1, experienceVariety: 5 });
    const B = cand("B", { cost: 200, distance: 10, fatigue: 2, experienceVariety: 3 });
    const o = computeCandidateDominance(draftOf([A, B]));
    const eA = o.entries.find((e) => e.candidateId === "A")!;
    const eB = o.entries.find((e) => e.candidateId === "B")!;
    expect(eA.paretoOptimal).toBe(true);
    expect(eA.dominatedBy).toEqual([]);
    expect(eB.paretoOptimal).toBe(false);
    expect(eB.dominatedBy).toEqual(["A"]);
    expect(o.paretoOptimalIds).toEqual(["A"]);
  });
  it("同値の候補は互いに非支配（両方 frontier）", () => {
    const o = computeCandidateDominance(draftOf([cand("a", {}), cand("b", {})]));
    expect(o.entries.every((e) => e.paretoOptimal)).toBe(true);
    expect(o.entries.every((e) => e.dominatedBy.length === 0)).toBe(true);
    expect(o.paretoOptimalIds.sort()).toEqual(["a", "b"]);
  });
  it("trade-off（一長一短）は互いに非支配", () => {
    const A = cand("A", { cost: 100, fatigue: 5 }); // 安いが疲れる
    const B = cand("B", { cost: 300, fatigue: 1 }); // 高いが楽
    const o = computeCandidateDominance(draftOf([A, B]));
    expect(o.paretoOptimalIds.sort()).toEqual(["A", "B"]);
  });
});

// ── 2. 軸方向 ─────────────────────────────────────────────────────────────────
describe("2. 軸方向（cost/distance/fatigue↓・experienceVariety↑）", () => {
  const dominatesOneAxis = (better: Partial<TradeoffProfile>) => {
    const A = cand("A", better);
    const B = cand("B", {}); // baseline
    const o = computeCandidateDominance(draftOf([A, B]));
    return o.entries.find((e) => e.candidateId === "B")!.dominatedBy;
  };
  it("cost 低い方が支配する", () => expect(dominatesOneAxis({ cost: 50 })).toEqual(["A"]));
  it("distance 低い方が支配する", () => expect(dominatesOneAxis({ distance: 5 })).toEqual(["A"]));
  it("fatigue 低い方が支配する", () => expect(dominatesOneAxis({ fatigue: 1 })).toEqual(["A"]));
  it("experienceVariety 高い方が支配する", () => expect(dominatesOneAxis({ experienceVariety: 9 })).toEqual(["A"]));
  it("cost 高いだけでは支配しない（逆方向）", () => expect(dominatesOneAxis({ cost: 999 })).toEqual([]));
  it("dominated 説明 axisDeltas は better を含まない（worse/equal のみ）", () => {
    const A = cand("A", { cost: 50, fatigue: 1 });
    const B = cand("B", {});
    const o = computeCandidateDominance(draftOf([A, B]));
    const eB = o.entries.find((e) => e.candidateId === "B")!;
    const delta = eB.axisDeltas?.find((d) => d.versusCandidateId === "A")!;
    expect(delta).toBeDefined();
    expect(Object.values(delta.axes)).not.toContain("better");
  });
});

// ── 3. frontier の正しさ（3 件）──────────────────────────────────────────────
describe("3. frontier", () => {
  it("paretoOptimalIds は非支配集合のみ・dominatedBy は支配元 id", () => {
    const A = cand("A", { cost: 100, fatigue: 1, experienceVariety: 5 }); // frontier
    const B = cand("B", { cost: 300, fatigue: 1, experienceVariety: 9 }); // 高いが variety 最大 → frontier
    const C = cand("C", { cost: 400, fatigue: 5, experienceVariety: 2 }); // A に支配される
    const o = computeCandidateDominance(draftOf([A, B, C]));
    expect(o.paretoOptimalIds.sort()).toEqual(["A", "B"]);
    expect(o.entries.find((e) => e.candidateId === "C")!.dominatedBy).toContain("A");
  });
});

// ── 4. 不変条件（reorder/mutate/scalar/private なし）──────────────────────────
describe("4. 不変条件", () => {
  it("entries は入力順を保持（reorder しない）", () => {
    const o = computeCandidateDominance(draftOf([cand("z", {}), cand("y", {}), cand("x", {})]));
    expect(o.entries.map((e) => e.candidateId)).toEqual(["z", "y", "x"]);
  });
  it("入力 collection を mutate しない・ranked 反転なし", () => {
    const d = draftOf([cand("a", { cost: 50 }), cand("b", { cost: 200 })]);
    const snapshotIds = d.candidates.map((c) => c.candidateId);
    computeCandidateDominance(d);
    expect(d.ranked).toBe(false);
    expect(d.candidates.map((c) => c.candidateId)).toEqual(snapshotIds);
    expect(d.candidates).toHaveLength(2);
  });
  it("overlay に scalar score / rank 番号 / totalOrder / 権限 / acceptance を持たない", () => {
    const json = JSON.stringify(computeCandidateDominance(draftOf([cand("a", { cost: 50 }), cand("b", { cost: 200 })])));
    for (const f of ["score", "\"rank\"", "totalOrder", "executionAuthority", "booking", "calendar", "accepted", "finalized", "planState"]) {
      expect(json).not.toContain(f);
    }
  });
  it("private(forParticipant) / raw FitResult を出力に含めない", () => {
    const json = JSON.stringify(computeCandidateDominance(draftOf([cand("a", { cost: 50 }), cand("b", {})])));
    expect(json).not.toContain(PRIVATE_TEXT);
    expect(json).not.toContain("forParticipant");
    expect(json).not.toContain("fitLabel");
  });
});

// ── 5. source-contract ───────────────────────────────────────────────────────
describe("5. helper source-contract", () => {
  const strip = (raw: string) => raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  const SRC = strip(readFileSync(resolve(process.cwd(), "lib/shared/travel/candidate-dominance.ts"), "utf8"));

  it("CoAlter Pareto / compareProposals / decide / engine / evaluateFit / display を呼ばない", () => {
    for (const f of ["compareTravelCandidatesPareto", "compareProposals", "decide(", "runTravelPlanEngine", "evaluateFit", "projectDisplay"]) {
      expect(SRC).not.toContain(f);
    }
    expect(SRC).not.toMatch(/coalter/i);
  });
  it("fitSummary / FitResult / private rationale / forced_by_private_constraint を読まない", () => {
    for (const f of ["fitSummary", "FitResult", "forParticipant", "forced_by_private_constraint"]) {
      expect(SRC).not.toContain(f);
    }
  });
  it("itinerary/route/cost から tradeoff を導出しない（tradeoff のみ参照）", () => {
    expect(SRC).not.toMatch(/\.itinerary/);
    expect(SRC).not.toContain("projectDisplayDays");
  });
  it("fetch/API/DB/Supabase/外部/M2/app/UI/react を import/呼出しない", () => {
    expect(SRC).not.toMatch(/\bfetch\(/);
    expect(SRC).not.toMatch(/supabase/i);
    expect(SRC).not.toMatch(/\/api\//);
    expect(SRC).not.toMatch(/googleapis|maps/i);
    expect(SRC).not.toMatch(/from ["']next/);
    expect(SRC).not.toMatch(/from ["']react/);
    expect(SRC).not.toMatch(/from ["'][^"']*(components|app\/|\/m2|personalization)/i);
  });
});
