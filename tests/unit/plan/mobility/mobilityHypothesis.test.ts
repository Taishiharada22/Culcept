import { describe, it, expect } from "vitest";
import {
  buildMobilityHypothesis,
  type ModeBelief,
} from "@/lib/plan/mobility/mobilityHypothesis";

/** test 用 belief ファクトリ（既定は空 belief） */
function belief(partial: Partial<ModeBelief>): ModeBelief {
  return {
    legKey: "a__b",
    counts: {},
    total: 0,
    topMode: null,
    topShare: 0,
    ...partial,
  };
}

describe("buildMobilityHypothesis (v0-A pure builder)", () => {
  it("空 belief は graceful: habitual=null・strength none・signal 0・沈黙候補", () => {
    const h = buildMobilityHypothesis(belief({}), {});
    expect(h.habitualMode).toBeNull();
    expect(h.habitualStrength).toBe("none");
    expect(h.todayLikelyMode).toBeNull();
    expect(h.signalStrength).toBe(0);
    expect(h.contextNote).toBeNull();
    expect(h.alternatives).toEqual([]);
  });

  it("強い habitual（train・total 10・share 0.8）: strong・todayLikely=train・天候なしで note なし", () => {
    const h = buildMobilityHypothesis(
      belief({ counts: { train: 8, walk: 2 }, total: 10, topMode: "train", topShare: 0.8 }),
      {},
    );
    expect(h.habitualMode).toBe("train");
    expect(h.habitualStrength).toBe("strong");
    expect(h.todayLikelyMode).toBe("train");
    expect(h.contextNote).toBeNull();
    expect(h.alternatives).toEqual(["walk"]);
  });

  it("★最重要 guardrail: weather は todayLikelyMode を変えない（belief 由来のみ）", () => {
    const b = belief({ counts: { walk: 6 }, total: 6, topMode: "walk", topShare: 1 });
    for (const weather of ["rain", "heat", "normal", null] as const) {
      const h = buildMobilityHypothesis(b, { weather });
      expect(h.todayLikelyMode).toBe("walk"); // weather で別 mode にしない
    }
  });

  it("habitual=徒歩 + 雨: contextNote(outdoor_burden/rain/walk) が出るが todayLikely は walk のまま", () => {
    const h = buildMobilityHypothesis(
      belief({ counts: { walk: 5 }, total: 5, topMode: "walk", topShare: 1 }),
      { weather: "rain" },
    );
    expect(h.habitualMode).toBe("walk");
    expect(h.todayLikelyMode).toBe("walk"); // ★変えない
    expect(h.contextNote).toEqual({ kind: "outdoor_burden", reason: "rain", aboutMode: "walk" });
  });

  it("habitual=電車 + 雨: contextNote は出ない（電車は屋外露出でない）", () => {
    const h = buildMobilityHypothesis(
      belief({ counts: { train: 5 }, total: 5, topMode: "train", topShare: 1 }),
      { weather: "rain" },
    );
    expect(h.contextNote).toBeNull();
    expect(h.todayLikelyMode).toBe("train");
  });

  it("habitual=自転車 + 猛暑: contextNote(outdoor_burden/heat/bicycle)", () => {
    const h = buildMobilityHypothesis(
      belief({ counts: { bicycle: 4 }, total: 4, topMode: "bicycle", topShare: 1 }),
      { weather: "heat" },
    );
    expect(h.contextNote).toEqual({ kind: "outdoor_burden", reason: "heat", aboutMode: "bicycle" });
  });

  it("weather normal は contextNote を出さない", () => {
    const h = buildMobilityHypothesis(
      belief({ counts: { walk: 5 }, total: 5, topMode: "walk", topShare: 1 }),
      { weather: "normal" },
    );
    expect(h.contextNote).toBeNull();
  });

  it("弱い signal（total 1）: strength weak・signal 0.5", () => {
    const h = buildMobilityHypothesis(
      belief({ counts: { car: 1 }, total: 1, topMode: "car", topShare: 1 }),
      {},
    );
    expect(h.habitualStrength).toBe("weak");
    expect(h.signalStrength).toBe(0.5);
  });

  it("strength 段階: moderate(total 4・share 0.5) / strong(total 10・share 0.7)", () => {
    const mod = buildMobilityHypothesis(
      belief({ counts: { bus: 2, walk: 1, car: 1 }, total: 4, topMode: "bus", topShare: 0.5 }),
      {},
    );
    expect(mod.habitualStrength).toBe("moderate");
    const strong = buildMobilityHypothesis(
      belief({ counts: { train: 7, walk: 3 }, total: 10, topMode: "train", topShare: 0.7 }),
      {},
    );
    expect(strong.habitualStrength).toBe("strong");
  });

  it("alternatives は観測済み(count>0)の top 以外のみ", () => {
    const h = buildMobilityHypothesis(
      belief({ counts: { train: 5, walk: 2, bus: 1 }, total: 8, topMode: "train", topShare: 0.625 }),
      {},
    );
    expect([...h.alternatives].sort()).toEqual(["bus", "walk"]);
  });
});
