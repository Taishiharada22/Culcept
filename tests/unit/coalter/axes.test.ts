/**
 * CoAlter Phase 1.5 — 軸定義・ユーティリティのテスト
 */

import { describe, it, expect } from "vitest";
import {
  getAxesForTheme,
  getAxisMeta,
  deltasToTemplate,
  normalizeTitle,
  candidateKey,
} from "@/lib/coalter/axes";

describe("getAxesForTheme", () => {
  it("food: 共通軸 + quietness + atmosphere", () => {
    const axes = getAxesForTheme("food");
    expect(axes).toEqual([
      "price",
      "access",
      "novelty",
      "quietness",
      "atmosphere",
    ]);
  });

  it("movie: 共通軸 + tone + runtime", () => {
    const axes = getAxesForTheme("movie");
    expect(axes).toEqual(["price", "access", "novelty", "tone", "runtime"]);
  });

  it("travel: 共通軸 + activity + relaxation", () => {
    const axes = getAxesForTheme("travel");
    expect(axes).toEqual([
      "price",
      "access",
      "novelty",
      "activity",
      "relaxation",
    ]);
  });

  it("schedule: 共通軸 + flexibility + effort", () => {
    const axes = getAxesForTheme("schedule");
    expect(axes).toEqual([
      "price",
      "access",
      "novelty",
      "flexibility",
      "effort",
    ]);
  });

  it("gift: 共通軸のみ", () => {
    expect(getAxesForTheme("gift")).toEqual(["price", "access", "novelty"]);
  });

  it("activity: 共通軸のみ", () => {
    expect(getAxesForTheme("activity")).toEqual(["price", "access", "novelty"]);
  });

  it("general: 共通軸のみ", () => {
    expect(getAxesForTheme("general")).toEqual(["price", "access", "novelty"]);
  });
});

describe("getAxisMeta", () => {
  it("quietness のラベルが正しい", () => {
    const meta = getAxisMeta("quietness");
    expect(meta.label).toBe("静かさ");
    expect(meta.lowLabel).toBe("賑やか");
    expect(meta.highLabel).toBe("静か");
  });

  it("novelty のラベルが正しい", () => {
    const meta = getAxisMeta("novelty");
    expect(meta.label).toBe("新しさ");
  });

  it("全軸がメタを持つ", () => {
    const keys = [
      "price",
      "access",
      "novelty",
      "quietness",
      "atmosphere",
      "tone",
      "runtime",
      "activity",
      "relaxation",
      "flexibility",
      "effort",
    ] as const;
    for (const k of keys) {
      const meta = getAxisMeta(k);
      expect(meta.key).toBe(k);
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.lowLabel.length).toBeGreaterThan(0);
      expect(meta.highLabel.length).toBeGreaterThan(0);
    }
  });
});

describe("deltasToTemplate", () => {
  it("1つの軸の +1", () => {
    const tpl = deltasToTemplate({ quietness: 1 });
    expect(tpl).toBe("静かさを上げて候補を組み直しました。");
  });

  it("1つの軸の -1", () => {
    const tpl = deltasToTemplate({ novelty: -1 });
    expect(tpl).toBe("新しさを下げて候補を組み直しました。");
  });

  it("複数軸の組み合わせ", () => {
    const tpl = deltasToTemplate({ quietness: 1, novelty: -1 });
    expect(tpl).toBe("静かさを上げ、新しさを下げて候補を組み直しました。");
  });

  it("空は空文字", () => {
    expect(deltasToTemplate({})).toBe("");
  });

  it("0 のエントリは無視", () => {
    const tpl = deltasToTemplate({ quietness: 0 as unknown as number });
    expect(tpl).toBe("");
  });

  it("未知のキーは無視", () => {
    const tpl = deltasToTemplate({ unknown_axis: 1 });
    expect(tpl).toBe("");
  });

  it("一部が既知、一部が未知でも既知分だけ返す", () => {
    const tpl = deltasToTemplate({ price: 1, unknown: -1 });
    expect(tpl).toBe("価格を上げて候補を組み直しました。");
  });
});

describe("normalizeTitle", () => {
  it("空白除去", () => {
    expect(normalizeTitle("ミッション インポッシブル")).toBe(
      "ミッションインポッシブル",
    );
  });

  it("全角スペース除去", () => {
    expect(normalizeTitle("A　B")).toBe("ab");
  });

  it("中黒・ハイフン除去", () => {
    expect(normalizeTitle("Mission: Impossible - 8")).toBe("mission:impossible8");
  });

  it("小文字化", () => {
    expect(normalizeTitle("HELLO World")).toBe("helloworld");
  });

  it("句読点除去", () => {
    expect(normalizeTitle("美味しい、お店。")).toBe("美味しいお店");
  });
});

describe("candidateKey", () => {
  it("URLありの場合は url: プレフィックス", () => {
    const key = candidateKey({
      title: "なんでも",
      url: "https://eiga.com/movie/12345/",
    });
    expect(key).toBe("url:eiga.com/movie/12345");
  });

  it("末尾スラッシュを除去", () => {
    const key1 = candidateKey({
      title: "A",
      url: "https://example.com/path/",
    });
    const key2 = candidateKey({
      title: "A",
      url: "https://example.com/path",
    });
    expect(key1).toBe(key2);
  });

  it("URLなしは title: プレフィックス", () => {
    const key = candidateKey({ title: "TRATTORIA GRANDE" });
    expect(key).toBe("title:trattoriagrande");
  });

  it("不正URLは title フォールバック", () => {
    const key = candidateKey({ title: "Foo Bar", url: "not-a-url" });
    expect(key).toBe("title:foobar");
  });

  it("URL null は title フォールバック", () => {
    const key = candidateKey({ title: "Foo Bar", url: null });
    expect(key).toBe("title:foobar");
  });

  it("同一 URL は同じキー", () => {
    const k1 = candidateKey({ title: "A", url: "https://a.com/x" });
    const k2 = candidateKey({ title: "B", url: "https://a.com/x" });
    expect(k1).toBe(k2);
  });

  it("同一タイトル・空白違いは同じキー（URL無し）", () => {
    const k1 = candidateKey({ title: "ミッション インポッシブル" });
    const k2 = candidateKey({ title: "ミッション　インポッシブル" });
    expect(k1).toBe(k2);
  });
});
