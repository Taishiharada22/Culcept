/**
 * CoAlter Phase 1.5.1 — Plan Shelf フィルタ・カウント・グルーピング
 *
 * - target_date >= today のアップカミングフィルタ
 * - 今日 / 週内 のカウント
 * - 過去日付の除外
 */

import { describe, it, expect } from "vitest";
import type { PlanItem } from "@/lib/coalter/planShelf";
import {
  buildDateRefs,
  countShelfSummary,
  filterUpcoming,
  groupByDateBuckets,
  toDateStr,
} from "@/lib/coalter/planShelfFilters";

/** PlanItem のテスト用ファクトリ */
function makeItem(targetDate: string, overrides: Partial<PlanItem> = {}): PlanItem {
  return {
    id: `id-${targetDate}-${Math.random().toString(36).slice(2, 6)}`,
    threadId: "thread-1",
    sessionId: "session-1",
    targetDate,
    timeSlot: null,
    title: `title ${targetDate}`,
    description: "",
    practicalInfo: null,
    url: null,
    category: "other",
    sortOrder: 1,
    createdBy: "user-a",
    createdAt: `${targetDate}T10:00:00.000Z`,
    isExpired: false,
    alternatives: null,
    ...overrides,
  };
}

describe("planShelfFilters", () => {
  // 基準日を固定（2026-04-17 金曜日）→ 今週末(土) = 2026-04-18, 来週末(土) = 2026-04-25
  const base = new Date(2026, 3, 17); // month は 0-indexed
  const refs = buildDateRefs(base);

  it("buildDateRefs: 2026-04-17(金) を基準に境界日を返す", () => {
    expect(refs.todayStr).toBe("2026-04-17");
    expect(refs.tomorrowStr).toBe("2026-04-18");
    expect(refs.weekEndStr).toBe("2026-04-18"); // 金曜の次の土曜
    expect(refs.nextWeekEndStr).toBe("2026-04-25");
  });

  it("toDateStr はローカル時刻で YYYY-MM-DD を返す", () => {
    expect(toDateStr(new Date(2026, 3, 17))).toBe("2026-04-17");
    expect(toDateStr(new Date(2026, 0, 1))).toBe("2026-01-01");
    expect(toDateStr(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  describe("filterUpcoming", () => {
    it("過去日付を完全除外し、today 以降のみ残す", () => {
      const items: PlanItem[] = [
        makeItem("2026-04-16"), // 過去
        makeItem("2026-04-17"), // 今日
        makeItem("2026-04-18"), // 明日
        makeItem("2026-04-25"), // 来週末
      ];
      const upcoming = filterUpcoming(items, refs);
      expect(upcoming.map((i) => i.targetDate)).toEqual([
        "2026-04-17",
        "2026-04-18",
        "2026-04-25",
      ]);
    });

    it("全て過去なら空配列", () => {
      const items: PlanItem[] = [
        makeItem("2026-01-01"),
        makeItem("2026-04-16"),
      ];
      expect(filterUpcoming(items, refs)).toEqual([]);
    });

    it("空配列を入れたら空配列を返す", () => {
      expect(filterUpcoming([], refs)).toEqual([]);
    });
  });

  describe("countShelfSummary", () => {
    it("今日件数と週内件数を別々に数える", () => {
      const items: PlanItem[] = [
        makeItem("2026-04-17"), // 今日 → today+week
        makeItem("2026-04-17"), // 今日 → today+week
        makeItem("2026-04-18"), // 明日(=weekEnd) → week のみ
        makeItem("2026-04-19"), // 来週 → どちらにも入らない（週内は 2026-04-18 まで）
      ];
      const { todayCount, weekCount } = countShelfSummary(items, refs);
      expect(todayCount).toBe(2);
      expect(weekCount).toBe(3);
    });

    it("過去日付はカウントしない（upcoming のみが前提）", () => {
      // 過去を含んだ入力でも weekCount には含めない（todayStr 以降のみ）
      const items: PlanItem[] = [
        makeItem("2026-04-15"),
        makeItem("2026-04-16"),
        makeItem("2026-04-17"),
      ];
      const { todayCount, weekCount } = countShelfSummary(items, refs);
      expect(todayCount).toBe(1);
      expect(weekCount).toBe(1);
    });

    it("0件なら両方 0", () => {
      const { todayCount, weekCount } = countShelfSummary([], refs);
      expect(todayCount).toBe(0);
      expect(weekCount).toBe(0);
    });
  });

  describe("groupByDateBuckets", () => {
    it("日付を today / tomorrow / thisWeek / nextWeek / later に振り分ける", () => {
      // 基準: 2026-04-17(金) → weekEnd=2026-04-18, nextWeekEnd=2026-04-25
      const items: PlanItem[] = [
        makeItem("2026-04-17"), // today
        makeItem("2026-04-18"), // tomorrow（= weekEnd だが tomorrow が優先）
        makeItem("2026-04-22"), // thisWeek ではなく nextWeek（weekEnd=04-18 を超えてるため）
        makeItem("2026-04-25"), // nextWeekEnd → nextWeek
        makeItem("2026-04-26"), // later
      ];
      const groups = groupByDateBuckets(items, refs);
      expect(groups.today.map((i) => i.targetDate)).toEqual(["2026-04-17"]);
      expect(groups.tomorrow.map((i) => i.targetDate)).toEqual(["2026-04-18"]);
      expect(groups.thisWeek).toEqual([]);
      expect(groups.nextWeek.map((i) => i.targetDate)).toEqual([
        "2026-04-22",
        "2026-04-25",
      ]);
      expect(groups.later.map((i) => i.targetDate)).toEqual(["2026-04-26"]);
    });

    it("基準日が週半ばなら thisWeek が実際に埋まる", () => {
      // 2026-04-15(水) → weekEnd=2026-04-18(土), nextWeekEnd=2026-04-25
      const wedRefs = buildDateRefs(new Date(2026, 3, 15));
      expect(wedRefs.todayStr).toBe("2026-04-15");
      expect(wedRefs.tomorrowStr).toBe("2026-04-16");
      expect(wedRefs.weekEndStr).toBe("2026-04-18");

      const items: PlanItem[] = [
        makeItem("2026-04-15"), // today
        makeItem("2026-04-16"), // tomorrow
        makeItem("2026-04-17"), // thisWeek
        makeItem("2026-04-18"), // thisWeek
      ];
      const groups = groupByDateBuckets(items, wedRefs);
      expect(groups.today.map((i) => i.targetDate)).toEqual(["2026-04-15"]);
      expect(groups.tomorrow.map((i) => i.targetDate)).toEqual(["2026-04-16"]);
      expect(groups.thisWeek.map((i) => i.targetDate)).toEqual([
        "2026-04-17",
        "2026-04-18",
      ]);
      expect(groups.nextWeek).toEqual([]);
      expect(groups.later).toEqual([]);
    });

    it("空配列なら全グループ空", () => {
      const groups = groupByDateBuckets([], refs);
      expect(groups.today).toEqual([]);
      expect(groups.tomorrow).toEqual([]);
      expect(groups.thisWeek).toEqual([]);
      expect(groups.nextWeek).toEqual([]);
      expect(groups.later).toEqual([]);
    });
  });

  /**
   * 回帰テスト（CEO 2026-04-17 指摘）:
   *   「count は 0 なのに 4/16 が一覧に出ている」不整合。
   * 原因は count 側と list 側で別フィルタを使っていたこと。
   * 対策: filterUpcoming → countShelfSummary → groupByDateBuckets を
   *      同じ refs で連続適用すれば、過去 item は絶対に描画面に現れない。
   */
  describe("regression: count と list の単一化", () => {
    it("過去 item を含む生配列から、filterUpcoming で一度切った後に count/group を取れば不整合なし", () => {
      const raw: PlanItem[] = [
        makeItem("2026-04-14"), // 過去
        makeItem("2026-04-16"), // 過去（CEO スクショで出ていた日付）
        makeItem("2026-04-17"), // 今日
      ];
      // 想定される Panel 内部処理の再現
      const upcoming = filterUpcoming(raw, refs);
      const { todayCount, weekCount } = countShelfSummary(upcoming, refs);
      const groups = groupByDateBuckets(upcoming, refs);

      // count に過去は一切入らない
      expect(todayCount).toBe(1);
      expect(weekCount).toBe(1);

      // 一覧にも過去は一切入らない
      expect(upcoming.map((i) => i.targetDate)).toEqual(["2026-04-17"]);
      expect(groups.today.map((i) => i.targetDate)).toEqual(["2026-04-17"]);
      // 過去日付が今日/明日/今週/来週/laterのどこにも現れない
      const allBucketDates = [
        ...groups.today,
        ...groups.tomorrow,
        ...groups.thisWeek,
        ...groups.nextWeek,
        ...groups.later,
      ].map((i) => i.targetDate);
      expect(allBucketDates).not.toContain("2026-04-14");
      expect(allBucketDates).not.toContain("2026-04-16");
    });

    it("全て過去なら upcoming=[]、count も groups も全て空（Shelf は null を返す前提）", () => {
      const raw: PlanItem[] = [
        makeItem("2026-04-10"),
        makeItem("2026-04-16"),
      ];
      const upcoming = filterUpcoming(raw, refs);
      const { todayCount, weekCount } = countShelfSummary(upcoming, refs);
      const groups = groupByDateBuckets(upcoming, refs);

      expect(upcoming).toEqual([]);
      expect(todayCount).toBe(0);
      expect(weekCount).toBe(0);
      expect(groups.today).toEqual([]);
      expect(groups.tomorrow).toEqual([]);
      expect(groups.thisWeek).toEqual([]);
      expect(groups.nextWeek).toEqual([]);
      expect(groups.later).toEqual([]);
    });
  });
});
