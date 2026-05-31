/**
 * Target month helpers — pure（SR B1b-2C-8-c-3）
 *
 * 役割: dev-shift-draft host の対象月入力（<input type="month"> = "YYYY-MM"）の
 *   parse / format と、targetYear/targetMonth からの daysInMonth 再計算を純関数で提供する。
 *
 * 設計核心（CEO 補正・2026-06-01）:
 *   - シフト表は「対象月」が本質。現在月固定にすると過去月/来月の表で日付変換がズレる。
 *     → client が targetMonth を持ち、変更に応じて daysInMonth を再計算する。
 *   - 範囲は server runner（runExtractShiftDraft.parseFormData）と整合:
 *       year 2020..2100 / month 1..12 / daysInMonth 28..31。
 *
 * 不変原則: pure（IO / DOM / Date / random / env なし）。throw しない（不正は null / 防御値）。
 */

const MIN_YEAR = 2020;
const MAX_YEAR = 2100;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** グレゴリオ暦の閏年判定（pure）。 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * 対象年月から当月日数を算出（pure・Date 非依存）。
 * - month は 1..12。範囲外は防御的に 30 を返す（呼び元の validation が本筋）。
 * - 2 月は閏年なら 29、それ以外 28。
 */
export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 30;
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1];
}

/** year/month → "YYYY-MM"（<input type="month"> の value 形式）。 */
export function formatMonthInput(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * "YYYY-MM" → { year, month }。
 * - 形式不正 / 範囲外（year 2020..2100, month 1..12）→ null。
 * - server parseFormData と同じ範囲に揃える（不一致での action 弾きを防ぐ）。
 */
export function parseMonthInput(
  value: string
): { year: number; month: number } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  return { year, month };
}
