/**
 * Location Clarify Engine テスト — 場所未指定時の暗黙補完 / 質問ルール
 */

import {
  evaluateLocationClarify,
  applyImplicitLocationFill,
  buildLocationClarifyQuestion,
} from "@/lib/alter-morning/locationClarify";
import type { PlanItem, MainLocation } from "@/lib/alter-morning/types";

function makeLoc(label: string, canonicalId?: string): MainLocation {
  return {
    canonicalId: canonicalId ?? label,
    label,
    source: "user_explicit",
  };
}

function makeItem(overrides: Partial<PlanItem> & { text: string }): PlanItem {
  return {
    id: `test_${Math.random().toString(36).slice(2, 6)}`,
    kind: "todo",
    what: overrides.text,
    durationMin: 60,
    fixedStart: false,
    orderHint: 0,
    sourceTurnIndex: 0,
    completed: false,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// evaluateLocationClarify
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("evaluateLocationClarify", () => {
  test("前後が同エリア → implicit_fill", () => {
    const items = [
      makeItem({ text: "仕事", location: makeLoc("渋谷のスタバ") }),
      makeItem({ text: "買い物" }), // 場所未指定
      makeItem({ text: "ミーティング", location: makeLoc("渋谷のカフェ") }),
    ];
    const results = evaluateLocationClarify(items);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("implicit_fill");
    expect(results[0].implicitArea).toBe("渋谷のスタバ");
  });

  test("前後が別エリア → ask", () => {
    const items = [
      makeItem({ text: "仕事", location: makeLoc("渋谷のスタバ", "shibuya_starbucks") }),
      makeItem({ text: "買い物" }), // 場所未指定
      makeItem({ text: "ミーティング", location: makeLoc("新宿のオフィス", "shinjuku_office") }),
    ];
    const results = evaluateLocationClarify(items);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("ask");
    expect(results[0].askQuestion).toContain("買い物");
  });

  test("前後ともに場所なし → skip（結果なし）", () => {
    const items = [
      makeItem({ text: "仕事" }),
      makeItem({ text: "買い物" }),
      makeItem({ text: "ミーティング" }),
    ];
    const results = evaluateLocationClarify(items);
    expect(results).toHaveLength(0);
  });

  test("前だけ場所あり + 短時間アイテム（30分以下）→ implicit_fill", () => {
    const items = [
      makeItem({ text: "仕事", location: makeLoc("スタバ") }),
      makeItem({ text: "コーヒー休憩", durationMin: 15 }),
    ];
    const results = evaluateLocationClarify(items);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("implicit_fill");
  });

  test("前だけ場所あり + 長時間アイテム → ask", () => {
    const items = [
      makeItem({ text: "仕事", location: makeLoc("渋谷のスタバ") }),
      makeItem({ text: "買い物", durationMin: 60 }),
    ];
    const results = evaluateLocationClarify(items);
    expect(results).toHaveLength(1);
    expect(results[0].action).toBe("ask");
  });

  test("travel アイテムはスキップされる", () => {
    const items = [
      makeItem({ text: "仕事", location: makeLoc("スタバ") }),
      makeItem({ text: "🚗 移動", kind: "travel" }),
      makeItem({ text: "買い物" }),
    ];
    const results = evaluateLocationClarify(items);
    // travel はスキップ、買い物が対象
    expect(results.every(r => r.itemId !== items[1].id)).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// applyImplicitLocationFill
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyImplicitLocationFill", () => {
  test("同エリアの場所が暗黙補完される", () => {
    const items = [
      makeItem({ text: "仕事", location: makeLoc("渋谷のスタバ") }),
      makeItem({ text: "買い物" }),
      makeItem({ text: "ミーティング", location: makeLoc("渋谷のカフェ") }),
    ];
    const { updatedItems, pendingClarify } = applyImplicitLocationFill(items);
    const shopping = updatedItems.find(i => i.text === "買い物");
    expect(shopping!.location).toBeDefined();
    expect(shopping!.location!.source).toBe("user_inferred");
    expect(pendingClarify).toHaveLength(0);
  });

  test("別エリアのアイテムは pendingClarify に残る", () => {
    const items = [
      makeItem({ text: "仕事", location: makeLoc("渋谷のスタバ", "shibuya_starbucks") }),
      makeItem({ text: "買い物" }),
      makeItem({ text: "ミーティング", location: makeLoc("新宿のオフィス", "shinjuku_office") }),
    ];
    const { updatedItems, pendingClarify } = applyImplicitLocationFill(items);
    const shopping = updatedItems.find(i => i.text === "買い物");
    expect(shopping!.location).toBeUndefined(); // 補完されない
    expect(pendingClarify).toHaveLength(1);
    expect(pendingClarify[0].action).toBe("ask");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildLocationClarifyQuestion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildLocationClarifyQuestion", () => {
  test("1件 → そのまま質問文を返す", () => {
    const q = buildLocationClarifyQuestion([
      { itemId: "x", action: "ask", askQuestion: "「買い物」はどこでする？" },
    ]);
    expect(q).toBe("「買い物」はどこでする？");
  });

  test("複数件 → まとめた質問文を返す", () => {
    const q = buildLocationClarifyQuestion([
      { itemId: "x", action: "ask", askQuestion: "「買い物」はどこでする？" },
      { itemId: "y", action: "ask", askQuestion: "「勉強」はどこでする？" },
    ]);
    expect(q).toContain("買い物");
    expect(q).toContain("勉強");
  });

  test("0件 → null", () => {
    const q = buildLocationClarifyQuestion([]);
    expect(q).toBeNull();
  });
});
