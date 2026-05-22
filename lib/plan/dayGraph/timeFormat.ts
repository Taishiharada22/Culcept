/**
 * Strict "HH:MM" Time Format Helpers — Phase 3-K (= K-1b)。
 *
 * 設計書: docs/alter-plan-phase3-k-daygraph-design.md §22.1
 *
 * 役割:
 *   既存 anchorOverlap.ts:toMinutes と同等の strict 仕様で
 *   "HH:MM" / "HH:MM:SS" を minutes (0-1439) に変換する pure helper。
 *
 * 設計判断:
 *   - 既存 toMinutes 流用ではなく、 同仕様で再実装 (= DayGraph 内部関数として独立、
 *     anchorOverlap への依存を作らない)
 *   - ISO 8601 形式は **reject** (= invalid_time warning 対象)
 *   - 1-2 桁 hour / 2 桁 minute / 秒部分 tolerant
 *   - range: hour ∈ [0, 23], minute ∈ [0, 59]
 *
 * 不変原則:
 *   - pure / no side effects
 *   - LLM 不使用
 */

import type { TimeBucket } from "./dayGraphTypes";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** 1 day = 1440 minutes */
export const MINUTES_PER_DAY = 1440;
/** 24:00 直前 = 23:59 (= 「点として 23:59」 = 1439 分) */
export const END_OF_DAY_HHMM = "23:59";

const HHMM_PATTERN = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Strict parse
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * "HH:MM" / "HH:MM:SS" を minutes (0-1439) に変換。
 *
 * Strict 仕様:
 *   - null / undefined / 空 / whitespace-only → null
 *   - ISO 8601 形式 ("2026-05-22T14:00:00Z" 等) → null (= 拒否)
 *   - その他不正 ("abc" / "9-00" 等) → null
 *   - 範囲外 (25:00 / 23:99 等) → null
 *
 * @returns 0-1439 の整数、 または null (= 不正)
 */
export function parseHHMMtoMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const trimmed = time.trim();
  if (!trimmed) return null;
  const m = trimmed.match(HHMM_PATTERN);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return h * 60 + min;
}

/**
 * minutes (0-1439) を "HH:MM" 文字列に変換。
 * 範囲外は END_OF_DAY_HHMM ("23:59") で cap。
 */
export function minutesToHHMM(minutes: number): string {
  let safe = Math.floor(minutes);
  if (!Number.isFinite(safe)) return "00:00";
  if (safe < 0) safe = 0;
  if (safe >= MINUTES_PER_DAY) safe = MINUTES_PER_DAY - 1; // = 23:59
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TimeBucket classification
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * minutes から TimeBucket を判定。
 *
 * 帯定義 (= 設計 §4.1):
 *   - early_morning: [05:00, 08:00)
 *   - morning:       [08:00, 11:00)
 *   - noon:          [11:00, 14:00)
 *   - afternoon:     [14:00, 17:00)
 *   - evening:       [17:00, 20:00)
 *   - night:         [20:00, 23:00)
 *   - late_night:    [23:00, 24:00) ∪ [00:00, 05:00)
 */
export function bucketFromMinutes(minutes: number): TimeBucket {
  // 23:00 (= 1380) 以降、 または 05:00 (= 300) 未満 → late_night
  if (minutes >= 1380 || minutes < 300) return "late_night";
  if (minutes < 480) return "early_morning";   // [05:00, 08:00)
  if (minutes < 660) return "morning";          // [08:00, 11:00)
  if (minutes < 840) return "noon";             // [11:00, 14:00)
  if (minutes < 1020) return "afternoon";       // [14:00, 17:00)
  if (minutes < 1200) return "evening";         // [17:00, 20:00)
  return "night";                                // [20:00, 23:00)
}

/**
 * "HH:MM" 直接版 (= convenience)。 不正なら "late_night" を fallback (= 防御)。
 */
export function bucketFromHHMM(hhmm: string): TimeBucket {
  const min = parseHHMMtoMinutes(hhmm);
  if (min === null) return "late_night";
  return bucketFromMinutes(min);
}
