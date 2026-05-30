import { describe, it, expect } from "vitest";
import {
  cellCropRegion,
  HARADA_SPRIX_JULY_GEOMETRY,
  type ShiftGridGeometry,
} from "@/lib/plan/shift/shiftGridGeometry";

const GEO: ShiftGridGeometry = {
  imageWidth: 1000,
  imageHeight: 400,
  gridLeft: 100,
  colWidth: 30,
  cropTop: 50,
  cropHeight: 60,
};

describe("cellCropRegion", () => {
  it("day1 は gridLeft から", () => {
    expect(cellCropRegion(GEO, 1)).toEqual({
      x: 100,
      y: 50,
      width: 30,
      height: 60,
    });
  });

  it("day8 は gridLeft + 7*colWidth", () => {
    expect(cellCropRegion(GEO, 8).x).toBe(100 + 7 * 30);
  });

  it("画像右端を超える day は clamp される", () => {
    const r = cellCropRegion(GEO, 100); // 100 + 99*30 = 3070 > 1000
    expect(r.x).toBe(GEO.imageWidth - GEO.colWidth); // 970
  });

  it("cropTop が画像下端を超えても clamp される", () => {
    const tall: ShiftGridGeometry = { ...GEO, cropTop: 380, cropHeight: 60 };
    expect(cellCropRegion(tall, 1).y).toBe(400 - 60); // 340
  });
});

describe("HARADA_SPRIX_JULY_GEOMETRY", () => {
  it("1860x846 の calibration を持つ", () => {
    expect(HARADA_SPRIX_JULY_GEOMETRY.imageWidth).toBe(1860);
    expect(HARADA_SPRIX_JULY_GEOMETRY.imageHeight).toBe(846);
    const r = cellCropRegion(HARADA_SPRIX_JULY_GEOMETRY, 1);
    expect(r.x).toBe(275);
    expect(r.width).toBeCloseTo(51.5, 1);
  });

  it("day→column mapping は線形・単調（CEO 観測のドリフト再発防止）", () => {
    // 旧 gridLeft=400/colWidth=45.4 では day1→day3 のドリフトが出た。
    // 正しい geometry では day N の x は単調増加し、隣接日は colWidth 分だけ離れる。
    // ※ 末尾 day31 は画像右端で clamp されるため、未 clamp 区間(1〜30)で検証。
    const g = HARADA_SPRIX_JULY_GEOMETRY;
    for (let d = 1; d < 30; d += 1) {
      const a = cellCropRegion(g, d).x;
      const b = cellCropRegion(g, d + 1).x;
      expect(b - a).toBeCloseTo(g.colWidth, 5);
    }
  });
});
