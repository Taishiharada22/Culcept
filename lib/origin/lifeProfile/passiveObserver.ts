// lib/origin/lifeProfile/passiveObserver.ts
// #3 受動観測 — ユーザーの無意識の行動を静かに記録
//
// 記録するもの:
//   - カテゴリの閲覧順序（何に最初に目が行くか）
//   - 入力の迷い時間（テキスト入力開始までの間）
//   - 各カテゴリの滞在時間
//   - 深掘り質問をスキップしたか回答したか
//
// これらは直接ユーザーには見せないが、
// insightEngineやRendezvousパイプラインの精度を高める。

export type BehaviorEvent =
  | { type: "category_view"; category: string; timestamp: number }
  | { type: "entry_start"; category: string; timestamp: number }
  | { type: "entry_submit"; category: string; durationMs: number; timestamp: number }
  | { type: "depth_answer"; entryId: string; durationMs: number; timestamp: number }
  | { type: "depth_skip"; entryId: string; timestamp: number }
  | { type: "photo_capture"; category: string | null; timestamp: number }
  | { type: "session_start"; timestamp: number }
  | { type: "session_end"; durationMs: number; timestamp: number };

export type BehaviorLog = {
  version: 1;
  events: BehaviorEvent[];
  /** セッション開始時刻（現在のセッション） */
  sessionStartedAt: number | null;
};

const STORAGE_KEY = "culcept_life_profile_behavior_v1";
const MAX_EVENTS = 500; // 古いものから削除

function loadLog(): BehaviorLog {
  if (typeof window === "undefined")
    return { version: 1, events: [], sessionStartedAt: null };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as BehaviorLog;
  } catch {
    /* ignore */
  }
  return { version: 1, events: [], sessionStartedAt: null };
}

function saveLog(log: BehaviorLog): void {
  try {
    // 上限を超えたら古いイベントを削除
    if (log.events.length > MAX_EVENTS) {
      log.events = log.events.slice(-MAX_EVENTS);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  } catch {
    /* quota */
  }
}

/** イベントを記録 */
export function recordEvent(event: BehaviorEvent): void {
  const log = loadLog();
  log.events.push(event);
  saveLog(log);
}

/** セッション開始 */
export function startSession(): void {
  const log = loadLog();
  const now = Date.now();
  log.sessionStartedAt = now;
  log.events.push({ type: "session_start", timestamp: now });
  saveLog(log);
}

/** セッション終了 */
export function endSession(): void {
  const log = loadLog();
  const now = Date.now();
  if (log.sessionStartedAt) {
    log.events.push({
      type: "session_end",
      durationMs: now - log.sessionStartedAt,
      timestamp: now,
    });
    log.sessionStartedAt = null;
    saveLog(log);
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 分析関数（insightEngineやRendezvousが使う）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 最もよく閲覧されるカテゴリ上位3 */
export function getTopViewedCategories(): string[] {
  const log = loadLog();
  const counts: Record<string, number> = {};
  for (const e of log.events) {
    if (e.type === "category_view") {
      counts[e.category] = (counts[e.category] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([cat]) => cat);
}

/** 深掘りスキップ率 */
export function getDepthSkipRate(): number {
  const log = loadLog();
  let answers = 0;
  let skips = 0;
  for (const e of log.events) {
    if (e.type === "depth_answer") answers++;
    if (e.type === "depth_skip") skips++;
  }
  const total = answers + skips;
  return total > 0 ? skips / total : 0;
}

/** 平均入力時間（ms） */
export function getAverageEntryDuration(): number {
  const log = loadLog();
  const durations: number[] = [];
  for (const e of log.events) {
    if (e.type === "entry_submit") durations.push(e.durationMs);
  }
  if (durations.length === 0) return 0;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}
