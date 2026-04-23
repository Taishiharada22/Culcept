/**
 * Places Handoff L1 Cache — PR-9 commit 4 best-effort optimization
 *
 * 位置づけ:
 *   同一 (userId, queryFingerprint) の Places Text Search を短時間内に
 *   繰り返さないための in-memory L1。quota / latency 削減が目的。
 *
 * CEO 2026-04-23 固定条件:
 *   1. **best-effort optimization only** — cache が効かなくても correctness は壊れない
 *      （すべての get / set は fail-open。throw は絶対に呼び元に伝播させない）
 *   2. **provider_error は cache しない** — 一時的失敗を凍結させない
 *   3. success / zero のみ保存
 *   4. TTL: 300秒（process lifetime 内の短期再利用。session またぎ quota 対策は
 *      必要になった時点で L2 multi-candidate cache を別 commit で追加）
 *   5. LRU 相当の size cap（max 200 entries）— unbounded 成長を防ぐ
 *   6. 書き込み / 読み込み時に期限切れエントリを purge
 *
 * 非責務（本 file では扱わない）:
 *   - DB 永続化（L2 multi-candidate cache は別 commit 以降）
 *   - user 選択結果の resolved place 書き込み（commit 6 の placeCacheStore 連携）
 *   - provider_error のリトライ制御（呼び元 route が判断）
 */

import type { NormalizedPlaceCandidate } from "./normalizedPlace";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type HandoffCacheEntry =
  | {
      kind: "success";
      queryFingerprint: string;
      candidates: ReadonlyArray<NormalizedPlaceCandidate>;
      expiresAtMs: number;
    }
  | {
      kind: "zero";
      queryFingerprint: string;
      expiresAtMs: number;
    };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Config
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const DEFAULT_TTL_MS = 300_000; // 5 min
const MAX_ENTRIES = 200;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Module-local store (process lifetime)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const store: Map<string, HandoffCacheEntry> = new Map();

function buildKey(userId: string, queryFingerprint: string): string {
  return `${userId}::${queryFingerprint}`;
}

function nowMs(): number {
  return Date.now();
}

function purgeIfExpired(key: string, entry: HandoffCacheEntry): boolean {
  if (entry.expiresAtMs <= nowMs()) {
    store.delete(key);
    return true;
  }
  return false;
}

function evictIfOverflow(): void {
  if (store.size <= MAX_ENTRIES) return;
  // Map は insertion order を保つので、先頭（最古）から削る。
  const iter = store.keys();
  while (store.size > MAX_ENTRIES) {
    const next = iter.next();
    if (next.done) break;
    store.delete(next.value);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * cache lookup。hit すれば entry を返す（expired なら null + purge）。
 * 全エラーで null 返却（best-effort）。
 */
export function getHandoffCache(
  userId: string,
  queryFingerprint: string,
): HandoffCacheEntry | null {
  try {
    if (!userId || !queryFingerprint) return null;
    const key = buildKey(userId, queryFingerprint);
    const entry = store.get(key);
    if (!entry) return null;
    if (purgeIfExpired(key, entry)) return null;
    return entry;
  } catch {
    return null;
  }
}

/**
 * cache に success 結果を保存。provider_error は呼ばないこと（caller 責務）。
 * 全エラーで no-op。
 */
export function setHandoffCacheSuccess(
  userId: string,
  queryFingerprint: string,
  candidates: ReadonlyArray<NormalizedPlaceCandidate>,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  try {
    if (!userId || !queryFingerprint) return;
    if (candidates.length === 0) return; // 安全弁: zero は専用 setter 経由で
    const key = buildKey(userId, queryFingerprint);
    // 再 insert で insertion order を末尾へ（LRU 更新近似）
    store.delete(key);
    store.set(key, {
      kind: "success",
      queryFingerprint,
      candidates,
      expiresAtMs: nowMs() + ttlMs,
    });
    evictIfOverflow();
  } catch {
    // no-op
  }
}

/**
 * cache に zero 結果を保存。zero も「同一 query を短期間リトライしない」ため保存する。
 */
export function setHandoffCacheZero(
  userId: string,
  queryFingerprint: string,
  ttlMs: number = DEFAULT_TTL_MS,
): void {
  try {
    if (!userId || !queryFingerprint) return;
    const key = buildKey(userId, queryFingerprint);
    store.delete(key);
    store.set(key, {
      kind: "zero",
      queryFingerprint,
      expiresAtMs: nowMs() + ttlMs,
    });
    evictIfOverflow();
  } catch {
    // no-op
  }
}

/**
 * テスト用: 特定 user のエントリを削除。
 */
export function invalidateHandoffCacheForUser(userId: string): void {
  try {
    const prefix = `${userId}::`;
    for (const key of store.keys()) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  } catch {
    // no-op
  }
}

/**
 * テスト用: 全エントリを削除。
 */
export function __clearHandoffCache(): void {
  store.clear();
}

/**
 * テスト用: 現サイズ。
 */
export function __handoffCacheSize(): number {
  return store.size;
}
