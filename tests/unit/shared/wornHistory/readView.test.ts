import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  buildWornHistoryView,
  loadWornHistoryView,
  getLearningCorpus,
  getWornHistoryEntryForDate,
  type BuildWornHistoryViewInput,
  type WornHistoryEntry,
} from "@/lib/shared/wornHistory";

// calendar 履歴は facade `@/lib/shared/outfitEngine` の loadWornHistory() 経由（readView は dynamic import）。
// テストでは facade を mock して engine を node で起動しない（outfitEngineAdapter.test と同方針）。
const { CAL_RECORDS } = vi.hoisted(() => ({
  CAL_RECORDS: [
    { date: "2026-05-20", itemIds: ["c1", "c2"], satisfaction: 4 },
    { date: "2026-05-22", itemIds: ["c3"], satisfaction: 5 },
  ],
}));
vi.mock("@/lib/shared/outfitEngine", () => ({
  loadWornHistory: () => CAL_RECORDS,
}));

const PLAN_KEY = "culcept_plan_worn_v1";
const CANONICAL_KEY = "culcept_worn_history_v1";
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

/** canonical WornHistoryEntry の factory（learningEligible は read 時 recompute されるので任意値でよい）。 */
function canon(date: string, p: Partial<WornHistoryEntry> = {}): WornHistoryEntry {
  return {
    date,
    wornAt: `${date}T20:00:00.000Z`,
    itemIds: ["w1"],
    source: "engine",
    origin: "plan",
    learningEligible: true,
    ...p,
  };
}

// ── pure buildWornHistoryView（storage / mock 非依存） ──────────────
describe("buildWornHistoryView — 変換", () => {
  it("plan engine + 評価 → entries / corpus に入る（origin=plan）", () => {
    const view = buildWornHistoryView({
      planRecords: [
        { date: "2026-05-10", wornAt: "t", itemIds: ["w1"], source: "engine", satisfaction: 5 },
      ],
    });
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].origin).toBe("plan");
    expect(view.learningCorpus).toHaveLength(1);
    expect(view.learningCorpus[0].learningEligible).toBe(true);
  });

  it("calendar 記録 → entries / corpus に入る（origin=calendar / source=calendar_form）", () => {
    const view = buildWornHistoryView({
      calendarRecords: [{ date: "2026-05-11", itemIds: ["c1"], satisfaction: 4 }],
    });
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].origin).toBe("calendar");
    expect(view.entries[0].source).toBe("calendar_form");
    expect(view.learningCorpus).toHaveLength(1);
  });

  it("plan mock / hydrated_mock は entries に出るが corpus には絶対入らない", () => {
    const view = buildWornHistoryView({
      planRecords: [
        { date: "2026-05-12", wornAt: "t", itemIds: ["of-x"], source: "mock", satisfaction: 5 },
        { date: "2026-05-13", wornAt: "t", itemIds: ["of-y"], source: "hydrated_mock", satisfaction: 5 },
      ],
    });
    expect(view.entries).toHaveLength(2);
    expect(view.learningCorpus).toHaveLength(0);
  });

  it("plan 未評価（着ただけ）は corpus に入らない", () => {
    const view = buildWornHistoryView({
      planRecords: [{ date: "2026-05-14", wornAt: "t", itemIds: ["w1"], source: "engine" }],
    });
    expect(view.entries).toHaveLength(1);
    expect(view.learningCorpus).toHaveLength(0);
  });
});

describe("buildWornHistoryView — 同日衝突（plan + calendar）", () => {
  const planEngine = (date: string): BuildWornHistoryViewInput["planRecords"] => [
    { date, wornAt: "t", itemIds: ["w1"], source: "engine", satisfaction: 5 },
  ];

  it("calendar 学習可 + plan 学習可 → use_existing_calendar（calendar 代表・corpus は1件のみ）", () => {
    const view = buildWornHistoryView({
      calendarRecords: [{ date: "2026-05-15", itemIds: ["c1"], satisfaction: 4 }],
      planRecords: planEngine("2026-05-15"),
    });
    expect(view.entries).toHaveLength(1); // 同日は1件に集約
    expect(view.entries[0].origin).toBe("calendar"); // calendar 優先表示
    expect(view.learningCorpus).toHaveLength(1); // 二重計上しない
    expect(view.learningCorpus[0].origin).toBe("calendar");
    expect(view.conflicts).toEqual([
      { date: "2026-05-15", decision: { action: "use_existing_calendar" } },
    ]);
  });

  it("calendar 学習不可（known 除外）+ plan 学習可 → needs_confirmation（corpus 0）", () => {
    const view = buildWornHistoryView({
      calendarRecords: [{ date: "2026-05-16", itemIds: ["ghost"], satisfaction: 4 }],
      planRecords: planEngine("2026-05-16"),
      knownWardrobeIds: ["w1"], // c=ghost は不在 → calendar 不可。 plan w1 は実在 → 可
    });
    expect(view.conflicts[0].decision.action).toBe("needs_confirmation");
    expect(view.learningCorpus).toHaveLength(0); // 自動学習しない
    expect(view.entries[0].origin).toBe("calendar"); // 既存記録を表示
  });

  it("両方学習不可 → skip_learning（corpus 0）", () => {
    const view = buildWornHistoryView({
      calendarRecords: [{ date: "2026-05-17", itemIds: ["ghost"], satisfaction: 4 }],
      planRecords: [
        { date: "2026-05-17", wornAt: "t", itemIds: ["of-x"], source: "mock", satisfaction: 5 },
      ],
      knownWardrobeIds: ["w1"],
    });
    expect(view.conflicts[0].decision.action).toBe("skip_learning");
    expect(view.learningCorpus).toHaveLength(0);
  });
});

describe("buildWornHistoryView — 整列 / 部分集合", () => {
  it("date 降順 / corpus は entries の部分集合", () => {
    const view = buildWornHistoryView({
      planRecords: [
        { date: "2026-05-01", wornAt: "t", itemIds: ["w1"], source: "engine", satisfaction: 5 },
        { date: "2026-05-03", wornAt: "t", itemIds: ["of-x"], source: "mock", satisfaction: 5 },
      ],
      calendarRecords: [{ date: "2026-05-02", itemIds: ["c1"], satisfaction: 4 }],
    });
    expect(view.entries.map((e) => e.date)).toEqual(["2026-05-03", "2026-05-02", "2026-05-01"]);
    expect(view.learningCorpus.map((e) => e.date)).toEqual(["2026-05-02", "2026-05-01"]); // mock 除外
    const dates = new Set(view.entries.map((e) => e.date));
    expect(view.learningCorpus.every((e) => dates.has(e.date))).toBe(true);
  });

  it("空入力 → 空 view（throw しない）", () => {
    expect(buildWornHistoryView()).toEqual({ entries: [], learningCorpus: [], conflicts: [] });
  });
});

describe("buildWornHistoryView — canonical union merge（Phase 4-2）", () => {
  it("canonical なし / 空配列 → 既存挙動と同じ", () => {
    const rec = { date: "2026-05-10", wornAt: "t", itemIds: ["w1"], source: "engine" as const, satisfaction: 5 };
    expect(buildWornHistoryView({ planRecords: [rec] })).toEqual(
      buildWornHistoryView({ planRecords: [rec], canonicalEntries: [] }),
    );
  });

  it("old plan のみの日 → old plan が読まれる", () => {
    const view = buildWornHistoryView({
      planRecords: [{ date: "2026-05-10", wornAt: "t", itemIds: ["old"], source: "engine", satisfaction: 5 }],
      canonicalEntries: [canon("2026-05-11", { itemIds: ["canon"] })],
    });
    expect(view.entries.find((e) => e.date === "2026-05-10")?.itemIds).toEqual(["old"]);
  });

  it("canonical plan のみの日 → canonical plan が読まれる", () => {
    const view = buildWornHistoryView({ canonicalEntries: [canon("2026-05-12", { itemIds: ["canon"] })] });
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].origin).toBe("plan");
    expect(view.entries[0].itemIds).toEqual(["canon"]);
  });

  it("同 (date, plan) が old plan と canonical で重なる → canonical 優先", () => {
    const view = buildWornHistoryView({
      planRecords: [{ date: "2026-05-13", wornAt: "t", itemIds: ["old"], source: "engine", satisfaction: 5 }],
      canonicalEntries: [canon("2026-05-13", { itemIds: ["canon"], satisfaction: 5 })],
    });
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].itemIds).toEqual(["canon"]); // canonical 後勝ち
  });

  it("同 (date, calendar) が old calendar と canonical で重なる → canonical 優先（4-3 前方互換）", () => {
    const view = buildWornHistoryView({
      calendarRecords: [{ date: "2026-05-14", itemIds: ["oldcal"], satisfaction: 4 }],
      canonicalEntries: [
        canon("2026-05-14", { origin: "calendar", source: "calendar_form", itemIds: ["canoncal"], satisfaction: 4 }),
      ],
    });
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].origin).toBe("calendar");
    expect(view.entries[0].itemIds).toEqual(["canoncal"]);
  });

  it("plan + calendar 同日 → 既存 conflictPolicy（calendar 優先）を維持", () => {
    const view = buildWornHistoryView({
      calendarRecords: [{ date: "2026-05-15", itemIds: ["c1"], satisfaction: 4 }],
      canonicalEntries: [canon("2026-05-15", { origin: "plan", itemIds: ["w1"], satisfaction: 5 })],
    });
    expect(view.entries).toHaveLength(1);
    expect(view.entries[0].origin).toBe("calendar"); // calendar 優先は不変
    expect(view.conflicts).toEqual([{ date: "2026-05-15", decision: { action: "use_existing_calendar" } }]);
  });

  it("old plan + canonical plan が重なっても plan conflict は二重に出ない", () => {
    const view = buildWornHistoryView({
      calendarRecords: [{ date: "2026-05-16", itemIds: ["c1"], satisfaction: 4 }],
      planRecords: [{ date: "2026-05-16", wornAt: "t", itemIds: ["old"], source: "engine", satisfaction: 5 }],
      canonicalEntries: [canon("2026-05-16", { origin: "plan", itemIds: ["canon"], satisfaction: 5 })],
    });
    expect(view.conflicts).toHaveLength(1); // plan は old/canonical で 1 枠に collapse
    expect(view.entries.filter((e) => e.date === "2026-05-16")).toHaveLength(1);
  });

  // ── learningCorpus ──
  it("canonical の mock / hydrated_mock は corpus に入らない（read 時 recompute）", () => {
    const view = buildWornHistoryView({
      canonicalEntries: [
        // 保存値が誤って true でも source=mock なら read 時 recompute で除外
        canon("2026-05-17", { source: "mock", satisfaction: 5, learningEligible: true }),
        canon("2026-05-18", { source: "hydrated_mock", satisfaction: 5, learningEligible: true }),
      ],
    });
    expect(view.entries).toHaveLength(2);
    expect(view.learningCorpus).toHaveLength(0);
  });

  it("canonical の engine + 評価 + itemIds は corpus candidate", () => {
    const view = buildWornHistoryView({
      canonicalEntries: [canon("2026-05-19", { source: "engine", satisfaction: 5, itemIds: ["w1"] })],
    });
    expect(view.learningCorpus).toHaveLength(1);
    expect(view.learningCorpus[0].learningEligible).toBe(true);
  });

  it("canonical の calendar_form は corpus candidate", () => {
    const view = buildWornHistoryView({
      canonicalEntries: [
        canon("2026-05-20", { origin: "calendar", source: "calendar_form", satisfaction: 4, itemIds: ["c1"] }),
      ],
    });
    expect(view.learningCorpus).toHaveLength(1);
    expect(view.learningCorpus[0].source).toBe("calendar_form");
  });

  it("corpus は canonical mirror で二重増加しない（old plan == canonical plan）", () => {
    const view = buildWornHistoryView({
      planRecords: [{ date: "2026-05-21", wornAt: "t", itemIds: ["w1"], source: "engine", satisfaction: 5 }],
      canonicalEntries: [canon("2026-05-21", { origin: "plan", source: "engine", satisfaction: 5, itemIds: ["w1"] })],
    });
    expect(view.learningCorpus).toHaveLength(1);
  });

  it("Phase 5 前方互換: knownWardrobeIds 指定時 canonical も read 時 recompute される", () => {
    const view = buildWornHistoryView({
      canonicalEntries: [canon("2026-05-22", { source: "engine", satisfaction: 5, itemIds: ["ghost"], learningEligible: true })],
      knownWardrobeIds: ["real"], // ghost 不在 → recompute で eligible=false
    });
    expect(view.learningCorpus).toHaveLength(0);
    expect(view.entries[0].learningEligible).toBe(false);
  });

  // ── safety ──
  it("unknown origin の canonical entry は安全に無視（throw しない）", () => {
    const view = buildWornHistoryView({
      canonicalEntries: [
        { date: "2026-05-23", wornAt: "t", itemIds: ["x"], source: "engine", origin: "weird" as WornHistoryEntry["origin"], learningEligible: false },
        canon("2026-05-24", { itemIds: ["ok"] }),
      ],
    });
    expect(view.entries.map((e) => e.date)).toEqual(["2026-05-24"]); // weird は除外
  });
});

// ── IO シェル（fake localStorage + facade mock） ───────────────────
describe("loadWornHistoryView / getLearningCorpus（IO・read-only）", () => {
  beforeEach(() => {
    g.localStorage = makeFakeStorage();
  });
  afterEach(() => {
    delete g.localStorage;
  });

  function seedPlan(records: unknown[]): void {
    g.localStorage!.setItem(PLAN_KEY, JSON.stringify(records));
  }
  function seedCanonical(entries: unknown[]): void {
    g.localStorage!.setItem(CANONICAL_KEY, JSON.stringify(entries));
  }

  it("plan(localStorage) + calendar(facade) を merge", async () => {
    seedPlan([
      { date: "2026-05-21", wornAt: "t", proposalId: "p1", itemIds: ["w1"], source: "engine", satisfaction: 5 },
    ]);
    const view = await loadWornHistoryView();
    // plan 1 + calendar 2（mock fixture: 05-20, 05-22）
    expect(view.entries.map((e) => e.date)).toEqual(["2026-05-22", "2026-05-21", "2026-05-20"]);
    expect(view.learningCorpus).toHaveLength(3); // engine + calendar_form ×2
  });

  it("includeCalendar:false → plan のみ（facade を使わない）", async () => {
    seedPlan([
      { date: "2026-05-21", wornAt: "t", itemIds: ["w1"], source: "engine", satisfaction: 5 },
    ]);
    const view = await loadWornHistoryView({ includeCalendar: false });
    expect(view.entries.map((e) => e.date)).toEqual(["2026-05-21"]);
  });

  it("getLearningCorpus は learningEligible のみ（mock 除外）", async () => {
    seedPlan([
      { date: "2026-05-25", wornAt: "t", itemIds: ["of-x"], source: "mock", satisfaction: 5 },
      { date: "2026-05-26", wornAt: "t", itemIds: ["w1"], source: "engine", satisfaction: 5 },
    ]);
    const corpus = await getLearningCorpus({ includeCalendar: false });
    expect(corpus.map((e) => e.date)).toEqual(["2026-05-26"]);
  });

  it("getWornHistoryEntryForDate は代表エントリを返す", async () => {
    seedPlan([
      { date: "2026-05-26", wornAt: "t", itemIds: ["w1"], source: "engine", satisfaction: 5 },
    ]);
    const entry = await getWornHistoryEntryForDate("2026-05-26", { includeCalendar: false });
    expect(entry?.origin).toBe("plan");
    expect(await getWornHistoryEntryForDate("2026-01-01", { includeCalendar: false })).toBeNull();
  });

  it("SSR（localStorage なし）→ 空 view・throw しない・calendar も読まない", async () => {
    delete g.localStorage;
    const view = await loadWornHistoryView();
    expect(view).toEqual({ entries: [], learningCorpus: [], conflicts: [] });
  });

  it("破損 plan JSON → 無視して calendar のみ・throw しない", async () => {
    g.localStorage!.setItem(PLAN_KEY, "{broken");
    const view = await loadWornHistoryView();
    expect(view.entries.map((e) => e.date)).toEqual(["2026-05-22", "2026-05-20"]); // calendar fixture のみ
  });

  // ── canonical（Phase 4-2） ──
  it("canonical(localStorage) も merge し、 同 (date,plan) は canonical 優先", async () => {
    seedPlan([{ date: "2026-05-21", wornAt: "t", itemIds: ["old"], source: "engine", satisfaction: 5 }]);
    seedCanonical([
      canon("2026-05-21", { origin: "plan", itemIds: ["canon"], satisfaction: 5 }),
      canon("2026-05-23", { origin: "plan", itemIds: ["c23"], satisfaction: 5 }),
    ]);
    const view = await loadWornHistoryView({ includeCalendar: false });
    expect(view.entries.map((e) => e.date)).toEqual(["2026-05-23", "2026-05-21"]);
    expect(view.entries.find((e) => e.date === "2026-05-21")?.itemIds).toEqual(["canon"]); // canonical 優先
  });

  it("includeCanonical:false → canonical を無視（4-2 前の挙動・kill switch）", async () => {
    seedPlan([{ date: "2026-05-21", wornAt: "t", itemIds: ["old"], source: "engine", satisfaction: 5 }]);
    seedCanonical([canon("2026-05-23", { origin: "plan", itemIds: ["c23"], satisfaction: 5 })]);
    const view = await loadWornHistoryView({ includeCalendar: false, includeCanonical: false });
    expect(view.entries.map((e) => e.date)).toEqual(["2026-05-21"]); // canonical 05-23 は出ない
  });

  it("破損 canonical JSON → 無視して plan は読める（read-view 全体は落ちない）", async () => {
    seedPlan([{ date: "2026-05-21", wornAt: "t", itemIds: ["w1"], source: "engine", satisfaction: 5 }]);
    g.localStorage!.setItem(CANONICAL_KEY, "{broken");
    const view = await loadWornHistoryView({ includeCalendar: false });
    expect(view.entries.map((e) => e.date)).toEqual(["2026-05-21"]);
  });
});
