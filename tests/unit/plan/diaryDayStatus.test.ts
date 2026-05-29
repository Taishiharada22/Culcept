import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { saveSelection, type CalendarOutfitSelection } from "@/app/(culcept)/plan/tabs/_calendar-outfit/outfitSelectionStore";
import { saveWorn, rateWornForDate, type PlanWornRecord } from "@/app/(culcept)/plan/tabs/_calendar-outfit/wornStore";
import {
  getDiaryDayStatus,
  buildDiaryStatusMap,
  loadDiaryStatusMap,
} from "@/app/(culcept)/plan/tabs/_calendar-outfit/diaryDayStatus";

// loadDiaryStatusMap は calendar 履歴を facade `@/lib/shared/outfitEngine` の loadWornHistory() 経由で読む
// （read-view が dynamic import）。 テストでは facade を mock して engine を node で起動しない。
const { CAL_RECORDS } = vi.hoisted(() => ({
  CAL_RECORDS: [{ date: "2026-06-01", itemIds: ["c1"], satisfaction: 4 }],
}));
vi.mock("@/lib/shared/outfitEngine", () => ({
  loadWornHistory: () => CAL_RECORDS,
}));

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

// Phase 3-D: read-view backed（plan worn + calendar worn を merge）。 facade は mock 済み。
describe("loadDiaryStatusMap (read-view backed)", () => {
  beforeEach(() => {
    g.localStorage = makeFakeStorage();
  });
  afterEach(() => {
    delete g.localStorage;
  });

  it("calendar worn → rated dot（plan に無くても read-view 経由で反映）", async () => {
    const map = await loadDiaryStatusMap(["2026-06-01"]); // CAL_RECORDS fixture の日付
    expect(map["2026-06-01"]).toBe("rated"); // calendar_form は satisfaction 必須 → rated
  });

  it("plan worn(未評価)→ worn / plan rated → rated", async () => {
    saveWorn(wrn("2026-06-02"));
    saveWorn(wrn("2026-06-03"));
    rateWornForDate("2026-06-03", 5, "t");
    const map = await loadDiaryStatusMap(["2026-06-02", "2026-06-03"]);
    expect(map["2026-06-02"]).toBe("worn");
    expect(map["2026-06-03"]).toBe("rated");
  });

  it("plan selected のみ → selected dot（read-view は worn を持たない）", async () => {
    saveSelection(sel("2026-06-04"));
    const map = await loadDiaryStatusMap(["2026-06-04"]);
    expect(map["2026-06-04"]).toBe("selected");
  });

  it("plan selected + calendar worn(同日)→ rated（worn > selected）", async () => {
    saveSelection(sel("2026-06-01")); // calendar fixture と同日
    const map = await loadDiaryStatusMap(["2026-06-01"]);
    expect(map["2026-06-01"]).toBe("rated");
  });

  it("記録なし → sparse（含めない）", async () => {
    const map = await loadDiaryStatusMap(["2026-06-09"]);
    expect(map["2026-06-09"]).toBeUndefined();
  });

  it("SSR (localStorage なし) → 空 map・throw しない（calendar も読まない）", async () => {
    delete g.localStorage;
    await expect(loadDiaryStatusMap(["2026-06-01"])).resolves.toEqual({});
  });
});
