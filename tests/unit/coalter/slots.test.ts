/**
 * CoAlter Slots — Phase 1.5.4
 *
 * - THEME_RULES が movie/food/travel で意図通りか
 * - composeTitle が coreSlot + aux の合成ルールに従うか
 * - normalizeSlotBundle が不正入力を安全に捨てるか
 */

import { describe, it, expect } from "vitest";
import {
  THEME_RULES,
  getThemeRule,
  composeTitle,
  tryComposeTitle,
  canComposeTitle,
  normalizeSlotContent,
  normalizeSlotBundle,
  isSlotKey,
  isSlotStatus,
  type SlotBundle,
} from "@/lib/coalter/slots";

describe("THEME_RULES", () => {
  it("movie は what が core で、aux は where と when", () => {
    const rule = THEME_RULES.movie!;
    expect(rule.core).toBe("what");
    expect(rule.aux).toEqual(["where", "when"]);
  });

  it("food は where が core で、aux は what", () => {
    const rule = THEME_RULES.food!;
    expect(rule.core).toBe("where");
    expect(rule.aux).toEqual(["what"]);
  });

  it("travel は where が core で、aux は when", () => {
    const rule = THEME_RULES.travel!;
    expect(rule.core).toBe("where");
    expect(rule.aux).toEqual(["when"]);
  });

  it("検証スコープ外テーマ（gift/schedule 等）は null", () => {
    expect(getThemeRule("gift")).toBeNull();
    expect(getThemeRule("schedule")).toBeNull();
    expect(getThemeRule("general")).toBeNull();
    expect(getThemeRule(null)).toBeNull();
    expect(getThemeRule(undefined)).toBeNull();
  });
});

describe("composeTitle", () => {
  const movieRule = THEME_RULES.movie!;
  const foodRule = THEME_RULES.food!;
  const travelRule = THEME_RULES.travel!;

  it("movie: what + where の合成", () => {
    const slots: SlotBundle = {
      what: { label: "ラストマイル", status: "proposed" },
      where: { label: "渋谷ストリーム", status: "proposed" },
    };
    expect(composeTitle(movieRule, slots)).toBe("ラストマイル × 渋谷ストリーム");
  });

  it("movie: where が欠けたら when にフォールバック（aux 優先順）", () => {
    const slots: SlotBundle = {
      what: { label: "ラストマイル", status: "proposed" },
      when: { label: "19:00〜", status: "tentative" },
    };
    expect(composeTitle(movieRule, slots)).toBe("ラストマイル × 19:00〜");
  });

  it("movie: aux が全く無ければ core 単独", () => {
    const slots: SlotBundle = {
      what: { label: "ラストマイル", status: "proposed" },
    };
    expect(composeTitle(movieRule, slots)).toBe("ラストマイル");
  });

  it("movie: core=what が無ければ throw", () => {
    const slots: SlotBundle = {
      where: { label: "渋谷ストリーム", status: "proposed" },
    };
    expect(() => composeTitle(movieRule, slots)).toThrow(/compose_title_core_missing/);
  });

  it("food: where + what", () => {
    const slots: SlotBundle = {
      where: { label: "銀座バル", status: "proposed" },
      what: { label: "イタリアン", status: "confirmed" },
    };
    expect(composeTitle(foodRule, slots)).toBe("銀座バル × イタリアン");
  });

  it("travel: where + when", () => {
    const slots: SlotBundle = {
      where: { label: "箱根", status: "proposed" },
      when: { label: "今週末", status: "confirmed" },
    };
    expect(composeTitle(travelRule, slots)).toBe("箱根 × 今週末");
  });

  it("aux の優先順を尊重（movie は where > when）", () => {
    const slots: SlotBundle = {
      what: { label: "作品A", status: "proposed" },
      where: { label: "館X", status: "proposed" },
      when: { label: "19:00", status: "proposed" },
    };
    expect(composeTitle(movieRule, slots)).toBe("作品A × 館X");
  });

  it("空ラベルは aux として無視される", () => {
    const slots: SlotBundle = {
      what: { label: "作品A", status: "proposed" },
      where: { label: "", status: "proposed" },
      when: { label: "19:00", status: "proposed" },
    };
    expect(composeTitle(movieRule, slots)).toBe("作品A × 19:00");
  });
});

describe("tryComposeTitle", () => {
  it("未定義テーマでは null", () => {
    const slots: SlotBundle = { what: { label: "X", status: "proposed" } };
    expect(tryComposeTitle("general", slots)).toBeNull();
    expect(tryComposeTitle(null, slots)).toBeNull();
  });

  it("core 欠落時は throw せず null", () => {
    const slots: SlotBundle = {
      where: { label: "渋谷", status: "proposed" },
    };
    expect(tryComposeTitle("movie", slots)).toBeNull();
  });

  it("正常系は文字列を返す", () => {
    expect(
      tryComposeTitle("food", {
        where: { label: "銀座バル", status: "proposed" },
        what: { label: "イタリアン", status: "proposed" },
      }),
    ).toBe("銀座バル × イタリアン");
  });
});

describe("canComposeTitle", () => {
  it("core が埋まっていれば true", () => {
    expect(
      canComposeTitle("movie", { what: { label: "A", status: "proposed" } }),
    ).toBe(true);
  });

  it("core が無ければ false", () => {
    expect(
      canComposeTitle("movie", { where: { label: "X", status: "proposed" } }),
    ).toBe(false);
  });

  it("未定義テーマは false", () => {
    expect(
      canComposeTitle("general", { what: { label: "A", status: "proposed" } }),
    ).toBe(false);
  });
});

describe("normalizeSlotContent", () => {
  it("label が空なら null", () => {
    expect(normalizeSlotContent({ label: "" })).toBeNull();
    expect(normalizeSlotContent({ label: "   " })).toBeNull();
    expect(normalizeSlotContent({})).toBeNull();
    expect(normalizeSlotContent(null)).toBeNull();
    expect(normalizeSlotContent("not object")).toBeNull();
  });

  it("正常な label で SlotContent を返す（status デフォルト=proposed）", () => {
    const r = normalizeSlotContent({ label: "ラストマイル" });
    expect(r).toEqual({ label: "ラストマイル", status: "proposed" });
  });

  it("status が妥当なら採用", () => {
    const r = normalizeSlotContent({ label: "X", status: "confirmed" });
    expect(r?.status).toBe("confirmed");
  });

  it("status が不正なら proposed にフォールバック", () => {
    const r = normalizeSlotContent({ label: "X", status: "weird" });
    expect(r?.status).toBe("proposed");
  });

  it("detail は空文字を落とす", () => {
    const r = normalizeSlotContent({ label: "X", detail: "  " });
    expect(r?.detail).toBeUndefined();
  });

  it("url は https/http のみ通す", () => {
    expect(
      normalizeSlotContent({ label: "X", url: "https://example.com" })?.url,
    ).toBe("https://example.com");
    expect(
      normalizeSlotContent({ label: "X", url: "javascript:alert(1)" })?.url,
    ).toBeUndefined();
    expect(
      normalizeSlotContent({ label: "X", url: "not a url" })?.url,
    ).toBeUndefined();
  });
});

describe("normalizeSlotBundle", () => {
  it("null / 非オブジェクトは空束", () => {
    expect(normalizeSlotBundle(null)).toEqual({});
    expect(normalizeSlotBundle("str")).toEqual({});
    expect(normalizeSlotBundle(42)).toEqual({});
  });

  it("5W1H のキーだけ拾う、他は無視", () => {
    const r = normalizeSlotBundle({
      what: { label: "A", status: "confirmed" },
      where: { label: "B", status: "proposed" },
      noise: { label: "C" }, // 無視
      when: null, // 無視（label 無い）
    });
    expect(Object.keys(r).sort()).toEqual(["what", "where"]);
    expect(r.what?.label).toBe("A");
    expect(r.where?.label).toBe("B");
  });
});

describe("型ガード", () => {
  it("isSlotKey", () => {
    expect(isSlotKey("what")).toBe(true);
    expect(isSlotKey("why")).toBe(true);
    expect(isSlotKey("weird")).toBe(false);
    expect(isSlotKey(null)).toBe(false);
  });

  it("isSlotStatus", () => {
    expect(isSlotStatus("confirmed")).toBe(true);
    expect(isSlotStatus("proposed")).toBe(true);
    expect(isSlotStatus("tentative")).toBe(true);
    expect(isSlotStatus("other")).toBe(false);
  });
});
