/**
 * shared WornHistory — canonical write store（Phase 4-1: client localStorage IO シェル）
 *
 * 「着用結果の正本」を貯める唯一の write 先（新 key `culcept_worn_history_v1`）。
 * Phase 4-1 では /plan の着用 diary を **shadow mirror** するためだけに使う:
 *   - 旧 key（`culcept_plan_worn_v1` / `culcept_calendar_worn_v1`）には一切触らない。
 *   - read-view はまだ旧 key を読む（= この store はまだ「読まれない」影）。
 *   - この key を消せば Phase 4-1 前の挙動に完全復帰する（rollback 保証）。
 *
 * 厳守（Phase 4-1 禁止事項）:
 *   - server-sync / Supabase / DB / engine / `saveWornRecord` には一切接続しない（pure localStorage のみ）。
 *   - learned 昇格はしない。 `entry.learningEligible` は converter が決めた値をそのまま保存するだけで、
 *     engine はこの store を読まない（昇格は Phase 5 の別ゲート）。
 *   - raw 画像 / base64 / outfit 画像は保存しない（WornHistoryEntry は id / satisfaction / source のみ）。
 *
 * 安全制約（wornStore / readView と同方針）:
 *   - SSR / localStorage 不可 → read は [] / write は no-op（throw しない）。
 *   - 破損 JSON は無視（[]）。 quota error も no-op。
 *   - module top-level で localStorage に触らない（関数内のみ）。
 *   - (date, origin) で idempotent upsert（同日・同 origin の重複を増やさない）。
 */

import type {
  SatisfactionLevel,
  WornHistoryEntry,
  WornHistoryOrigin,
  WornHistorySource,
} from "./types";

/** 着用結果 正本 key（Phase 4 で新設。 旧 plan / calendar key とは別・非衝突）。 */
export const CANONICAL_WORN_HISTORY_KEY = "culcept_worn_history_v1";
/** 保持する最大エントリ数（canonical は履歴を厚めに保持。 plan diary の 60 を下回らせない）。 */
const MAX_CANONICAL_ENTRIES = 365;

const VALID_SOURCES: ReadonlySet<WornHistorySource> = new Set<WornHistorySource>([
  "engine",
  "mock",
  "hydrated_mock",
  "calendar_form",
]);
const VALID_ORIGINS: ReadonlySet<WornHistoryOrigin> = new Set<WornHistoryOrigin>(["plan", "calendar"]);

function getLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function isSatisfactionLevel(v: unknown): v is SatisfactionLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

/** 保存された値が canonical entry として妥当か（破損・異物を弾く）。 */
function isValidEntry(value: unknown): value is WornHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  if (typeof o.date !== "string" || o.date.length === 0) return false;
  if (typeof o.wornAt !== "string") return false;
  if (!Array.isArray(o.itemIds) || !o.itemIds.every((x) => typeof x === "string")) return false;
  if (typeof o.source !== "string" || !VALID_SOURCES.has(o.source as WornHistorySource)) return false;
  if (typeof o.origin !== "string" || !VALID_ORIGINS.has(o.origin as WornHistoryOrigin)) return false;
  if (typeof o.learningEligible !== "boolean") return false;
  if (o.satisfaction !== undefined && !isSatisfactionLevel(o.satisfaction)) return false;
  if (o.ratedAt !== undefined && typeof o.ratedAt !== "string") return false;
  return true;
}

const byDateDesc = (a: { date: string }, b: { date: string }): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0;

/** 全 canonical entry を読む（破損・未存在・SSR は []・date 降順）。 */
export function getCanonicalWornHistoryEntries(): WornHistoryEntry[] {
  const ls = getLocalStorage();
  if (!ls) return [];
  try {
    const raw = ls.getItem(CANONICAL_WORN_HISTORY_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry).sort(byDateDesc);
  } catch {
    return [];
  }
}

/**
 * canonical entry を idempotent に upsert（同 (date, origin) は 1 件に丸める）。
 *   - 同 (date, origin) の既存は置換（重複を増やさない）。
 *   - date 降順・MAX 件で剪定。
 *   - 無効な entry は保存しない（防御）。
 *   - SSR / quota / serialize 失敗は黙って no-op（throw しない）。
 */
export function upsertCanonicalWornHistoryEntry(entry: WornHistoryEntry): void {
  const ls = getLocalStorage();
  if (!ls) return;
  if (!isValidEntry(entry)) return;
  try {
    const others = getCanonicalWornHistoryEntries().filter(
      (e) => !(e.date === entry.date && e.origin === entry.origin),
    );
    const next = [entry, ...others].sort(byDateDesc).slice(0, MAX_CANONICAL_ENTRIES);
    ls.setItem(CANONICAL_WORN_HISTORY_KEY, JSON.stringify(next));
  } catch {
    // quota / serialize → no-op
  }
}

/**
 * 指定日の canonical entry を削除（rollback / 着用取り消し用）。
 *   - origin 指定時はその (date, origin) のみ削除。 省略時はその date の全 origin を削除。
 *   - SSR / quota / 破損は throw せず no-op。
 */
export function clearCanonicalWornHistoryEntryForDate(
  date: string,
  origin?: WornHistoryOrigin,
): void {
  const ls = getLocalStorage();
  if (!ls) return;
  try {
    const remaining = getCanonicalWornHistoryEntries().filter((e) =>
      origin ? !(e.date === date && e.origin === origin) : e.date !== date,
    );
    ls.setItem(CANONICAL_WORN_HISTORY_KEY, JSON.stringify(remaining));
  } catch {
    // no-op
  }
}
