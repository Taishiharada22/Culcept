// lib/storageMigration.ts
// Safe migration of localStorage keys from culcept_* to aneurasync_*
//
// Strategy:
// - On app init, scan for culcept_* keys
// - Copy each to aneurasync_* equivalent (if not already present)
// - Do NOT delete culcept_* keys (they remain as read fallback)
// - Future reads should check aneurasync_* first, then culcept_*
//
// This ensures:
// - Zero data loss for existing users
// - New data goes to aneurasync_* keys
// - Old culcept_* keys are readable indefinitely

const OLD_PREFIX = "culcept_";
const NEW_PREFIX = "aneurasync_";

// Special keys that don't follow the prefix pattern
const SPECIAL_KEY_MAP: Record<string, string> = {
  "culcept-theme": "aneurasync-theme",
};

/**
 * Run once on app startup. Copies culcept_* -> aneurasync_* if new key doesn't exist.
 * Safe to call multiple times (idempotent).
 */
export function migrateStorageKeys(): void {
  if (typeof window === "undefined" || !window.localStorage) return;

  try {
    const migrated = localStorage.getItem("aneurasync_storage_migrated");
    if (migrated === "1") return; // Already done

    const keys = Object.keys(localStorage);
    for (const key of keys) {
      // Handle special keys
      if (SPECIAL_KEY_MAP[key]) {
        const newKey = SPECIAL_KEY_MAP[key];
        if (!localStorage.getItem(newKey)) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            localStorage.setItem(newKey, value);
          }
        }
        continue;
      }

      // Handle prefix keys
      if (key.startsWith(OLD_PREFIX)) {
        const newKey = NEW_PREFIX + key.slice(OLD_PREFIX.length);
        if (!localStorage.getItem(newKey)) {
          const value = localStorage.getItem(key);
          if (value !== null) {
            localStorage.setItem(newKey, value);
          }
        }
      }
    }

    localStorage.setItem("aneurasync_storage_migrated", "1");
  } catch {
    // Storage full or blocked -- silently continue
  }
}

/**
 * Read helper: tries new key first, falls back to old key.
 * Use this instead of direct localStorage.getItem for migrated keys.
 */
export function readMigratedKey(baseKey: string): string | null {
  if (typeof window === "undefined") return null;
  const newKey = baseKey.startsWith(OLD_PREFIX)
    ? NEW_PREFIX + baseKey.slice(OLD_PREFIX.length)
    : baseKey;
  return localStorage.getItem(newKey) ?? localStorage.getItem(baseKey);
}
