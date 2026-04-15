/**
 * planEditor テスト — プラン編集操作の検証
 */

import { applyPlanEdit, addDifferentialItems } from "@/lib/alter-morning/planEditor";
import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";
import { preloadVocabulary, parseIntent } from "@/lib/alter-morning/intentParser";

beforeAll(async () => {
  await preloadVocabulary();
});

function makePlan(items: Partial<PlanItem>[]): MorningPlan {
  return {
    date: "2026-04-14",
    items: items.map((it, i) => ({
      id: `test_${i}`,
      kind: "todo" as const,
      text: "",
      what: it.text ?? "",
      durationMin: 60,
      fixedStart: false,
      orderHint: i,
      sourceTurnIndex: 0,
      completed: false,
      ...it,
    })),
    dayConditions: {},
    createdAt: new Date().toISOString(),
    confirmed: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 削除
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Remove operations", () => {
  test("「ランチをやめて」→ ランチが削除される", () => {
    const plan = makePlan([
      { text: "渋谷に寄る" },
      { text: "田中さんとランチ", withWhom: "田中さん" },
      { text: "カフェで作業" },
    ]);
    const result = applyPlanEdit("ランチをやめて", plan);
    expect(result.applied).toBe(true);
    expect(result.items.find(i => i.text.includes("ランチ"))).toBeUndefined();
    expect(result.items).toHaveLength(2);
  });

  test("「田中さんとの食事を削除して」→ fuzzy match で削除", () => {
    const plan = makePlan([
      { text: "田中さんとランチ", withWhom: "田中さん" },
      { text: "カフェで作業" },
    ]);
    const result = applyPlanEdit("田中さんとの食事を削除して", plan);
    expect(result.applied).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].text).toBe("カフェで作業");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 開始時間変更
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Start time changes", () => {
  test("「ランチを12時からにして」→ startTime 変更", () => {
    const plan = makePlan([
      { text: "田中さんとランチ", startTime: "11:30" },
    ]);
    const result = applyPlanEdit("ランチを12時からにして", plan);
    expect(result.applied).toBe(true);
    expect(result.items[0].startTime).toBe("12:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 所要時間変更
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Duration changes", () => {
  test("「作業を2時間にして」→ 120分に変更", () => {
    const plan = makePlan([
      { text: "カフェで作業", durationMin: 60 },
    ]);
    const result = applyPlanEdit("作業を2時間にして", plan);
    expect(result.applied).toBe(true);
    expect(result.items[0].durationMin).toBe(120);
  });

  test("「ランチを90分にして」→ 90分に変更", () => {
    const plan = makePlan([
      { text: "田中さんとランチ", durationMin: 60, withWhom: "田中さん" },
    ]);
    const result = applyPlanEdit("ランチを90分にして", plan);
    expect(result.applied).toBe(true);
    expect(result.items[0].durationMin).toBe(90);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// アンカー付き追加
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Add with anchor", () => {
  test("「ランチが終わったら、スタバでミーティング」→ ランチの後に追加", () => {
    const plan = makePlan([
      { text: "渋谷に寄る" },
      { text: "田中さんとランチ", withWhom: "田中さん" },
      { text: "カフェで作業" },
    ]);
    const result = applyPlanEdit("ランチが終わったら、スタバでミーティング", plan);
    expect(result.applied).toBe(true);
    // ランチの後に追加されている
    const lunchIdx = result.items.findIndex(i => i.text.includes("ランチ"));
    const newIdx = result.items.findIndex(i => i.text.includes("ミーティング"));
    expect(newIdx).toBeGreaterThan(lunchIdx);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// アンカーなしの追加
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Add without anchor", () => {
  test("「買い物も追加して」→ 末尾に追加", () => {
    const plan = makePlan([
      { text: "カフェで作業" },
    ]);
    const result = applyPlanEdit("買い物も追加して", plan);
    expect(result.applied).toBe(true);
    expect(result.items.length).toBeGreaterThan(1);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 差分追加（addDifferentialItems）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Differential add (2nd input)", () => {
  test("「田中さんとの食事が終わったら買い物する」→ 食事の後に買い物が追加される", () => {
    const plan = makePlan([
      { text: "仕事", what: "仕事" },
      { text: "田中さんとランチ", what: "ランチ", withWhom: "田中さん" },
      { text: "カフェで作業", what: "作業" },
    ]);
    const result = addDifferentialItems(
      "田中さんとの食事が終わったら買い物する",
      plan,
      1
    );
    expect(result.applied).toBe(true);
    expect(result.addedCount).toBeGreaterThanOrEqual(1);
    // ランチの後に挿入されている
    const lunchIdx = result.items.findIndex(i => i.text.includes("ランチ"));
    const shoppingIdx = result.items.findIndex(i =>
      i.text.includes("買い物") || i.what?.includes("買い物")
    );
    expect(shoppingIdx).toBeGreaterThan(lunchIdx);
    // 既存アイテムは不変
    expect(result.items.filter(i => i.id.startsWith("test_"))).toHaveLength(3);
  });

  test("既存アイテムのテキスト・ID・duration は一切変更されない", () => {
    const plan = makePlan([
      { text: "仕事", what: "仕事", durationMin: 120 },
      { text: "田中さんとランチ", what: "ランチ", durationMin: 60 },
    ]);
    const originalItems = plan.items.map(i => ({ ...i }));
    const result = addDifferentialItems("買い物する", plan, 1);

    for (const orig of originalItems) {
      const found = result.items.find(i => i.id === orig.id);
      expect(found).toBeDefined();
      expect(found!.text).toBe(orig.text);
      expect(found!.durationMin).toBe(orig.durationMin);
    }
  });

  test("アンカーなし → 末尾に追加", () => {
    const plan = makePlan([
      { text: "仕事", what: "仕事" },
    ]);
    const result = addDifferentialItems("買い物する", plan, 1);
    expect(result.applied).toBe(true);
    expect(result.items[result.items.length - 1].text).toContain("買い物");
  });

  test("重複アイテムは追加されない", () => {
    const plan = makePlan([
      { text: "仕事", what: "仕事" },
      { text: "買い物", what: "買い物" },
    ]);
    const result = addDifferentialItems("買い物する", plan, 1);
    expect(result.applied).toBe(false);
    expect(result.addedCount).toBe(0);
  });

  test("sourceTurnIndex が設定される", () => {
    const plan = makePlan([
      { text: "仕事", what: "仕事" },
    ]);
    const result = addDifferentialItems("買い物する", plan, 2);
    if (result.applied) {
      const newItem = result.items.find(i => !i.id.startsWith("test_"));
      expect(newItem).toBeDefined();
      expect(newItem!.sourceTurnIndex).toBe(2);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// targetDate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("targetDate extraction (via intentParser)", () => {

  test("「明日の予定」→ targetDate = tomorrow", () => {
    const intent = parseIntent("明日はカフェで勉強する");
    expect(intent.targetDate).toBeDefined();
    // targetDate should be tomorrow's date
    const tomorrow = new Date();
    tomorrow.setHours(tomorrow.getHours() + 9); // JST
    tomorrow.setDate(tomorrow.getDate() + 1);
    const expected = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
    expect(intent.targetDate).toBe(expected);
  });

  test("「今日の予定」→ targetDate = undefined (today)", () => {
    const intent = parseIntent("今日はカフェで勉強する");
    expect(intent.targetDate).toBeUndefined();
  });

  test("時間語なし → targetDate = undefined", () => {
    const intent = parseIntent("カフェで勉強する");
    expect(intent.targetDate).toBeUndefined();
  });

  test("「明日」がタスク名に含まれない", () => {
    const intent = parseIntent("明日はカフェで勉強する");
    // primaryTasks にも fixedEvents にも「明日」が入っていないこと
    for (const t of intent.primaryTasks) {
      expect(t.text).not.toMatch(/^明日/);
    }
  });
});
