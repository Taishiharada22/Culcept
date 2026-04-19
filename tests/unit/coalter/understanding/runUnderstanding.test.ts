/**
 * runUnderstanding end-to-end: Mature / Sparse fixture で outcome を固定する。
 */

import { describe, it, expect } from "vitest";
import { runUnderstanding } from "@/lib/coalter/understanding/index";
import { MATURE_BUNDLE, SPARSE_BUNDLE } from "./fixtures/pairs";

const FIXED_NOW = "2026-04-20T12:00:00Z";

describe("runUnderstanding — end-to-end", () => {
  it("Mature bundle → outcome success + confidence >= 0.5", async () => {
    const lens = await runUnderstanding(MATURE_BUNDLE, FIXED_NOW, "p_mature");
    expect(lens.understanding_confidence).toBeGreaterThanOrEqual(0.5);
    expect(lens.lensVersion).toBe("1.0.0");
    expect(lens.personalLenses.a.coreDecisionPrinciples.length).toBeGreaterThanOrEqual(3);
    expect(lens.personalLenses.b.coreDecisionPrinciples.length).toBeGreaterThanOrEqual(3);
    expect(lens.todayReading.mode).toBeDefined();
    expect(lens.fairnessAdjustment.basedOnSessionCount).toBeGreaterThan(0);
    expect(lens.computedAt).toBe(FIXED_NOW);
  });

  it("Sparse bundle → 0 本 principles + 大量の dataGaps", async () => {
    const lens = await runUnderstanding(SPARSE_BUNDLE, FIXED_NOW, "p_sparse");
    expect(lens.personalLenses.a.coreDecisionPrinciples).toEqual([]);
    expect(lens.personalLenses.b.coreDecisionPrinciples).toEqual([]);
    expect(lens.dataGaps.length).toBeGreaterThanOrEqual(4);
    expect(lens.fairnessAdjustment.favorSide).toBeNull(); // ledger 空 + caring 対称
  });

  it("決定論: 同 bundle + 同 now で 2 回実行 deep equal", async () => {
    const r1 = await runUnderstanding(MATURE_BUNDLE, FIXED_NOW, "p_mature");
    const r2 = await runUnderstanding(MATURE_BUNDLE, FIXED_NOW, "p_mature");
    expect(r2).toEqual(r1);
  });
});

describe("runUnderstanding — fairness", () => {
  it("Mature fairnessLedger: 過去 A 寄り → B 補正を返す", async () => {
    const lens = await runUnderstanding(MATURE_BUNDLE, FIXED_NOW, "p_mature");
    // Mature fixture の ledger: [-0.5, 0.3, -0.4] (weighted mean → -0.2 付近、B 補正)
    expect(lens.fairnessAdjustment.favorSide).toBe("b");
    expect(lens.fairnessAdjustment.strength).toBeGreaterThan(0);
    expect(lens.fairnessAdjustment.rationale).toContain("加重平均");
  });
});
