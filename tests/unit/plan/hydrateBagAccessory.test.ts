import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/lib/shared/wardrobe";
import type {
  CalendarOutfitItemVM,
  CalendarOutfitProposalVM,
  CalendarOutfitVM,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/types";
import {
  slotOfWardrobe,
  hydrateOutfitVM,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/wardrobeToOutfit";
import { MOCK_CALENDAR_OUTFIT_VM } from "@/app/(culcept)/plan/tabs/_calendar-outfit/mockCalendarOutfit";

/**
 * D3-3 — hydrated_mock path で bag/accessory が wardrobe 実画像に置き換わるか固定。
 *
 * audit 結果（事実）:
 *   - slotOfWardrobe: categoryMain=bag/accessory + legacy "accessories" → 対応済
 *   - SHAPE_TO_SLOT: mock shape="bag"→"bag", "watch"→"accessory" → 対応済
 *   - hydrateOutfitVM: bucket/cursor で 3 候補にまたがり分配（重複緩和）
 *   - wardrobeItemToSlotVM: getWardrobeDisplayImageUrl 経由 → cutoutUrl 優先 (C1L-5)
 *
 * D3-3 最小修正（audit で発見した唯一のギャップ）:
 *   - legacy category="hat" → slotOfWardrobe で undefined だった → "accessory" に migration
 *     （engine 側 D2-1 categorize の "hat" → accessory pool と整合）
 */

function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    name: p.id,
    category: "tops",
    color: "#000",
    ...p,
  } as WardrobeItem;
}

const IMG = "data:image/jpeg;base64,IMG";
const CUT = "data:image/png;base64,CUT";

// ── slotOfWardrobe: bag / accessory + hat migration ──────

describe("slotOfWardrobe — D3-3 bag/accessory + hat migration", () => {
  it("① categoryMain=bag → slot 'bag'", () => {
    expect(slotOfWardrobe(w({ id: "b", categoryMain: "bag", imageUrl: IMG }))).toBe("bag");
  });
  it("② categoryMain=accessory → slot 'accessory'", () => {
    expect(slotOfWardrobe(w({ id: "a", categoryMain: "accessory", imageUrl: IMG }))).toBe("accessory");
  });
  it("legacy category='accessories' → slot 'accessory'（既存）", () => {
    expect(slotOfWardrobe(w({ id: "a2", category: "accessories", imageUrl: IMG }))).toBe("accessory");
  });
  it("D3-3 修正: legacy category='hat' → slot 'accessory' (engine D2-1 と整合)", () => {
    expect(slotOfWardrobe(w({ id: "h", category: "hat", imageUrl: IMG }))).toBe("accessory");
  });
  it("categoryMain 優先（categoryMain=bag, legacy category=tops → bag）", () => {
    expect(slotOfWardrobe(w({ id: "x", categoryMain: "bag", category: "tops", imageUrl: IMG }))).toBe("bag");
  });
});

// ── hydrateOutfitVM end-to-end ───────────────────────────

/** mock を deep clone（hydrate は spread だが、 念のため test 独立性確保） */
function cloneMock(): CalendarOutfitVM {
  return {
    ...MOCK_CALENDAR_OUTFIT_VM,
    proposals: MOCK_CALENDAR_OUTFIT_VM.proposals.map((p) => ({
      ...p,
      items: p.items.map((i) => ({ ...i })),
    })),
  };
}

describe("hydrateOutfitVM — D3-3 bag/accessory mapping + cutout priority", () => {
  it("③ categoryMain=bag の wardrobe が mock の bag slot (shape='bag') に入る", () => {
    const wardrobe = [w({ id: "real-bag", categoryMain: "bag", imageUrl: IMG, name: "リアルバッグ" })];
    const out = hydrateOutfitVM(cloneMock(), wardrobe);
    // mock の各候補で shape='bag' の item が wardrobe 由来に置換される（id は mock のもの維持・imageUrl は real）
    const hydratedBags = out.proposals.flatMap((p) =>
      p.items.filter((i) => i.label === "リアルバッグ"),
    );
    expect(hydratedBags.length).toBeGreaterThanOrEqual(1);
    expect(hydratedBags[0].imageUrl).toBe(IMG);
    // category label は SLOT_DISPLAY 経由 = "バッグ"
    expect(hydratedBags[0].category).toBe("バッグ");
  });

  it("④ categoryMain=accessory の wardrobe が mock の accessory slot (shape='watch') に入る", () => {
    // mock smart proposal (index 1) のみ shape='watch' を持つ（sc-watch）
    const wardrobe = [w({ id: "real-acc", categoryMain: "accessory", imageUrl: IMG, name: "リアルアクセ" })];
    const out = hydrateOutfitVM(cloneMock(), wardrobe);
    const hydratedAcc = out.proposals.flatMap((p) =>
      p.items.filter((i) => i.label === "リアルアクセ"),
    );
    expect(hydratedAcc.length).toBeGreaterThanOrEqual(1);
    expect(hydratedAcc[0].imageUrl).toBe(IMG);
    expect(hydratedAcc[0].category).toBe("小物");
  });

  it("⑤ legacy category='hat' wardrobe も accessory slot に hydrate される（D3-3 修正の効果）", () => {
    const wardrobe = [w({ id: "real-hat", category: "hat", imageUrl: IMG, name: "リアル帽子" })];
    const out = hydrateOutfitVM(cloneMock(), wardrobe);
    // mock smart proposal の shape='watch' slot に入る
    const hydrated = out.proposals.flatMap((p) =>
      p.items.filter((i) => i.label === "リアル帽子"),
    );
    expect(hydrated.length).toBeGreaterThanOrEqual(1);
    expect(hydrated[0].imageUrl).toBe(IMG);
  });

  it("⑥ 同一 slot 複数 item が cursor で分配される（同一画像の重複緩和）", () => {
    // mock は 3 候補すべてに shape='bag' あり → bag bucket に 2 件あれば 2 種類が分散
    const wardrobe = [
      w({ id: "bag-A", categoryMain: "bag", imageUrl: "img-A", name: "バッグA" }),
      w({ id: "bag-B", categoryMain: "bag", imageUrl: "img-B", name: "バッグB" }),
    ];
    const out = hydrateOutfitVM(cloneMock(), wardrobe);
    const bagLabels = out.proposals.map((p) => {
      const b = p.items.find((i) => i.label === "バッグA" || i.label === "バッグB");
      return b?.label ?? null;
    });
    // 3 候補 ÷ 2 種 → 少なくとも 2 種類の異なる label が登場
    const uniqueLabels = new Set(bagLabels.filter(Boolean));
    expect(uniqueLabels.size).toBeGreaterThanOrEqual(2);
  });

  it("⑦ cutoutStatus=success の bag → cutoutUrl が hydrate item の imageUrl になる（C1L-5 整合）", () => {
    const wardrobe = [
      w({
        id: "cut-bag",
        categoryMain: "bag",
        name: "透過バッグ",
        imageUrl: IMG,
        cutoutUrl: CUT,
        cutoutStatus: "success",
      }),
    ];
    const out = hydrateOutfitVM(cloneMock(), wardrobe);
    const hydrated = out.proposals.flatMap((p) => p.items.filter((i) => i.label === "透過バッグ"));
    expect(hydrated[0].imageUrl).toBe(CUT); // raw ではなく cutout 優先（C1L-5）
  });

  it("⑧ bag/accessory なし wardrobe → 既存 hydrated_mock の挙動が壊れない（tops/bottoms のみ hydrate）", () => {
    const wardrobe = [
      w({ id: "real-top", categoryMain: "tops", imageUrl: IMG, name: "リアルトップス" }),
    ];
    const out = hydrateOutfitVM(cloneMock(), wardrobe);
    // tops slot は hydrate される
    const hydratedTops = out.proposals.flatMap((p) =>
      p.items.filter((i) => i.label === "リアルトップス"),
    );
    expect(hydratedTops.length).toBeGreaterThanOrEqual(1);
    // mock の bag slot は mock のまま（リアル bag が無いので置換されない）
    const mockBags = out.proposals.flatMap((p) =>
      p.items.filter((i) => i.shape === "bag"),
    );
    // mock の bag label は "レザー トート" / "キャメル ショルダー" / "ミニ ハンドバッグ" のいずれか
    expect(mockBags.length).toBeGreaterThanOrEqual(3);
    expect(mockBags.every((b) => b.imageUrl === undefined)).toBe(true); // mock は imageUrl なし
  });

  it("⑨ 空 wardrobe → mock を同参照で返す（変化ゼロ・supplemental 不変）", () => {
    const mock = cloneMock();
    const out = hydrateOutfitVM(mock, []);
    expect(out).toBe(mock);
  });
});
