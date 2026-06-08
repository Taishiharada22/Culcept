import { describe, it, expect } from "vitest";
import { buildShadowRanking, shadowInputsFromDisplayOrder } from "@/lib/plan/compose/placeAffinityShadowRanking";
import type { CombinerInput } from "@/lib/plan/compose/placeAffinityCombiner";
import type { PlaceAffinityReadiness, PlaceVisitStrength } from "@/lib/plan/compose/placeAffinityReadiness";

function p2(entries: { placeKey: string; strength: PlaceVisitStrength }[], status: "ready" | "not_enough" = "ready"): PlaceAffinityReadiness {
  return { status, totalVisits: 20, distinctPlaces: entries.length, profiles: entries.map((e) => ({ placeKey: e.placeKey, visitCount: 5, strength: e.strength })) };
}
function inp(placeKey: string, generalScore: number): CombinerInput {
  return { placeKey, generalScore };
}

describe("buildShadowRanking — 適用しない検証", () => {
  it("★personal なし(not_enough) → 順序不変・orderChanged false・applied 0・shift 0", () => {
    const r = buildShadowRanking([inp("a", 1.0), inp("b", 0.9)], { p2: p2([{ placeKey: "b", strength: "habitual" }], "not_enough") });
    expect(r.generalOrder).toEqual(["a", "b"]);
    expect(r.combinedOrder).toEqual(["a", "b"]);
    expect(r.orderChanged).toBe(false);
    expect(r.personalAppliedCount).toBe(0);
    expect(r.maxRankShift).toBe(0);
  });
  it("★接近候補を personal が入替 → orderChanged true・shift 計測", () => {
    // a=0.9, b=0.8(habitual +0.15=0.95) → b が上位
    const r = buildShadowRanking([inp("a", 0.9), inp("b", 0.8)], { p2: p2([{ placeKey: "b", strength: "habitual" }]) });
    expect(r.combinedOrder).toEqual(["b", "a"]);
    expect(r.orderChanged).toBe(true);
    expect(r.changedPositionCount).toBe(2);
    expect(r.maxRankShift).toBe(1);
    expect(r.personalAppliedCount).toBe(1);
  });
  it("★明確な general 勝者は不変（gap > maxNudge）", () => {
    const r = buildShadowRanking([inp("a", 1.3), inp("b", 0.8)], { p2: p2([{ placeKey: "b", strength: "habitual" }]) });
    expect(r.combinedOrder).toEqual(["a", "b"]);
    expect(r.orderChanged).toBe(false);
    expect(r.maxRankShift).toBe(0);
  });
  it("★maxRankShift は bounded（clamp ゆえ大きく飛ばない）", () => {
    // 3 候補・僅差。habitual な末尾候補でも 1 つ上がる程度
    const r = buildShadowRanking([inp("a", 1.0), inp("b", 0.95), inp("c", 0.9)], { p2: p2([{ placeKey: "c", strength: "habitual" }]) });
    expect(r.maxRankShift).toBeLessThanOrEqual(2); // 全候補僅差でも clamp で限定
  });
  it("★出力に座標/住所/raw 値を含まない（placeKey と count のみ）", () => {
    const joined = JSON.stringify(buildShadowRanking([inp("x", 1.0)], { p2: p2([{ placeKey: "x", strength: "habitual" }]) }));
    expect(joined).not.toMatch(/lat|lng|coord|address|住所/);
  });
});

describe("shadowInputsFromDisplayOrder — P6-0", () => {
  it("★表示順 → generalScore は上位ほど高い（n-index）", () => {
    const r = shadowInputsFromDisplayOrder(["a", "b", "c"]);
    expect(r).toEqual([
      { placeKey: "a", generalScore: 3 },
      { placeKey: "b", generalScore: 2 },
      { placeKey: "c", generalScore: 1 },
    ]);
  });
  it("★round-trip: 表示順をそのまま shadow にかけても personal なしなら順序不変", () => {
    const inputs = shadowInputsFromDisplayOrder(["a", "b"]);
    const r = buildShadowRanking(inputs, { p2: p2([], "not_enough") });
    expect(r.combinedOrder).toEqual(["a", "b"]);
    expect(r.orderChanged).toBe(false);
  });
});
