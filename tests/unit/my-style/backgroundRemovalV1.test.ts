import { describe, it, expect } from "vitest";

import {
  computeCutoutV1,
  sampleEdgeColors,
  representativeBackground,
  findSubjectBounds,
  applyMaskAlpha,
} from "@/app/(immersive)/my-style/_lib/backgroundRemovalV1";
// case 10: 既存 removeBackground を import して「別モジュール・既存 export 健在」を確認
import { removeBackground } from "@/app/(immersive)/my-style/_lib/backgroundRemoval";

type RGB = [number, number, number];

/** 単色背景の RGBA 画像を作る（pure・canvas 不要）。 */
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

/** [x0,x1]×[y0,y1]（inclusive）を色 c で塗る。 */
function fillRect(
  img: { data: Uint8ClampedArray; width: number; height: number },
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  c: RGB,
): void {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const idx = (y * img.width + x) * 4;
      img.data[idx] = c[0];
      img.data[idx + 1] = c[1];
      img.data[idx + 2] = c[2];
      img.data[idx + 3] = 255;
    }
  }
}

const WHITE: RGB = [245, 245, 245];
const NAVY: RGB = [30, 40, 90];
const BLACK: RGB = [20, 20, 20];

function maskAt(r: { mask: Uint8Array; width: number }, x: number, y: number): number {
  return r.mask[y * r.width + x];
}

describe("backgroundRemovalV1 — pure local cutout heuristic", () => {
  it("① 単色背景 + 単純な服形状 → success（subject は残る）", () => {
    const img = makeImg(64, 64, WHITE);
    fillRect(img, 18, 18, 45, 45, NAVY); // 中央・四辺非接触
    const r = computeCutoutV1(img.data, img.width, img.height);
    expect(r.status).toBe("success");
    expect(maskAt(r, 32, 32)).toBe(0); // 服中心は subject
    expect(maskAt(r, 1, 1)).toBe(1); // 隅は背景
    expect(r.confidence).toBeGreaterThanOrEqual(0.68);
  });

  it("② subject が隅に来ても、 辺全体 median で背景色を誤らない（四隅依存をやめた効果）", () => {
    const img = makeImg(64, 64, WHITE);
    fillRect(img, 0, 0, 20, 20, NAVY); // 左上隅に subject
    const { color } = representativeBackground(sampleEdgeColors(img.data, img.width, img.height));
    expect(color[0]).toBeGreaterThan(200);
    expect(color[1]).toBeGreaterThan(200);
    expect(color[2]).toBeGreaterThan(200); // navy ではなく白を背景と判定
  });

  it("③ バッグ持ち手のような囲み穴 → hole pass で抜ける", () => {
    const img = makeImg(64, 64, WHITE);
    fillRect(img, 16, 16, 47, 47, NAVY); // 外周リング（塗りつぶし）
    fillRect(img, 24, 24, 39, 39, WHITE); // 内側に背景色の囲み穴
    const r = computeCutoutV1(img.data, img.width, img.height);
    expect(maskAt(r, 31, 31)).toBe(1); // 囲み穴は背景として抜ける
    expect(maskAt(r, 18, 31)).toBe(0); // リング本体は subject
    expect(r.signals.holePassRatio).toBeGreaterThan(0);
  });

  it("④ 靴の開口のような囲み背景 → hole pass で抜ける", () => {
    const img = makeImg(80, 60, WHITE);
    fillRect(img, 10, 10, 69, 49, NAVY); // 本体
    fillRect(img, 30, 18, 49, 30, WHITE); // 上寄りの開口（囲み背景）
    const r = computeCutoutV1(img.data, img.width, img.height);
    expect(maskAt(r, 39, 24)).toBe(1); // 開口は背景
    expect(maskAt(r, 15, 40)).toBe(0); // 本体は subject
  });

  it("⑤ 背景色に近い低彩度の影が背景として吸収される", () => {
    const img = makeImg(64, 64, WHITE);
    fillRect(img, 18, 18, 43, 45, NAVY); // 服
    fillRect(img, 44, 18, 47, 45, [205, 205, 205]); // 右隣の薄いグレー影（白背景に隣接）
    const r = computeCutoutV1(img.data, img.width, img.height);
    expect(r.signals.shadowPassRatio).toBeGreaterThan(0);
    expect(maskAt(r, 47, 30)).toBe(1); // 背景に隣接する影端は除去される
  });

  it("⑥ 白い服 × 近白背景 → 消し過ぎを success にしない（failed）", () => {
    const img = makeImg(64, 64, WHITE);
    fillRect(img, 18, 18, 45, 45, [235, 235, 235]); // 背景にごく近い白系の服
    const r = computeCutoutV1(img.data, img.width, img.height);
    expect(r.status).not.toBe("success"); // 区別できないので success にしない
    expect(r.status).toBe("failed"); // subject 喪失（全面背景化）→ failed
  });

  it("⑦ 黒い靴・黒い服を影として消さない（luminance floor 保護）", () => {
    const img = makeImg(64, 64, WHITE);
    fillRect(img, 18, 18, 45, 45, BLACK); // 黒物体
    const r = computeCutoutV1(img.data, img.width, img.height);
    expect(maskAt(r, 32, 32)).toBe(0); // 黒は subject のまま
    expect(maskAt(r, 18, 32)).toBe(0); // 背景隣接の黒端も保護（影として消さない）
  });

  it("⑧ bbox trim で余白が減る", () => {
    const img = makeImg(64, 64, WHITE);
    fillRect(img, 24, 24, 39, 39, NAVY); // 小さめ中央
    const r = computeCutoutV1(img.data, img.width, img.height);
    expect(r.bbox).not.toBeNull();
    expect(r.bbox!.minX).toBeGreaterThan(0);
    expect(r.bbox!.maxX).toBeLessThan(img.width - 1);
    expect(r.bbox!.maxX - r.bbox!.minX + 1).toBeLessThan(img.width); // 余白 trim
  });

  it("⑨ 背景が不均一（低 edge consistency）なら success にしない", () => {
    const img = makeImg(64, 64, WHITE);
    // 辺を高分散なノイズで塗る（決定的パターン）
    for (let x = 0; x < 64; x++) {
      for (const y of [0, 63]) {
        const v = (x * 37 + y * 101) % 256;
        const idx = (y * 64 + x) * 4;
        img.data[idx] = v;
        img.data[idx + 1] = (v * 2) % 256;
        img.data[idx + 2] = (v * 3) % 256;
      }
    }
    for (let y = 0; y < 64; y++) {
      for (const x of [0, 63]) {
        const v = (x * 37 + y * 101) % 256;
        const idx = (y * 64 + x) * 4;
        img.data[idx] = v;
        img.data[idx + 1] = (v * 2) % 256;
        img.data[idx + 2] = (v * 3) % 256;
      }
    }
    fillRect(img, 20, 20, 43, 43, NAVY);
    const r = computeCutoutV1(img.data, img.width, img.height);
    expect(r.status).not.toBe("success");
    expect(r.confidence).toBeLessThan(0.68);
  });

  it("⑩ 既存 removeBackground は別モジュールとして健在（default 不変・本テストは触れない）", () => {
    expect(typeof removeBackground).toBe("function");
    expect(typeof computeCutoutV1).toBe("function");
  });

  it("補: 退化入力（1px 以下）は skipped", () => {
    const r = computeCutoutV1(new Uint8ClampedArray(4), 1, 1);
    expect(r.status).toBe("skipped");
  });

  it("補: applyMaskAlpha は背景画素の alpha を 0 にする（純関数・元配列を破壊しない）", () => {
    const img = makeImg(8, 8, WHITE);
    fillRect(img, 3, 3, 4, 4, NAVY);
    const r = computeCutoutV1(img.data, img.width, img.height);
    const out = applyMaskAlpha(img.data, r.mask);
    // 背景画素 (0,0) は alpha 0、 元 data は不変（255）
    expect(out[3]).toBe(0);
    expect(img.data[3]).toBe(255);
  });

  it("補: findSubjectBounds は subject 無しで null", () => {
    const blank = new Uint8Array(64); // 全 0 → 全 subject なので bounds あり
    expect(findSubjectBounds(blank, 8, 8)).not.toBeNull();
    const allBg = new Uint8Array(64).fill(1);
    expect(findSubjectBounds(allBg, 8, 8)).toBeNull();
  });
});
