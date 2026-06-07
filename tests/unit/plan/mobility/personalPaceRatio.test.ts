import { describe, it, expect } from "vitest";
import {
  buildPersonalPaceRatios,
  findPersonalPaceRatio,
  median,
  DEFAULT_PERSONAL_PACE_RATIO_CONFIG,
  type PaceObservation,
} from "@/lib/plan/mobility/personalPaceRatio";

function obs(over: Partial<PaceObservation> = {}): PaceObservation {
  return {
    legKey: "L",
    odKey: "home->office",
    mode: "train",
    estimateMin: 30,
    actualDurationMin: 30,
    confidence: "high",
    ...over,
  };
}

function repeat(n: number, over: Partial<PaceObservation> = {}): PaceObservation[] {
  return Array.from({ length: n }, () => obs(over));
}

describe("median", () => {
  it("奇数 → 中央", () => expect(median([3, 1, 2])).toBe(2));
  it("偶数 → 中央 2 値平均", () => expect(median([1, 2, 3, 4])).toBe(2.5));
  it("空 → NaN", () => expect(Number.isNaN(median([]))).toBe(true));
});

describe("buildPersonalPaceRatios — readiness gate", () => {
  it("enough(3 valid) → ready / tendency / strength / n", () => {
    const r = buildPersonalPaceRatios(repeat(3))[0];
    expect(r.status).toBe("ready");
    expect(r.tendency).toBe("tends_as_estimated"); // ratio 1.0
    expect(r.strength).toBe("emerging"); // 3 < established(5)
    expect(r.n).toBe(3);
    expect(typeof r.medianRatio).toBe("number");
  });
  it("established(5 valid) → strength established", () => {
    expect(buildPersonalPaceRatios(repeat(5))[0].strength).toBe("established");
  });
  it("sparse(2 valid) → not_enough_signal（medianRatio なし）", () => {
    const r = buildPersonalPaceRatios(repeat(2))[0];
    expect(r.status).toBe("not_enough_signal");
    expect(r.n).toBe(2);
    expect(r.medianRatio).toBeUndefined();
  });
  it("estimate 欠落(全件) → unknown", () => {
    const r = buildPersonalPaceRatios(repeat(3, { estimateMin: null }))[0];
    expect(r.status).toBe("unknown");
  });
  it("actualDuration 欠落(全件) → unknown", () => {
    const r = buildPersonalPaceRatios(repeat(3, { actualDurationMin: null }))[0];
    expect(r.status).toBe("unknown");
  });
});

describe("buildPersonalPaceRatios — tendency（★非対称: geofence 低バイアス対策）", () => {
  it("ratio≥1.15 → tends_longer（actual 40 / est 30 ≒1.33）", () => {
    expect(buildPersonalPaceRatios(repeat(3, { actualDurationMin: 40 }))[0].tendency).toBe("tends_longer");
  });
  it("ratio≤0.70 → tends_shorter（actual 18 / est 30 =0.6）", () => {
    expect(buildPersonalPaceRatios(repeat(3, { actualDurationMin: 18 }))[0].tendency).toBe("tends_shorter");
  });
  it("★ratio 0.85（0.70〜1.15）は tends_as_estimated（系統低バイアスで偽の『速い』を作らない）", () => {
    const r = buildPersonalPaceRatios(repeat(3, { estimateMin: 20, actualDurationMin: 17 }))[0]; // 0.85
    expect(r.tendency).toBe("tends_as_estimated");
  });
});

describe("buildPersonalPaceRatios — 除外（outlier / low-confidence / 短すぎ / sensitive / unknown mode）", () => {
  it("outlier(ratio>4) は valid から除外", () => {
    // 3 正常(ratio 1.0) + 1 outlier(actual 200/est 30≒6.7) → valid 3・outlier 除外
    const r = buildPersonalPaceRatios([...repeat(3), obs({ actualDurationMin: 200 })])[0];
    expect(r.status).toBe("ready");
    expect(r.n).toBe(3); // outlier は数えない
  });
  it("low-confidence は valid から除外（min 割れ → not_enough_signal）", () => {
    const r = buildPersonalPaceRatios([...repeat(2), obs({ confidence: "low" })])[0];
    expect(r.status).toBe("not_enough_signal");
    expect(r.n).toBe(2); // low は数えない
  });
  it("★短い leg(estimate<5) は ratio 除外（全件短い → not_enough_signal・n 0）", () => {
    const r = buildPersonalPaceRatios(repeat(3, { estimateMin: 4, actualDurationMin: 4 }))[0];
    expect(r.status).toBe("not_enough_signal"); // complete はあるが valid 0
    expect(r.n).toBe(0);
  });
  it("sensitive は完全除外（全件 sensitive → group すら作らない）", () => {
    expect(buildPersonalPaceRatios(repeat(3, { sensitive: true }))).toEqual([]);
  });
  it("sensitive 混在 → 非 sensitive のみ集計", () => {
    const r = buildPersonalPaceRatios([...repeat(3), ...repeat(2, { sensitive: true })])[0];
    expect(r.n).toBe(3);
  });
  it("mode unknown は除外（group を作らない）", () => {
    expect(buildPersonalPaceRatios(repeat(3, { mode: "unknown" }))).toEqual([]);
  });
});

describe("buildPersonalPaceRatios — ★mode/leg/od 混線なし", () => {
  it("同 od でも mode 違いは別 group", () => {
    const results = buildPersonalPaceRatios([
      ...repeat(3, { mode: "train", actualDurationMin: 40 }), // tends_longer
      ...repeat(3, { mode: "walk", actualDurationMin: 30 }), // as_estimated
    ]);
    expect(results).toHaveLength(2);
    const train = findPersonalPaceRatio(results, { odKey: "home->office", mode: "train" });
    const walk = findPersonalPaceRatio(results, { odKey: "home->office", mode: "walk" });
    expect(train?.tendency).toBe("tends_longer");
    expect(walk?.tendency).toBe("tends_as_estimated");
  });
  it("od 違いは別 group", () => {
    const results = buildPersonalPaceRatios([
      ...repeat(3, { odKey: "home->office" }),
      ...repeat(3, { odKey: "home->gym" }),
    ]);
    expect(results).toHaveLength(2);
  });
  it("odKey 無し → leg 単位で group（legKey を保持）", () => {
    const r = buildPersonalPaceRatios(repeat(3, { odKey: undefined, legKey: "legX" }))[0];
    expect(r.odKey).toBeUndefined();
    expect(r.legKey).toBe("legX");
    expect(r.groupKey.startsWith("leg:")).toBe(true);
  });
});

describe("findPersonalPaceRatio", () => {
  const results = buildPersonalPaceRatios(repeat(3));
  it("odKey + mode 一致 → 取得", () => {
    expect(findPersonalPaceRatio(results, { odKey: "home->office", mode: "train" })?.status).toBe("ready");
  });
  it("mode 不一致 → null", () => {
    expect(findPersonalPaceRatio(results, { odKey: "home->office", mode: "walk" })).toBeNull();
  });
  it("legKey で引く（od 無し group）", () => {
    const legResults = buildPersonalPaceRatios(repeat(3, { odKey: undefined, legKey: "legX" }));
    expect(findPersonalPaceRatio(legResults, { legKey: "legX", mode: "train" })?.status).toBe("ready");
  });
});

describe("DEFAULT_PERSONAL_PACE_RATIO_CONFIG", () => {
  it("★閾値が非対称（shorter 0.70 < longer 1.15 で低バイアスに厳しい）", () => {
    expect(DEFAULT_PERSONAL_PACE_RATIO_CONFIG.tendencyShorterThreshold).toBeLessThan(
      2 - DEFAULT_PERSONAL_PACE_RATIO_CONFIG.tendencyLongerThreshold,
    );
  });
  it("短 leg 除外閾値は 5 分", () => {
    expect(DEFAULT_PERSONAL_PACE_RATIO_CONFIG.minEstimateMinForRatio).toBe(5);
  });
});
