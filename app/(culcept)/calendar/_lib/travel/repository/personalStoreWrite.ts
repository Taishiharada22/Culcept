// app/(culcept)/calendar/_lib/travel/repository/personalStoreWrite.ts
// ════════════════════════════════════════════════════════════════════════
// Phase E-3B: TravelPersonalStore Supabase write の pure helper（DB 非依存・単体テスト可）。
//   - diffSaveIds: 保存(heart) の reconcile（追加/削除集合）
//   - buildUserNoteInsertRow: ＋投稿/自分メモ の insert payload（status private・self_memo・contributor self・写真なし）
// ════════════════════════════════════════════════════════════════════════

import type { LocationItem } from "../types";
import type { StoredAddedEntry } from "../travelLocalStore";

/** 保存集合の差分（重複は除去）。writeSavedIds の reconcile に使う。 */
export function diffSaveIds(
  existing: readonly string[],
  desired: readonly string[]
): { toAdd: string[]; toRemove: string[] } {
  const ex = new Set(existing);
  const de = new Set(desired);
  const toAdd = [...de].filter((id) => !ex.has(id));
  const toRemove = [...ex].filter((id) => !de.has(id));
  return { toAdd, toRemove };
}

/** location_note_saves の insert 行。 */
export function buildSaveRow(uid: string, locationNoteId: string): {
  user_id: string;
  location_note_id: string;
} {
  return { user_id: uid, location_note_id: locationNoteId };
}

/**
 * ＋投稿/自分メモ → location_notes insert 行。
 * 固定: contributor_type='self' / source_type='self_memo' / status='private' / moderation_status='none' / photo_id=null。
 * （published は作らない・self_memo published 不可を維持・写真アップロードしない＝photo_id null）。
 * id は付与しない（DB が gen_random_uuid・client の `user-<ts>` を PK にしない）。
 */
export function buildUserNoteInsertRow(item: LocationItem, uid: string): Record<string, unknown> {
  return {
    user_id: uid,
    kind: item.kind,
    prefecture: item.prefecture,
    title: item.title,
    area_label: item.areaLabel || null,
    description: item.description || null,
    genre: item.genre || null,
    classification: item.classification,
    contributor_type: "self",
    source_type: "self_memo",
    status: "private",
    moderation_status: "none",
    author: item.author ?? null,
    theme_keys: item.themeKeys ?? [],
    tags: item.tags ?? [],
    stops: item.stops ?? null,
    match_reasons: item.matchReasons ?? null,
    rating: item.rating ?? 0,
    rating_count: item.ratingCount ?? 0,
    duration_label: item.durationLabel ?? null,
    tagline: item.tagline ?? null,
    why_special: item.whySpecial ?? null,
    why_hidden: item.whyHidden ?? null,
    spot_count: item.spotCount ?? null,
    match_pct: item.matchPct ?? null,
    hours: item.hours ?? null,
    price_level: item.priceLevel ?? null,
    photo_id: null, // 写真アップロードしない（捏造写真なし）
  };
}

// ── 旅程追加 write（E-3C-3）─────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** DB の uuid として扱える文字列か（fixture/`user-<ts>` id を弾く）。 */
export function isUuidLike(v: string | undefined | null): boolean {
  return typeof v === "string" && UUID_RE.test(v);
}

/**
 * DB write 可能な added entry か。
 * - dayId が uuid（自分の day・所有確認は store 側で RLS select）
 * - sourceId が uuid（location_notes の FK・fixture id は不可＝捏造しない）
 */
export function isWritableAddedEntry(e: StoredAddedEntry): boolean {
  return isUuidLike(e.dayId) && isUuidLike(e.sourceId);
}

/** added entry → travel_itinerary_items insert 行（source_kind='user_added'・写真/時刻なし）。 */
export function buildItineraryItemInsertRow(
  e: StoredAddedEntry,
  uid: string,
  sortOrder: number
): Record<string, unknown> {
  return {
    user_id: uid,
    day_id: e.dayId,
    name: e.item.name,
    subtitle: e.item.subtitle ?? null,
    description: e.item.description ?? null,
    address: e.item.address ?? null,
    categories: e.item.categories ?? [],
    start_time: null, // 時刻未定（後から編集）
    photo_id: null, // 写真アップロードしない
    source_kind: "user_added",
    source_location_note_id: e.sourceId,
    sort_order: sortOrder,
  };
}
