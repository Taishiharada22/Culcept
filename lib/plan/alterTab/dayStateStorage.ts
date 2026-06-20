/**
 * Day State localStorage（W4・Stage 1 local dogfood）
 *
 * 正本: docs/day-state-alter-tab-v0-design.md §6.2 Stage 1
 * key（versioned 規約・safeSetItem 使用・30 日 stale purge）:
 *  - `plan_day_state_v0`     … 主観日別 DayStateRecordV0（凍結見立て・本人入力・Night Check 込み）
 *  - `plan_night_check_v0`   … 主観日別 Night Check 採点出力（NightCheckGradeV0 + 回答メタ）
 *  - `plan_morning_reveal_v0`… Morning Reveal 既読管理（forDate 別・1 朝 1 回）
 * 規律:
 *  - localStorage のみ（DB / Supabase write 禁止 — Stage 2 は別 gate）
 *  - record と Night Check は同時に運用（採点なしの見立て蓄積は §4 違反 — 契約注意点 (i)）
 *  - 全 read は防御的 parse（壊れた JSON / schema 不一致 → 空扱い。throw しない）
 *  - 時刻 API 直呼びなし（todayIso は呼び出し側が注入 — purge 判定に使用）
 */

import { safeSetItem } from "@/lib/stargazer/localStorageHelper";
import type {
  DayFelt,
  DayStateRecordV0,
  NightCheckGradeV0,
  PlanVerdict,
} from "@/lib/plan/dayState/dayStateTypes";

export const DAY_STATE_KEY = "plan_day_state_v0";
export const NIGHT_CHECK_KEY = "plan_night_check_v0";
export const MORNING_REVEAL_KEY = "plan_morning_reveal_v0";

/** 30 日 purge（契約 §6.2: ローカルで無害・自然消滅） */
export const STALE_DAYS = 30;

/** テスト注入用の最小 Storage 面（window.localStorage 互換） */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface StoredNightCheck {
  answeredAt: string; // "HH:MM"
  answeredFor: string; // 主観日
  dayFelt: DayFelt;
  planVerdict?: PlanVerdict;
  grade: NightCheckGradeV0;
}

interface DayStateStore {
  schemaVersion: 0;
  days: Record<string, DayStateRecordV0>;
}

interface NightCheckStore {
  schemaVersion: 0;
  days: Record<string, StoredNightCheck>;
}

interface RevealStore {
  schemaVersion: 0;
  /** forDate（開示対象の前日）→ 表示済み記録 */
  seen: Record<string, { shownAt: string }>;
}

export function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null; // SecurityError 等（private mode）
  }
}

function parseStore<T extends { schemaVersion: 0 }>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw) as unknown;
    if (obj && typeof obj === "object" && (obj as { schemaVersion?: unknown }).schemaVersion === 0) {
      return obj as T;
    }
    return null; // schema 不一致は空扱い（壊れたデータで描画を汚さない）
  } catch {
    return null;
  }
}

/** "YYYY-MM-DD" 同士の日数差（UTC カレンダー演算） */
function daysBetween(fromIso: string, toIso: string): number {
  const from = new Date(fromIso + "T00:00:00Z").getTime();
  const to = new Date(toIso + "T00:00:00Z").getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return Number.POSITIVE_INFINITY;
  return Math.round((to - from) / 86_400_000);
}

function purgeDays<V>(days: Record<string, V>, todayIso: string): Record<string, V> {
  const out: Record<string, V> = {};
  for (const [date, v] of Object.entries(days)) {
    const age = daysBetween(date, todayIso);
    if (age >= 0 && age <= STALE_DAYS) out[date] = v;
    // 未来日付（age<0）も不正データとして落とす
  }
  return out;
}

// ── plan_day_state_v0 ──

export function loadDayStateDays(
  storage: StorageLike,
  todayIso: string,
): Record<string, DayStateRecordV0> {
  const store = parseStore<DayStateStore>(storage.getItem(DAY_STATE_KEY));
  return purgeDays(store?.days ?? {}, todayIso);
}

export function saveDayStateRecord(
  storage: StorageLike,
  record: DayStateRecordV0,
  todayIso: string,
): void {
  const days = loadDayStateDays(storage, todayIso);
  days[record.date] = record;
  const payload: DayStateStore = { schemaVersion: 0, days };
  writeJson(storage, DAY_STATE_KEY, payload);
}

// ── plan_night_check_v0 ──

export function loadNightCheckDays(
  storage: StorageLike,
  todayIso: string,
): Record<string, StoredNightCheck> {
  const store = parseStore<NightCheckStore>(storage.getItem(NIGHT_CHECK_KEY));
  return purgeDays(store?.days ?? {}, todayIso);
}

export function saveNightCheck(
  storage: StorageLike,
  entry: StoredNightCheck,
  todayIso: string,
): void {
  const days = loadNightCheckDays(storage, todayIso);
  days[entry.answeredFor] = entry;
  const payload: NightCheckStore = { schemaVersion: 0, days };
  writeJson(storage, NIGHT_CHECK_KEY, payload);
}

// ── plan_morning_reveal_v0（既読管理・1 朝 1 回） ──

export function isRevealSeen(storage: StorageLike, forDate: string): boolean {
  const store = parseStore<RevealStore>(storage.getItem(MORNING_REVEAL_KEY));
  return Boolean(store?.seen?.[forDate]);
}

export function markRevealSeen(
  storage: StorageLike,
  forDate: string,
  shownAtIso: string,
  todayIso: string,
): void {
  const store = parseStore<RevealStore>(storage.getItem(MORNING_REVEAL_KEY));
  const seen = purgeDays(store?.seen ?? {}, todayIso);
  seen[forDate] = { shownAt: shownAtIso };
  const payload: RevealStore = { schemaVersion: 0, seen };
  writeJson(storage, MORNING_REVEAL_KEY, payload);
}

function writeJson(storage: StorageLike, key: string, payload: unknown): void {
  const json = JSON.stringify(payload);
  // browser 実体なら quota 自動回復付き helper（契約 §6.2）。テスト注入 storage は直書き
  if (typeof window !== "undefined" && storage === window.localStorage) {
    safeSetItem(key, json);
  } else {
    try {
      storage.setItem(key, json);
    } catch {
      // fail-soft（保存失敗で UI を壊さない）
    }
  }
}
