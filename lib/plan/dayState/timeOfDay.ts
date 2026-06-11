/**
 * 主観日・時間帯ヘルパー（Stage 0 pure）
 *
 * 主観日境界 = 05:00（設計書 §3.2）。レコードは当日 05:00〜翌 04:59 を覆い、
 * 02:00 の導出・回答は前日 date に属する。
 * TimeBucket の区分は既存定義（lib/plan/dayGraph/dayGraphTypes.ts §22 — early_morning 05-08 /
 * morning 08-11 / noon 11-14 / afternoon 14-17 / evening 17-20 / night 20-23 / late_night 23-05）
 * と同一の境界を用いる。既存の付与関数は DayGraph build 時にのみ動くため、
 * 任意の "HH:MM" に対する写像を本モジュールで提供する（境界値は fixture で固定）。
 */

import type { TimeBucket } from "@/lib/plan/dayGraph/dayGraphTypes";
import type { FrozenKind } from "./dayStateTypes";

export const SUBJECTIVE_DAY_START_MIN = 5 * 60; // 05:00

/** "HH:MM" → 0-1439 の絶対分。parse 不能は null */
export function toAbsMin(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/** 主観分（05:00 起点 0〜1439）。02:00 → 1260 = 前日の終盤に属する */
export function toSubjectiveMin(hhmm: string): number | null {
  const abs = toAbsMin(hhmm);
  if (abs === null) return null;
  return (abs - SUBJECTIVE_DAY_START_MIN + 1440) % 1440;
}

export function toTimeBucket(hhmm: string): TimeBucket | null {
  const abs = toAbsMin(hhmm);
  if (abs === null) return null;
  const h = Math.floor(abs / 60);
  if (h >= 5 && h < 8) return "early_morning";
  if (h >= 8 && h < 11) return "morning";
  if (h >= 11 && h < 14) return "noon";
  if (h >= 14 && h < 17) return "afternoon";
  if (h >= 17 && h < 20) return "evening";
  if (h >= 20 && h < 23) return "night";
  return "late_night"; // 23:00-05:00
}

/** 凍結区分（設計書 §3.2）: 05-11 / 11-17 / 17-05 */
export function toFrozenKind(hhmm: string): FrozenKind {
  const abs = toAbsMin(hhmm);
  if (abs === null) return "late_snapshot"; // parse 不能は保守側（headline 集計に入らない）
  const h = Math.floor(abs / 60);
  if (h >= 5 && h < 11) return "morning_baseline";
  if (h >= 11 && h < 17) return "first_open_snapshot";
  return "late_snapshot";
}

export function isNightCheckBucket(bucket: TimeBucket): boolean {
  return bucket === "evening" || bucket === "night" || bucket === "late_night";
}

export function isMorningRevealBucket(bucket: TimeBucket): boolean {
  return bucket === "early_morning" || bucket === "morning";
}

/** 勤務時間が 22:00-05:00 帯に交差するか（夜勤判定）。時刻欠如は null */
export function isNightShiftSpan(startTime?: string, endTime?: string): boolean | null {
  const start = toAbsMin(startTime ?? "");
  const end = toAbsMin(endTime ?? "");
  if (start === null || end === null) return null;
  // 夜帯 = [22:00, 翌05:00) = [1320, 1740)。勤務帯 [start, spanEnd)（跨ぎは +24h）。
  // 01:00-06:00 のような「翌日側だけの夜勤」は勤務帯を +24h して同じ帯と比較する。
  const NIGHT_START = 22 * 60;
  const NIGHT_END = 29 * 60;
  const spanEnd = end > start ? end : end + 1440;
  const overlapsNight = (s: number, e: number) => s < NIGHT_END && e > NIGHT_START;
  return overlapsNight(start, spanEnd) || overlapsNight(start + 1440, spanEnd + 1440);
}
