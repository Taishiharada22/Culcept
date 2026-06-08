import { describe, it, expect } from "vitest";
import {
  summarizePlaceAffinityShadow,
  assessPlaceAffinitySafety,
  DEFAULT_PLACE_AFFINITY_SAFETY_CONFIG,
  DEFAULT_PLACE_AFFINITY_ASSESS_CONFIG,
  PLACE_AFFINITY_ROLLBACK_CONDITIONS,
  type PlaceAffinitySafetyEntry,
} from "@/lib/plan/compose/placeAffinitySafetyJournal";
import type { ShadowRankingResult } from "@/lib/plan/compose/placeAffinityShadowRanking";
import type { PlaceAffinityReadiness } from "@/lib/plan/compose/placeAffinityReadiness";

function shadow(over: Partial<ShadowRankingResult> = {}): ShadowRankingResult {
  return { generalOrder: ["a", "b"], combinedOrder: ["a", "b"], orderChanged: false, changedPositionCount: 0, maxRankShift: 0, personalAppliedCount: 0, ...over };
}
function p2(status: "ready" | "not_enough" = "ready", n = 3): PlaceAffinityReadiness {
  return { status, totalVisits: 20, distinctPlaces: n, profiles: Array.from({ length: n }, (_, i) => ({ placeKey: `k${i}`, visitCount: 5, strength: "frequent" as const })) };
}
function entry(over: Partial<PlaceAffinitySafetyEntry> = {}): PlaceAffinitySafetyEntry {
  return { p2Ready: true, profileCount: 3, candidateCount: 2, orderChanged: false, maxRankShift: 0, personalAppliedCount: 0, excessiveShift: false, anyConcern: false, ...over };
}

describe("summarizePlaceAffinityShadow — 派生サマリー", () => {
  it("派生 counts/boolean のみ・excessiveShift は maxRankShift>許容(2)", () => {
    const ok = summarizePlaceAffinityShadow(shadow({ maxRankShift: 1, personalAppliedCount: 1, orderChanged: true }), p2());
    expect(ok.excessiveShift).toBe(false);
    expect(ok.anyConcern).toBe(false);
    expect(ok.profileCount).toBe(3);
  });
  it("★maxRankShift>2 → excessiveShift=true・anyConcern", () => {
    const bad = summarizePlaceAffinityShadow(shadow({ maxRankShift: 3 }), p2());
    expect(bad.excessiveShift).toBe(true);
    expect(bad.anyConcern).toBe(true);
  });
  it("★raw（place名/座標/score）を含まない", () => {
    const joined = JSON.stringify(summarizePlaceAffinityShadow(shadow(), p2()));
    expect(joined).not.toMatch(/lat|lng|coord|address|score|placeKey|name/);
  });
  it("config 既定 maxAllowedRankShift=2 / minEntries=10", () => {
    expect(DEFAULT_PLACE_AFFINITY_SAFETY_CONFIG.maxAllowedRankShift).toBe(2);
    expect(DEFAULT_PLACE_AFFINITY_ASSESS_CONFIG.minEntries).toBe(10);
  });
});

describe("assessPlaceAffinitySafety — 評価", () => {
  it("★< minEntries(10) → insufficient", () => {
    expect(assessPlaceAffinitySafety(Array.from({ length: 5 }, () => entry())).status).toBe("insufficient");
  });
  it("★≥minEntries ∧ 懸念ゼロ → stable_safe", () => {
    const r = assessPlaceAffinitySafety(Array.from({ length: 12 }, () => entry()));
    expect(r.status).toBe("stable_safe");
    expect(r.concernCount).toBe(0);
  });
  it("★懸念あり（excessiveShift 1 件でも）→ unstable", () => {
    const journal = [...Array.from({ length: 11 }, () => entry()), entry({ excessiveShift: true, anyConcern: true })];
    const r = assessPlaceAffinitySafety(journal);
    expect(r.status).toBe("unstable");
    expect(r.concernCount).toBe(1);
  });
  it("rollback 条件が定義されている（excessiveShift→OFF を含む）", () => {
    expect(PLACE_AFFINITY_ROLLBACK_CONDITIONS.length).toBeGreaterThan(0);
    expect(PLACE_AFFINITY_ROLLBACK_CONDITIONS.join()).toContain("excessiveShift");
  });
});
