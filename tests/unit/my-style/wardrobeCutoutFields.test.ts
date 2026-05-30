import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import { stripHeavyImageUrls } from "@/app/(immersive)/my-style/_lib/state";

const DATA_URL = "data:image/png;base64," + "A".repeat(5000);
const HTTPS = "https://cdn.example.com/x.png";
const HTTPS_LONG = "https://cdn.example.com/" + "q".repeat(2100) + ".png";

function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return { name: "item", category: "tops", color: "#000", ...p } as WardrobeItem;
}

describe("C1L-1 — WardrobeItem cutout fields + stripHeavyImageUrls", () => {
  it("① legacy item（imageUrl だけ）が壊れない・cutout fields は単に無い", () => {
    const legacy = w({ id: "a", imageUrl: HTTPS });
    const [out] = stripHeavyImageUrls([legacy]);
    expect(out.id).toBe("a");
    expect(out.imageUrl).toBe(HTTPS); // 軽量 https は保持
    expect(out.cutoutUrl).toBeUndefined();
    expect(out.originalUrl).toBeUndefined();
    expect(out.cutoutStatus).toBeUndefined();
  });

  it("② optional cutout fields つき item が型として扱える", () => {
    const item = w({
      id: "b",
      originalUrl: HTTPS,
      cutoutUrl: HTTPS,
      cutoutStatus: "success",
      cutoutConfidence: 0.82,
      cutoutMethod: "heuristic_v1",
    });
    // 型として成立し、 値が読める（コンパイル + ランタイム）
    expect(item.cutoutStatus).toBe("success");
    expect(item.cutoutConfidence).toBeCloseTo(0.82);
    expect(item.cutoutMethod).toBe("heuristic_v1");
  });

  it("③ strip で cutoutUrl の data URL が落ちる", () => {
    const [out] = stripHeavyImageUrls([w({ id: "c", cutoutUrl: DATA_URL })]);
    expect(out.cutoutUrl).toBeUndefined();
  });

  it("④ strip で originalUrl の data URL が落ちる", () => {
    const [out] = stripHeavyImageUrls([w({ id: "d", originalUrl: DATA_URL })]);
    expect(out.originalUrl).toBeUndefined();
  });

  it("⑤ cutoutStatus / cutoutConfidence / cutoutMethod は strip 後も残る", () => {
    const [out] = stripHeavyImageUrls([
      w({ id: "e", cutoutUrl: DATA_URL, cutoutStatus: "needs_review", cutoutConfidence: 0.5, cutoutMethod: "manual" }),
    ]);
    expect(out.cutoutUrl).toBeUndefined(); // 重い画像は落ちる
    expect(out.cutoutStatus).toBe("needs_review"); // メタは残る
    expect(out.cutoutConfidence).toBe(0.5);
    expect(out.cutoutMethod).toBe("manual");
  });

  it("⑥ imageUrl の既存 strip 挙動が変わらない（data: 落とす / 軽量 https 残す / 長すぎ落とす）", () => {
    const [dataOut] = stripHeavyImageUrls([w({ id: "f", imageUrl: DATA_URL })]);
    expect(dataOut.imageUrl).toBeUndefined();
    const [httpsOut] = stripHeavyImageUrls([w({ id: "g", imageUrl: HTTPS })]);
    expect(httpsOut.imageUrl).toBe(HTTPS);
    const [longOut] = stripHeavyImageUrls([w({ id: "h", imageUrl: HTTPS_LONG })]);
    expect(longOut.imageUrl).toBeUndefined(); // 2048 以上は従来どおり落とす
  });

  it("⑦ 入力 object を破壊しない（純関数）", () => {
    const input = w({ id: "i", imageUrl: DATA_URL, cutoutUrl: DATA_URL });
    const out = stripHeavyImageUrls([input]);
    expect(input.imageUrl).toBe(DATA_URL); // 元は不変
    expect(input.cutoutUrl).toBe(DATA_URL);
    expect(out[0]).not.toBe(input); // 新 object
  });

  it("補: server snapshot 相当に直列化しても cutout base64 が載らない（肥大化しない）", () => {
    const stripped = stripHeavyImageUrls([
      w({ id: "j", imageUrl: DATA_URL, originalUrl: DATA_URL, cutoutUrl: DATA_URL, cutoutStatus: "success" }),
    ]);
    const json = JSON.stringify(stripped);
    expect(json).not.toContain("base64");
    expect(json).toContain("success"); // 軽量メタは残る
  });
});
