import { describe, it, expect } from "vitest";

import {
  learningCorpusToWornRecords,
  wornHistoryEntriesToRecencyWornRecords,
  compareWornHistoryLearningInputs,
  type WornHistoryEntry,
  type WornHistoryView,
} from "@/lib/shared/wornHistory";

function entry(p: Partial<WornHistoryEntry> & Pick<WornHistoryEntry, "date" | "source" | "origin">): WornHistoryEntry {
  return {
    wornAt: `${p.date}T00:00:00.000Z`,
    itemIds: ["w1"],
    learningEligible: false,
    ...p,
  } as WornHistoryEntry;
}

describe("learningCorpusToWornRecords", () => {
  it("engine source を WornRecord 互換に変換（date/itemIds/satisfaction のみ）", () => {
    const recs = learningCorpusToWornRecords([
      entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1", "w2"], satisfaction: 5 }),
    ]);
    expect(recs).toHaveLength(1);
    expect(Object.keys(recs[0]).sort()).toEqual(["date", "itemIds", "satisfaction"]);
    expect(recs[0]).toEqual({ date: "2026-05-10", itemIds: ["w1", "w2"], satisfaction: 5 });
  });

  it("calendar_form source も変換できる", () => {
    const recs = learningCorpusToWornRecords([
      entry({ date: "2026-05-11", source: "calendar_form", origin: "calendar", satisfaction: 4 }),
    ]);
    expect(recs).toHaveLength(1);
    expect(recs[0].satisfaction).toBe(4);
  });

  it("mock / hydrated_mock を除外する", () => {
    const recs = learningCorpusToWornRecords([
      entry({ date: "2026-05-12", source: "mock", origin: "plan", satisfaction: 5 }),
      entry({ date: "2026-05-13", source: "hydrated_mock", origin: "plan", satisfaction: 5 }),
    ]);
    expect(recs).toHaveLength(0);
  });

  it("my_style を learning から除外する", () => {
    const recs = learningCorpusToWornRecords([
      entry({ date: "2026-05-14", source: "my_style", origin: "style", satisfaction: 5 }),
    ]);
    expect(recs).toHaveLength(0);
  });

  it("satisfaction が無い entry を除外する", () => {
    const recs = learningCorpusToWornRecords([
      entry({ date: "2026-05-15", source: "engine", origin: "plan" }), // satisfaction なし
    ]);
    expect(recs).toHaveLength(0);
  });

  it("itemIds が空の entry を除外する", () => {
    const recs = learningCorpusToWornRecords([
      entry({ date: "2026-05-16", source: "engine", origin: "plan", itemIds: [], satisfaction: 5 }),
    ]);
    expect(recs).toHaveLength(0);
  });

  it("knownWardrobeIds に不在の itemId を含む record を除外する（combo 完全性）", () => {
    const e = entry({ date: "2026-05-17", source: "engine", origin: "plan", itemIds: ["w1", "ghost"], satisfaction: 5 });
    expect(learningCorpusToWornRecords([e], { knownWardrobeIds: ["w1"] })).toHaveLength(0);
    expect(learningCorpusToWornRecords([e], { knownWardrobeIds: ["w1", "ghost"] })).toHaveLength(1);
  });

  it("note / source / origin / wornAt を出力に載せない", () => {
    const recs = learningCorpusToWornRecords([
      entry({ date: "2026-05-18", source: "engine", origin: "plan", satisfaction: 5 }),
    ]);
    const blob = JSON.stringify(recs[0]);
    expect(blob).not.toContain("source");
    expect(blob).not.toContain("origin");
    expect(blob).not.toContain("wornAt");
    expect(blob).not.toContain("learningEligible");
  });

  it("date 降順で安定", () => {
    const recs = learningCorpusToWornRecords([
      entry({ date: "2026-05-01", source: "engine", origin: "plan", satisfaction: 5 }),
      entry({ date: "2026-05-03", source: "engine", origin: "plan", satisfaction: 5 }),
      entry({ date: "2026-05-02", source: "calendar_form", origin: "calendar", satisfaction: 4 }),
    ]);
    expect(recs.map((r) => r.date)).toEqual(["2026-05-03", "2026-05-02", "2026-05-01"]);
  });
});

describe("wornHistoryEntriesToRecencyWornRecords", () => {
  it("engine / calendar_form / my_style を recency record に変換", () => {
    const recs = wornHistoryEntriesToRecencyWornRecords([
      entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1"], satisfaction: 5 }),
      entry({ date: "2026-05-11", source: "calendar_form", origin: "calendar", itemIds: ["c1"], satisfaction: 4 }),
      entry({ date: "2026-05-12", source: "my_style", origin: "style", itemIds: ["m1"] }), // satisfaction なし
    ]);
    expect(recs.map((r) => r.date)).toEqual(["2026-05-12", "2026-05-11", "2026-05-10"]);
    // my_style は satisfaction なしでも recency に入る（着た事実）
    expect(recs.find((r) => r.date === "2026-05-12")?.itemIds).toEqual(["m1"]);
    expect(recs.find((r) => r.date === "2026-05-12")?.satisfaction).toBeUndefined();
  });

  it("mock / hydrated_mock を recency から除外する", () => {
    const recs = wornHistoryEntriesToRecencyWornRecords([
      entry({ date: "2026-05-13", source: "mock", origin: "plan", satisfaction: 5 }),
      entry({ date: "2026-05-14", source: "hydrated_mock", origin: "plan", satisfaction: 5 }),
    ]);
    expect(recs).toHaveLength(0);
  });

  it("knownWardrobeIds で per-item 絞り込み、 空になった record を除外", () => {
    const recs = wornHistoryEntriesToRecencyWornRecords(
      [
        entry({ date: "2026-05-15", source: "engine", origin: "plan", itemIds: ["w1", "ghost"] }),
        entry({ date: "2026-05-16", source: "engine", origin: "plan", itemIds: ["ghost"] }),
      ],
      { knownWardrobeIds: ["w1"] },
    );
    expect(recs).toHaveLength(1);
    expect(recs[0].date).toBe("2026-05-15");
    expect(recs[0].itemIds).toEqual(["w1"]); // ghost は除外、 w1 のみ残る
  });
});

describe("compareWornHistoryLearningInputs", () => {
  function view(entries: WornHistoryEntry[], learningCorpus: WornHistoryEntry[]): WornHistoryView {
    return { entries, learningCorpus, conflicts: [] };
  }

  it("legacy と shared の件数差分を出せる", () => {
    const corpus = [
      entry({ date: "2026-05-10", source: "engine", origin: "plan", satisfaction: 5 }),
      entry({ date: "2026-05-11", source: "calendar_form", origin: "calendar", satisfaction: 4 }),
    ];
    const summary = compareWornHistoryLearningInputs({
      legacy: [{ date: "2026-05-11", itemIds: ["c1"] }],
      view: view(corpus, corpus),
    });
    expect(summary.legacyCount).toBe(1);
    expect(summary.sharedLearningCount).toBe(2);
    expect(summary.learningDelta).toBe(1);
  });

  it("shared が plan feedback を追加していることを summary", () => {
    const corpus = [entry({ date: "2026-05-10", source: "engine", origin: "plan", satisfaction: 5 })];
    const s = compareWornHistoryLearningInputs({ legacy: [], view: view(corpus, corpus) });
    expect(s.sharedAddsPlanFeedback).toBe(true);
  });

  it("shared が style recency を追加していることを summary", () => {
    const entries = [entry({ date: "2026-05-10", source: "my_style", origin: "style", itemIds: ["m1"] })];
    const s = compareWornHistoryLearningInputs({ legacy: [], view: view(entries, []) });
    expect(s.sharedAddsStyleRecency).toBe(true);
    expect(s.sharedRecencyCount).toBe(1);
  });

  it("my_style は learning に入らず recency だけに入ることを summary", () => {
    const entries = [entry({ date: "2026-05-10", source: "my_style", origin: "style", itemIds: ["m1"], satisfaction: 5 })];
    const s = compareWornHistoryLearningInputs({ legacy: [], view: view(entries, []) });
    expect(s.sharedLearningCount).toBe(0); // learningCorpus 空
    expect(s.sharedRecencyCount).toBe(1); // recency には入る
    expect(s.excludedMyStyleFromLearningCount).toBe(1);
  });

  it("mock を除外カウントする", () => {
    const entries = [
      entry({ date: "2026-05-10", source: "mock", origin: "plan", satisfaction: 5 }),
      entry({ date: "2026-05-11", source: "hydrated_mock", origin: "plan", satisfaction: 5 }),
    ];
    const s = compareWornHistoryLearningInputs({ legacy: [], view: view(entries, []) });
    expect(s.excludedMockCount).toBe(2);
    expect(s.sharedRecencyCount).toBe(0); // mock は recency 対象外
  });

  it("raw note / moodTag / 大量 payload を返さない（counts/boolean のみ）", () => {
    const corpus = [entry({ date: "2026-05-10", source: "engine", origin: "plan", itemIds: ["w1"], satisfaction: 5 })];
    const s = compareWornHistoryLearningInputs({ legacy: [], view: view(corpus, corpus) });
    const keys = Object.keys(s).sort();
    expect(keys).toEqual(
      [
        "excludedMockCount",
        "excludedMyStyleFromLearningCount",
        "learningDelta",
        "legacyCount",
        "recencyDelta",
        "sharedAddsPlanFeedback",
        "sharedAddsStyleRecency",
        "sharedLearningCount",
        "sharedRecencyCount",
      ].sort(),
    );
    // 値はすべて number / boolean（配列・文字列 payload を含まない）
    for (const v of Object.values(s)) {
      expect(["number", "boolean"]).toContain(typeof v);
    }
  });
});
