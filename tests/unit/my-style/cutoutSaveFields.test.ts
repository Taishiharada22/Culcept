import { describe, it, expect } from "vitest";

import { cutoutResultToItemFields, type CutoutBrowserResult } from "@/app/(immersive)/my-style/_lib/cutoutBrowser";
import { normalizeSavedState } from "@/app/(immersive)/my-style/_lib/state";
import type { CutoutStatus } from "@/app/(immersive)/my-style/_lib/backgroundRemovalV1";

function result(status: CutoutStatus, dataUrl: string | undefined, confidence: number): CutoutBrowserResult {
  return { status, confidence, method: "heuristic_v1", ...(dataUrl ? { dataUrl } : {}) };
}

describe("C1L-4b — cutoutResultToItemFields（保存フィールド写像）", () => {
  it("① success → cutoutUrl / cutoutStatus=success / method=heuristic_v1", () => {
    const f = cutoutResultToItemFields(result("success", "data:img/CUT", 0.82));
    expect(f.cutoutUrl).toBe("data:img/CUT");
    expect(f.cutoutStatus).toBe("success");
    expect(f.cutoutMethod).toBe("heuristic_v1");
    expect(f.cutoutConfidence).toBeCloseTo(0.82); // ⑤ confidence 保存
  });

  it("② needs_review → cutoutUrl 保存（候補）/ status=needs_review / method=heuristic_v1", () => {
    const f = cutoutResultToItemFields(result("needs_review", "data:img/REV", 0.5));
    expect(f.cutoutUrl).toBe("data:img/REV");
    expect(f.cutoutStatus).toBe("needs_review");
    expect(f.cutoutMethod).toBe("heuristic_v1");
  });

  it("③ failed → cutoutUrl なし / status=failed / method=none", () => {
    const f = cutoutResultToItemFields(result("failed", undefined, 0.2));
    expect(f.cutoutUrl).toBeUndefined();
    expect(f.cutoutStatus).toBe("failed");
    expect(f.cutoutMethod).toBe("none");
  });

  it("④ skipped → cutoutUrl なし / status=skipped / method=none", () => {
    const f = cutoutResultToItemFields(result("skipped", undefined, 0));
    expect(f.cutoutUrl).toBeUndefined();
    expect(f.cutoutStatus).toBe("skipped");
    expect(f.cutoutMethod).toBe("none");
  });

  it("補: success でも dataUrl 欠落（encode 失敗）なら cutoutUrl なし・status は success・method=heuristic_v1", () => {
    const f = cutoutResultToItemFields(result("success", undefined, 0.9));
    expect(f.cutoutUrl).toBeUndefined();
    expect(f.cutoutStatus).toBe("success");
    expect(f.cutoutMethod).toBe("heuristic_v1");
  });
});

describe("C1L-4b — normalizeSavedState が cutout fields を保持する", () => {
  it("⑥ cutout fields つき item が normalize 後も保持される", () => {
    const raw = {
      wardrobe: [
        {
          id: "ck1",
          name: "ネイビーブルゾン",
          category: "outerwear",
          color: "navy",
          imageUrl: "https://cdn.example.com/x.png",
          cutoutUrl: "data:image/png;base64,CUT",
          cutoutStatus: "success",
          cutoutConfidence: 0.77,
          cutoutMethod: "heuristic_v1",
        },
      ],
    };
    const norm = normalizeSavedState(raw);
    const item = norm.wardrobe.find((w) => w.id === "ck1");
    expect(item).toBeTruthy();
    expect(item!.cutoutUrl).toBe("data:image/png;base64,CUT");
    expect(item!.cutoutStatus).toBe("success");
    expect(item!.cutoutConfidence).toBeCloseTo(0.77);
    expect(item!.cutoutMethod).toBe("heuristic_v1");
  });

  it("⑦ legacy item（imageUrl のみ・cutout fields 無し）が normalize 後も壊れない", () => {
    const raw = {
      wardrobe: [{ id: "lg1", name: "白T", category: "tops", color: "white", imageUrl: "https://cdn.example.com/t.png" }],
    };
    const norm = normalizeSavedState(raw);
    const item = norm.wardrobe.find((w) => w.id === "lg1");
    expect(item).toBeTruthy();
    expect(item!.imageUrl).toBe("https://cdn.example.com/t.png");
    expect(item!.cutoutUrl).toBeUndefined(); // 既存 item は cutout 無しのまま
    expect(item!.cutoutStatus).toBeUndefined();
  });
});
