import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/lib/shared/wardrobe";
import {
  getWardrobeDisplayImageUrl,
  hasUsableImage,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/wardrobeToOutfit";

function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return { name: "item", category: "tops", color: "#000", ...p } as WardrobeItem;
}

const IMG = "data:image/jpeg;base64,IMG";
const CUT = "data:image/png;base64,CUT";

describe("C1L-5 — getWardrobeDisplayImageUrl（/plan 表示画像の status gate）", () => {
  it("① success + cutoutUrl → cutoutUrl を使う", () => {
    expect(getWardrobeDisplayImageUrl(w({ id: "a", imageUrl: IMG, cutoutUrl: CUT, cutoutStatus: "success" }))).toBe(CUT);
  });

  it("② success + cutoutUrl なし → imageUrl fallback", () => {
    expect(getWardrobeDisplayImageUrl(w({ id: "b", imageUrl: IMG, cutoutStatus: "success" }))).toBe(IMG);
  });

  it("③ needs_review + cutoutUrl → imageUrl fallback（甘い cutout を /plan に出さない）", () => {
    expect(getWardrobeDisplayImageUrl(w({ id: "c", imageUrl: IMG, cutoutUrl: CUT, cutoutStatus: "needs_review" }))).toBe(IMG);
  });

  it("④ failed + cutoutUrl → imageUrl fallback", () => {
    expect(getWardrobeDisplayImageUrl(w({ id: "d", imageUrl: IMG, cutoutUrl: CUT, cutoutStatus: "failed" }))).toBe(IMG);
  });

  it("⑤ skipped + cutoutUrl → imageUrl fallback", () => {
    expect(getWardrobeDisplayImageUrl(w({ id: "e", imageUrl: IMG, cutoutUrl: CUT, cutoutStatus: "skipped" }))).toBe(IMG);
  });

  it("⑥ legacy（imageUrl のみ・cutout fields 無し）→ imageUrl", () => {
    expect(getWardrobeDisplayImageUrl(w({ id: "f", imageUrl: IMG }))).toBe(IMG);
  });

  it("⑦ imageUrl も cutout も無い → undefined（silhouette fallback）", () => {
    const url = getWardrobeDisplayImageUrl(w({ id: "g" }));
    expect(url).toBeUndefined();
    expect(hasUsableImage(w({ id: "g" }))).toBe(false);
  });

  it("⑧ manual method + success → cutoutUrl を使う（method ではなく status で判定）", () => {
    const item = w({ id: "h", imageUrl: IMG, cutoutUrl: CUT, cutoutStatus: "success", cutoutMethod: "manual" });
    expect(getWardrobeDisplayImageUrl(item)).toBe(CUT);
    expect(hasUsableImage(item)).toBe(true);
  });

  it("補: success cutout があれば imageUrl 無しでも hasUsableImage=true", () => {
    expect(hasUsableImage(w({ id: "i", cutoutUrl: CUT, cutoutStatus: "success" }))).toBe(true);
  });
});
