import { describe, it, expect } from "vitest";
import {
  combinePlaceAffinity,
  scorePlaceCandidates,
  combinedPersonalReasonLine,
  DEFAULT_COMBINER_CONFIG,
  type CombinerInput,
} from "@/lib/plan/compose/placeAffinityCombiner";
import type { PlaceAffinityReadiness, PlaceVisitStrength } from "@/lib/plan/compose/placeAffinityReadiness";
import type { PlaceConditionAffinity, PlaceCondition } from "@/lib/plan/compose/placeConditionAffinity";

function p2(profiles: { placeKey: string; strength: PlaceVisitStrength }[], status: "ready" | "not_enough" = "ready"): PlaceAffinityReadiness {
  return { status, totalVisits: 20, distinctPlaces: profiles.length, profiles: profiles.map((p) => ({ placeKey: p.placeKey, visitCount: 5, strength: p.strength })) };
}
const RAIN: PlaceCondition = { dimension: "weather", value: "rain" };
function p3(profiles: { placeKey: string; skew: boolean; strength: PlaceVisitStrength }[], status: "ready" | "not_enough" = "ready"): PlaceConditionAffinity {
  return { status, condition: RAIN, underConditionTotal: 12, profiles: profiles.map((p) => ({ placeKey: p.placeKey, underConditionCount: 4, totalCount: 5, skewsToCondition: p.skew, strength: p.strength })) };
}
function inp(placeKey: string, generalScore: number): CombinerInput {
  return { placeKey, generalScore };
}

describe("combinePlaceAffinity — sufficient gate / fallback", () => {
  it("★P2 not_enough → personal 反映なし（general 順のまま）", () => {
    const r = combinePlaceAffinity([inp("a", 1.0), inp("b", 0.9)], { p2: p2([{ placeKey: "b", strength: "habitual" }], "not_enough") });
    expect(r.map((x) => x.placeKey)).toEqual(["a", "b"]); // general 順
    expect(r.every((x) => x.personalNudge === 0)).toBe(true);
  });
  it("★未訪問 place は nudge 0（罰しない＝探索を潰さない）", () => {
    const r = combinePlaceAffinity([inp("known", 0.8), inp("new", 1.0)], { p2: p2([{ placeKey: "known", strength: "habitual" }]) });
    const newPlace = r.find((x) => x.placeKey === "new")!;
    expect(newPlace.personalNudge).toBe(0);
    expect(newPlace.combinedScore).toBe(1.0); // general 不変
  });
});

describe("combinePlaceAffinity — bounded nudge / clamp", () => {
  it("★habitual + condition_fit → maxNudge(0.25) に clamp", () => {
    const r = combinePlaceAffinity([inp("x", 0.5)], {
      p2: p2([{ placeKey: "x", strength: "habitual" }]),
      p3: p3([{ placeKey: "x", skew: true, strength: "frequent" }]),
    });
    expect(r[0].personalNudge).toBe(DEFAULT_COMBINER_CONFIG.maxNudge); // 0.15+0.1=0.25 → clamp
    expect(r[0].combinedScore).toBeCloseTo(0.75);
  });
  it("★personal は接近した候補を入れ替えられる（gap < maxNudge）", () => {
    // a=0.9 general, b=0.8 general だが b は habitual → b+0.15=0.95 > a → b が上位
    const r = combinePlaceAffinity([inp("a", 0.9), inp("b", 0.8)], { p2: p2([{ placeKey: "b", strength: "habitual" }]) });
    expect(r[0].placeKey).toBe("b");
  });
  it("★明確な general 勝者は personal で覆らない（gap > maxNudge）", () => {
    // a=1.3 general, b=0.8 general・b habitual(+0.15)=0.95 < 1.3 → a 維持
    const r = combinePlaceAffinity([inp("a", 1.3), inp("b", 0.8)], { p2: p2([{ placeKey: "b", strength: "habitual" }]) });
    expect(r[0].placeKey).toBe("a");
  });
});

describe("combinePlaceAffinity — note 優先 / reason", () => {
  it("★P3 condition_fit が P2 frequent_place より note 優先（今日のあなたなら）", () => {
    const r = combinePlaceAffinity([inp("x", 0.5)], {
      p2: p2([{ placeKey: "x", strength: "habitual" }]),
      p3: p3([{ placeKey: "x", skew: true, strength: "frequent" }]),
    });
    expect(r[0].personalNote?.kind).toBe("condition_fit");
  });
  it("condition_fit → 「雨の日に行くことが多い」/ frequent → 「よく行く」/ null → null", () => {
    expect(combinedPersonalReasonLine({ kind: "condition_fit", condition: RAIN })).toContain("雨の日に行くことが多い");
    expect(combinedPersonalReasonLine({ kind: "frequent_place", strength: "habitual" })).toContain("よく行く");
    expect(combinedPersonalReasonLine(null)).toBeNull();
  });
  it("★occasional な P2/P3 は note にしない", () => {
    const r = combinePlaceAffinity([inp("x", 0.5)], { p2: p2([{ placeKey: "x", strength: "occasional" }]) });
    expect(r[0].personalNote).toBeNull();
  });
  it("★skew false の P3 は nudge/note なし", () => {
    const r = combinePlaceAffinity([inp("x", 0.5)], { p2: p2([], "ready"), p3: p3([{ placeKey: "x", skew: false, strength: "frequent" }]) });
    expect(r[0].personalNudge).toBe(0);
    expect(r[0].personalNote).toBeNull();
  });
});

describe("combinePlaceAffinity — 安定 / privacy", () => {
  it("同点は general（入力）順を保つ", () => {
    const r = combinePlaceAffinity([inp("a", 1.0), inp("b", 1.0)], { p2: p2([], "not_enough") });
    expect(r.map((x) => x.placeKey)).toEqual(["a", "b"]);
  });
  it("★出力に座標/住所を含まない（placeKey と内部 score のみ）", () => {
    const joined = JSON.stringify(combinePlaceAffinity([inp("x", 1.0)], { p2: p2([{ placeKey: "x", strength: "habitual" }]) }));
    expect(joined).not.toMatch(/lat|lng|coord|address|住所/);
  });
});

describe("scorePlaceCandidates — P6-1 入力順 score（未ソート）", () => {
  it("★入力順を保つ（ソートしない）・combinedScore=general+nudge", () => {
    const r = scorePlaceCandidates([inp("a", 0.9), inp("b", 0.8)], { p2: p2([{ placeKey: "b", strength: "habitual" }]) });
    expect(r.map((x) => x.placeKey)).toEqual(["a", "b"]); // 入力順（ソートしない）
    expect(r[0].combinedScore).toBe(0.9); // a: nudge 0
    expect(r[1].combinedScore).toBeCloseTo(0.95); // b: +0.15
  });
  it("★未訪問は nudge 0（罰しない）・not_enough は全 0", () => {
    expect(scorePlaceCandidates([inp("new", 1.0)], { p2: p2([{ placeKey: "known", strength: "habitual" }]) })[0].personalNudge).toBe(0);
    expect(scorePlaceCandidates([inp("b", 0.8)], { p2: p2([{ placeKey: "b", strength: "habitual" }], "not_enough") })[0].personalNudge).toBe(0);
  });
  it("★combinePlaceAffinity と整合（scorePlaceCandidates を sort したもの）", () => {
    const inputs = [inp("a", 0.9), inp("b", 0.8)];
    const personal = { p2: p2([{ placeKey: "b", strength: "habitual" }]) };
    expect(combinePlaceAffinity(inputs, personal).map((x) => x.placeKey)).toEqual(["b", "a"]); // sort 後
  });
});
