/**
 * Bug B (CEO方針 2026-04-18): Person Alias Layer Phase 1
 *
 * Phase 1 スコープ:
 *   - 敬称末尾剥離で canonical key を作る
 *   - 完全一致 / 敬称剥離一致で同一人物判定
 *   - 敬称つき表記を displayName に格上げ
 *
 * Phase 2 以降（本テストの対象外）:
 *   - ひら/カナ/漢字ゆれ（仙洞田 ↔ せんどうだ）
 *   - 愛称（せんちゃん、タナ）
 *   - 関係ラベル（先輩、母、彼女）
 */

import { describe, test, expect, vi, beforeAll } from "vitest";

vi.mock("server-only", () => ({}));

import {
  canonicalPersonKey,
  arePersonsSame,
  dedupePersonList,
  PersonRegistry,
} from "@/lib/alter-morning/personAlias";

let normalizeLLMOutput: typeof import("@/lib/alter-morning/llmPlanExtractor").normalizeLLMOutput;

beforeAll(async () => {
  const { preloadVocabulary } = await import("@/lib/alter-morning/intentParser");
  await preloadVocabulary();
  const ext = await import("@/lib/alter-morning/llmPlanExtractor");
  normalizeLLMOutput = ext.normalizeLLMOutput;
});

describe("Bug B Phase 1: canonicalPersonKey — 敬称末尾剥離", () => {
  test("「仙洞田」→ 仙洞田", () => {
    expect(canonicalPersonKey("仙洞田")).toBe("仙洞田");
  });

  test("「仙洞田さん」→ 仙洞田", () => {
    expect(canonicalPersonKey("仙洞田さん")).toBe("仙洞田");
  });

  test("「田中くん」→ 田中", () => {
    expect(canonicalPersonKey("田中くん")).toBe("田中");
  });

  test("「佐藤様」→ 佐藤", () => {
    expect(canonicalPersonKey("佐藤様")).toBe("佐藤");
  });

  test("「木村ちゃん」→ 木村", () => {
    expect(canonicalPersonKey("木村ちゃん")).toBe("木村");
  });

  test("前後空白は削る", () => {
    expect(canonicalPersonKey("  田中さん ")).toBe("田中");
  });

  test("「先輩」→ 先輩（敬称ではなく関係ラベル。Phase 1 はそのまま）", () => {
    // Phase 2 で関係ラベル扱いを検討
    expect(canonicalPersonKey("先輩")).toBe("先輩");
  });

  test("空文字 → 空", () => {
    expect(canonicalPersonKey("")).toBe("");
    expect(canonicalPersonKey("   ")).toBe("");
  });
});

describe("Bug B Phase 1: arePersonsSame", () => {
  test("「仙洞田」と「仙洞田さん」は同一人物", () => {
    expect(arePersonsSame("仙洞田", "仙洞田さん")).toBe(true);
  });

  test("「田中くん」と「田中」は同一人物", () => {
    expect(arePersonsSame("田中くん", "田中")).toBe(true);
  });

  test("「仙洞田」と「田中」は別人", () => {
    expect(arePersonsSame("仙洞田", "田中")).toBe(false);
  });

  test("「仙洞田さん」と「仙洞田様」は同一人物（どちらも敬称剥離で仙洞田）", () => {
    expect(arePersonsSame("仙洞田さん", "仙洞田様")).toBe(true);
  });

  test("空文字はどちらも null-like として false", () => {
    expect(arePersonsSame("", "仙洞田")).toBe(false);
    expect(arePersonsSame("仙洞田", "")).toBe(false);
  });
});

describe("Bug B Phase 1: PersonRegistry", () => {
  test("敬称つき形式を displayName に格上げ", () => {
    const reg = new PersonRegistry();
    reg.register("仙洞田");
    const entry = reg.register("仙洞田さん");
    expect(entry?.displayName).toBe("仙洞田さん");
    expect(entry?.aliases).toEqual(["仙洞田", "仙洞田さん"]);
  });

  test("逆順でも同じ canonical ID に統合される", () => {
    const reg = new PersonRegistry();
    const a = reg.register("仙洞田さん");
    const b = reg.register("仙洞田");
    expect(a?.canonicalId).toBe(b?.canonicalId);
    expect(a?.displayName).toBe("仙洞田さん"); // 敬称つきを維持
  });

  test("別人は別の canonical ID", () => {
    const reg = new PersonRegistry();
    const a = reg.register("仙洞田さん");
    const b = reg.register("田中さん");
    expect(a?.canonicalId).not.toBe(b?.canonicalId);
  });

  test("空文字は null を返す", () => {
    const reg = new PersonRegistry();
    expect(reg.register("")).toBeNull();
    expect(reg.register("  ")).toBeNull();
  });

  test("lookup で未登録は null", () => {
    const reg = new PersonRegistry();
    expect(reg.lookup("仙洞田")).toBeNull();
  });
});

describe("Bug B Phase 1: dedupePersonList", () => {
  test("敬称ゆれを統一: [仙洞田, 仙洞田さん] → [仙洞田さん]", () => {
    expect(dedupePersonList(["仙洞田", "仙洞田さん"])).toEqual(["仙洞田さん"]);
  });

  test("逆順でも [仙洞田さん, 仙洞田] → [仙洞田さん]", () => {
    expect(dedupePersonList(["仙洞田さん", "仙洞田"])).toEqual(["仙洞田さん"]);
  });

  test("別人同士は保持: [仙洞田さん, 田中] → [仙洞田さん, 田中]", () => {
    expect(dedupePersonList(["仙洞田さん", "田中"])).toEqual([
      "仙洞田さん",
      "田中",
    ]);
  });

  test("3重以上: [仙洞田, 仙洞田さん, 仙洞田様] → 1 人（敬称つき最初のもの）", () => {
    // register 順に敬称つきを採用: 仙洞田（敬称なし）→ 仙洞田さん（敬称つきに昇格）
    // → 仙洞田様（既に敬称つき displayName があるので上書きしない）
    const result = dedupePersonList(["仙洞田", "仙洞田さん", "仙洞田様"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toBe("仙洞田さん");
  });

  test("空文字 / 空白は skip", () => {
    expect(dedupePersonList(["", "仙洞田さん", "  "])).toEqual(["仙洞田さん"]);
  });

  test("空配列 → 空配列", () => {
    expect(dedupePersonList([])).toEqual([]);
  });
});

describe("Bug B Phase 1: 実機 Turn 1 シナリオ想定", () => {
  test("実機ログ想定: 仙洞田 → 仙洞田さん の重複が 1 人に統合", () => {
    // Turn 1: LLM が 「仙洞田とサドヤでランチ」「仙洞田さんと名字の由来…」
    //         の両方から companions に入れてしまった場合
    const result = dedupePersonList(["仙洞田", "仙洞田さん"]);
    expect(result).toEqual(["仙洞田さん"]);
  });

  test("複数人の席: [仙洞田さん, ナウさん, 仙洞田] → [仙洞田さん, ナウさん]", () => {
    expect(dedupePersonList(["仙洞田さん", "ナウさん", "仙洞田"])).toEqual([
      "仙洞田さん",
      "ナウさん",
    ]);
  });
});

describe("Bug B Phase 1: normalizeLLMOutput 統合 — 異なる segment 間で表記を揃える", () => {
  test("segment A「仙洞田」, segment B「仙洞田さん」→ どちらも「仙洞田さん」に統一", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "ランチ",
          place: "サドヤ",
          companions: ["仙洞田"],
        },
        {
          order: 2,
          activity: "お茶",
          place: "カフェ",
          companions: ["仙洞田さん"],
        },
      ],
    });
    expect(state.segments[0].companions).toEqual(["仙洞田さん"]);
    expect(state.segments[1].companions).toEqual(["仙洞田さん"]);
  });

  test("同一 segment 内の重複: companions=[仙洞田, 仙洞田さん] → [仙洞田さん]", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "ランチ",
          place: "サドヤ",
          companions: ["仙洞田", "仙洞田さん"],
        },
      ],
    });
    expect(state.segments[0].companions).toEqual(["仙洞田さん"]);
  });

  test("別人は保持: 仙洞田さん + ナウさん", () => {
    const state = normalizeLLMOutput({
      targetDate: "today",
      segments: [
        {
          order: 1,
          activity: "ミーティング",
          place: "カフェ",
          companions: ["仙洞田さん", "ナウさん"],
        },
      ],
    });
    expect(state.segments[0].companions).toEqual(["仙洞田さん", "ナウさん"]);
  });
});
