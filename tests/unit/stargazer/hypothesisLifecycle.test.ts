/**
 * updateHypothesisStatus() — 仮説ライフサイクル状態機械のユニットテスト
 *
 * テスト対象:
 * 1. weakening → strengthening 回復パス（新規追加）
 * 2. weakening のまま回復しないケース（回復条件未達）
 * 3. 従来の strengthening 条件が他状態で壊れていないこと
 */
import { describe, it, expect } from "vitest";
import {
  updateHypothesisStatus,
  type AlterHypothesis,
} from "@/lib/stargazer/alterUnderstanding";

function makeHypothesis(
  overrides: Partial<AlterHypothesis> = {},
): AlterHypothesis {
  return {
    id: "test-id",
    hypothesis_type: "recurring_pattern",
    content: "テスト仮説",
    evidence_summary: "テスト証拠",
    domains: ["career"],
    confidence: 0.4,
    evidence_count: 5,
    status: "emerging",
    required_trust: 2,
    last_evaluated: new Date().toISOString(),
    presented_count: 0,
    ...overrides,
  };
}

describe("updateHypothesisStatus — weakening recovery", () => {
  it("weakening → strengthening: 回復条件を満たす場合", () => {
    const current = makeHypothesis({
      status: "weakening",
      confidence: 0.3,
      evidence_count: 6,
    });
    // evidenceDirection = 0.6 - 0.3 = 0.3 (> 0.25) ✓
    // totalEvidence = 6 + 2 = 8 (>= 8) ✓
    const result = updateHypothesisStatus(current, {
      confidence: 0.6,
      evidence_count: 2,
    });

    expect(result.newStatus).toBe("strengthening");
    expect(result.growthSignal).not.toBeNull();
    expect(result.growthSignal!.type).toBe("pattern_shift");
    expect(result.growthSignal!.description).toContain("回復");
    expect(result.growthSignal!.evidence).toContain("evidenceDirection");
    expect(result.growthSignal!.evidence).toContain("totalEvidence");
  });

  it("weakening のまま: evidenceDirection が 0.25 以下", () => {
    const current = makeHypothesis({
      status: "weakening",
      confidence: 0.3,
      evidence_count: 6,
    });
    // evidenceDirection = 0.5 - 0.3 = 0.2 (<= 0.25) ✗
    // totalEvidence = 6 + 2 = 8 (>= 8) ✓
    const result = updateHypothesisStatus(current, {
      confidence: 0.5,
      evidence_count: 2,
    });

    expect(result.newStatus).toBe("weakening");
  });

  it("weakening のまま: totalEvidence が 8 未満", () => {
    const current = makeHypothesis({
      status: "weakening",
      confidence: 0.3,
      evidence_count: 4,
    });
    // evidenceDirection = 0.6 - 0.3 = 0.3 (> 0.25) ✓
    // totalEvidence = 4 + 2 = 6 (< 8) ✗
    const result = updateHypothesisStatus(current, {
      confidence: 0.6,
      evidence_count: 2,
    });

    expect(result.newStatus).toBe("weakening");
  });
});

describe("updateHypothesisStatus — existing transitions preserved", () => {
  it("emerging → strengthening: 従来条件 (evidenceDirection > 0.15, totalEvidence >= 5)", () => {
    const current = makeHypothesis({
      status: "emerging",
      confidence: 0.4,
      evidence_count: 3,
    });
    // evidenceDirection = 0.6 - 0.4 = 0.2 (> 0.15) ✓
    // totalEvidence = 3 + 2 = 5 (>= 5) ✓
    const result = updateHypothesisStatus(current, {
      confidence: 0.6,
      evidence_count: 2,
    });

    expect(result.newStatus).toBe("strengthening");
  });

  it("emerging → weakening: evidenceDirection < -0.2", () => {
    const current = makeHypothesis({
      status: "emerging",
      confidence: 0.6,
      evidence_count: 3,
    });
    // evidenceDirection = 0.3 - 0.6 = -0.3 (< -0.2) ✓
    const result = updateHypothesisStatus(current, {
      confidence: 0.3,
      evidence_count: 2,
    });

    expect(result.newStatus).toBe("weakening");
    expect(result.growthSignal).not.toBeNull();
  });

  it("stable のまま: 安定条件を満たす (totalEvidence >= 10, |direction| <= 0.1, confidence >= 0.5)", () => {
    const current = makeHypothesis({
      status: "stable",
      confidence: 0.6,
      evidence_count: 8,
    });
    // evidenceDirection = 0.65 - 0.6 = 0.05 (|0.05| <= 0.1) ✓
    // totalEvidence = 8 + 3 = 11 (>= 10) ✓
    // newConfidence ≈ (0.6*8 + 0.65*3) / 11 ≈ 0.614 (>= 0.5) ✓
    const result = updateHypothesisStatus(current, {
      confidence: 0.65,
      evidence_count: 3,
    });

    expect(result.newStatus).toBe("stable");
  });

  it("retired: 信頼度が十分に低い場合", () => {
    const current = makeHypothesis({
      status: "emerging",
      confidence: 0.2,
      evidence_count: 4,
    });
    // newConfidence ≈ (0.2*4 + 0.1*2) / 6 ≈ 0.167 (< 0.2) ✓
    // totalEvidence = 6 (>= 5) ✓
    const result = updateHypothesisStatus(current, {
      confidence: 0.1,
      evidence_count: 2,
    });

    expect(result.newStatus).toBe("retired");
  });
});
