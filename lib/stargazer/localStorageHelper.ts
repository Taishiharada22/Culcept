/**
 * localStorage safety helpers for Stargazer features.
 *
 * Mobile Safari and low-storage environments throw QuotaExceededError
 * when localStorage is full. These helpers wrap setItem with automatic
 * cleanup of stale stargazer keys so the app degrades gracefully.
 *
 * When stargazer-specific cleanup is not enough, the helpers also
 * remove known expendable keys from other parts of the app (backups,
 * old version keys, orphaned timestamps) before giving up.
 */

const STARGAZER_PREFIX = "stargazer_";
const SG_PREFIX = "sg_";
const CULCEPT_SG_PREFIX = "culcept_sg_";
const ANEURASYNC_SG_PREFIX = "aneurasync_sg_";
const TIMESTAMP_SUFFIX = "__ts";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Specific keys that are always safe to remove when storage is tight.
 *
 * M1-1 (2026-06-01): added `culcept_tryon_history_v1` — observed at ~4.54MB on real device,
 * dominating localStorage quota. Static audit of the current codebase finds **no reader/writer**
 * for this key (try-on UI / api / lib all clean), so it is an orphan from a removed feature.
 * Listing it here lets `ensureStorageSpace` reclaim it on the next quota-recovery pass.
 */
const EXPENDABLE_EXACT_KEYS = [
  "culcept_my_style_v3_backup",
  "culcept_origin_memory_v5",
  "culcept_origin_memory_v6",
  "culcept_tryon_history_v1",
  // M1-2A (2026-06-01): v2 時代の backup snapshot。 D2 で `loadStateBundle` から読込を停止し、
  //   v2 race の素因（quota 失敗 → v3 消失 → v2_backup 復活 → server 上書き）を完全に断つ。
  //   v2 本体 (culcept_my_style_v2) は legacy migration source として残す（CEO 補正・M1-2B で別判断）。
  "culcept_my_style_v2_backup",
];

/** Key suffixes that mark a key as expendable backup data. */
const EXPENDABLE_SUFFIXES = ["_backup"];

/** Pattern for old versioned keys: name_v<N> where N is not the latest. */
const OLD_VERSION_RE = /^(.+)_v(\d+)$/;

/** Check if a key belongs to Stargazer (any prefix variant) */
function isStargazerKey(k: string): boolean {
  return (
    k.startsWith(STARGAZER_PREFIX) ||
    k.startsWith(SG_PREFIX) ||
    k.startsWith(CULCEPT_SG_PREFIX) ||
    k.startsWith(ANEURASYNC_SG_PREFIX)
  );
}

/**
 * Try to set a localStorage item. On QuotaExceededError, purge old
 * stargazer keys (except the one being written) and retry once.
 * If that is not enough, run the more aggressive cross-app cleanup
 * before giving up.
 */
export function safeSetItem(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
    // stamp a last-written timestamp so purgeStaleKeys can age them out
    try {
      localStorage.setItem(key + TIMESTAMP_SUFFIX, String(Date.now()));
    } catch {
      // ignore – timestamp is best-effort
    }
  } catch (err) {
    if (!isQuotaError(err)) return;

    // Step 1: Remove old stargazer keys (not the one we are writing)
    removeOldStargazerKeys(key);
    try {
      localStorage.setItem(key, value);
      return; // success after stargazer cleanup
    } catch {
      // not enough – continue to aggressive cleanup
    }

    // Step 2: Cross-app aggressive cleanup
    ensureStorageSpace();
    try {
      localStorage.setItem(key, value);
    } catch {
      console.warn("[localStorageHelper] quota exceeded even after aggressive cleanup");
    }
  }
}

/**
 * Remove stargazer-related keys whose timestamp is older than 30 days,
 * or that have no timestamp at all (assumed stale).
 */
export function purgeStaleKeys(): void {
  if (typeof window === "undefined") return;
  const now = Date.now();
  const keysToRemove: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k.endsWith(TIMESTAMP_SUFFIX)) continue;
    if (!isStargazerKey(k)) continue;

    const tsRaw = localStorage.getItem(k + TIMESTAMP_SUFFIX);
    if (!tsRaw) {
      // no timestamp → treat as stale
      keysToRemove.push(k);
      continue;
    }
    const ts = Number(tsRaw);
    if (now - ts > THIRTY_DAYS_MS) {
      keysToRemove.push(k);
    }
  }

  for (const k of keysToRemove) {
    localStorage.removeItem(k);
    localStorage.removeItem(k + TIMESTAMP_SUFFIX);
  }
}

/**
 * Proactively free up localStorage space by removing expendable data
 * across the entire app, not just stargazer keys.
 *
 * Cleanup is applied in escalating tiers:
 *  1. Orphaned timestamp keys (no matching base key)
 *  2. Known expendable exact keys + keys ending with `_backup`
 *  3. Old versioned keys (e.g. `_v5` when `_v7` exists)
 *  4. Stale stargazer keys (30+ days old)
 *
 * @param _bytesNeeded  Reserved for future use (currently unused).
 * @returns `true` if at least one key was removed, `false` otherwise.
 */
export function ensureStorageSpace(_bytesNeeded?: number): boolean {
  if (typeof window === "undefined") return false;

  let freedAny = false;

  // Tier 1: orphaned __ts keys
  freedAny = removeOrphanedTimestampKeys() || freedAny;

  // Tier 2: backup keys + known expendable keys
  freedAny = removeBackupKeys() || freedAny;

  // Tier 3: old versioned keys
  freedAny = removeOldVersionKeys() || freedAny;

  // Tier 4: stale stargazer keys (30+ days)
  const before = localStorage.length;
  purgeStaleKeys();
  if (localStorage.length < before) freedAny = true;

  return freedAny;
}

// ── internal ──────────────────────────────────────────────

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
      err.code === 22 ||
      err.code === 1014)
  );
}

function removeOldStargazerKeys(exceptKey: string): void {
  const candidates: { key: string; ts: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k) continue;
    if (k === exceptKey) continue;
    if (k.endsWith(TIMESTAMP_SUFFIX)) continue;
    if (!isStargazerKey(k)) continue;

    const tsRaw = localStorage.getItem(k + TIMESTAMP_SUFFIX);
    candidates.push({ key: k, ts: tsRaw ? Number(tsRaw) : 0 });
  }

  // oldest first
  candidates.sort((a, b) => a.ts - b.ts);

  // remove up to half, minimum 1
  const removeCount = Math.max(1, Math.floor(candidates.length / 2));
  for (let i = 0; i < removeCount && i < candidates.length; i++) {
    localStorage.removeItem(candidates[i].key);
    localStorage.removeItem(candidates[i].key + TIMESTAMP_SUFFIX);
  }
}

/**
 * Remove `__ts` keys whose corresponding base key no longer exists.
 */
function removeOrphanedTimestampKeys(): boolean {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.endsWith(TIMESTAMP_SUFFIX)) continue;
    const baseKey = k.slice(0, -TIMESTAMP_SUFFIX.length);
    if (localStorage.getItem(baseKey) === null) {
      toRemove.push(k);
    }
  }
  for (const k of toRemove) {
    localStorage.removeItem(k);
  }
  return toRemove.length > 0;
}

/**
 * Remove known expendable exact keys and any key ending with `_backup`.
 */
function removeBackupKeys(): boolean {
  let removed = false;

  // exact keys
  for (const k of EXPENDABLE_EXACT_KEYS) {
    if (localStorage.getItem(k) !== null) {
      localStorage.removeItem(k);
      localStorage.removeItem(k + TIMESTAMP_SUFFIX);
      removed = true;
    }
  }

  // suffix-based
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.endsWith(TIMESTAMP_SUFFIX)) continue;
    for (const suffix of EXPENDABLE_SUFFIXES) {
      if (k.endsWith(suffix)) {
        toRemove.push(k);
        break;
      }
    }
  }
  for (const k of toRemove) {
    localStorage.removeItem(k);
    localStorage.removeItem(k + TIMESTAMP_SUFFIX);
    removed = true;
  }

  return removed;
}

/**
 * For versioned keys like `foo_v5`, `foo_v6`, `foo_v7`, remove all but
 * the highest version for each base name.
 */
function removeOldVersionKeys(): boolean {
  // Collect highest version per base name
  const highest = new Map<string, number>();
  const allVersioned: { key: string; base: string; version: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k.endsWith(TIMESTAMP_SUFFIX)) continue;
    const match = OLD_VERSION_RE.exec(k);
    if (!match) continue;
    const base = match[1];
    const version = Number(match[2]);
    allVersioned.push({ key: k, base, version });
    const prev = highest.get(base);
    if (prev === undefined || version > prev) {
      highest.set(base, version);
    }
  }

  let removed = false;
  for (const { key, base, version } of allVersioned) {
    if (version < (highest.get(base) ?? 0)) {
      localStorage.removeItem(key);
      localStorage.removeItem(key + TIMESTAMP_SUFFIX);
      removed = true;
    }
  }

  return removed;
}
