// app/(culcept)/calendar/_lib/travel/travelLocalStore.ts
// Travel UI（旅の1日詳細）内側の localStorage 永続化ヘルパー。
//
// 方針（Phase B・CEO 確定 2026-06-21）:
//   - DB / Supabase / migration なし。Travel UI 内の session state を **localStorage だけ**で永続化する。
//   - SSR safe（window 不在で no-op / fallback）・try/catch fail-soft（quota/disabled でも壊れない）。
//   - 壊れた JSON / 不正 shape は fallback（捏造せず空に戻す）。
//   - versioned envelope（{ v, ... }）+ defensive normalize（要素単位で型検証して捨てる）。
//   - objectURL（blob:）写真は reload で無効化されるため、保存・読込時に placeholder/no-photo へ正規化
//     （壊れた画像として永続化しない＝honesty）。
//
// UX-3 gate（isTravelDayDetailEnabled）には一切触れない。これらの関数は TravelDayDetail 配下
// （flag ON 時のみ mount）からのみ呼ばれるため、flag OFF では実行されない＝既存挙動完全不変。

import type { LocationItem, ScheduleItem, TravelPhoto } from "./types";

// ── localStorage keys（既存 draft key aneurasync.travel.locationNotes.draft.v2 は据え置き・本ファイルは触らない）──
export const TRAVEL_ITINERARY_KEY = "aneurasync.travel.itinerary.v1";
export const TRAVEL_SAVED_KEY = "aneurasync.travel.saved.v1";
export const TRAVEL_NOTES_KEY = "aneurasync.travel.notes.v1";

const SCHEMA_VERSION = 1;

// ── SSR safe な低レベル read/write（fail-soft）──
function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readJson<T>(key: string, fallback: T, parse: (data: unknown) => T | null): T {
  if (!isBrowser()) return fallback; // SSR / 非対応環境 → fallback（クラッシュしない）
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    const data = JSON.parse(raw) as unknown; // 壊れた JSON は throw → catch で fallback
    const parsed = parse(data);
    return parsed ?? fallback; // 不正 shape も fallback
  } catch {
    return fallback; // JSON 破損 / storage 無効 / quota → fallback
  }
}

function writeJson(key: string, value: unknown): void {
  if (!isBrowser()) return; // SSR では no-op
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* fail-soft: quota 超過 / storage 無効 → no-op（UX を壊さない） */
  }
}

// ── objectURL 写真の正規化 ──
// blob: URL（URL.createObjectURL）は session 揮発でリロード後は無効＝壊れた画像になる。
// 永続化前後で placeholder（ラベル付き abstract）/ no-photo へ正規化し、壊れた URL を保存・復元しない。
function normalizePersistedPhoto(photo: TravelPhoto | null | undefined): TravelPhoto | null {
  if (!photo) return null;
  if (typeof photo.url === "string" && photo.url.startsWith("blob:")) {
    const label = photo.caption ?? photo.label;
    return { source: "placeholder", tone: photo.tone ?? "neutral", ...(label ? { label } : {}) };
  }
  return photo;
}

// ── 旅程（ItineraryContext.addedItems の永続化）──
export interface PersistedAddedEntry {
  sourceId: string;
  item: ScheduleItem;
}
interface ItineraryEnvelope {
  v: number;
  added: PersistedAddedEntry[];
}

function normalizeScheduleItem(item: ScheduleItem): ScheduleItem {
  return { ...item, photo: normalizePersistedPhoto(item.photo) };
}

function parseItinerary(data: unknown): PersistedAddedEntry[] | null {
  if (data == null || typeof data !== "object") return null;
  const env = data as Partial<ItineraryEnvelope>;
  if (!Array.isArray(env.added)) return null;
  const out: PersistedAddedEntry[] = [];
  for (const e of env.added) {
    if (e == null || typeof e !== "object") continue;
    const entry = e as Partial<PersistedAddedEntry>;
    const item = entry.item;
    if (typeof entry.sourceId !== "string") continue;
    if (item == null || typeof item !== "object" || typeof (item as ScheduleItem).id !== "string") continue;
    out.push({ sourceId: entry.sourceId, item: normalizeScheduleItem(item as ScheduleItem) });
  }
  return out;
}

export function readItinerary(): PersistedAddedEntry[] {
  return readJson<PersistedAddedEntry[]>(TRAVEL_ITINERARY_KEY, [], parseItinerary);
}

export function writeItinerary(added: readonly PersistedAddedEntry[]): void {
  const env: ItineraryEnvelope = {
    v: SCHEMA_VERSION,
    added: added.map((a) => ({ sourceId: a.sourceId, item: normalizeScheduleItem(a.item) })),
  };
  writeJson(TRAVEL_ITINERARY_KEY, env);
}

// ── 保存（heart / savedIds）──
interface SavedEnvelope {
  v: number;
  ids: string[];
}

function parseSaved(data: unknown): string[] | null {
  if (data == null || typeof data !== "object") return null;
  const env = data as Partial<SavedEnvelope>;
  if (!Array.isArray(env.ids)) return null;
  return env.ids.filter((x): x is string => typeof x === "string");
}

export function readSavedIds(): string[] {
  return readJson<string[]>(TRAVEL_SAVED_KEY, [], parseSaved);
}

export function writeSavedIds(ids: readonly string[]): void {
  const env: SavedEnvelope = { v: SCHEMA_VERSION, ids: [...ids] };
  writeJson(TRAVEL_SAVED_KEY, env);
}

// ── 投稿ノート（userItems / LocationItem[]）──
interface NotesEnvelope {
  v: number;
  items: LocationItem[];
}

function normalizeLocationItem(item: LocationItem): LocationItem {
  return { ...item, photo: normalizePersistedPhoto(item.photo) };
}

function parseNotes(data: unknown): LocationItem[] | null {
  if (data == null || typeof data !== "object") return null;
  const env = data as Partial<NotesEnvelope>;
  if (!Array.isArray(env.items)) return null;
  const out: LocationItem[] = [];
  for (const it of env.items) {
    if (it == null || typeof it !== "object") continue;
    const item = it as Partial<LocationItem>;
    // 最低限の必須キーを検証（壊れた要素は捨てる）
    if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.prefecture !== "string") continue;
    out.push(normalizeLocationItem(it as LocationItem));
  }
  return out;
}

export function readUserNotes(): LocationItem[] {
  return readJson<LocationItem[]>(TRAVEL_NOTES_KEY, [], parseNotes);
}

export function writeUserNotes(items: readonly LocationItem[]): void {
  const env: NotesEnvelope = { v: SCHEMA_VERSION, items: items.map(normalizeLocationItem) };
  writeJson(TRAVEL_NOTES_KEY, env);
}
