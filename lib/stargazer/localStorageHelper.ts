/**
 * localStorage safety helpers for Stargazer features.
 *
 * Mobile Safari and low-storage environments throw QuotaExceededError
 * when localStorage is full. These helpers wrap setItem with automatic
 * cleanup of stale stargazer keys so the app degrades gracefully.
 */

const STARGAZER_PREFIX = "stargazer_";
const SG_PREFIX = "sg_";
const CULCEPT_SG_PREFIX = "culcept_sg_";
const ANEURASYNC_SG_PREFIX = "aneurasync_sg_";
const TIMESTAMP_SUFFIX = "__ts";
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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
    if (
      err instanceof DOMException &&
      (err.name === "QuotaExceededError" ||
        err.code === 22 ||
        err.code === 1014)
    ) {
      // Remove old stargazer keys (not the one we are writing)
      removeOldStargazerKeys(key);
      try {
        localStorage.setItem(key, value);
      } catch {
        // Still failing – nothing more we can do
        console.warn("[localStorageHelper] quota exceeded even after cleanup");
      }
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

// ── internal ──────────────────────────────────────────────

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
