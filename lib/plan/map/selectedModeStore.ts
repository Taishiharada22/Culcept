/**
 * lib/plan/map/selectedModeStore.ts — MapTab で user が選んだ移動手段(mode)の永続化 (= S1-A)
 *
 * 確定 (2026-06-04 CEO×Claude 再検証):
 *   - selectedMode = 「移動手段の選択」。manualUserProvider の userDurationMin (= 所要時間の手動上書き) とは別概念。
 *   - 本 store は selectedMode を保存するだけで duration には一切影響しない
 *     (= 現 heuristic は mode を読まない。mode 別 duration は将来 GoogleRoutesProvider / preferredMode が扱う)。
 *   - 用途: ①選択を覚える ②カードで選択状態を復元 ③「前回こう動いた」(S2-A) の土台 ④将来 preferredMode に渡す。
 * 不変: client-only / SSR・localStorage 不在は fail-open / DB・network・server 不使用 / 破損は fail-open /
 *   versioned key + 保存日数・件数上限 / transport 正本層(lib/plan/transport)には置かない。
 */
import { isRouteTransportMode, type RouteTransportMode } from "@/lib/plan/map/routeMode";

export const SELECTED_MODE_STORE_KEY = "aneurasync.plan.map.selectedMode.v1";
export const SELECTED_MODE_STORE_VERSION = 1 as const;
export const MAX_STORED_DAYS = 60;
export const MAX_LEGS_PER_DAY = 100;

export interface SelectedModeStore {
  readonly version: typeof SELECTED_MODE_STORE_VERSION;
  readonly byDay: Readonly<Record<string, Readonly<Record<string, RouteTransportMode>>>>;
}

export const EMPTY_SELECTED_MODE_STORE: SelectedModeStore = {
  version: SELECTED_MODE_STORE_VERSION,
  byDay: {},
};

function isDayISO(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function parseStore(raw: string | null): SelectedModeStore {
  if (!raw) return EMPTY_SELECTED_MODE_STORE;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return EMPTY_SELECTED_MODE_STORE; }
  if (
    typeof parsed !== "object" || parsed === null ||
    (parsed as { version?: unknown }).version !== SELECTED_MODE_STORE_VERSION
  ) { return EMPTY_SELECTED_MODE_STORE; }
  const rawByDay = (parsed as { byDay?: unknown }).byDay;
  if (typeof rawByDay !== "object" || rawByDay === null) return EMPTY_SELECTED_MODE_STORE;
  const byDay: Record<string, Record<string, RouteTransportMode>> = {};
  for (const [day, legs] of Object.entries(rawByDay as Record<string, unknown>)) {
    if (!isDayISO(day)) continue;
    if (typeof legs !== "object" || legs === null) continue;
    const cleanLegs: Record<string, RouteTransportMode> = {};
    for (const [legKey, mode] of Object.entries(legs as Record<string, unknown>)) {
      if (typeof legKey !== "string" || legKey.length === 0) continue;
      if (!isRouteTransportMode(mode)) continue;
      cleanLegs[legKey] = mode;
    }
    if (Object.keys(cleanLegs).length > 0) byDay[day] = cleanLegs;
  }
  return { version: SELECTED_MODE_STORE_VERSION, byDay };
}

export function serializeStore(store: SelectedModeStore): string {
  return JSON.stringify(store);
}

export function applyCaps(store: SelectedModeStore): SelectedModeStore {
  const keptDays = Object.keys(store.byDay).sort().slice(-MAX_STORED_DAYS);
  const byDay: Record<string, Record<string, RouteTransportMode>> = {};
  for (const day of keptDays) {
    const legs = store.byDay[day];
    const keptLegKeys = Object.keys(legs).slice(0, MAX_LEGS_PER_DAY);
    const clean: Record<string, RouteTransportMode> = {};
    for (const k of keptLegKeys) clean[k] = legs[k];
    byDay[day] = clean;
  }
  return { version: SELECTED_MODE_STORE_VERSION, byDay };
}

export function setMode(
  store: SelectedModeStore, dayISO: string, legKey: string, mode: RouteTransportMode,
): SelectedModeStore {
  if (!isDayISO(dayISO) || typeof legKey !== "string" || legKey.length === 0 || !isRouteTransportMode(mode)) {
    return store;
  }
  const prevDay = store.byDay[dayISO] ?? {};
  const next: SelectedModeStore = {
    version: SELECTED_MODE_STORE_VERSION,
    byDay: { ...store.byDay, [dayISO]: { ...prevDay, [legKey]: mode } },
  };
  return applyCaps(next);
}

export function getMode(store: SelectedModeStore, dayISO: string, legKey: string): RouteTransportMode | null {
  return store.byDay[dayISO]?.[legKey] ?? null;
}

export function getModesForDay(store: SelectedModeStore, dayISO: string): Record<string, RouteTransportMode> {
  return { ...(store.byDay[dayISO] ?? {}) };
}

function getStorage(): Storage | null {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? null;
  } catch { return null; }
}

function readStore(): SelectedModeStore {
  const ls = getStorage();
  if (!ls) return EMPTY_SELECTED_MODE_STORE;
  try { return parseStore(ls.getItem(SELECTED_MODE_STORE_KEY)); } catch { return EMPTY_SELECTED_MODE_STORE; }
}

function writeStore(store: SelectedModeStore): void {
  const ls = getStorage();
  if (!ls) return;
  try { ls.setItem(SELECTED_MODE_STORE_KEY, serializeStore(store)); } catch { /* quota 等は fail-open */ }
}

export function saveSelectedMode(dayISO: string, legKey: string, mode: RouteTransportMode): void {
  writeStore(setMode(readStore(), dayISO, legKey, mode));
}

export function loadSelectedMode(dayISO: string, legKey: string): RouteTransportMode | null {
  return getMode(readStore(), dayISO, legKey);
}

export function loadSelectedModesForDay(dayISO: string): Record<string, RouteTransportMode> {
  return getModesForDay(readStore(), dayISO);
}

export function clearSelectedModeStore(): void {
  const ls = getStorage();
  if (!ls) return;
  try { ls.removeItem(SELECTED_MODE_STORE_KEY); } catch { /* ignore */ }
}

// ━━━ S2-A 「前回こう動いた」 recall (= A4・pure) ━━━

/** recall 結果: 過去日の mode とその日。 */
export interface PriorLegMode {
  readonly mode: RouteTransportMode;
  readonly dayISO: string;
}

/**
 * S2-A: dayISO より前(過去)の日で legKey の mode を持つ最も新しい日の mode を返す。
 *   - 未来日は見ない / 同日現在値は対象外 (= d < dayISO 厳密)
 *   - 破損/不正は fail-open (= null) / dayISO は辞書順=時系列順 (= caps 済 store と整合)
 */
export function recallPriorLegMode(
  store: SelectedModeStore,
  dayISO: string,
  legKey: string,
): PriorLegMode | null {
  if (!isDayISO(dayISO) || typeof legKey !== "string" || legKey.length === 0) return null;
  const priorDays = Object.keys(store.byDay).filter((d) => d < dayISO).sort();
  for (let i = priorDays.length - 1; i >= 0; i--) {
    const d = priorDays[i];
    const mode = store.byDay[d]?.[legKey];
    if (mode !== undefined && isRouteTransportMode(mode)) {
      return { mode, dayISO: d };
    }
  }
  return null;
}

/** S2-A recall (localStorage 版・client-only・fail-open)。 */
export function loadPriorLegMode(dayISO: string, legKey: string): PriorLegMode | null {
  return recallPriorLegMode(readStore(), dayISO, legKey);
}
