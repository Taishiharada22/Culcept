/**
 * Tour seen-state manager
 *
 * DB が真実、localStorage はキャッシュ。
 * hydrate 完了まで「未読」判定を返さない（表示を遅延させる）。
 */

// ---------------------------------------------------------------------------
// Tour versions — バージョンが上がると1回だけ再表示
// ---------------------------------------------------------------------------
export const TOUR_VERSIONS: Record<string, number> = {
  home_main: 2,
  home_values: 1,
  // FeatureIntroduction keys (intro + tour are one unit)
  stargazer: 1,
  origin: 1,
  rendezvous: 1,
  "my-style": 1,
  calendar: 1,
  "body-color-avatar": 1,
  "genome-card": 1,
  presence: 1,
  "origin_welcome": 1,
  // Stargazer milestones
  milestone_7: 1,
  milestone_14: 1,
  milestone_30: 1,
  milestone_50: 1,
  milestone_100: 1,
};

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------
type TourStates = Record<string, number>; // tour_key → seen_version

let _cache: TourStates | null = null;
let _hydrating: Promise<TourStates> | null = null;
let _hydrated = false;

const LS_CACHE_KEY = "aneurasync_tour_states_cache";

// ---------------------------------------------------------------------------
// localStorage cache helpers
// ---------------------------------------------------------------------------
function readLSCache(): TourStates {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(LS_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLSCache(states: TourStates) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_CACHE_KEY, JSON.stringify(states));
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Hydrate — fetch all tour states from DB, merge with localStorage cache
// ---------------------------------------------------------------------------
export async function hydrateTourStates(): Promise<TourStates> {
  if (_hydrated && _cache) return _cache;
  if (_hydrating) return _hydrating;

  _hydrating = (async () => {
    // Start with localStorage cache for instant initial state
    const lsCache = readLSCache();

    try {
      const res = await fetch("/api/tour-states", { cache: "no-store" });
      if (!res.ok) {
        // Not logged in or server error — use localStorage only
        _cache = lsCache;
        _hydrated = true;
        return _cache;
      }
      const json = await res.json();
      if (json.ok && json.states) {
        const dbKeyCount = Object.keys(json.states).length;
        const tableMissing = json._tableMissing === true;
        // DB is truth — merge: DB wins over localStorage
        _cache = { ...lsCache, ...json.states };
        writeLSCache(_cache);
        _hydrated = true;
        console.log(
          `[tour] hydrate source: ${tableMissing ? "FALLBACK (table missing)" : "DB truth"}`,
          `| DB keys: ${dbKeyCount}`,
          `| LS keys: ${Object.keys(lsCache).length}`,
          `| merged keys: ${Object.keys(_cache).length}`,
        );
        return _cache;
      }
    } catch {
      // Network error — fallback to localStorage
      console.warn("[tour] hydrate: network error — using localStorage fallback");
    }

    _cache = lsCache;
    _hydrated = true;
    console.warn("[tour] hydrate: using localStorage-only fallback (no DB response)");
    return _cache;
  })();

  return _hydrating;
}

// ---------------------------------------------------------------------------
// Check if tour is seen (call AFTER hydrate)
// ---------------------------------------------------------------------------
export function isHydrated(): boolean {
  return _hydrated;
}

export function isTourSeen(tourKey: string): boolean {
  if (!_hydrated || !_cache) return true; // Not hydrated yet → don't show
  const currentVersion = TOUR_VERSIONS[tourKey] ?? 1;
  const seenVersion = _cache[tourKey] ?? 0;
  return seenVersion >= currentVersion;
}

// ---------------------------------------------------------------------------
// Mark tour as seen (API → read-back → update cache)
// ---------------------------------------------------------------------------
export async function markTourSeen(tourKey: string): Promise<void> {
  const version = TOUR_VERSIONS[tourKey] ?? 1;

  // Optimistic local update
  if (!_cache) _cache = {};
  _cache[tourKey] = version;
  writeLSCache(_cache);

  // Also write legacy localStorage keys for backwards compatibility
  writeLegacyKeys(tourKey);

  try {
    const res = await fetch("/api/tour-states", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tour_key: tourKey, version }),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.ok && json.state) {
        // Read-back: update cache with server-confirmed value
        _cache[json.state.tour_key] = json.state.seen_version;
        writeLSCache(_cache);
      }
    }
  } catch {
    // Network error — localStorage cache already updated
  }
}

// ---------------------------------------------------------------------------
// Legacy localStorage key compat
// Writes old keys so components that haven't been updated still work
// ---------------------------------------------------------------------------
function writeLegacyKeys(tourKey: string) {
  if (typeof window === "undefined") return;
  try {
    if (tourKey === "home_main") {
      localStorage.setItem("aneurasync_home_tour_done_v2", "1");
    } else if (tourKey === "home_values") {
      localStorage.setItem("aneurasync_values_onboarding_done_v1", "1");
    } else {
      // FeatureIntroduction keys
      localStorage.setItem(`aneurasync_guide_${tourKey}_seen`, "1");
      localStorage.setItem(`aneurasync_tabtour_${tourKey}_done`, "1");
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// Reset cache (for testing / logout)
// ---------------------------------------------------------------------------
export function resetTourCache() {
  _cache = null;
  _hydrating = null;
  _hydrated = false;
}

// ---------------------------------------------------------------------------
// Debug helper
// ---------------------------------------------------------------------------
export function debugTourState(tourKey: string): Record<string, unknown> {
  return {
    tourKey,
    currentVersion: TOUR_VERSIONS[tourKey] ?? 1,
    seenVersion: _cache?.[tourKey] ?? 0,
    hydrated: _hydrated,
    isSeen: isTourSeen(tourKey),
    cacheSnapshot: _cache ? { ...(_cache) } : null,
  };
}
