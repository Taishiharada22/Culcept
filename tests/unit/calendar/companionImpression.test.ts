/**
 * Companion → Impression 接続テスト
 *
 * withWhom カテゴリ → EventContext.attentionLevel / romanceLevel / trustNeed の変換を検証。
 *
 * 設計原則:
 * - eventType (BASE Intent) が主軸
 * - withWhom カテゴリが補助 nudge
 * - 未分類の名前（「田中さん」）→ nudge なし
 * - アイテム単位の withWhom が日単位より優先
 */

import {
  planToEventContexts,
  categorizeCompanion,
} from "@/lib/alter-morning/outfitBridge";
import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";

function makePlan(
  items: Partial<PlanItem>[],
  dayConditions?: Partial<MorningPlan["dayConditions"]>,
): MorningPlan {
  return {
    date: "2026-04-14",
    items: items.map((it, i) => ({
      id: `test_${i}`,
      kind: "todo" as const,
      text: it.text ?? "",
      what: it.what ?? it.text ?? "",
      durationMin: it.durationMin ?? 60,
      fixedStart: false,
      orderHint: i,
      sourceTurnIndex: 0,
      completed: false,
      ...it,
    })),
    dayConditions: {
      ...dayConditions,
    },
    createdAt: new Date().toISOString(),
    confirmed: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// categorizeCompanion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categorizeCompanion", () => {
  test("既知カテゴリ値はそのまま返す", () => {
    expect(categorizeCompanion("partner")).toBe("partner");
    expect(categorizeCompanion("work")).toBe("work");
    expect(categorizeCompanion("friends")).toBe("friends");
    expect(categorizeCompanion("family")).toBe("family");
    expect(categorizeCompanion("solo")).toBe("solo");
  });

  test("パートナー系テキスト → partner", () => {
    expect(categorizeCompanion("彼女")).toBe("partner");
    expect(categorizeCompanion("彼氏")).toBe("partner");
    expect(categorizeCompanion("恋人")).toBe("partner");
    expect(categorizeCompanion("パートナー")).toBe("partner");
  });

  test("仕事系テキスト → work", () => {
    expect(categorizeCompanion("上司")).toBe("work");
    expect(categorizeCompanion("同僚")).toBe("work");
    expect(categorizeCompanion("クライアント")).toBe("work");
    expect(categorizeCompanion("取引先")).toBe("work");
    expect(categorizeCompanion("先輩")).toBe("work");
    expect(categorizeCompanion("後輩")).toBe("work");
  });

  test("家族系テキスト → family", () => {
    expect(categorizeCompanion("家族")).toBe("family");
    expect(categorizeCompanion("親")).toBe("family");
    expect(categorizeCompanion("母")).toBe("family");
    expect(categorizeCompanion("子供")).toBe("family");
  });

  test("友達系テキスト → friends", () => {
    expect(categorizeCompanion("友達")).toBe("friends");
    expect(categorizeCompanion("友人")).toBe("friends");
    expect(categorizeCompanion("仲間")).toBe("friends");
  });

  test("ソロ系テキスト → solo", () => {
    expect(categorizeCompanion("一人")).toBe("solo");
    expect(categorizeCompanion("ひとり")).toBe("solo");
  });

  test("固有名（田中さん等）→ null（未分類）", () => {
    expect(categorizeCompanion("田中さん")).toBeNull();
    expect(categorizeCompanion("山田くん")).toBeNull();
    expect(categorizeCompanion("佐藤ちゃん")).toBeNull();
    expect(categorizeCompanion("Mike")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 日単位の withWhom → impression
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Day-level withWhom → EventContext impression", () => {
  test("DayConditions.withWhom = 'partner' → 全イベントに romance 設定", () => {
    const plan = makePlan(
      [{ text: "カフェで作業" }, { text: "ランチ" }],
      { withWhom: "partner" },
    );
    const events = planToEventContexts(plan);
    for (const ev of events) {
      expect(ev.romanceLevel).toBe(0.7);
      expect(ev.attentionLevel).toBe(0.6);
      expect(ev.trustNeed).toBe(0.1);
    }
  });

  test("DayConditions.withWhom = 'work' → 全イベントに trust 設定", () => {
    const plan = makePlan(
      [{ text: "ミーティング" }],
      { withWhom: "work" },
    );
    const events = planToEventContexts(plan);
    expect(events[0].trustNeed).toBe(0.6);
    expect(events[0].romanceLevel).toBe(0.0);
  });

  test("DayConditions.withWhom なし → impression 未設定", () => {
    const plan = makePlan([{ text: "カフェで作業" }]);
    const events = planToEventContexts(plan);
    expect(events[0].attentionLevel).toBeUndefined();
    expect(events[0].romanceLevel).toBeUndefined();
    expect(events[0].trustNeed).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// アイテム単位の withWhom → impression
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Item-level withWhom → EventContext impression", () => {
  test("PlanItem.withWhom = '彼女' → そのイベントだけ romance", () => {
    const plan = makePlan([
      { text: "仕事" },
      { text: "彼女とランチ", withWhom: "彼女" },
      { text: "買い物" },
    ]);
    const events = planToEventContexts(plan);
    // 仕事・買い物は印象なし
    expect(events[0].romanceLevel).toBeUndefined();
    expect(events[2].romanceLevel).toBeUndefined();
    // ランチだけ romance
    expect(events[1].romanceLevel).toBe(0.7);
    expect(events[1].attentionLevel).toBe(0.6);
  });

  test("PlanItem.withWhom = '上司' → そのイベントだけ trust", () => {
    const plan = makePlan([
      { text: "上司とランチ", withWhom: "上司" },
    ]);
    const events = planToEventContexts(plan);
    expect(events[0].trustNeed).toBe(0.6);
    expect(events[0].romanceLevel).toBe(0.0);
  });

  test("PlanItem.withWhom = '田中さん'（未分類）→ impression 未設定", () => {
    const plan = makePlan([
      { text: "田中さんと食事", withWhom: "田中さん" },
    ]);
    const events = planToEventContexts(plan);
    // 未分類 → 日単位のデフォルトも無い → 全て undefined
    expect(events[0].attentionLevel).toBeUndefined();
    expect(events[0].romanceLevel).toBeUndefined();
    expect(events[0].trustNeed).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// アイテム単位が日単位を上書き
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Item-level withWhom overrides day-level", () => {
  test("日=friends, アイテム=partner → アイテム単位が勝つ", () => {
    const plan = makePlan(
      [
        { text: "友達と遊ぶ" },
        { text: "彼女とディナー", withWhom: "彼女" },
      ],
      { withWhom: "friends" },
    );
    const events = planToEventContexts(plan);
    // 1件目: 日単位の friends
    expect(events[0].attentionLevel).toBe(0.3);
    expect(events[0].romanceLevel).toBe(0.0);
    // 2件目: アイテム単位の partner が上書き
    expect(events[1].romanceLevel).toBe(0.7);
    expect(events[1].attentionLevel).toBe(0.6);
  });

  test("日=work, アイテム=田中さん（未分類）→ 日単位が適用される", () => {
    const plan = makePlan(
      [{ text: "田中さんと面談", withWhom: "田中さん" }],
      { withWhom: "work" },
    );
    const events = planToEventContexts(plan);
    // 田中さんは未分類 → itemImpression は undefined → overlay（日単位の work）が残る
    expect(events[0].trustNeed).toBe(0.6);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E2E: withWhom → applySocial → Intent 反映
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("E2E: withWhom flows through to Intent via applySocial", () => {
  // computeIntent は applySocial で attentionLevel * 0.3, romanceLevel * 0.4, trustNeed * 0.3 を加算する
  test("partner → romance が BASE + nudge になる", async () => {
    // dynamic import to avoid circular dep issues
    const { computePrimaryEvent, computeIntent } = await import(
      "@/app/(culcept)/calendar/_lib/vcIntent"
    );
    const plan = makePlan(
      [{ text: "彼女とデート", withWhom: "彼女", eventType: "date" }],
      { withWhom: "partner" },
    );
    const events = planToEventContexts(plan);
    const primary = computePrimaryEvent(events);
    expect(primary).not.toBeNull();

    // romance with companion: BASE date(0.70) + applySocial(0.7 * 0.4 = 0.28) → 0.98
    const intent = computeIntent(primary!);
    expect(intent.romance).toBeGreaterThan(0.90);
  });

  test("friends → romance は低いまま", async () => {
    const { computePrimaryEvent, computeIntent } = await import(
      "@/app/(culcept)/calendar/_lib/vcIntent"
    );
    const plan = makePlan(
      [{ text: "友達と遊ぶ", withWhom: "友達", eventType: "friends" }],
    );
    const events = planToEventContexts(plan);
    const primary = computePrimaryEvent(events);
    const intent = computeIntent(primary!);
    // friends BASE romance = 0.00, no romance nudge → 0.00
    expect(intent.romance).toBeLessThanOrEqual(0.05);
  });

  test("withWhom なし → applySocial の impression nudge なし", async () => {
    const { computePrimaryEvent, computeIntent } = await import(
      "@/app/(culcept)/calendar/_lib/vcIntent"
    );
    const planWith = makePlan(
      [{ text: "ランチ", eventType: "friends" }],
      { withWhom: "partner" },
    );
    const planWithout = makePlan(
      [{ text: "ランチ", eventType: "friends" }],
    );

    const evWith = planToEventContexts(planWith);
    const evWithout = planToEventContexts(planWithout);

    const intentWith = computeIntent(computePrimaryEvent(evWith)!);
    const intentWithout = computeIntent(computePrimaryEvent(evWithout)!);

    // partner nudge → romance が上がる
    expect(intentWith.romance).toBeGreaterThan(intentWithout.romance);
  });
});
