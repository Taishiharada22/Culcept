/**
 * シフト表 VLM 抽出 — 出力 contract（VLM = parser）
 *
 * 設計書: docs/alter-plan-shift-import-contract-and-day-indicator-design.md §2
 *
 * VLM の責務は「rawCode を正確に読む」だけ（意味判定はしない）。
 * 本モジュールは VLM 出力 JSON を検証し、projection 入力へ写像する pure 層。
 *
 * 不変原則: pure（IO / LLM なし）。VLM 呼び出し本体は別（B1・CEO gate）。
 */

import type { ShiftCellReading } from "./shiftRosterProjection";
import { normalizeRawCode } from "./shiftCodeDictionary";

/** VLM が 1 セルについて埋める contract */
export interface ExtractedShiftCell {
  /** YYYY-MM-DD（列ヘッダ + 月/年 から解決） */
  date: string;
  /** 原稿の表記そのまま（"N" / "E-18" / ""=空セル）。意味解釈しない */
  rawCode: string;
  /** 読めた人名（本人行の照合用） */
  rowLabel: string;
  /** 任意: セル塗り色のヒント */
  colorHint?: string | null;
  /** 任意: 出典領域 [x, y, w, h] */
  bbox?: [number, number, number, number] | null;
  /** 任意: 連絡事項欄エントリへの参照 */
  notesRef?: string | null;
  /** 任意: VLM 信頼度 0..1（低信頼セルを確認画面で優先） */
  confidence?: number | null;
}

export interface ExtractionValidationError {
  index: number;
  field: string;
  message: string;
}

export interface ExtractionValidationResult {
  /** 検証を通ったセル */
  cells: ExtractedShiftCell[];
  /** 弾いた項目（沈黙させない） */
  errors: ExtractionValidationError[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * VLM 出力（unknown）を ExtractedShiftCell[] に防御的検証する。
 * - date は YYYY-MM-DD 必須
 * - rawCode は string 必須（空文字は空セルとして許容）
 * - rowLabel は string 必須
 * - 任意 field は型が合わない場合だけ無視（致命にしない）
 */
export function validateExtractedCells(
  raw: unknown
): ExtractionValidationResult {
  const cells: ExtractedShiftCell[] = [];
  const errors: ExtractionValidationError[] = [];

  if (!Array.isArray(raw)) {
    return {
      cells,
      errors: [{ index: -1, field: "root", message: "expected an array" }],
    };
  }

  raw.forEach((item, index) => {
    if (item === null || typeof item !== "object") {
      errors.push({ index, field: "item", message: "expected an object" });
      return;
    }
    const obj = item as Record<string, unknown>;

    if (typeof obj.date !== "string" || !DATE_RE.test(obj.date)) {
      errors.push({
        index,
        field: "date",
        message: "date is required (YYYY-MM-DD)",
      });
      return;
    }
    if (typeof obj.rawCode !== "string") {
      errors.push({
        index,
        field: "rawCode",
        message: "rawCode is required (string; '' = empty cell)",
      });
      return;
    }
    if (typeof obj.rowLabel !== "string") {
      errors.push({
        index,
        field: "rowLabel",
        message: "rowLabel is required (string)",
      });
      return;
    }

    const cell: ExtractedShiftCell = {
      date: obj.date,
      rawCode: obj.rawCode,
      rowLabel: obj.rowLabel,
    };
    if (typeof obj.colorHint === "string") cell.colorHint = obj.colorHint;
    if (
      Array.isArray(obj.bbox) &&
      obj.bbox.length === 4 &&
      obj.bbox.every(isFiniteNumber)
    ) {
      cell.bbox = obj.bbox as [number, number, number, number];
    }
    if (typeof obj.notesRef === "string") cell.notesRef = obj.notesRef;
    if (isFiniteNumber(obj.confidence)) cell.confidence = obj.confidence;

    cells.push(cell);
  });

  return { cells, errors };
}

/**
 * ExtractedShiftCell[] を projection 入力（ShiftCellReading[]）へ写像。
 * projection 層（Step1）をそのまま再利用するための橋渡し。
 */
export function extractedToCellReadings(
  cells: ExtractedShiftCell[]
): ShiftCellReading[] {
  return cells.map((c) => ({
    date: c.date,
    rawCode: c.rawCode,
    rawColor: c.colorHint ?? null,
  }));
}

/**
 * 指定の rowLabel（本人）に一致するセルだけを残す（本人行 filter）。
 * 完全一致でなく、空白除去後の包含で緩く判定（"原田 大志" / "原田大志" 揺れ吸収）。
 */
export function filterByPersonRow(
  cells: ExtractedShiftCell[],
  personName: string
): ExtractedShiftCell[] {
  const target = personName.replace(/\s+/g, "");
  return cells.filter((c) => c.rowLabel.replace(/\s+/g, "").includes(target));
}

// ─────────────────────────────────────────────────────────────
// day-keyed 抽出（B1a-v2・列アンカー設計）
//
// B1a 第1走で密表 tail の +1 列シフトを検出。原因 = 配列順で日付推定 →
// 1列ドロップが silent に伝播。対策 = 各セルを「印字された日番号」に紐づけ、
// coverage(missing/duplicate) を検出可能にする（CEO/GPT 補正）。
// ─────────────────────────────────────────────────────────────

/** VLM が日番号付きで埋めるセル（B1a-v2 contract） */
export interface DayKeyedShiftCell {
  /** ヘッダの印字日番号 1..daysInMonth（配列順で推定しない） */
  day: number;
  /** 原文の表記そのまま（""=空セル） */
  rawCode: string;
  /** 読めた人名 */
  rowLabel: string;
  /** 任意: 信頼度 0..1（日番号不明なら下げる） */
  confidence?: number | null;
}

/** 1..daysInMonth の被覆状況 */
export interface DayCoverage {
  expectedDays: number;
  presentDays: number[]; // sorted unique
  missing: number[];
  duplicates: number[];
}

export interface DayKeyedValidationResult {
  cells: DayKeyedShiftCell[];
  errors: ExtractionValidationError[];
  coverage: DayCoverage;
}

/**
 * day-keyed VLM 出力を防御的検証 + coverage 算出。
 * day が 1..daysInMonth の整数でなければ弾く。rawCode/rowLabel は string 必須。
 */
export function validateDayKeyedCells(
  raw: unknown,
  daysInMonth: number
): DayKeyedValidationResult {
  const cells: DayKeyedShiftCell[] = [];
  const errors: ExtractionValidationError[] = [];

  if (!Array.isArray(raw)) {
    return {
      cells,
      errors: [{ index: -1, field: "root", message: "expected an array" }],
      coverage: { expectedDays: daysInMonth, presentDays: [], missing: [], duplicates: [] },
    };
  }

  raw.forEach((item, index) => {
    if (item === null || typeof item !== "object") {
      errors.push({ index, field: "item", message: "expected an object" });
      return;
    }
    const obj = item as Record<string, unknown>;
    if (
      typeof obj.day !== "number" ||
      !Number.isInteger(obj.day) ||
      obj.day < 1 ||
      obj.day > daysInMonth
    ) {
      errors.push({
        index,
        field: "day",
        message: `day must be an integer 1..${daysInMonth}`,
      });
      return;
    }
    if (typeof obj.rawCode !== "string") {
      errors.push({ index, field: "rawCode", message: "rawCode is required" });
      return;
    }
    if (typeof obj.rowLabel !== "string") {
      errors.push({ index, field: "rowLabel", message: "rowLabel is required" });
      return;
    }
    const cell: DayKeyedShiftCell = {
      day: obj.day,
      rawCode: obj.rawCode,
      rowLabel: obj.rowLabel,
    };
    if (isFiniteNumber(obj.confidence)) cell.confidence = obj.confidence;
    cells.push(cell);
  });

  // coverage
  const counts = new Map<number, number>();
  for (const c of cells) counts.set(c.day, (counts.get(c.day) ?? 0) + 1);
  const presentDays = [...counts.keys()].sort((a, b) => a - b);
  const duplicates = presentDays.filter((d) => (counts.get(d) ?? 0) > 1);
  const missing: number[] = [];
  for (let d = 1; d <= daysInMonth; d += 1) {
    if (!counts.has(d)) missing.push(d);
  }

  return {
    cells,
    errors,
    coverage: { expectedDays: daysInMonth, presentDays, missing, duplicates },
  };
}

/**
 * day-keyed セルを date 付き ExtractedShiftCell[] に変換（採点器で再利用）。
 * date は day から決定的に解決（VLM に日付整形をさせない）。
 */
export function dayKeyedToExtracted(
  cells: DayKeyedShiftCell[],
  year: number,
  month: number
): ExtractedShiftCell[] {
  const mm = String(month).padStart(2, "0");
  return cells.map((c) => ({
    date: `${year}-${mm}-${String(c.day).padStart(2, "0")}`,
    rawCode: c.rawCode,
    rowLabel: c.rowLabel,
    confidence: c.confidence ?? null,
  }));
}

/** rawCode 正規化を re-export（採点器と共有） */
export { normalizeRawCode };
