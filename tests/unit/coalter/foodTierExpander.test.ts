/**
 * CoAlter Stage 3a — foodTierExpander unit tests
 *
 * F-4 (2026-04-20) scope:
 *   - 4-tier plan 生成: T0 / T1a / T1b / T2
 *   - 時間隣接: dinner 19-20 → 18-19 / 20-21
 *   - 地理隣接: 渋谷 → 表参道・恵比寿・代官山・原宿
 *   - 閉端ガード: area 空文字 / timeSlot 0-range は throw
 *   - 境界 clamp: 23-25 指定は 23-24 に clamp。隣接は発行されないこともある
 *   - thin 判定: AREA_ADJACENCY 未登録 → T1b が同 area / T2 thinReason=area_thin
 */

import { describe, expect, it } from "vitest";

import {
  adjacentTimeSlots,
  buildFoodTierPlans,
  __internal,
  type FoodTierPlan,
  type TimeWindowRange,
} from "@/lib/coalter/foodTierExpander";

function slot(
  startHour: number,
  endHour: number,
  dayOffset: 0 | 1 = 0,
): TimeWindowRange {
  return { startHour, endHour, dayOffset };
}

// ═════════════════════════════════════════════════════════════════════════
// adjacentTimeSlots
// ═════════════════════════════════════════════════════════════════════════

describe("adjacentTimeSlots", () => {
  it("dinner 19-20 → [18-19, 20-21, 明日19-20]（同日 prev/next + 明日同時刻）", () => {
    expect(adjacentTimeSlots(slot(19, 20))).toEqual([
      slot(18, 19),
      slot(20, 21),
      slot(19, 20, 1),
    ]);
  });

  it("lunch 12-13 → [11-12, 13-14, 明日12-13]", () => {
    expect(adjacentTimeSlots(slot(12, 13))).toEqual([
      slot(11, 12),
      slot(13, 14),
      slot(12, 13, 1),
    ]);
  });

  it("2 時間レンジ 19-21 → [17-19, 21-23, 明日19-21]（span 比例で隣接）", () => {
    expect(adjacentTimeSlots(slot(19, 21))).toEqual([
      slot(17, 19),
      slot(21, 23),
      slot(19, 21, 1),
    ]);
  });

  it("早朝 0-1 → [1-2, 明日0-1]（prev は 0 clamp で消えるが明日同時刻は残る）", () => {
    expect(adjacentTimeSlots(slot(0, 1))).toEqual([slot(1, 2), slot(0, 1, 1)]);
  });

  it("深夜 23-24 → [22-23, 明日23-24]（next は 24 clamp で消えるが明日同時刻は残る）", () => {
    expect(adjacentTimeSlots(slot(23, 24))).toEqual([
      slot(22, 23),
      slot(23, 24, 1),
    ]);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// buildFoodTierPlans — 正常系
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodTierPlans — 渋谷 × dinner 19-20", () => {
  const plans = buildFoodTierPlans({ area: "渋谷", timeSlot: slot(19, 20) });

  it("4 tier が順番通りに返る", () => {
    expect(plans).toHaveLength(4);
    expect(plans.map((p) => p.tier)).toEqual(["T0", "T1a", "T1b", "T2"]);
  });

  it("T0 は指定エリア × 指定時間帯", () => {
    const t0 = plans[0];
    expect(t0.areas).toEqual(["渋谷"]);
    expect(t0.timeSlots).toEqual([slot(19, 20)]);
    expect(t0.thinReason).toBeUndefined();
  });

  it("T1a は指定エリア × 時間隣接（同日 prev/next + 明日同時刻）", () => {
    const t1a = plans[1];
    expect(t1a.areas).toEqual(["渋谷"]);
    expect(t1a.timeSlots).toEqual([
      slot(18, 19),
      slot(20, 21),
      slot(19, 20, 1),
    ]);
  });

  it("T1b は隣接エリア × 指定時間帯", () => {
    const t1b = plans[2];
    expect(t1b.areas).toEqual([
      "表参道",
      "恵比寿",
      "代官山",
      "原宿",
    ]);
    expect(t1b.timeSlots).toEqual([slot(19, 20)]);
  });

  it("T2 は area × time の全合流（重複可）、thinReason は undefined（通常ケース）", () => {
    const t2 = plans[3];
    expect(t2.areas[0]).toBe("渋谷");
    expect(t2.areas).toContain("表参道");
    expect(t2.timeSlots).toContainEqual(slot(19, 20));
    expect(t2.timeSlots).toContainEqual(slot(18, 19));
    expect(t2.timeSlots).toContainEqual(slot(20, 21));
    expect(t2.timeSlots).toContainEqual(slot(19, 20, 1));
    // Gap D 反映: 通常ケース（どちらも隣接あり）は thinReason は undefined
    expect(t2.thinReason).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════
// buildFoodTierPlans — thin 系（adjacency 未登録）
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodTierPlans — 未登録エリア（thin）", () => {
  it("AREA_ADJACENCY 未登録 area → T1b は自分自身 / T2 thinReason=area_thin", () => {
    const plans = buildFoodTierPlans({
      area: "未知エリア",
      timeSlot: slot(19, 20),
    });
    const t1b = plans.find((p) => p.tier === "T1b") as FoodTierPlan;
    expect(t1b.areas).toEqual(["未知エリア"]);
    const t2 = plans.find((p) => p.tier === "T2") as FoodTierPlan;
    expect(t2.thinReason).toBe("area_thin");
  });

  it("境界: 23-24 指定 → 時間隣接 2 件（prev + 明日同時刻）/ thinReason は area_thin 主導", () => {
    const plans = buildFoodTierPlans({
      area: "未知エリア",
      timeSlot: slot(23, 24),
    });
    const t1a = plans.find((p) => p.tier === "T1a") as FoodTierPlan;
    expect(t1a.timeSlots).toEqual([slot(22, 23), slot(23, 24, 1)]);
    const t2 = plans.find((p) => p.tier === "T2") as FoodTierPlan;
    // 時間隣接はあるので time_thin は立たない、area_thin のみ
    expect(t2.thinReason).toBe("area_thin");
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 入力ガード
// ═════════════════════════════════════════════════════════════════════════

describe("buildFoodTierPlans — 入力ガード", () => {
  it("area 空文字は throw", () => {
    expect(() =>
      buildFoodTierPlans({ area: "", timeSlot: slot(19, 20) }),
    ).toThrow(/area must be non-empty/);
  });

  it("area ホワイトスペースのみも throw", () => {
    expect(() =>
      buildFoodTierPlans({ area: "   ", timeSlot: slot(19, 20) }),
    ).toThrow(/area must be non-empty/);
  });

  it("timeSlot が 0-range（start >= end）なら throw", () => {
    expect(() =>
      buildFoodTierPlans({ area: "渋谷", timeSlot: slot(19, 19) }),
    ).toThrow(/non-empty range/);
    expect(() =>
      buildFoodTierPlans({ area: "渋谷", timeSlot: slot(20, 19) }),
    ).toThrow(/non-empty range/);
  });
});

// ═════════════════════════════════════════════════════════════════════════
// clampSlot sanity
// ═════════════════════════════════════════════════════════════════════════

describe("clampSlot — 境界整形", () => {
  it("負値は 0 に clamp", () => {
    expect(__internal.clampSlot(slot(-2, 1))).toEqual(slot(0, 1));
  });
  it("24 超は 24 に clamp", () => {
    expect(__internal.clampSlot(slot(22, 27))).toEqual(slot(22, 24));
  });
});

// ═════════════════════════════════════════════════════════════════════════
// 決定論
// ═════════════════════════════════════════════════════════════════════════

describe("foodTierExpander — 決定論", () => {
  it("同一入力で同一 plan", () => {
    const input = { area: "渋谷", timeSlot: slot(19, 20) };
    expect(buildFoodTierPlans(input)).toEqual(buildFoodTierPlans(input));
  });
});
