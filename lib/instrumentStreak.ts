/**
 * Instrument Streak — tracks daily usage of the 5 core instruments.
 * Uses localStorage with a date key to auto-reset each day.
 */

import { safeLSSet } from "@/lib/safeLocalStorage";

const STORAGE_KEY = "instrument_used_today";

export type InstrumentKey = "stargazer" | "origin" | "phenotype" | "calendar" | "style";

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function readStore(): Record<string, boolean | string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Mark an instrument as used today. Call this on page mount. */
export function markInstrumentUsed(key: InstrumentKey): void {
  if (typeof window === "undefined") return;
  const todayKey = getTodayKey();
  const stored = readStore();
  if (stored._date !== todayKey) {
    // New day — reset
    safeLSSet(STORAGE_KEY, JSON.stringify({ _date: todayKey, [key]: true }));
  } else {
    stored[key] = true;
    safeLSSet(STORAGE_KEY, JSON.stringify(stored));
  }
}

/** Read today's usage state for all instruments */
export function readInstrumentUsage(): Record<InstrumentKey, boolean> {
  const todayKey = getTodayKey();
  const stored = readStore();
  if (stored._date !== todayKey) {
    return { stargazer: false, origin: false, phenotype: false, calendar: false, style: false };
  }
  return {
    stargazer: Boolean(stored.stargazer),
    origin: Boolean(stored.origin),
    phenotype: Boolean(stored.phenotype),
    calendar: Boolean(stored.calendar),
    style: Boolean(stored.style),
  };
}
