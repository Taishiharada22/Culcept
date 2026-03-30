import { describe, it, expect } from "vitest";
import {
  calculateCFV,
  getCFVLevel,
  getCFVLabel,
  getCFVColor,
  getCFVAdvice,
  formatCFVDisplay,
  type CFVInput,
  type CFVLevel,
} from "@/lib/stargazer/validation/cfvScale";

describe("cfvScale", () => {
  // ── calculateCFV ──

  describe("calculateCFV", () => {
    it("全てゼロで overall 0、estimated レベル", () => {
      const result = calculateCFV({ confidence: 0, fidelity: 0, validity: 0 });
      expect(result.overall).toBe(0);
      expect(result.level).toBe("estimated");
      expect(result.label).toBe("推定");
    });

    it("全て 1.0 で overall 1.0、confirmed レベル", () => {
      const result = calculateCFV({ confidence: 1, fidelity: 1, validity: 1 });
      expect(result.overall).toBeCloseTo(1.0, 5);
      expect(result.level).toBe("confirmed");
      expect(result.label).toBe("確信");
    });

    it("重み配分が正しい: 0.40*C + 0.35*F + 0.25*V", () => {
      const result = calculateCFV({
        confidence: 0.8,
        fidelity: 0.6,
        validity: 0.4,
      });
      const expected = 0.8 * 0.4 + 0.6 * 0.35 + 0.4 * 0.25;
      expect(result.overall).toBeCloseTo(expected, 5);
    });

    it("入力値は 0-1 にクランプされる", () => {
      const result = calculateCFV({
        confidence: 1.5,
        fidelity: -0.3,
        validity: 2.0,
      });
      expect(result.confidence).toBe(1);
      expect(result.fidelity).toBe(0);
      expect(result.validity).toBe(1);
      // overall = 1*0.4 + 0*0.35 + 1*0.25 = 0.65
      expect(result.overall).toBeCloseTo(0.65, 5);
    });

    it("境界値: overall >= 0.85 で confirmed", () => {
      // 十分高い値で confirmed を確実に得る
      const result = calculateCFV({
        confidence: 1.0,
        fidelity: 1.0,
        validity: 0.6,
      });
      // 1*0.4 + 1*0.35 + 0.6*0.25 = 0.90
      expect(result.overall).toBeGreaterThanOrEqual(0.85);
      expect(result.level).toBe("confirmed");
    });

    it("境界値: overall = 0.60 で trusted", () => {
      const result = calculateCFV({
        confidence: 0.6,
        fidelity: 0.6,
        validity: 0.6,
      });
      expect(result.overall).toBeCloseTo(0.6, 2);
      expect(result.level).toBe("trusted");
    });

    it("境界値: overall = 0.30 で provisional", () => {
      const result = calculateCFV({
        confidence: 0.3,
        fidelity: 0.3,
        validity: 0.3,
      });
      expect(result.overall).toBeCloseTo(0.3, 2);
      expect(result.level).toBe("provisional");
    });

    it("境界値: overall = 0.29 で estimated", () => {
      const result = calculateCFV({
        confidence: 0.29,
        fidelity: 0.29,
        validity: 0.29,
      });
      expect(result.level).toBe("estimated");
    });
  });

  // ── getCFVLevel ──

  describe("getCFVLevel", () => {
    it("各閾値で正しいレベルを返す", () => {
      expect(getCFVLevel(1.0)).toBe("confirmed");
      expect(getCFVLevel(0.85)).toBe("confirmed");
      expect(getCFVLevel(0.84)).toBe("trusted");
      expect(getCFVLevel(0.60)).toBe("trusted");
      expect(getCFVLevel(0.59)).toBe("provisional");
      expect(getCFVLevel(0.30)).toBe("provisional");
      expect(getCFVLevel(0.29)).toBe("estimated");
      expect(getCFVLevel(0.0)).toBe("estimated");
    });

    it("範囲外の値もクランプして処理する", () => {
      expect(getCFVLevel(1.5)).toBe("confirmed");
      expect(getCFVLevel(-0.1)).toBe("estimated");
    });
  });

  // ── getCFVLabel ──

  describe("getCFVLabel", () => {
    it("全レベルの日本語ラベルが正しい", () => {
      expect(getCFVLabel("confirmed")).toBe("確信");
      expect(getCFVLabel("trusted")).toBe("信頼");
      expect(getCFVLabel("provisional")).toBe("暫定");
      expect(getCFVLabel("estimated")).toBe("推定");
    });
  });

  // ── getCFVColor ──

  describe("getCFVColor", () => {
    it("全レベルに色が定義されている", () => {
      const levels: CFVLevel[] = ["confirmed", "trusted", "provisional", "estimated"];
      for (const level of levels) {
        const color = getCFVColor(level);
        expect(color).toMatch(/^rgba\(/);
      }
    });
  });

  // ── formatCFVDisplay ──

  describe("formatCFVDisplay", () => {
    it("正しいフォーマットで表示文字列を返す", () => {
      const cfv = calculateCFV({ confidence: 0.72, fidelity: 0.65, validity: 0.48 });
      const display = formatCFVDisplay(cfv);
      expect(display).toMatch(/^.+ \(C:\d+\.\d+ F:\d+\.\d+ V:\d+\.\d+ = \d+\.\d+\)$/);
    });
  });

  // ── getCFVAdvice ──

  describe("getCFVAdvice", () => {
    it("弱い次元に対してアドバイスを返す", () => {
      const cfv = calculateCFV({ confidence: 0.3, fidelity: 0.2, validity: 0.1 });
      const advice = getCFVAdvice(cfv);
      expect(advice.length).toBeGreaterThan(0);
      expect(advice.length).toBeLessThanOrEqual(3);
    });

    it("全次元が 0.7 以上ならアドバイス空", () => {
      const cfv = calculateCFV({ confidence: 0.8, fidelity: 0.8, validity: 0.8 });
      const advice = getCFVAdvice(cfv);
      expect(advice).toHaveLength(0);
    });

    it("最も弱い次元から順にアドバイスが並ぶ", () => {
      const cfv = calculateCFV({ confidence: 0.2, fidelity: 0.5, validity: 0.1 });
      const advice = getCFVAdvice(cfv);
      // validity が最弱、次に confidence
      expect(advice[0]).toContain("行動予測");
      expect(advice[1]).toContain("観測を続ける");
    });
  });
});
