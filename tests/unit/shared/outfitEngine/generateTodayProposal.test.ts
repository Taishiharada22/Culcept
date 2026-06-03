import { vi, describe, it, expect, beforeEach } from "vitest";

// facade の engine 依存を mock し、 generateTodayProposal の A 側注入ロジックだけを検証する。
// getRecentlyWornItemIdsFromRecencyRecords（@/lib/shared/wornHistory/engineInput）は **real**（pure）を使う。
const cap = vi.hoisted(() => ({
  sat: undefined as unknown,
  combo: undefined as unknown,
  gdp: undefined as unknown[] | undefined,
}));
const LEGACY = vi.hoisted(() => ({ records: [] as unknown[] }));

vi.mock("@/app/(culcept)/calendar/_lib/rotationTracker", () => ({
  loadWornHistory: vi.fn(() => LEGACY.records),
  getRecentlyWornItemIds: vi.fn(() => ["legacy-recent"]),
}));
vi.mock("@/app/(culcept)/calendar/_lib/satisfactionLearner", () => ({
  buildSatisfactionProfile: vi.fn((wh: unknown) => {
    cap.sat = wh;
    return { tag: "sat" };
  }),
}));
vi.mock("@/app/(culcept)/calendar/_lib/comboGraph", () => ({
  buildComboGraph: vi.fn((wh: unknown) => {
    cap.combo = wh;
    return { tag: "combo" };
  }),
}));
vi.mock("@/app/(culcept)/calendar/_lib/materialWeather", () => ({
  buildExtendedWeatherContext: vi.fn(() => null),
}));
vi.mock("@/app/(culcept)/calendar/_lib/outfitEngine", () => ({
  generateDayProposal: vi.fn((...args: unknown[]) => {
    cap.gdp = args;
    return { main: { id: "m", sync: { total: 80, band: "good" }, reason: "r", items: [] }, alternatives: [] };
  }),
  clearScoringCache: vi.fn(),
}));

import { generateTodayProposal } from "@/lib/shared/outfitEngine";

const WARDROBE = [{ id: "w1", name: "x", category: "tops", color: "#000" }] as unknown as Parameters<
  typeof generateTodayProposal
>[0]["wardrobe"];

function fiveLearning(prefix: string): { date: string; itemIds: string[]; satisfaction: 5 }[] {
  return Array.from({ length: 5 }, (_, i) => ({
    date: `2026-05-1${i}`,
    itemIds: [`${prefix}${i}`],
    satisfaction: 5,
  }));
}

const BASE = { wardrobe: WARDROBE, date: "2026-05-29", weather: null } as const;

beforeEach(() => {
  cap.sat = undefined;
  cap.combo = undefined;
  cap.gdp = undefined;
  LEGACY.records = fiveLearning("legacy"); // 5 件 → satisfaction(>=3) + combo(>=5) を構築
});

describe("generateTodayProposal — 5-C2 facade gated injection", () => {
  it("wornHistoryInput 無し → 現行 path（loadWornHistory / getRecentlyWornItemIds）", () => {
    const r = generateTodayProposal({ ...BASE });
    expect(r).not.toBeNull();
    expect(cap.sat).toBe(LEGACY.records); // satisfaction は legacy から
    expect(cap.combo).toBe(LEGACY.records);
    expect(cap.gdp![4]).toEqual(["legacy-recent"]); // recentlyWornIds も legacy
  });

  it("learningRecords が渡されたら satisfaction / combo はそこから作られる", () => {
    const learning = fiveLearning("shared");
    generateTodayProposal({ ...BASE, wornHistoryInput: { learningRecords: learning, recencyRecords: [] } });
    expect(cap.sat).toBe(learning); // shared learning records
    expect(cap.combo).toBe(learning);
  });

  it("recencyRecords が渡されたら recentlyWornIds はそこから作られる", () => {
    generateTodayProposal({
      ...BASE,
      wornHistoryInput: { learningRecords: [], recencyRecords: [{ date: "2099-12-31", itemIds: ["r1", "r2"] }] },
    });
    expect((cap.gdp![4] as string[]).sort()).toEqual(["r1", "r2"]); // shared recency（未来日 → cutoff 内）
  });

  it("learningRecords が空なら satisfaction / combo は old path fallback", () => {
    generateTodayProposal({
      ...BASE,
      wornHistoryInput: { learningRecords: [], recencyRecords: [{ date: "2099-12-31", itemIds: ["r1"] }] },
    });
    expect(cap.sat).toBe(LEGACY.records); // learning 空 → loadWornHistory
  });

  it("recencyRecords が空なら recentlyWornIds は old path fallback", () => {
    generateTodayProposal({ ...BASE, wornHistoryInput: { learningRecords: fiveLearning("s"), recencyRecords: [] } });
    expect(cap.gdp![4]).toEqual(["legacy-recent"]); // recency 空 → getRecentlyWornItemIds
  });

  it("既存呼び出し（optional 未指定）が壊れない（TodayProposal を返す）", () => {
    const r = generateTodayProposal({ ...BASE });
    expect(r).not.toBeNull();
    expect(r!.syncScore).toBe(80);
  });

  // ── 5-C3: B側 rotation へ learningRecords を rotationRecords として渡す ──
  it("learningRecords 非空 → extendedOptions.rotationRecords = learningRecords", () => {
    const learning = fiveLearning("shared");
    generateTodayProposal({ ...BASE, wornHistoryInput: { learningRecords: learning, recencyRecords: [] } });
    expect((cap.gdp![8] as { rotationRecords?: unknown }).rotationRecords).toBe(learning);
  });

  it("learningRecords 空 → rotationRecords は渡されない", () => {
    generateTodayProposal({
      ...BASE,
      wornHistoryInput: { learningRecords: [], recencyRecords: [{ date: "2099-12-31", itemIds: ["r1"] }] },
    });
    expect((cap.gdp![8] as { rotationRecords?: unknown }).rotationRecords).toBeUndefined();
  });

  it("wornHistoryInput 無し → rotationRecords は渡されない（現行 path）", () => {
    generateTodayProposal({ ...BASE });
    expect((cap.gdp![8] as { rotationRecords?: unknown }).rotationRecords).toBeUndefined();
  });
});
