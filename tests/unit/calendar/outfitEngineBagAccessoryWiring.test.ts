import { describe, it, expect } from "vitest";

import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import {
  generateDayProposal,
  selectedItemsNeedsBag,
  selectedItemsNeedsAccessory,
  inferBaseFormality,
} from "@/app/(culcept)/calendar/_lib/outfitEngine";

/**
 * D2-2 — supplemental bag/accessory wiring。
 *
 * 不変原則（CEO 補正反映）:
 *   - 既存 tops/bottoms/shoes/outer 選定は不変
 *   - selectedItems.length < 2 の成立判定も不変（bag/accessory のみでは null）
 *   - bag/accessory が無くても proposal は null にならない（supplemental）
 *   - scoreCandidate には触らない（formality gate は採用判定のみに使う = A 採用）
 *   - bag は engine 既知 event_type 4 種（work/meeting/date/party）のみで needsBag=true
 *     casual/outdoor/sports/travel は安全側で除外
 *   - bag/accessory を diff 主軸にしない（D1 helper には触らない）
 */

function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    name: p.id,
    category: "tops",
    color: "#000",
    ...p,
  } as WardrobeItem;
}

const NULL_WEATHER = null;

// ── selectedItemsNeedsBag — event_type whitelist ─────────

describe("selectedItemsNeedsBag — engine 既知 event_type 4 種のみ", () => {
  it("work / meeting / date / party / travel は true（外出確定。 travel は D3-1 で追加）", () => {
    for (const t of ["work", "meeting", "date", "party", "travel"]) {
      expect(selectedItemsNeedsBag([{ event_type: t }])).toBe(true);
    }
  });

  it("casual / outdoor / sports は false（在宅可能性あり・安全側除外）", () => {
    // travel は D3-1 で whitelist に移動済（外出確定）。 ここでは残り 3 種が false であることを固定。
    for (const t of ["casual", "outdoor", "sports"]) {
      expect(selectedItemsNeedsBag([{ event_type: t }])).toBe(false);
    }
  });

  it("未知 event_type / 空 events は false（過剰広げ防止）", () => {
    expect(selectedItemsNeedsBag([])).toBe(false);
    expect(selectedItemsNeedsBag([{ event_type: "friends" }])).toBe(false);
    expect(selectedItemsNeedsBag([{ event_type: "commute" }])).toBe(false);
    expect(selectedItemsNeedsBag([{ event_type: "unknown" }])).toBe(false);
  });

  it("混在: 外出 1 + 在宅 1 → true（1 件でも外出があれば bag を出す）", () => {
    expect(selectedItemsNeedsBag([{ event_type: "sports" }, { event_type: "meeting" }])).toBe(true);
  });
});

// ── inferBaseFormality — 最頻値 ──────────────────────────

describe("inferBaseFormality — selectedItems の formality 最頻値", () => {
  it("smart 3 + casual 1 → smart", () => {
    expect(
      inferBaseFormality([
        w({ id: "1", formality: "smart" }),
        w({ id: "2", formality: "smart" }),
        w({ id: "3", formality: "smart" }),
        w({ id: "4", formality: "casual" }),
      ]),
    ).toBe("smart");
  });

  it("dress 2 + smart 1 → dress", () => {
    expect(
      inferBaseFormality([
        w({ id: "1", formality: "dress" }),
        w({ id: "2", formality: "dress" }),
        w({ id: "3", formality: "smart" }),
      ]),
    ).toBe("dress");
  });

  it("全 item formality 未設定 → null（caller は adjustedFormality fallback）", () => {
    expect(inferBaseFormality([w({ id: "1" }), w({ id: "2" })])).toBeNull();
  });

  it("空配列 → null", () => {
    expect(inferBaseFormality([])).toBeNull();
  });

  it("混在: 形式違いの値は count しない（NaN/落下なし）", () => {
    expect(
      inferBaseFormality([
        w({ id: "1", formality: "casual" }),
        w({ id: "2", formality: "weird" as never }),
      ]),
    ).toBe("casual");
  });
});

// ── selectedItemsNeedsAccessory — formality gate ─────────

describe("selectedItemsNeedsAccessory — formality gate（A 採用・scoring 不可触）", () => {
  it("baseFormality=smart → true", () => {
    expect(
      selectedItemsNeedsAccessory([w({ id: "1", formality: "smart" })], "casual"),
    ).toBe(true);
  });

  it("baseFormality=dress → true", () => {
    expect(
      selectedItemsNeedsAccessory([w({ id: "1", formality: "dress" })], "casual"),
    ).toBe(true);
  });

  it("baseFormality=casual → false", () => {
    expect(
      selectedItemsNeedsAccessory([w({ id: "1", formality: "casual" })], "smart"),
    ).toBe(false);
  });

  it("baseFormality=null + adjustedFormality=dress → true（fallback）", () => {
    expect(selectedItemsNeedsAccessory([w({ id: "1" })], "dress")).toBe(true);
  });

  it("baseFormality=null + adjustedFormality=casual → false", () => {
    expect(selectedItemsNeedsAccessory([w({ id: "1" })], "casual")).toBe(false);
  });
});

// ── generateDayProposal end-to-end（CEO 10 要件の動作確認） ───

function wardrobe5plus(extras: WardrobeItem[] = []): WardrobeItem[] {
  return [
    w({ id: "t1", categoryMain: "tops", season: "all", formality: "smart" }),
    w({ id: "t2", categoryMain: "tops", season: "all", formality: "smart" }),
    w({ id: "b1", categoryMain: "bottoms", season: "all", formality: "smart" }),
    w({ id: "b2", categoryMain: "bottoms", season: "all", formality: "smart" }),
    w({ id: "s1", categoryMain: "shoes", season: "all", formality: "smart" }),
    w({ id: "s2", categoryMain: "shoes", season: "all", formality: "smart" }),
    ...extras,
  ];
}

describe("generateDayProposal end-to-end — D2-2 supplemental bag/accessory", () => {
  it("① meeting + bag pool あり → main.items に bag が含まれる", () => {
    const wardrobe = wardrobe5plus([
      w({ id: "bag1", categoryMain: "bag" }),
      w({ id: "bag2", categoryMain: "bag" }),
    ]);
    const result = generateDayProposal(
      wardrobe,
      "2026-06-15",
      NULL_WEATHER,
      [{ event_type: "meeting", event_name: "会議" }],
      [],
    );
    expect(result).not.toBeNull();
    const bagItems = result!.main.items.filter((i) => i.categoryMain === "bag");
    expect(bagItems.length).toBeGreaterThanOrEqual(1);
  });

  it("② 在宅 (events 空) + bag pool あり → bag は入らない", () => {
    const wardrobe = wardrobe5plus([w({ id: "bag1", categoryMain: "bag" })]);
    const result = generateDayProposal(wardrobe, "2026-06-15", NULL_WEATHER, [], []);
    expect(result).not.toBeNull();
    expect(result!.main.items.some((i) => i.categoryMain === "bag")).toBe(false);
  });

  it("③ smart formality + accessory pool あり → accessory が入る", () => {
    const wardrobe = wardrobe5plus([
      w({ id: "acc1", categoryMain: "accessory" }),
      w({ id: "acc2", categoryMain: "accessory" }),
    ]);
    const result = generateDayProposal(
      wardrobe,
      "2026-06-15",
      NULL_WEATHER,
      [{ event_type: "meeting", event_name: "会議" }],
      [],
    );
    expect(result).not.toBeNull();
    const accessoryItems = result!.main.items.filter((i) => i.categoryMain === "accessory");
    expect(accessoryItems.length).toBeGreaterThanOrEqual(1);
  });

  it("④ casual formality + accessory pool あり → accessory は入らない", () => {
    // wardrobe を全件 casual にし、 events も casual で baseFormality=casual に確実に倒す
    const casualWardrobe: WardrobeItem[] = [
      w({ id: "t1", categoryMain: "tops", formality: "casual" }),
      w({ id: "t2", categoryMain: "tops", formality: "casual" }),
      w({ id: "b1", categoryMain: "bottoms", formality: "casual" }),
      w({ id: "b2", categoryMain: "bottoms", formality: "casual" }),
      w({ id: "s1", categoryMain: "shoes", formality: "casual" }),
      w({ id: "s2", categoryMain: "shoes", formality: "casual" }),
      w({ id: "acc1", categoryMain: "accessory" }),
    ];
    const result = generateDayProposal(
      casualWardrobe,
      "2026-06-15",
      NULL_WEATHER,
      [{ event_type: "casual", event_name: "リラックス" }],
      [],
    );
    expect(result).not.toBeNull();
    expect(result!.main.items.some((i) => i.categoryMain === "accessory")).toBe(false);
  });

  it("⑤ bag/accessory pool 空でも proposal は null にならない（supplemental 原則）", () => {
    const wardrobe = wardrobe5plus(); // bag/accessory 0 件
    const result = generateDayProposal(
      wardrobe,
      "2026-06-15",
      NULL_WEATHER,
      [{ event_type: "meeting", event_name: "会議" }],
      [],
    );
    expect(result).not.toBeNull();
    // 既存 4 カテゴリのみで成立
    expect(result!.main.items.every((i) => i.categoryMain !== "bag" && i.categoryMain !== "accessory")).toBe(true);
  });

  it("⑥ bag/accessory item を加えた前後で、 既存 4 カテゴリ item の選択結果が同じ（追加が既存に影響しない）", () => {
    const base = wardrobe5plus();
    const withSupplemental = wardrobe5plus([
      w({ id: "bag1", categoryMain: "bag" }),
      w({ id: "acc1", categoryMain: "accessory" }),
    ]);
    const r1 = generateDayProposal(base, "2026-06-15", NULL_WEATHER, [{ event_type: "meeting", event_name: "会議" }], []);
    const r2 = generateDayProposal(withSupplemental, "2026-06-15", NULL_WEATHER, [{ event_type: "meeting", event_name: "会議" }], []);
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    const r1MainIds = r1!.main.items.map((i) => i.id).sort();
    const r2NonSuppIds = r2!.main.items
      .filter((i) => i.categoryMain !== "bag" && i.categoryMain !== "accessory")
      .map((i) => i.id)
      .sort();
    expect(r2NonSuppIds).toEqual(r1MainIds);
  });

  it("⑦ bag/accessory の属性が全て未設定でも NaN にならず採用される（中性扱い）", () => {
    // bag/accessory に season/thickness/formality 一切無し
    const wardrobe = wardrobe5plus([
      w({ id: "bare-bag", categoryMain: "bag" }),
      w({ id: "bare-acc", categoryMain: "accessory" }),
    ]);
    const result = generateDayProposal(
      wardrobe,
      "2026-06-15",
      NULL_WEATHER,
      [{ event_type: "meeting", event_name: "会議" }],
      [],
    );
    expect(result).not.toBeNull();
    expect(result!.main.sync.total).not.toBeNaN();
    // bag は採用される
    expect(result!.main.items.some((i) => i.id === "bare-bag")).toBe(true);
    // accessory も smart formality wardrobe で採用される
    expect(result!.main.items.some((i) => i.id === "bare-acc")).toBe(true);
  });

  it("⑧ selectedItems.length < 2 成立条件は不変（bag/accessory のみでは null）", () => {
    // tops/bottoms/shoes すべて 0 → bag/accessory だけある状態
    const onlySupp: WardrobeItem[] = [
      w({ id: "bag1", categoryMain: "bag" }),
      w({ id: "acc1", categoryMain: "accessory" }),
    ];
    const result = generateDayProposal(
      onlySupp,
      "2026-06-15",
      NULL_WEATHER,
      [{ event_type: "meeting", event_name: "会議" }],
      [],
    );
    expect(result).toBeNull();
  });
});
