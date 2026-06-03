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

describe("reality/lsat — invNormalCdf (Acklam) precision (GPT audit: 手実装の数学関数)", () => {
  it("matches known z-values within tolerance", () => {
    expect(invNormalCdf(0.5)).toBeCloseTo(0, 6);
    expect(invNormalCdf(0.8)).toBeCloseTo(0.8416, 3);
    expect(invNormalCdf(0.9)).toBeCloseTo(1.2816, 3);
    expect(invNormalCdf(0.975)).toBeCloseTo(1.95996, 3);
    expect(invNormalCdf(0.98)).toBeCloseTo(2.0537, 3);
    expect(invNormalCdf(0.99)).toBeCloseTo(2.3263, 3);
  });

  it("is symmetric about 0.5", () => {
    expect(invNormalCdf(0.2)).toBeCloseTo(-invNormalCdf(0.8), 6);
    expect(invNormalCdf(0.1)).toBeCloseTo(-invNormalCdf(0.9), 6);
  });

  it("is strictly monotone increasing across a sweep", () => {
    let prev = -Infinity;
    for (let p = 0.05; p < 1; p += 0.05) {
      const z = invNormalCdf(p);
      expect(z).toBeGreaterThan(prev);
      prev = z;
    }
  });

  it("out-of-range never returns a plausible-but-wrong finite z (fail-loud)", () => {
    expect(invNormalCdf(0)).toBe(-Infinity);
    expect(invNormalCdf(1)).toBe(Infinity);
    expect(Number.isFinite(invNormalCdf(1.5))).toBe(false);
    expect(Number.isFinite(invNormalCdf(-0.2))).toBe(false);
    expect(Number.isNaN(invNormalCdf(NaN))).toBe(true);
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

describe("reality/lsat — confidence safety (GPT audit)", () => {
  const travel = { meanMin: 40, sdMin: 10 };

  it("result.confidence is clamped to [0,1] for any input", () => {
    expect(computeLsat({ arrivalDeadlineMin: 600, travel, prepMin: 0, percentile: 0.9, confidence: 2 }).confidence).toBe(1);
    expect(computeLsat({ arrivalDeadlineMin: 600, travel, prepMin: 0, percentile: 0.9, confidence: -1 }).confidence).toBe(0);
    expect(computeLsat({ arrivalDeadlineMin: 600, travel, prepMin: 0, percentile: 0.9, confidence: NaN }).confidence).toBe(0);
  });

  it("high confidence ⇒ baseline buffer (no inflation); never NaN/Infinity", () => {
    const r = computeLsat({ arrivalDeadlineMin: 600, travel, prepMin: 10, percentile: 0.9, confidence: 1 });
    expect(r.bufferMin).toBeCloseTo(40 + invNormalCdf(0.9) * 10, 6);
    expect(Number.isFinite(r.departByMin)).toBe(true);
    expect(Number.isFinite(r.bufferMin)).toBe(true);
  });

  it("low confidence only widens the buffer (the number) — it does NOT itself decide delivery", () => {
    // 設計境界: lsat は「数値」だけを計算する。通知昇格は confidence×stakes×actionability×
    // receptivity で別モジュール(Receptivity Gate, 未実装)が決める。よって低 confidence 単独で
    // 通知が昇格することは構造的にありえない（lsat は配信判断を持たない）。
    const sure = computeLsat({ arrivalDeadlineMin: 600, travel, prepMin: 10, percentile: 0.9, confidence: 1 });
    const unsure = computeLsat({ arrivalDeadlineMin: 600, travel, prepMin: 10, percentile: 0.9, confidence: 0.2 });
    expect(unsure.bufferMin).toBeGreaterThan(sure.bufferMin);
    // LsatResult に配信フラグが存在しないことを型/構造で担保
    expect(Object.keys(sure).sort()).toEqual(["bufferMin", "confidence", "departByMin", "percentile"]);
  });
});

describe("reality/lsat — computeLsat/resolvePercentile never emit Infinity/NaN (GPT audit point 1)", () => {
  const travel = { meanMin: 30, sdMin: 8 };
  const badPercentiles = [0, 1, 2, -1, NaN, Infinity, -Infinity, 0.5, 0.9];
  const badConfidences = [2, -1, NaN, Infinity, 0, 0.5, 1];

  it("any percentile/confidence input yields finite LSAT result (invNormalCdf fail-loud is contained)", () => {
    for (const p of badPercentiles) {
      for (const c of badConfidences) {
        const r = computeLsat({ arrivalDeadlineMin: 600, travel, prepMin: 10, percentile: p, confidence: c });
        expect(Number.isFinite(r.departByMin)).toBe(true);
        expect(Number.isFinite(r.bufferMin)).toBe(true);
        expect(r.percentile).toBeGreaterThanOrEqual(0.5);
        expect(r.percentile).toBeLessThanOrEqual(0.995);
        expect(r.confidence).toBeGreaterThanOrEqual(0);
        expect(r.confidence).toBeLessThanOrEqual(1);
      }
    }
  });

  it("resolvePercentile always returns finite ∈ [0.5,0.995] regardless of inputs", () => {
    const tiers: ImportanceTier[] = ["catastrophic", "important", "normal", "optional", "recovery"];
    for (const tier of tiers) {
      for (const lr of [NaN, -1, 0, 1, 100, Infinity]) {
        for (const eo of [undefined, NaN, -1, 0, 2, 0.7]) {
          const p = resolvePercentile({ tier, learnedLatenessRatio: lr, eventOverridePercentile: eo });
          expect(Number.isFinite(p)).toBe(true);
          expect(p).toBeGreaterThanOrEqual(0.5);
          expect(p).toBeLessThanOrEqual(0.995);
        }
      }
    }
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
