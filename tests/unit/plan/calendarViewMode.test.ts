/**
 * calendarViewMode — pure state 解決 test（Plan 月ビュー M3-a）
 *
 * + flag default OFF ガード（accidental ON commit 防止）。
 */
import { describe, it, expect } from "vitest";

import {
  DEFAULT_CALENDAR_VIEW_MODE,
  shouldShowCalendarViewToggle,
} from "@/lib/plan/calendarViewMode";
import { PLAN_FLAGS } from "@/lib/plan/featureFlags";

describe("calendarViewMode（pure）", () => {
  it("既定 view は week", () => {
    expect(DEFAULT_CALENDAR_VIEW_MODE).toBe("week");
  });

  it("flag ON → toggle 表示", () => {
    expect(shouldShowCalendarViewToggle(true)).toBe(true);
  });

  it("flag OFF → toggle 非表示", () => {
    expect(shouldShowCalendarViewToggle(false)).toBe(false);
  });
});

describe("PLAN_FLAGS.calendarMonthGridEnabled（commit ガード）", () => {
  it("default OFF（false）", () => {
    expect(PLAN_FLAGS.calendarMonthGridEnabled).toBe(false);
  });
});
