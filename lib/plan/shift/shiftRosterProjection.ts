/**
 * シフト表 → /plan 反映候補 変換器（pure）
 *
 * 設計書: docs/alter-plan-shift-code-dictionary-design.md §5
 *
 * 読み取り済みセル（date × rawCode）を、ユーザー別辞書で意味解決し、
 * projectMode で振り分ける:
 *   - work（timed_event）   → タイムラインに時間付きイベント
 *   - off（day_indicator）  → 時間枠を作らず「休み」日レベル表示（CEO 指示）
 *   - off_request（candidate）→ 候補表示
 *   - unknown / none        → unresolved（確認画面で要ユーザー判断）
 *
 * 不変原則:
 *   - pure（IO なし、LLM なし、副作用なし）
 *   - 休みを timed event にしない（時間枠を作らない）
 *   - 辞書に無いコード・不整合は捨てず unresolved に集約（沈黙の欠落を防ぐ）
 */

import {
  type ShiftCodeDictionary,
  type ShiftCodeEntry,
  lookupCode,
  normalizeRawCode,
} from "./shiftCodeDictionary";

/** 読み取り済みの 1 セル（VLM 抽出 or 手動の出力） */
export interface ShiftCellReading {
  /** YYYY-MM-DD */
  date: string;
  /** 原稿の表記そのまま（"N" / "E-18"） */
  rawCode: string;
  /** 任意: セル色（layer1 補助） */
  rawColor?: string | null;
}

/** 勤務 → タイムライン時間付きイベント候補 */
export interface ProjectedTimedEvent {
  date: string;
  title: string;
  /** "HH:MM" */
  startTime: string;
  /** "HH:MM"（endsNextDay の場合は翌日の時刻） */
  endTime: string | null;
  /** 日跨ぎ（endTime < startTime） */
  endsNextDay: boolean;
  semanticType: string;
  rawCode: string;
}

/** 休み → 日レベル「休み」表示（時間枠なし） */
export interface ProjectedDayIndicator {
  date: string;
  label: string;
  semanticType: string;
  rawCode: string;
  countsAsPublicHoliday: boolean;
}

/** 希望休など → 候補表示 */
export interface ProjectedCandidate {
  date: string;
  label: string;
  semanticType: string;
  rawCode: string;
}

/** 解決できなかったセル（確認画面で要ユーザー判断） */
export interface UnresolvedCell {
  date: string;
  rawCode: string;
  reason: "unknown_code" | "missing_start_time" | "explicit_none";
}

/** 変換結果 */
export interface ShiftRosterProjection {
  timedEvents: ProjectedTimedEvent[];
  dayIndicators: ProjectedDayIndicator[];
  candidates: ProjectedCandidate[];
  unresolved: UnresolvedCell[];
}

/**
 * 空セル判定（rawCode が空 / 空白のみ）。
 * 空セルは「記載なし = イベントなし」なので何も生成しない（CEO ルール §1.4）。
 */
function isEmptyCell(rawCode: string): boolean {
  return normalizeRawCode(rawCode) === "";
}

/**
 * 1 セルを projectMode に従って振り分ける。
 */
function projectCell(
  cell: ShiftCellReading,
  entry: ShiftCodeEntry,
  out: ShiftRosterProjection
): void {
  switch (entry.projectMode) {
    case "timed_event": {
      // 勤務だが時刻欠落 = 辞書不整合 → unresolved（沈黙させない）
      if (!entry.startTime) {
        out.unresolved.push({
          date: cell.date,
          rawCode: cell.rawCode,
          reason: "missing_start_time",
        });
        return;
      }
      out.timedEvents.push({
        date: cell.date,
        title: entry.displayLabel,
        startTime: entry.startTime,
        endTime: entry.endTime,
        endsNextDay: entry.endsNextDay,
        semanticType: entry.semanticType,
        rawCode: entry.rawCode,
      });
      return;
    }
    case "day_indicator": {
      out.dayIndicators.push({
        date: cell.date,
        label: entry.displayLabel,
        semanticType: entry.semanticType,
        rawCode: entry.rawCode,
        countsAsPublicHoliday: entry.countsAsPublicHoliday,
      });
      return;
    }
    case "candidate": {
      out.candidates.push({
        date: cell.date,
        label: entry.displayLabel,
        semanticType: entry.semanticType,
        rawCode: entry.rawCode,
      });
      return;
    }
    case "none":
    default: {
      out.unresolved.push({
        date: cell.date,
        rawCode: cell.rawCode,
        reason: "explicit_none",
      });
      return;
    }
  }
}

/**
 * シフト表セル群を /plan 反映候補に変換する（pure）。
 *
 * @param cells 読み取り済みセル（空セルはスキップ）
 * @param dictionary ユーザー別シフトコード辞書
 */
export function projectShiftRoster(
  cells: ShiftCellReading[],
  dictionary: ShiftCodeDictionary
): ShiftRosterProjection {
  const out: ShiftRosterProjection = {
    timedEvents: [],
    dayIndicators: [],
    candidates: [],
    unresolved: [],
  };

  for (const cell of cells) {
    if (isEmptyCell(cell.rawCode)) {
      continue; // 空セル = 記載なし = イベントなし
    }
    const entry = lookupCode(dictionary, cell.rawCode);
    if (!entry) {
      out.unresolved.push({
        date: cell.date,
        rawCode: cell.rawCode,
        reason: "unknown_code",
      });
      continue;
    }
    projectCell(cell, entry, out);
  }

  return out;
}

/**
 * 公休 checksum: countsAsPublicHoliday=true のセル数を数える。
 *
 * 設計書 §3。読み取り結果が月の公休数と一致するかの二次監査に使う
 * （truth を決める主情報ではなく、抽出の正しさを検算する補助情報）。
 */
export function countPublicHolidays(
  cells: ShiftCellReading[],
  dictionary: ShiftCodeDictionary
): number {
  let count = 0;
  for (const cell of cells) {
    if (isEmptyCell(cell.rawCode)) continue;
    const entry = lookupCode(dictionary, cell.rawCode);
    if (entry?.countsAsPublicHoliday) count += 1;
  }
  return count;
}
