// tests/unit/calendar/travel/travelLocalStore.test.ts
// Travel UI 内 localStorage 永続化（Phase B）の検証。
//   - helper round-trip / SSR(window なし) no-op / 壊れた JSON fallback / objectURL 写真正規化
//   - ItineraryContext / savedIds / userItems の persistence 契約（store 境界で再現）
//   - 配線 import smoke（ItineraryContext / LocationNotesScreen が travelLocalStore を解決して mount 可能）
// 環境は node（jsdom なし）。browser は localStorage mock を stub、SSR は window undefined を再現。

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TRAVEL_ITINERARY_KEY,
  TRAVEL_SAVED_KEY,
  TRAVEL_NOTES_KEY,
  readItinerary,
  writeItinerary,
  readSavedIds,
  writeSavedIds,
  readUserNotes,
  writeUserNotes,
  type PersistedAddedEntry,
} from "@/app/(culcept)/calendar/_lib/travel/travelLocalStore";
import type { LocationItem, ScheduleItem, TravelPhoto } from "@/app/(culcept)/calendar/_lib/travel/types";

// ── localStorage mock（node 環境には window がないため手動）──
function mockStorage() {
  const store: Record<string, string> = {};
  return {
    _store: store,
    getItem: (k: string): string | null => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  };
}

// ── fixtures ──
function scheduleItem(over: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: "s1",
    startTime: "09:30",
    name: "清水寺",
    categories: ["観光"],
    photo: null,
    ...over,
  };
}
function locationItem(over: Partial<LocationItem> = {}): LocationItem {
  return {
    id: "user-1",
    kind: "spot",
    prefecture: "京都府",
    title: "石塀小路の朝さんぽ",
    areaLabel: "京都市・東山",
    classification: "hidden",
    source: "local",
    author: { name: "あなた", source: "local", roleLabel: "あなたのノート" },
    genre: "自然・散策",
    themeKeys: [],
    tags: [],
    rating: 0,
    ratingCount: 0,
    description: "説明",
    photo: null,
    ...over,
  };
}
const BLOB_PHOTO: TravelPhoto = { source: "user", url: "blob:http://localhost/abc-123", caption: "私の写真" };

describe("travelLocalStore — browser（localStorage 有）", () => {
  let ls: ReturnType<typeof mockStorage>;
  beforeEach(() => {
    ls = mockStorage();
    vi.stubGlobal("window", { localStorage: ls });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // 1. helper round-trip
  describe("round-trip", () => {
    it("★itinerary: write→read で復元（photo=null はそのまま）", () => {
      const entries: PersistedAddedEntry[] = [
        { sourceId: "a", item: scheduleItem({ id: "s-a", name: "A" }) },
        { sourceId: "b", item: scheduleItem({ id: "s-b", name: "B" }) },
      ];
      writeItinerary(entries);
      expect(readItinerary()).toEqual(entries);
    });
    it("★saved: write→read で順序込み復元", () => {
      writeSavedIds(["x", "y", "z"]);
      expect(readSavedIds()).toEqual(["x", "y", "z"]);
    });
    it("★notes: write→read で復元", () => {
      const items = [locationItem({ id: "u1" }), locationItem({ id: "u2", kind: "trip" })];
      writeUserNotes(items);
      expect(readUserNotes()).toEqual(items);
    });
    it("★versioned envelope（v 付き）で保存される", () => {
      writeSavedIds(["x"]);
      const raw = JSON.parse(ls._store[TRAVEL_SAVED_KEY]!);
      expect(raw.v).toBe(1);
      expect(raw.ids).toEqual(["x"]);
    });
  });

  // 3. broken JSON / 不正 shape fallback
  describe("壊れた JSON / 不正 shape → fallback（捏造しない・空へ）", () => {
    it("★壊れた JSON 文字列 → []", () => {
      ls._store[TRAVEL_ITINERARY_KEY] = "{ not valid json";
      expect(readItinerary()).toEqual([]);
      ls._store[TRAVEL_SAVED_KEY] = "<<<";
      expect(readSavedIds()).toEqual([]);
      ls._store[TRAVEL_NOTES_KEY] = "}{";
      expect(readUserNotes()).toEqual([]);
    });
    it("★envelope 不正（added が配列でない / 別型）→ []", () => {
      ls._store[TRAVEL_ITINERARY_KEY] = JSON.stringify({ v: 1, added: "nope" });
      expect(readItinerary()).toEqual([]);
      ls._store[TRAVEL_SAVED_KEY] = JSON.stringify({ v: 1, ids: 42 });
      expect(readSavedIds()).toEqual([]);
      ls._store[TRAVEL_NOTES_KEY] = JSON.stringify(99);
      expect(readUserNotes()).toEqual([]);
    });
    it("★要素単位の defensive normalize（壊れた要素だけ捨てて生存分は残す）", () => {
      ls._store[TRAVEL_ITINERARY_KEY] = JSON.stringify({
        v: 1,
        added: [
          { sourceId: "ok", item: { id: "s-ok", startTime: "09:00", name: "OK", categories: [], photo: null } },
          { sourceId: 123, item: { id: "bad" } }, // sourceId 不正 → drop
          { sourceId: "noitem" }, // item なし → drop
        ],
      });
      const r = readItinerary();
      expect(r).toHaveLength(1);
      expect(r[0]!.sourceId).toBe("ok");
    });
    it("★notes: 必須キー欠落要素は捨てる", () => {
      ls._store[TRAVEL_NOTES_KEY] = JSON.stringify({
        v: 1,
        items: [locationItem({ id: "good" }), { id: "x" /* title/prefecture 欠落 */ }, null],
      });
      const r = readUserNotes();
      expect(r).toHaveLength(1);
      expect(r[0]!.id).toBe("good");
    });
    it("★saved: 非 string 要素は捨てる", () => {
      ls._store[TRAVEL_SAVED_KEY] = JSON.stringify({ v: 1, ids: ["a", 1, null, "b"] });
      expect(readSavedIds()).toEqual(["a", "b"]);
    });
  });

  // 4. objectURL 写真正規化
  describe("objectURL（blob:）写真 → placeholder 正規化（壊れた画像を永続化しない）", () => {
    it("★itinerary item.photo が blob: → 保存時 placeholder（url 消去・label 継承）", () => {
      writeItinerary([{ sourceId: "a", item: scheduleItem({ photo: BLOB_PHOTO }) }]);
      const raw = JSON.parse(ls._store[TRAVEL_ITINERARY_KEY]!);
      const p = raw.added[0].item.photo;
      expect(p.source).toBe("placeholder");
      expect(p.url).toBeUndefined();
      expect(p.label).toBe("私の写真");
    });
    it("★notes item.photo が blob: → read 後も placeholder（読込時も正規化）", () => {
      // 旧バグ等で blob URL が保存されていても、読込時に placeholder へ
      ls._store[TRAVEL_NOTES_KEY] = JSON.stringify({ v: 1, items: [locationItem({ photo: BLOB_PHOTO })] });
      const r = readUserNotes();
      expect(r[0]!.photo!.source).toBe("placeholder");
      expect(r[0]!.photo!.url).toBeUndefined();
    });
    it("★非 blob URL（http/相対）と placeholder/null は保持（正規化対象外）", () => {
      const http: TravelPhoto = { source: "user", url: "https://example.com/p.jpg", caption: "c" };
      const ph: TravelPhoto = { source: "placeholder", label: "清水寺", tone: "temple" };
      writeUserNotes([locationItem({ id: "h", photo: http }), locationItem({ id: "p", photo: ph }), locationItem({ id: "n", photo: null })]);
      const r = readUserNotes();
      expect(r.find((x) => x.id === "h")!.photo).toEqual(http);
      expect(r.find((x) => x.id === "p")!.photo).toEqual(ph);
      expect(r.find((x) => x.id === "n")!.photo).toBeNull();
    });
  });

  // 5. ItineraryContext persistence（契約：add→reload で残る）
  describe("ItineraryContext persistence 契約", () => {
    it("★追加分を write→（reload 相当の）fresh read で復元・順序維持", () => {
      const e1: PersistedAddedEntry = { sourceId: "a", item: scheduleItem({ id: "s-a" }) };
      writeItinerary([e1]);
      const e2: PersistedAddedEntry = { sourceId: "b", item: scheduleItem({ id: "s-b" }) };
      writeItinerary([e1, e2]); // 変更時 persist
      // reload 相当：新規 read
      const restored = readItinerary();
      expect(restored.map((x) => x.sourceId)).toEqual(["a", "b"]);
    });
    it("★空配列保存→read で空（remove ではなく空 envelope）", () => {
      writeItinerary([{ sourceId: "a", item: scheduleItem() }]);
      writeItinerary([]); // 全削除
      expect(readItinerary()).toEqual([]);
    });
  });

  // 6. savedIds / userItems persistence（契約）
  describe("savedIds / userItems persistence 契約", () => {
    it("★savedIds: Set→array→Set round-trip", () => {
      const set = new Set<string>(["k1", "k2"]);
      writeSavedIds([...set]);
      const restored = new Set(readSavedIds());
      expect(restored.has("k1")).toBe(true);
      expect(restored.has("k2")).toBe(true);
      expect(restored.size).toBe(2);
    });
    it("★userItems: 投稿ノートが reload 相当 read で残る", () => {
      writeUserNotes([locationItem({ id: "n1", title: "ノート1" })]);
      const restored = readUserNotes();
      expect(restored).toHaveLength(1);
      expect(restored[0]!.title).toBe("ノート1");
    });
  });
});

// 2. SSR（window なし）no-op
describe("travelLocalStore — SSR（window undefined）", () => {
  beforeEach(() => {
    vi.stubGlobal("window", undefined); // SSR 相当：window 不在
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("★read は fallback（[]）を返しクラッシュしない", () => {
    expect(readItinerary()).toEqual([]);
    expect(readSavedIds()).toEqual([]);
    expect(readUserNotes()).toEqual([]);
  });
  it("★write は no-op（throw しない）", () => {
    expect(() => writeItinerary([{ sourceId: "a", item: scheduleItem() }])).not.toThrow();
    expect(() => writeSavedIds(["x"])).not.toThrow();
    expect(() => writeUserNotes([locationItem()])).not.toThrow();
  });
});

// 配線 import smoke（travelLocalStore を import した状態で component module が解決・mount 可能）
describe("配線 import smoke", () => {
  it("★ItineraryContext module が解決し Provider/hook を export", async () => {
    const mod = await import("@/app/(culcept)/calendar/_components/travel/state/ItineraryContext");
    expect(typeof mod.TravelItineraryProvider).toBe("function");
    expect(typeof mod.useTravelItinerary).toBe("function");
    expect(typeof mod.useMergedSchedule).toBe("function");
  });
  it("★LocationNotesScreen module が解決（default export）", async () => {
    const mod = await import("@/app/(culcept)/calendar/_components/travel/locationNotes/LocationNotesScreen");
    expect(typeof mod.default).toBe("function");
  });
});
