// app/my-style/_lib/calendarBridge.ts
// Bridge between calendar worn-history and my-style wearHistory

import type { SavedState, WearRecord } from "./types";

/* ── Calendar localStorage key (matches rotationTracker.ts) ── */
const CALENDAR_WORN_KEY = "culcept_calendar_worn_v1";

/* ── Calendar WornRecord shape (from calendar/_lib/types.ts) ── */
interface CalendarWornRecord {
    date: string;
    itemIds: string[];
    satisfaction: 1 | 2 | 3 | 4 | 5;
    note?: string;
}

/* ── Public types ── */

export type TodayOutfit = {
    date: string;
    items: Array<{
        id: string;
        name: string;
        category: string;
        colorHex?: string;
        imageUrl?: string;
    }>;
    syncScore?: number;
    syncBand?: string;
    weather?: { temp: number; condition: string };
    scene?: string;
};

// Shape returned by GET /api/calendar/day
interface CalendarDayResponse {
    date: string;
    outfit: {
        id: string;
        outfit_items: Array<{
            card_id: string;
            category: string;
            image_url: string;
            title: string;
            reason: string;
        }> | null;
        weather_input: { temp: number; condition: string } | null;
        scene: string | null;
        style_notes: string | null;
        is_worn: boolean;
        worn_item_ids?: string[] | null;
        sync_snapshot?: { total?: number; band?: string } | null;
    } | null;
    events: unknown[];
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  syncCalendarWornHistory                                                     */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Read calendar's localStorage worn history and merge it into my-style's
 * wearHistory map.  Existing entries are incremented (not replaced) so that
 * records originating from my-style itself are preserved.
 *
 * @param currentState  The current SavedState from my-style localStorage.
 * @returns             A merged wearHistory map ready to be written back.
 */
export function syncCalendarWornHistory(
    currentState: SavedState,
): Record<string, WearRecord> {
    // Start from the existing wearHistory (clone to avoid mutations)
    const merged: Record<string, WearRecord> = {};
    for (const [id, rec] of Object.entries(currentState.wearHistory ?? {})) {
        merged[id] = { ...rec, setupIds: [...(rec.setupIds ?? [])] };
    }

    // Read calendar records from localStorage (client-only)
    let calendarRecords: CalendarWornRecord[] = [];
    try {
        if (typeof window === "undefined") return merged;
        const raw = localStorage.getItem(CALENDAR_WORN_KEY);
        if (!raw) return merged;
        calendarRecords = JSON.parse(raw) as CalendarWornRecord[];
    } catch {
        return merged;
    }

    // Build a set of (itemId, date) pairs already tracked by my-style so we
    // don't double-count the same day if it was already synced before.
    // We use a synthetic setupId of the form "cal:YYYY-MM-DD" to track this.
    const alreadySynced = new Set<string>();
    for (const [, rec] of Object.entries(merged)) {
        for (const sid of rec.setupIds) {
            if (sid.startsWith("cal:")) alreadySynced.add(sid);
        }
    }

    // Merge each calendar worn record
    for (const calRec of calendarRecords) {
        const syntheticId = `cal:${calRec.date}`;

        for (const itemId of calRec.itemIds) {
            // Skip if this exact calendar day was already merged for this item
            if (alreadySynced.has(syntheticId) && merged[itemId]?.setupIds.includes(syntheticId)) {
                continue;
            }

            const existing = merged[itemId];
            if (existing) {
                // Increment count only if this date hasn't been counted yet
                if (!existing.setupIds.includes(syntheticId)) {
                    merged[itemId] = {
                        count: existing.count + 1,
                        lastWornAt:
                            calRec.date > existing.lastWornAt
                                ? calRec.date
                                : existing.lastWornAt,
                        setupIds: [...existing.setupIds, syntheticId],
                    };
                }
            } else {
                merged[itemId] = {
                    count: 1,
                    lastWornAt: calRec.date,
                    setupIds: [syntheticId],
                };
            }
        }
    }

    return merged;
}

/* ──────────────────────────────────────────────────────────────────────────── */
/*  fetchTodayOutfit                                                             */
/* ──────────────────────────────────────────────────────────────────────────── */

/**
 * Fetch today's saved outfit from the calendar API.
 * Returns null when not authenticated (401) or when no outfit exists for today.
 */
export async function fetchTodayOutfit(): Promise<TodayOutfit | null> {
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

    try {
        const res = await fetch(`/api/calendar/day?date=${today}`, {
            // Avoid stale cache — this is shown on a dashboard widget
            cache: "no-store",
        });

        if (res.status === 401) return null;
        if (!res.ok) return null;

        const data: CalendarDayResponse = await res.json();

        if (!data.outfit) return null;

        const { outfit } = data;

        // Map outfit_items array to our TodayOutfit items shape
        const items: TodayOutfit["items"] = (outfit.outfit_items ?? []).map((oi) => ({
            id: oi.card_id,
            name: oi.title,
            category: oi.category,
            imageUrl: oi.image_url || undefined,
        }));

        // If the outfit has worn_item_ids but no outfit_items, we still want
        // to return the date/weather/score so the widget shows something.
        const syncScore =
            typeof outfit.sync_snapshot?.total === "number"
                ? outfit.sync_snapshot.total
                : undefined;
        const syncBand = outfit.sync_snapshot?.band ?? undefined;

        const result: TodayOutfit = {
            date: today,
            items,
            syncScore,
            syncBand,
            scene: outfit.scene ?? undefined,
            weather: outfit.weather_input
                ? {
                      temp: outfit.weather_input.temp,
                      condition: outfit.weather_input.condition,
                  }
                : undefined,
        };

        return result;
    } catch {
        return null;
    }
}
