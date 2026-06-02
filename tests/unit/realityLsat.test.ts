import { describe, it, expect } from "vitest";
import {
  TIER_DEFAULT_PERCENTILE,
  TIER_SAFETY_FLOOR,
  clampPercentile,
  criticalFractile,
  latenessAversionToPercentile,
  resolvePercentile,
  invNormalCdf,
  uncertaintyInflation,
  computeLsat,
  PERCENTILE_MIN,
  PERCENTILE_MAX,
  type ImportanceTier,
} from "@/lib/plan/reality/lsat";

describe("reality/lsat — critical-fractile percentile", () => {
  it("criticalFractile = Cu/(Cu+Co)", () => {
    expect(criticalFractile(4, 1)).toBeCloseTo(0.8, 10); // normal
    expect(criticalFractile(9, 1)).toBeCloseTo(0.9, 10); // important
    expect(criticalFractile(1, 1)).toBeCloseTo(0.5, 10); // recovery
  });

  it("latenessAversionToPercentile maps λ→p* and matches Small(1982) ~0.8 at λ=4", () => {
    expect(latenessAversionToPercentile(4)).toBeCloseTo(0.8, 10);
    expect(latenessAversionToPercentile(9)).toBeCloseTo(0.9, 10);
    expect(latenessAversionToPercentile(1)).toBeCloseTo(0.5, 10);
  });

  it("clamps to [0.5, 0.995] and handles degenerate input", () => {
    expect(latenessAversionToPercentile(1000)).toBeLessThanOrEqual(PERCENTILE_MAX);
    expect(latenessAversionToPercentile(0)).toBe(PERCENTILE_MIN);
    expect(latenessAversionToPercentile(-3)).toBe(PERCENTILE_MIN);
    expect(criticalFractile(0, 0)).toBe(PERCENTILE_MIN);
    expect(clampPercentile(2)).toBe(PERCENTILE_MAX);
    expect(clampPercentile(0)).toBe(PERCENTILE_MIN);
    expect(clampPercentile(NaN)).toBe(PERCENTILE_MIN);
  });

  it("tier defaults match the audited policy table", () => {
    expect(TIER_DEFAULT_PERCENTILE.catastrophic).toBe(0.98);
    expect(TIER_DEFAULT_PERCENTILE.important).toBe(0.9);
    expect(TIER_DEFAULT_PERCENTILE.normal).toBe(0.8);
    expect(TIER_DEFAULT_PERCENTILE.optional).toBe(0.6);
    expect(TIER_DEFAULT_PERCENTILE.recovery).toBe(0.5);
  });
});

describe("reality/lsat — resolvePercentile (4-layer + Safety Floor INV-3)", () => {
  it("uses tier default when no override/learning", () => {
    expect(resolvePercentile({ tier: "normal" })).toBe(0.8);
  });

  it("event override > PRM > policy", () => {
    expect(
      resolvePercentile({ tier: "normal", learnedLatenessRatio: 9, eventOverridePercentile: 0.95 })
    ).toBeCloseTo(0.95, 10);
    expect(resolvePercentile({ tier: "normal", learnedLatenessRatio: 9 })).toBeCloseTo(0.9, 10);
  });

  it("INV-3: Safety Floor — learning cannot push catastrophic below its floor", () => {
    // PRM が「この user は遅刻を気にしない（λ=1→0.5）」と学習しても、
    // catastrophic は 0.98 を割らない。
    expect(resolvePercentile({ tier: "catastrophic", learnedLatenessRatio: 1 })).toBe(0.98);
    // event override で危険側に下げようとしても floor が勝つ
    expect(resolvePercentile({ tier: "catastrophic", eventOverridePercentile: 0.6 })).toBe(0.98);
    // floor は片側（保守側に上げるのは許す）
    expect(resolvePercentile({ tier: "catastrophic", eventOverridePercentile: 0.995 })).toBe(0.995);
  });

  it("recovery has no floor (avoid over-buffering)", () => {
    expect(TIER_SAFETY_FLOOR.recovery).toBe(0);
    expect(resolvePercentile({ tier: "recovery", eventOverridePercentile: 0.5 })).toBe(0.5);
  });
});

describe("reality/lsat — invNormalCdf (Acklam)", () => {
  it("matches known z-values within tolerance", () => {
    expect(invNormalCdf(0.5)).toBeCloseTo(0, 6);
    expect(invNormalCdf(0.8)).toBeCloseTo(0.8416, 3);
    expect(invNormalCdf(0.9)).toBeCloseTo(1.2816, 3);
    expect(invNormalCdf(0.975)).toBeCloseTo(1.95996, 3);
    expect(invNormalCdf(0.98)).toBeCloseTo(2.0537, 3);
  });

  it("is monotincreasing in p", () => {
    expect(invNormalCdf(0.6)).toBeLessThan(invNormalCdf(0.7));
    expect(invNormalCdf(0.9)).toBeLessThan(invNormalCdf(0.99));
  });
});

describe("reality/lsat — computeLsat", () => {
  const travel = { meanMin: 40, sdMin: 10 };

  it("buffer = mean + z(p)·sd at confidence=1", () => {
    const r = computeLsat({ arrivalDeadlineMin: 600, travel, prepMin: 0, percentile: 0.8, confidence: 1 });
    // z(0.8) ≈ 0.8416 → buffer ≈ 40 + 8.416 = 48.416
    expect(r.bufferMin).toBeCloseTo(40 + invNormalCdf(0.8) * 10, 6);
    expect(r.departByMin).toBeCloseTo(600 - r.bufferMin, 6);
  });

  it("INV-21: higher percentile ⇒ earlier departBy (more lead)", () => {
    const base = { arrivalDeadlineMin: 600, travel, prepMin: 10, confidence: 1 };
    const optional = computeLsat({ ...base, percentile: 0.6 });
    const normal = computeLsat({ ...base, percentile: 0.8 });
    const important = computeLsat({ ...base, percentile: 0.9 });
    const catastrophic = computeLsat({ ...base, percentile: 0.98 });
    expect(important.departByMin).toBeLessThan(normal.departByMin);
    expect(normal.departByMin).toBeLessThan(optional.departByMin);
    expect(catastrophic.departByMin).toBeLessThan(important.departByMin);
  });

  it("INV-8: lower confidence ⇒ bigger buffer ⇒ earlier departBy", () => {
    const base = { arrivalDeadlineMin: 600, travel, prepMin: 10, percentile: 0.9 };
    const sure = computeLsat({ ...base, confidence: 1 });
    const unsure = computeLsat({ ...base, confidence: 0.4 });
    expect(unsure.bufferMin).toBeGreaterThan(sure.bufferMin);
    expect(unsure.departByMin).toBeLessThan(sure.departByMin);
  });

  it("uncertaintyInflation: 1→×1.0, 0→×1.5, clamped", () => {
    expect(uncertaintyInflation(1)).toBeCloseTo(1, 10);
    expect(uncertaintyInflation(0)).toBeCloseTo(1.5, 10);
    expect(uncertaintyInflation(0.5)).toBeCloseTo(1.25, 10);
    expect(uncertaintyInflation(2)).toBeCloseTo(1, 10);
    expect(uncertaintyInflation(-1)).toBeCloseTo(1.5, 10);
  });

  it("guards NaN/negative inputs (fail-safe)", () => {
    const r = computeLsat({
      arrivalDeadlineMin: 600,
      travel: { meanMin: NaN, sdMin: -5 },
      prepMin: -10,
      percentile: 0.9,
      confidence: NaN,
    });
    expect(Number.isFinite(r.departByMin)).toBe(true);
    expect(r.bufferMin).toBeGreaterThanOrEqual(0);
  });
});

describe("reality/lsat — end-to-end tier→LSAT (representative scenarios)", () => {
  it("S9-like catastrophic interview departs earlier than S2-like optional cafe", () => {
    const travel = { meanMin: 50, sdMin: 15 };
    const interview = computeLsat({
      arrivalDeadlineMin: 780,
      travel,
      prepMin: 15,
      percentile: resolvePercentile({ tier: "catastrophic" as ImportanceTier }),
      confidence: 0.6,
    });
    const cafe = computeLsat({
      arrivalDeadlineMin: 780,
      travel: { meanMin: 5, sdMin: 1 },
      prepMin: 0,
      percentile: resolvePercentile({ tier: "optional" as ImportanceTier }),
      confidence: 0.85,
    });
    expect(interview.departByMin).toBeLessThan(cafe.departByMin);
  });
});
