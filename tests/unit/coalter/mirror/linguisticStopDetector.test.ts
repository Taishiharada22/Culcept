/**
 * CoAlter AOO Phase B B-5b — linguisticStopDetector invariant test
 *
 * 正本: lib/coalter/mirror/linguisticStopDetector.ts
 */

import { describe, it, expect } from "vitest";
import {
  detectLinguisticStop,
  __getAllStopCommandCategoriesForTest,
  __getStopCommandPatternsForTest,
} from "@/lib/coalter/mirror/linguisticStopDetector";

describe("B-5b linguisticStopDetector — silence_request 検出", () => {
  it("「黙ってて」 → detected (silence_request)", () => {
    expect(detectLinguisticStop("少し黙ってて")).toEqual({
      detected: true,
      command: "silence_request",
    });
  });

  it("「黙って」 → detected (silence_request)", () => {
    expect(detectLinguisticStop("黙って欲しい")).toEqual({
      detected: true,
      command: "silence_request",
    });
  });

  it("「黙れ」 → detected (silence_request)", () => {
    expect(detectLinguisticStop("黙れ")).toEqual({
      detected: true,
      command: "silence_request",
    });
  });
});

describe("B-5b linguisticStopDetector — not_needed_now 検出", () => {
  it("「今は不要」 → detected (not_needed_now)", () => {
    expect(detectLinguisticStop("今は不要です")).toEqual({
      detected: true,
      command: "not_needed_now",
    });
  });

  it("「今はいらない」 → detected (not_needed_now)", () => {
    expect(detectLinguisticStop("今はいらない")).toEqual({
      detected: true,
      command: "not_needed_now",
    });
  });

  it("「いまは不要」 (ひらがな) → detected (not_needed_now)", () => {
    expect(detectLinguisticStop("いまは不要")).toEqual({
      detected: true,
      command: "not_needed_now",
    });
  });
});

describe("B-5b linguisticStopDetector — explicit_suppression 検出", () => {
  it("「出さないで」 → detected (explicit_suppression)", () => {
    expect(detectLinguisticStop("出さないで欲しい")).toEqual({
      detected: true,
      command: "explicit_suppression",
    });
  });

  it("「言わないで」 → detected (explicit_suppression)", () => {
    expect(detectLinguisticStop("何も言わないで")).toEqual({
      detected: true,
      command: "explicit_suppression",
    });
  });

  it("「コメントしないで」 → detected (explicit_suppression)", () => {
    expect(detectLinguisticStop("コメントしないでくれる?")).toEqual({
      detected: true,
      command: "explicit_suppression",
    });
  });

  it("「アドバイスしないで」 → detected (explicit_suppression)", () => {
    expect(detectLinguisticStop("アドバイスしないで")).toEqual({
      detected: true,
      command: "explicit_suppression",
    });
  });
});

describe("B-5b linguisticStopDetector — 非検出 (false positive 防止)", () => {
  it("通常会話 → 非検出", () => {
    expect(detectLinguisticStop("今日は疲れた")).toEqual({ detected: false });
  });

  it("sentiment 風 text → 非検出 (推測しない)", () => {
    expect(detectLinguisticStop("ちょっと寂しい")).toEqual({ detected: false });
    expect(detectLinguisticStop("つらい気持ち")).toEqual({ detected: false });
    expect(detectLinguisticStop("嫌だな")).toEqual({ detected: false });
  });

  it("「いらない」単体 → 非検出 (false positive リスクで除外)", () => {
    expect(detectLinguisticStop("いらない")).toEqual({ detected: false });
  });

  it("「やめて」単体 → 非検出 (false positive リスクで除外、context-ambiguous)", () => {
    expect(detectLinguisticStop("やめて")).toEqual({ detected: false });
    expect(detectLinguisticStop("やめてよ")).toEqual({ detected: false });
  });

  it("空文字 → 非検出 (defensive)", () => {
    expect(detectLinguisticStop("")).toEqual({ detected: false });
  });

  it("空白のみ → 非検出 (pattern 一致なし)", () => {
    expect(detectLinguisticStop("   ")).toEqual({ detected: false });
  });

  it("非 string (defensive) → 非検出", () => {
    expect(
      detectLinguisticStop(undefined as unknown as string),
    ).toEqual({ detected: false });
    expect(
      detectLinguisticStop(null as unknown as string),
    ).toEqual({ detected: false });
    expect(detectLinguisticStop(123 as unknown as string)).toEqual({
      detected: false,
    });
  });
});

describe("B-5b linguisticStopDetector — sentiment 推測しない", () => {
  // 「黙ってて」「言わないで」等の明示コマンドのみ検出、感情語は無視
  it("「悲しい」 → 非検出 (感情語)", () => {
    expect(detectLinguisticStop("悲しい")).toEqual({ detected: false });
  });

  it("「怒ってる」 → 非検出 (感情語)", () => {
    expect(detectLinguisticStop("怒ってる")).toEqual({ detected: false });
  });

  it("「うるさい」 → 非検出 (短語、false positive リスクで除外)", () => {
    expect(detectLinguisticStop("うるさい")).toEqual({ detected: false });
  });

  it("ネガティブ文脈でも明示 command なければ非検出", () => {
    expect(detectLinguisticStop("もう何もしたくない")).toEqual({
      detected: false,
    });
  });
});

describe("B-5b linguisticStopDetector — invariants", () => {
  it("category は 3 種 (exhaustive)", () => {
    const cats = __getAllStopCommandCategoriesForTest();
    expect(cats.length).toBe(3);
    expect(new Set(cats).size).toBe(3);
    expect(cats).toContain("silence_request");
    expect(cats).toContain("not_needed_now");
    expect(cats).toContain("explicit_suppression");
  });

  it("各 category の pattern は 1 件以上", () => {
    const all = __getStopCommandPatternsForTest();
    for (const g of all) {
      expect(g.patterns.length).toBeGreaterThan(0);
    }
  });

  it("deterministic: 同入力で常に同 result", () => {
    const text = "黙ってて";
    expect(detectLinguisticStop(text)).toEqual(detectLinguisticStop(text));
    expect(detectLinguisticStop(text)).toEqual(detectLinguisticStop(text));
  });

  it("input mutation なし (string は immutable、defensive 確認)", () => {
    const text = "黙ってて";
    const snapshot = text;
    detectLinguisticStop(text);
    expect(text).toBe(snapshot);
  });

  it("raw text を保存しない (return value に raw text 漏れなし)", () => {
    const r = detectLinguisticStop("黙ってて — 個人情報 user@example.com");
    // return value は { detected, command } のみ、raw text や PII は含まない
    expect(JSON.stringify(r)).not.toContain("example.com");
    expect(JSON.stringify(r)).not.toContain("user@");
  });
});
