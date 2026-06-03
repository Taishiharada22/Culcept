/**
 * SR B1b-2C-9-FIX — combinedDraftImage（plan + adapter）
 *
 * 不変条件:
 *   ① planCombinedDraftImage: invalid selection → null
 *   ② combinedHeight = headerHeight + personRowHeight
 *   ③ combinedWidth = max(header.width, personRow.width)（両帯 full-width = imageW）
 *   ④ header は上段（y=0）、personRow は下段（y=headerHeight）に積む
 *   ⑤ generateCombinedDraftImage: fake adapter で blob + plan を返す（canvas 不要）
 *   ⑥ invalid → null（adapter 未呼出）
 */
import { describe, it, expect, vi } from "vitest";

import {
  planCombinedDraftImage,
  generateCombinedDraftImage,
  type CombinedCanvasAdapter,
} from "@/lib/plan/shift/combinedDraftImage";
import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";

const VALID: AssistedRowSelection = {
  imageW: 1860,
  imageH: 846,
  headerBand: { top: 40, bottom: 80 }, // height 40
  personRowBand: { top: 120, bottom: 180 }, // height 60
};
const INVALID: AssistedRowSelection = {
  imageW: 1860,
  imageH: 846,
  headerBand: { top: 100, bottom: 80 }, // top >= bottom → invalid
  personRowBand: { top: 120, bottom: 180 },
};

describe("planCombinedDraftImage", () => {
  it("invalid selection → null", () => {
    expect(planCombinedDraftImage(INVALID)).toBeNull();
  });

  it("combinedHeight = header高 + personRow高 / width = imageW", () => {
    const plan = planCombinedDraftImage(VALID);
    expect(plan).not.toBeNull();
    expect(plan!.combinedWidth).toBe(1860);
    expect(plan!.combinedHeight).toBe(40 + 60);
  });

  it("header を上段(y=0)、personRow を下段(y=header高)に積む", () => {
    const plan = planCombinedDraftImage(VALID)!;
    expect(plan.headerDest).toEqual({ left: 0, top: 0, width: 1860, height: 40 });
    expect(plan.personRowDest).toEqual({ left: 0, top: 40, width: 1860, height: 60 });
  });

  it("source 矩形は computeCropRegions と一致（full-width strip）", () => {
    const plan = planCombinedDraftImage(VALID)!;
    expect(plan.headerRegion).toEqual({ left: 0, top: 40, width: 1860, height: 40 });
    expect(plan.personRowRegion).toEqual({ left: 0, top: 120, width: 1860, height: 60 });
  });

  it("既定 mime は image/png", () => {
    expect(planCombinedDraftImage(VALID)!.mimeType).toBe("image/png");
  });
});

describe("planCombinedDraftImage — 9-FIX-2 upscale + gridline", () => {
  it("既定（minWidth 未指定）→ scale=1（upscale なし）/ gridline=false", () => {
    const plan = planCombinedDraftImage(VALID)!;
    expect(plan.scale).toBe(1);
    expect(plan.gridline).toBe(false);
    expect(plan.combinedWidth).toBe(1860);
    expect(plan.combinedHeight).toBe(100);
  });

  it("minWidth=1500 で元画像 1860 → 既に十分 → scale=1（upscale なし）", () => {
    const plan = planCombinedDraftImage(VALID, { minWidth: 1500 })!;
    expect(plan.scale).toBe(1);
    expect(plan.combinedWidth).toBe(1860);
  });

  it("minWidth=2000 で元画像 1860 → 不足 → scale=2（2x upscale）", () => {
    const plan = planCombinedDraftImage(VALID, { minWidth: 2000 })!;
    expect(plan.scale).toBe(2);
    expect(plan.combinedWidth).toBe(1860 * 2);
    expect(plan.combinedHeight).toBe(100 * 2);
    expect(plan.headerDest).toEqual({ left: 0, top: 0, width: 3720, height: 80 });
    expect(plan.personRowDest).toEqual({ left: 0, top: 80, width: 3720, height: 120 });
  });

  it("gridline=true → 上下段境界 midlineY が描画位置", () => {
    const plan = planCombinedDraftImage(VALID, { gridline: true })!;
    expect(plan.gridline).toBe(true);
    expect(plan.midlineY).toBe(40); // = scaledHeaderHeight
  });

  it("CEO 補正: 3x は初期不採用（minWidth ≫ baseWidth でも scale=2 まで）", () => {
    const plan = planCombinedDraftImage(VALID, { minWidth: 99999 })!;
    expect(plan.scale).toBe(2);
    expect(plan.scale).not.toBe(3);
  });
});

describe("generateCombinedDraftImage（fake adapter）", () => {
  const fakeImage = {} as unknown as HTMLImageElement;

  it("valid → blob + plan を返す（adapter 1 回呼出）", async () => {
    const fakeBlob = new Blob(["combined"], { type: "image/png" });
    const adapter: CombinedCanvasAdapter = {
      drawCombined: vi.fn(async () => fakeBlob),
    };
    const out = await generateCombinedDraftImage(fakeImage, VALID, {
      canvasAdapter: adapter,
    });
    expect(out).not.toBeNull();
    expect(out!.blob).toBe(fakeBlob);
    expect(out!.plan.combinedHeight).toBe(100);
    expect(adapter.drawCombined).toHaveBeenCalledTimes(1);
  });

  it("invalid → null（adapter 未呼出）", async () => {
    const adapter: CombinedCanvasAdapter = { drawCombined: vi.fn() };
    const out = await generateCombinedDraftImage(fakeImage, INVALID, {
      canvasAdapter: adapter,
    });
    expect(out).toBeNull();
    expect(adapter.drawCombined).not.toHaveBeenCalled();
  });
});
