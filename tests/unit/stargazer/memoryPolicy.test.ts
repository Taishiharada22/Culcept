/**
 * P2-4 Memory Policy Tests
 *
 * 検証対象:
 * 1. Freshness — 指数減衰 + memory type 別 half-life
 * 2. Consistency — 証拠整合性
 * 3. Contradiction Pressure — 反例の圧力
 * 4. Lifecycle Stage — 4段階遷移
 * 5. Effective Weight — 3軸合成
 * 6. Memory Usage Mode — prompt 含有判定
 * 7. Narrative Revision Cascade — cascade decay + 上限
 * 8. Contradiction Cascade — cascade decay
 * 9. Batch Processing — applyMemoryPolicy
 * 10. Analytics
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  computeFreshness,
  computeConsistency,
  computeContradictionPressure,
  computeLifecycleStage,
  computeEffectiveWeight,
  determineMemoryUsage,
  computeNarrativeRevisionCascade,
  computeContradictionCascade,
  applyMemoryPolicy,
  buildMemoryPolicyAnalytics,
  type MemoryEntry,
  type LifecycleStage,
} from "@/lib/stargazer/memoryPolicy";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helper
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const NOW = new Date("2026-04-07T12:00:00Z");

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    type: "trait_hypothesis",
    evidenceCount: 5,
    counterEvidenceCount: 0,
    strongCounterEvidenceCount: 0,
    lastConfirmedAt: "2026-04-06T12:00:00Z", // 1 day ago
    createdAt: "2026-03-01T00:00:00Z",
    revisionCount: 0,
    frozenSince: null,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 1. Freshness
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeFreshness()", () => {
  it("最終確認が今日 → ≈1.0", () => {
    const f = computeFreshness("2026-04-07T12:00:00Z", "2026-03-01T00:00:00Z", "trait_hypothesis", NOW);
    expect(f).toBeCloseTo(1.0, 1);
  });

  it("trait half-life(30d) → 30日後に ≈0.5", () => {
    const f = computeFreshness("2026-03-08T12:00:00Z", "2026-03-01T00:00:00Z", "trait_hypothesis", NOW);
    expect(f).toBeCloseTo(0.5, 1);
  });

  it("body_mapping half-life(14d) → 14日後に ≈0.5", () => {
    const f = computeFreshness("2026-03-24T12:00:00Z", "2026-03-01T00:00:00Z", "body_mapping", NOW);
    expect(f).toBeCloseTo(0.5, 1);
  });

  it("lastConfirmedAt=null → createdAt をフォールバック", () => {
    // created 37 days ago, trait half-life 30d → freshness ≈ 0.42
    const f = computeFreshness(null, "2026-03-01T00:00:00Z", "trait_hypothesis", NOW);
    expect(f).toBeGreaterThan(0.3);
    expect(f).toBeLessThan(0.6);
  });

  it("非常に古い → 0 に近づく", () => {
    const f = computeFreshness("2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", "body_mapping", NOW);
    expect(f).toBeLessThan(0.01);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 2. Consistency
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeConsistency()", () => {
  it("evidence=10, counter=0 → 高い整合性", () => {
    expect(computeConsistency(10, 0)).toBeCloseTo(10 / 11);
  });

  it("evidence=5, counter=5 → 中程度", () => {
    expect(computeConsistency(5, 5)).toBeCloseTo(5 / 11);
  });

  it("evidence=0, counter=0 → 0（ラプラス平滑化）", () => {
    expect(computeConsistency(0, 0)).toBe(0);
  });

  it("evidence=1, counter=5 → 低い整合性", () => {
    expect(computeConsistency(1, 5)).toBeCloseTo(1 / 7);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 3. Contradiction Pressure
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeContradictionPressure()", () => {
  it("counter=0 → 圧力 0", () => {
    expect(computeContradictionPressure(5, 0, 0)).toBe(0);
  });

  it("counter=5, evidence=5 → 中程度の圧力", () => {
    expect(computeContradictionPressure(5, 5, 0)).toBeCloseTo(5 / 11);
  });

  it("strong counter は加算される", () => {
    // evidence=5, counter=2, strong=1 → effective=3 → 3/9
    const p = computeContradictionPressure(5, 2, 1);
    expect(p).toBeCloseTo(3 / 9);
  });

  it("counter >> evidence → 高い圧力", () => {
    expect(computeContradictionPressure(1, 10, 0)).toBeGreaterThan(0.8);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 4. Lifecycle Stage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeLifecycleStage()", () => {
  it("evidence=1 → candidate", () => {
    expect(computeLifecycleStage(makeEntry({ evidenceCount: 1 }), NOW)).toBe("candidate");
  });

  it("evidence=0 → candidate", () => {
    expect(computeLifecycleStage(makeEntry({ evidenceCount: 0 }), NOW)).toBe("candidate");
  });

  it("evidence=2, low counter → tentative", () => {
    expect(computeLifecycleStage(makeEntry({ evidenceCount: 2, counterEvidenceCount: 0 }), NOW)).toBe("tentative");
  });

  it("evidence=5, counter=0, fresh → active", () => {
    expect(computeLifecycleStage(makeEntry({ evidenceCount: 5, counterEvidenceCount: 0 }), NOW)).toBe("active");
  });

  it("高 contradiction pressure → weakening", () => {
    // evidence=3, counter=5 → pressure = 5/9 ≈ 0.56 > 0.4
    expect(computeLifecycleStage(makeEntry({
      evidenceCount: 3,
      counterEvidenceCount: 5,
    }), NOW)).toBe("weakening");
  });

  it("非常に古い（低 freshness）→ weakening", () => {
    expect(computeLifecycleStage(makeEntry({
      evidenceCount: 5,
      lastConfirmedAt: "2025-01-01T00:00:00Z",
      createdAt: "2025-01-01T00:00:00Z",
    }), NOW)).toBe("weakening");
  });

  it("evidence=3, 高 counter → candidate ではなく weakening", () => {
    // 証拠あるが反例が多い → weakening（候補に戻らない）
    expect(computeLifecycleStage(makeEntry({
      evidenceCount: 3,
      counterEvidenceCount: 4,
    }), NOW)).toBe("weakening");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 5. Effective Weight
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeEffectiveWeight()", () => {
  it("新鮮 + 整合 + 反例なし → 高い重み", () => {
    const ew = computeEffectiveWeight(makeEntry(), NOW);
    expect(ew.weight).toBeGreaterThan(0.7);
    expect(ew.stage).toBe("active");
  });

  it("古い + 整合 → 中程度の重み", () => {
    const ew = computeEffectiveWeight(makeEntry({
      lastConfirmedAt: "2026-03-08T00:00:00Z", // 30 days ago
    }), NOW);
    expect(ew.weight).toBeGreaterThan(0.3);
    expect(ew.weight).toBeLessThan(0.7);
  });

  it("evidence=1 → candidate, 低い重み", () => {
    const ew = computeEffectiveWeight(makeEntry({ evidenceCount: 1 }), NOW);
    expect(ew.stage).toBe("candidate");
    expect(ew.weight).toBeLessThan(0.5);
  });

  it("高い反例圧力 → weakening, 低い重み", () => {
    const ew = computeEffectiveWeight(makeEntry({
      evidenceCount: 3,
      counterEvidenceCount: 5,
    }), NOW);
    expect(ew.stage).toBe("weakening");
    expect(ew.weight).toBeLessThan(0.3);
  });

  it("weight は 0-1 の範囲", () => {
    const ew = computeEffectiveWeight(makeEntry({ evidenceCount: 0 }), NOW);
    expect(ew.weight).toBeGreaterThanOrEqual(0);
    expect(ew.weight).toBeLessThanOrEqual(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 6. Memory Usage Mode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("determineMemoryUsage()", () => {
  it("candidate → exclude", () => {
    expect(determineMemoryUsage("candidate")).toBe("exclude");
  });

  it("tentative → hedged", () => {
    expect(determineMemoryUsage("tentative")).toBe("hedged");
  });

  it("active → normal", () => {
    expect(determineMemoryUsage("active")).toBe("normal");
  });

  it("weakening → hedged", () => {
    expect(determineMemoryUsage("weakening")).toBe("hedged");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 7. Narrative Revision Cascade
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeNarrativeRevisionCascade()", () => {
  const entries = [
    { id: "h1", type: "trait_hypothesis" as const, currentConfidence: 0.8 },
    { id: "h2", type: "wound_hypothesis" as const, currentConfidence: 0.6 },
  ];

  it("valence_flip → 最大 severity, 各 0.1 decay", () => {
    const decays = computeNarrativeRevisionCascade("valence_flip", entries);
    expect(decays.length).toBe(2);
    expect(decays[0].confidenceDelta).toBeCloseTo(-0.1);
    expect(decays[1].confidenceDelta).toBeCloseTo(-0.1);
  });

  it("softening → 小さい decay", () => {
    const decays = computeNarrativeRevisionCascade("softening", entries);
    expect(decays[0].confidenceDelta).toBeCloseTo(-0.03);
  });

  it("minor_variation → cascade なし", () => {
    const decays = computeNarrativeRevisionCascade("minor_variation", entries);
    expect(decays).toHaveLength(0);
  });

  it("合計 decay は MAX_TOTAL_CASCADE_DECAY(0.2) を超えない", () => {
    const manyEntries = Array.from({ length: 10 }, (_, i) => ({
      id: `h${i}`,
      type: "trait_hypothesis" as const,
      currentConfidence: 0.9,
    }));
    const decays = computeNarrativeRevisionCascade("valence_flip", manyEntries);
    const total = decays.reduce((sum, d) => sum + Math.abs(d.confidenceDelta), 0);
    expect(total).toBeLessThanOrEqual(0.2 + 0.001); // 浮動小数点誤差許容
  });

  it("currentConfidence が低い → confidence を 0 未満にしない", () => {
    const lowConf = [{ id: "h1", type: "trait_hypothesis" as const, currentConfidence: 0.05 }];
    const decays = computeNarrativeRevisionCascade("valence_flip", lowConf);
    expect(decays[0].confidenceDelta).toBeGreaterThanOrEqual(-0.05);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 8. Contradiction Cascade
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeContradictionCascade()", () => {
  const entries = [
    { id: "h1", type: "trait_hypothesis" as const, currentConfidence: 0.7 },
  ];

  it("dualityStrength < 0.3 → cascade なし", () => {
    const decays = computeContradictionCascade(0.2, entries);
    expect(decays).toHaveLength(0);
  });

  it("dualityStrength=0.5 → 穏やかな decay", () => {
    const decays = computeContradictionCascade(0.5, entries);
    expect(decays).toHaveLength(1);
    // 0.5 × 0.05 = 0.025
    expect(decays[0].confidenceDelta).toBeCloseTo(-0.025);
  });

  it("dualityStrength=1.0 → 最大 decay", () => {
    const decays = computeContradictionCascade(1.0, entries);
    // 1.0 × 0.05 = 0.05
    expect(decays[0].confidenceDelta).toBeCloseTo(-0.05);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 9. Batch Processing
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyMemoryPolicy()", () => {
  it("active / tentative / candidate / weakening を正しく分類", () => {
    const entries = new Map<string, MemoryEntry>();
    entries.set("active-1", makeEntry({ evidenceCount: 5 }));
    entries.set("tentative-1", makeEntry({ evidenceCount: 2 }));
    entries.set("candidate-1", makeEntry({ evidenceCount: 1 }));
    entries.set("weakening-1", makeEntry({ evidenceCount: 3, counterEvidenceCount: 5 }));

    const result = applyMemoryPolicy(entries, null, NOW);

    expect(result.weights.get("active-1")?.stage).toBe("active");
    expect(result.weights.get("tentative-1")?.stage).toBe("tentative");
    expect(result.weights.get("candidate-1")?.stage).toBe("candidate");
    expect(result.weights.get("weakening-1")?.stage).toBe("weakening");

    // candidate は excluded
    expect(result.excluded).toContain("candidate-1");
    // active, tentative, weakening は includable
    expect(result.includable.map(i => i.id)).toContain("active-1");
    expect(result.includable.map(i => i.id)).toContain("tentative-1");
    expect(result.includable.map(i => i.id)).toContain("weakening-1");
  });

  it("遷移検出: tentative → active", () => {
    const entries = new Map<string, MemoryEntry>();
    entries.set("h1", makeEntry({ evidenceCount: 5 }));

    const prevStages = new Map<string, LifecycleStage>();
    prevStages.set("h1", "tentative");

    const result = applyMemoryPolicy(entries, prevStages, NOW);
    expect(result.transitions).toHaveLength(1);
    expect(result.transitions[0].from).toBe("tentative");
    expect(result.transitions[0].to).toBe("active");
  });

  it("includable は weight 順でソート", () => {
    const entries = new Map<string, MemoryEntry>();
    entries.set("low", makeEntry({ evidenceCount: 2, counterEvidenceCount: 1 }));
    entries.set("high", makeEntry({ evidenceCount: 10, counterEvidenceCount: 0 }));

    const result = applyMemoryPolicy(entries, null, NOW);
    expect(result.includable[0].id).toBe("high");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 10. Analytics
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildMemoryPolicyAnalytics()", () => {
  it("全フィールドを記録", () => {
    const entries = new Map<string, MemoryEntry>();
    entries.set("h1", makeEntry());
    entries.set("h2", makeEntry({ evidenceCount: 1 }));

    const result = applyMemoryPolicy(entries, null, NOW);
    const cascades = [{ targetType: "trait_hypothesis" as const, confidenceDelta: -0.1, reason: "test" }];
    const analytics = buildMemoryPolicyAnalytics(result, cascades);

    expect(analytics.memory_total_entries).toBe(2);
    expect(analytics.memory_cascade_decays).toBe(1);
    expect(analytics.memory_cascade_total_delta).toBe(-0.1);
  });
});
