import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import type { WardrobeItem } from "@/app/(immersive)/my-style/_lib/types";
import {
  categorize,
  type CategoryGroup,
} from "@/app/(culcept)/calendar/_lib/outfitEngine";

/**
 * D2-1 — bag / accessory pool 拡張テスト。
 *
 * スコープ厳密化:
 *   - CategoryGroup に "bag" | "accessory" を追加
 *   - categorize で categoryMain/legacy category を bag/accessory に振り分け
 *   - pools 型の網羅性が拡張されている
 *   - buildCombo は **未配線**（D2-1 は no-op 段階）。 既存 outer/tops/bottoms/shoes 選定は不変。
 *
 * /plan の UI には bag/accessory が D2-1 では出ない（仕様）。 出るのは D2-2 以降。
 */

function w(p: Partial<WardrobeItem> & { id: string }): WardrobeItem {
  return {
    name: p.id,
    category: p.category ?? "tops",
    color: "#000",
    ...p,
  } as WardrobeItem;
}

// ── categorize: 要件 1〜7 ─────────────────────────────────

describe("categorize — D2-1 bag / accessory 分類", () => {
  it("① categoryMain=bag → bag pool", () => {
    expect(categorize(w({ id: "b1", categoryMain: "bag" }))).toBe<CategoryGroup>("bag");
  });

  it("② categoryMain=accessory → accessory pool", () => {
    expect(categorize(w({ id: "a1", categoryMain: "accessory" }))).toBe<CategoryGroup>("accessory");
  });

  it("③ legacy category=accessories（複数形） → accessory pool（migration）", () => {
    // categoryMain なし、 legacy category のみ
    expect(categorize(w({ id: "a2", category: "accessories" }))).toBe<CategoryGroup>("accessory");
  });

  it("④ legacy category=hat → accessory pool（migration）", () => {
    expect(categorize(w({ id: "h1", category: "hat" }))).toBe<CategoryGroup>("accessory");
  });

  it("⑤ categoryMain がある場合は legacy category より categoryMain を優先", () => {
    // categoryMain=bag、 legacy category=tops（矛盾）→ categoryMain=bag を採用
    expect(
      categorize(w({ id: "x1", categoryMain: "bag", category: "tops" })),
    ).toBe<CategoryGroup>("bag");
    // 逆方向: categoryMain=tops、 legacy category=accessories → categoryMain=tops を採用
    expect(
      categorize(w({ id: "x2", categoryMain: "tops", category: "accessories" })),
    ).toBe<CategoryGroup>("tops");
  });

  it("⑥ unknown / other は null（pool に入らない）", () => {
    expect(categorize(w({ id: "o1", categoryMain: "other" }))).toBeNull();
    expect(categorize(w({ id: "o2", category: "other" }))).toBeNull();
  });

  it("⑦ 既存 outer/tops/bottoms/shoes の分類が壊れていない", () => {
    expect(categorize(w({ id: "o", categoryMain: "outer" }))).toBe<CategoryGroup>("outer");
    expect(categorize(w({ id: "o-legacy", category: "outerwear" }))).toBe<CategoryGroup>("outer");
    expect(categorize(w({ id: "t", categoryMain: "tops" }))).toBe<CategoryGroup>("tops");
    expect(categorize(w({ id: "t-legacy", category: "tops" }))).toBe<CategoryGroup>("tops");
    expect(categorize(w({ id: "b", categoryMain: "bottoms" }))).toBe<CategoryGroup>("bottoms");
    expect(categorize(w({ id: "b-legacy", category: "bottoms" }))).toBe<CategoryGroup>("bottoms");
    expect(categorize(w({ id: "s", categoryMain: "shoes" }))).toBe<CategoryGroup>("shoes");
    expect(categorize(w({ id: "s-legacy", category: "shoes" }))).toBe<CategoryGroup>("shoes");
  });

  it("補: categoryMain も category も無い → null", () => {
    // category は WardrobeItem で必須なので空文字列 cast でテスト
    expect(categorize({ id: "n", name: "", category: "" as never, color: "" } as WardrobeItem)).toBeNull();
  });
});

// ── ⑧ buildCombo / pools 構造の non-regression（source assertion） ────

describe("D2-1 構造固定 — buildCombo 未配線・既存挙動不変", () => {
  const SRC = readFileSync(
    "app/(culcept)/calendar/_lib/outfitEngine.ts",
    "utf8",
  ).replace(/\s+/g, " ");

  it("⑧ pools 初期化に bag / accessory が含まれる（型網羅性）", () => {
    // 初期化リテラルが 6 key（outer / tops / bottoms / shoes / bag / accessory）
    expect(SRC).toContain(
      "outer: [], tops: [], bottoms: [], shoes: [], bag: [], accessory: []",
    );
  });

  it("D2-1 時点の核: pools 初期化に bag/accessory が両方含まれる（D2-2 以降の supplemental 配線の土台）", () => {
    // D2-1 で 6 key 初期化を確立した事実は不変。 D2-2 以降は selectedItems への push が解禁される（buildCombo 末尾）。
    expect(SRC).toContain("bag: []");
    expect(SRC).toContain("accessory: []");
    // 既存の主軸（tops/bottoms/outer/shoes）の選定は不変（pickBest 経路の固定）。
    expect(SRC).toContain("pickBest(pools.tops)");
    expect(SRC).toContain("pickBest(pools.bottoms)");
    expect(SRC).toContain("pools.shoes");
    expect(SRC).toContain("pools.outer");
  });

  it("⑨ 既存 selectedItems.length < 2 境界が維持されている（bag/accessory のみでは null）", () => {
    expect(SRC).toContain("if (selectedItems.length < 2) return null;");
  });

  it("変数名 `pools` の型は CategoryGroup に依存（D2-1 拡張の型網羅性は tsc で検証）", () => {
    expect(SRC).toContain("Record<CategoryGroup, WardrobeItem[]>");
  });
});
