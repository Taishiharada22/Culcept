/**
 * Phase E-1 smoke — LocationNotesRepository / TravelPersonalStore 境界の単体検証
 *
 * 検証:
 *   - FixtureLocationNotesRepository.getLocationNotes: 京都府は items を返す / 未整備県は空メタ
 *     （都道府県候補は維持＝honesty）
 *   - getLocationNotesRepository(): flag OFF（既定）で Fixture 実装
 *   - getTravelPersonalStore(): flag OFF（既定）で LocalStorage 実装
 *   - LocalStorageTravelPersonalStore: node（window なし＝SSR 相当）で throw せず空を返す（fail-soft）
 *   - Supabase skeleton（LocationNotes / PersonalStore）: 全メソッド NotImplemented を throw（実DB接続なし）
 *
 * pure（node・DOM 不要）。localStorage round-trip 本体は tests/unit/calendar/travelLocalStore.test.ts が担保。
 */
import { describe, it, expect } from "vitest";
import { FixtureLocationNotesRepository } from "@/app/(culcept)/calendar/_lib/travel/repository/fixtureLocationNotesRepository";
import { LocalStorageTravelPersonalStore } from "@/app/(culcept)/calendar/_lib/travel/repository/localStorageTravelPersonalStore";
import { SupabaseTravelPersonalStore } from "@/app/(culcept)/calendar/_lib/travel/repository/supabaseTravelPersonalStore";
import {
  getLocationNotesRepository,
  getTravelPersonalStore,
  TravelRepositoryNotImplementedError,
} from "@/app/(culcept)/calendar/_lib/travel/repository";

describe("FixtureLocationNotesRepository.getLocationNotes", () => {
  const repo = new FixtureLocationNotesRepository();

  it("京都府は items を返す（候補に京都府を含む）", async () => {
    const data = await repo.getLocationNotes("京都府");
    expect(data.items.length).toBeGreaterThan(0);
    expect(data.prefectures).toContain("京都府");
    expect(data.themes.length).toBeGreaterThan(0);
  });

  it("未整備県は空メタ（items/themes 空・候補は維持）", async () => {
    const data = await repo.getLocationNotes("未整備県xyz");
    expect(data.items).toEqual([]);
    expect(data.themes).toEqual([]);
    expect(data.prefectures).toContain("京都府"); // 都道府県候補は残る
  });
});

describe("factory（flag OFF 既定）", () => {
  it("getLocationNotesRepository は Fixture 実装", () => {
    expect(getLocationNotesRepository()).toBeInstanceOf(FixtureLocationNotesRepository);
  });
  it("getTravelPersonalStore は LocalStorage 実装", () => {
    expect(getTravelPersonalStore()).toBeInstanceOf(LocalStorageTravelPersonalStore);
  });
});

describe("LocalStorageTravelPersonalStore（node＝SSR 相当・window なし）", () => {
  const store = new LocalStorageTravelPersonalStore();

  it("read 系は throw せず空を返す（fail-soft）", async () => {
    expect(await store.readAddedEntries()).toEqual([]);
    expect(await store.readSavedIds()).toEqual([]);
    expect(await store.readUserNotes()).toEqual([]);
  });

  it("write 系は throw せず resolve（no-op）", async () => {
    await expect(store.writeAddedEntries([])).resolves.toBeUndefined();
    await expect(store.writeSavedIds([])).resolves.toBeUndefined();
    await expect(store.writeUserNotes([])).resolves.toBeUndefined();
  });
});

// 注: SupabaseLocationNotesRepository.getLocationNotes / SupabaseTravelPersonalStore の
// saved・userNotes は E-3A/E-3B で実装済。実DB は *.it.test.ts（opt-in）が担保。
describe("Supabase PersonalStore — 旅程追加のみ API gap（day_id 不在）で NotImplemented throw", () => {
  it("readAddedEntries / writeAddedEntries は NotImplemented（day_id 不在の API gap）", async () => {
    const s = new SupabaseTravelPersonalStore();
    await expect(s.readAddedEntries()).rejects.toBeInstanceOf(TravelRepositoryNotImplementedError);
    await expect(s.writeAddedEntries([])).rejects.toBeInstanceOf(TravelRepositoryNotImplementedError);
  });
});
