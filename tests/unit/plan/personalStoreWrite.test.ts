/**
 * Phase E-3B — TravelPersonalStore write の pure helper 検証
 *   - diffSaveIds: 保存 reconcile（追加/削除・重複除去）
 *   - buildUserNoteInsertRow: ＋投稿/自分メモ insert payload（private/self_memo/self/写真なし）
 */
import { describe, it, expect } from "vitest";
import {
  diffSaveIds,
  buildUserNoteInsertRow,
  buildSaveRow,
  isUuidLike,
  isWritableAddedEntry,
  buildItineraryItemInsertRow,
} from "@/app/(culcept)/calendar/_lib/travel/repository/personalStoreWrite";
import type { LocationItem } from "@/app/(culcept)/calendar/_lib/travel/types";
import type { StoredAddedEntry } from "@/app/(culcept)/calendar/_lib/travel/travelLocalStore";

const UUID_A = "00000000-0000-4000-8000-000000000001";
const UUID_B = "00000000-0000-4000-8000-000000000002";

describe("diffSaveIds", () => {
  it("追加/削除集合を算出", () => {
    expect(diffSaveIds(["a", "b"], ["b", "c"])).toEqual({ toAdd: ["c"], toRemove: ["a"] });
  });
  it("変化なしは空", () => {
    expect(diffSaveIds(["a"], ["a"])).toEqual({ toAdd: [], toRemove: [] });
  });
  it("全削除", () => {
    expect(diffSaveIds(["a", "b"], [])).toEqual({ toAdd: [], toRemove: ["a", "b"] });
  });
  it("全追加", () => {
    expect(diffSaveIds([], ["x", "y"])).toEqual({ toAdd: ["x", "y"], toRemove: [] });
  });
});

describe("buildSaveRow", () => {
  it("user_id + location_note_id", () => {
    expect(buildSaveRow("u1", "n1")).toEqual({ user_id: "u1", location_note_id: "n1" });
  });
});

describe("buildUserNoteInsertRow", () => {
  const item: LocationItem = {
    id: "user-123", // client id（PK にしない）
    kind: "spot",
    prefecture: "京都府",
    title: "私のメモ",
    areaLabel: "東山",
    classification: "standard",
    source: "traveler",
    author: { name: "あなた", source: "traveler" },
    genre: "カフェ",
    themeKeys: ["quiet-morning"],
    tags: ["静か"],
    rating: 0,
    ratingCount: 0,
    description: "静かな朝に",
    photo: null,
  };
  const row = buildUserNoteInsertRow(item, "uid-1");

  it("固定値: self / self_memo / private / 写真なし / id 付与なし", () => {
    expect(row.user_id).toBe("uid-1");
    expect(row.contributor_type).toBe("self");
    expect(row.source_type).toBe("self_memo");
    expect(row.status).toBe("private");
    expect(row.moderation_status).toBe("none");
    expect(row.photo_id).toBeNull();
    expect(row.id).toBeUndefined(); // client `user-123` を PK にしない
  });

  it("item の内容を反映", () => {
    expect(row.kind).toBe("spot");
    expect(row.prefecture).toBe("京都府");
    expect(row.title).toBe("私のメモ");
    expect(row.area_label).toBe("東山");
    expect(row.theme_keys).toEqual(["quiet-morning"]);
    expect(row.tags).toEqual(["静か"]);
  });

  it("self_memo + private＝check 制約に適合（published を作らない）", () => {
    // source_type='self_memo' のとき status は draft/private のみ許容（DB check）。
    expect(["draft", "private"]).toContain(row.status);
  });
});

// ── E-3C-3: 旅程追加 write helpers ──
describe("isUuidLike", () => {
  it("uuid は true / fixture・user-<ts> は false", () => {
    expect(isUuidLike(UUID_A)).toBe(true);
    expect(isUuidLike("user-1730000000000")).toBe(false);
    expect(isUuidLike("kyoto-trip-1")).toBe(false);
    expect(isUuidLike(undefined)).toBe(false);
    expect(isUuidLike("")).toBe(false);
  });
});

describe("isWritableAddedEntry", () => {
  const base = (over: Partial<StoredAddedEntry>): StoredAddedEntry => ({
    sourceId: UUID_A,
    item: { id: "added-x", startTime: "", name: "x", categories: [], photo: null },
    dayId: UUID_B,
    ...over,
  });
  it("dayId+sourceId が uuid なら true", () => {
    expect(isWritableAddedEntry(base({}))).toBe(true);
  });
  it("dayId 無しは false（context 不足）", () => {
    expect(isWritableAddedEntry(base({ dayId: undefined }))).toBe(false);
  });
  it("sourceId が非 uuid（fixture id）は false（捏造保存しない）", () => {
    expect(isWritableAddedEntry(base({ sourceId: "kyoto-spot-1" }))).toBe(false);
  });
});

describe("buildItineraryItemInsertRow", () => {
  const entry: StoredAddedEntry = {
    sourceId: UUID_A,
    item: { id: "added-x", startTime: "", name: "清水寺", subtitle: "東山", description: "絶景", address: "京都市東山区", categories: ["寺社"], photo: null },
    dayId: UUID_B,
  };
  const row = buildItineraryItemInsertRow(entry, "uid-1", 3);
  it("固定値: user_added / start_time null / photo_id null / source_location_note_id=sourceId", () => {
    expect(row.user_id).toBe("uid-1");
    expect(row.day_id).toBe(UUID_B);
    expect(row.source_kind).toBe("user_added");
    expect(row.start_time).toBeNull();
    expect(row.photo_id).toBeNull();
    expect(row.source_location_note_id).toBe(UUID_A);
    expect(row.sort_order).toBe(3);
  });
  it("item 内容を反映", () => {
    expect(row.name).toBe("清水寺");
    expect(row.subtitle).toBe("東山");
    expect(row.categories).toEqual(["寺社"]);
  });
});
