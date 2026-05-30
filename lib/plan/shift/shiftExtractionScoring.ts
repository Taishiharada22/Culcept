/**
 * シフト抽出 採点器（pure）
 *
 * 設計書: docs/alter-plan-shift-import-contract-and-day-indicator-design.md
 *
 * 抽出結果（VLM）を golden（人間確定の読み）と突き合わせ、reading 精度を測る。
 * 採点は layer1（rawCode を正しく読めたか）で行う = 意味/辞書に依存しない。
 *
 * GPT 指定の精度確認:
 *   - 31 セル中何セル正しいか（cellAccuracy）
 *   - H の個数（publicHoliday count 一致）
 *   - N の日跨ぎ（夜勤セルが正しく N と読めたか）
 *   - E-18 の識別（E と取り違えないか）
 */

import type { ExtractedShiftCell } from "./shiftExtractionContract";
import { normalizeRawCode } from "./shiftCodeDictionary";

export interface CellMismatch {
  date: string;
  expected: string; // golden rawCode（normalize 済）
  got: string | null; // 抽出 rawCode（normalize 済）。欠落は null
}

export interface ExtractionScore {
  totalGoldenCells: number;
  matchedCells: number;
  /** matchedCells / totalGoldenCells（0..1） */
  cellAccuracy: number;
  mismatches: CellMismatch[];
  /** 抽出に余分にあった（golden に無い日付の）セル */
  extraneousDates: string[];
  /** H 個数の一致（公休 checksum の reading 版） */
  publicHoliday: { expected: number; got: number; match: boolean };
  /** N（夜勤・日跨ぎ）が正しく読めたか */
  nightShift: { expectedDates: string[]; correct: number; ok: boolean };
  /** E-18 識別（E との取り違えがないか） */
  e18: {
    expected: number;
    correct: number;
    falsePositive: number; // golden が E-18 でないのに E-18 と読んだ数
    ok: boolean;
  };
}

function indexByDate(
  cells: ExtractedShiftCell[]
): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of cells) {
    m.set(c.date, normalizeRawCode(c.rawCode));
  }
  return m;
}

function countCode(cells: ExtractedShiftCell[], code: string): number {
  const target = normalizeRawCode(code);
  let n = 0;
  for (const c of cells) {
    if (normalizeRawCode(c.rawCode) === target) n += 1;
  }
  return n;
}

/**
 * 抽出 vs golden を採点する（pure）。
 */
export function scoreExtraction(
  extracted: ExtractedShiftCell[],
  golden: ExtractedShiftCell[]
): ExtractionScore {
  const goldenByDate = indexByDate(golden);
  const extractedByDate = indexByDate(extracted);

  let matched = 0;
  const mismatches: CellMismatch[] = [];

  for (const [date, expected] of goldenByDate) {
    const got = extractedByDate.get(date) ?? null;
    if (got === expected) {
      matched += 1;
    } else {
      mismatches.push({ date, expected, got });
    }
  }

  const extraneousDates: string[] = [];
  for (const date of extractedByDate.keys()) {
    if (!goldenByDate.has(date)) extraneousDates.push(date);
  }

  const total = goldenByDate.size;

  // H 個数
  const hExpected = countCode(golden, "H");
  const hGot = countCode(extracted, "H");

  // N（日跨ぎ）: golden の N 日付が抽出でも N か
  const nDates: string[] = [];
  for (const c of golden) {
    if (normalizeRawCode(c.rawCode) === "N") nDates.push(c.date);
  }
  let nCorrect = 0;
  for (const d of nDates) {
    if (extractedByDate.get(d) === "N") nCorrect += 1;
  }

  // E-18 識別: golden の E-18 を正しく読めたか + E を E-18 と誤読しないか
  const E18 = normalizeRawCode("E-18");
  const e18Dates = golden
    .filter((c) => normalizeRawCode(c.rawCode) === E18)
    .map((c) => c.date);
  let e18Correct = 0;
  for (const d of e18Dates) {
    if (extractedByDate.get(d) === E18) e18Correct += 1;
  }
  let e18FalsePositive = 0;
  for (const [date, code] of extractedByDate) {
    if (code === E18 && goldenByDate.get(date) !== E18) e18FalsePositive += 1;
  }

  return {
    totalGoldenCells: total,
    matchedCells: matched,
    cellAccuracy: total === 0 ? 0 : matched / total,
    mismatches,
    extraneousDates,
    publicHoliday: { expected: hExpected, got: hGot, match: hExpected === hGot },
    nightShift: {
      expectedDates: nDates,
      correct: nCorrect,
      ok: nCorrect === nDates.length,
    },
    e18: {
      expected: e18Dates.length,
      correct: e18Correct,
      falsePositive: e18FalsePositive,
      ok: e18Correct === e18Dates.length && e18FalsePositive === 0,
    },
  };
}
