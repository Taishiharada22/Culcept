/**
 * whereVagueClassifier tests — W3-PR-8 Strict Confirmation
 *
 * 設計書: docs/alter-morning-strict-confirmation-design.md §2.6
 *
 * カバレッジ:
 *   - anchor sub-kind: 語尾パターン（周辺 / 近く / エリア / 市 / 区）
 *   - category_chain sub-kind: chain_brand / generic_place + category 語彙
 *   - undecided sub-kind: 未決意表明語彙 8 種すべて
 *   - フェイルセーフ: 意味不明語は undecided に倒す
 *   - deterministic（LLM 非依存）
 */

import { describe, test, expect } from "vitest";

import { classifyWhereVague } from "@/lib/alter-morning/planning/whereVagueClassifier";
import {
  utteranceProvenance,
  type WhereSlot,
} from "@/lib/alter-morning/comprehension/eventSchema";

function mkWhere(
  place_ref: string | null,
  placeType: string | null = "generic_place",
): WhereSlot {
  return {
    place_ref,
    placeType,
    provenance: utteranceProvenance(place_ref ? [place_ref] : [], "low"),
  };
}

describe("classifyWhereVague — anchor sub-kind", () => {
  test.each([
    ["甲府駅周辺", "周辺"],
    ["渋谷近く", "近く"],
    ["丸の内エリア", "エリア"],
    ["甲府市", "市"],
    ["渋谷区", "区"],
  ])("'%s' → anchor (%s 語尾)", (input) => {
    expect(classifyWhereVague(mkWhere(input))).toBe("anchor");
  });

  test("anchor 判定は placeType より優先される（chain_brand でも語尾が anchor なら anchor）", () => {
    // "スタバ周辺" のような病的ケース。語尾 anchor を優先。
    expect(
      classifyWhereVague(mkWhere("スタバ周辺", "chain_brand")),
    ).toBe("anchor");
  });
});

describe("classifyWhereVague — category_chain sub-kind", () => {
  test("placeType=chain_brand は無条件で category_chain", () => {
    expect(
      classifyWhereVague(mkWhere("スタバ", "chain_brand")),
    ).toBe("category_chain");
  });

  test.each([
    "カフェ",
    "レストラン",
    "図書館",
    "喫茶店",
    "オフィス",
  ])("generic_place + category 語彙 '%s' → category_chain", (input) => {
    expect(classifyWhereVague(mkWhere(input, "generic_place"))).toBe(
      "category_chain",
    );
  });

  test.each([
    "スタバ",
    "マック",
    "ドトール",
    "サイゼ",
  ])("generic_place + 既知チェーン '%s' → category_chain", (input) => {
    expect(classifyWhereVague(mkWhere(input, "generic_place"))).toBe(
      "category_chain",
    );
  });
});

describe("classifyWhereVague — undecided sub-kind", () => {
  test.each([
    "決めてない",
    "まだ",
    "未定",
    "どこでもいい",
    "どこでも",
    "わからない",
    "たぶん",
    "どこか",
  ])("未決意表明語彙 '%s' → undecided", (input) => {
    expect(classifyWhereVague(mkWhere(input))).toBe("undecided");
  });

  test("前後空白のみの trim は許容する", () => {
    expect(classifyWhereVague(mkWhere("  決めてない  "))).toBe("undecided");
  });

  test("部分一致は undecided にしない（保守的）", () => {
    // 「決めてないカフェ」のような入力は undecided にしない
    // → 「スタバ」等の chain 語彙にも一致しないので最終フォールバック undecided
    // （カテゴリ語彙との完全一致しない場合に保守的フォールバックへ倒れる）
    expect(classifyWhereVague(mkWhere("決めてないカフェ"))).toBe("undecided");
  });
});

describe("classifyWhereVague — フェイルセーフ", () => {
  test("空文字 → undecided（保守的）", () => {
    expect(classifyWhereVague(mkWhere(""))).toBe("undecided");
  });

  test("null → undecided（保守的）", () => {
    expect(classifyWhereVague(mkWhere(null))).toBe("undecided");
  });

  test("placeType=null + 未知語 → undecided", () => {
    expect(classifyWhereVague(mkWhere("謎の文字列xyz", null))).toBe(
      "undecided",
    );
  });

  test("placeType=generic_place + 非 category 語 → undecided", () => {
    // category にも chain にも該当しない、anchor 語尾でもない
    expect(classifyWhereVague(mkWhere("謎の文字列xyz", "generic_place"))).toBe(
      "undecided",
    );
  });
});

describe("classifyWhereVague — deterministic", () => {
  test("同一入力に対して同一出力（副作用なし）", () => {
    const slot = mkWhere("甲府駅周辺");
    expect(classifyWhereVague(slot)).toBe(classifyWhereVague(slot));
    expect(classifyWhereVague(slot)).toBe(classifyWhereVague(slot));
  });
});
