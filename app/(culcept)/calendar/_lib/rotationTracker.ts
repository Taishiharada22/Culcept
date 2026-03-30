import type { WornRecord } from "./types";

const WORN_KEY = "culcept_calendar_worn_v1";
const SESSION_WORN_KEY = `${WORN_KEY}_session`;
const MAX_WORN_HISTORY = 90;
const MAX_ITEM_IDS = 12;
const MAX_NOTE_LENGTH = 240;

type NoteMode = "full" | "tags" | "none";

let memoryWornHistory: WornRecord[] = [];

function getStorage(kind: "local" | "session"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  const code = "code" in error && typeof error.code === "number" ? error.code : null;
  return (
    name === "QuotaExceededError" ||
    name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    code === 22 ||
    code === 1014
  );
}

function extractNoteTags(note: string): string[] {
  const matches = note.match(/\[[^[\]]+?\]/g) ?? [];
  return Array.from(new Set(matches)).slice(0, 6);
}

function normalizeNote(note: unknown, mode: NoteMode, maxLength: number): string | undefined {
  if (mode === "none" || typeof note !== "string") return undefined;
  const trimmed = note.trim();
  if (!trimmed) return undefined;

  const tags = extractNoteTags(trimmed).join("");
  if (mode === "tags") {
    return tags || undefined;
  }

  const body = trimmed.replace(/\[[^[\]]+?\]/g, " ").replace(/\s+/g, " ").trim();
  const rebuilt = [tags, body].filter(Boolean).join(" ").trim();
  if (!rebuilt) return undefined;
  if (rebuilt.length <= maxLength) return rebuilt;
  return rebuilt.slice(0, maxLength).trimEnd();
}

function normalizeRecord(
  value: unknown,
  { noteMode = "full", noteMaxLength = MAX_NOTE_LENGTH }: { noteMode?: NoteMode; noteMaxLength?: number } = {},
): WornRecord | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Partial<WornRecord>;
  const date = typeof candidate.date === "string" ? candidate.date.slice(0, 10) : "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const satisfaction = typeof candidate.satisfaction === "number"
    ? Math.trunc(candidate.satisfaction)
    : Number(candidate.satisfaction);
  if (!Number.isInteger(satisfaction) || satisfaction < 1 || satisfaction > 5) return null;

  const itemIds = Array.isArray(candidate.itemIds)
    ? Array.from(new Set(candidate.itemIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0))).slice(0, MAX_ITEM_IDS)
    : [];

  const note = normalizeNote(candidate.note, noteMode, noteMaxLength);

  return {
    date,
    itemIds,
    satisfaction: satisfaction as WornRecord["satisfaction"],
    ...(note ? { note } : {}),
  };
}

function sanitizeHistory(
  values: unknown[],
  options?: { noteMode?: NoteMode; noteMaxLength?: number; maxEntries?: number },
): WornRecord[] {
  const normalized = values
    .map(value => normalizeRecord(value, options))
    .filter((record): record is WornRecord => record !== null)
    .sort((a, b) => b.date.localeCompare(a.date));

  const deduped = new Map<string, WornRecord>();
  for (const record of normalized) {
    if (!deduped.has(record.date)) {
      deduped.set(record.date, record);
    }
  }

  return Array.from(deduped.values()).slice(0, options?.maxEntries ?? MAX_WORN_HISTORY);
}

function readStoredHistory(storage: Storage | null, key: string): { present: boolean; records: WornRecord[] } {
  if (!storage) return { present: false, records: [] };
  try {
    const raw = storage.getItem(key);
    if (raw == null) return { present: false, records: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return { present: true, records: [] };
    return { present: true, records: sanitizeHistory(parsed) };
  } catch {
    return { present: false, records: [] };
  }
}

function writeStoredHistory(storage: Storage | null, key: string, records: WornRecord[]): boolean {
  if (!storage) return false;
  storage.setItem(key, JSON.stringify(records));
  return true;
}

export function loadWornHistory(): WornRecord[] {
  const local = readStoredHistory(getStorage("local"), WORN_KEY);
  if (local.present) {
    memoryWornHistory = local.records;
    return local.records;
  }

  const session = readStoredHistory(getStorage("session"), SESSION_WORN_KEY);
  if (session.present) {
    memoryWornHistory = session.records;
    return session.records;
  }

  return memoryWornHistory;
}

export function saveWornRecord(record: WornRecord): void {
  const history = loadWornHistory();
  const idx = history.findIndex(r => r.date === record.date);
  if (idx >= 0) {
    history[idx] = record;
  } else {
    history.push(record);
  }

  const strategies: Array<{ maxEntries: number; noteMode: NoteMode; noteMaxLength: number }> = [
    { maxEntries: MAX_WORN_HISTORY, noteMode: "full", noteMaxLength: MAX_NOTE_LENGTH },
    { maxEntries: 60, noteMode: "full", noteMaxLength: 160 },
    { maxEntries: 45, noteMode: "tags", noteMaxLength: 0 },
    { maxEntries: 30, noteMode: "none", noteMaxLength: 0 },
    { maxEntries: 14, noteMode: "none", noteMaxLength: 0 },
  ];

  const localStorageRef = getStorage("local");
  const sessionStorageRef = getStorage("session");

  for (const strategy of strategies) {
    const compacted = sanitizeHistory(history, strategy);
    try {
      if (writeStoredHistory(localStorageRef, WORN_KEY, compacted)) {
        sessionStorageRef?.removeItem(SESSION_WORN_KEY);
        memoryWornHistory = compacted;
        return;
      }
    } catch (error) {
      if (!isQuotaExceededError(error)) {
        console.warn("Failed to save worn history:", error);
        break;
      }
    }
  }

  const fallbackHistory = sanitizeHistory(history, strategies[strategies.length - 1]);

  try {
    localStorageRef?.removeItem(WORN_KEY);
  } catch {
    // ignore
  }

  try {
    if (writeStoredHistory(sessionStorageRef, SESSION_WORN_KEY, fallbackHistory)) {
      memoryWornHistory = fallbackHistory;
      return;
    }
  } catch (error) {
    if (!isQuotaExceededError(error)) {
      console.warn("Failed to save worn history fallback:", error);
    }
  }

  memoryWornHistory = fallbackHistory;
  console.warn("Stored worn history only in memory because browser storage is full.");
}

export function getRecentlyWornItemIds(days: number = 7): string[] {
  const history = loadWornHistory();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cutoffStr = cutoff.toISOString().split("T")[0];

  const ids = new Set<string>();
  for (const record of history) {
    if (record.date >= cutoffStr) {
      for (const id of record.itemIds) {
        ids.add(id);
      }
    }
  }
  return Array.from(ids);
}

export function getWornRecordForDate(date: string): WornRecord | null {
  const history = loadWornHistory();
  return history.find(r => r.date === date) ?? null;
}

export function getMostWornItems(limit: number = 5): Array<{ id: string; count: number }> {
  const history = loadWornHistory();
  const freq: Record<string, number> = {};
  for (const record of history) {
    for (const id of record.itemIds) {
      freq[id] = (freq[id] ?? 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([id, count]) => ({ id, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}
