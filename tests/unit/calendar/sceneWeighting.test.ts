/**
 * Scene Weighting テスト — 複合プランの主シーン重み付け
 *
 * Step 5: dominant scene + secondary modifiers
 *
 * 設計原則:
 *   1. pure average をしない → dominant が主張を決める
 *   2. secondary は ±0.15 cap の軽い補正 → dominant を壊さない
 *   3. secondary は異なる eventType のみ（同じ type は重複情報）
 *   4. structured field only（text / 曖昧文言は使わない）
 *
 * GPT指定テスト4系統:
 *   A. 午前 work + 昼 formal lunch + 夜 casual
 *   B. 長時間 office + 短時間 date
 *   C. sports + work の混在
 *   D. 旅行日で hotel endpoint あり
 */

import {
  planToEventContexts,
  computeSceneScore,
  computeSceneWeighting,
  blendWithSecondaries,
  applyEndpointAdjustment,
} from "@/lib/alter-morning/outfitBridge";
import { computeIntent } from "@/app/(culcept)/calendar/_lib/vcIntent";
import type { MorningPlan, PlanItem, EndpointAnchor } from "@/lib/alter-morning/types";
import type { EventContext, Intent } from "@/app/(culcept)/calendar/_lib/vcTypes";
import { NUMERIC_INTENT_KEYS } from "@/app/(culcept)/calendar/_lib/vcTypes";

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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeSceneScore — 個別イベントのスコアリング
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeSceneScore", () => {
  test("interview > work > friends > home（eventType 重要度順）", () => {
    const base = {
      id: "x", title: "t", startAt: "2026-04-14T09:00:00",
      endAt: "2026-04-14T10:00:00", priority: 1 as const,
    };
    const interview = computeSceneScore({ ...base, type: "interview" });
    const work = computeSceneScore({ ...base, type: "work" });
    const friends = computeSceneScore({ ...base, type: "friends" });
    const home = computeSceneScore({ ...base, type: "home" });

    expect(interview).toBeGreaterThan(work);
    expect(work).toBeGreaterThan(friends);
    expect(friends).toBeGreaterThan(home);
  });

  test("長い duration → 高いスコア", () => {
    const short: EventContext = {
      id: "a", title: "短い", type: "work",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T10:00:00",
      priority: 1,
    };
    const long: EventContext = {
      id: "b", title: "長い", type: "work",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T17:00:00",
      priority: 1,
    };
    expect(computeSceneScore(long)).toBeGreaterThan(computeSceneScore(short));
  });

  test("dressCode=formal → スコア加算", () => {
    const base: EventContext = {
      id: "x", title: "t", type: "work",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T10:00:00",
      priority: 1,
    };
    const withDC: EventContext = { ...base, dressCode: "formal" };
    expect(computeSceneScore(withDC)).toBeGreaterThan(computeSceneScore(base));
  });

  test("social exposure（romanceLevel > 0.3）→ スコア加算", () => {
    const base: EventContext = {
      id: "x", title: "t", type: "date",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T10:00:00",
      priority: 1,
    };
    const withRomance: EventContext = { ...base, romanceLevel: 0.7, attentionLevel: 0.6 };
    expect(computeSceneScore(withRomance)).toBeGreaterThan(computeSceneScore(base));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// computeSceneWeighting — dominant + secondaries 選出
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("computeSceneWeighting", () => {
  test("1 イベント → dominant のみ、secondaries 空", () => {
    const events: EventContext[] = [{
      id: "a", title: "仕事", type: "work",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T17:00:00",
      priority: 1,
    }];
    const { dominant, secondaries } = computeSceneWeighting(events);
    expect(dominant.id).toBe("a");
    expect(secondaries).toHaveLength(0);
  });

  test("同じ eventType が複数 → secondaries に含まれない", () => {
    const events: EventContext[] = [
      { id: "a", title: "仕事1", type: "work", startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T12:00:00", priority: 1 },
      { id: "b", title: "仕事2", type: "work", startAt: "2026-04-14T13:00:00", endAt: "2026-04-14T17:00:00", priority: 1 },
    ];
    const { secondaries } = computeSceneWeighting(events);
    expect(secondaries).toHaveLength(0);
  });

  test("secondaries は最大 2", () => {
    const events: EventContext[] = [
      { id: "a", title: "仕事", type: "work", startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T17:00:00", priority: 2 },
      { id: "b", title: "ランチ", type: "date", startAt: "2026-04-14T12:00:00", endAt: "2026-04-14T13:00:00", priority: 1 },
      { id: "c", title: "友達", type: "friends", startAt: "2026-04-14T18:00:00", endAt: "2026-04-14T20:00:00", priority: 1 },
      { id: "d", title: "運動", type: "sports", startAt: "2026-04-14T20:00:00", endAt: "2026-04-14T21:00:00", priority: 1 },
    ];
    const { secondaries } = computeSceneWeighting(events);
    expect(secondaries.length).toBeLessThanOrEqual(2);
  });

  test("formal lunch が work より dominant になる（eventType 重要度差）", () => {
    const events: EventContext[] = [
      { id: "work", title: "仕事", type: "work", startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T12:00:00", priority: 1 },
      { id: "formal", title: "フォーマルランチ", type: "formal", startAt: "2026-04-14T12:00:00", endAt: "2026-04-14T13:00:00", priority: 1, dressCode: "formal" },
    ];
    const { dominant } = computeSceneWeighting(events);
    // formal (importance=9 + dressCode=4) > work (importance=6 + duration=3)
    expect(dominant.type).toBe("formal");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// blendWithSecondaries — secondary 補正の cap 保証
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("blendWithSecondaries", () => {
  test("secondary なし → dominant そのまま", () => {
    const dominantEv: EventContext = {
      id: "a", title: "仕事", type: "work",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T17:00:00", priority: 1,
    };
    const dominantIntent = computeIntent(dominantEv);
    const blended = blendWithSecondaries(dominantIntent, []);
    // 全軸同じ
    expect(blended.formality).toBe(dominantIntent.formality);
    expect(blended.romance).toBe(dominantIntent.romance);
    expect(blended.mobility).toBe(dominantIntent.mobility);
  });

  test("secondary の補正が ±0.15 を超えない", () => {
    // dominant: work (formality 高め) / secondary: sports (formality 低め)
    const dominantEv: EventContext = {
      id: "a", title: "仕事", type: "work",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T17:00:00", priority: 1,
    };
    const secondaryEv: EventContext = {
      id: "b", title: "スポーツ", type: "sports",
      startAt: "2026-04-14T18:00:00", endAt: "2026-04-14T19:00:00", priority: 1,
    };

    const dominantIntent = computeIntent(dominantEv);
    const blended = blendWithSecondaries(dominantIntent, [secondaryEv]);

    // 各軸の差が ±0.15 以内
    for (const key of NUMERIC_INTENT_KEYS) {
      const delta = Math.abs(blended[key as keyof Intent] as number - dominantIntent[key as keyof Intent] as number);
      expect(delta).toBeLessThanOrEqual(0.15 + 0.001); // floating point tolerance
    }
  });

  test("全軸 0..1 に収まる", () => {
    const dominantEv: EventContext = {
      id: "a", title: "フォーマル", type: "formal",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T17:00:00",
      priority: 2, dressCode: "formal",
    };
    const secondaryEv: EventContext = {
      id: "b", title: "スポーツ", type: "sports",
      startAt: "2026-04-14T18:00:00", endAt: "2026-04-14T19:00:00", priority: 1,
    };
    const dominantIntent = computeIntent(dominantEv);
    const blended = blendWithSecondaries(dominantIntent, [secondaryEv]);

    for (const key of NUMERIC_INTENT_KEYS) {
      const val = blended[key as keyof Intent] as number;
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });

  test("sceneTags が union される", () => {
    const dominantEv: EventContext = {
      id: "a", title: "仕事", type: "work",
      startAt: "2026-04-14T09:00:00", endAt: "2026-04-14T17:00:00", priority: 1,
    };
    const secondaryEv: EventContext = {
      id: "b", title: "デート", type: "date",
      startAt: "2026-04-14T18:00:00", endAt: "2026-04-14T20:00:00", priority: 1,
    };
    const dominantIntent = computeIntent(dominantEv);
    const blended = blendWithSecondaries(dominantIntent, [secondaryEv]);

    // blended は dominant の sceneTags を含む
    for (const tag of dominantIntent.sceneTags) {
      expect(blended.sceneTags).toContain(tag);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GPT指定テスト4系統 — E2E シナリオ
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("E2E Scenario A: 午前 work + 昼 formal lunch + 夜 casual", () => {
  const plan = makePlan([
    { id: "w", text: "仕事", eventType: "work", startTime: "09:00", durationMin: 180, kind: "fixed" },
    { id: "f", text: "取引先ランチ", eventType: "formal", startTime: "12:00", durationMin: 90 },
    { id: "c", text: "友達と飲み", eventType: "friends", startTime: "19:00", durationMin: 120 },
  ]);

  test("dominant は formal（eventType 重要度最高）", () => {
    const events = planToEventContexts(plan);
    const { dominant } = computeSceneWeighting(events);
    expect(dominant.type).toBe("formal");
  });

  test("secondary に work と friends が含まれる（異なる eventType）", () => {
    const events = planToEventContexts(plan);
    const { secondaries } = computeSceneWeighting(events);
    const types = secondaries.map(s => s.type);
    expect(types).toContain("work");
    expect(types).toContain("friends");
  });

  test("formal が dominant → formality は高い + secondary 補正で壊されない", () => {
    const events = planToEventContexts(plan);
    const { dominant, secondaries } = computeSceneWeighting(events);
    const dominantIntent = computeIntent(dominant);
    const blended = blendWithSecondaries(dominantIntent, secondaries);

    // formal dominant → formality 高い（dressCode floor = 0.90）
    expect(blended.formality).toBeGreaterThanOrEqual(0.75);
    // secondary（friends: formality 低い）が引っ張っても 0.15 cap → 0.90 - 0.15 = 0.75 以上
  });

  test("pure average ではない: formal だけの intent と blended の formality 差は ±0.15 以内", () => {
    const events = planToEventContexts(plan);
    const { dominant, secondaries } = computeSceneWeighting(events);
    const dominantIntent = computeIntent(dominant);
    const blended = blendWithSecondaries(dominantIntent, secondaries);

    const diff = Math.abs(blended.formality - dominantIntent.formality);
    expect(diff).toBeLessThanOrEqual(0.15 + 0.001);
  });
});

describe("E2E Scenario B: 長時間 office + 短時間 date", () => {
  const plan = makePlan([
    { id: "office", text: "オフィス勤務", eventType: "work", startTime: "09:00", durationMin: 480, kind: "fixed" },
    { id: "date", text: "彼女とディナー", eventType: "date", startTime: "19:00", durationMin: 90, withWhom: "彼女" },
  ]);

  test("date が dominant（eventType 重要度 7 + romance social exposure）", () => {
    const events = planToEventContexts(plan);
    const { dominant } = computeSceneWeighting(events);
    // date: importance=7 + duration=1.5 + priority=2 + romance(0.7>0.3)=3 + attention(0.6>0.3)=2 = 15.5
    // work: importance=6 + duration=5(capped) + priority=2 = 13
    // → date が dominant
    expect(dominant.type).toBe("date");
  });

  test("secondary に work が含まれる", () => {
    const events = planToEventContexts(plan);
    const { secondaries } = computeSceneWeighting(events);
    expect(secondaries.some(s => s.type === "work")).toBe(true);
  });

  test("blended intent: romance が高く維持される（date dominant）", () => {
    const events = planToEventContexts(plan);
    const { dominant, secondaries } = computeSceneWeighting(events);
    const dominantIntent = computeIntent(dominant);
    const blended = blendWithSecondaries(dominantIntent, secondaries);

    // date の romance は高い
    expect(blended.romance).toBeGreaterThan(0.50);
    // work secondary が trust を少し引き上げるかも
    expect(blended.trust).toBeGreaterThanOrEqual(dominantIntent.trust - 0.15);
  });
});

describe("E2E Scenario C: sports + work の混在", () => {
  const plan = makePlan([
    { id: "work", text: "午前中仕事", eventType: "work", startTime: "09:00", durationMin: 240, kind: "fixed" },
    { id: "gym", text: "ジム", eventType: "sports", startTime: "18:00", durationMin: 90 },
  ]);

  test("work が dominant（importance=6 + duration=4 > sports importance=5 + duration=1.5）", () => {
    const events = planToEventContexts(plan);
    const { dominant } = computeSceneWeighting(events);
    expect(dominant.type).toBe("work");
  });

  test("secondary に sports が含まれる", () => {
    const events = planToEventContexts(plan);
    const { secondaries } = computeSceneWeighting(events);
    expect(secondaries.some(s => s.type === "sports")).toBe(true);
  });

  test("blended: sports secondary が mobility を微増させるが formality を壊さない", () => {
    const events = planToEventContexts(plan);
    const { dominant, secondaries } = computeSceneWeighting(events);
    const dominantIntent = computeIntent(dominant);
    const blended = blendWithSecondaries(dominantIntent, secondaries);

    // sports secondary → mobility が少し上がる（sport の mobility は高い）
    // ただし dominant の work 軸を壊さない（±0.15 cap）
    expect(blended.formality).toBeGreaterThanOrEqual(dominantIntent.formality - 0.15);

    // mobility は work よりは上がる（sport secondary の影響）
    // ただし変化は小さい（25% × delta, capped at 0.15）
    const mobilityDelta = blended.mobility - dominantIntent.mobility;
    expect(mobilityDelta).toBeGreaterThanOrEqual(-0.001); // sports は mobility を引き上げるはず
    expect(mobilityDelta).toBeLessThanOrEqual(0.15 + 0.001);
  });
});

describe("E2E Scenario D: 旅行日で hotel endpoint あり", () => {
  const plan = makePlan(
    [
      { id: "travel", text: "移動", eventType: "travel", startTime: "10:00", durationMin: 180 },
      { id: "sightseeing", text: "観光", eventType: "outdoor", startTime: "14:00", durationMin: 180 },
    ],
    {
      endpointAnchor: { type: "hotel", label: "ホテル", needsAreaConfirm: false },
    },
  );

  test("dominant は travel（importance=4 が outdoor=3 より高い + 同じ duration）", () => {
    const events = planToEventContexts(plan);
    const { dominant } = computeSceneWeighting(events);
    expect(dominant.type).toBe("travel");
  });

  test("secondary に outdoor が含まれる", () => {
    const events = planToEventContexts(plan);
    const { secondaries } = computeSceneWeighting(events);
    expect(secondaries.some(s => s.type === "outdoor")).toBe(true);
  });

  test("hotel endpoint → wrinkleSafe, pocketNeed が nudge される", () => {
    const events = planToEventContexts(plan);
    const { dominant, secondaries } = computeSceneWeighting(events);
    const dominantIntent = computeIntent(dominant);
    const blended = blendWithSecondaries(dominantIntent, secondaries);

    // endpoint 補正前の値を記録
    const prePocket = blended.pocketNeed;
    const preWrinkle = blended.wrinkleSafe;

    // endpoint 補正適用
    applyEndpointAdjustment(blended, plan.endpointAnchor!);

    expect(blended.wrinkleSafe).toBeGreaterThan(preWrinkle);
    expect(blended.pocketNeed).toBeGreaterThan(prePocket);
    expect(blended.sceneTags).toContain("layered");
  });

  test("全パイプライン: dominant → blend → endpoint → 全軸 0..1", () => {
    const events = planToEventContexts(plan);
    const { dominant, secondaries } = computeSceneWeighting(events);
    const dominantIntent = computeIntent(dominant);
    const blended = blendWithSecondaries(dominantIntent, secondaries);
    applyEndpointAdjustment(blended, plan.endpointAnchor!);

    for (const key of NUMERIC_INTENT_KEYS) {
      const val = blended[key as keyof Intent] as number;
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(1);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// generateOutfitFromPlan 経由の統合テスト
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("generateOutfitFromPlan with scene weighting (no wardrobe)", () => {
  test("複合プランで noWardrobe=true の場合も dominant ベースの Intent が返る", async () => {
    const { generateOutfitFromPlan } = await import("@/lib/alter-morning/outfitBridge");

    const plan = makePlan([
      { id: "w", text: "仕事", eventType: "work", startTime: "09:00", durationMin: 480 },
      { id: "d", text: "デート", eventType: "date", startTime: "19:00", durationMin: 120, withWhom: "彼女" },
    ]);

    const result = generateOutfitFromPlan(plan, []);
    expect(result).not.toBeNull();
    expect(result!.noWardrobe).toBe(true);
    // primaryEvent は dominant（date）
    expect(result!.primaryEvent.type).toBe("date");
    // Intent が存在する
    expect(result!.intent.formality).toBeDefined();
  });
});
