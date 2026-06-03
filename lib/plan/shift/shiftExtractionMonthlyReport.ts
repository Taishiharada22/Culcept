/**
 * シフト抽出 月次レポート（pure）— SR B1b-1
 *
 * 目的: 「本人行 crop が既にある状態」で 3〜7月の 5ヶ月に対し、抽出 robustness を
 *   横断採点する。単月採点器（scoreExtraction）を 5ヶ月へ集約し、CEO 指定の追加指標
 *   （coverage / blank-skip / invalid code / H・BD・HREQ・N・E-18 識別）を 1 レポートに束ねる。
 *
 * 重要スコープ（CEO 補正・2026-05-31）:
 *   - 本モジュールは「**crop 済み本人行**の抽出 robustness 評価（= B1b-1）」であり、
 *     full 画像から本人行を拾う B1b 本体（assisted crop = B1b-2）ではない。
 *   - **VLM は呼ばない**。VLM 出力（mock / fixture / gitignored runner の実出力）を受け取って
 *     採点するだけ。VLM 実行は CEO gate。
 *
 * 不変原則:
 *   - pure（IO / LLM / Date / random / env なし）、throw しない。
 *   - golden は**引数注入**（tests/ の SHIFT_MONTH_GOLDENS を import しない＝層の独立性）。
 *   - 既存 scoreExtraction / shiftExtractionContract を再利用し、車輪の再発明をしない。
 */

import type { ExtractedShiftCell } from "./shiftExtractionContract";
import { scoreExtraction, type ExtractionScore } from "./shiftExtractionScoring";
import {
  lookupCode,
  normalizeRawCode,
  type ShiftCodeDictionary,
} from "./shiftCodeDictionary";

/** bootstrap golden の既定年（原田 SPRIX 表は 2025 扱い） */
export const DEFAULT_GOLDEN_YEAR = 2025;

/** 既定の合格しきい値（B1a-v2 = 96.8% を基準線に 95%） */
export const DEFAULT_CELL_ACCURACY_THRESHOLD = 0.95;

/** CEO 指定の識別対象コード（混同を個別追跡） */
export const TRACKED_CODES = ["H", "BD", "HREQ", "N", "E-18"] as const;

/** 単月 golden（codes は day-1 index、""=空セル）。tests の MonthGolden と構造互換。 */
export interface MonthGoldenInput {
  name: string;
  month: number;
  daysInMonth: number;
  codes: readonly string[];
}

/** 1 コードの識別成績（date 一致ベース） */
export interface CodeIdentification {
  /** 正規化済 rawCode */
  code: string;
  /** golden 上の出現数 */
  expected: number;
  /** golden===C ∧ extracted===C */
  correct: number;
  /** extracted===C ∧ golden!==C（取り違え） */
  falsePositive: number;
  /** correct===expected ∧ falsePositive===0 */
  ok: boolean;
}

/** 辞書外コード（dictionary 未登録・非空） */
export interface InvalidCodeFinding {
  date: string;
  /** 正規化済 rawCode */
  rawCode: string;
}

/** 月内 day 被覆（date-keyed・抽出 vs golden） */
export interface MonthCoverage {
  expectedDays: number;
  /** golden 日付のうち抽出に存在した数 */
  presentDays: number;
  /** 抽出に無い日番号 */
  missingDays: number[];
  /** 抽出で重複した日番号 */
  duplicateDays: number[];
  ok: boolean;
}

/** 単月レポート（既存 ExtractionScore + B1b-1 追加指標） */
export interface MonthExtractionReport {
  name: string;
  month: number;
  /** 既存採点器（cellAccuracy / H / N / E-18 / empty / blankSkip / mismatches） */
  score: ExtractionScore;
  /** H / BD / HREQ / N / E-18 の識別成績 */
  codeIdentification: CodeIdentification[];
  /** 辞書外コード */
  invalidCodes: InvalidCodeFinding[];
  coverage: MonthCoverage;
  /** cellAccuracy>=閾値 ∧ coverage.ok ∧ blankSkip.ok ∧ invalid==0 */
  pass: boolean;
}

/** 全月集約 */
export interface MultiMonthOverall {
  totalGoldenCells: number;
  matchedCells: number;
  cellAccuracy: number;
  monthsPassed: number;
  monthsTotal: number;
  invalidCodeTotal: number;
  blankSkipDetectedMonths: number;
  /** 全月合算の code 識別 */
  codeIdentification: CodeIdentification[];
  allPass: boolean;
}

export interface MultiMonthExtractionReport {
  months: MonthExtractionReport[];
  overall: MultiMonthOverall;
}

export interface ScoreOptions {
  year?: number;
  cellAccuracyThreshold?: number;
}

export interface MonthExtractionInput {
  golden: MonthGoldenInput;
  /** VLM 出力由来（mock / fixture / runner 実出力）。date-keyed。 */
  extracted: ExtractedShiftCell[];
}

/** "YYYY-MM-DD" → 日番号 */
function dayOf(date: string): number {
  return Number.parseInt(date.slice(8, 10), 10);
}

/**
 * golden codes → ExtractedShiftCell[]（採点器入力に正規化。date は決定的に解決）。
 * runner が JULY_CODES.map で inline していた処理を共有化。
 */
export function monthGoldenToExtracted(
  golden: MonthGoldenInput,
  year: number = DEFAULT_GOLDEN_YEAR
): ExtractedShiftCell[] {
  const mm = String(golden.month).padStart(2, "0");
  return golden.codes.map((rawCode, i) => ({
    date: `${year}-${mm}-${String(i + 1).padStart(2, "0")}`,
    rawCode,
    rowLabel: golden.name,
  }));
}

function computeCodeIdentification(
  extracted: ExtractedShiftCell[],
  golden: ExtractedShiftCell[],
  codes: readonly string[]
): CodeIdentification[] {
  const goldenByDate = new Map<string, string>();
  for (const c of golden) goldenByDate.set(c.date, normalizeRawCode(c.rawCode));
  const extractedByDate = new Map<string, string>();
  for (const c of extracted)
    extractedByDate.set(c.date, normalizeRawCode(c.rawCode));

  return codes.map((raw) => {
    const code = normalizeRawCode(raw);
    let expected = 0;
    let correct = 0;
    let falsePositive = 0;
    for (const [date, g] of goldenByDate) {
      if (g === code) {
        expected += 1;
        if (extractedByDate.get(date) === code) correct += 1;
      }
    }
    for (const [date, e] of extractedByDate) {
      if (e === code && goldenByDate.get(date) !== code) falsePositive += 1;
    }
    return {
      code,
      expected,
      correct,
      falsePositive,
      ok: correct === expected && falsePositive === 0,
    };
  });
}

function computeInvalidCodes(
  extracted: ExtractedShiftCell[],
  dictionary: ShiftCodeDictionary
): InvalidCodeFinding[] {
  const out: InvalidCodeFinding[] = [];
  for (const c of extracted) {
    const norm = normalizeRawCode(c.rawCode);
    if (norm === "") continue; // 空セルは invalid ではない
    if (lookupCode(dictionary, c.rawCode) === null) {
      out.push({ date: c.date, rawCode: norm });
    }
  }
  return out;
}

function computeCoverage(
  extracted: ExtractedShiftCell[],
  golden: ExtractedShiftCell[]
): MonthCoverage {
  const goldenDates = new Set(golden.map((c) => c.date));
  const counts = new Map<string, number>();
  for (const c of extracted) counts.set(c.date, (counts.get(c.date) ?? 0) + 1);

  const missingDays: number[] = [];
  let presentDays = 0;
  for (const d of goldenDates) {
    if (counts.has(d)) presentDays += 1;
    else missingDays.push(dayOf(d));
  }
  const duplicateDays: number[] = [];
  for (const [date, n] of counts) {
    if (n > 1 && goldenDates.has(date)) duplicateDays.push(dayOf(date));
  }
  missingDays.sort((a, b) => a - b);
  duplicateDays.sort((a, b) => a - b);

  return {
    expectedDays: goldenDates.size,
    presentDays,
    missingDays,
    duplicateDays,
    ok: missingDays.length === 0 && duplicateDays.length === 0,
  };
}

/** 単月の抽出を採点して MonthExtractionReport にまとめる（pure） */
export function scoreMonthExtraction(
  extracted: ExtractedShiftCell[],
  golden: MonthGoldenInput,
  dictionary: ShiftCodeDictionary,
  options: ScoreOptions = {}
): MonthExtractionReport {
  const year = options.year ?? DEFAULT_GOLDEN_YEAR;
  const threshold =
    options.cellAccuracyThreshold ?? DEFAULT_CELL_ACCURACY_THRESHOLD;
  const goldenExtracted = monthGoldenToExtracted(golden, year);

  const score = scoreExtraction(extracted, goldenExtracted);
  const codeIdentification = computeCodeIdentification(
    extracted,
    goldenExtracted,
    TRACKED_CODES
  );
  const invalidCodes = computeInvalidCodes(extracted, dictionary);
  const coverage = computeCoverage(extracted, goldenExtracted);

  const pass =
    score.cellAccuracy >= threshold &&
    coverage.ok &&
    score.blankSkipShift.ok &&
    invalidCodes.length === 0;

  return {
    name: golden.name,
    month: golden.month,
    score,
    codeIdentification,
    invalidCodes,
    coverage,
    pass,
  };
}

/** 全月を採点・集約（pure） */
export function scoreMultiMonthExtraction(
  inputs: MonthExtractionInput[],
  dictionary: ShiftCodeDictionary,
  options: ScoreOptions = {}
): MultiMonthExtractionReport {
  const months = inputs.map((i) =>
    scoreMonthExtraction(i.extracted, i.golden, dictionary, options)
  );

  let totalGoldenCells = 0;
  let matchedCells = 0;
  let invalidCodeTotal = 0;
  let blankSkipDetectedMonths = 0;
  let monthsPassed = 0;
  for (const m of months) {
    totalGoldenCells += m.score.totalGoldenCells;
    matchedCells += m.score.matchedCells;
    invalidCodeTotal += m.invalidCodes.length;
    if (m.score.blankSkipShift.detected) blankSkipDetectedMonths += 1;
    if (m.pass) monthsPassed += 1;
  }

  // 全月合算 codeIdentification
  const agg = new Map<string, CodeIdentification>();
  for (const raw of TRACKED_CODES) {
    const code = normalizeRawCode(raw);
    agg.set(code, { code, expected: 0, correct: 0, falsePositive: 0, ok: true });
  }
  for (const m of months) {
    for (const ci of m.codeIdentification) {
      const a = agg.get(ci.code);
      if (!a) continue;
      a.expected += ci.expected;
      a.correct += ci.correct;
      a.falsePositive += ci.falsePositive;
    }
  }
  const codeIdentification = [...agg.values()].map((a) => ({
    ...a,
    ok: a.correct === a.expected && a.falsePositive === 0,
  }));

  const cellAccuracy =
    totalGoldenCells === 0 ? 0 : matchedCells / totalGoldenCells;
  const allPass = months.length > 0 && monthsPassed === months.length;

  return {
    months,
    overall: {
      totalGoldenCells,
      matchedCells,
      cellAccuracy,
      monthsPassed,
      monthsTotal: months.length,
      invalidCodeTotal,
      blankSkipDetectedMonths,
      codeIdentification,
      allPass,
    },
  };
}
