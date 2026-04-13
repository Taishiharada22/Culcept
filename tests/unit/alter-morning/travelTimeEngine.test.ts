/**
 * Travel Time Engine テスト
 *
 * ヒューリスティック移動時間推定 + ツアー構造の移動アイテム挿入を検証。
 *
 * CEOの要求:
 * 「何時から、何を使って、どれくらいの時間がかかって最初の目的地について、
 *  そこにどれだけいて、そこで何をして→その後の工程を同じフローでプランを立てる」
 */

import {
  estimateTravelTime,
  insertTravelItems,
  inferDistance,
} from "@/lib/alter-morning/travelTimeEngine";
import { buildDayPlan } from "@/lib/alter-morning/planningEngine";
import { parseIntent, intentToPlanItems, preloadVocabulary } from "@/lib/alter-morning/intentParser";
import type { PlanItem, DayConditions, MorningPlan } from "@/lib/alter-morning/types";

beforeAll(async () => {
  await preloadVocabulary();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// inferDistance — 距離区分の推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("inferDistance", () => {
  test("カフェは市内移動", () => {
    expect(inferDistance("cafe")).toBe("city");
  });

  test("コンビニは近場", () => {
    expect(inferDistance("convenience_store")).toBe("near");
  });

  test("公園は近場", () => {
    expect(inferDistance("park")).toBe("near");
  });

  test("ホテルは隣接市区", () => {
    expect(inferDistance("hotel")).toBe("adjacent");
  });

  test("テキストヒント「近くの」は near を優先", () => {
    expect(inferDistance("cafe", "近くのスタバ")).toBe("near");
  });

  test("テキストヒント「空港」は wide", () => {
    expect(inferDistance("other", "空港まで")).toBe("wide");
  });

  test("カテゴリなし → city デフォルト", () => {
    expect(inferDistance(undefined)).toBe("city");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// estimateTravelTime — 移動時間推定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("estimateTravelTime", () => {
  test("車で市内移動（カフェへ） → 30分（20分 + 駐車5分 → 切り上げ）", () => {
    const result = estimateTravelTime("car", undefined, "cafe");
    expect(result).not.toBeNull();
    expect(result!.durationMin).toBe(30); // 20 + 5 = 25 → 切り上げ15 → 30
    expect(result!.distanceCategory).toBe("city");
  });

  test("車で自宅から出発（出発準備オーバーヘッド）", () => {
    const result = estimateTravelTime("car", "home", "cafe", true);
    expect(result).not.toBeNull();
    // 20(移動) + 5(駐車) + 10(出発準備) = 35 → 切り上げ15 → 45
    expect(result!.durationMin).toBe(45);
    expect(result!.overheadMin).toBe(15); // 5 + 10
  });

  test("電車で市内移動", () => {
    const result = estimateTravelTime("train", undefined, "cafe");
    expect(result).not.toBeNull();
    // 30(移動) + 10(駅徒歩+待ち) = 40 → 切り上げ45
    expect(result!.durationMin).toBe(45);
  });

  test("徒歩で近場（公園） → 15分", () => {
    const result = estimateTravelTime("walk", undefined, "park");
    expect(result).not.toBeNull();
    expect(result!.durationMin).toBe(15); // 15 + 0 = 15 → 15
    expect(result!.distanceCategory).toBe("near");
  });

  test("自転車で市内 → 30分", () => {
    const result = estimateTravelTime("bicycle", undefined, "cafe");
    expect(result).not.toBeNull();
    // 20(移動) + 2(駐輪) = 22 → 切り上げ30
    expect(result!.durationMin).toBe(30);
  });

  test("undefined transport → car デフォルト", () => {
    const result = estimateTravelTime(undefined, undefined, "cafe");
    const carResult = estimateTravelTime("car", undefined, "cafe");
    expect(result).toEqual(carResult);
  });

  test("日本語交通手段も正しく処理される", () => {
    const result = estimateTravelTime("電車" as any, undefined, "cafe");
    expect(result).not.toBeNull();
    expect(result!.durationMin).toBe(45); // train と同じ
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// insertTravelItems — ツアー構造の移動アイテム挿入
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("insertTravelItems", () => {
  const bmwLocation = {
    canonicalId: "bmw",
    label: "BMW",
    category: "other" as any,
    source: "user_explicit" as const,
  };
  const mcdLocation = {
    canonicalId: "mcdonalds",
    label: "マクドナルド",
    category: "fast_food" as any,
    source: "user_explicit" as const,
  };

  test("在宅なら移動アイテムなし", () => {
    const items: PlanItem[] = [
      { id: "1", kind: "todo", text: "掃除", durationMin: 30, completed: false },
    ];
    const result = insertTravelItems(items, "car", false);
    expect(result).toEqual(items);
    expect(result.filter(i => i.kind === "travel")).toHaveLength(0);
  });

  test("場所なしのタスクには移動を挿入しない", () => {
    const items: PlanItem[] = [
      { id: "1", kind: "todo", text: "読書", durationMin: 60, completed: false },
      { id: "2", kind: "todo", text: "勉強", durationMin: 60, completed: false },
    ];
    const result = insertTravelItems(items, "car", true);
    // location がないので travel は生成されない
    expect(result.filter(i => i.kind === "travel")).toHaveLength(0);
  });

  test("1つの場所 → 自宅→目的地 + 目的地→自宅 の2移動", () => {
    const items: PlanItem[] = [
      {
        id: "1", kind: "todo", text: "マクドナルドで仕事",
        durationMin: 120, completed: false, location: mcdLocation,
      },
    ];
    const result = insertTravelItems(items, "car", true);
    const travels = result.filter(i => i.kind === "travel");
    expect(travels).toHaveLength(2);
    expect(travels[0].travelFrom).toBe("自宅");
    expect(travels[0].travelTo).toBe("マクドナルド");
    expect(travels[1].travelFrom).toBe("マクドナルド");
    expect(travels[1].travelTo).toBe("自宅");
  });

  test("2つの場所 → 自宅→A + A→B + B→自宅 の3移動", () => {
    const items: PlanItem[] = [
      {
        id: "1", kind: "todo", text: "BMWに寄る",
        durationMin: 30, completed: false, location: bmwLocation,
        sequenceOrder: 1,
      },
      {
        id: "2", kind: "todo", text: "マクドナルドで仕事",
        durationMin: 120, completed: false, location: mcdLocation,
        sequenceOrder: 2,
      },
    ];
    const result = insertTravelItems(items, "car", true);
    const travels = result.filter(i => i.kind === "travel");
    expect(travels).toHaveLength(3);
    // 自宅→BMW
    expect(travels[0].text).toContain("自宅→BMW");
    // BMW→マクドナルド
    expect(travels[1].text).toContain("BMW→マクドナルド");
    // マクドナルド→自宅
    expect(travels[2].text).toContain("マクドナルド→自宅");
  });

  test("同じ場所のアイテム間には移動を挿入しない", () => {
    const items: PlanItem[] = [
      {
        id: "1", kind: "todo", text: "マクドナルドで勉強",
        durationMin: 60, completed: false, location: mcdLocation,
      },
      {
        id: "2", kind: "todo", text: "マクドナルドでランチ",
        durationMin: 60, completed: false, location: mcdLocation,
      },
    ];
    const result = insertTravelItems(items, "car", true);
    const travels = result.filter(i => i.kind === "travel");
    // 自宅→マック + マック→自宅 のみ（マック→マックは生成されない）
    expect(travels).toHaveLength(2);
  });

  test("移動アイテムに交通手段アイコンが含まれる", () => {
    const items: PlanItem[] = [
      {
        id: "1", kind: "todo", text: "マクドナルドで仕事",
        durationMin: 120, completed: false, location: mcdLocation,
      },
    ];
    const resultCar = insertTravelItems(items, "car", true);
    expect(resultCar.find(i => i.kind === "travel")!.text).toContain("🚗");

    const resultTrain = insertTravelItems(items, "train", true);
    expect(resultTrain.find(i => i.kind === "travel")!.text).toContain("🚃");

    const resultWalk = insertTravelItems(items, "walk", true);
    expect(resultWalk.find(i => i.kind === "travel")!.text).toContain("🚶");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildDayPlan 統合テスト — 移動アイテム込みのプラン生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildDayPlan with travel items", () => {
  const mcdLocation = {
    canonicalId: "mcdonalds",
    label: "マクドナルド",
    category: "fast_food" as any,
    source: "user_explicit" as const,
  };
  const bmwLocation = {
    canonicalId: "bmw",
    label: "BMW",
    category: "other" as any,
    source: "user_explicit" as const,
  };

  test("外出プラン → 移動アイテムが挿入される", () => {
    const items: PlanItem[] = [
      {
        id: "visit_1", kind: "todo", text: "BMWに寄る",
        durationMin: 30, completed: false, location: bmwLocation,
        sequenceOrder: 1,
      },
      {
        id: "main_1", kind: "todo", text: "マクドナルドで仕事",
        durationMin: 120, completed: false, location: mcdLocation,
        sequenceOrder: 2,
      },
    ];
    const dayConditions: DayConditions = { mainTransport: "car" };
    const now = new Date("2026-04-13T09:00:00+09:00");

    const plan = buildDayPlan(items, dayConditions, now, { goOut: true });
    const travels = plan.items.filter(i => i.kind === "travel");

    // 最低3移動: 自宅→BMW, BMW→マクドナルド, マクドナルド→自宅
    expect(travels.length).toBeGreaterThanOrEqual(3);

    // 移動アイテムに startTime が付与されている
    for (const t of travels) {
      expect(t.startTime).toBeDefined();
    }

    // 全アイテムが時間順になっている
    const withTime = plan.items.filter(i => i.startTime);
    for (let i = 1; i < withTime.length; i++) {
      const prev = timeToMin(withTime[i - 1].startTime!);
      const curr = timeToMin(withTime[i].startTime!);
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  test("在宅プラン → 移動アイテムなし", () => {
    const items: PlanItem[] = [
      { id: "1", kind: "todo", text: "掃除", durationMin: 30, completed: false },
      { id: "2", kind: "todo", text: "洗濯", durationMin: 20, completed: false },
    ];
    const plan = buildDayPlan(items, {}, undefined, { goOut: false });
    const travels = plan.items.filter(i => i.kind === "travel");
    expect(travels).toHaveLength(0);
  });

  test("goOut 未指定 + 場所あり → 移動が自動挿入される", () => {
    const items: PlanItem[] = [
      {
        id: "1", kind: "todo", text: "マクドナルドで仕事",
        durationMin: 120, completed: false, location: mcdLocation,
      },
    ];
    const plan = buildDayPlan(items, { mainTransport: "car" });
    const travels = plan.items.filter(i => i.kind === "travel");
    // location が home でなければ goOut と推定 → 移動挿入
    expect(travels.length).toBeGreaterThanOrEqual(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// E2E テスト — parseIntent → intentToPlanItems → buildDayPlan
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("E2E: CEO scenario with travel", () => {
  test("「BMWいって、マックで仕事する」→ ツアー構造プラン", () => {
    const intent = parseIntent("これから、BMWいって、マックで仕事する予定。");
    const items = intentToPlanItems(intent);

    // 場所付きアイテムがある
    const locationItems = items.filter(i => i.location != null);
    expect(locationItems.length).toBeGreaterThanOrEqual(1);

    const dayConditions: DayConditions = { mainTransport: "car" };
    const now = new Date("2026-04-13T09:00:00+09:00");
    const plan = buildDayPlan(items, dayConditions, now, { goOut: true });

    // 移動アイテムが存在する
    const travels = plan.items.filter(i => i.kind === "travel");
    expect(travels.length).toBeGreaterThan(0);

    // 全アイテムを時刻順に確認
    const allItems = plan.items.filter(i => i.startTime);
    expect(allItems.length).toBeGreaterThan(0);

    // ツアー構造の確認:
    // travel → stay → travel → stay → travel の繰り返し
    let lastKind = "";
    for (const item of plan.items) {
      if (item.kind === "travel" && lastKind === "travel") {
        // 連続する travel は不正（間に stay がないといけない）
        fail("連続する travel アイテムが存在します");
      }
      lastKind = item.kind;
    }
  });

  test("プランの総時間に移動時間が含まれている", () => {
    const intent = parseIntent("BMWいって、マックで仕事する");
    const items = intentToPlanItems(intent);
    const dayConditions: DayConditions = { mainTransport: "car" };
    const now = new Date("2026-04-13T09:00:00+09:00");

    const planWithTravel = buildDayPlan(items, dayConditions, now, { goOut: true });
    const planWithoutTravel = buildDayPlan(items, dayConditions, now, { goOut: false });

    // 移動アイテム込みのプランの方が総時間が長い
    const totalWithTravel = planWithTravel.items.reduce((sum, i) => sum + i.durationMin, 0);
    const totalWithout = planWithoutTravel.items.reduce((sum, i) => sum + i.durationMin, 0);
    expect(totalWithTravel).toBeGreaterThan(totalWithout);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ヘルパー
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function timeToMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}
