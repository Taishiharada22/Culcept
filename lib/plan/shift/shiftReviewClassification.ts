/**
 * シフト確認画面の分類ロジック（pure / no React）— SR Step 6D
 *
 * 「空欄」「blank-risk（要確認）」「unresolved（未確定）」の判定を**単一 source**として固める。
 * ShiftReviewGrid（視覚の amber dot）と shiftSaveController（保存前 gate）の双方が同じ定義を使う
 * ことで、見た目と保存判断のズレを構造的に防ぐ。
 *
 * 不変原則: 副作用なし・Date/random/env 非依存・throw しない。vitest "node" で直接 import 可。
 */

import {
  normalizeRawCode,
  type ShiftCodeDictionary,
} from "./shiftCodeDictionary";
import { projectShiftRoster } from "./shiftRosterProjection";

/** 確認画面 1 セル（原稿 1 日分の読み取り + 信頼度）。 */
export interface ShiftReviewCell {
  day: number;
  date: string;
  rawCode: string;
  confidence: number;
  /**
   * A2B-1: VLM が読んだ行ラベル（人名）。本人行 cross-check（F7）用の **review 専用 metadata**。
   * - **保存しない**: projection / save payload / DB（external_anchors / plan_day_indicators /
   *   source payload）には混ぜない（projection は {date,rawCode} のみ参照）。
   * - 人名文字列のみ。raw VLM response / base64 / 画像は持たない。
   */
  rowLabel?: string;
}

/** blank-risk 判定の既定しきい値（これ未満の信頼度は要確認）。 */
export const DEFAULT_LOW_CONFIDENCE_THRESHOLD = 0.7;

/** 空欄（コード無し）の日番号 set。原画像の「詰め」検出の基礎。 */
export function computeEmptyDays(cells: ShiftReviewCell[]): Set<number> {
  return new Set(
    cells.filter((c) => normalizeRawCode(c.rawCode) === "").map((c) => c.day)
  );
}

/**
 * blank-risk（要確認）か。低信頼 **または** 前後の日が空欄（詰め誤りの可能性）。
 * ※ 完全自動検出は不可能。最終的には source-of-truth review で人間が確認する設計の補助。
 */
export function isBlankRisk(
  cell: ShiftReviewCell,
  emptyDays: Set<number>,
  lowConfidenceThreshold: number
): boolean {
  return (
    cell.confidence < lowConfidenceThreshold ||
    emptyDays.has(cell.day - 1) ||
    emptyDays.has(cell.day + 1)
  );
}

/** 保存前分類: unresolved（hard block）と blank-risk（soft confirmation）。 */
export interface PreSaveClassification {
  /** 辞書で解決できないセルの日付（保存を止める＝hard block）。 */
  unresolvedDates: string[];
  /** 要確認（低信頼 or 空欄隣接）の日番号（soft confirmation 対象）。 */
  blankRiskDays: number[];
}

/**
 * 保存前にセル群を分類する（pure）。
 *   - unresolved は projectShiftRoster の unresolved（unknown_code 等）= ShiftReviewGrid の「要確認」表示と一致。
 *   - blank-risk は isBlankRisk（視覚 amber dot と一致）。
 * candidate（希望休 HREQ）は unresolved でも blank-risk 単独でもない＝保存を止めない。
 */
export function classifyPreSave(
  cells: ShiftReviewCell[],
  dictionary: ShiftCodeDictionary,
  lowConfidenceThreshold: number = DEFAULT_LOW_CONFIDENCE_THRESHOLD
): PreSaveClassification {
  const projection = projectShiftRoster(
    cells.map((c) => ({ date: c.date, rawCode: c.rawCode })),
    dictionary
  );
  const unresolvedDates = projection.unresolved.map((u) => u.date);
  const emptyDays = computeEmptyDays(cells);
  const blankRiskDays = cells
    .filter((c) => isBlankRisk(c, emptyDays, lowConfidenceThreshold))
    .map((c) => c.day);
  return { unresolvedDates, blankRiskDays };
}
