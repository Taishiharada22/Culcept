import { describe, it, expect, vi } from "vitest";

import type { WardrobeItem } from "@/lib/shared/wardrobe";
import { loadWardrobeWithServerFallback } from "@/app/(culcept)/plan/tabs/_calendar-outfit/wardrobeAssets";
import { toOutfitItemAsset } from "@/app/(culcept)/plan/tabs/_calendar-outfit/OutfitItemView";

/** 最小 WardrobeItem ファクトリ (必須: id/name/category/color) */
function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return { name: "アイテム", category: "other", color: "#999999", ...p } as WardrobeItem;
}

// IDB は画像付き正本 / server は画像 strip 版 (hosted URL のみ) の想定
const IDB_ITEMS = [
  w({ id: "idb1", name: "IDBシャツ", categoryMain: "tops", color: "#ffffff", imageUrl: "data:image/png;base64,AAAA" }),
];
const SERVER_ITEMS = [
  w({ id: "srv1", name: "サーバTシャツ", categoryMain: "tops", color: "#eeeeee" }), // imageUrl なし (strip 済想定)
];

describe("loadWardrobeWithServerFallback — IDB-first → server fallback → []", () => {
  it("① IDB に 1 件以上 → server を呼ばず IDB を返す (本番体験を劣化させない)", async () => {
    const loadServer = vi.fn(async () => SERVER_ITEMS);
    const res = await loadWardrobeWithServerFallback({ loadIdb: async () => IDB_ITEMS, loadServer });
    expect(res).toBe(IDB_ITEMS);
    expect(loadServer).not.toHaveBeenCalled();
  });

  it("② IDB 空 → server wardrobe を返す (preview / 新端末)", async () => {
    const res = await loadWardrobeWithServerFallback({ loadIdb: async () => [], loadServer: async () => SERVER_ITEMS });
    expect(res).toBe(SERVER_ITEMS);
  });

  it("③ IDB 空 + server 空 → [] (caller が mock 維持)", async () => {
    const res = await loadWardrobeWithServerFallback({ loadIdb: async () => [], loadServer: async () => [] });
    expect(res).toEqual([]);
  });

  it("④ server error → [] (fail-open・throw しない / 401・network 想定)", async () => {
    const res = await loadWardrobeWithServerFallback({
      loadIdb: async () => [],
      loadServer: async () => {
        throw new Error("401 / network error");
      },
    });
    expect(res).toEqual([]);
  });

  it("④b server が非配列を返しても → []", async () => {
    const res = await loadWardrobeWithServerFallback({
      loadIdb: async () => [],
      loadServer: async () => null as unknown as WardrobeItem[],
    });
    expect(res).toEqual([]);
  });

  it("⑤ server wardrobe が画像なしでも属性 (color/category) は保持され、 表示は silhouette に落ちる", async () => {
    const res = await loadWardrobeWithServerFallback({ loadIdb: async () => [], loadServer: async () => SERVER_ITEMS });
    const item = res[0];
    expect(item.color).toBe("#eeeeee"); // engine スコア用属性は残る
    // 画像なし item → 表示アセットへ写像すると placeholder (SVG silhouette)。 破綻しない。
    const asset = toOutfitItemAsset({
      id: item.id,
      label: item.name ?? "アイテム",
      category: "トップス",
      shape: "top",
      color: item.color,
      ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
    });
    expect(asset.kind).toBe("placeholder");
  });

  it("⑥ default (引数なし) は実 reader/fetcher を使い、 node (IDB/window なし) でも throw せず配列を返す", async () => {
    // 実 loadWardrobeImagesFromMyStyleIDB → [] (SSR guard)、 実 fetchWardrobe → fail-open → []
    const res = await loadWardrobeWithServerFallback();
    expect(Array.isArray(res)).toBe(true);
  });
});
