import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { saveSelection, type CalendarOutfitSelection } from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitSelectionStore";
import { saveWorn, rateWornForDate, type PlanWornRecord } from "@/app/(culcept)/plan/tabs/_calendar-outfit/wornStore";
import {
  getDiaryDayStatus,
  buildDiaryStatusMap,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/diaryDayStatus";

const g = globalThis as unknown as { localStorage?: Storage };

function makeFakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => Array.from(m.keys())[i] ?? null,
    removeItem: (k: string) => {
      m.delete(k);
    },
    setItem: (k: string, v: string) => {
      m.set(k, String(v));
    },
  } as Storage;
}

function sel(date: string): CalendarOutfitSelection {
  return { date, selectedAt: "t", proposalId: "p", proposalTitle: "T", itemIds: ["i"], itemLabels: ["L"], source: "engine" };
}
function wrn(date: string): PlanWornRecord {
  return { date, wornAt: "t", proposalId: "p", itemIds: ["i"], source: "engine" };
}

describe("diaryDayStatus", () => {
  beforeEach(() => {
    g.localStorage = makeFakeStorage();
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("選択のみ → selected", () => {
    saveSelection(sel("2026-05-01"));
    expect(getDiaryDayStatus("2026-05-01")).toBe("selected");
  });

  it("着用（未評価）→ worn", () => {
    saveWorn(wrn("2026-05-02"));
    expect(getDiaryDayStatus("2026-05-02")).toBe("worn");
  });

  it("着用＋評価 → rated", () => {
    saveWorn(wrn("2026-05-03"));
    rateWornForDate("2026-05-03", 5, "t");
    expect(getDiaryDayStatus("2026-05-03")).toBe("rated");
  });

  it("記録なし → none", () => {
    expect(getDiaryDayStatus("2026-05-09")).toBe("none");
  });

  it("優先度: worn は selected より優先（同日に両方あっても worn）", () => {
    saveSelection(sel("2026-05-04"));
    saveWorn(wrn("2026-05-04"));
    expect(getDiaryDayStatus("2026-05-04")).toBe("worn");
  });

  it("buildDiaryStatusMap は状態のある日だけ sparse に返す", () => {
    saveSelection(sel("2026-05-01"));
    saveWorn(wrn("2026-05-02"));
    saveWorn(wrn("2026-05-03"));
    rateWornForDate("2026-05-03", 2, "t");
    const map = buildDiaryStatusMap(["2026-05-01", "2026-05-02", "2026-05-03", "2026-05-09"]);
    expect(map).toEqual({ "2026-05-01": "selected", "2026-05-02": "worn", "2026-05-03": "rated" });
    expect(map["2026-05-09"]).toBeUndefined(); // none は含めない
  });

  it("SSR (localStorage なし) → none / 空 map、 throw しない", () => {
    delete g.localStorage;
    expect(() => getDiaryDayStatus("2026-05-01")).not.toThrow();
    expect(getDiaryDayStatus("2026-05-01")).toBe("none");
    expect(buildDiaryStatusMap(["2026-05-01"])).toEqual({});
  });
});
