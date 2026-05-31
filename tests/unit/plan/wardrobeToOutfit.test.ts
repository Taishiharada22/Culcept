import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/lib/shared/wardrobe";
import {
  hydrateOutfitVM,
  shapeOfWardrobe,
  slotOfWardrobe,
  hasUsableImage,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/wardrobeToOutfit";
import { MOCK_CALENDAR_OUTFIT_VM as MOCK } from "@/app/(culcept)/plan/tabs/_calendar-outfit/mockCalendarOutfit";
import { toOutfitItemAsset } from "@/app/(culcept)/plan/tabs/_calendar-outfit/OutfitItemView";
import { loadWardrobeImagesFromMyStyleIDB } from "@/app/(culcept)/plan/tabs/_calendar-outfit/wardrobeAssets";

/** 最小 WardrobeItem ファクトリ (必須: id/name/category/color) */
function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return { name: "アイテム", category: "other", color: "#999999", ...p } as WardrobeItem;
}

const DATA_URL = "data:image/png;base64,AAAA";

describe("category → shape / slot mapping (証拠ベース)", () => {
  it("categoryMain を優先: bag→bag / accessory→watch", () => {
    expect(shapeOfWardrobe(w({ id: "a", categoryMain: "bag", category: "accessories", color: "#000" }))).toBe("bag");
    expect(shapeOfWardrobe(w({ id: "b", categoryMain: "accessory", category: "accessories", color: "#000" }))).toBe("watch");
  });
  it("categoryMain が無ければ legacy category にフォールバック", () => {
    expect(shapeOfWardrobe(w({ id: "c", category: "outerwear", color: "#000" }))).toBe("outer");
    expect(shapeOfWardrobe(w({ id: "d", category: "tops", color: "#000" }))).toBe("top");
  });
  it("対応の無いカテゴリは shape / slot ともに undefined (other のみ)", () => {
    // D3-3 更新: legacy "hat" は engine D2-1 で accessory pool に migration 済 → slot も accessory に整合。
    // shape 側は依然 silhouette マッピングが無いので undefined のまま（hat 専用 silhouette shape 不在）。
    expect(shapeOfWardrobe(w({ id: "e", category: "hat", color: "#000" }))).toBeUndefined();
    expect(slotOfWardrobe(w({ id: "g", categoryMain: "other", category: "other", color: "#000" }))).toBeUndefined();
  });
  it("D3-3: legacy category=hat → slot 'accessory'（engine D2-1 migration と整合）", () => {
    expect(slotOfWardrobe(w({ id: "f", category: "hat", color: "#000" }))).toBe("accessory");
  });
  it("slotOfWardrobe: categoryMain bag → bag スロット", () => {
    expect(slotOfWardrobe(w({ id: "h", categoryMain: "bag", category: "other", color: "#000" }))).toBe("bag");
  });
  it("hasUsableImage: 空文字や undefined は false", () => {
    expect(hasUsableImage(w({ id: "i", color: "#000" }))).toBe(false);
    expect(hasUsableImage(w({ id: "j", color: "#000", imageUrl: "   " }))).toBe(false);
    expect(hasUsableImage(w({ id: "k", color: "#000", imageUrl: DATA_URL }))).toBe(true);
  });
});

describe("hydrateOutfitVM — fallback (退化ゼロ)", () => {
  it("空 wardrobe → mock を同じ参照で返す", () => {
    expect(hydrateOutfitVM(MOCK, [])).toBe(MOCK);
  });
  it("画像なしアイテムだけ → mock を同じ参照で返す (= 退化しない)", () => {
    const noImg = [
      w({ id: "n1", name: "白T", category: "tops", categoryMain: "tops", color: "#fff" }),
      w({ id: "n2", name: "黒パンツ", category: "bottoms", categoryMain: "bottoms", color: "#111" }),
    ];
    expect(hydrateOutfitVM(MOCK, noImg)).toBe(MOCK);
  });
  it("D3-3 更新: hat 画像は accessory slot に hydrate される（engine migration と整合）", () => {
    // 以前は hat → undefined slot で mock そのまま返却だったが、 D2-1 engine の "hat" → accessory pool
    // migration に hydrate 側も整合させたため、 hat も accessory slot で hydrate される。 mock とは異なる ref。
    const hatImg = w({ id: "hat1", name: "ハット", category: "hat", color: "#333", imageUrl: DATA_URL });
    const out = hydrateOutfitVM(MOCK, [hatImg]);
    expect(out).not.toBe(MOCK);
    // mock smart proposal (index 1) のみ accessory slot を持つ → ハットがそこに入る
    const hydratedAcc = out.proposals.flatMap((p) => p.items.filter((i) => i.label === "ハット"));
    expect(hydratedAcc.length).toBeGreaterThanOrEqual(1);
  });
});

describe("hydrateOutfitVM — upgrade (実画像が来たら withImage)", () => {
  const topsImg = w({
    id: "t1",
    name: "リネンシャツ",
    category: "tops",
    categoryMain: "tops",
    color: "#eee",
    colorHex: "#eeeeee",
    imageUrl: DATA_URL,
  });
  const out = hydrateOutfitVM(MOCK, [topsImg]);

  it("画像ありの tops が来たら mock とは別オブジェクトを返す", () => {
    expect(out).not.toBe(MOCK);
  });
  it("tops スロットに imageUrl が載り、 toOutfitItemAsset で withImage に到達する", () => {
    const hydrated = out.proposals.flatMap((p) => p.items).filter((it) => it.imageUrl === DATA_URL);
    expect(hydrated.length).toBeGreaterThan(0);
    expect(toOutfitItemAsset(hydrated[0]).kind).toBe("withImage");
  });
  it("label は wardrobe の name、 color は colorHex 優先", () => {
    const hydrated = out.proposals.flatMap((p) => p.items).find((it) => it.imageUrl === DATA_URL)!;
    expect(hydrated.label).toBe("リネンシャツ");
    expect(hydrated.color).toBe("#eeeeee");
  });
  it("提案の枠 (タイトル/SYNC) と他セクションは不変", () => {
    expect(out.reason).toBe(MOCK.reason);
    expect(out.weather).toBe(MOCK.weather);
    expect(out.sync).toBe(MOCK.sync);
    expect(out.wardrobeStats).toBe(MOCK.wardrobeStats);
    expect(out.proposals[0].title).toBe(MOCK.proposals[0].title);
    expect(out.proposals[0].syncScore).toBe(MOCK.proposals[0].syncScore);
  });
  it("画像が無いスロット (例: bottoms) は mock item を同一参照で維持 (混在表示・退化ゼロ)", () => {
    const mockOffice = MOCK.proposals[0];
    const outOffice = out.proposals[0];
    const bottomIdx = mockOffice.items.findIndex((it) => it.shape === "bottom");
    expect(bottomIdx).toBeGreaterThanOrEqual(0);
    expect(outOffice.items[bottomIdx]).toBe(mockOffice.items[bottomIdx]);
  });
});

describe("loadWardrobeImagesFromMyStyleIDB — 安全フォールバック", () => {
  it("browser / indexedDB / databases() が無い環境では throw せず [] を返す", async () => {
    await expect(loadWardrobeImagesFromMyStyleIDB()).resolves.toEqual([]);
  });
});
