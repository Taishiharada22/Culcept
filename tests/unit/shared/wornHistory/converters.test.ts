import { describe, it, expect } from "vitest";

import {
  planWornRecordToEntry,
  calendarWornRecordToEntry,
  type PlanWornRecordInput,
} from "@/lib/shared/wornHistory";
// type-only import: 実 PlanWornRecord が converter 入力に assignable であることを compile-time で pin
// （直接の runtime 依存は作らない。 storage には一切触れない）
import type { PlanWornRecord } from "@/app/(culcept)/plan/tabs/_calendar-outfit/wornStore";

describe("planWornRecordToEntry", () => {
  it("engine + 評価あり → origin=plan / source=engine / learningEligible=true", () => {
    const rec: PlanWornRecordInput = {
      date: "2026-05-29",
      wornAt: "2026-05-29T20:00:00.000Z",
      itemIds: ["w1", "w2"],
      source: "engine",
      satisfaction: 5,
      ratedAt: "2026-05-29T21:00:00.000Z",
    };
    const e = planWornRecordToEntry(rec);
    expect(e.origin).toBe("plan");
    expect(e.source).toBe("engine");
    expect(e.satisfaction).toBe(5);
    expect(e.wornAt).toBe("2026-05-29T20:00:00.000Z");
    expect(e.ratedAt).toBe("2026-05-29T21:00:00.000Z");
    expect(e.itemIds).toEqual(["w1", "w2"]);
    expect(e.learningEligible).toBe(true);
  });

  it("engine + 未評価 → learningEligible=false / satisfaction undefined", () => {
    const e = planWornRecordToEntry({
      date: "2026-05-29",
      wornAt: "t",
      itemIds: ["w1"],
      source: "engine",
    });
    expect(e.satisfaction).toBeUndefined();
    expect(e.learningEligible).toBe(false);
    expect(e.ratedAt).toBeUndefined(); // ratedAt 未指定 → キー自体を持たない
    expect("ratedAt" in e).toBe(false);
  });

  it("mock は評価ありでも learningEligible=false", () => {
    const e = planWornRecordToEntry({
      date: "2026-05-29",
      wornAt: "t",
      itemIds: ["of-blouse"],
      source: "mock",
      satisfaction: 5,
    });
    expect(e.source).toBe("mock");
    expect(e.learningEligible).toBe(false);
  });

  it("hydrated_mock も learningEligible=false", () => {
    const e = planWornRecordToEntry({
      date: "2026-05-29",
      wornAt: "t",
      itemIds: ["of-blouse"],
      source: "hydrated_mock",
      satisfaction: 4,
    });
    expect(e.learningEligible).toBe(false);
  });

  it("範囲外 satisfaction は undefined に正規化され learningEligible=false", () => {
    const e = planWornRecordToEntry({
      date: "2026-05-29",
      wornAt: "t",
      itemIds: ["w1"],
      source: "engine",
      satisfaction: 7,
    });
    expect(e.satisfaction).toBeUndefined();
    expect(e.learningEligible).toBe(false);
  });

  it("knownWardrobeIds を渡すと実在検証が効く", () => {
    const rec: PlanWornRecordInput = {
      date: "2026-05-29",
      wornAt: "t",
      itemIds: ["w1", "ghost"],
      source: "engine",
      satisfaction: 5,
    };
    expect(planWornRecordToEntry(rec, { knownWardrobeIds: ["w1"] }).learningEligible).toBe(false);
    expect(planWornRecordToEntry(rec, { knownWardrobeIds: ["w1", "ghost"] }).learningEligible).toBe(
      true,
    );
  });

  it("itemIds は防御的にコピーされる（入力配列と同一参照にしない）", () => {
    const ids = ["w1"];
    const e = planWornRecordToEntry({ date: "d", wornAt: "t", itemIds: ids, source: "engine" });
    expect(e.itemIds).toEqual(["w1"]);
    expect(e.itemIds).not.toBe(ids);
  });

  it("contract: 実 PlanWornRecord 型が converter 入力に assignable（compile-time pin）", () => {
    const real: PlanWornRecord = {
      date: "2026-05-29",
      wornAt: "2026-05-29T20:00:00.000Z",
      proposalId: "p1",
      itemIds: ["w1"],
      source: "engine",
      satisfaction: 5,
    };
    const e = planWornRecordToEntry(real);
    expect(e.origin).toBe("plan");
    expect(e.learningEligible).toBe(true);
  });
});

describe("calendarWornRecordToEntry", () => {
  it("origin=calendar / source=calendar_form / wornAt 既定は date 深夜", () => {
    const e = calendarWornRecordToEntry({ date: "2026-05-20", itemIds: ["c1", "c2"], satisfaction: 4 });
    expect(e.origin).toBe("calendar");
    expect(e.source).toBe("calendar_form");
    expect(e.satisfaction).toBe(4);
    expect(e.wornAt).toBe("2026-05-20T00:00:00.000Z");
    expect(e.itemIds).toEqual(["c1", "c2"]);
    expect(e.learningEligible).toBe(true); // calendar_form は eligible 候補
  });

  it("wornAt は opts で上書きできる", () => {
    const e = calendarWornRecordToEntry(
      { date: "2026-05-20", itemIds: ["c1"], satisfaction: 3 },
      { wornAt: "2026-05-20T12:34:00.000Z" },
    );
    expect(e.wornAt).toBe("2026-05-20T12:34:00.000Z");
  });

  it("note は canonical に持ち越さない（最小・privacy-safe）", () => {
    const e = calendarWornRecordToEntry({
      date: "2026-05-20",
      itemIds: ["c1"],
      satisfaction: 5,
      note: "秘密のメモ",
    });
    expect(JSON.stringify(e)).not.toContain("秘密");
  });

  it("knownWardrobeIds を渡すと実在検証が効く", () => {
    const rec = { date: "2026-05-20", itemIds: ["c1"], satisfaction: 5 };
    expect(calendarWornRecordToEntry(rec, { knownWardrobeIds: ["c1"] }).learningEligible).toBe(true);
    expect(calendarWornRecordToEntry(rec, { knownWardrobeIds: ["zzz"] }).learningEligible).toBe(
      false,
    );
  });
});
