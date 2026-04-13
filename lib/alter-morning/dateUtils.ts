/**
 * Morning Protocol — 日付ユーティリティ（JST基準）
 *
 * Morning Protocol は日本のユーザー向け。
 * UTC日付だとJST 0:00-8:59が前日扱いになるため、
 * 全日付判定をJST基準に統一する。
 *
 * 影響範囲:
 * - followUpTracker.ts: 日次リセット判定
 * - journalPrompt.ts: 誘導日付記録
 * - weekdayPatterns.ts: ストリーク判定
 * - proactiveInsights.ts: スロットル判定
 * - morningProtocol.ts: プラン日付
 */

const JST_OFFSET_MS = 9 * 60 * 60 * 1000; // UTC+9

/**
 * JST基準の「今日」をYYYY-MM-DD形式で返す。
 */
export function todayJST(): string {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return jst.toISOString().split("T")[0];
}

/**
 * JST基準の曜日を返す（0=日, 1=月, ..., 6=土）。
 */
export function dayOfWeekJST(): number {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return jst.getUTCDay();
}

/**
 * JST基準の現在時刻（時）を返す。
 */
export function currentHourJST(): number {
  const jst = new Date(Date.now() + JST_OFFSET_MS);
  return jst.getUTCHours();
}
