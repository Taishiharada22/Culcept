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
  /** 空セル誤読（密表 VLM の典型失敗。GPT B1a 指標） */
  emptyCell: {
    expectedEmpty: number;
    falseContent: number; // golden 空なのに何か読んだ（幻覚）
    missedContent: number; // golden に記号があるのに空と読んだ
    ok: boolean;
  };
  /**
   * blank-skip shift（B1a cross-month の真の失敗モード）。
   * 真の空セルを飛ばし、以降を 1 つ前に詰めて読む = coverage 通過のまま内容 shift。
   * ※ golden 有り（eval）での検出指標。production（golden 無し）では clean に
   *   終わる shift は構造署名を残さない → 確認画面が final safety net。
   */
  blankSkipShift: {
    expectedBlanks: number; // golden の空セル数
    blanksReadCorrectly: number; // 空として正読できた数
    blanksMissed: number; // 空を非空で埋めた数（skip の起点）
    pullForwardMismatches: number; // 不一致 かつ extracted[D]==golden[D+1]（前詰め署名）
    detected: boolean; // blanksMissed>0 && pullForward>0
    ok: boolean; // blanksMissed==0 && pullForward==0
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

  // 空セル誤読: golden 空なのに何か読んだ（幻覚）/ golden に記号があるのに空と読んだ
  let expectedEmpty = 0;
  let falseContent = 0;
  let missedContent = 0;
  for (const [date, expected] of goldenByDate) {
    const got = extractedByDate.get(date);
    const goldenEmpty = expected === "";
    if (goldenEmpty) {
      expectedEmpty += 1;
      if (got !== undefined && got !== "") falseContent += 1;
    } else if (got === "") {
      missedContent += 1;
    }
  }

  // blank-skip shift: 空見落とし + pull-forward 署名（extracted[D]==golden[D+1]）
  const sortedDates = [...goldenByDate.keys()].sort();
  let expectedBlanks = 0;
  let blanksReadCorrectly = 0;
  let blanksMissed = 0;
  let pullForward = 0;
  for (let i = 0; i < sortedDates.length; i += 1) {
    const date = sortedDates[i];
    const exp = goldenByDate.get(date)!;
    const got = extractedByDate.get(date) ?? null;
    if (exp === "") {
      expectedBlanks += 1;
      if (got === "") blanksReadCorrectly += 1;
      else blanksMissed += 1;
    }
    if (got !== null && got !== exp && i + 1 < sortedDates.length) {
      const nextExp = goldenByDate.get(sortedDates[i + 1]);
      if (got === nextExp) pullForward += 1;
    }
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
    emptyCell: {
      expectedEmpty,
      falseContent,
      missedContent,
      ok: falseContent === 0 && missedContent === 0,
    },
    blankSkipShift: {
      expectedBlanks,
      blanksReadCorrectly,
      blanksMissed,
      pullForwardMismatches: pullForward,
      detected: blanksMissed > 0 && pullForward > 0,
      ok: blanksMissed === 0 && pullForward === 0,
    },
  };
}
