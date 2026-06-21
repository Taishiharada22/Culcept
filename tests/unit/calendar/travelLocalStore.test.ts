import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  TRAVEL_LS_KEYS,
  readJSON,
  writeJSON,
  normalizePhotoForStore,
  readAddedEntries,
  writeAddedEntries,
  readSavedIds,
  writeSavedIds,
  readUserNotes,
  writeUserNotes,
  type StoredAddedEntry,
} from "@/app/(culcept)/calendar/_lib/travel/travelLocalStore";
import type { LocationItem, ScheduleItem, TravelPhoto } from "@/app/(culcept)/calendar/_lib/travel/types";

// ── localStorage モック（Map backed・node env で window を stub）──
function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    _store: store,
  };
}

let mockLS: ReturnType<typeof createMockStorage>;

beforeEach(() => {
  mockLS = createMockStorage();
  vi.stubGlobal("window", { localStorage: mockLS });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

const samplePhotoPlaceholder: TravelPhoto = { source: "placeholder", label: "祇園", tone: "temple" };
const samplePhotoUserBlob: TravelPhoto = { source: "user", url: "blob:http://localhost/abc", caption: "私の写真", tone: "sunset" };

function scheduleItem(id: string, photo: TravelPhoto | null): ScheduleItem {
  return { id, startTime: "", name: `item-${id}`, categories: ["観光"], photo };
}
function locationItem(id: string, photo: TravelPhoto | null): LocationItem {
  return {
    id, kind: "spot", prefecture: "京都府", title: `note-${id}`, areaLabel: "京都市", classification: "standard",
    source: "local", author: { name: "あなた", source: "local" }, genre: "散策", themeKeys: [], tags: [],
    rating: 0, ratingCount: 0, description: "desc", photo,
  };
}

describe("travelLocalStore — readJSON/writeJSON", () => {
  it("round-trips JSON", () => {
    writeJSON("k", { a: 1, b: ["x"] });
    expect(readJSON("k", null)).toEqual({ a: 1, b: ["x"] });
  });

  it("returns fallback for missing key", () => {
    expect(readJSON("missing", { fb: true })).toEqual({ fb: true });
  });

  it("returns fallback for broken JSON (no throw)", () => {
    mockLS.setItem("k", "{not valid json");
    expect(() => readJSON("k", "FALLBACK")).not.toThrow();
    expect(readJSON("k", "FALLBACK")).toBe("FALLBACK");
  });

  it("is a no-op / fallback under SSR (no window)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => writeJSON("k", { a: 1 })).not.toThrow();
    expect(readJSON("k", "SSR")).toBe("SSR");
  });

  it("write is no-op when window absent (does not crash)", () => {
    vi.stubGlobal("window", undefined);
    expect(() => writeJSON(TRAVEL_LS_KEYS.saved, ["a"])).not.toThrow();
  });
});

describe("travelLocalStore — normalizePhotoForStore", () => {
  it("normalizes user blob/objectURL photo to placeholder", () => {
    const n = normalizePhotoForStore(samplePhotoUserBlob);
    expect(n?.source).toBe("placeholder");
    expect(n?.url).toBeUndefined();
    expect(n?.label).toBe("私の写真"); // caption 継承
  });
  it("normalizes user photo without url to placeholder", () => {
    const n = normalizePhotoForStore({ source: "user", caption: "x" });
    expect(n?.source).toBe("placeholder");
  });
  it("passes through placeholder / null / auto(url)", () => {
    expect(normalizePhotoForStore(null)).toBeNull();
    expect(normalizePhotoForStore(samplePhotoPlaceholder)).toEqual(samplePhotoPlaceholder);
    const auto: TravelPhoto = { source: "auto", url: "https://x/y.jpg" };
    expect(normalizePhotoForStore(auto)).toEqual(auto);
  });
});

describe("travelLocalStore — added entries (ItineraryContext persistence)", () => {
  it("persists and restores added entries (cycle)", () => {
    const entries: StoredAddedEntry[] = [
      { sourceId: "s1", item: scheduleItem("added-s1", samplePhotoPlaceholder) },
      { sourceId: "s2", item: scheduleItem("added-s2", null) },
    ];
    writeAddedEntries(entries);
    const back = readAddedEntries();
    expect(back.map((e) => e.sourceId)).toEqual(["s1", "s2"]);
    expect(back[0].item.id).toBe("added-s1");
  });

  it("normalizes objectURL photo on store (no broken img persisted)", () => {
    writeAddedEntries([{ sourceId: "s1", item: scheduleItem("added-s1", samplePhotoUserBlob) }]);
    const back = readAddedEntries();
    expect(back[0].item.photo?.source).toBe("placeholder");
    expect(back[0].item.photo?.url).toBeUndefined();
  });

  it("drops malformed entries defensively", () => {
    mockLS.setItem(TRAVEL_LS_KEYS.itinerary, JSON.stringify([{ sourceId: "ok", item: { id: "i", name: "n", photo: null } }, { bad: 1 }, "junk", { sourceId: 5 }]));
    const back = readAddedEntries();
    expect(back).toHaveLength(1);
    expect(back[0].sourceId).toBe("ok");
  });

  it("returns [] for non-array stored value", () => {
    mockLS.setItem(TRAVEL_LS_KEYS.itinerary, JSON.stringify({ not: "array" }));
    expect(readAddedEntries()).toEqual([]);
  });
});

describe("travelLocalStore — saved ids (savedIds persistence)", () => {
  it("persists and restores saved ids", () => {
    writeSavedIds(["a", "b", "c"]);
    expect(readSavedIds()).toEqual(["a", "b", "c"]);
  });
  it("filters non-string elements", () => {
    mockLS.setItem(TRAVEL_LS_KEYS.saved, JSON.stringify(["a", 1, null, "b", { x: 1 }]));
    expect(readSavedIds()).toEqual(["a", "b"]);
  });
  it("returns [] when unset", () => {
    expect(readSavedIds()).toEqual([]);
  });
});

describe("travelLocalStore — user notes (userItems persistence)", () => {
  it("persists and restores user notes", () => {
    writeUserNotes([locationItem("user-1", samplePhotoPlaceholder)]);
    const back = readUserNotes();
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe("user-1");
    expect(back[0].title).toBe("note-user-1");
  });
  it("normalizes objectURL photo on store", () => {
    writeUserNotes([locationItem("user-1", samplePhotoUserBlob)]);
    expect(readUserNotes()[0].photo?.source).toBe("placeholder");
  });
  it("drops notes missing required fields", () => {
    mockLS.setItem(TRAVEL_LS_KEYS.notes, JSON.stringify([
      { id: "ok", kind: "trip", title: "t", prefecture: "京都府", photo: null },
      { id: "x", title: "no-kind", prefecture: "京都府" },
      { kind: "spot", title: "no-id", prefecture: "京都府" },
    ]));
    const back = readUserNotes();
    expect(back).toHaveLength(1);
    expect(back[0].id).toBe("ok");
  });
});
