/**
 * CoAlter Phase 1.5.3 ③ — 実所要時間・現実性チェック
 *
 * - カテゴリ別最小滞在時間の取得
 * - tight_gap 警告（滞在時間+バッファより短いギャップ）
 * - packed_day 警告（1日4件以上）
 * - 時刻不明は silent
 */

import { describe, it, expect } from "vitest";
import type { PlanItem } from "@/lib/coalter/planShelf";
import {
  computeRealityWarnings,
  minDurationMinutes,
  warningsForItem,
} from "@/lib/coalter/realityCheck";

function makeItem(
  targetDate: string,
  timeSlot: string | null,
  category: string,
  id: string,
): PlanItem {
  return {
    id,
    threadId: "t",
    sessionId: "s",
    targetDate,
    timeSlot,
    title: `title ${id}`,
    description: "",
    practicalInfo: null,
    url: null,
    category,
    sortOrder: 1,
    createdBy: "user-a",
    createdAt: `${targetDate}T10:00:00.000Z`,
    isExpired: false,
    alternatives: null,
  };
}

describe("minDurationMinutes", () => {
  it("既知カテゴリは定義値", () => {
    expect(minDurationMinutes("food")).toBe(60);
    expect(minDurationMinutes("movie")).toBe(150);
    expect(minDurationMinutes("activity")).toBe(90);
    expect(minDurationMinutes("shopping")).toBe(60);
    expect(minDurationMinutes("travel")).toBe(120);
  });

  it("未知カテゴリは 60 分にフォールバック", () => {
    expect(minDurationMinutes("mystery")).toBe(60);
    expect(minDurationMinutes("other")).toBe(60);
  });
});

describe("computeRealityWarnings", () => {
  it("時刻が重なる/逆転 → tight_gap（時刻が重なっています）", () => {
    const items = [
      makeItem("2026-04-18", "12:00", "food", "a"),
      makeItem("2026-04-18", "12:00", "shopping", "b"),
    ];
    const warnings = computeRealityWarnings(items);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].kind).toBe("tight_gap");
    expect(warnings[0].message).toContain("時刻が重なっています");
    expect(warnings[0].affectedItemIds.sort()).toEqual(["a", "b"]);
  });

  it("映画(150分想定)の直後30分で次が来る → tight_gap", () => {
    const items = [
      makeItem("2026-04-18", "14:00", "movie", "m"),
      makeItem("2026-04-18", "14:30", "food", "f"),
    ];
    const warnings = computeRealityWarnings(items);
    expect(warnings.some((w) => w.kind === "tight_gap")).toBe(true);
  });

  it("食事(60分)後2時間空けば警告なし", () => {
    const items = [
      makeItem("2026-04-18", "12:00", "food", "a"),
      makeItem("2026-04-18", "14:00", "activity", "b"),
    ];
    const warnings = computeRealityWarnings(items);
    expect(warnings.filter((w) => w.kind === "tight_gap")).toHaveLength(0);
  });

  it("時刻不明は silent", () => {
    const items = [
      makeItem("2026-04-18", null, "food", "a"),
      makeItem("2026-04-18", "12:30", "shopping", "b"),
    ];
    const warnings = computeRealityWarnings(items);
    expect(warnings).toHaveLength(0);
  });

  it("1日に4件以上 → packed_day 警告", () => {
    const items = [
      makeItem("2026-04-18", "09:00", "food", "a"),
      makeItem("2026-04-18", "12:00", "shopping", "b"),
      makeItem("2026-04-18", "15:00", "activity", "c"),
      makeItem("2026-04-18", "19:00", "food", "d"),
    ];
    const warnings = computeRealityWarnings(items);
    const packed = warnings.find((w) => w.kind === "packed_day");
    expect(packed).toBeDefined();
    expect(packed?.affectedItemIds.sort()).toEqual(["a", "b", "c", "d"]);
  });

  it("1日に3件以下なら packed_day なし", () => {
    const items = [
      makeItem("2026-04-18", "09:00", "food", "a"),
      makeItem("2026-04-18", "12:00", "shopping", "b"),
      makeItem("2026-04-18", "19:00", "food", "c"),
    ];
    const warnings = computeRealityWarnings(items);
    expect(warnings.filter((w) => w.kind === "packed_day")).toHaveLength(0);
  });

  it("別々の日は独立して判定", () => {
    const items = [
      makeItem("2026-04-18", "12:00", "food", "a"),
      makeItem("2026-04-18", "12:00", "shopping", "b"), // 同日 tight
      makeItem("2026-04-19", "12:00", "food", "c"), // 単独
    ];
    const warnings = computeRealityWarnings(items);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].date).toBe("2026-04-18");
  });

  it("空配列なら空配列", () => {
    expect(computeRealityWarnings([])).toEqual([]);
  });
});

describe("warningsForItem", () => {
  it("特定 id に紐付く警告だけ抽出", () => {
    const items = [
      makeItem("2026-04-18", "14:00", "movie", "m"),
      makeItem("2026-04-18", "14:30", "food", "f"),
    ];
    const warnings = computeRealityWarnings(items);
    expect(warningsForItem(warnings, "m")).toHaveLength(1);
    expect(warningsForItem(warnings, "f")).toHaveLength(1);
    expect(warningsForItem(warnings, "none")).toHaveLength(0);
  });
});
