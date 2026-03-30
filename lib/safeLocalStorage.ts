/**
 * General-purpose safe localStorage wrapper.
 *
 * Mobile Safari and low-storage environments throw QuotaExceededError
 * when localStorage is full. This helper wraps setItem so callers
 * never crash, and attempts emergency cleanup on quota errors.
 *
 * Usage:
 *   import { safeLSSet } from "@/lib/safeLocalStorage";
 *   safeLSSet("my_key", JSON.stringify(data));
 */

/** Known stale-safe prefixes we can purge when storage is full. */
const PURGEABLE_PREFIXES = [
  "stargazer_",
  "culcept_sg_",
  "sg_",
  "culcept_earth_points_temp",
  "aneurasync_prophecy_",
  "rv_",
] as const;

const TIMESTAMP_SUFFIX = "__ts";

function isQuotaError(err: unknown): boolean {
  return (
    err instanceof DOMException &&
    (err.name === "QuotaExceededError" ||
      (err as { code?: number }).code === 22 ||
      (err as { code?: number }).code === 1014)
  );
}

/**
 * Try to remove old purgeable keys to free space.
 * Removes keys with the oldest __ts timestamps first.
 */
function emergencyCleanup(exceptKey: string): void {
  const candidates: { key: string; ts: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || k === exceptKey || k.endsWith(TIMESTAMP_SUFFIX)) continue;

    const isPurgeable = PURGEABLE_PREFIXES.some((p) => k.startsWith(p));
    if (!isPurgeable) continue;

    const tsRaw = localStorage.getItem(k + TIMESTAMP_SUFFIX);
    candidates.push({ key: k, ts: tsRaw ? Number(tsRaw) : 0 });
  }

  // oldest first
  candidates.sort((a, b) => a.ts - b.ts);

  // remove up to half, minimum 5
  const removeCount = Math.max(5, Math.floor(candidates.length / 2));
  for (let i = 0; i < removeCount && i < candidates.length; i++) {
    localStorage.removeItem(candidates[i].key);
    localStorage.removeItem(candidates[i].key + TIMESTAMP_SUFFIX);
  }
}

/**
 * Safely set a localStorage item. Never throws.
 *
 * On QuotaExceededError, attempts emergency cleanup of known
 * purgeable keys and retries once. If that still fails, logs
 * a warning and returns false.
 *
 * @returns true if the value was stored, false otherwise
 */
export function safeLSSet(key: string, value: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (err) {
    if (!isQuotaError(err)) return false;

    emergencyCleanup(key);
    try {
      localStorage.setItem(key, value);
      return true;
    } catch {
      console.warn(
        `[safeLocalStorage] quota exceeded for "${key}" even after cleanup`,
      );
      return false;
    }
  }
}
