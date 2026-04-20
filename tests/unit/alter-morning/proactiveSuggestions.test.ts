import { describe, it, expect, beforeEach, vi } from "vitest";
import { generateProactiveSuggestion } from "@/lib/alter-morning/proactiveSuggestions";
import type { MorningPlan, PlanItem, PersonalityContext } from "@/lib/alter-morning/types";

// localStorage mock
const store: Record<string, string> = {};
vi.stubGlobal("localStorage", {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val; },
  removeItem: (key: string) => { delete store[key]; },
});

function makePlan(items: Partial<PlanItem>[]): MorningPlan {
  return {
    date: "2026-04-16",
    items: items.map((item, i) => ({
      id: `item_${i}`,
      kind: "todo" as const,
      text: item.text ?? `タスク${i}`,
      what: item.what ?? null,
      durationMin: item.durationMin ?? 60,
      fixedStart: false,
      orderHint: i,
      sourceTurnIndex: 0,
      completed: false,
      ...item,
    })),
    dayConditions: {},
    createdAt: new Date().toISOString(),
    confirmed: false,
  };
}

describe("generateProactiveSuggestion", () => {
  beforeEach(() => {
    // throttle をリセット
    for (const key of Object.keys(store)) delete store[key];
  });

  it("personalityContext なし → null", () => {
    const plan = makePlan([{ text: "仕事" }]);
    expect(generateProactiveSuggestion(plan, undefined)).toBeNull();
  });

  it("全軸 0（未観測） → null", () => {
    const plan = makePlan([{ text: "仕事" }, { text: "ミーティング" }]);
    const ctx: PersonalityContext = {
      introvert_vs_extrovert: 0,
      plan_vs_spontaneous: 0,
    };
    expect(generateProactiveSuggestion(plan, ctx)).toBeNull();
  });

  it("内向型 + ミーティング2件 → introvert_buffer 提案", () => {
    const plan = makePlan([
      { text: "ミーティング", withWhom: "田中さん" },
      { text: "打ち合わせ", withWhom: "佐藤さん" },
      { text: "資料作成" },
    ]);
    const ctx: PersonalityContext = {
      introvert_vs_extrovert: -0.6,
    };
    const result = generateProactiveSuggestion(plan, ctx);
    expect(result).toBeTruthy();
    expect(result).toContain("一人の時間");
  });

  it("外向型 + ソロ作業のみ → extrovert_social 提案", () => {
    const plan = makePlan([
      { text: "仕事" },
      { text: "資料作成" },
      { text: "勉強" },
    ]);
    const ctx: PersonalityContext = {
      introvert_vs_extrovert: 0.7,
    };
    const result = generateProactiveSuggestion(plan, ctx);
    expect(result).toBeTruthy();
    expect(result).toContain("誰か");
  });

  it("完璧主義 + タスク6件以上 → perfectionist_pace 提案", () => {
    const plan = makePlan([
      { text: "仕事" },
      { text: "ミーティング" },
      { text: "資料作成" },
      { text: "メール返信" },
      { text: "勉強" },
      { text: "買い物" },
    ]);
    const ctx: PersonalityContext = {
      perfectionist_vs_pragmatic: -0.5,
    };
    const result = generateProactiveSuggestion(plan, ctx);
    expect(result).toBeTruthy();
    expect(result).toContain("この3つ");
  });

  it("即興型 + ぎっちりスケジュール → spontaneous_flex 提案", () => {
    const plan = makePlan([
      { text: "仕事", durationMin: 120 },
      { text: "ミーティング", durationMin: 90 },
      { text: "資料作成", durationMin: 90 },
      { text: "勉強", durationMin: 90 },
    ]);
    const ctx: PersonalityContext = {
      plan_vs_spontaneous: 0.6,
    };
    const result = generateProactiveSuggestion(plan, ctx);
    expect(result).toBeTruthy();
    expect(result).toContain("余白");
  });

  it("朝型 + 午前に重いタスクなし → morning_energy 提案", () => {
    const plan = makePlan([
      { text: "散歩", startTime: "09:00", durationMin: 30 },
      { text: "仕事", startTime: "13:00", durationMin: 120 },
      { text: "ミーティング", startTime: "16:00", durationMin: 60 },
    ]);
    const ctx: PersonalityContext = {
      energy_rhythm: -0.5,
    };
    const result = generateProactiveSuggestion(plan, ctx);
    expect(result).toBeTruthy();
    expect(result).toContain("午前中");
  });

  it("夜型 + 朝に重いタスクあり → evening_energy 提案", () => {
    const plan = makePlan([
      { text: "仕事", startTime: "09:00", durationMin: 120 },
      { text: "ミーティング", startTime: "14:00", durationMin: 60 },
    ]);
    const ctx: PersonalityContext = {
      energy_rhythm: 0.5,
    };
    const result = generateProactiveSuggestion(plan, ctx);
    expect(result).toBeTruthy();
    expect(result).toContain("午後");
  });

  it("軸スコアが閾値未満 → 提案なし", () => {
    const plan = makePlan([
      { text: "ミーティング", withWhom: "田中さん" },
      { text: "打ち合わせ", withWhom: "佐藤さん" },
    ]);
    const ctx: PersonalityContext = {
      introvert_vs_extrovert: -0.2, // 閾値 0.3 未満
    };
    expect(generateProactiveSuggestion(plan, ctx)).toBeNull();
  });

  it("throttle: 同タイプは3日間クールダウン", () => {
    const plan = makePlan([
      { text: "ミーティング", withWhom: "田中さん" },
      { text: "打ち合わせ", withWhom: "佐藤さん" },
      { text: "資料作成" },
    ]);
    const ctx: PersonalityContext = {
      introvert_vs_extrovert: -0.6,
    };

    // 1回目: 提案される
    const first = generateProactiveSuggestion(plan, ctx);
    expect(first).toBeTruthy();

    // 2回目: クールダウンで null
    const second = generateProactiveSuggestion(plan, ctx);
    expect(second).toBeNull();
  });

  it("優先度の高い提案が選ばれる", () => {
    const plan = makePlan([
      { text: "ミーティング", withWhom: "田中さん" },
      { text: "打ち合わせ", withWhom: "佐藤さん" },
      { text: "資料作成" },
      { text: "仕事" },
      { text: "勉強" },
      { text: "買い物" },
    ]);
    // introvert_buffer(85) > perfectionist_pace(80) なので introvert_buffer が選ばれる
    const ctx: PersonalityContext = {
      introvert_vs_extrovert: -0.6,
      perfectionist_vs_pragmatic: -0.5,
    };
    const result = generateProactiveSuggestion(plan, ctx);
    expect(result).toContain("一人の時間"); // introvert_buffer が優先
  });
});
