/**
 * canonicalLocationText helpers — pure logic tests (Phase 2-D C1)
 *
 * 設計書: docs/alter-plan-phase2-d-place-picker-mini-design.md v2 §5.4
 *
 * 検証範囲:
 *   - formatCanonicalLocationText: displayName + address combine
 *   - parseCanonicalLocationText: split back into { displayName, address }
 *   - isCanonicalLocationText: separator + 両 part non-empty 判定
 *   - extractDisplayNameForUI: UI 表示用 displayName 抽出 (CalendarTab/FlowTab/MapTab で共通使用)
 */

import { describe, it, expect } from "vitest";

import {
  CANONICAL_SEPARATOR,
  extractDisplayNameForUI,
  formatCanonicalLocationText,
  isCanonicalLocationText,
  parseCanonicalLocationText,
} from "@/lib/shared/canonicalLocationText";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("formatCanonicalLocationText", () => {
  it("displayName + address → canonical text (separator ` · `)", () => {
    const r = formatCanonicalLocationText("スターバックス 成田空港店", "千葉県成田市古込1番地");
    expect(r).toBe("スターバックス 成田空港店 · 千葉県成田市古込1番地");
    expect(r).toContain(CANONICAL_SEPARATOR);
  });

  it("displayName のみ → displayName そのまま", () => {
    expect(formatCanonicalLocationText("自宅", null)).toBe("自宅");
    expect(formatCanonicalLocationText("自宅", "")).toBe("自宅");
  });

  it("address のみ (displayName 空) → address そのまま", () => {
    expect(formatCanonicalLocationText("", "千葉県成田市")).toBe("千葉県成田市");
    expect(formatCanonicalLocationText(null, "千葉県成田市")).toBe("千葉県成田市");
  });

  it("両方 null/空 → 空文字列", () => {
    expect(formatCanonicalLocationText(null, null)).toBe("");
    expect(formatCanonicalLocationText("", "")).toBe("");
  });

  it("前後 whitespace を trim", () => {
    expect(formatCanonicalLocationText("  スタバ  ", "  千葉県  ")).toBe("スタバ · 千葉県");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseCanonicalLocationText", () => {
  it("canonical text → { displayName, address } に split", () => {
    const r = parseCanonicalLocationText("スターバックス 成田空港店 · 千葉県成田市古込1番地");
    expect(r).toEqual({
      displayName: "スターバックス 成田空港店",
      address: "千葉県成田市古込1番地",
    });
  });

  it("non-canonical (separator なし) → { displayName: text, address: null }", () => {
    const r = parseCanonicalLocationText("近所のスタバ");
    expect(r).toEqual({ displayName: "近所のスタバ", address: null });
  });

  it("空文字列 → { displayName: '', address: null }", () => {
    expect(parseCanonicalLocationText("")).toEqual({ displayName: "", address: null });
    expect(parseCanonicalLocationText("   ")).toEqual({ displayName: "", address: null });
  });

  it("複数 separator → 最初のみ split、残り address に join", () => {
    const r = parseCanonicalLocationText("Cafe · 渋谷区 · 別住所");
    expect(r.displayName).toBe("Cafe");
    expect(r.address).toBe("渋谷区 · 別住所");
  });

  it("separator 前後の whitespace 違いに tolerant (正規表現で吸収)", () => {
    const r = parseCanonicalLocationText("スタバ   ·   千葉県");
    expect(r.displayName).toBe("スタバ");
    expect(r.address).toBe("千葉県");
  });

  it("format → parse の round-trip", () => {
    const original = formatCanonicalLocationText("スターバックス 成田空港店", "千葉県成田市古込1番地");
    const parsed = parseCanonicalLocationText(original);
    expect(parsed.displayName).toBe("スターバックス 成田空港店");
    expect(parsed.address).toBe("千葉県成田市古込1番地");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isCanonicalLocationText", () => {
  it("displayName + address が両方 non-empty → true", () => {
    expect(isCanonicalLocationText("スタバ · 千葉県成田市")).toBe(true);
  });

  it("separator なし → false (= まだ未確定の free text)", () => {
    expect(isCanonicalLocationText("近所のスタバ")).toBe(false);
  });

  it("空文字列 / null / undefined → false", () => {
    expect(isCanonicalLocationText("")).toBe(false);
    expect(isCanonicalLocationText(null)).toBe(false);
    expect(isCanonicalLocationText(undefined)).toBe(false);
  });

  it("separator あるが片方空 → false (defensive)", () => {
    // edge case: " · 千葉県" のような malformed
    expect(isCanonicalLocationText(" · 千葉県")).toBe(false);
    // edge case: "スタバ · " のような malformed
    // parse: { displayName: "スタバ", address: "" } → "" は trim 後 falsy
    // ただし parse の trim 後 address が "" になり、null 化される実装
    const result = parseCanonicalLocationText("スタバ · ");
    expect(result.address).toBeNull();
    expect(isCanonicalLocationText("スタバ · ")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("extractDisplayNameForUI", () => {
  it("canonical text → displayName 部分のみ", () => {
    expect(
      extractDisplayNameForUI("スターバックス 成田空港店 · 千葉県成田市古込1番地"),
    ).toBe("スターバックス 成田空港店");
  });

  it("non-canonical (separator なし) → text そのまま", () => {
    expect(extractDisplayNameForUI("近所のスタバ")).toBe("近所のスタバ");
  });

  it("空文字列 → 空文字列", () => {
    expect(extractDisplayNameForUI("")).toBe("");
    expect(extractDisplayNameForUI(null)).toBe("");
    expect(extractDisplayNameForUI(undefined)).toBe("");
  });

  it("Cross-tab 表示で noise 削減 (mockup の世界トップ pattern 整合)", () => {
    // 例: CalendarTab で "スターバックス 成田空港店 · 千葉県成田市古込1番地" のフル表示は noisy
    // → extractDisplayNameForUI で "スターバックス 成田空港店" のみ表示、address は AnchorDetailModal で
    const fullText =
      "スターバックス コーヒー 東京駅一番街店 · 東京都千代田区丸の内1丁目9-1 東京駅一番街地下1階";
    const displayed = extractDisplayNameForUI(fullText);
    expect(displayed).toBe("スターバックス コーヒー 東京駅一番街店");
    expect(displayed.length).toBeLessThan(fullText.length);
  });
});
