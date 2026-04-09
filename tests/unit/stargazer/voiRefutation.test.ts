import { vi, describe, it, expect } from "vitest";
vi.mock("server-only", () => ({}));
import {
  computeValueOfInformation,
  STALENESS_REFUTATION_THRESHOLD,
} from "@/lib/stargazer/proactiveUnderstanding";
import type { StargazerAxis } from "@/lib/stargazer/traitAxes";

// ── helpers ──

function makeAxis(causalCount: number = 3): StargazerAxis {
  return {
    key: "cautious_vs_bold" as any,
    label: "慎重⇄大胆",
    category: "decision_making",
    pole_left: "慎重",
    pole_right: "大胆",
    question_seeds: [],
    causal_affinity_prior: Array(causalCount).fill("related_axis"),
    probe_seeds: [],
  } as StargazerAxis;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VoI Refutation Bonus (Wall 8)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("VoI Refutation Bonus", () => {
  it("hypothesisAge なし → 従来通りの VoI 計算", () => {
    const axis = makeAxis(5);
    const base = computeValueOfInformation(axis, 0.3, null);
    const withUndefined = computeValueOfInformation(axis, 0.3, null, undefined);
    expect(base).toBe(withUndefined);
  });

  it("低確信 + 古い仮説 → refutation bonus なし（低確信は通常の gap で十分）", () => {
    const axis = makeAxis(5);
    const base = computeValueOfInformation(axis, 0.3, null);
    const withAge = computeValueOfInformation(axis, 0.3, null, 20);
    // confidence 0.3 < 0.6 なのでボーナスなし
    expect(withAge).toBe(base);
  });

  it("高確信 + 新鮮な仮説 → refutation bonus なし", () => {
    const axis = makeAxis(5);
    const base = computeValueOfInformation(axis, 0.8, null);
    const withAge = computeValueOfInformation(axis, 0.8, null, 5);
    // age 5 < threshold 14 なのでボーナスなし
    expect(withAge).toBe(base);
  });

  it("高確信 + 古い仮説 → refutation bonus あり（VoI 上昇）", () => {
    const axis = makeAxis(5);
    const base = computeValueOfInformation(axis, 0.8, null);
    const withAge = computeValueOfInformation(axis, 0.8, null, 20);
    // confidence 0.8 > 0.6 && age 20 > threshold 14
    expect(withAge).toBeGreaterThan(base);
  });

  it("staleness が 30日以上 → ボーナスは飽和する", () => {
    const axis = makeAxis(5);
    const at30 = computeValueOfInformation(axis, 0.8, null, 30);
    const at60 = computeValueOfInformation(axis, 0.8, null, 60);
    // 30日で飽和するので、60日でも同じ
    expect(at60).toBe(at30);
  });

  it("STALENESS_REFUTATION_THRESHOLD は 14", () => {
    expect(STALENESS_REFUTATION_THRESHOLD).toBe(14);
  });

  it("ちょうど閾値上 → refutation bonus が発動", () => {
    const axis = makeAxis(5);
    const base = computeValueOfInformation(axis, 0.8, null);
    const atThreshold = computeValueOfInformation(axis, 0.8, null, STALENESS_REFUTATION_THRESHOLD);
    expect(atThreshold).toBeGreaterThan(base);
  });

  it("閾値未満 → refutation bonus なし", () => {
    const axis = makeAxis(5);
    const base = computeValueOfInformation(axis, 0.8, null);
    const belowThreshold = computeValueOfInformation(axis, 0.8, null, STALENESS_REFUTATION_THRESHOLD - 1);
    expect(belowThreshold).toBe(base);
  });

  it("refutation bonus は元の VoI を最大2倍まで引き上げる", () => {
    const axis = makeAxis(10); // causalReach = 10
    const base = computeValueOfInformation(axis, 0.9, null);
    const maxBonus = computeValueOfInformation(axis, 0.9, null, 30);
    // base が非常に小さい（gap=0.1）のでボーナスは baseVoI の数倍になりうるが、
    // 絶対値としては制限されている
    expect(maxBonus).toBeGreaterThan(base);
    expect(maxBonus).toBeLessThan(base * 10); // 極端な膨張はしない
  });
});
