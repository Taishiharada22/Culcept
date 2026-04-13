/**
 * Rendezvous last-used tab persistence
 *
 * Saves/reads the last visited Rendezvous tab from localStorage
 * so that returning users are routed directly to their last lane.
 */

const STORAGE_KEY = "rendezvous_last_tab_v1";

export type RendezvousTab =
  | "connection"
  | "romance"
  | "partner"
  | "stories"
  | "live";

const VALID_TABS: ReadonlySet<string> = new Set<RendezvousTab>([
  "connection",
  "romance",
  "partner",
  "stories",
  "live",
]);

/** Path mapping for each tab */
export const TAB_PATH: Record<RendezvousTab, string> = {
  connection: "/rendezvous/connection",
  romance: "/rendezvous/romance",
  partner: "/rendezvous/partner",
  stories: "/rendezvous/stories",
  live: "/rendezvous/live",
};

/** Save the last-used tab to localStorage. */
export function saveLastTab(tab: RendezvousTab): void {
  try {
    localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // Storage full or unavailable — silently ignore
  }
}

/** Read the last-used tab from localStorage. Returns null if none saved or invalid. */
export function getLastTab(): RendezvousTab | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && VALID_TABS.has(raw)) {
      return raw as RendezvousTab;
    }
  } catch {
    // SSR or storage unavailable
  }
  return null;
}
