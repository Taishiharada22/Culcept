/**
 * Outfit Invalidation テスト — プラン変更 → コーデ再提案判定
 *
 * 設計原則:
 * 1. 「即再生成」ではなく「再提案フラグ」
 * 2. text ではなく structured diff
 * 3. reason 付きで UI 説明可能
 */

import {
  detectOutfitInvalidation,
  refreshReasonLabel,
  type OutfitInvalidation,
} from "@/lib/alter-morning/outfitBridge";
import type { MorningPlan, PlanItem } from "@/lib/alter-morning/types";

function makePlan(
  items: Partial<PlanItem>[],
  dayConditions?: Partial<MorningPlan["dayConditions"]>,
): MorningPlan {
  return {
    date: "2026-04-14",
    items: items.map((it, i) => ({
      id: it.id ?? `item_${i}`,
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
    dayConditions: { ...dayConditions },
    createdAt: new Date().toISOString(),
    confirmed: false,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 変化なし → needsRefresh = false
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("No change → no refresh", () => {
  test("同一プラン → needsRefresh = false", () => {
    const plan = makePlan([{ text: "仕事", eventType: "work" }]);
    const result = detectOutfitInvalidation(plan, plan);
    expect(result.needsRefresh).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });

  test("text だけ変更 → needsRefresh = false（構造変更なし）", () => {
    const prev = makePlan([{ id: "a", text: "カフェで作業", eventType: "work" }]);
    const next = makePlan([{ id: "a", text: "カフェでお仕事", eventType: "work" }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(false);
  });

  test("durationMin だけ変更 → needsRefresh = false", () => {
    const prev = makePlan([{ id: "a", text: "作業", durationMin: 60 }]);
    const next = makePlan([{ id: "a", text: "作業", durationMin: 90 }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(false);
  });

  test("travel アイテムの変更は無視される", () => {
    const prev = makePlan([
      { id: "a", text: "仕事" },
      { id: "t1", text: "移動", kind: "travel" },
    ]);
    const next = makePlan([
      { id: "a", text: "仕事" },
      // travel が削除されても invalidation にならない
    ]);
    // travel が削除されたが、non-travel は同じ
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DayConditions 変更
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DayConditions changes", () => {
  test("withWhom 変更 → companion reason", () => {
    const prev = makePlan([{ text: "遊ぶ" }], { withWhom: "friends" });
    const next = makePlan([{ text: "遊ぶ" }], { withWhom: "partner" });
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].field).toBe("companion");
    expect(result.reasons[0].detail).toContain("friends");
    expect(result.reasons[0].detail).toContain("partner");
  });

  test("mainTransport 変更 → transport reason", () => {
    const prev = makePlan([{ text: "外出" }], { mainTransport: "train" });
    const next = makePlan([{ text: "外出" }], { mainTransport: "bicycle" });
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons[0].field).toBe("transport");
  });

  test("venue 変更 → venue reason", () => {
    const prev = makePlan([{ text: "仕事" }], { venue: "indoor" });
    const next = makePlan([{ text: "仕事" }], { venue: "outdoor" });
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons[0].field).toBe("venue");
  });

  test("moodText 変更 → mood reason", () => {
    const prev = makePlan([{ text: "外出" }], { moodText: "カジュアル" });
    const next = makePlan([{ text: "外出" }], { moodText: "きれいめ" });
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons[0].field).toBe("mood");
    expect(result.reasons[0].detail).toContain("カジュアル");
    expect(result.reasons[0].detail).toContain("きれいめ");
  });

  test("estimatedWalkLevel 変更 → walk_level reason", () => {
    const prev = makePlan([{ text: "外出" }], { estimatedWalkLevel: "low" });
    const next = makePlan([{ text: "外出" }], { estimatedWalkLevel: "high" });
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons[0].field).toBe("walk_level");
  });

  test("複数の DayConditions 変更 → 複数 reasons", () => {
    const prev = makePlan([{ text: "外出" }], { withWhom: "friends", moodText: "カジュアル" });
    const next = makePlan([{ text: "外出" }], { withWhom: "partner", moodText: "きれいめ" });
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons).toHaveLength(2);
    const fields = result.reasons.map(r => r.field);
    expect(fields).toContain("companion");
    expect(fields).toContain("mood");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanItem 追加・削除
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PlanItem additions and removals", () => {
  test("アイテム追加 → items_added reason", () => {
    const prev = makePlan([{ id: "a", text: "仕事" }]);
    const next = makePlan([{ id: "a", text: "仕事" }, { id: "b", text: "デート", what: "デート" }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons.some(r => r.field === "items_added")).toBe(true);
    expect(result.reasons.find(r => r.field === "items_added")!.detail).toContain("デート");
  });

  test("アイテム削除 → items_removed reason", () => {
    const prev = makePlan([
      { id: "a", text: "仕事" },
      { id: "b", text: "ランチ", what: "ランチ" },
    ]);
    const next = makePlan([{ id: "a", text: "仕事" }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons.some(r => r.field === "items_removed")).toBe(true);
    expect(result.reasons.find(r => r.field === "items_removed")!.detail).toContain("ランチ");
  });

  test("追加と削除が同時 → 両方の reason", () => {
    const prev = makePlan([{ id: "a", text: "仕事", what: "仕事" }]);
    const next = makePlan([{ id: "b", text: "デート", what: "デート" }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    const fields = result.reasons.map(r => r.field);
    expect(fields).toContain("items_added");
    expect(fields).toContain("items_removed");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PlanItem 構造変更（eventType / withWhom / time）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PlanItem structural changes", () => {
  test("eventType 変更 → event_type reason", () => {
    const prev = makePlan([{ id: "a", text: "田中さんと", what: "食事", eventType: "friends" }]);
    const next = makePlan([{ id: "a", text: "田中さんと", what: "食事", eventType: "date" }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons[0].field).toBe("event_type");
    expect(result.reasons[0].detail).toContain("friends");
    expect(result.reasons[0].detail).toContain("date");
  });

  test("アイテム withWhom 変更 → companion reason", () => {
    const prev = makePlan([{ id: "a", text: "ランチ", withWhom: "友達" }]);
    const next = makePlan([{ id: "a", text: "ランチ", withWhom: "彼女" }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons[0].field).toBe("companion");
  });

  test("時間帯シフト（morning → evening）→ time_shift reason", () => {
    const prev = makePlan([{ id: "a", text: "食事", startTime: "08:00" }]);
    const next = makePlan([{ id: "a", text: "食事", startTime: "19:00" }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons[0].field).toBe("time_shift");
    expect(result.reasons[0].detail).toContain("morning");
    expect(result.reasons[0].detail).toContain("evening");
  });

  test("同一時間帯内の変更（12:00 → 14:00）→ needsRefresh = false", () => {
    const prev = makePlan([{ id: "a", text: "食事", startTime: "12:00" }]);
    const next = makePlan([{ id: "a", text: "食事", startTime: "14:00" }]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(false);
  });

  test("startTime 未設定 → 時間帯比較スキップ", () => {
    const prev = makePlan([{ id: "a", text: "食事" }]);
    const next = makePlan([{ id: "a", text: "食事", startTime: "19:00" }]);
    const result = detectOutfitInvalidation(prev, next);
    // 片方に startTime が無い → 時間帯比較しない
    expect(result.reasons.some(r => r.field === "time_shift")).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 複合シナリオ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Complex scenarios", () => {
  test("プラン全面変更 → 複数 reasons", () => {
    const prev = makePlan(
      [
        { id: "a", text: "仕事", eventType: "work", startTime: "09:00" },
        { id: "b", text: "ランチ", what: "ランチ", withWhom: "同僚" },
      ],
      { mainTransport: "train", moodText: "かっちり", withWhom: "work" },
    );
    const next = makePlan(
      [
        { id: "a", text: "仕事", eventType: "work", startTime: "09:00" },
        { id: "c", text: "デート", what: "デート", withWhom: "彼女", eventType: "date" },
      ],
      { mainTransport: "car", moodText: "おしゃれ", withWhom: "partner" },
    );
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    // DayConditions: companion + transport + mood = 3
    // Items: ランチ removed + デート added = 2
    expect(result.reasons.length).toBeGreaterThanOrEqual(5);
  });

  test("「ランチをやめて」→ items_removed reason", () => {
    const prev = makePlan([
      { id: "a", text: "渋谷に寄る" },
      { id: "b", text: "田中さんとランチ", what: "ランチ" },
      { id: "c", text: "カフェで作業" },
    ]);
    const next = makePlan([
      { id: "a", text: "渋谷に寄る" },
      { id: "c", text: "カフェで作業" },
    ]);
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons[0].field).toBe("items_removed");
    expect(result.reasons[0].detail).toContain("ランチ");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// refreshReasonLabel
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("refreshReasonLabel", () => {
  test("全 field に日本語ラベルがある", () => {
    const fields: Array<OutfitInvalidation["reasons"][0]["field"]> = [
      "companion", "event_type", "transport", "venue",
      "mood", "walk_level", "items_added", "items_removed", "time_shift",
    ];
    for (const field of fields) {
      const label = refreshReasonLabel({ field, detail: "" });
      expect(label).toBeDefined();
      expect(label.length).toBeGreaterThan(0);
    }
  });
});
