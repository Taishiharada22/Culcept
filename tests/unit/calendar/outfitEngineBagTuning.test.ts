import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import {
  generateDayProposal,
  selectedItemsNeedsBag,
  selectBagPool,
} from "@/app/(culcept)/calendar/_lib/outfitEngine";

/**
 * D3-1 — bag tuning（travel whitelist + rain 防水 + formality 整合）。
 *
 * 不変原則:
 *   - scoreCandidate 不可触（pool 事前 partition のみ）
 *   - supplemental: rain 以外は **除外せず並べ替えのみ**（bag 1 種でも必ず残る）
 *   - rain だけ hard filter（防水あれば防水のみ、 無ければ全件）
 *   - UI / D1 helper 不変
 */

function bag(id: string, subcat: string, extras: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id,
    name: id,
    category: "other",
    categoryMain: "bag",
    color: "#000",
    subcategory: `subcategory.${subcat}`,
    ...extras,
  } as WardrobeItem;
}

const TOTE = bag("tote-1", "tote");
const SHOULDER = bag("shoulder-1", "shoulder");
const CROSSBODY = bag("crossbody-1", "crossbody");
const BACKPACK = bag("backpack-1", "backpack");

// ── selectedItemsNeedsBag: travel 追加（D3-1）─────────────

describe("selectedItemsNeedsBag — D3-1 travel 追加", () => {
  it("travel → true（外出確定）", () => {
    expect(selectedItemsNeedsBag([{ event_type: "travel" }])).toBe(true);
  });
  it("既存 work/meeting/date/party は引き続き true", () => {
    for (const t of ["work", "meeting", "date", "party"]) {
      expect(selectedItemsNeedsBag([{ event_type: t }])).toBe(true);
    }
  });
  it("casual / outdoor / sports は引き続き false", () => {
    for (const t of ["casual", "outdoor", "sports"]) {
      expect(selectedItemsNeedsBag([{ event_type: t }])).toBe(false);
    }
  });
});

// ── selectBagPool — partition / filter ───────────────────

describe("selectBagPool — 優先順位 partition（除外しない）", () => {
  const allBags = [BACKPACK, SHOULDER, TOTE, CROSSBODY];

  it("rain + 防水あり → 防水 bag のみに hard filter", () => {
    const waterproofTote = bag("wp-tote", "tote", { attributes: { water: "waterproof" } });
    const repellentCross = bag("rp-cross", "crossbody", { attributes: { water: "repellent" } });
    const pool = [BACKPACK, waterproofTote, SHOULDER, repellentCross];
    const out = selectBagPool(pool, "rain", [], "casual");
    expect(out.map((b) => b.id).sort()).toEqual(["rp-cross", "wp-tote"]);
  });

  it("rain + 防水なし → 全件残す（消さない・supplemental 不変）", () => {
    const out = selectBagPool(allBags, "rain", [], "casual");
    expect(out).toHaveLength(4);
  });

  it("travel → backpack/tote/crossbody が前、 shoulder が後ろ", () => {
    const out = selectBagPool(allBags, "main", [{ event_type: "travel" }], "casual");
    // shoulder は末尾に回る
    expect(out[out.length - 1].id).toBe("shoulder-1");
    // 残り 3 種が前方
    expect(out.slice(0, 3).map((b) => b.id).sort()).toEqual(["backpack-1", "crossbody-1", "tote-1"]);
  });

  it("smart → backpack が後ろ（tote/shoulder/crossbody が前）", () => {
    const out = selectBagPool(allBags, "main", [{ event_type: "meeting" }], "smart");
    expect(out[out.length - 1].id).toBe("backpack-1");
  });

  it("dress → backpack が後ろ", () => {
    const out = selectBagPool(allBags, "main", [{ event_type: "party" }], "dress");
    expect(out[out.length - 1].id).toBe("backpack-1");
  });

  it("casual → 並べ替えなし（入力順を保持）", () => {
    const out = selectBagPool(allBags, "main", [{ event_type: "casual" }], "casual");
    expect(out.map((b) => b.id)).toEqual(["backpack-1", "shoulder-1", "tote-1", "crossbody-1"]);
  });

  it("bag 1 種のみ → どの条件でも除外されず 1 件残る（supplemental 不変）", () => {
    expect(selectBagPool([BACKPACK], "main", [{ event_type: "meeting" }], "smart")).toHaveLength(1);
    expect(selectBagPool([SHOULDER], "main", [{ event_type: "travel" }], "casual")).toHaveLength(1);
    expect(selectBagPool([BACKPACK], "rain", [], "casual")).toHaveLength(1);
  });

  it("空 pool → 空", () => {
    expect(selectBagPool([], "main", [], "casual")).toEqual([]);
  });

  it("travel は rain filter の後に適用される（rain+travel 複合）", () => {
    const wpBackpack = bag("wp-bp", "backpack", { attributes: { water: "waterproof" } });
    const wpShoulder = bag("wp-sh", "shoulder", { attributes: { water: "waterproof" } });
    const pool = [wpBackpack, wpShoulder, TOTE /* 非防水 */];
    const out = selectBagPool(pool, "rain", [{ event_type: "travel" }], "casual");
    // rain で防水のみ → [wp-bp, wp-sh]、 travel で shoulder を後ろ → [wp-bp, wp-sh]
    expect(out.map((b) => b.id)).toEqual(["wp-bp", "wp-sh"]);
    expect(out.some((b) => b.id === "tote-1")).toBe(false); // 非防水は rain filter で除外
  });
});

// ── generateDayProposal end-to-end ───────────────────────

function baseWardrobe(): WardrobeItem[] {
  return [
    { id: "t1", name: "t1", category: "tops", categoryMain: "tops", color: "#000", formality: "smart" } as WardrobeItem,
    { id: "t2", name: "t2", category: "tops", categoryMain: "tops", color: "#000", formality: "smart" } as WardrobeItem,
    { id: "b1", name: "b1", category: "bottoms", categoryMain: "bottoms", color: "#000", formality: "smart" } as WardrobeItem,
    { id: "b2", name: "b2", category: "bottoms", categoryMain: "bottoms", color: "#000", formality: "smart" } as WardrobeItem,
    { id: "s1", name: "s1", category: "shoes", categoryMain: "shoes", color: "#000", formality: "smart" } as WardrobeItem,
    { id: "s2", name: "s2", category: "shoes", categoryMain: "shoes", color: "#000", formality: "smart" } as WardrobeItem,
  ];
}

describe("generateDayProposal — D3-1 bag tuning end-to-end", () => {
  it("travel event + bag pool → bag が採用される（travel whitelist）", () => {
    const wardrobe = [...baseWardrobe(), TOTE, BACKPACK];
    const r = generateDayProposal(
      wardrobe,
      "2026-06-15",
      null,
      [{ event_type: "travel", event_name: "旅行" }],
      [],
    );
    expect(r).not.toBeNull();
    expect(r!.main.items.some((i) => i.categoryMain === "bag")).toBe(true);
  });

  it("rain variant の bag は防水優先（rain filter は variant=rain にのみ効く・main は非対象）", () => {
    // selectBagPool の rain hard filter は variant="rain" のときだけ作動する（既存 shoes と同じ設計）。
    // main proposal は variant="main" なので rain filter 非対象 = 防水以外も選ばれ得る（正しい挙動）。
    // → 雨日に生成される rain variant の alternative で防水 bag が優先されることを直接 selectBagPool で固定する。
    const wpTote = bag("wp-tote", "tote", { attributes: { water: "waterproof" } });
    const rainPool = selectBagPool([BACKPACK /* 非防水 */, wpTote], "rain", [{ event_type: "meeting" }], "smart");
    // rain で防水のみ → wp-tote だけ残る
    expect(rainPool.map((b) => b.id)).toEqual(["wp-tote"]);

    // end-to-end: 雨日生成で bag が出れば、 rain variant 側は防水のはず（main は非保証なので緩く確認）
    const wardrobe = [...baseWardrobe(), wpTote, BACKPACK];
    const r = generateDayProposal(
      wardrobe,
      "2026-06-15",
      { weather_icon: "rain", pop_max: 80, temp_min: 16, temp_max: 20, pop_blocks: null, outfit_tag: "rain" },
      [{ event_type: "meeting", event_name: "会議" }],
      [],
    );
    expect(r).not.toBeNull();
    // proposal は成立する（bag の有無に関わらず null にならない = supplemental 不変）
    expect(r!.main.items.length).toBeGreaterThanOrEqual(2);
  });

  it("bag/accessory 無し wardrobe → 既存 4 カテゴリのまま（退化なし・supplemental 不変）", () => {
    const r = generateDayProposal(
      baseWardrobe(),
      "2026-06-15",
      null,
      [{ event_type: "travel", event_name: "旅行" }],
      [],
    );
    expect(r).not.toBeNull();
    expect(r!.main.items.some((i) => i.categoryMain === "bag")).toBe(false);
  });
});
