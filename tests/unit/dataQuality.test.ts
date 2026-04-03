import { describe, it, expect } from "vitest";
import {
  computeDataQuality,
  computeAxisConfidence,
  type DataQualityScore,
} from "@/lib/stargazer/validation/dataQuality";

describe("dataQuality", () => {
  // ── computeDataQuality ──

  describe("computeDataQuality", () => {
    it("観測ゼロで最低品質を返す", () => {
      const result = computeDataQuality({
        totalObservations: 0,
        axisScores: {},
        observedAxesCount: 0,
        daysSinceFirstObservation: 0,
      });
      expect(result.overall).toBe(0);
      expect(result.level).toBe("low");
      expect(result.levelLabel).toBe("観測開始直後");
    });

    it("sampleSize は 1000 観測で 1.0 に到達", () => {
      const result = computeDataQuality({
        totalObservations: 1000,
        axisScores: { introvert_vs_extrovert: 0.5 } as never,
        observedAxesCount: 1,
        daysSinceFirstObservation: 1,
      });
      expect(result.dimensions.sampleSize).toBeCloseTo(1.0, 2);
    });

    it("sampleSize は 500 観測で 0.5", () => {
      const result = computeDataQuality({
        totalObservations: 500,
        axisScores: {},
        observedAxesCount: 0,
        daysSinceFirstObservation: 1,
      });
      expect(result.dimensions.sampleSize).toBeCloseTo(0.5, 2);
    });

    it("temporalCoverage は 365 日で 1.0 に到達", () => {
      const result = computeDataQuality({
        totalObservations: 365,
        axisScores: {},
        observedAxesCount: 0,
        daysSinceFirstObservation: 365,
        observationDays: 365,
      });
      expect(result.dimensions.temporalCoverage).toBeCloseTo(1.0, 2);
    });

    it("axisCoverage は 33 軸で 1.0", () => {
      const result = computeDataQuality({
        totalObservations: 100,
        axisScores: {},
        observedAxesCount: 33,
        daysSinceFirstObservation: 30,
      });
      expect(result.dimensions.axisCoverage).toBeCloseTo(1.0, 2);
    });

    it("internalConsistency は標準偏差 0.3 で 1.0", () => {
      // 値が [0.0, 0.6] なら stdDev = 0.3
      const result = computeDataQuality({
        totalObservations: 10,
        axisScores: {
          introvert_vs_extrovert: 0.0,
          cautious_vs_bold: 0.6,
        } as never,
        observedAxesCount: 2,
        daysSinceFirstObservation: 5,
      });
      expect(result.dimensions.internalConsistency).toBeCloseTo(1.0, 2);
    });

    it("全パラメータが最大値で excellent を返す", () => {
      // 十分なスコアのばらつきを持つ33軸のデータ
      const axisScores: Record<string, number> = {};
      for (let i = 0; i < 33; i++) {
        axisScores[`axis_${i}`] = (i % 3 - 1) * 0.5; // -0.5, 0, 0.5 を繰り返す
      }
      const result = computeDataQuality({
        totalObservations: 1000,
        axisScores: axisScores as never,
        observedAxesCount: 33,
        daysSinceFirstObservation: 365,
        observationDays: 365,
      });
      expect(result.overall).toBeGreaterThanOrEqual(0.75);
      expect(result.level).toBe("excellent");
      expect(result.levelLabel).toBe("十分");
    });

    it("overall は加重平均: 0.3*sample + 0.2*temporal + 0.25*axis + 0.25*consistency", () => {
      const result = computeDataQuality({
        totalObservations: 100,  // sampleSize = 0.5
        axisScores: { introvert_vs_extrovert: -0.5, cautious_vs_bold: 0.5 } as never,
        observedAxesCount: 16,   // axisCoverage ≈ 0.485
        daysSinceFirstObservation: 45, // temporalCoverage = 0.5
        observationDays: 45,
      });
      const d = result.dimensions;
      const expected =
        d.sampleSize * 0.3 +
        d.temporalCoverage * 0.2 +
        d.axisCoverage * 0.25 +
        d.internalConsistency * 0.25;
      expect(result.overall).toBeCloseTo(expected, 5);
    });

    it("品質レベルの閾値が正しい: low < 0.25, moderate < 0.50, high < 0.75, excellent", () => {
      // 非常に少ないデータで low を確認 (consistency = 0 にするため axisScores は空)
      const lowResult = computeDataQuality({
        totalObservations: 5,
        axisScores: {} as never,
        observedAxesCount: 1,
        daysSinceFirstObservation: 2,
        observationDays: 2,
      });
      expect(lowResult.level).toBe("low");
      // moderate: overall >= 0.25 && < 0.50
      const modResult = computeDataQuality({
        totalObservations: 300,
        axisScores: { introvert_vs_extrovert: 0.5, cautious_vs_bold: -0.5 } as never,
        observedAxesCount: 10,
        daysSinceFirstObservation: 100,
        observationDays: 100,
      });
      expect(modResult.level).toBe("moderate");
    });

    it("advice は弱い次元に対して最大3件返す", () => {
      const result = computeDataQuality({
        totalObservations: 10,
        axisScores: {},
        observedAxesCount: 2,
        daysSinceFirstObservation: 3,
      });
      expect(result.advice.length).toBeGreaterThan(0);
      expect(result.advice.length).toBeLessThanOrEqual(3);
    });

    it("全次元が高品質なら advice は空", () => {
      const axisScores: Record<string, number> = {};
      for (let i = 0; i < 33; i++) {
        axisScores[`axis_${i}`] = (i % 3 - 1) * 0.5;
      }
      const result = computeDataQuality({
        totalObservations: 1000,
        axisScores: axisScores as never,
        observedAxesCount: 33,
        daysSinceFirstObservation: 365,
        observationDays: 365,
      });
      expect(result.advice).toHaveLength(0);
    });
  });

  // ── computeAxisConfidence ──

  describe("computeAxisConfidence", () => {
    it("dataPoints 0 で confidence 0、ラベル「推定」", () => {
      const result = computeAxisConfidence({
        axisId: "introvert_vs_extrovert" as never,
        dataPoints: 0,
      });
      expect(result.confidence).toBe(0);
      expect(result.label).toBe("推定");
    });

    it("dataPoints 5 以上で confidence 1.0（分散なし）", () => {
      const result = computeAxisConfidence({
        axisId: "introvert_vs_extrovert" as never,
        dataPoints: 5,
      });
      expect(result.confidence).toBe(1.0);
      expect(result.label).toBe("確信");
    });

    it("高分散で信頼度が 20% 減少", () => {
      const normal = computeAxisConfidence({
        axisId: "introvert_vs_extrovert" as never,
        dataPoints: 3,
      });
      const highVariance = computeAxisConfidence({
        axisId: "introvert_vs_extrovert" as never,
        dataPoints: 3,
        scoreVariance: 0.8,
      });
      expect(highVariance.confidence).toBeCloseTo(normal.confidence * 0.8, 5);
    });

    it("信頼度ラベル: 確信(>=0.85), 信頼(>=0.60), 暫定(>=0.30), 推定(<0.30)", () => {
      expect(
        computeAxisConfidence({ axisId: "introvert_vs_extrovert" as never, dataPoints: 5 }).label
      ).toBe("確信");
      expect(
        computeAxisConfidence({ axisId: "introvert_vs_extrovert" as never, dataPoints: 4 }).label
      ).toBe("信頼"); // 4/5 = 0.8
      expect(
        computeAxisConfidence({ axisId: "introvert_vs_extrovert" as never, dataPoints: 2 }).label
      ).toBe("暫定"); // 2/5 = 0.4
      expect(
        computeAxisConfidence({ axisId: "introvert_vs_extrovert" as never, dataPoints: 1 }).label
      ).toBe("推定"); // 1/5 = 0.2
    });

    it("dataPoints が非常に大きくても confidence は 1.0 を超えない", () => {
      const result = computeAxisConfidence({
        axisId: "introvert_vs_extrovert" as never,
        dataPoints: 10000,
      });
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });
});
