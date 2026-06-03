import { describe, it, expect, beforeEach, vi } from "vitest";

import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import { scoreCandidate } from "@/app/(culcept)/calendar/_lib/outfitEngine";

/**
 * D6-1 — scoreCandidate baseline lock。
 *
 * 目的:
 *   D6-2 で scoreCandidate に bag/accessory 限定 weight を追加する **前** に、
 *   tops/bottoms/shoes/outer の既存スコアを固定値で test に記録する。
 *   D6-2 後も同じ数値が出る = 「main-axis 4 カテゴリのスコアは完全不変」を構造的保証。
 *
 * test 設計の前提:
 *   - cache=null / persona=null / satisfactionProfile=null / moodShift=undefined / recentlyWornIds=空
 *   - localStorage は空（vitest "node" 環境・empty stub）→ abPreferenceBoost = 0
 *   - これにより score = 50 + (season/thickness/formality/qualityScore の決定的加減点)
 *
 * 既存 scoreCandidate の加減点（D6-1 audit より）:
 *   base: 50
 *   season:    "all" / season match → +10、 設定あり mismatch → -15、 未設定 → 0
 *   thickness: recThickness match → +10、 設定あり mismatch → +3、 未設定 → 0
 *   formality: diff=0 → +15、 diff=1 → +5、 diff=2 → -10、 未設定 → 0
 *   recentlyWorn: id 含まれる → -20
 *   qualityScore: 設定あり → +Math.round(qs/20)、 未設定 → 0
 *   moodShift: formality 軸で条件マッチ → +5
 *   persona/satisfaction/rejection/cache: null/empty なら 0
 *   abPreferenceBoost: localStorage 空なら 0
 *
 * D6-2 後の不変条件:
 *   tops/bottoms/shoes/outer の categoryMain は { "tops", "bottoms", "shoes", "outer", "outerwear" (legacy) }
 *   のいずれか → D6-2 で追加される `if (item.categoryMain === "bag" | "accessory")` 分岐に該当せず加点ゼロ
 *   → 本 test の数値は D6-2 後も完全に同じ
 */

// ── localStorage stub（vitest "node" 環境・空にして abPreferenceBoost を 0 に固定）─
beforeEach(() => {
  vi.unstubAllGlobals();
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    get length() {
      return store.size;
    },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  });
  vi.stubGlobal("window", { localStorage });
});

function w(p: Partial<WardrobeItem> & { id: string; categoryMain: WardrobeItem["categoryMain"] }): WardrobeItem {
  return {
    name: p.id,
    category: "tops",
    color: "#000",
    ...p,
  } as WardrobeItem;
}

const NO_RECENT = new Set<string>();

// ── tops baseline ────────────────────────────────────────

describe("scoreCandidate baseline — tops", () => {
  it("tops: season=all, thickness match, formality match → 50 + 10 + 10 + 15 = 85", () => {
    const item = w({ id: "t-perfect", categoryMain: "tops", season: "all", thickness: "mid", formality: "smart" });
    expect(scoreCandidate(item, "ss", "mid", "smart", NO_RECENT)).toBe(85);
  });

  it("tops: season=ss + ss day → +10、 thickness mismatch (mid vs thin) → +3、 formality diff=1 → +5 = 50+10+3+5 = 68", () => {
    const item = w({ id: "t-partial", categoryMain: "tops", season: "ss", thickness: "thin", formality: "casual" });
    expect(scoreCandidate(item, "ss", "mid", "smart", NO_RECENT)).toBe(68);
  });

  it("tops: season=aw + ss day（mismatch）→ -15、 thickness/formality 未設定 → 0 ＝ 50 - 15 = 35", () => {
    const item = w({ id: "t-mismatch", categoryMain: "tops", season: "aw" });
    expect(scoreCandidate(item, "ss", "mid", "smart", NO_RECENT)).toBe(35);
  });

  it("tops: 属性全未設定 → 50（中性）", () => {
    const item = w({ id: "t-bare", categoryMain: "tops" });
    expect(scoreCandidate(item, "ss", "mid", "casual", NO_RECENT)).toBe(50);
  });
});

// ── bottoms baseline ─────────────────────────────────────

describe("scoreCandidate baseline — bottoms", () => {
  it("bottoms: season=all + thickness mid + formality smart, ss day, mid → 85", () => {
    const item = w({ id: "b-perfect", categoryMain: "bottoms", season: "all", thickness: "mid", formality: "smart" });
    expect(scoreCandidate(item, "ss", "mid", "smart", NO_RECENT)).toBe(85);
  });

  it("bottoms: formality diff=2 (casual vs dress) → -10、 他デフォルト ＝ 50 - 10 = 40", () => {
    const item = w({ id: "b-bigdiff", categoryMain: "bottoms", formality: "casual" });
    expect(scoreCandidate(item, "ss", "mid", "dress", NO_RECENT)).toBe(40);
  });

  it("bottoms: recentlyWorn ペナルティ -20、 他デフォルト ＝ 50 - 20 = 30", () => {
    const item = w({ id: "b-worn", categoryMain: "bottoms" });
    const recent = new Set<string>(["b-worn"]);
    expect(scoreCandidate(item, "ss", "mid", "casual", recent)).toBe(30);
  });
});

// ── shoes baseline ───────────────────────────────────────

describe("scoreCandidate baseline — shoes", () => {
  it("shoes: season=all + thickness match + formality match, qualityScore=80 → +4 ＝ 50+10+10+15+4 = 89", () => {
    const item = w({ id: "s-quality", categoryMain: "shoes", season: "all", thickness: "mid", formality: "dress", qualityScore: 80 });
    expect(scoreCandidate(item, "ss", "mid", "dress", NO_RECENT)).toBe(89);
  });

  it("shoes: 属性全未設定 + casual day → 50", () => {
    const item = w({ id: "s-bare", categoryMain: "shoes" });
    expect(scoreCandidate(item, "ss", "mid", "casual", NO_RECENT)).toBe(50);
  });
});

// ── outer baseline ───────────────────────────────────────

describe("scoreCandidate baseline — outer", () => {
  it("outer: season=aw + aw day + thickness=thick + thick day + formality match → 50+10+10+15 = 85", () => {
    const item = w({ id: "o-winter", categoryMain: "outer", season: "aw", thickness: "thick", formality: "smart" });
    expect(scoreCandidate(item, "aw", "thick", "smart", NO_RECENT)).toBe(85);
  });

  it("outer: legacy category=outerwear, season=all → categoryMain は categorize 側、 scoreCandidate は item.season だけ見る ＝ 50+10 = 60", () => {
    // legacy 互換: categoryMain 未設定でも scoreCandidate は categoryMain を直接参照しないので影響なし
    const item: WardrobeItem = { id: "o-legacy", name: "legacy", category: "outerwear", color: "#000", season: "all" } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "casual", NO_RECENT)).toBe(60);
  });

  it("outer: 属性全未設定 → 50（中性）", () => {
    const item = w({ id: "o-bare", categoryMain: "outer" });
    expect(scoreCandidate(item, "ss", "mid", "casual", NO_RECENT)).toBe(50);
  });
});

// ── moodShift baseline ────────────────────────────────────

describe("scoreCandidate baseline — moodShift（main-axis での挙動）", () => {
  it("tops: moodShift formality+1 + item formality=smart → +5、 他デフォルト ＝ 50 + 15 (formality match) + 5 = 70", () => {
    const item = w({ id: "t-mood", categoryMain: "tops", formality: "smart" });
    expect(
      scoreCandidate(item, "ss", "mid", "smart", NO_RECENT, { axis: "formality", direction: 1 }),
    ).toBe(70);
  });
});

// ── D6-2 で守る不変条件: bag/accessory 不在の wardrobe で score 合計が変わらない ───

describe("D6-2 不変条件: main-axis 4 カテゴリのスコアは D6-2 後も同値（baseline lock）", () => {
  // 上記 baseline はすべて categoryMain ∈ {tops, bottoms, shoes, outer} または legacy "outerwear"。
  // D6-2 で追加される条件は `item.categoryMain === "bag" | "accessory"` で gated されるため、
  // 上記すべての test は D6-2 後も**完全に同じ値**を返す。
  //
  // この describe ブロック自体は assertion を持たないが、 baseline lock の意図を明示する。
  it("(意図表明) 上記 11 cases の数値は D6-2 後も変わらない", () => {
    expect(true).toBe(true);
  });
});

// ── bag/accessory scoring（D6-2 適用後の期待値）─────────────────────

describe("scoreCandidate — D6-2 bag/accessory 限定 weighting（+3 controlled）", () => {
  it("bag (subcategory.backpack) + casual day → 50 + 3 = 53（D6-2 加点）", () => {
    const item: WardrobeItem = {
      id: "bag-bp",
      name: "bp",
      category: "other",
      color: "#000",
      categoryMain: "bag",
      subcategory: "subcategory.backpack",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "casual", NO_RECENT)).toBe(53);
  });

  it("bag (subcategory.tote) + smart day → +3 = 53", () => {
    const item: WardrobeItem = {
      id: "bag-tote",
      name: "tote",
      category: "other",
      color: "#000",
      categoryMain: "bag",
      subcategory: "subcategory.tote",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "smart", NO_RECENT)).toBe(53);
  });

  it("bag (subcategory.backpack) + smart day → 加点なし = 50（条件 mismatch）", () => {
    const item: WardrobeItem = {
      id: "bag-bp-mismatch",
      name: "bp",
      category: "other",
      color: "#000",
      categoryMain: "bag",
      subcategory: "subcategory.backpack",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "smart", NO_RECENT)).toBe(50);
  });

  it("accessory (subcategory.scarf) + thick day → +3 = 53", () => {
    const item: WardrobeItem = {
      id: "acc-scarf",
      name: "scarf",
      category: "other",
      color: "#000",
      categoryMain: "accessory",
      subcategory: "subcategory.scarf",
    } as WardrobeItem;
    expect(scoreCandidate(item, "aw", "thick", "casual", NO_RECENT)).toBe(53);
  });

  it("accessory (subcategory.scarf) + mid day → 加点なし = 50（thick 限定）", () => {
    const item: WardrobeItem = {
      id: "acc-scarf-mid",
      name: "scarf",
      category: "other",
      color: "#000",
      categoryMain: "accessory",
      subcategory: "subcategory.scarf",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "casual", NO_RECENT)).toBe(50);
  });

  it("accessory (subcategory.jewelry) + dress day → +3 = 53", () => {
    const item: WardrobeItem = {
      id: "acc-jw",
      name: "jw",
      category: "other",
      color: "#000",
      categoryMain: "accessory",
      subcategory: "subcategory.jewelry",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "dress", NO_RECENT)).toBe(53);
  });

  it("accessory (subcategory.jewelry) + smart day → 加点なし = 50（dress 限定）", () => {
    const item: WardrobeItem = {
      id: "acc-jw-smart",
      name: "jw",
      category: "other",
      color: "#000",
      categoryMain: "accessory",
      subcategory: "subcategory.jewelry",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "smart", NO_RECENT)).toBe(50);
  });

  it("accessory (subcategory.belt) + casual day → +3 = 53", () => {
    const item: WardrobeItem = {
      id: "acc-belt-c",
      name: "belt",
      category: "other",
      color: "#000",
      categoryMain: "accessory",
      subcategory: "subcategory.belt",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "casual", NO_RECENT)).toBe(53);
  });

  it("accessory (subcategory.belt) + smart day → +3 = 53", () => {
    const item: WardrobeItem = {
      id: "acc-belt-s",
      name: "belt",
      category: "other",
      color: "#000",
      categoryMain: "accessory",
      subcategory: "subcategory.belt",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "smart", NO_RECENT)).toBe(53);
  });

  it("accessory (subcategory.hat) → 加点なし = 50（D6 では hat は context 不足で省略）", () => {
    const item: WardrobeItem = {
      id: "acc-hat",
      name: "hat",
      category: "other",
      color: "#000",
      categoryMain: "accessory",
      subcategory: "subcategory.hat",
    } as WardrobeItem;
    expect(scoreCandidate(item, "ss", "mid", "casual", NO_RECENT)).toBe(50);
  });

  it("bag/accessory 属性全未設定 → 加点なし = 50（NaN 経路なし・中性）", () => {
    const bag: WardrobeItem = { id: "bare-bag", name: "b", category: "other", color: "#000", categoryMain: "bag" } as WardrobeItem;
    const acc: WardrobeItem = { id: "bare-acc", name: "a", category: "other", color: "#000", categoryMain: "accessory" } as WardrobeItem;
    expect(scoreCandidate(bag, "ss", "mid", "casual", NO_RECENT)).toBe(50);
    expect(scoreCandidate(acc, "ss", "mid", "casual", NO_RECENT)).toBe(50);
  });
});
