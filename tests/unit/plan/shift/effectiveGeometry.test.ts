/**
 * SR S-geo Persist-1 — resolveEffectiveGeometry pure helper
 *
 * 3 層: dayColumns（荒い 2 点）/ gridCalibration（全列校正の最終値・誤適用防止コンテキスト付き）/
 *       effectiveGeometry（gridCalibration が現コンテキスト整合時のみ優先・なければ dayColumns 由来）。
 * 不変条件: pure・throw しない・deterministic・別画像/別月への誤適用なし。
 */
import { describe, it, expect } from "vitest";

import { resolveEffectiveGeometry } from "@/lib/plan/shift/effectiveGeometry";
import type {
  AssistedRowSelection,
  GridCalibration,
} from "@/lib/plan/shift/assistedRowSelection";

// imageW=1800・dayColumns(222,1585)。June(30日): colWidth=(1585-222)/29≈47.0・gridLeft≈198.5。
const SEL: AssistedRowSelection = {
  imageW: 1800,
  imageH: 1260,
  headerBand: { top: 100, bottom: 140 },
  personRowBand: { top: 490, bottom: 527 }, // cropTop=490, cropHeight=37
  dayColumns: { firstDayCenterX: 222, lastDayCenterX: 1585 },
};
// cal は dayColumns 由来（gridLeft≈198.5 / colWidth≈47）と明確に違う値（400 / 40）で識別。
const CAL: GridCalibration = {
  gridLeft: 400,
  colWidth: 40,
  source: "manual_overlay",
  imageW: 1800,
  imageH: 1260,
  dayCount: 30,
};
const JUNE_COLW = (1585 - 222) / 29; // ≈47.0（dayCount=30 → divisor 29）

describe("resolveEffectiveGeometry — 3 層解決", () => {
  it("gridCalibration valid+整合 → calibration 由来を優先（dayColumns より）", () => {
    const g = resolveEffectiveGeometry({
      selection: { ...SEL, gridCalibration: CAL },
      year: 2025,
      month: 6,
    });
    expect(g).toBeDefined();
    expect(g?.gridLeft).toBe(400); // cal 値（dayColumns 由来 ≈198.5 ではない）
    expect(g?.colWidth).toBe(40);
    expect(g?.cropTop).toBe(490); // personRowBand
    expect(g?.cropHeight).toBe(37);
    expect(g?.imageWidth).toBe(1800);
  });

  it("gridCalibration なし → dayColumns 由来", () => {
    const g = resolveEffectiveGeometry({ selection: SEL, year: 2025, month: 6 });
    expect(g).toBeDefined();
    expect(g?.colWidth).toBeCloseTo(JUNE_COLW, 6);
    expect(g?.gridLeft).toBeCloseTo(222 - JUNE_COLW / 2, 6);
    expect(g?.gridLeft).not.toBe(400);
  });

  it("imageW 不一致 → calibration 無視 → dayColumns fallback", () => {
    const g = resolveEffectiveGeometry({
      selection: { ...SEL, gridCalibration: CAL },
      imageMeta: { imageW: 2000, imageH: 1260 },
      year: 2025,
      month: 6,
    });
    expect(g?.gridLeft).not.toBe(400);
    expect(g?.imageWidth).toBe(2000);
  });

  it("imageH 不一致 → calibration 無視 → dayColumns fallback", () => {
    const g = resolveEffectiveGeometry({
      selection: { ...SEL, gridCalibration: CAL },
      imageMeta: { imageW: 1800, imageH: 1300 },
      year: 2025,
      month: 6,
    });
    expect(g?.gridLeft).not.toBe(400);
  });

  it("dayCount 不一致（cal=30 / July=31）→ calibration 無視 → dayColumns(July) fallback", () => {
    const g = resolveEffectiveGeometry({
      selection: { ...SEL, gridCalibration: CAL },
      year: 2025,
      month: 7, // 31 日 → divisor 30
    });
    expect(g?.gridLeft).not.toBe(400);
    expect(g?.colWidth).toBeCloseTo((1585 - 222) / 30, 6); // ≈45.4（June 47 とも cal 40 とも違う）
  });

  it("gridCalibration invalid（colWidth=0）→ dayColumns fallback", () => {
    const g = resolveEffectiveGeometry({
      selection: { ...SEL, gridCalibration: { ...CAL, colWidth: 0 } },
      year: 2025,
      month: 6,
    });
    expect(g?.gridLeft).not.toBe(400);
    expect(g?.colWidth).toBeCloseTo(JUNE_COLW, 6);
  });

  it("gridCalibration invalid（source 不正）→ dayColumns fallback", () => {
    const bad = { ...CAL, source: "auto" as unknown as "manual_overlay" };
    const g = resolveEffectiveGeometry({
      selection: { ...SEL, gridCalibration: bad },
      year: 2025,
      month: 6,
    });
    expect(g?.colWidth).toBeCloseTo(JUNE_COLW, 6);
  });

  it("dayColumns も無効（dayColumns なし + cal 不整合）→ undefined", () => {
    const { dayColumns: _omit, ...noDc } = SEL;
    const g = resolveEffectiveGeometry({
      selection: { ...noDc, gridCalibration: { ...CAL, dayCount: 28 } }, // June 30 と不一致
      year: 2025,
      month: 6,
    });
    expect(g).toBeUndefined();
  });

  it("selection なし → undefined", () => {
    expect(
      resolveEffectiveGeometry({ selection: undefined, year: 2025, month: 6 })
    ).toBeUndefined();
  });

  it("garbage selection（NaN 寸法・帯 0）でも throw せず undefined", () => {
    const garbage = {
      imageW: Number.NaN,
      imageH: Number.NaN,
      headerBand: { top: 0, bottom: 0 },
      personRowBand: { top: 0, bottom: 0 },
      gridCalibration: {
        gridLeft: Number.NaN,
        colWidth: Number.NaN,
        source: "manual_overlay",
        imageW: Number.NaN,
        imageH: Number.NaN,
        dayCount: Number.NaN,
      },
    } as AssistedRowSelection;
    expect(() =>
      resolveEffectiveGeometry({ selection: garbage, year: 2025, month: 6 })
    ).not.toThrow();
    expect(
      resolveEffectiveGeometry({ selection: garbage, year: 2025, month: 6 })
    ).toBeUndefined();
  });

  it("deterministic（同入力 → 同出力）", () => {
    const input = {
      selection: { ...SEL, gridCalibration: CAL },
      year: 2025,
      month: 6,
    };
    expect(resolveEffectiveGeometry(input)).toEqual(resolveEffectiveGeometry(input));
  });
});
