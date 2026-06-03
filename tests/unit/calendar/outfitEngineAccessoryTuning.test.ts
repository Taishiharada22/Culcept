import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import type { WeatherDaily } from "@/app/(culcept)/calendar/_lib/types";
import {
  generateDayProposal,
  isColdDay,
  selectAccessories,
} from "@/app/(culcept)/calendar/_lib/outfitEngine";

/**
 * D3-2 — accessory tuning（cold scarf 優先 + dress 最大 2 件 + subcategory 重複禁止）。
 *
 * 不変原則:
 *   - scoreCandidate 不可触（pick callback = pickBest を流用、 pool partition のみ）
 *   - supplemental: scarf 無しで accessory を消さない / pool 空でも proposal は null にならない
 *   - dress のみ 2 件、 smart 1 件、 subcategory 重複禁止
 *   - OutfitCollage は複数 accessory を z+offset で安全描画（監査済・無改修）
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

const SCARF = acc("scarf-1", "scarf");
const HAT = acc("hat-1", "hat");
const BELT = acc("belt-1", "belt");
const JEWELRY = acc("jewelry-1", "jewelry");

// 単純な「最高スコア = 先頭」pick stub（順序依存を明確化）
const pickFirst = (pool: WardrobeItem[]): WardrobeItem | null => pool[0] ?? null;

const COLD: WeatherDaily = { weather_icon: "cloud", temp_min: 4, temp_max: 8, pop_max: 10, pop_blocks: null, outfit_tag: "normal" };
const WARM: WeatherDaily = { weather_icon: "sun", temp_min: 20, temp_max: 27, pop_max: 0, pop_blocks: null, outfit_tag: "normal" };

// ── isColdDay ─────────────────────────────────────────────

describe("isColdDay — 既存 needsOuter 境界（< 15）に整合", () => {
  it("temp_max < 15 → cold", () => {
    expect(isColdDay(COLD)).toBe(true);
    expect(isColdDay({ ...WARM, temp_max: 14 })).toBe(true);
  });
  it("temp_max >= 15 → not cold", () => {
    expect(isColdDay(WARM)).toBe(false);
    expect(isColdDay({ ...WARM, temp_max: 15 })).toBe(false);
  });
  it("temp_max null / weather null → not cold（過剰防寒回避）", () => {
    expect(isColdDay({ ...WARM, temp_max: null })).toBe(false);
    expect(isColdDay(null)).toBe(false);
  });
});

// ── selectAccessories ─────────────────────────────────────

describe("selectAccessories — cold scarf 優先 / count / 重複禁止", () => {
  it("① cold day + scarf あり → scarf が先頭採用される", () => {
    const out = selectAccessories({ pool: [JEWELRY, HAT, SCARF], count: 1, coldDay: true, pick: pickFirst });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("scarf-1");
  });

  it("② cold day + scarf なし → 既存順で fallback（accessory を消さない）", () => {
    const out = selectAccessories({ pool: [JEWELRY, HAT], count: 1, coldDay: true, pick: pickFirst });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("jewelry-1"); // 先頭そのまま
  });

  it("③ warm day + scarf あり → scarf を無条件先頭にしない（入力順のまま）", () => {
    const out = selectAccessories({ pool: [JEWELRY, SCARF], count: 1, coldDay: false, pick: pickFirst });
    expect(out[0].id).toBe("jewelry-1");
  });

  it("④ count=1（smart 相当）→ 最大 1 件", () => {
    const out = selectAccessories({ pool: [JEWELRY, BELT, HAT], count: 1, coldDay: false, pick: pickFirst });
    expect(out).toHaveLength(1);
  });

  it("⑤ count=2（dress 相当）→ 最大 2 件、 subcategory 異なる", () => {
    const out = selectAccessories({ pool: [JEWELRY, BELT, HAT], count: 2, coldDay: false, pick: pickFirst });
    expect(out).toHaveLength(2);
    const subcats = out.map((a) => a.subcategory);
    expect(new Set(subcats).size).toBe(2); // 重複なし
  });

  it("⑥ count=2 だが同 subcategory のみ → 1 件だけ（重複禁止）", () => {
    const out = selectAccessories({
      pool: [acc("j1", "jewelry"), acc("j2", "jewelry"), acc("j3", "jewelry")],
      count: 2,
      coldDay: false,
      pick: pickFirst,
    });
    expect(out).toHaveLength(1);
    expect(out[0].subcategory).toBe("subcategory.jewelry");
  });

  it("⑦ pool 1 件なら count=2 でも 1 件", () => {
    const out = selectAccessories({ pool: [JEWELRY], count: 2, coldDay: false, pick: pickFirst });
    expect(out).toHaveLength(1);
  });

  it("⑧ 空 pool / count<=0 → 空", () => {
    expect(selectAccessories({ pool: [], count: 2, coldDay: true, pick: pickFirst })).toEqual([]);
    expect(selectAccessories({ pool: [JEWELRY], count: 0, coldDay: false, pick: pickFirst })).toEqual([]);
  });

  it("⑨ cold day + dress(count=2): scarf 優先 + 別 subcategory 1 件", () => {
    const out = selectAccessories({ pool: [JEWELRY, BELT, SCARF], count: 2, coldDay: true, pick: pickFirst });
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe("scarf-1"); // cold で scarf 先頭
    expect(out[1].subcategory).not.toBe("subcategory.scarf"); // 2 件目は別 subcategory
  });
});

// ── generateDayProposal end-to-end ───────────────────────

function dressWardrobe(extras: WardrobeItem[] = []): WardrobeItem[] {
  return [
    { id: "t1", name: "t1", category: "tops", categoryMain: "tops", color: "#000", formality: "dress" } as WardrobeItem,
    { id: "t2", name: "t2", category: "tops", categoryMain: "tops", color: "#000", formality: "dress" } as WardrobeItem,
    { id: "b1", name: "b1", category: "bottoms", categoryMain: "bottoms", color: "#000", formality: "dress" } as WardrobeItem,
    { id: "b2", name: "b2", category: "bottoms", categoryMain: "bottoms", color: "#000", formality: "dress" } as WardrobeItem,
    { id: "s1", name: "s1", category: "shoes", categoryMain: "shoes", color: "#000", formality: "dress" } as WardrobeItem,
    { id: "s2", name: "s2", category: "shoes", categoryMain: "shoes", color: "#000", formality: "dress" } as WardrobeItem,
    ...extras,
  ];
}

function smartWardrobe(extras: WardrobeItem[] = []): WardrobeItem[] {
  return dressWardrobe(extras).map((it) =>
    it.categoryMain === "accessory" ? it : ({ ...it, formality: "smart" } as WardrobeItem),
  );
}

describe("generateDayProposal — D3-2 accessory tuning end-to-end", () => {
  it("⑩ dress event + accessory 複数 subcategory → 最大 2 件採用", () => {
    const wardrobe = dressWardrobe([JEWELRY, BELT, HAT]);
    // party は TPO_FORMALITY_MAP で dress
    const r = generateDayProposal(wardrobe, "2026-06-15", WARM, [{ event_type: "party", event_name: "パーティ" }], []);
    expect(r).not.toBeNull();
    const accs = r!.main.items.filter((i) => i.categoryMain === "accessory");
    expect(accs.length).toBe(2);
    expect(new Set(accs.map((a) => a.subcategory)).size).toBe(2);
  });

  it("⑪ smart event → accessory 最大 1 件", () => {
    const wardrobe = smartWardrobe([JEWELRY, BELT, HAT]);
    // work は TPO_FORMALITY_MAP で smart
    const r = generateDayProposal(wardrobe, "2026-06-15", WARM, [{ event_type: "work", event_name: "仕事" }], []);
    expect(r).not.toBeNull();
    const accs = r!.main.items.filter((i) => i.categoryMain === "accessory");
    expect(accs.length).toBe(1);
  });

  it("⑫ cold day + dress + scarf あり → scarf が accessory に含まれる", () => {
    const wardrobe = dressWardrobe([JEWELRY, SCARF, BELT]);
    const r = generateDayProposal(wardrobe, "2026-01-15", COLD, [{ event_type: "party", event_name: "パーティ" }], []);
    expect(r).not.toBeNull();
    const accs = r!.main.items.filter((i) => i.categoryMain === "accessory");
    expect(accs.some((a) => a.subcategory === "subcategory.scarf")).toBe(true);
  });

  it("⑬ accessory pool 空でも proposal は null にならない（supplemental 不変）", () => {
    const r = generateDayProposal(dressWardrobe(), "2026-06-15", WARM, [{ event_type: "party", event_name: "パーティ" }], []);
    expect(r).not.toBeNull();
    expect(r!.main.items.some((i) => i.categoryMain === "accessory")).toBe(false);
  });

  it("⑭ selectedItems.length < 2 成立条件は不変（accessory のみでは null）", () => {
    const r = generateDayProposal([JEWELRY, BELT], "2026-06-15", WARM, [{ event_type: "party", event_name: "パーティ" }], []);
    expect(r).toBeNull();
  });

  it("⑮ casual event → 原則 accessory なし（D2 条件維持）", () => {
    const casual = smartWardrobe([JEWELRY, BELT]).map((it) =>
      it.categoryMain === "accessory" ? it : ({ ...it, formality: "casual" } as WardrobeItem),
    );
    const r = generateDayProposal(casual, "2026-06-15", WARM, [{ event_type: "casual", event_name: "リラックス" }], []);
    expect(r).not.toBeNull();
    expect(r!.main.items.some((i) => i.categoryMain === "accessory")).toBe(false);
  });
});
