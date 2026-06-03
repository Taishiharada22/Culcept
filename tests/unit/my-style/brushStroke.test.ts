import { describe, it, expect } from "vitest";

import { interpolateStrokePoints, type StrokePoint } from "@/app/(immersive)/my-style/_lib/brushStroke";

function maxGap(from: StrokePoint, points: StrokePoint[]): number {
  let prev = from;
  let max = 0;
  for (const p of points) {
    max = Math.max(max, Math.hypot(p.x - prev.x, p.y - prev.y));
    prev = p;
  }
  return max;
}

describe("C1L-4c-a — interpolateStrokePoints", () => {
  it("① 離れた2点は線分を埋める（点ではなく複数点・終点を含む）", () => {
    const pts = interpolateStrokePoints({ x: 0, y: 0 }, { x: 10, y: 0 }, 4);
    expect(pts.length).toBeGreaterThan(1);
    expect(pts[pts.length - 1]).toEqual({ x: 10, y: 0 });
  });

  it("② 速いドラッグでも gap が step(=radius*0.35) 以下", () => {
    const radius = 4;
    const step = Math.max(1, radius * 0.35);
    const from = { x: 0, y: 0 };
    const pts = interpolateStrokePoints(from, { x: 100, y: 0 }, radius);
    expect(maxGap(from, pts)).toBeLessThanOrEqual(step + 1e-6);
  });

  it("③ brushRadius が大きいほど補間密度が下がる（点数が減る）", () => {
    const small = interpolateStrokePoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 4);
    const large = interpolateStrokePoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 40);
    expect(large.length).toBeLessThan(small.length);
  });

  it("④ タップ（from===to）は終点のみ [to]", () => {
    expect(interpolateStrokePoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10)).toEqual([{ x: 5, y: 5 }]);
  });

  it("⑤ step 以下の微小移動も終点のみ（過剰生成しない）", () => {
    const pts = interpolateStrokePoints({ x: 0, y: 0 }, { x: 0.5, y: 0 }, 10); // step=3.5
    expect(pts).toEqual([{ x: 0.5, y: 0 }]);
  });

  it("⑥ 斜め移動でも終点に到達し gap が抑えられる", () => {
    const from = { x: 0, y: 0 };
    const to = { x: 30, y: 40 }; // dist 50
    const radius = 6; // step=2.1
    const pts = interpolateStrokePoints(from, to, radius);
    expect(pts[pts.length - 1]).toEqual(to);
    expect(maxGap(from, pts)).toBeLessThanOrEqual(2.1 + 1e-6);
  });
});
