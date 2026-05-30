import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// loadWornHistoryView を制御（real adapters はそのまま使う）。
const { mock } = vi.hoisted(() => ({
  mock: { view: null as unknown, throws: false },
}));
vi.mock("@/lib/shared/wornHistory/readView", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return {
    ...actual,
    loadWornHistoryView: async () => {
      if (mock.throws) throw new Error("read fail");
      return mock.view ?? { entries: [], learningCorpus: [], conflicts: [] };
    },
  };
});

import {
  buildWornHistoryEngineInput,
  getRecentlyWornItemIdsFromRecencyRecords,
  type WornHistoryEntry,
  type WornHistoryView,
} from "@/lib/shared/wornHistory";

function entry(
  p: Partial<WornHistoryEntry> & Pick<WornHistoryEntry, "date" | "source" | "origin">,
): WornHistoryEntry {
  return {
    wornAt: `${p.date}T00:00:00.000Z`,
    itemIds: ["w1"],
    learningEligible: false,
    ...p,
  } as WornHistoryEntry;
}
function view(entries: WornHistoryEntry[], learningCorpus: WornHistoryEntry[]): WornHistoryView {
  return { entries, learningCorpus, conflicts: [] };
}

beforeEach(() => {
  mock.view = null;
  mock.throws = false;
});

describe("buildWornHistoryEngineInput", () => {
  it("knownWardrobeIds が空 / 未指定なら null", async () => {
    mock.view = view(
      [entry({ date: "2026-05-10", source: "engine", origin: "plan", satisfaction: 5 })],
      [entry({ date: "2026-05-10", source: "engine", origin: "plan", satisfaction: 5 })],
    );
    expect(await buildWornHistoryEngineInput({})).toBeNull();
    expect(await buildWornHistoryEngineInput({ knownWardrobeIds: [] })).toBeNull();
  });

  it("readView が空なら null", async () => {
    mock.view = view([], []);
    expect(await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] })).toBeNull();
  });

  it("learning のみある場合に bundle を返す（recency 空）", async () => {
    mock.view = view(
      [entry({ date: "2026-05-11", source: "mock", origin: "plan", itemIds: ["w1"], satisfaction: 5 })], // recency 除外
      [entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1"], satisfaction: 5 })],
    );
    const b = await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] });
    expect(b).not.toBeNull();
    expect(b!.learningRecords).toHaveLength(1);
    expect(b!.recencyRecords).toHaveLength(0);
  });

  it("recency のみある場合に bundle を返す（learning 空）", async () => {
    mock.view = view([entry({ date: "2026-05-12", source: "my_style", origin: "style", itemIds: ["w1"] })], []);
    const b = await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] });
    expect(b).not.toBeNull();
    expect(b!.learningRecords).toHaveLength(0);
    expect(b!.recencyRecords).toHaveLength(1);
  });

  it("learning + recency 両方ある場合に bundle を返す", async () => {
    mock.view = view(
      [
        entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1"], satisfaction: 5 }),
        entry({ date: "2026-05-12", source: "my_style", origin: "style", itemIds: ["w1"] }),
      ],
      [entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1"], satisfaction: 5 })],
    );
    const b = await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] });
    expect(b!.learningRecords).toHaveLength(1);
    expect(b!.recencyRecords).toHaveLength(2);
  });

  it("mock / hydrated_mock / my_style は learning に入らない", async () => {
    const corpus = [
      entry({ date: "2026-05-10", source: "mock", origin: "plan", itemIds: ["w1"], satisfaction: 5 }),
      entry({ date: "2026-05-11", source: "hydrated_mock", origin: "plan", itemIds: ["w1"], satisfaction: 5 }),
      entry({ date: "2026-05-12", source: "my_style", origin: "style", itemIds: ["w1"], satisfaction: 5 }),
    ];
    mock.view = view(corpus, corpus);
    const b = await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] });
    // learning 0、 recency は my_style のみ 1（mock/hydrated_mock は recency も除外）
    expect(b!.learningRecords).toHaveLength(0);
    expect(b!.recencyRecords).toHaveLength(1);
    expect(b!.recencyRecords[0].itemIds).toEqual(["w1"]);
  });

  it("my_style は recency に入る", async () => {
    mock.view = view([entry({ date: "2026-05-12", source: "my_style", origin: "style", itemIds: ["w1"] })], []);
    const b = await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] });
    expect(b!.recencyRecords).toHaveLength(1);
  });

  it("knownWardrobeIds に無い itemId は除外される", async () => {
    mock.view = view(
      [entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1", "ghost"], satisfaction: 5 })],
      [entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1", "ghost"], satisfaction: 5 })],
    );
    const b = await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] });
    // learning は all-must-exist で除外 → 0、 recency は per-item で w1 のみ残る
    expect(b!.learningRecords).toHaveLength(0);
    expect(b!.recencyRecords).toHaveLength(1);
    expect(b!.recencyRecords[0].itemIds).toEqual(["w1"]);
  });

  it("readView 失敗時は null に fallback", async () => {
    mock.throws = true;
    expect(await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] })).toBeNull();
  });

  it("storage write をしない", async () => {
    const g = globalThis as unknown as { localStorage?: Storage };
    const setItem = vi.fn();
    g.localStorage = { getItem: () => null, setItem, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 } as unknown as Storage;
    mock.view = view([entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1"], satisfaction: 5 })], [
      entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1"], satisfaction: 5 }),
    ]);
    await buildWornHistoryEngineInput({ knownWardrobeIds: ["w1"] });
    expect(setItem).not.toHaveBeenCalled();
    delete g.localStorage;
  });
});

describe("getRecentlyWornItemIdsFromRecencyRecords", () => {
  it("referenceDate から 7 日以内の itemIds を返す", () => {
    const ids = getRecentlyWornItemIdsFromRecencyRecords(
      [
        { date: "2026-05-29", itemIds: ["a", "b"] },
        { date: "2026-05-25", itemIds: ["c"] },
      ],
      { referenceDate: "2026-05-29", days: 7 },
    );
    expect(ids.sort()).toEqual(["a", "b", "c"]);
  });

  it("7 日より外は除外", () => {
    const ids = getRecentlyWornItemIdsFromRecencyRecords(
      [
        { date: "2026-05-29", itemIds: ["recent"] },
        { date: "2026-05-20", itemIds: ["old"] }, // cutoff 05-22 より前
      ],
      { referenceDate: "2026-05-29", days: 7 },
    );
    expect(ids).toEqual(["recent"]);
  });

  it("itemIds を dedupe する", () => {
    const ids = getRecentlyWornItemIdsFromRecencyRecords(
      [
        { date: "2026-05-29", itemIds: ["x", "y"] },
        { date: "2026-05-28", itemIds: ["x"] },
      ],
      { referenceDate: "2026-05-29", days: 7 },
    );
    expect(ids.sort()).toEqual(["x", "y"]);
  });

  it("空 records なら空配列", () => {
    expect(getRecentlyWornItemIdsFromRecencyRecords([], { referenceDate: "2026-05-29" })).toEqual([]);
  });
});
