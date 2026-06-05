import { describe, it, expect } from "vitest";

import {
  computeCellContentStats,
  cellContentScore,
} from "../../../../lib/plan/shift/cellContentMetric";

function fill(rgb: [number, number, number], n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(rgb[0], rgb[1], rgb[2]);
  return out;
}

describe("cellContentMetric / computeCellContentStats", () => {
  it("空入力 → 全 0", () => {
    const s = computeCellContentStats([]);
    expect(s).toEqual({ pixelCount: 0, satRatio: 0, rednessRatio: 0, darkRatio: 0 });
    expect(cellContentScore(s)).toBe(0);
  });

  it("白 pixel → content なし（score 0）", () => {
    const s = computeCellContentStats(fill([255, 255, 255], 20));
    expect(s.satRatio).toBe(0);
    expect(s.rednessRatio).toBe(0);
    expect(s.darkRatio).toBe(0);
    expect(cellContentScore(s)).toBe(0);
  });

  it("灰色の紙テクスチャ → 棄却（score 0）", () => {
    const s = computeCellContentStats(fill([200, 200, 200], 20));
    expect(cellContentScore(s)).toBe(0);
  });

  it("色付きセル（水色 L）→ 高彩度", () => {
    const s = computeCellContentStats(fill([150, 200, 240], 20));
    expect(s.satRatio).toBe(1);
    expect(cellContentScore(s)).toBe(1);
  });

  it("白セルの赤文字（H/HREQ）→ 赤チャネル優位を検出", () => {
    // 半分白 + 半分赤文字
    const s = computeCellContentStats([
      ...fill([255, 255, 255], 10),
      ...fill([200, 40, 40], 10),
    ]);
    expect(s.rednessRatio).toBeCloseTo(0.5, 5);
    expect(cellContentScore(s)).toBeGreaterThanOrEqual(0.5);
  });

  it("黒インク → 暗インクを検出", () => {
    const s = computeCellContentStats(fill([0, 0, 0], 20));
    expect(s.darkRatio).toBe(1);
    expect(cellContentScore(s)).toBe(1);
  });

  it("閾値を尊重する（satFloor）", () => {
    const px = fill([180, 140, 150], 10); // saturation ≈ 0.222
    const lenient = computeCellContentStats(px, { satFloor: 0.1, redFloor: 0.9, darkCeil: 0.05 });
    const strict = computeCellContentStats(px, { satFloor: 0.9, redFloor: 0.9, darkCeil: 0.05 });
    expect(lenient.satRatio).toBe(1);
    expect(strict.satRatio).toBe(0);
  });

  it("byte 範囲外を clamp する（throw しない）", () => {
    const s = computeCellContentStats([300, -5, 999, 0, 0, 0]);
    expect(s.pixelCount).toBe(2);
    expect(Number.isFinite(s.satRatio)).toBe(true);
  });
});

describe("cellContentMetric / cellContentScore", () => {
  it("3 比率の max を返す", () => {
    expect(
      cellContentScore({ pixelCount: 10, satRatio: 0.2, rednessRatio: 0.5, darkRatio: 0.1 })
    ).toBe(0.5);
  });

  it("pixelCount 0 → 0", () => {
    expect(cellContentScore({ pixelCount: 0, satRatio: 1, rednessRatio: 1, darkRatio: 1 })).toBe(0);
  });
});
