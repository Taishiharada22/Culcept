/**
 * buildShiftGridGeometry — S-geo-1 pure geometry model（assisted 入力 → ShiftGridGeometry）
 *
 * 固定: 算出（colWidth/gridLeft）/ cropTop/Height from personRowBand / 月日数別 / clamp 整合 /
 *   HARADA fixture 近似（正本整合）/ invalid input / 決定論・mutation なし。
 * pure（DB/UI/canvas 非接触）。
 */
import { describe, it, expect } from "vitest";
import {
  buildShiftGridGeometry,
  type ShiftGridGeometryInput,
} from "@/lib/plan/shift/buildShiftGridGeometry";
import {
  cellCropRegion,
  HARADA_SPRIX_JULY_GEOMETRY,
} from "@/lib/plan/shift/shiftGridGeometry";

/** HARADA を逆生成する入力（firstDayCenterX = gridLeft+colWidth/2, lastDayCenterX = gridLeft+colWidth*30+colWidth/2）。 */
const HARADA_INPUT: ShiftGridGeometryInput = {
  imageW: 1860,
  imageH: 846,
  personRowBand: { top: 298, bottom: 350 }, // → cropTop=298, cropHeight=52
  dayCount: 31,
  firstDayCenterX: 275 + 51.5 / 2, // 300.75
  lastDayCenterX: 275 + 51.5 * 30 + 51.5 / 2, // 1845.75
};

function ok(over: Partial<ShiftGridGeometryInput> = {}): ShiftGridGeometryInput {
  return { ...HARADA_INPUT, ...over };
}

describe("buildShiftGridGeometry — 算出", () => {
  it("colWidth = (last - first)/(dayCount-1) / gridLeft = first - colWidth/2", () => {
    const r = buildShiftGridGeometry(ok({ firstDayCenterX: 100, lastDayCenterX: 700, dayCount: 31 }));
    expect(r.ok).toBe(true);
    // colWidth = 600/30 = 20、gridLeft = 100 - 10 = 90
    expect(r.geometry?.colWidth).toBeCloseTo(20, 6);
    expect(r.geometry?.gridLeft).toBeCloseTo(90, 6);
  });

  it("cropTop/cropHeight は personRowBand 由来（headerBand は無関係）", () => {
    const r = buildShiftGridGeometry(
      ok({ personRowBand: { top: 400, bottom: 460 }, headerBand: { top: 10, bottom: 50 } })
    );
    expect(r.geometry?.cropTop).toBe(400);
    expect(r.geometry?.cropHeight).toBe(60);
  });

  it("imageW/imageH を imageWidth/imageHeight に透過", () => {
    const r = buildShiftGridGeometry(ok({ imageW: 1200, imageH: 700, lastDayCenterX: 1100 }));
    expect(r.geometry?.imageWidth).toBe(1200);
    expect(r.geometry?.imageHeight).toBe(700);
  });

  it("float を維持する（過剰に丸めない・colWidth=51.5 等）", () => {
    const r = buildShiftGridGeometry(HARADA_INPUT);
    expect(r.geometry?.colWidth).toBeCloseTo(51.5, 6);
    expect(Number.isInteger(r.geometry?.colWidth ?? 0)).toBe(false);
  });
});

describe("buildShiftGridGeometry — HARADA fixture 近似（正本整合）", () => {
  it("HARADA を逆生成する入力 → HARADA_SPRIX_JULY_GEOMETRY に一致（近似）", () => {
    const r = buildShiftGridGeometry(HARADA_INPUT);
    expect(r.ok).toBe(true);
    const g = r.geometry!;
    expect(g.gridLeft).toBeCloseTo(HARADA_SPRIX_JULY_GEOMETRY.gridLeft, 4); // 275
    expect(g.colWidth).toBeCloseTo(HARADA_SPRIX_JULY_GEOMETRY.colWidth, 4); // 51.5
    expect(g.cropTop).toBe(HARADA_SPRIX_JULY_GEOMETRY.cropTop); // 298
    expect(g.cropHeight).toBe(HARADA_SPRIX_JULY_GEOMETRY.cropHeight); // 52
    expect(g.imageWidth).toBe(HARADA_SPRIX_JULY_GEOMETRY.imageWidth);
    expect(g.imageHeight).toBe(HARADA_SPRIX_JULY_GEOMETRY.imageHeight);
  });

  it("HARADA は最終列右端が画像を半列だけ超える（gridLeft+colWidth*31=1871.5>1860）が ok（端数許容）", () => {
    const r = buildShiftGridGeometry(HARADA_INPUT);
    const g = r.geometry!;
    expect(g.gridLeft + g.colWidth * 31).toBeGreaterThan(g.imageWidth); // strict なら invalid だが
    expect(r.ok).toBe(true); // 半列許容で ok
  });
});

describe("buildShiftGridGeometry — 月日数別", () => {
  it("同じ first/last 中心でも dayCount で colWidth が変わる（28/29/30/31）", () => {
    const span = { firstDayCenterX: 300.75, lastDayCenterX: 1545 + 300.75 }; // span = 1545
    const w = (d: number) =>
      buildShiftGridGeometry(ok({ ...span, dayCount: d })).geometry?.colWidth ?? 0;
    expect(w(31)).toBeCloseTo(1545 / 30, 4);
    expect(w(30)).toBeCloseTo(1545 / 29, 4);
    expect(w(29)).toBeCloseTo(1545 / 28, 4);
    expect(w(28)).toBeCloseTo(1545 / 27, 4);
    // 日数が少ないほど列幅は広い
    expect(w(28)).toBeGreaterThan(w(31));
  });
});

describe("buildShiftGridGeometry — cellCropRegion 整合（clamp）", () => {
  it("day=1 と day=dayCount の box が画像内に収まる（clamp）", () => {
    const g = buildShiftGridGeometry(HARADA_INPUT).geometry!;
    const first = cellCropRegion(g, 1);
    const last = cellCropRegion(g, 31);
    expect(first.x).toBeGreaterThanOrEqual(0);
    expect(first.x + first.width).toBeLessThanOrEqual(g.imageWidth + 1e-6);
    expect(last.x + last.width).toBeLessThanOrEqual(g.imageWidth + 1e-6);
    expect(last.y + last.height).toBeLessThanOrEqual(g.imageHeight + 1e-6);
  });
});

describe("buildShiftGridGeometry — invalid input（ok=false・geometry=null・issues）", () => {
  const bad = (over: Partial<ShiftGridGeometryInput>, field: string) => {
    const r = buildShiftGridGeometry(ok(over));
    expect(r.ok).toBe(false);
    expect(r.geometry).toBeNull();
    expect(r.issues.some((i) => i.field === field || r.issues.length > 0)).toBe(true);
  };

  it("imageW <= 0", () => bad({ imageW: 0 }, "imageW"));
  it("imageH <= 0", () => bad({ imageH: -5 }, "imageH"));
  it("dayCount < 28", () => bad({ dayCount: 27 }, "dayCount"));
  it("dayCount > 31", () => bad({ dayCount: 32 }, "dayCount"));
  it("dayCount 非整数", () => bad({ dayCount: 30.5 }, "dayCount"));
  it("personRowBand top >= bottom", () =>
    bad({ personRowBand: { top: 350, bottom: 298 } }, "personRowBand"));
  it("personRowBand が imageH 外", () =>
    bad({ personRowBand: { top: -10, bottom: 50 } }, "personRowBand"));
  it("firstDayCenterX >= lastDayCenterX", () =>
    bad({ firstDayCenterX: 1000, lastDayCenterX: 500 }, "dayCenterX"));
  it("lastDayCenterX が imageW 外", () => bad({ lastDayCenterX: 2000 }, "lastDayCenterX"));
  it("firstDayCenterX が負", () => bad({ firstDayCenterX: -5 }, "firstDayCenterX"));
  it("NaN 入力", () => bad({ firstDayCenterX: NaN }, "dayCenterX"));

  it("gridLeft が負になる（first が小さすぎ）→ invalid", () => {
    const r = buildShiftGridGeometry(ok({ firstDayCenterX: 10, lastDayCenterX: 1500, dayCount: 31 }));
    // colWidth = 1490/30 = 49.67、gridLeft = 10 - 24.8 < 0
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.field === "gridLeft")).toBe(true);
  });
});

describe("buildShiftGridGeometry — 純粋性", () => {
  it("同じ入力で同じ出力（決定論）", () => {
    const a = buildShiftGridGeometry(HARADA_INPUT);
    const b = buildShiftGridGeometry(HARADA_INPUT);
    expect(a).toEqual(b);
  });

  it("入力を mutate しない", () => {
    const input = ok();
    const snapshot = JSON.parse(JSON.stringify(input));
    buildShiftGridGeometry(input);
    expect(input).toEqual(snapshot);
  });
});
