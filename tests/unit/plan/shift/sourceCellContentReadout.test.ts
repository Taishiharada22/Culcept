import { describe, it, expect } from "vitest";

import {
  readSourceCellContent,
  DEFAULT_INNER_FRACTION,
  type PixelBuffer,
} from "../../../../lib/plan/shift/sourceCellContentReadout";

/** W×H の RGBA(or RGB) buffer を作る。block 指定で内部矩形を別色に。 */
function makeBuffer(
  W: number,
  H: number,
  fill: [number, number, number],
  block?: { x0: number; y0: number; x1: number; y1: number; rgb: [number, number, number] },
  channels = 4
): PixelBuffer {
  const data = new Uint8ClampedArray(W * H * channels);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const inBlock = block && x >= block.x0 && x < block.x1 && y >= block.y0 && y < block.y1;
      const c = inBlock ? block.rgb : fill;
      const i = (y * W + x) * channels;
      data[i] = c[0];
      data[i + 1] = c[1];
      data[i + 2] = c[2];
      if (channels === 4) data[i + 3] = 255;
    }
  }
  return { data, width: W, height: H };
}

const FULL = (W: number, H: number) => ({ x: 0, y: 0, width: W, height: H });

describe("sourceCellContentReadout / readSourceCellContent", () => {
  it("色付きセル（水色）→ content あり（high score）", () => {
    const buf = makeBuffer(20, 20, [150, 200, 240]);
    const r = readSourceCellContent(buf, FULL(20, 20));
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThan(0.5);
  });

  it("赤文字様 pixel → content あり", () => {
    const buf = makeBuffer(20, 20, [200, 40, 40]);
    const r = readSourceCellContent(buf, FULL(20, 20));
    expect(r.ok).toBe(true);
    expect(r.stats.rednessRatio).toBeGreaterThan(0.5);
    expect(r.score).toBeGreaterThan(0.5);
  });

  it("白 → content なし（score ~0）", () => {
    const buf = makeBuffer(20, 20, [255, 255, 255]);
    const r = readSourceCellContent(buf, FULL(20, 20));
    expect(r.ok).toBe(true);
    expect(r.score).toBe(0);
  });

  it("灰色テクスチャ（低密度）→ content なし", () => {
    const buf = makeBuffer(20, 20, [200, 200, 200]);
    expect(readSourceCellContent(buf, FULL(20, 20)).score).toBe(0);
  });

  it("無効 region → throw せず fail-open（ok:false, score:0）", () => {
    const buf = makeBuffer(20, 20, [150, 200, 240]);
    expect(() => readSourceCellContent(buf, { x: 100, y: 100, width: 10, height: 10 })).not.toThrow();
    expect(readSourceCellContent(buf, { x: 100, y: 100, width: 10, height: 10 }).ok).toBe(false);
    expect(readSourceCellContent(buf, { x: 0, y: 0, width: -5, height: 10 }).ok).toBe(false);
    expect(readSourceCellContent(buf, { x: 0, y: 0, width: NaN, height: 10 }).ok).toBe(false);
  });

  it("無効 buffer → fail-open（null / 寸法不正 / data 不足）", () => {
    expect(readSourceCellContent(null as unknown as PixelBuffer, FULL(20, 20)).ok).toBe(false);
    expect(readSourceCellContent({ data: [], width: 0, height: 0 }, FULL(0, 0)).ok).toBe(false);
    // data が width*height*4 に満たない
    expect(
      readSourceCellContent({ data: new Uint8ClampedArray(10), width: 20, height: 20 }, FULL(20, 20)).ok
    ).toBe(false);
  });

  it("region clamp が効く（画像外にはみ出しても内側の有効 pixel を測る）", () => {
    const buf = makeBuffer(20, 20, [150, 200, 240]);
    const r = readSourceCellContent(buf, { x: 12, y: 12, width: 30, height: 30 });
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThan(0.5); // clamp 後 [12,20] が水色
  });

  it("innerFraction で中央に寄せる（端白・中央色 → inner 0.62 が full より高い）", () => {
    const buf = makeBuffer(10, 10, [255, 255, 255], { x0: 3, y0: 3, x1: 7, y1: 7, rgb: [200, 40, 40] });
    const inner = readSourceCellContent(buf, FULL(10, 10), { innerFraction: 0.62 });
    const full = readSourceCellContent(buf, FULL(10, 10), { innerFraction: 1 });
    expect(inner.score).toBeGreaterThan(full.score);
  });

  it("DEFAULT_INNER_FRACTION = 0.62", () => {
    expect(DEFAULT_INNER_FRACTION).toBe(0.62);
  });

  it("channels=3（RGB buffer）でも動く", () => {
    const buf = makeBuffer(20, 20, [150, 200, 240], undefined, 3);
    const r = readSourceCellContent(buf, FULL(20, 20), { channels: 3 });
    expect(r.ok).toBe(true);
    expect(r.score).toBeGreaterThan(0.5);
  });

  it("raw 画像/base64 を保持しない（戻り値は数値のみ・data 参照なし）", () => {
    const buf = makeBuffer(20, 20, [150, 200, 240]);
    const r = readSourceCellContent(buf, FULL(20, 20));
    expect(Object.keys(r).sort()).toEqual(["ok", "score", "stats"]);
    expect(Object.keys(r.stats).sort()).toEqual(["darkRatio", "pixelCount", "rednessRatio", "satRatio"]);
    // 入力 buffer.data への参照を返していない
    expect((r as unknown as { data?: unknown }).data).toBeUndefined();
    expect(JSON.stringify(r).length).toBeLessThan(200);
  });
});
