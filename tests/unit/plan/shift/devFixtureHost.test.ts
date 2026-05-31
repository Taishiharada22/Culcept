import { describe, it, expect } from "vitest";
import {
  isShiftFixtureHostAllowed,
  buildShiftFixture,
  STAGING_PROJECT_REF,
  PRODUCTION_PROJECT_REF,
} from "@/lib/plan/shift/devFixtureHost";

const STAGING_URL = `https://${STAGING_PROJECT_REF}.supabase.co`;
const PROD_URL = `https://${PRODUCTION_PROJECT_REF}.supabase.co`;

describe("isShiftFixtureHostAllowed — 三重ガード（flag + staging allowlist + prod deny）", () => {
  it("fixtureMode=true + staging + 非prod → true", () => {
    expect(
      isShiftFixtureHostAllowed({ fixtureMode: "true", supabaseUrl: STAGING_URL })
    ).toBe(true);
  });

  it("fixtureMode 未設定/false → false（明示 opt-in 必須）", () => {
    expect(
      isShiftFixtureHostAllowed({ fixtureMode: undefined, supabaseUrl: STAGING_URL })
    ).toBe(false);
    expect(
      isShiftFixtureHostAllowed({ fixtureMode: "false", supabaseUrl: STAGING_URL })
    ).toBe(false);
  });

  it("★ production ref を含む → false（fixtureMode=true でも deny）", () => {
    expect(
      isShiftFixtureHostAllowed({ fixtureMode: "true", supabaseUrl: PROD_URL })
    ).toBe(false);
  });

  it("staging ref を含まない → false（allowlist）", () => {
    expect(
      isShiftFixtureHostAllowed({
        fixtureMode: "true",
        supabaseUrl: "https://other-project.supabase.co",
      })
    ).toBe(false);
  });

  it("URL 未設定 → false", () => {
    expect(
      isShiftFixtureHostAllowed({ fixtureMode: "true", supabaseUrl: undefined })
    ).toBe(false);
  });
});

describe("buildShiftFixture — 現在月の匿名 synthetic（/plan 表示可能月）", () => {
  it("now の UTC 年月、3 cells（E-18/H/HREQ）、当月内、今日起点", () => {
    const f = buildShiftFixture(new Date("2025-07-06T00:00:00.000Z"));
    expect(f.year).toBe(2025);
    expect(f.month).toBe(7);
    expect(f.cells).toHaveLength(3);
    expect(f.cells.map((c) => c.rawCode)).toEqual(["E-18", "H", "HREQ"]);
    for (const c of f.cells) expect(c.date.startsWith("2025-07-")).toBe(true);
    expect(f.cells.map((c) => c.day)).toEqual([6, 7, 8]); // 今日(6)起点
  });

  it("月末近く → 当月内に clamp（月跨ぎしない）", () => {
    const f = buildShiftFixture(new Date("2025-07-31T00:00:00.000Z"));
    expect(f.month).toBe(7);
    // monthLen=31, start=min(31, 31-2)=29 → 29,30,31（全て 7月）
    expect(f.cells.map((c) => c.day)).toEqual([29, 30, 31]);
    for (const c of f.cells) expect(c.date.startsWith("2025-07-")).toBe(true);
  });

  it("2月（28日）でも当月内に収まる", () => {
    const f = buildShiftFixture(new Date("2025-02-27T00:00:00.000Z"));
    expect(f.month).toBe(2);
    // monthLen=28, start=min(27, 26)=26 → 26,27,28
    expect(f.cells.map((c) => c.day)).toEqual([26, 27, 28]);
    for (const c of f.cells) expect(c.date.startsWith("2025-02-")).toBe(true);
  });
});
