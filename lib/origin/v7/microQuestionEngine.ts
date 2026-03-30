// Origin v8 — Micro-Question Engine (デイリー・マイクロ質問エンジン)
// 日替わり質問の選出、ストリーク管理、期間→暦変換

import type { MicroQuestion, MicroQuestionStreak, LifePeriod } from "./types";
import { MICRO_QUESTION_BANK, PERIOD_AGE_RANGES } from "./microQuestionBank";

/* ─── Date-seeded deterministic selection ─── */

/**
 * 日付シードを使った決定的なハッシュ値を返す。
 * 同じ日付文字列に対して常に同じ数値を返す。
 */
function dateHash(dateString: string): number {
  let hash = 0;
  for (let i = 0; i < dateString.length; i++) {
    const char = dateString.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  return Math.abs(hash);
}

/**
 * その日のデイリー質問を選出する。
 * - date-seeded deterministic: 同じ日付には同じ質問が返る
 * - 既に回答済みの質問はスキップ
 * - 全て回答済みの場合は null
 *
 * @param answeredIds 回答済みの質問ID配列
 * @param dateString 日付文字列 (YYYY-MM-DD)。省略時は今日
 */
export function selectDailyQuestion(
  answeredIds: string[],
  dateString?: string,
): MicroQuestion | null {
  const date = dateString ?? new Date().toISOString().slice(0, 10);
  const answeredSet = new Set(answeredIds);

  // Filter to unanswered questions
  const available = MICRO_QUESTION_BANK.filter(
    (q) => !answeredSet.has(q.id),
  );

  if (available.length === 0) return null;

  // Use date hash to pick deterministically
  const hash = dateHash(date);
  const index = hash % available.length;
  return available[index];
}

/* ─── Streak management ─── */

/**
 * ストリーク情報を更新する。
 * - 連続日ならストリーク+1
 * - 1日以上空いたらリセット
 * - 同日ならそのまま（重複防止）
 *
 * @param current 現在のストリーク情報
 * @param answeredDate 回答日 (YYYY-MM-DD)
 */
export function updateStreak(
  current: MicroQuestionStreak,
  answeredDate: string,
): MicroQuestionStreak {
  const lastDate = current.lastAnsweredDate;

  // Same day — no change except totalAnswered
  if (lastDate === answeredDate) {
    return {
      ...current,
      totalAnswered: current.totalAnswered + 1,
    };
  }

  // If no previous answer, start streak
  if (!lastDate) {
    return {
      currentStreak: 1,
      longestStreak: Math.max(current.longestStreak, 1),
      lastAnsweredDate: answeredDate,
      totalAnswered: current.totalAnswered + 1,
    };
  }

  // Calculate day difference
  const lastMs = new Date(lastDate + "T00:00:00").getTime();
  const answeredMs = new Date(answeredDate + "T00:00:00").getTime();
  const diffDays = Math.round((answeredMs - lastMs) / (1000 * 60 * 60 * 24));

  if (diffDays === 1) {
    // Consecutive day — increment streak
    const newStreak = current.currentStreak + 1;
    return {
      currentStreak: newStreak,
      longestStreak: Math.max(current.longestStreak, newStreak),
      lastAnsweredDate: answeredDate,
      totalAnswered: current.totalAnswered + 1,
    };
  }

  // Gap of 2+ days — reset streak
  return {
    currentStreak: 1,
    longestStreak: current.longestStreak,
    lastAnsweredDate: answeredDate,
    totalAnswered: current.totalAnswered + 1,
  };
}

/* ─── Period to approximate calendar ─── */

/**
 * LifePeriod と生年から、その期間のおおよその暦年・月を算出する。
 * 期間の中間地点を代表値として返す。
 *
 * @param period ライフピリオド
 * @param birthYear 生まれた年
 */
export function periodToApproximateCalendar(
  period: LifePeriod,
  birthYear: number,
): { year: number; month: number } {
  const range = PERIOD_AGE_RANGES[period];
  if (!range) {
    // special_period fallback: current age midpoint
    return { year: birthYear + 20, month: 6 };
  }

  // Use midpoint of age range
  const midAge = Math.floor((range.startAge + range.endAge) / 2);
  const year = birthYear + midAge;

  // Default to June (month 6) as midpoint of year
  return { year, month: 6 };
}
