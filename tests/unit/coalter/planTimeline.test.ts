/**
 * CoAlter Phase 1.5.3 — 時系列ドキュメント化 (Claude 旅行プラン機能取り込み ①)
 *
 * - timeSlot の数値/自然言語 → 分数変換
 * - 同一日の時刻順ソート（不明は末尾）
 * - 隣接アイテム間のギャップ計算とラベル化
 * - 日別グルーピング
 */

import { describe, it, expect } from "vitest";
import type { PlanItem } from "@/lib/coalter/planShelf";
import {
  parseTimeSlotMinutes,
  sortByTimeSlot,
  computeGapHours,
  formatGapLabel,
  groupByDayTimeline,
} from "@/lib/coalter/planTimeline";

function makeItem(
  targetDate: string,
  timeSlot: string | null,
  sortOrder = 1,
): PlanItem {
  return {
    id: `id-${targetDate}-${timeSlot ?? "none"}-${sortOrder}`,
    threadId: "t",
    sessionId: "s",
    targetDate,
    timeSlot,
    title: `title ${timeSlot ?? "none"}`,
    description: "",
    practicalInfo: null,
    url: null,
    category: "other",
    sortOrder,
    createdBy: "user-a",
    createdAt: `${targetDate}T10:00:00.000Z`,
    isExpired: false,
  };
}

describe("parseTimeSlotMinutes", () => {
  it("HH:MM 数値表記を分数に", () => {
    expect(parseTimeSlotMinutes("10:00")).toBe(600);
    expect(parseTimeSlotMinutes("19:30")).toBe(19 * 60 + 30);
    expect(parseTimeSlotMinutes("7:05")).toBe(7 * 60 + 5);
  });

  it("H時 / H時MM分 を分数に", () => {
    expect(parseTimeSlotMinutes("19時")).toBe(19 * 60);
    expect(parseTimeSlotMinutes("9時30分")).toBe(9 * 60 + 30);
    expect(parseTimeSlotMinutes("20時15")).toBe(20 * 60 + 15);
  });

  it("自然言語の時間帯を代表的分数に", () => {
    expect(parseTimeSlotMinutes("朝")).toBe(8 * 60);
    expect(parseTimeSlotMinutes("午前")).toBe(10 * 60);
    expect(parseTimeSlotMinutes("昼")).toBe(12 * 60);
    expect(parseTimeSlotMinutes("午後")).toBe(14 * 60);
    expect(parseTimeSlotMinutes("夕方")).toBe(17 * 60);
    expect(parseTimeSlotMinutes("夜")).toBe(19 * 60);
    expect(parseTimeSlotMinutes("深夜")).toBe(23 * 60);
  });

  it("複合表現でも長いキーが勝つ（深夜 > 夜）", () => {
    expect(parseTimeSlotMinutes("深夜")).toBe(23 * 60);
    expect(parseTimeSlotMinutes("夕食前")).toBe(19 * 60); // "夕食" ヒット
  });

  it("null / 空文字 / 不明語は null", () => {
    expect(parseTimeSlotMinutes(null)).toBeNull();
    expect(parseTimeSlotMinutes("")).toBeNull();
    expect(parseTimeSlotMinutes("   ")).toBeNull();
    expect(parseTimeSlotMinutes("いつか")).toBeNull();
  });
});

describe("sortByTimeSlot", () => {
  it("時刻ありは昇順、不明は末尾", () => {
    const items = [
      makeItem("2026-04-18", "夜", 1),
      makeItem("2026-04-18", null, 2),
      makeItem("2026-04-18", "10:00", 3),
      makeItem("2026-04-18", "ランチ", 4),
    ];
    const sorted = sortByTimeSlot(items);
    expect(sorted.map((i) => i.timeSlot)).toEqual(["10:00", "ランチ", "夜", null]);
  });

  it("同時刻は sortOrder で決める", () => {
    const items = [
      makeItem("2026-04-18", "19:00", 5),
      makeItem("2026-04-18", "19:00", 1),
      makeItem("2026-04-18", "19:00", 3),
    ];
    const sorted = sortByTimeSlot(items);
    expect(sorted.map((i) => i.sortOrder)).toEqual([1, 3, 5]);
  });

  it("全員不明なら sortOrder", () => {
    const items = [
      makeItem("2026-04-18", null, 2),
      makeItem("2026-04-18", null, 1),
    ];
    const sorted = sortByTimeSlot(items);
    expect(sorted.map((i) => i.sortOrder)).toEqual([1, 2]);
  });
});

describe("computeGapHours / formatGapLabel", () => {
  it("2時間差を 2 として返す", () => {
    const gap = computeGapHours(
      { timeSlot: "10:00" },
      { timeSlot: "12:00" },
    );
    expect(gap).toBe(2);
  });

  it("30分差を 0.5 として返す", () => {
    const gap = computeGapHours(
      { timeSlot: "10:00" },
      { timeSlot: "10:30" },
    );
    expect(gap).toBe(0.5);
  });

  it("逆順・同時刻は null（連続扱い）", () => {
    expect(computeGapHours({ timeSlot: "12:00" }, { timeSlot: "10:00" })).toBeNull();
    expect(computeGapHours({ timeSlot: "12:00" }, { timeSlot: "12:00" })).toBeNull();
  });

  it("どちらか不明なら null", () => {
    expect(computeGapHours({ timeSlot: null }, { timeSlot: "12:00" })).toBeNull();
    expect(computeGapHours({ timeSlot: "10:00" }, { timeSlot: null })).toBeNull();
  });

  it("ラベル整形: 30分未満=すぐ / 2時間未満=N時間 / 6時間未満=約N時間 / 以上=半日以上", () => {
    expect(formatGapLabel(0)).toBe("すぐ");
    expect(formatGapLabel(0.4)).toBe("すぐ");
    expect(formatGapLabel(0.5)).toBe("0.5時間");
    expect(formatGapLabel(1)).toBe("1時間");
    expect(formatGapLabel(1.5)).toBe("1.5時間");
    expect(formatGapLabel(3)).toBe("約3時間");
    expect(formatGapLabel(5.6)).toBe("約6時間");
    expect(formatGapLabel(8)).toBe("半日以上");
    expect(formatGapLabel(null)).toBe("");
  });
});

describe("groupByDayTimeline", () => {
  it("日付昇順 × 日内時刻昇順で返す", () => {
    const items: PlanItem[] = [
      makeItem("2026-04-19", "10:00"),
      makeItem("2026-04-18", "夜"),
      makeItem("2026-04-18", "ランチ"),
      makeItem("2026-04-19", null, 2),
      makeItem("2026-04-18", "朝食"),
    ];
    const days = groupByDayTimeline(items);
    expect(days.map((d) => d.date)).toEqual(["2026-04-18", "2026-04-19"]);
    expect(days[0].items.map((i) => i.timeSlot)).toEqual(["朝食", "ランチ", "夜"]);
    expect(days[1].items.map((i) => i.timeSlot)).toEqual(["10:00", null]);
  });

  it("空配列なら空配列", () => {
    expect(groupByDayTimeline([])).toEqual([]);
  });
});
