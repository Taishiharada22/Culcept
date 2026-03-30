// lib/stargazer/sessionPause.ts
// 日次観測の一時中断・再開管理

import type { DailyObservationPlan } from "./dailyOrchestrator";

const STORAGE_KEY = "culcept_sg_daily_pause_v1";
const DONE_KEY_PREFIX = "culcept_sg_daily_done_";

export interface PausedSession {
  date: string;
  answeredQuestionIds: string[];
  answers: {
    variantId: string;
    score: number;
    responseTimeMs: number;
    optionId?: string;
  }[];
  deltaAnswers: {
    axisId: string;
    delta: number;
    previousScore: number;
  }[];
  pausedAt: string;
  planSnapshot: DailyObservationPlan;
  /** 次に表示すべき質問の全体インデックス */
  nextQuestionIndex: number;
}

function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

/** 中断状態を保存 */
export function savePauseState(session: PausedSession): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // localStorage full or unavailable
  }
}

/** 今日の中断状態を読み込み（日付が違えばnull） */
export function loadPauseState(): PausedSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session: PausedSession = JSON.parse(raw);
    if (session.date !== getToday()) {
      clearPauseState();
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/** 中断状態をクリア */
export function clearPauseState(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** 今日の中断セッションがあるか */
export function isPausedForToday(): boolean {
  return loadPauseState() !== null;
}

/** 今日の観測を完了済みとしてマーク */
export function markDailyDone(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DONE_KEY_PREFIX + getToday(), "1");
    clearPauseState();
  } catch {
    // ignore
  }
}

/** 今日の観測が完了済みか */
export function isDailyDone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(DONE_KEY_PREFIX + getToday()) === "1";
  } catch {
    return false;
  }
}

/** 古い完了フラグをクリーンアップ（7日以上前） */
export function cleanupOldDoneFlags(): void {
  if (typeof window === "undefined") return;
  try {
    const today = new Date();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(DONE_KEY_PREFIX)) continue;
      const dateStr = key.replace(DONE_KEY_PREFIX, "");
      const date = new Date(dateStr);
      const diffDays = (today.getTime() - date.getTime()) / 86400000;
      if (diffDays > 7) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // ignore
  }
}

/* ═══════════════════════════════════════════════
   Observation Streak Tracking
   ═══════════════════════════════════════════════ */

const OBS_HISTORY_KEY = "culcept_daily_obs_history_v1";

/** 観測履歴に今日の日付を記録する */
export function recordObservationDate(): void {
  if (typeof window === "undefined") return;
  try {
    const today = getToday();
    const dates = loadObservationDates();
    if (!dates.includes(today)) {
      dates.push(today);
      // 最大90日分保持
      const trimmed = dates.slice(-90);
      localStorage.setItem(OBS_HISTORY_KEY, JSON.stringify(trimmed));
    }
  } catch {
    // ignore
  }
}

/** 保存済み観測日の配列を取得 */
function loadObservationDates(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(OBS_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 連続観測日数を返す。
 * 今日を含む過去方向の連続日数をカウントする。
 * 今日がまだ記録されていない場合は昨日を起点にカウントする。
 */
export function getObservationStreak(): number {
  const dates = loadObservationDates();
  if (dates.length === 0) return 0;

  const dateSet = new Set(dates);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayStr = formatDate(today);

  // 今日が含まれていれば今日から、なければ昨日から起算
  let current = new Date(today);
  if (!dateSet.has(todayStr)) {
    current.setDate(current.getDate() - 1);
    if (!dateSet.has(formatDate(current))) return 0;
  }

  let streak = 0;
  while (dateSet.has(formatDate(current))) {
    streak++;
    current.setDate(current.getDate() - 1);
  }

  return streak;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * 特定のストリーク数に対するメッセージを返す。
 * 注目に値しないストリーク数の場合は null を返す。
 */
export function getStreakMessage(streak: number): string | null {
  if (streak >= 30) return "1ヶ月の観測。あなたの第二の自分が育ってきてる。";
  if (streak >= 14) return "2週間。かなり深くまで理解が進んでる。";
  if (streak >= 7) return "1週間連続。あなたの輪郭が見えてきた。";
  if (streak >= 3) return "3日連続。リズムが出てきた。";
  return null;
}
