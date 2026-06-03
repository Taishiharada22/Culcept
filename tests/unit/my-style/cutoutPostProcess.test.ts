import { describe, it, expect } from "vitest";

import {
  POST_PROCESS_DEFAULTS,
  dilateForegroundAlpha,
  erodeForegroundAlpha,
  morphologicalCloseAlpha,
  morphologicalOpenAlpha,
  featherBackgroundEdgeAlpha,
  applyPostProcessToRgba,
} from "@/app/(immersive)/my-style/_lib/cutoutPostProcess";

/* ── fixture helpers ── */

/** 全画素の alpha を 0 / 255 で初期化した RGBA バッファを作る。 RGB は灰色固定で十分（post-process は alpha のみ操作）。 */
function makeRgba(
  width: number,
  height: number,
  alphaAt: (x: number, y: number) => number,
  rgbAt: (x: number, y: number) => [number, number, number] = () => [128, 128, 128],
): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const [r, g, b] = rgbAt(x, y);
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = alphaAt(x, y);
    }
  }
  return data;
}

function alphaAtPixel(buf: Uint8ClampedArray, width: number, x: number, y: number): number {
  return buf[(y * width + x) * 4 + 3];
}

function rgbAtPixel(buf: Uint8ClampedArray, width: number, x: number, y: number): [number, number, number] {
  const i = (y * width + x) * 4;
  return [buf[i], buf[i + 1], buf[i + 2]];
}

const W = 5;
const H = 5;

/** 中央 3x3 が前景 (alpha=255)、 残りが背景 (alpha=0)。 */
function centerSquareFG(): Uint8ClampedArray {
  return makeRgba(W, H, (x, y) => (x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 255 : 0));
}

/** 中央 3x3 前景の中心 1 px が穴 (alpha=0)。 closing で埋まるはず。 */
function centerSquareFGWithHole(): Uint8ClampedArray {
  return makeRgba(W, H, (x, y) => {
    if (x === 2 && y === 2) return 0; // hole
    return x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 255 : 0;
  });
}

/** 単独 1 px 前景 (alpha=255) + 大きな前景塊。 opening で 1 px 前景が消えるはず。 */
function isolatedFGPixel(): Uint8ClampedArray {
  return makeRgba(W, H, (x, y) => {
    if (x === 0 && y === 0) return 255; // isolated
    return x >= 2 && x <= 4 && y >= 2 && y <= 4 ? 255 : 0; // large cluster
  });
}

/* ── ① defaults: 保守的（服を削らない）デフォルトを構造的に固定 ── */

describe("POST_PROCESS_DEFAULTS — CEO 補正「服を削らない」の構造的保証", () => {
  it("closeIter=1（既定で前景の小穴のみ埋める）", () => {
    expect(POST_PROCESS_DEFAULTS.closeIter).toBe(1);
  });
  it("openIter=0（既定で前景の孤立小領域は消さない＝服本体保護）", () => {
    expect(POST_PROCESS_DEFAULTS.openIter).toBe(0);
  });
  it("bgFeatherAlpha=0（既定で feather OFF）", () => {
    expect(POST_PROCESS_DEFAULTS.bgFeatherAlpha).toBe(0);
  });
});

/* ── ② dilate / erode 基礎契約 ── */

describe("dilateForegroundAlpha — 背景画素の前景化", () => {
  it("4-neighbor に前景があれば 0→255 化", () => {
    const buf = centerSquareFG();
    const out = dilateForegroundAlpha(buf, W, H);
    // 中央 3x3 周辺の背景画素は前景化される
    expect(alphaAtPixel(out, W, 0, 1)).toBe(255); // 左側 = 隣の (1,1) が 255
    expect(alphaAtPixel(out, W, 1, 0)).toBe(255); // 上側
    // 元の前景画素は維持
    expect(alphaAtPixel(out, W, 2, 2)).toBe(255);
    // 4-neighbor に前景が無い角画素 (0,0) は背景のまま
    expect(alphaAtPixel(out, W, 0, 0)).toBe(0);
  });

  it("入力を mutate しない", () => {
    const buf = centerSquareFG();
    const snapshot = new Uint8ClampedArray(buf);
    dilateForegroundAlpha(buf, W, H);
    expect(Array.from(buf)).toEqual(Array.from(snapshot));
  });

  it("中間値 (alpha=128) は触らない（前景でも背景でもない画素は不変）", () => {
    const buf = makeRgba(W, H, (x, y) => {
      if (x === 2 && y === 2) return 128;
      return x === 1 && y === 2 ? 255 : 0;
    });
    const out = dilateForegroundAlpha(buf, W, H);
    expect(alphaAtPixel(out, W, 2, 2)).toBe(128); // 中間値は不変
  });
});

describe("erodeForegroundAlpha — 前景画素の背景化", () => {
  it("4-neighbor に背景があれば 255→0 化", () => {
    const buf = centerSquareFG();
    const out = erodeForegroundAlpha(buf, W, H);
    // 3x3 前景の縁画素は 4-neighbor に背景があり、 背景化される
    expect(alphaAtPixel(out, W, 1, 1)).toBe(0); // 角
    expect(alphaAtPixel(out, W, 1, 2)).toBe(0); // 縁
    // 中央 (2,2) は 4-neighbor 全て前景なので残る
    expect(alphaAtPixel(out, W, 2, 2)).toBe(255);
  });

  it("入力を mutate しない", () => {
    const buf = centerSquareFG();
    const snapshot = new Uint8ClampedArray(buf);
    erodeForegroundAlpha(buf, W, H);
    expect(Array.from(buf)).toEqual(Array.from(snapshot));
  });
});

/* ── ③ closing: 服内の小穴を埋める ── */

describe("morphologicalCloseAlpha — closing 1 iter で前景小穴を埋める", () => {
  it("中央 1 px の穴は closing 1 iter で前景化される", () => {
    const buf = centerSquareFGWithHole();
    expect(alphaAtPixel(buf, W, 2, 2)).toBe(0); // 穴
    const out = morphologicalCloseAlpha(buf, W, H, 1);
    expect(alphaAtPixel(out, W, 2, 2)).toBe(255); // 埋まる
    // 既存前景は維持
    expect(alphaAtPixel(out, W, 1, 1)).toBe(255);
  });

  it("iter=0 で no-op だが copy を返す（同一参照ではない）", () => {
    const buf = centerSquareFG();
    const out = morphologicalCloseAlpha(buf, W, H, 0);
    expect(out).not.toBe(buf);
    expect(Array.from(out)).toEqual(Array.from(buf));
  });

  it("入力を mutate しない", () => {
    const buf = centerSquareFGWithHole();
    const snapshot = new Uint8ClampedArray(buf);
    morphologicalCloseAlpha(buf, W, H, 1);
    expect(Array.from(buf)).toEqual(Array.from(snapshot));
  });

  it("既定 iter=1: 服本体（中央 3x3）の外延は元と同じ範囲（服が膨らまない・痩せない）", () => {
    const buf = centerSquareFG();
    const out = morphologicalCloseAlpha(buf, W, H, 1);
    // 既存前景の範囲が closing で変わらないことを確認
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(alphaAtPixel(out, W, x, y)).toBe(255);
      }
    }
    // 背景画素も背景のまま（穴がない fixture なので変化なし）
    expect(alphaAtPixel(out, W, 0, 0)).toBe(0);
    expect(alphaAtPixel(out, W, 4, 4)).toBe(0);
  });
});

/* ── ④ opening（既定 OFF、 option） ── */

describe("morphologicalOpenAlpha — opening は既定 OFF, option で前景孤立点除去", () => {
  it("iter=1 で 1 px 孤立前景が消える", () => {
    const buf = isolatedFGPixel();
    expect(alphaAtPixel(buf, W, 0, 0)).toBe(255);
    const out = morphologicalOpenAlpha(buf, W, H, 1);
    expect(alphaAtPixel(out, W, 0, 0)).toBe(0); // 孤立点が消える
    // 大きな塊は残る（中央 (3,3) は 4-neighbor 全て前景）
    expect(alphaAtPixel(out, W, 3, 3)).toBe(255);
  });

  it("iter=0（既定）で no-op + copy", () => {
    const buf = isolatedFGPixel();
    const out = morphologicalOpenAlpha(buf, W, H, 0);
    expect(out).not.toBe(buf);
    expect(Array.from(out)).toEqual(Array.from(buf));
  });

  it("入力を mutate しない", () => {
    const buf = isolatedFGPixel();
    const snapshot = new Uint8ClampedArray(buf);
    morphologicalOpenAlpha(buf, W, H, 1);
    expect(Array.from(buf)).toEqual(Array.from(snapshot));
  });
});

/* ── ⑤ featherBackgroundEdgeAlpha（既定 OFF、 前景は絶対に触らない） ── */

describe("featherBackgroundEdgeAlpha — 背景側エッジのみ alpha 微増、 前景は不変", () => {
  it("bgFeatherAlpha=0（既定）で no-op + copy", () => {
    const buf = centerSquareFG();
    const out = featherBackgroundEdgeAlpha(buf, W, H, 0);
    expect(out).not.toBe(buf);
    expect(Array.from(out)).toEqual(Array.from(buf));
  });

  it("bgFeatherAlpha=64 で 前景隣接の背景画素が 0→64 に持ち上がる", () => {
    const buf = centerSquareFG();
    const out = featherBackgroundEdgeAlpha(buf, W, H, 64);
    expect(alphaAtPixel(out, W, 0, 1)).toBe(64); // 左側エッジ
    expect(alphaAtPixel(out, W, 1, 0)).toBe(64); // 上側エッジ
    // 4-neighbor に前景が無い角は 0 のまま
    expect(alphaAtPixel(out, W, 0, 0)).toBe(0);
  });

  it("前景画素 (alpha=255) は絶対に触らない（CEO「服を削らない」厳守）", () => {
    const buf = centerSquareFG();
    const out = featherBackgroundEdgeAlpha(buf, W, H, 100);
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(alphaAtPixel(out, W, x, y)).toBe(255);
      }
    }
  });

  it("中間値 (alpha=128) は触らない", () => {
    const buf = makeRgba(W, H, (x, y) => {
      if (x === 0 && y === 1) return 128;
      return x === 1 && y === 1 ? 255 : 0;
    });
    const out = featherBackgroundEdgeAlpha(buf, W, H, 64);
    expect(alphaAtPixel(out, W, 0, 1)).toBe(128); // 中間値は不変
  });

  it("bgFeatherAlpha の上限 127 を強制（halo 強度の半透明を超えない）", () => {
    const buf = centerSquareFG();
    const out = featherBackgroundEdgeAlpha(buf, W, H, 200);
    expect(alphaAtPixel(out, W, 0, 1)).toBe(127); // 上限
  });

  it("入力を mutate しない", () => {
    const buf = centerSquareFG();
    const snapshot = new Uint8ClampedArray(buf);
    featherBackgroundEdgeAlpha(buf, W, H, 64);
    expect(Array.from(buf)).toEqual(Array.from(snapshot));
  });
});

/* ── ⑥ applyPostProcessToRgba 統合（defaults で服を削らない・RGB は触らない） ── */

describe("applyPostProcessToRgba — defaults で「服 alpha 不変・RGB 不変・入力 mutate なし」", () => {
  it("defaults（closeIter=1）で前景 alpha は不変（中央 3x3 = 全て 255）", () => {
    const buf = centerSquareFG();
    const out = applyPostProcessToRgba(buf, W, H);
    for (let y = 1; y <= 3; y++) {
      for (let x = 1; x <= 3; x++) {
        expect(alphaAtPixel(out, W, x, y)).toBe(255);
      }
    }
  });

  it("defaults で前景の小穴が closing で埋まる", () => {
    const buf = centerSquareFGWithHole();
    const out = applyPostProcessToRgba(buf, W, H);
    expect(alphaAtPixel(out, W, 2, 2)).toBe(255);
  });

  it("defaults で opening は適用されない（1 px 孤立前景は残る）", () => {
    const buf = isolatedFGPixel();
    const out = applyPostProcessToRgba(buf, W, H);
    expect(alphaAtPixel(out, W, 0, 0)).toBe(255); // 既定 openIter=0 なので残る
  });

  it("RGB チャネルは全画素で不変（alpha のみ操作）", () => {
    const buf = makeRgba(
      W,
      H,
      (x, y) => (x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 255 : 0),
      (x, y) => [x * 30, y * 30, 100], // 一意な RGB パターン
    );
    const out = applyPostProcessToRgba(buf, W, H, { closeIter: 1, openIter: 1, bgFeatherAlpha: 64 });
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        expect(rgbAtPixel(out, W, x, y)).toEqual([x * 30, y * 30, 100]);
      }
    }
  });

  it("入力 data を mutate しない", () => {
    const buf = centerSquareFGWithHole();
    const snapshot = new Uint8ClampedArray(buf);
    applyPostProcessToRgba(buf, W, H, { closeIter: 1, openIter: 1, bgFeatherAlpha: 64 });
    expect(Array.from(buf)).toEqual(Array.from(snapshot));
  });

  it("全 no-op オプションでも入力を mutate せず copy を返す", () => {
    const buf = centerSquareFG();
    const out = applyPostProcessToRgba(buf, W, H, { closeIter: 0, openIter: 0, bgFeatherAlpha: 0 });
    expect(out).not.toBe(buf);
    expect(Array.from(out)).toEqual(Array.from(buf));
  });
});
