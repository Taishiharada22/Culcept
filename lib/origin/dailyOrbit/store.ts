// lib/origin/dailyOrbit/store.ts
// localStorage永続化 + サーバー同期 — v2 (11層 + Retention Layer)
// サーバー(Supabase) を正とし、localStorage は移行期間のフォールバック

import type {
  DailyOrbitStore,
  DailyOrbitEntry,
  OrbitTask,
  OrbitLaw,
  OrbitThread,
  TurningPoint,
  SurpriseObservation,
  SelfResolution,
  Recurrence,
} from "./types";

const STORAGE_KEY = "culcept_daily_orbit_v2";
const V1_KEY = "culcept_daily_orbit_v1";

// ---------------------------------------------------------------------------
// Server sync — サーバーを正、localStorageをキャッシュとして扱う
// ---------------------------------------------------------------------------

/** サーバーから状態を取得。null ならサーバーにデータなし */
export async function fetchOrbitStateFromServer(): Promise<DailyOrbitStore | null> {
  try {
    const res = await fetch("/api/origin/daily-orbit/state", {
      credentials: "include",
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.state ?? null;
  } catch {
    return null;
  }
}

/** サーバーに状態を保存（非同期、失敗しても例外を投げない） */
export function syncOrbitStateToServer(store: DailyOrbitStore): void {
  fetch("/api/origin/daily-orbit/state", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state: store }),
  }).catch(() => {
    /* silent — localStorage が残っているので次回リトライ */
  });
}

/**
 * サーバー優先でストアを読み込む（タイムアウト付き）。
 * 1. localStorage を即座に返し、サーバーを並行取得
 * 2. サーバーが 2 秒以内に返ればマージ結果を使う
 * 3. タイムアウトまたは失敗時は localStorage を使う
 */
export async function loadOrbitStoreWithSync(): Promise<DailyOrbitStore> {
  const local = loadOrbitStore();

  // サーバー取得を 2 秒タイムアウト付きで試行
  let serverState: DailyOrbitStore | null = null;
  try {
    serverState = await Promise.race([
      fetchOrbitStateFromServer(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2000)),
    ]);
  } catch {
    // タイムアウトまたはネットワークエラー → localStorage を使う
  }

  if (serverState && typeof serverState === "object" && serverState.version) {
    const merged: DailyOrbitStore = {
      ...emptyStore(),
      ...serverState,
      selfResolution: serverState.selfResolution ?? emptyResolution(),
      threads: serverState.threads ?? [],
      turningPoints: serverState.turningPoints ?? [],
      surpriseObservations: serverState.surpriseObservations ?? [],
      discoveryUnlocked: serverState.discoveryUnlocked ?? {},
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(merged)); } catch { /* */ }
    return merged;
  }

  // サーバーが空またはタイムアウト → localStorage フォールバック
  if (Object.keys(local.entries).length > 0) {
    syncOrbitStateToServer(local);
  }
  return local;
}

function emptyResolution(): SelfResolution {
  return { score: 0, updatedAt: new Date().toISOString(), history: [] };
}

function emptyStore(): DailyOrbitStore {
  return {
    version: 2,
    entries: {},
    orbitLaws: [],
    selfResolution: emptyResolution(),
    threads: [],
    turningPoints: [],
    surpriseObservations: [],
    discoveryUnlocked: {},
    firstUsedAt: null,
    lastUsedAt: null,
    currentStreak: 0,
  };
}

/** v1 → v2 マイグレーション */
function migrateV1(): DailyOrbitStore | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return null;
    const v1 = JSON.parse(raw);
    if (!v1?.entries) return null;

    const migrated = emptyStore();
    for (const [date, entry] of Object.entries(v1.entries)) {
      const old = entry as Record<string, unknown>;
      const oldTasks = (old.tasks ?? []) as Array<Record<string, unknown>>;
      migrated.entries[date] = {
        date,
        tasks: oldTasks.map((t) => ({
          id: t.id as string,
          text: t.text as string,
          completed: !!t.completed,
          completedAt: (t.completedAt as string) ?? null,
          carriedFrom: (t.carriedFrom as string) ?? null,
          carryCount: 0,
          addedAt: (old.createdAt as string) ?? new Date().toISOString(),
        })),
        bodyEcho: null,
        dayState: (old.dayState as DailyOrbitEntry["dayState"]) ?? null,
        shadowIntention: null,
        temporalDialogue: null,
        timeTexture: null,
        reflection: (old.reflection as DailyOrbitEntry["reflection"]) ?? null,
        selfForecast: null,
        userPrediction: null,
        createdAt: (old.createdAt as string) ?? new Date().toISOString(),
        updatedAt: (old.updatedAt as string) ?? new Date().toISOString(),
      };
    }
    return migrated;
  } catch {
    return null;
  }
}

export function loadOrbitStore(): DailyOrbitStore {
  if (typeof window === "undefined") return emptyStore();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DailyOrbitStore;
      // 新フィールドの後方互換
      return {
        ...emptyStore(),
        ...parsed,
        selfResolution: parsed.selfResolution ?? emptyResolution(),
        threads: parsed.threads ?? [],
        turningPoints: parsed.turningPoints ?? [],
        surpriseObservations: parsed.surpriseObservations ?? [],
        discoveryUnlocked: parsed.discoveryUnlocked ?? {},
      };
    }
    const migrated = migrateV1();
    if (migrated) {
      saveOrbitStore(migrated);
      return migrated;
    }
    return emptyStore();
  } catch {
    return emptyStore();
  }
}

export function saveOrbitStore(store: DailyOrbitStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota exceeded — silent */
  }
  // サーバーにも非同期で同期
  syncOrbitStateToServer(store);
}

/** 今日の日付文字列 */
export function todayKey(): string {
  return new Date().toISOString().split("T")[0];
}

/** 昨日の日付文字列 */
export function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().split("T")[0];
}

/** 繰り返しパターンが今日にマッチするか判定 */
function recurrenceMatchesDate(rec: Recurrence, date: string, store: DailyOrbitStore): boolean {
  const d = new Date(date + "T00:00:00");
  const dow = d.getDay();
  switch (rec.pattern) {
    case "daily":
      return true;
    case "weekdays":
      return dow >= 1 && dow <= 5;
    case "weekly":
      return rec.dayOfWeek === dow;
    case "biweekly": {
      if (rec.dayOfWeek !== dow) return false;
      const firstUsed = store.firstUsedAt ?? date;
      const baseDate = new Date(firstUsed + "T00:00:00");
      const diffDays = Math.floor((d.getTime() - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      const weekNum = Math.floor(diffDays / 7);
      return weekNum % 2 === 0;
    }
    case "monthly": {
      const dom = d.getDate();
      if (rec.dayOfMonth === 32) {
        // 月末: 翌日が翌月かチェック
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        return nextDay.getMonth() !== d.getMonth();
      }
      if (dom === rec.dayOfMonth) return true;
      // dayOfMonth が月の日数を超える場合（例: 31日→30日しかない月）は月末にフォールバック
      if (rec.dayOfMonth && rec.dayOfMonth > dom) {
        const nextDay = new Date(d);
        nextDay.setDate(nextDay.getDate() + 1);
        if (nextDay.getMonth() !== d.getMonth()) return true; // 月末にフォールバック
      }
      return false;
    }
    case "custom": {
      if (!rec.intervalDays || rec.intervalDays < 2) return false;
      const firstUsed2 = store.firstUsedAt ?? date;
      const base2 = new Date(firstUsed2 + "T00:00:00");
      const diff2 = Math.floor((d.getTime() - base2.getTime()) / (1000 * 60 * 60 * 24));
      return diff2 % rec.intervalDays === 0;
    }
    default:
      return false;
  }
}

/** 全エントリから繰り返しタスクの定義を収集 */
export function getRecurringTaskDefinitions(store: DailyOrbitStore): OrbitTask[] {
  const seen = new Map<string, OrbitTask>(); // text → latest task
  for (const entry of Object.values(store.entries)) {
    for (const task of entry.tasks) {
      if (task.recurrence) {
        // 同じテキストの最新を保持
        seen.set(task.text, task);
      }
    }
  }
  return Array.from(seen.values());
}

/** 指定日に発火すべき繰り返しタスクを返す */
export function getRecurringTasksForDate(store: DailyOrbitStore, date: string): OrbitTask[] {
  const definitions = getRecurringTaskDefinitions(store);
  // この日に既にあるタスクのテキストを集めて重複防止
  const existing = new Set(store.entries[date]?.tasks.map((t) => t.text) ?? []);
  return definitions.filter(
    (t) => t.recurrence && recurrenceMatchesDate(t.recurrence, date, store) && !existing.has(t.text),
  );
}

/** 指定日のエントリを取得（なければ作成、繰り返しタスクも自動コピー） */
export function getOrCreateEntry(
  store: DailyOrbitStore,
  date: string,
): DailyOrbitEntry {
  if (store.entries[date]) return store.entries[date];
  const now = new Date().toISOString();
  // 繰り返しタスクの自動コピー
  const recurringTasks = getRecurringTasksForDate(store, date).map((t) => ({
    id: newTaskId(),
    text: t.text,
    completed: false,
    carryCount: 0,
    addedAt: now,
    recurrence: t.recurrence,
    dueTime: t.dueTime,
  }));
  return {
    date,
    tasks: recurringTasks,
    bodyEcho: null,
    dayState: null,
    shadowIntention: null,
    temporalDialogue: null,
    timeTexture: null,
    reflection: null,
    selfForecast: null,
    userPrediction: null,
    createdAt: now,
    updatedAt: now,
  };
}

/** サブタスクを取得 */
export function getSubtasks(entry: DailyOrbitEntry, parentId: string): OrbitTask[] {
  return entry.tasks.filter((t) => t.parentId === parentId);
}

/** 親タスクの進捗 */
export function getParentProgress(entry: DailyOrbitEntry, parentId: string): { done: number; total: number } {
  const subs = getSubtasks(entry, parentId);
  return { done: subs.filter((t) => t.completed).length, total: subs.length };
}

/** タスクIDを生成 */
export function newTaskId(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/** 前日の未完了タスクを取得（carryCount付き） */
export function getCarryOverCandidates(
  store: DailyOrbitStore,
  today: string,
): OrbitTask[] {
  const candidates: OrbitTask[] = [];
  const d = new Date(today);
  for (let i = 1; i <= 7; i++) {
    d.setDate(d.getDate() - 1);
    const key = d.toISOString().split("T")[0];
    const entry = store.entries[key];
    if (!entry) continue;
    for (const task of entry.tasks) {
      if (!task.completed) {
        candidates.push({
          ...task,
          carriedFrom: key,
          carryCount: (task.carryCount ?? 0) + 1,
        });
      }
    }
    if (candidates.length > 0) break;
  }
  return candidates;
}

/** 漂流タスクの検出（3回以上持ち越し） */
export function getDriftingTasks(
  store: DailyOrbitStore,
  today: string,
): OrbitTask[] {
  const candidates = getCarryOverCandidates(store, today);
  return candidates.filter((t) => t.carryCount >= 3);
}

/** 昨日の振り返りを取得（Temporal Dialogue用） */
export function getYesterdayReflection(
  store: DailyOrbitStore,
  today: string,
): string | null {
  const d = new Date(today);
  d.setDate(d.getDate() - 1);
  const key = d.toISOString().split("T")[0];
  const entry = store.entries[key];
  return entry?.reflection?.answer ?? null;
}

/** エントリを保存 */
export function upsertEntry(
  store: DailyOrbitStore,
  entry: DailyOrbitEntry,
): DailyOrbitStore {
  return {
    ...store,
    entries: {
      ...store.entries,
      [entry.date]: { ...entry, updatedAt: new Date().toISOString() },
    },
  };
}

/** 軌道の法則を追加/更新 */
export function addOrbitLaw(
  store: DailyOrbitStore,
  law: OrbitLaw,
): DailyOrbitStore {
  const existing = store.orbitLaws.findIndex((l) => l.id === law.id);
  const laws = [...store.orbitLaws];
  if (existing >= 0) {
    laws[existing] = law;
  } else {
    laws.push(law);
  }
  return { ...store, orbitLaws: laws };
}

/** 直近N日分のエントリを取得 */
export function getRecentEntries(
  store: DailyOrbitStore,
  today: string,
  days: number,
): DailyOrbitEntry[] {
  const entries: DailyOrbitEntry[] = [];
  const d = new Date(today);
  for (let i = 0; i < days; i++) {
    const key = d.toISOString().split("T")[0];
    if (store.entries[key]) entries.push(store.entries[key]);
    d.setDate(d.getDate() - 1);
  }
  return entries;
}

/** 使用日数を算出 */
export function getDaysUsed(store: DailyOrbitStore): number {
  return Object.keys(store.entries).length;
}

/** 不在日数を算出（最終使用日から今日まで） */
export function getAbsenceDays(store: DailyOrbitStore, today: string): number {
  if (!store.lastUsedAt) return 0;
  const last = new Date(store.lastUsedAt);
  const now = new Date(today);
  const diff = Math.floor(
    (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24),
  );
  return Math.max(0, diff - 1); // 昨日使ったなら0
}

/** 連続使用日数を更新 */
export function updateStreak(
  store: DailyOrbitStore,
  today: string,
): DailyOrbitStore {
  if (store.lastUsedAt === today) return store;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split("T")[0];

  const newStreak =
    store.lastUsedAt === yesterdayStr ? store.currentStreak + 1 : 1;

  return {
    ...store,
    lastUsedAt: today,
    firstUsedAt: store.firstUsedAt ?? today,
    currentStreak: newStreak,
  };
}

/** 分岐点を追加 */
export function addTurningPoint(
  store: DailyOrbitStore,
  tp: TurningPoint,
): DailyOrbitStore {
  // 同じ日に同じcategoryの分岐点があれば上書き
  const filtered = store.turningPoints.filter(
    (t) => !(t.date === tp.date && t.category === tp.category),
  );
  return { ...store, turningPoints: [...filtered, tp] };
}

/** 糸を追加/更新 */
export function upsertThread(
  store: DailyOrbitStore,
  thread: OrbitThread,
): DailyOrbitStore {
  const existing = store.threads.findIndex((t) => t.id === thread.id);
  const threads = [...store.threads];
  if (existing >= 0) {
    threads[existing] = thread;
  } else {
    threads.push(thread);
  }
  return { ...store, threads };
}

/** 不意打ち観測を追加 */
export function addSurpriseObservation(
  store: DailyOrbitStore,
  obs: SurpriseObservation,
): DailyOrbitStore {
  return {
    ...store,
    surpriseObservations: [...store.surpriseObservations, obs].slice(-50), // 最大50個保持
  };
}
