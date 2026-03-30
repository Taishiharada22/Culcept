// Origin v8 — Life Calendar Engine (人生カレンダー)
// 誕生から現在までの月ごとの探索度をグリッドで可視化

import type {
  LifeCalendarCell,
  LifePeriod,
  OriginV7Save,
} from "./types";

/* ─── Grid Type ─── */

export type LifeCalendarGrid = {
  /** [yearIndex][monthIndex 0-11] */
  cells: LifeCalendarCell[][];
  birthYear: number;
  birthMonth: number;
  totalMonths: number;
  exploredMonths: number;
  exploredDays: number;
};

/* ─── Period Age Ranges ─── */

const PERIOD_AGE_RANGES: Record<LifePeriod, { min: number; max: number }> = {
  early_childhood: { min: 0, max: 6 },
  elementary: { min: 7, max: 12 },
  middle_school: { min: 13, max: 15 },
  high_school: { min: 16, max: 18 },
  late_teens: { min: 18, max: 20 },
  early_twenties: { min: 21, max: 25 },
  mid_twenties: { min: 26, max: 29 },
  thirties: { min: 30, max: 39 },
  forties_plus: { min: 40, max: 120 },
  special_period: { min: 0, max: 120 },
};

/* ─── ageToPeriod helper ─── */

export function ageToPeriod(age: number): LifePeriod {
  if (age <= 6) return "early_childhood";
  if (age <= 12) return "elementary";
  if (age <= 15) return "middle_school";
  if (age <= 18) return "high_school";
  if (age <= 20) return "late_teens";
  if (age <= 25) return "early_twenties";
  if (age <= 29) return "mid_twenties";
  if (age <= 39) return "thirties";
  return "forties_plus";
}

/* ─── Derive Life Calendar ─── */

export function deriveLifeCalendar(save: OriginV7Save): LifeCalendarGrid | null {
  const birthYear = save.birthYear;
  const birthMonth = save.birthMonth;
  if (!birthYear || !birthMonth) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-indexed

  const gems = save.memoryGems ?? [];
  const answers = save.microQuestionAnswers ?? [];
  const chapters = save.chapters ?? [];

  // Build gem lookup by year-month
  const gemsByYearMonth = new Map<string, string[]>();
  for (const gem of gems) {
    const key = `${gem.calendarYear}-${gem.calendarMonth}`;
    const existing = gemsByYearMonth.get(key) ?? [];
    existing.push(gem.id);
    gemsByYearMonth.set(key, existing);
  }

  // Build answer lookup by year-month
  const answersByYearMonth = new Map<string, string[]>();
  for (const ans of answers) {
    if (ans.calendarYear != null && ans.calendarMonth != null) {
      const key = `${ans.calendarYear}-${ans.calendarMonth}`;
      const existing = answersByYearMonth.get(key) ?? [];
      existing.push(ans.questionId);
      answersByYearMonth.set(key, existing);
    }
  }

  // Build chapter lookup by period -> age range -> year-month
  const chaptersByYearMonth = new Map<string, string[]>();
  for (const chapter of chapters) {
    const period = chapter.fact.period;
    const range = PERIOD_AGE_RANGES[period];
    if (!range) continue;

    const startYear = birthYear + range.min;
    const endYear = Math.min(birthYear + range.max, currentYear);

    for (let y = startYear; y <= endYear; y++) {
      for (let m = 1; m <= 12; m++) {
        const key = `${y}-${m}`;
        const existing = chaptersByYearMonth.get(key) ?? [];
        existing.push(chapter.id);
        chaptersByYearMonth.set(key, existing);
      }
    }
  }

  // Build grid
  const cells: LifeCalendarCell[][] = [];
  let totalMonths = 0;
  let exploredMonths = 0;
  let exploredDays = 0;

  for (let yearIdx = 0; yearIdx <= currentYear - birthYear; yearIdx++) {
    const year: number = birthYear + yearIdx;
    const row: LifeCalendarCell[] = [];

    for (let monthIdx = 0; monthIdx < 12; monthIdx++) {
      const month = monthIdx + 1;
      const key = `${year}-${month}`;

      const cellGems = gemsByYearMonth.get(key) ?? [];
      const cellAnswers = answersByYearMonth.get(key) ?? [];
      const cellChapters = chaptersByYearMonth.get(key) ?? [];

      // Check if cell is before birth
      const isBeforeBirth = year < birthYear || (year === birthYear && month < birthMonth);
      // Check if cell is after current month
      const isAfterNow = year > currentYear || (year === currentYear && month > currentMonth);

      let explorationDepth: number;

      if (isBeforeBirth || isAfterNow) {
        explorationDepth = -1;
      } else {
        const hasAnswers = cellAnswers.length > 0;
        const hasGemOrChapter = cellGems.length > 0 || cellChapters.length > 0;
        const hasMultiple =
          cellGems.length + cellAnswers.length + cellChapters.length >= 3;

        if (hasMultiple) {
          explorationDepth = 4; // deeply explored
        } else if (hasAnswers && hasGemOrChapter) {
          explorationDepth = 3; // has both answers and gems/chapters
        } else if (hasGemOrChapter) {
          explorationDepth = 2; // has gem or chapter
        } else if (hasAnswers) {
          explorationDepth = 1; // has micro answers only
        } else {
          explorationDepth = 0; // empty
        }

        totalMonths++;
        if (explorationDepth > 0) {
          exploredMonths++;
          // Approximate explored days based on depth
          exploredDays += Math.min(explorationDepth * 7, 30);
        }
      }

      row.push({
        year,
        month,
        explorationDepth,
        microQuestionIds: cellAnswers,
        memoryGemIds: cellGems,
        chapterIds: cellChapters,
      });
    }

    cells.push(row);
  }

  return {
    cells,
    birthYear,
    birthMonth,
    totalMonths,
    exploredMonths,
    exploredDays,
  };
}
