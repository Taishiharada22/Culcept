// app/(culcept)/calendar/_lib/travel/travelLocalStore.ts
// Travel UI 内側の localStorage 永続化（Phase B・client-only・DB/Supabase 非依存）。
// SSR 安全（window/localStorage 無しは no-op）・try/catch fail-soft・破損 JSON は fallback・
// versioned shape を defensive normalize。objectURL 由来の user 写真は保存時に placeholder へ正規化
// （reload で壊れた <img> を出さない＝blank/honesty 維持。実写真の永続は Phase F=Supabase Storage）。
//
// UX-3 gate（NEXT_PUBLIC_PLAN_TRAVEL_DAY_DETAIL_ENABLED）には一切関与しない。
// 本ヘルパは TravelDayDetail / Location Notes が mount された後にのみ呼ばれる。

import type { LocationItem, LocationItemKind, ScheduleItem, TravelPhoto } from "./types";

/** versioned localStorage keys（既存規約 aneurasync.<domain>.<name>.vN 準拠）。 */
export const TRAVEL_LS_KEYS = {
  itinerary: "aneurasync.travel.itinerary.v1",
  saved: "aneurasync.travel.saved.v1",
  notes: "aneurasync.travel.notes.v1",
  // 既存（AddView が所有・本ヘルパでは触らない）: aneurasync.travel.locationNotes.draft.v2
} as const;

/** window / localStorage が使えるか（SSR・無効環境で false）。 */
function hasLocalStorage(): boolean {
  try {
    return typeof window !== "undefined" && !!window.localStorage;
  } catch {
    return false;
  }
}

/** JSON を読む。未設定/破損/SSR は fallback。 */
export function readJSON<T>(key: string, fallback: T): T {
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback; // 破損 JSON 等は fallback（throw しない）
  }
}

/** JSON を書く。SSR/quota 失敗は no-op（throw しない）。 */
export function writeJSON(key: string, value: unknown): void {
  if (!hasLocalStorage()) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / serialize 失敗は fail-soft */
  }
}

/**
 * 永続化に向かない写真（user の objectURL / blob:）を placeholder へ正規化。
 * reload 後に無効 URL の <img> を描画しないための防御。placeholder / auto(url有) / null は素通し。
 */
export function normalizePhotoForStore(photo: TravelPhoto | null): TravelPhoto | null {
  if (!photo) return null;
  const ephemeral =
    photo.source === "user" && (!photo.url || photo.url.startsWith("blob:"));
  if (ephemeral) {
    return { source: "placeholder", label: photo.caption ?? photo.label, tone: photo.tone ?? "neutral" };
  }
  return photo;
}

// ── 旅程追加（ItineraryContext.added の正本形）────────────────────────────
export interface StoredAddedEntry {
  sourceId: string;
  item: ScheduleItem;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/** 旅程追加を復元（破損/型不一致要素は捨てる・写真正規化）。 */
export function readAddedEntries(): StoredAddedEntry[] {
  const raw = readJSON<unknown>(TRAVEL_LS_KEYS.itinerary, []);
  if (!Array.isArray(raw)) return [];
  const out: StoredAddedEntry[] = [];
  for (const e of raw) {
    if (!isObj(e) || typeof e.sourceId !== "string" || !isObj(e.item)) continue;
    const item = e.item as unknown as ScheduleItem;
    if (typeof item.id !== "string" || typeof item.name !== "string") continue;
    out.push({ sourceId: e.sourceId, item: { ...item, photo: normalizePhotoForStore(item.photo ?? null) } });
  }
  return out;
}

/** 旅程追加を保存（写真正規化）。 */
export function writeAddedEntries(entries: StoredAddedEntry[]): void {
  writeJSON(
    TRAVEL_LS_KEYS.itinerary,
    entries.map((e) => ({ sourceId: e.sourceId, item: { ...e.item, photo: normalizePhotoForStore(e.item.photo ?? null) } })),
  );
}

// ── 保存(heart) location ids ──────────────────────────────────────────────
export function readSavedIds(): string[] {
  const raw = readJSON<unknown>(TRAVEL_LS_KEYS.saved, []);
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : [];
}

export function writeSavedIds(ids: string[]): void {
  writeJSON(TRAVEL_LS_KEYS.saved, ids);
}

// ── ＋投稿ノート（userItems）───────────────────────────────────────────────
function isKind(v: unknown): v is LocationItemKind {
  return v === "trip" || v === "spot";
}

/** 投稿ノートを復元（必須フィールド検証・写真正規化）。 */
export function readUserNotes(): LocationItem[] {
  const raw = readJSON<unknown>(TRAVEL_LS_KEYS.notes, []);
  if (!Array.isArray(raw)) return [];
  const out: LocationItem[] = [];
  for (const n of raw) {
    if (!isObj(n)) continue;
    if (typeof n.id !== "string" || typeof n.title !== "string" || typeof n.prefecture !== "string" || !isKind(n.kind)) continue;
    const item = n as unknown as LocationItem;
    out.push({ ...item, photo: normalizePhotoForStore(item.photo ?? null) });
  }
  return out;
}

/** 投稿ノートを保存（写真正規化）。 */
export function writeUserNotes(notes: LocationItem[]): void {
  writeJSON(TRAVEL_LS_KEYS.notes, notes.map((n) => ({ ...n, photo: normalizePhotoForStore(n.photo ?? null) })));
}
