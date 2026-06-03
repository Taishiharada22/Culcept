/**
 * CalendarTab view mode（week ⇄ month grid）の pure な state 解決。
 * Plan 月ビュー Phase 2-A+ M3-a。
 *
 * UI 非依存・副作用なし・現在時刻参照なし。toggle を出すか / 既定 view を pure に固定し、
 * jsdom を足さずに（renderToStaticMarkup 規約内で）state ロジックを test 可能にする。
 *
 * 設計: M3 mini design（2026-06-03 CEO chat 承認）。
 */

export type CalendarViewMode = "week" | "month";

/** 既定 view。CEO 決定: 既存体験を壊さないため week。 */
export const DEFAULT_CALENDAR_VIEW_MODE: CalendarViewMode = "week";

/**
 * week ⇄ month toggle を表示するか。
 *
 * M3-a 時点では「flag が有効なときだけ出す」だけ（month grid 本体接続は M3-b）。
 * flag OFF なら toggle は出ず、CalendarTab は既存 week strip と完全同一。
 *
 * @param monthGridEnabled PLAN_FLAGS.calendarMonthGridEnabled
 */
export function shouldShowCalendarViewToggle(monthGridEnabled: boolean): boolean {
  return monthGridEnabled === true;
}
