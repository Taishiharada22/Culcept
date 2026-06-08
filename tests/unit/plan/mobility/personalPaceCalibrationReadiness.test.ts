import { describe, it, expect } from "vitest";
import {
  buildCalibrationReadiness,
  DEFAULT_PACE_CALIBRATION_CONFIG,
} from "@/lib/plan/mobility/personalPaceCalibrationReadiness";
import type { PersonalPaceRatioResult } from "@/lib/plan/mobility/personalPaceRatio";

function ready(n: number, i = 0): PersonalPaceRatioResult {
  return { groupKey: `od:g${i}|train`, odKey: `g${i}`, mode: "train", status: "ready", medianRatio: 1.2, tendency: "tends_longer", strength: "established", n };
}
const notEnoughSig: PersonalPaceRatioResult = { groupKey: "od:x|walk", odKey: "x", mode: "walk", status: "not_enough_signal", n: 5 };

describe("buildCalibrationReadiness — group 判定", () => {
  it("ready かつ n≥20 → calibrationReady", () => {
    expect(buildCalibrationReadiness([ready(20)]).groups[0].calibrationReady).toBe(true);
  });
  it("★n<20（activation 可でも calibration は不足）→ not calibrationReady", () => {
    expect(buildCalibrationReadiness([ready(8)]).groups[0].calibrationReady).toBe(false);
  });
  it("not_enough_signal → not calibrationReady", () => {
    expect(buildCalibrationReadiness([notEnoughSig]).groups[0].calibrationReady).toBe(false);
  });
});

describe("buildCalibrationReadiness — overall（★sparse は凍結継続）", () => {
  it("calibration-ready group が 3 つ以上 → ready_to_assess", () => {
    const r = buildCalibrationReadiness([ready(20, 0), ready(25, 1), ready(30, 2)]);
    expect(r.overall).toBe("ready_to_assess");
    expect(r.calibrationReadyCount).toBe(3);
  });
  it("2 group のみ → not_enough（凍結継続）", () => {
    expect(buildCalibrationReadiness([ready(20, 0), ready(25, 1)]).overall).toBe("not_enough");
  });
  it("★activation 可(n=8)でも calibration は not_enough（閾値分離）", () => {
    expect(buildCalibrationReadiness([ready(8, 0), ready(8, 1), ready(8, 2)]).overall).toBe("not_enough");
  });
  it("空 → not_enough", () => {
    expect(buildCalibrationReadiness([]).overall).toBe("not_enough");
  });
});

describe("buildCalibrationReadiness — 安全（値を出さない・凍結明示）", () => {
  it("note で値凍結・apply しないを明示", () => {
    expect(buildCalibrationReadiness([ready(20)]).note).toContain("凍結");
    expect(buildCalibrationReadiness([ready(20)]).note).toContain("apply しない");
  });
  it("★出力に閾値値（1.15/0.70 等の固定値）を含まない（status/件数のみ）", () => {
    const json = JSON.stringify(buildCalibrationReadiness([ready(20)]));
    expect(json).not.toContain("1.15");
    expect(json).not.toContain("0.7");
    expect(json).not.toContain("damping");
    expect(json).not.toContain("clamp");
  });
  it("calibration 閾値は activation(8)より厳しい", () => {
    expect(DEFAULT_PACE_CALIBRATION_CONFIG.minForCalibration).toBeGreaterThan(8);
  });
});
