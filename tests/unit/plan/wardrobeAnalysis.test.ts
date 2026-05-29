import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/lib/shared/wardrobe";
import type { OutfitDayContext } from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitEventProjection";
import type {
  CalendarOutfitStatVM,
  CalendarOutfitWeatherVM,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/types";
import { buildWardrobeStats } from "@/app/(culcept)/plan/tabs/_calendar-outfit/wardrobeAnalysis";

function wItem(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return { name: "アイテム", category: "tops", color: "#cccccc", ...p } as WardrobeItem;
}

function dayCtx(p: Partial<OutfitDayContext> = {}): OutfitDayContext {
  return {
    dominantActivity: "unknown",
    maxFormality: "unknown",
    mobility: "unknown",
    hasMeeting: false,
    hasMeal: false,
    hasOutdoor: false,
    hasCafeWork: false,
    hasClientOrFormal: false,
    reasonTags: [],
    eventCount: 0,
    ...p,
  };
}

const NO_WEATHER = null;
const RAINY: CalendarOutfitWeatherVM = { icon: "🌧️", label: "雨", tempMax: 18, tempMin: 12, pop: 70 };

function byId(stats: CalendarOutfitStatVM[], id: string): CalendarOutfitStatVM {
  return stats.find((s) => s.id === id)!;
}

describe("buildWardrobeStats — 構造 & fallback", () => {
  it("wardrobe 空 → null (mock 維持)", () => {
    expect(buildWardrobeStats({ wardrobe: [], weather: NO_WEATHER, dayContext: dayCtx() })).toBeNull();
  });

  it("常に 5 カード (id/label 固定)", () => {
    const stats = buildWardrobeStats({
      wardrobe: [wItem({ id: "t1", category: "tops" })],
      weather: NO_WEATHER,
      dayContext: dayCtx(),
    })!;
    expect(stats).toHaveLength(5);
    expect(stats.map((s) => s.id)).toEqual(["stat-top", "stat-bottom", "stat-rain", "stat-walk", "stat-color"]);
    expect(byId(stats, "stat-top").label).toBe("トップス");
  });
});

describe("buildWardrobeStats — カテゴリ充足", () => {
  it("tops 4 → 余裕あり / 2 → 良好 / 1 → 最低限 / 0 → 不足", () => {
    const mk = (n: number) =>
      buildWardrobeStats({
        wardrobe: Array.from({ length: n }, (_, i) => wItem({ id: `t${i}`, category: "tops", color: `#${i}${i}${i}` })),
        weather: NO_WEATHER,
        dayContext: dayCtx(),
      });
    expect(byId(mk(4)!, "stat-top").value).toBe("余裕あり");
    expect(byId(mk(2)!, "stat-top").value).toBe("良好");
    expect(byId(mk(1)!, "stat-top").value).toBe("最低限");
    // 0 tops でも他カテゴリがあれば配列は返る
    const noTops = buildWardrobeStats({
      wardrobe: [wItem({ id: "b1", category: "bottoms" })],
      weather: NO_WEATHER,
      dayContext: dayCtx(),
    })!;
    expect(byId(noTops, "stat-top").value).toBe("不足");
    expect(byId(noTops, "stat-bottom").value).toBe("最低限");
  });
});

describe("buildWardrobeStats — 防水 (断定しない)", () => {
  it("waterproof/repellent あり → 備えあり", () => {
    const stats = buildWardrobeStats({
      wardrobe: [wItem({ id: "o1", category: "outerwear", attributes: { water: "waterproof" } })],
      weather: RAINY,
      dayContext: dayCtx(),
    })!;
    expect(byId(stats, "stat-rain").value).toBe("備えあり");
  });
  it("water 情報なし → 確認推奨 (断定しない)", () => {
    const stats = buildWardrobeStats({
      wardrobe: [wItem({ id: "t1", category: "tops" })],
      weather: RAINY,
      dayContext: dayCtx(),
    })!;
    expect(byId(stats, "stat-rain").value).toBe("確認推奨");
  });
  it("water データあり・雨対応ゼロ・降水高 → やや不足、 降水低 → 標準", () => {
    const dry = buildWardrobeStats({
      wardrobe: [wItem({ id: "t1", attributes: { water: "none" } })],
      weather: { icon: "☀️", label: "晴れ", tempMax: 24, tempMin: 16, pop: 10 },
      dayContext: dayCtx(),
    })!;
    expect(byId(dry, "stat-rain").value).toBe("標準");
    const wet = buildWardrobeStats({
      wardrobe: [wItem({ id: "t1", attributes: { water: "none" } })],
      weather: RAINY,
      dayContext: dayCtx(),
    })!;
    expect(byId(wet, "stat-rain").value).toBe("やや不足");
  });
});

describe("buildWardrobeStats — 歩きやすさ", () => {
  it("移動多め × 靴あり → 良好 / 靴なし → やや不足", () => {
    const withShoes = buildWardrobeStats({
      wardrobe: [wItem({ id: "s1", category: "shoes" })],
      weather: NO_WEATHER,
      dayContext: dayCtx({ mobility: "high" }),
    })!;
    expect(byId(withShoes, "stat-walk").value).toBe("良好");
    const noShoes = buildWardrobeStats({
      wardrobe: [wItem({ id: "t1", category: "tops" })],
      weather: NO_WEATHER,
      dayContext: dayCtx({ mobility: "high" }),
    })!;
    expect(byId(noShoes, "stat-walk").value).toBe("やや不足");
  });
  it("移動少 × 靴あり → 標準 (断定しない)", () => {
    const stats = buildWardrobeStats({
      wardrobe: [wItem({ id: "s1", category: "shoes" })],
      weather: NO_WEATHER,
      dayContext: dayCtx({ mobility: "low" }),
    })!;
    expect(byId(stats, "stat-walk").value).toBe("標準");
  });
});

describe("buildWardrobeStats — カラー相性", () => {
  it("4 色以上 → とても良い、 1 色 → 標準", () => {
    const many = buildWardrobeStats({
      wardrobe: [
        wItem({ id: "a", colorHex: "#111" }),
        wItem({ id: "b", colorHex: "#222" }),
        wItem({ id: "c", colorHex: "#333" }),
        wItem({ id: "d", colorHex: "#444" }),
      ],
      weather: NO_WEATHER,
      dayContext: dayCtx(),
    })!;
    expect(byId(many, "stat-color").value).toBe("とても良い");
    const one = buildWardrobeStats({
      wardrobe: [wItem({ id: "a", colorHex: "#111" }), wItem({ id: "b", colorHex: "#111" })],
      weather: NO_WEATHER,
      dayContext: dayCtx(),
    })!;
    expect(byId(one, "stat-color").value).toBe("標準");
  });
});
