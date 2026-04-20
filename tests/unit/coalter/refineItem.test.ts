/**
 * CoAlter Phase 1.5.3 ④ — 局所リファインメント
 *
 * - RefineDirection 型ガード
 * - sanitize が禁止表現を消す
 * - buildRefinePrompt が item と direction を両方含む
 */

import { describe, it, expect, vi } from "vitest";

// server-only は Next.js の RSC 検出用。Node 環境では空モジュールに差し替える
vi.mock("server-only", () => ({}));
// refineItem は runAI を使わないテストだけを行う。LLM 側のモックは不要
vi.mock("@/lib/ai", () => ({ runAI: vi.fn() }));

import {
  isRefineDirection,
  REFINE_DIRECTION_LABEL,
  __internal,
} from "@/lib/coalter/refineItem";

const { sanitize, buildRefinePrompt } = __internal;

describe("isRefineDirection", () => {
  it("定義済みの direction は true", () => {
    expect(isRefineDirection("cheaper")).toBe(true);
    expect(isRefineDirection("earlier")).toBe(true);
    expect(isRefineDirection("later")).toBe(true);
    expect(isRefineDirection("closer")).toBe(true);
    expect(isRefineDirection("quieter")).toBe(true);
    expect(isRefineDirection("livelier")).toBe(true);
  });

  it("未定義の値は false", () => {
    expect(isRefineDirection("unknown")).toBe(false);
    expect(isRefineDirection("")).toBe(false);
    expect(isRefineDirection(null)).toBe(false);
    expect(isRefineDirection(undefined)).toBe(false);
    expect(isRefineDirection(123)).toBe(false);
    expect(isRefineDirection({ cheaper: true })).toBe(false);
  });
});

describe("REFINE_DIRECTION_LABEL", () => {
  it("全 direction に日本語ラベルが定義されている", () => {
    for (const dir of ["cheaper", "earlier", "later", "closer", "quieter", "livelier"] as const) {
      expect(REFINE_DIRECTION_LABEL[dir]).toBeDefined();
      expect(REFINE_DIRECTION_LABEL[dir].length).toBeGreaterThan(0);
    }
  });
});

describe("sanitize", () => {
  it("断定・命令を削る", () => {
    expect(sanitize("これに決めるべきです")).not.toContain("すべきです");
    expect(sanitize("Aに合わせなければなりません")).not.toContain("しなければ");
    expect(sanitize("最適な選択はこれです")).not.toContain("最適な選択は");
  });

  it("「正しい〜は」系を削る", () => {
    expect(sanitize("正しい選択はこれ")).not.toContain("正しい選択は");
    expect(sanitize("正しい判断は回避です")).not.toContain("正しい判断は");
  });

  it("「本当は〜思ってる」系を削る", () => {
    expect(sanitize("本当はそう思っているはず")).not.toContain("本当は");
  });

  it("適合率表記を削る", () => {
    expect(sanitize("マッチング度 80%")).not.toMatch(/マッチング度/);
    expect(sanitize("一致度 90%")).not.toMatch(/一致度/);
    expect(sanitize("85%")).not.toMatch(/\d{2,3}%/);
  });

  it("通常の文は変わらない", () => {
    const input = "落ち着いた雰囲気のお店で、ゆっくり過ごせます";
    expect(sanitize(input)).toBe(input);
  });

  it("前後の空白はトリムされる", () => {
    expect(sanitize("  ゆっくり  ")).toBe("ゆっくり");
  });
});

describe("buildRefinePrompt", () => {
  const baseItem = {
    title: "Cafe Aneu",
    description: "落ち着いた雰囲気のカフェ",
    practicalInfo: "渋谷区神南",
    timeSlot: "15:00",
    category: "food",
    targetDate: "2026-05-01",
  };

  it("item の主要フィールドが含まれる", () => {
    const prompt = buildRefinePrompt(baseItem, "cheaper");
    expect(prompt).toContain(baseItem.title);
    expect(prompt).toContain(baseItem.description);
    expect(prompt).toContain(baseItem.practicalInfo);
    expect(prompt).toContain(baseItem.timeSlot);
    expect(prompt).toContain(baseItem.category);
    expect(prompt).toContain(baseItem.targetDate);
  });

  it("direction が本文に含まれる", () => {
    const prompt = buildRefinePrompt(baseItem, "cheaper");
    expect(prompt).toContain("cheaper");
    expect(prompt).toContain("予算");
  });

  it("practicalInfo / timeSlot が null でも壊れない", () => {
    const prompt = buildRefinePrompt(
      { ...baseItem, practicalInfo: null, timeSlot: null },
      "livelier",
    );
    expect(prompt).toContain("(なし)");
    expect(prompt).toContain("(未設定)");
    expect(prompt).toContain("livelier");
  });

  it("日付・カテゴリを変えないよう指示が含まれる", () => {
    const prompt = buildRefinePrompt(baseItem, "earlier");
    expect(prompt).toContain("日付");
    expect(prompt).toContain("カテゴリ");
  });
});
