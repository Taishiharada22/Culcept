import { describe, it, expect } from "vitest";

import { getCaptureGuide } from "@/app/(immersive)/my-style/_lib/captureGuides";

describe("C1L-3 — category capture guides", () => {
  it("① outer / tops は縦長（portrait）・肩幅広めの frame", () => {
    for (const cat of ["outer", "tops"] as const) {
      const g = getCaptureGuide(cat);
      expect(g.aspect).toBe("portrait");
      expect(g.frame.height).toBeGreaterThan(g.frame.width); // 縦長
      const bottoms = getCaptureGuide("bottoms");
      expect(g.frame.width).toBeGreaterThan(bottoms.frame.width); // 肩幅広め（bottoms より広い）
    }
  });

  it("② bottoms は細長い縦枠（portrait・幅狭）", () => {
    const g = getCaptureGuide("bottoms");
    expect(g.aspect).toBe("portrait");
    expect(g.frame.height).toBeGreaterThan(g.frame.width);
    expect(g.frame.width).toBeLessThan(getCaptureGuide("tops").frame.width); // tops より細い
  });

  it("③ shoes は横長・低め（landscape）", () => {
    const g = getCaptureGuide("shoes");
    expect(g.aspect).toBe("landscape");
    expect(g.frame.width).toBeGreaterThan(g.frame.height);
  });

  it("④ bag は正方〜縦長（tops ほど高くない）", () => {
    const g = getCaptureGuide("bag");
    expect(g.frame.height).toBeGreaterThanOrEqual(g.frame.width); // 正方〜縦長
    expect(g.frame.height).toBeLessThan(getCaptureGuide("tops").frame.height); // tops より低い
  });

  it("⑤ unknown / null / other は general にフォールバック", () => {
    expect(getCaptureGuide(null).key).toBe("general");
    expect(getCaptureGuide(undefined).key).toBe("general");
    expect(getCaptureGuide("other").key).toBe("general");
    // 型外の未知値（ランタイム安全）
    expect(getCaptureGuide("zzz" as never).key).toBe("general");
  });

  it("⑥ 撮影ガイド文言がカテゴリごとに返る（基本指示 + カテゴリ別 1 行）", () => {
    const base = getCaptureGuide(null).instructions;
    expect(base.length).toBeGreaterThanOrEqual(3); // 基本指示
    const shoes = getCaptureGuide("shoes").instructions;
    const bag = getCaptureGuide("bag").instructions;
    expect(shoes.length).toBeGreaterThan(base.length); // カテゴリ別追加あり
    expect(shoes.some((t) => t.includes("床"))).toBe(true); // shoes 固有
    expect(bag.some((t) => t.includes("持ち手"))).toBe(true); // bag 固有
    // 全ガイドで「無地の背景」を案内
    expect(base.some((t) => t.includes("無地"))).toBe(true);
  });

  it("⑦ frame は正規化座標（0..1 内）で computeCutoutV1 prior に渡せる形", () => {
    for (const cat of ["outer", "tops", "bottoms", "shoes", "bag", "accessory", "other"] as const) {
      const f = getCaptureGuide(cat).frame;
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.width).toBeLessThanOrEqual(1);
      expect(f.y + f.height).toBeLessThanOrEqual(1);
    }
  });
});
