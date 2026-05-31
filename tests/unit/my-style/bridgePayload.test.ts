import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

import {
  wardrobeCategoriesToTextArray,
  bridgeWriteHttpStatus,
} from "@/app/api/my-style/bridge/bridgePayload";

/**
 * 22P02 fix — bridge POST payload / outcome。
 *
 * 1) wardrobe_categories（DB text[]）へ object/null/array を安全に string[] 化する。
 * 2) styleSummary 失敗（quiz_result.myStyleState.wardrobe を含む）を 200 で握り潰さない。
 */

describe("wardrobeCategoriesToTextArray（text[] 正規化）", () => {
  it("① object → 非空キーの配列（22P02 を防ぐ）", () => {
    expect(wardrobeCategoriesToTextArray({ tops: 3, bottoms: 2, shoes: 1 })).toEqual(["tops", "bottoms", "shoes"]);
  });

  it("② null / undefined → []", () => {
    expect(wardrobeCategoriesToTextArray(null)).toEqual([]);
    expect(wardrobeCategoriesToTextArray(undefined)).toEqual([]);
  });

  it("③ array → 文字列・非空要素のみ sanitize（既に array でも安全）", () => {
    expect(wardrobeCategoriesToTextArray(["tops", "", "bottoms", 123, null, "  "])).toEqual(["tops", "bottoms"]);
  });

  it("補: 空 object → []、 空キーは除外", () => {
    expect(wardrobeCategoriesToTextArray({})).toEqual([]);
    expect(wardrobeCategoriesToTextArray({ "": 1, tops: 2 })).toEqual(["tops"]);
  });

  it("補: number / string / boolean → []", () => {
    expect(wardrobeCategoriesToTextArray(5)).toEqual([]);
    expect(wardrobeCategoriesToTextArray("tops")).toEqual([]);
    expect(wardrobeCategoriesToTextArray(true)).toEqual([]);
  });
});

describe("bridgeWriteHttpStatus（styleSummary 失敗を握り潰さない）", () => {
  it("④ 失敗なし → 200（styleSummary 成功 = POST success）", () => {
    expect(bridgeWriteHttpStatus([])).toBe(200);
  });

  it("⑤ styleSummary 失敗 → 500（完全成功扱いにしない）", () => {
    expect(bridgeWriteHttpStatus(["styleSummary"])).toBe(500);
  });

  it("⑥ prefProfile 成功 + styleSummary 失敗 → 500（200 synced にしない）", () => {
    expect(bridgeWriteHttpStatus(["styleSummary"])).toBe(500);
    expect(bridgeWriteHttpStatus(["styleSummary", "prefProfile"])).toBe(500);
  });

  it("⑧ prefProfile のみ失敗 → 200（wardrobe は保存済・非致命）", () => {
    expect(bridgeWriteHttpStatus(["prefProfile"])).toBe(200);
  });
});

describe("bridge route 構造（回帰固定）", () => {
  const SRC = readFileSync("app/api/my-style/bridge/route.ts", "utf8").replace(/\s+/g, " ");

  it("wardrobe_categories は text[] 正規化を経由（旧・直書きに戻っていない）", () => {
    expect(SRC).toContain("wardrobe_categories: wardrobeCategoriesToTextArray(derived.summary.wardrobeCategories)");
    expect(SRC).not.toContain("wardrobe_categories: derived.summary.wardrobeCategories,");
  });

  it("⑦ quiz_result.myStyleState.wardrobe は従来どおり送られる", () => {
    expect(SRC).toContain("quiz_result: nextQuizResult");
    expect(SRC).toContain("myStyleState: createPortableStateSnapshot(derived.normalizedState)");
  });

  it("⑤⑥ styleSummary 失敗時の status 判定が配線されている", () => {
    expect(SRC).toContain("bridgeWriteHttpStatus(failures)");
    expect(SRC).toContain("status: httpStatus");
  });

  it("⑧ 既存の prefProfile upsert を壊していない", () => {
    expect(SRC).toContain('from("pref_profile").upsert(prefProfilePayload');
  });
});
