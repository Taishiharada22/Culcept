/**
 * Phase E-4A — Supabase repo flag ON local dogfood readiness / no-remote wiring audit
 *
 * 1) factory flag ON/OFF: 既定(OFF)=fixture/localStorage、ON=Supabase 実装が選ばれる
 * 2) wiring contract: consumer が factory 経由（直 fixture import でない）であることを source で担保
 * 3) fail-soft: auth なし / 0件 / context 不足 で Supabase repo が落ちない（fake client・remote 不触）
 *
 * DB/Supabase remote 不触。jsdom 不使用。
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  getTravelRepository,
  getLocationNotesRepository,
  getTravelPersonalStore,
} from "@/app/(culcept)/calendar/_lib/travel/repository";
import { FixtureTravelRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/fixtureTravelRepository";
import { SupabaseTravelRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseTravelRepository";
import { FixtureLocationNotesRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/fixtureLocationNotesRepository";
import { SupabaseLocationNotesRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseLocationNotesRepository";
import { LocalStorageTravelPersonalStore } from "@/app/(culcept)/calendar/_lib/travel/repository/localStorageTravelPersonalStore";
import { SupabaseTravelPersonalStore } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseTravelPersonalStore";
import { EMPTY_LOCATION_NOTES_DATA } from "@/app/(culcept)/calendar/_lib/travel/locationNotesData";

const FLAG = "NEXT_PUBLIC_PLAN_TRAVEL_SUPABASE_REPO_ENABLED";

// ════════════════════════════════════════════════════════════════════════
// 1) factory flag ON/OFF
// ════════════════════════════════════════════════════════════════════════
describe("repository factory — flag OFF（既定）", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("fixture / localStorage 実装を返す", () => {
    expect(getTravelRepository()).toBeInstanceOf(FixtureTravelRepository);
    expect(getLocationNotesRepository()).toBeInstanceOf(FixtureLocationNotesRepository);
    expect(getTravelPersonalStore()).toBeInstanceOf(LocalStorageTravelPersonalStore);
  });
});

describe("repository factory — flag ON", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("Supabase 実装を返す", () => {
    vi.stubEnv(FLAG, "true");
    expect(getTravelRepository()).toBeInstanceOf(SupabaseTravelRepository);
    expect(getLocationNotesRepository()).toBeInstanceOf(SupabaseLocationNotesRepository);
    expect(getTravelPersonalStore()).toBeInstanceOf(SupabaseTravelPersonalStore);
  });
  it('"true" 以外の値は OFF 扱い（fixture）', () => {
    vi.stubEnv(FLAG, "1");
    expect(getTravelRepository()).toBeInstanceOf(FixtureTravelRepository);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 2) wiring contract（consumer が factory 経由・直 fixture でない）
// ════════════════════════════════════════════════════════════════════════
function src(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}
describe("UI wiring contract（source audit）", () => {
  it("CalendarTab は getTravelRepository 経由（getSampleTripDay を直呼びしない）", () => {
    const s = src("app/(culcept)/plan/tabs/CalendarTab.tsx");
    expect(s).toContain("getTravelRepository()");
    expect(s).not.toContain("getSampleTripDay(");
  });
  it("LocationNotesScreen は LocationNotesRepository + PersonalStore 経由", () => {
    const s = src("app/(culcept)/calendar/_components/travel/locationNotes/LocationNotesScreen.tsx");
    expect(s).toContain("getLocationNotesRepository()");
    expect(s).toContain("getTravelPersonalStore()");
  });
  it("ItineraryContext は PersonalStore + buildAddedEntry 経由", () => {
    const s = src("app/(culcept)/calendar/_components/travel/state/ItineraryContext.tsx");
    expect(s).toContain("getTravelPersonalStore()");
    expect(s).toContain("buildAddedEntry(");
  });
  it("TravelDayDetail は Provider に day/trip 文脈を注入", () => {
    const s = src("app/(culcept)/calendar/_components/travel/TravelDayDetail.tsx");
    expect(s).toContain("currentTripId={trip.id}");
    expect(s).toContain("currentDayId={day.id}");
    expect(s).toContain("currentDate={day.date}");
  });
});

// ════════════════════════════════════════════════════════════════════════
// 3) fail-soft（fake client・remote 不触）
// ════════════════════════════════════════════════════════════════════════
function makeQB(result: { data: unknown; error: unknown }) {
  const qb: Record<string, unknown> = {};
  for (const m of ["select", "eq", "is", "in", "order", "limit", "insert", "upsert", "delete"]) {
    qb[m] = () => qb;
  }
  qb.maybeSingle = () => Promise.resolve(result);
  qb.single = () => Promise.resolve(result);
  qb.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return qb;
}
function fakeClient(opts: { result?: { data: unknown; error: unknown }; user?: { id: string } | null } = {}) {
  const result = opts.result ?? { data: [], error: null };
  const fromCalls: string[] = [];
  const client = {
    from: (t: string) => {
      fromCalls.push(t);
      return makeQB(result);
    },
    auth: { getUser: async () => ({ data: { user: opts.user ?? null } }) },
  } as unknown as SupabaseClient;
  return { client, fromCalls };
}

describe("Supabase repo fail-soft", () => {
  it("LocationNotes 0件 → EMPTY_LOCATION_NOTES_DATA", async () => {
    const { client } = fakeClient({ result: { data: [], error: null } });
    const repo = new SupabaseLocationNotesRepository(client);
    expect(await repo.getLocationNotes("京都府")).toEqual(EMPTY_LOCATION_NOTES_DATA);
  });

  it("LocationNotes error → EMPTY（fail-soft）", async () => {
    const { client } = fakeClient({ result: { data: null, error: { message: "boom" } } });
    const repo = new SupabaseLocationNotesRepository(client);
    expect(await repo.getLocationNotes("京都府")).toEqual(EMPTY_LOCATION_NOTES_DATA);
  });

  it("getTripDay 0件 → null", async () => {
    const { client } = fakeClient({ result: { data: [], error: null }, user: { id: "u1" } });
    const repo = new SupabaseTravelRepository(client);
    expect(await repo.getTripDay("2026-06-24")).toBeNull();
  });

  it("getTripDay 未認証 → null", async () => {
    const { client } = fakeClient({ user: null });
    const repo = new SupabaseTravelRepository(client);
    expect(await repo.getTripDay("2026-06-24")).toBeNull();
  });

  it("readSavedIds 未認証/0件 → []（throw しない）", async () => {
    const { client } = fakeClient({ result: { data: [], error: null } });
    const store = new SupabaseTravelPersonalStore(client);
    expect(await store.readSavedIds()).toEqual([]);
    expect(await store.readAddedEntries()).toEqual([]); // 常に空（getTripDay が source）
  });

  it("writeAddedEntries 未認証 → no-op（throw しない・from を呼ばない）", async () => {
    const { client, fromCalls } = fakeClient({ user: null });
    const store = new SupabaseTravelPersonalStore(client);
    await expect(store.writeAddedEntries([])).resolves.toBeUndefined();
    expect(fromCalls).toEqual([]);
  });

  it("writeAddedEntries: context 不足/非uuid sourceId は skip（insert しない）", async () => {
    const { client, fromCalls } = fakeClient({ user: { id: "u1" }, result: { data: [], error: null } });
    const store = new SupabaseTravelPersonalStore(client);
    await store.writeAddedEntries([
      { sourceId: "kyoto-fixture", item: { id: "added-x", startTime: "", name: "x", categories: [], photo: null }, dayId: "00000000-0000-4000-8000-000000000001" }, // 非uuid sourceId
      { sourceId: "00000000-0000-4000-8000-000000000002", item: { id: "added-y", startTime: "", name: "y", categories: [], photo: null } }, // dayId 無し
    ]);
    // どちらも isWritableAddedEntry=false → from を一切呼ばない＝捏造保存しない
    expect(fromCalls).toEqual([]);
  });
});
