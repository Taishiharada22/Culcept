/**
 * Dress Code Floor + EndpointAnchor Adjustment テスト
 *
 * Step 4 の 2 パーツ:
 *   A. eventType → dressCode 推定（下限制約）
 *   B. endpointAnchor → Intent secondary modifier
 *
 * 設計原則:
 *   1. dressCode は加点ではなく下限制約 → くだけすぎを防ぐ guardrail
 *   2. endpointAnchor は主シーンの上書きではなく補正要因 → secondary modifier
 *   3. structured field only（text / 曖昧文言は使わない）
 */

import {
  planToEventContexts,
  inferDressCode,
  applyEndpointAdjustment,
  detectOutfitInvalidation,
} from "@/lib/alter-morning/outfitBridge";
import { computePrimaryEvent, computeIntent } from "@/app/(culcept)/calendar/_lib/vcIntent";
import type { MorningPlan, PlanItem, EndpointAnchor } from "@/lib/alter-morning/types";
import type { Intent } from "@/app/(culcept)/calendar/_lib/vcTypes";

function makePlan(
  items: Partial<PlanItem>[],
  options?: {
    dayConditions?: Partial<MorningPlan["dayConditions"]>;
    endpointAnchor?: EndpointAnchor;
  },
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
    dayConditions: { ...options?.dayConditions },
    createdAt: new Date().toISOString(),
    confirmed: false,
    endpointAnchor: options?.endpointAnchor,
  };
}

function makeBaseIntent(): Intent {
  return {
    formality: 0.50, attention: 0.50, minimalism: 0.50, romance: 0.50, trust: 0.50,
    mobility: 0.50, walkNeed: 0.50, bikeNeed: 0.50, stairsNeed: 0.50,
    comfort: 0.50, breathable: 0.50, wrinkleSafe: 0.50, tightAvoid: 0.50,
    warmthNeed: 0.50, rainNeed: 0.50, windNeed: 0.50, uvNeed: 0.50,
    dirtySafe: 0.50, splashSafe: 0.50, pocketNeed: 0.50,
    sceneTags: [], bannedTags: [], requiredTags: [],
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: inferDressCode
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("inferDressCode", () => {
  test("formal → 'formal'", () => {
    expect(inferDressCode("formal")).toBe("formal");
  });

  test("interview → 'business'", () => {
    expect(inferDressCode("interview")).toBe("business");
  });

  test("sports → 'sport'", () => {
    expect(inferDressCode("sports")).toBe("sport");
  });

  test("work → undefined（BASE Intent に任せる）", () => {
    expect(inferDressCode("work")).toBeUndefined();
  });

  test("friends → undefined", () => {
    expect(inferDressCode("friends")).toBeUndefined();
  });

  test("date → undefined", () => {
    expect(inferDressCode("date")).toBeUndefined();
  });

  test("home → undefined", () => {
    expect(inferDressCode("home")).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: dressCode が EventContext に設定される
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("planToEventContexts sets dressCode", () => {
  test("eventType=formal → dressCode='formal' が EventContext に設定される", () => {
    const plan = makePlan([{ text: "結婚式", eventType: "formal" }]);
    const events = planToEventContexts(plan);
    expect(events[0].dressCode).toBe("formal");
  });

  test("eventType=interview → dressCode='business'", () => {
    const plan = makePlan([{ text: "面接", eventType: "interview" }]);
    const events = planToEventContexts(plan);
    expect(events[0].dressCode).toBe("business");
  });

  test("eventType=sports → dressCode='sport'", () => {
    const plan = makePlan([{ text: "ジム", eventType: "sports" }]);
    const events = planToEventContexts(plan);
    expect(events[0].dressCode).toBe("sport");
  });

  test("eventType=friends → dressCode 未設定", () => {
    const plan = makePlan([{ text: "遊ぶ", eventType: "friends" }]);
    const events = planToEventContexts(plan);
    expect(events[0].dressCode).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part A: dressCode floor が mood を守る E2E
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DressCode floor protects against mood downgrade", () => {
  test("formal + mood「ラフ」→ formality が 0.90 floor を下回らない", () => {
    const plan = makePlan(
      [{ text: "結婚式", eventType: "formal" }],
      { dayConditions: { moodText: "ラフ" } },
    );
    const events = planToEventContexts(plan);
    const primary = computePrimaryEvent(events);
    // dressCode = "formal" が設定されている
    expect(primary!.dressCode).toBe("formal");
    // computeIntent: Mood(ラフ: formality -0.20) → DressCode(formal: Math.max(f, 0.90))
    const intent = computeIntent(primary!, undefined, plan.dayConditions.moodText);
    expect(intent.formality).toBeGreaterThanOrEqual(0.90);
  });

  test("interview + mood「カジュアル」→ formality が 0.70 floor を下回らない", () => {
    const plan = makePlan(
      [{ text: "面接", eventType: "interview" }],
      { dayConditions: { moodText: "カジュアル" } },
    );
    const events = planToEventContexts(plan);
    const primary = computePrimaryEvent(events);
    expect(primary!.dressCode).toBe("business");
    const intent = computeIntent(primary!, undefined, plan.dayConditions.moodText);
    expect(intent.formality).toBeGreaterThanOrEqual(0.70);
  });

  test("sports + mood「フォーマル」→ formality が 0.15 ceiling を超えない", () => {
    const plan = makePlan(
      [{ text: "ジム", eventType: "sports" }],
      { dayConditions: { moodText: "フォーマル" } },
    );
    const events = planToEventContexts(plan);
    const primary = computePrimaryEvent(events);
    expect(primary!.dressCode).toBe("sport");
    const intent = computeIntent(primary!, undefined, plan.dayConditions.moodText);
    // sport: Math.min(formality, 0.15)
    expect(intent.formality).toBeLessThanOrEqual(0.15);
    // sport: Math.max(mobility, 0.80)
    expect(intent.mobility).toBeGreaterThanOrEqual(0.80);
  });

  test("friends（dressCode なし）+ mood「ラフ」→ formality は自由に下がる", () => {
    const plan = makePlan(
      [{ text: "遊ぶ", eventType: "friends" }],
      { dayConditions: { moodText: "ラフ" } },
    );
    const events = planToEventContexts(plan);
    const primary = computePrimaryEvent(events);
    expect(primary!.dressCode).toBeUndefined();
    const intentWithMood = computeIntent(primary!, undefined, "ラフ");
    const intentBase = computeIntent(primary!);
    // dressCode floor がないので mood でくだけられる
    expect(intentWithMood.formality).toBeLessThan(intentBase.formality);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part B: applyEndpointAdjustment
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("applyEndpointAdjustment", () => {
  test("hotel → wrinkleSafe↑, pocketNeed↑, layered タグ追加", () => {
    const intent = makeBaseIntent();
    const endpoint: EndpointAnchor = { type: "hotel", label: "ホテル", needsAreaConfirm: false };
    applyEndpointAdjustment(intent, endpoint);
    expect(intent.wrinkleSafe).toBeGreaterThan(0.50);
    expect(intent.pocketNeed).toBeGreaterThan(0.50);
    expect(intent.sceneTags).toContain("layered");
  });

  test("office → trust↑, formality 下限 0.35", () => {
    const intent = makeBaseIntent();
    intent.formality = 0.20; // 低い formality 状態
    const endpoint: EndpointAnchor = { type: "office", label: "会社", needsAreaConfirm: false };
    applyEndpointAdjustment(intent, endpoint);
    expect(intent.trust).toBeGreaterThan(0.50);
    expect(intent.formality).toBeGreaterThanOrEqual(0.35);
  });

  test("partner_home → comfort↑", () => {
    const intent = makeBaseIntent();
    const endpoint: EndpointAnchor = { type: "partner_home", label: "彼女の家", needsAreaConfirm: false };
    applyEndpointAdjustment(intent, endpoint);
    expect(intent.comfort).toBeGreaterThan(0.50);
  });

  test("home → 補正なし", () => {
    const intent = makeBaseIntent();
    const snapshot = JSON.parse(JSON.stringify(intent));
    const endpoint: EndpointAnchor = { type: "home", label: "自宅", needsAreaConfirm: false };
    applyEndpointAdjustment(intent, endpoint);
    // 全軸変化なし
    expect(intent.wrinkleSafe).toBe(snapshot.wrinkleSafe);
    expect(intent.pocketNeed).toBe(snapshot.pocketNeed);
    expect(intent.trust).toBe(snapshot.trust);
    expect(intent.comfort).toBe(snapshot.comfort);
  });

  test("friend_home → 補正なし", () => {
    const intent = makeBaseIntent();
    const snapshot = JSON.parse(JSON.stringify(intent));
    const endpoint: EndpointAnchor = { type: "friend_home", label: "友達の家", needsAreaConfirm: false };
    applyEndpointAdjustment(intent, endpoint);
    expect(intent.wrinkleSafe).toBe(snapshot.wrinkleSafe);
  });

  test("endpoint 補正は軽い — 主要軸の大幅変更にならない", () => {
    const intent = makeBaseIntent();
    const endpoint: EndpointAnchor = { type: "hotel", label: "ホテル", needsAreaConfirm: false };
    applyEndpointAdjustment(intent, endpoint);
    // 最大 +0.10 の nudge → 0.60 以下
    expect(intent.wrinkleSafe).toBeLessThanOrEqual(0.65);
    expect(intent.pocketNeed).toBeLessThanOrEqual(0.65);
  });

  test("全軸が 0..1 に収まる", () => {
    const intent = makeBaseIntent();
    intent.wrinkleSafe = 0.95; // 上限近く
    const endpoint: EndpointAnchor = { type: "hotel", label: "ホテル", needsAreaConfirm: false };
    applyEndpointAdjustment(intent, endpoint);
    expect(intent.wrinkleSafe).toBeLessThanOrEqual(1.0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Part C: endpointAnchor 変更の invalidation 検知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("endpointAnchor change triggers invalidation", () => {
  test("endpoint: home → hotel → needsRefresh = true", () => {
    const prev = makePlan(
      [{ text: "仕事" }],
      { endpointAnchor: { type: "home", label: "自宅", needsAreaConfirm: false } },
    );
    const next = makePlan(
      [{ text: "仕事" }],
      { endpointAnchor: { type: "hotel", label: "ホテル", needsAreaConfirm: false } },
    );
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
    expect(result.reasons.some(r => r.detail.includes("終点"))).toBe(true);
  });

  test("endpoint: 同じ type → needsRefresh = false", () => {
    const prev = makePlan(
      [{ text: "仕事" }],
      { endpointAnchor: { type: "home", label: "自宅", needsAreaConfirm: false } },
    );
    const next = makePlan(
      [{ text: "仕事" }],
      { endpointAnchor: { type: "home", label: "自宅", needsAreaConfirm: false } },
    );
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(false);
  });

  test("endpoint: なし → office → needsRefresh = true", () => {
    const prev = makePlan([{ text: "仕事" }]);
    const next = makePlan(
      [{ text: "仕事" }],
      { endpointAnchor: { type: "office", label: "会社", needsAreaConfirm: false } },
    );
    const result = detectOutfitInvalidation(prev, next);
    expect(result.needsRefresh).toBe(true);
  });
});
