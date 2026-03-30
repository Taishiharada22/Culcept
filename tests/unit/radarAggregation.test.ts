import { describe, it, expect } from "vitest";
import {
  aggregateRadarDimensions,
  getRadarDimensionDescription,
  type RadarDimension,
} from "@/lib/stargazer/radarAggregation";
import type { TraitAxisKey } from "@/lib/stargazer/traitAxes";

describe("radarAggregation", () => {
  // ── aggregateRadarDimensions ──

  describe("aggregateRadarDimensions", () => {
    it("空入力で全8次元のスコアが 0", () => {
      const result = aggregateRadarDimensions({});
      expect(result).toHaveLength(8);
      for (const dim of result) {
        expect(dim.score).toBe(0);
        expect(dim.axisCount).toBe(0);
      }
    });

    it("全8次元が存在する", () => {
      const result = aggregateRadarDimensions({});
      const keys = result.map((d) => d.key);
      expect(keys).toContain("thinking");
      expect(keys).toContain("action");
      expect(keys).toContain("sociality");
      expect(keys).toContain("distance");
      expect(keys).toContain("emotion");
      expect(keys).toContain("recovery");
      expect(keys).toContain("expression");
      expect(keys).toContain("depth");
    });

    it("thinking 次元は analytical, plan, perfectionist の3軸を集約", () => {
      const result = aggregateRadarDimensions({
        analytical_vs_intuitive: 0.6,
        plan_vs_spontaneous: -0.4,
        perfectionist_vs_pragmatic: 0.8,
      });
      const thinking = result.find((d) => d.key === "thinking")!;
      // 絶対値平均: (0.6 + 0.4 + 0.8) / 3 = 0.6 → 60
      expect(thinking.score).toBe(60);
      expect(thinking.axisCount).toBe(3);
    });

    it("recovery 次元は 2 軸を集約", () => {
      const result = aggregateRadarDimensions({
        stress_isolation_vs_social: -0.5,
        change_embrace_vs_resist: 0.3,
      });
      const recovery = result.find((d) => d.key === "recovery")!;
      // 絶対値平均: (0.5 + 0.3) / 2 = 0.4 → 40
      expect(recovery.score).toBe(40);
      expect(recovery.axisCount).toBe(2);
    });

    it("スコアが 100 を超えない（キャップ）", () => {
      const result = aggregateRadarDimensions({
        analytical_vs_intuitive: 1.0,
        plan_vs_spontaneous: 1.0,
        perfectionist_vs_pragmatic: 1.0,
      });
      const thinking = result.find((d) => d.key === "thinking")!;
      // 絶対値平均: (1.0+1.0+1.0)/3 = 1.0 → 100
      expect(thinking.score).toBeLessThanOrEqual(100);
    });

    it("0 のスコアはカウントから除外される", () => {
      const result = aggregateRadarDimensions({
        analytical_vs_intuitive: 0.6,
        plan_vs_spontaneous: 0, // これは除外される
        perfectionist_vs_pragmatic: 0.4,
      });
      const thinking = result.find((d) => d.key === "thinking")!;
      // 0 は除外: (0.6 + 0.4) / 2 = 0.5 → 50
      expect(thinking.score).toBe(50);
      expect(thinking.axisCount).toBe(2);
    });

    it("一部の軸だけ存在する場合でも正しく集約", () => {
      const result = aggregateRadarDimensions({
        introvert_vs_extrovert: 0.7,
      });
      const action = result.find((d) => d.key === "action")!;
      // introvert_vs_extrovert のみ: 0.7 → 70
      expect(action.score).toBe(70);
      expect(action.axisCount).toBe(1);
    });

    it("負のスコアは絶対値で集約される", () => {
      const result = aggregateRadarDimensions({
        analytical_vs_intuitive: -0.8,
      });
      const thinking = result.find((d) => d.key === "thinking")!;
      expect(thinking.score).toBe(80); // abs(-0.8) * 100
    });

    it("各次元に日本語ラベルが存在する", () => {
      const result = aggregateRadarDimensions({});
      const labels = result.map((d) => d.label);
      expect(labels).toContain("思考");
      expect(labels).toContain("行動");
      expect(labels).toContain("社交");
      expect(labels).toContain("距離感");
      expect(labels).toContain("感情");
      expect(labels).toContain("回復");
      expect(labels).toContain("表現");
      expect(labels).toContain("深度");
    });
  });

  // ── getRadarDimensionDescription ──

  describe("getRadarDimensionDescription", () => {
    it("有効なキーで説明を返す", () => {
      expect(getRadarDimensionDescription("thinking").length).toBeGreaterThan(0);
      expect(getRadarDimensionDescription("emotion").length).toBeGreaterThan(0);
    });

    it("未知のキーで空文字を返す", () => {
      expect(getRadarDimensionDescription("unknown")).toBe("");
    });
  });
});
