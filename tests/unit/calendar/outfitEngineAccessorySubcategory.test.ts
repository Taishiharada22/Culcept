import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import type { WeatherDaily } from "@/app/(culcept)/calendar/_lib/types";
import {
  accessorySubcategoryTier,
  buildAccessoryContext,
  selectAccessories,
  generateDayProposal,
  type AccessoryContext,
} from "@/app/(culcept)/calendar/_lib/outfitEngine";

/**
 * D4 — accessory subcategory 別 eligibility gating（hat/belt/jewelry/scarf）。
 *
 * 不変原則（CEO 補正 5 点反映）:
 *   ① hat: 雨日は **suppressed**（後ろへ）であって除外ではない — hat しか無い場合でも採用される
 *   ② outdoor 判定は実 event_type "outdoor"（推測しない）、 hotSunny は temp_max>=28 で安全判定
 *   ③ belt: bottoms あり前提で casual でも採用可
 *   ④ jewelry: dress 優先、 smart では suppressed（除外ではなく後ろ・1 種しか無ければ採用）
 *   ⑤ scarf cold 優先（D3-2）は壊さない
 *
 * 共通: scoreCandidate 不接触 / D1 helper 不接触 / OutfitCollage 不接触 / supplemental 不変
 */

function acc(id: string, subcat: string, extras: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id,
    name: id,
    category: "other",
    categoryMain: "accessory",
    color: "#000",
    subcategory: `subcategory.${subcat}`,
    ...extras,
  } as WardrobeItem;
}

const HAT = acc("hat-1", "hat");
const BELT = acc("belt-1", "belt");
const JEWELRY = acc("jewelry-1", "jewelry");
const SCARF = acc("scarf-1", "scarf");

const HOT_SUNNY: WeatherDaily = { weather_icon: "sun", temp_min: 25, temp_max: 30, pop_max: 0, pop_blocks: null, outfit_tag: "normal" };
const RAIN: WeatherDaily = { weather_icon: "rain", temp_min: 18, temp_max: 22, pop_max: 80, pop_blocks: null, outfit_tag: "rain" };
const MILD: WeatherDaily = { weather_icon: "cloud", temp_min: 18, temp_max: 22, pop_max: 10, pop_blocks: null, outfit_tag: "normal" };
const COLD: WeatherDaily = { weather_icon: "cloud", temp_min: 4, temp_max: 8, pop_max: 10, pop_blocks: null, outfit_tag: "normal" };

const pickFirst = (pool: WardrobeItem[]): WardrobeItem | null => pool[0] ?? null;

// ── buildAccessoryContext ────────────────────────────────

describe("buildAccessoryContext — 既存 field のみで安全判定", () => {
  it("hotSunny: temp_max>=28 + 晴れ系で true", () => {
    const ctx = buildAccessoryContext([], HOT_SUNNY, [], "casual");
    expect(ctx.hotSunny).toBe(true);
  });
  it("hotSunny: 雨日 27°C → false", () => {
    expect(buildAccessoryContext([], { ...RAIN, temp_max: 27 }, [], "casual").hotSunny).toBe(false);
  });
  it("rainy: weather_icon=rain → true", () => {
    expect(buildAccessoryContext([], RAIN, [], "casual").rainy).toBe(true);
  });
  it("outdoorEvent: 実 event_type 'outdoor' のみ true（推測しない）", () => {
    expect(buildAccessoryContext([], MILD, [{ event_type: "outdoor" }], "casual").outdoorEvent).toBe(true);
    expect(buildAccessoryContext([], MILD, [{ event_type: "hiking" }], "casual").outdoorEvent).toBe(false);
  });
  it("hasBottoms: selectedItems に bottoms があれば true", () => {
    const items = [{ id: "b", categoryMain: "bottoms" } as WardrobeItem];
    expect(buildAccessoryContext(items, MILD, [], "casual").hasBottoms).toBe(true);
    expect(buildAccessoryContext([], MILD, [], "casual").hasBottoms).toBe(false);
  });
  it("baseFormality: dress / smart / casual に正規化", () => {
    const dressItem = [{ id: "d", formality: "dress" } as WardrobeItem];
    expect(buildAccessoryContext(dressItem, MILD, [], "casual").baseFormality).toBe("dress");
    expect(buildAccessoryContext([], MILD, [], "smart").baseFormality).toBe("smart");
    expect(buildAccessoryContext([], MILD, [], "unknown").baseFormality).toBe("casual");
  });
});

// ── accessorySubcategoryTier ─────────────────────────────

function ctxOf(over: Partial<AccessoryContext> = {}): AccessoryContext {
  return {
    hotSunny: false,
    rainy: false,
    outdoorEvent: false,
    hasBottoms: true,
    baseFormality: "casual",
    ...over,
  };
}

describe("accessorySubcategoryTier — subcategory 別 tier 判定", () => {
  it("scarf は常に normal（cold は selectAccessories 側で別途強制 = D3-2 維持）", () => {
    expect(accessorySubcategoryTier(SCARF, ctxOf())).toBe("normal");
    expect(accessorySubcategoryTier(SCARF, ctxOf({ rainy: true }))).toBe("normal");
  });
  it("hat: hotSunny + outdoor → preferred", () => {
    expect(accessorySubcategoryTier(HAT, ctxOf({ hotSunny: true, outdoorEvent: true }))).toBe("preferred");
  });
  it("hat: rainy → suppressed（除外ではない・補正 1）", () => {
    expect(accessorySubcategoryTier(HAT, ctxOf({ rainy: true }))).toBe("suppressed");
  });
  it("hat: それ以外（曇り通常日）→ normal", () => {
    expect(accessorySubcategoryTier(HAT, ctxOf())).toBe("normal");
  });
  it("belt: bottoms なし → suppressed", () => {
    expect(accessorySubcategoryTier(BELT, ctxOf({ hasBottoms: false }))).toBe("suppressed");
  });
  it("belt: bottoms あり + casual → normal（採用可・補正 3）", () => {
    expect(accessorySubcategoryTier(BELT, ctxOf({ hasBottoms: true, baseFormality: "casual" }))).toBe("normal");
  });
  it("belt: bottoms あり + smart/dress → preferred", () => {
    expect(accessorySubcategoryTier(BELT, ctxOf({ hasBottoms: true, baseFormality: "smart" }))).toBe("preferred");
    expect(accessorySubcategoryTier(BELT, ctxOf({ hasBottoms: true, baseFormality: "dress" }))).toBe("preferred");
  });
  it("jewelry: dress → preferred", () => {
    expect(accessorySubcategoryTier(JEWELRY, ctxOf({ baseFormality: "dress" }))).toBe("preferred");
  });
  it("jewelry: smart → suppressed（補正 4: 控えめ・除外ではない）", () => {
    expect(accessorySubcategoryTier(JEWELRY, ctxOf({ baseFormality: "smart" }))).toBe("suppressed");
  });
  it("jewelry: casual → suppressed", () => {
    expect(accessorySubcategoryTier(JEWELRY, ctxOf({ baseFormality: "casual" }))).toBe("suppressed");
  });
});

// ── selectAccessories with ctx（hard filter なし・除外しない）──────

describe("selectAccessories with D4 ctx — supplemental 不変（除外しない）", () => {
  it("hat しか無い + 雨日 → hat 1 件は採用される（suppressed でも 1 種しかなければ残る）", () => {
    const out = selectAccessories({
      pool: [HAT],
      count: 1,
      coldDay: false,
      pick: pickFirst,
      ctx: ctxOf({ rainy: true, baseFormality: "smart" }),
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("hat-1");
  });

  it("jewelry しか無い + smart → jewelry 採用（補正 4: 後ろでも 1 種しか無ければ残る）", () => {
    const out = selectAccessories({
      pool: [JEWELRY],
      count: 1,
      coldDay: false,
      pick: pickFirst,
      ctx: ctxOf({ baseFormality: "smart" }),
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("jewelry-1");
  });

  it("smart + belt + jewelry → belt が優先採用（jewelry は suppressed）", () => {
    const out = selectAccessories({
      pool: [JEWELRY, BELT],
      count: 1,
      coldDay: false,
      pick: pickFirst,
      ctx: ctxOf({ hasBottoms: true, baseFormality: "smart" }),
    });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("belt-1");
  });

  it("dress + belt + jewelry + 2 件 → belt(preferred) と jewelry(preferred) 両方", () => {
    const out = selectAccessories({
      pool: [BELT, JEWELRY, HAT],
      count: 2,
      coldDay: false,
      pick: pickFirst,
      ctx: ctxOf({ hasBottoms: true, baseFormality: "dress" }),
    });
    expect(out).toHaveLength(2);
    const ids = out.map((a) => a.id);
    expect(ids).toContain("belt-1");
    expect(ids).toContain("jewelry-1");
  });

  it("hot sunny + outdoor + hat + scarf → hat preferred で先 / scarf も pool に残るが count=1 なら hat", () => {
    const out = selectAccessories({
      pool: [SCARF, HAT],
      count: 1,
      coldDay: false,
      pick: pickFirst,
      ctx: ctxOf({ hotSunny: true, outdoorEvent: true }),
    });
    expect(out[0].id).toBe("hat-1");
  });

  it("D3-2 不変: cold day + scarf → scarf 確実採用（D4 tier より優先）", () => {
    const out = selectAccessories({
      pool: [JEWELRY, SCARF, HAT],
      count: 1,
      coldDay: true,
      pick: pickFirst,
      ctx: ctxOf({ baseFormality: "dress" }), // jewelry preferred な状況でも scarf 勝つ
    });
    expect(out[0].id).toBe("scarf-1");
  });

  it("D3-2 不変: ctx 無し呼び出しは D3-2 互換挙動（cold scarf + dress 2件・subcategory 重複禁止）", () => {
    const out = selectAccessories({
      pool: [JEWELRY, SCARF, HAT, BELT],
      count: 2,
      coldDay: true,
      pick: pickFirst,
      // ctx 無し → D3-2 path
    });
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("scarf-1");
    expect(new Set(out.map((a) => a.subcategory)).size).toBe(2);
  });

  it("subcategory 重複禁止は ctx あり/なし両方で維持（jewelry 3 件のみ → 1 件）", () => {
    const out = selectAccessories({
      pool: [acc("j1", "jewelry"), acc("j2", "jewelry"), acc("j3", "jewelry")],
      count: 2,
      coldDay: false,
      pick: pickFirst,
      ctx: ctxOf({ baseFormality: "dress" }),
    });
    expect(out).toHaveLength(1);
  });
});

// ── generateDayProposal end-to-end ───────────────────────

function dressW(extras: WardrobeItem[] = []): WardrobeItem[] {
  return [
    { id: "t1", categoryMain: "tops", color: "#000", formality: "dress", name: "t1", category: "tops" } as WardrobeItem,
    { id: "t2", categoryMain: "tops", color: "#000", formality: "dress", name: "t2", category: "tops" } as WardrobeItem,
    { id: "b1", categoryMain: "bottoms", color: "#000", formality: "dress", name: "b1", category: "bottoms" } as WardrobeItem,
    { id: "b2", categoryMain: "bottoms", color: "#000", formality: "dress", name: "b2", category: "bottoms" } as WardrobeItem,
    { id: "s1", categoryMain: "shoes", color: "#000", formality: "dress", name: "s1", category: "shoes" } as WardrobeItem,
    { id: "s2", categoryMain: "shoes", color: "#000", formality: "dress", name: "s2", category: "shoes" } as WardrobeItem,
    ...extras,
  ];
}

describe("generateDayProposal — D4 end-to-end", () => {
  it("dress + belt + jewelry → 両方採用（合計 2 件）", () => {
    const r = generateDayProposal(
      dressW([BELT, JEWELRY]),
      "2026-06-15",
      MILD,
      [{ event_type: "party", event_name: "パーティ" }],
      [],
    );
    expect(r).not.toBeNull();
    const accIds = r!.main.items.filter((i) => i.categoryMain === "accessory").map((i) => i.id);
    expect(accIds).toContain("belt-1");
    expect(accIds).toContain("jewelry-1");
  });

  it("smart + belt + jewelry → belt が選ばれる（jewelry は suppressed・補正 4）", () => {
    const smart = dressW([BELT, JEWELRY]).map((it) =>
      it.categoryMain === "accessory" ? it : ({ ...it, formality: "smart" } as WardrobeItem),
    );
    const r = generateDayProposal(smart, "2026-06-15", MILD, [{ event_type: "work", event_name: "仕事" }], []);
    expect(r).not.toBeNull();
    const accIds = r!.main.items.filter((i) => i.categoryMain === "accessory").map((i) => i.id);
    expect(accIds).toContain("belt-1");
    expect(accIds).not.toContain("jewelry-1");
  });

  it("rainy + hat のみ → hat は採用される（除外ではなく suppressed の 1 種しか無いので残る・補正 1）", () => {
    const r = generateDayProposal(
      dressW([HAT]),
      "2026-06-15",
      RAIN,
      [{ event_type: "party", event_name: "パーティ" }],
      [],
    );
    expect(r).not.toBeNull();
    const accIds = r!.main.items.filter((i) => i.categoryMain === "accessory").map((i) => i.id);
    expect(accIds).toContain("hat-1");
  });

  it("D3-2 不変: cold day で scarf を含む dress proposal は scarf を採用", () => {
    const r = generateDayProposal(
      dressW([SCARF, JEWELRY]),
      "2026-01-15",
      COLD,
      [{ event_type: "party", event_name: "パーティ" }],
      [],
    );
    expect(r).not.toBeNull();
    const accSubs = r!.main.items
      .filter((i) => i.categoryMain === "accessory")
      .map((i) => i.subcategory);
    expect(accSubs).toContain("subcategory.scarf");
  });
});
