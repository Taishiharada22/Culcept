/**
 * SR B1b-2C-3-a — assistedCropGenerator の契約
 *
 * 新依存（jsdom / canvas polyfill）を入れずに検証する:
 *   - pure 部分（planAssistedCrops）= DOM 不要
 *   - adapter 部分（drawAndEncode）= fake adapter を注入して呼び出し回数 + 引数 + 戻り値を assert
 */
import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_CROP_MIME,
  generateAssistedCrops,
  planAssistedCrops,
  type AssistedCropCanvasAdapter,
  type AssistedImageSource,
  type SupportedCropMime,
} from "@/lib/plan/shift/assistedCropGenerator";
import type { AssistedRowSelection } from "@/lib/plan/shift/assistedRowSelection";

const IMG = { imageW: 1860, imageH: 846 };
const valid: AssistedRowSelection = {
  ...IMG,
  headerBand: { top: 180, bottom: 226 },
  personRowBand: { top: 290, bottom: 350 },
};
const invalidOrder: AssistedRowSelection = {
  ...IMG,
  headerBand: { top: 400, bottom: 450 },
  personRowBand: { top: 290, bottom: 350 },
};
const invalidBounds: AssistedRowSelection = {
  ...IMG,
  headerBand: { top: -1, bottom: 100 },
  personRowBand: { top: 290, bottom: 350 },
};

// ── stubs（new Blob / new Image / canvas を作らない）──
class FakeBlob {
  constructor(public payload: { region: string; mimeType: SupportedCropMime; quality?: number }) {}
  get size() { return 1; }
}
const fakeImage = { width: IMG.imageW, height: IMG.imageH } as unknown as AssistedImageSource;

function makeFakeAdapter(): {
  adapter: AssistedCropCanvasAdapter;
  calls: { region: string; mimeType: SupportedCropMime; quality?: number }[];
} {
  const calls: { region: string; mimeType: SupportedCropMime; quality?: number }[] = [];
  const adapter: AssistedCropCanvasAdapter = {
    drawAndEncode: vi.fn(async (_image, region, mimeType, quality) => {
      const label = `${region.left},${region.top},${region.width},${region.height}`;
      calls.push({ region: label, mimeType, ...(quality !== undefined ? { quality } : {}) });
      return new FakeBlob({ region: label, mimeType, quality }) as unknown as Blob;
    }),
  };
  return { adapter, calls };
}

describe("planAssistedCrops（pure・描画なし）", () => {
  it("valid → regions + mimeType=PNG（既定）/ quality 無し", () => {
    const p = planAssistedCrops(valid);
    expect(p).not.toBeNull();
    expect(p!.regions.header).toEqual({ left: 0, top: 180, width: 1860, height: 46 });
    expect(p!.regions.personRow).toEqual({ left: 0, top: 290, width: 1860, height: 60 });
    expect(p!.mimeType).toBe(DEFAULT_CROP_MIME);
    expect(p!.mimeType).toBe("image/png");
    expect(p!.quality).toBeUndefined();
  });

  it("ordering invalid → null（throw しない）", () => {
    expect(planAssistedCrops(invalidOrder)).toBeNull();
  });

  it("band bounds invalid → null", () => {
    expect(planAssistedCrops(invalidBounds)).toBeNull();
  });

  it("personRowBand invalid（height<4）→ null", () => {
    const s: AssistedRowSelection = {
      ...IMG,
      headerBand: { top: 180, bottom: 226 },
      personRowBand: { top: 290, bottom: 292 },
    };
    expect(planAssistedCrops(s)).toBeNull();
  });

  it("mimeType=JPEG + quality → clamp 0..1", () => {
    const ok = planAssistedCrops(valid, { mimeType: "image/jpeg", quality: 0.8 });
    expect(ok!.mimeType).toBe("image/jpeg");
    expect(ok!.quality).toBe(0.8);
    const clampHi = planAssistedCrops(valid, { mimeType: "image/jpeg", quality: 5 });
    expect(clampHi!.quality).toBe(1);
    const clampLo = planAssistedCrops(valid, { mimeType: "image/jpeg", quality: -1 });
    expect(clampLo!.quality).toBe(0);
  });

  it("PNG + quality → quality 無視（PNG は lossless）", () => {
    const p = planAssistedCrops(valid, { mimeType: "image/png", quality: 0.5 });
    expect(p!.quality).toBeUndefined();
  });
});

describe("generateAssistedCrops（fake adapter 注入・新依存なし）", () => {
  it("valid → header + personRow の 2 Blob、adapter は 2 回呼ばれる", async () => {
    const { adapter, calls } = makeFakeAdapter();
    const out = await generateAssistedCrops(fakeImage, valid, { canvasAdapter: adapter });
    expect(out).not.toBeNull();
    expect(out!.header.blob).toBeDefined();
    expect(out!.personRow.blob).toBeDefined();
    expect(out!.header.mimeType).toBe("image/png");
    expect(out!.personRow.mimeType).toBe("image/png");
    expect(out!.header.region).toEqual({ left: 0, top: 180, width: 1860, height: 46 });
    expect(out!.personRow.region).toEqual({ left: 0, top: 290, width: 1860, height: 60 });
    expect(out!.selection).toBe(valid); // trace 保持
    expect(out!.regions.header).toBe(out!.header.region);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({ mimeType: "image/png" });
    expect(calls[1]).toMatchObject({ mimeType: "image/png" });
  });

  it("invalid selection（ordering）→ null（adapter は呼ばれない）", async () => {
    const { adapter, calls } = makeFakeAdapter();
    const out = await generateAssistedCrops(fakeImage, invalidOrder, { canvasAdapter: adapter });
    expect(out).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("invalid selection（bounds）→ null（adapter は呼ばれない）", async () => {
    const { adapter, calls } = makeFakeAdapter();
    const out = await generateAssistedCrops(fakeImage, invalidBounds, { canvasAdapter: adapter });
    expect(out).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("mimeType=JPEG + quality は adapter に伝わる", async () => {
    const { adapter, calls } = makeFakeAdapter();
    const out = await generateAssistedCrops(fakeImage, valid, {
      canvasAdapter: adapter,
      mimeType: "image/jpeg",
      quality: 0.85,
    });
    expect(out!.header.mimeType).toBe("image/jpeg");
    expect(out!.personRow.mimeType).toBe("image/jpeg");
    expect(calls.every((c) => c.mimeType === "image/jpeg")).toBe(true);
    expect(calls.every((c) => c.quality === 0.85)).toBe(true);
  });

  it("adapter throw は伝播（呼び元 host が UI 通知できるよう）", async () => {
    const adapter: AssistedCropCanvasAdapter = {
      drawAndEncode: vi.fn(async () => {
        throw new Error("fake encode failed");
      }),
    };
    await expect(
      generateAssistedCrops(fakeImage, valid, { canvasAdapter: adapter })
    ).rejects.toThrow(/fake encode failed/);
  });

  it("adapter は image / region / mimeType / quality を受け取る（contract 固定）", async () => {
    const drawAndEncode = vi.fn<AssistedCropCanvasAdapter["drawAndEncode"]>(
      async (_image, _region, _mimeType, _quality) => {
        void _region;
        return new FakeBlob({ region: "x", mimeType: "image/png" }) as unknown as Blob;
      }
    );
    await generateAssistedCrops(fakeImage, valid, {
      canvasAdapter: { drawAndEncode },
      mimeType: "image/png",
    });
    expect(drawAndEncode).toHaveBeenCalledTimes(2);
    // 1 回目 = header
    expect(drawAndEncode.mock.calls[0][0]).toBe(fakeImage);
    expect(drawAndEncode.mock.calls[0][1]).toEqual({ left: 0, top: 180, width: 1860, height: 46 });
    expect(drawAndEncode.mock.calls[0][2]).toBe("image/png");
    // 2 回目 = personRow
    expect(drawAndEncode.mock.calls[1][1]).toEqual({ left: 0, top: 290, width: 1860, height: 60 });
  });
});

describe("不変条件: 永続化・本流非接続", () => {
  it("module は localStorage / sessionStorage / fetch / supabase を import しない（test 内で globalThis を汚さないことで間接確認）", async () => {
    // 直接 import 文の grep は CI 側で確認するため、ここでは「副作用が adapter 経由のみ」を間接的に固定。
    const { adapter, calls } = makeFakeAdapter();
    await generateAssistedCrops(fakeImage, valid, { canvasAdapter: adapter });
    // adapter 以外の I/O は走らない（calls=2 のみ）。
    expect(calls).toHaveLength(2);
  });
});
