import { describe, it, expect, vi } from "vitest";

import {
  guideFrameToCutoutFrame,
  computeResize,
  buildCutoutBrowserResult,
  processImageCutout,
  type CutoutBrowserDeps,
} from "@/app/(immersive)/my-style/_lib/cutoutBrowser";
import type { CutoutBounds, CutoutV1Signals } from "@/app/(immersive)/my-style/_lib/backgroundRemovalV1";

type RGB = [number, number, number];
function makeImg(w: number, h: number, bg: RGB): { data: Uint8ClampedArray; width: number; height: number } {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  return { data, width: w, height: h };
}
function fillRect(img: { data: Uint8ClampedArray; width: number }, x0: number, y0: number, x1: number, y1: number, c: RGB) {
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const idx = (y * img.width + x) * 4;
      img.data[idx] = c[0];
      img.data[idx + 1] = c[1];
      img.data[idx + 2] = c[2];
      img.data[idx + 3] = 255;
    }
}

const SIGNALS: CutoutV1Signals = {
  bgRatio: 0.5,
  edgeConsistency: 1,
  subjectConnectedness: 1,
  subjectEdgeTouch: 0,
  bboxCoverage: 0.3,
  holePassRatio: 0,
  shadowPassRatio: 0,
};
const BBOX: CutoutBounds = { minX: 10, minY: 10, maxX: 50, maxY: 50 };

describe("C1L-4a — cutoutBrowser glue", () => {
  it("① guide frame {x,y,width,height} → cutout frame {x0,y0,x1,y1}（0..1 クランプ）", () => {
    expect(guideFrameToCutoutFrame({ x: 0.1, y: 0.2, width: 0.5, height: 0.6 })).toEqual({
      x0: 0.1,
      y0: 0.2,
      x1: 0.6,
      y1: 0.8,
    });
    // はみ出しはクランプ
    expect(guideFrameToCutoutFrame({ x: 0.8, y: 0.8, width: 0.5, height: 0.5 })).toEqual({
      x0: 0.8,
      y0: 0.8,
      x1: 1,
      y1: 1,
    });
  });

  it("② maxDimension resize（縦横比維持・縮小時のみ scaled）", () => {
    expect(computeResize(800, 600, 1024)).toEqual({ width: 800, height: 600, scaled: false });
    expect(computeResize(2000, 1000, 1024)).toEqual({ width: 1024, height: 512, scaled: true });
    expect(computeResize(2048, 2048, 1024)).toEqual({ width: 1024, height: 1024, scaled: true });
    const r = computeResize(3000, 1500, 1024);
    expect(Math.abs(r.width / r.height - 2)).toBeLessThan(0.02); // アスペクト維持
  });

  it("③ output policy: success/needs_review は dataUrl あり / failed・skipped は無し / encode null も無し", () => {
    const base = { confidence: 0.8, bbox: BBOX, signals: SIGNALS };
    expect(buildCutoutBrowserResult({ ...base, status: "success" }, "data:img/MOCK").dataUrl).toBe("data:img/MOCK");
    expect(buildCutoutBrowserResult({ ...base, status: "needs_review" }, "data:img/MOCK").dataUrl).toBe("data:img/MOCK");
    expect(buildCutoutBrowserResult({ ...base, status: "failed" }, "data:img/MOCK").dataUrl).toBeUndefined();
    expect(buildCutoutBrowserResult({ ...base, status: "skipped" }, "data:img/MOCK").dataUrl).toBeUndefined();
    expect(buildCutoutBrowserResult({ ...base, status: "success" }, null).dataUrl).toBeUndefined(); // encode 失敗
    expect(buildCutoutBrowserResult({ ...base, status: "success" }, "x").method).toBe("heuristic_v1");
  });

  it("④ processImageCutout: 単色背景+服 → success で dataUrl を返す（computeCutoutV1 へ正しい shape で渡る）", async () => {
    const img = makeImg(64, 64, [245, 245, 245]);
    fillRect(img, 18, 18, 45, 45, [30, 40, 90]);
    const deps: CutoutBrowserDeps = {
      decodeToImageData: async () => img,
      encodePng: vi.fn(() => "data:image/png;base64,MOCK"),
    };
    const res = await processImageCutout(new Blob(["x"]), { frame: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 } }, deps);
    expect(res.status).toBe("success");
    expect(res.dataUrl).toBe("data:image/png;base64,MOCK");
    expect(res.method).toBe("heuristic_v1");
    expect((deps.encodePng as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1); // 採用ステータスのみ encode
  });

  it("⑤ decode が null → skipped（dataUrl なし・throw しない）", async () => {
    const res = await processImageCutout(new Blob(["x"]), {}, { decodeToImageData: async () => null });
    expect(res.status).toBe("skipped");
    expect(res.dataUrl).toBeUndefined();
  });

  it("⑥ decode が throw → failed（throw を外に漏らさない）", async () => {
    const res = await processImageCutout(
      new Blob(["x"]),
      {},
      {
        decodeToImageData: async () => {
          throw new Error("decode boom");
        },
      },
    );
    expect(res.status).toBe("failed");
    expect(res.error).toContain("decode boom");
    expect(res.dataUrl).toBeUndefined();
  });

  it("⑦ failed status のときは encode を呼ばない（白×近白→subject 喪失→failed）", async () => {
    const img = makeImg(64, 64, [245, 245, 245]);
    fillRect(img, 18, 18, 45, 45, [235, 235, 235]); // 近白 → V1 failed
    const encodePng = vi.fn(() => "data:image/png;base64,MOCK");
    const res = await processImageCutout(new Blob(["x"]), {}, { decodeToImageData: async () => img, encodePng });
    expect(res.status).toBe("failed");
    expect(res.dataUrl).toBeUndefined();
    expect(encodePng).not.toHaveBeenCalled();
  });

  it("⑧ SSR/Node（document なし）で default decode → skipped（throw しない）", async () => {
    const res = await processImageCutout(new Blob(["x"])); // default deps
    expect(["skipped", "failed"]).toContain(res.status);
    expect(res.dataUrl).toBeUndefined();
  });
});
