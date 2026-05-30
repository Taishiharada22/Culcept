/**
 * 原田行 月別 golden（CEO 原本適正済・2026-05-30）
 *
 * B1a-v2 cross-month 抽出 → CEO が原本照合で適正。
 *  - 補正済み区間 = CEO 明示値（空セル起因の shift を修正）
 *  - 非補正区間 = CEO 適正で誤り指摘なし（= verified by omission）
 *
 * 失敗モード: 真の空セル検出が不安定。見落とすと以降が前詰めに shift（blank-skip）。
 *            coverage は全日出力で通過するため、coverage validator では検出不能。
 *
 * 用途: v3（空セル保全 prompt）再走の採点 golden。
 */
import { JULY_HARADA_CODES } from "./julyHaradaGolden";

// 3月（31日・空セルなし・CEO 誤り指摘なし = 100%）
export const MARCH_HARADA_CODES: readonly string[] = [
  "HREQ", "L", "L", "E", "N", "HREQ", "H", "BD", "E-18", "H", // 1-10
  "L", "N", "H", "H", "E", "G", "H", "L", "L", "H", // 11-20
  "H", "E", "N", "BD", "E-18", "L", "H", "H", "N", "L", // 21-30
  "G", // 31
];

// 4月（30日・25=空欄・CEO 補正 25-30）
export const APRIL_HARADA_CODES: readonly string[] = [
  "L", "E", "N", "BD", "HREQ", "H", "E-18", "L", "N", "L", // 1-10
  "G", "H", "H", "L", "L", "E", "N", "BD", "H", "H", // 11-20
  "E-18", "L", "N", "L", "", "G", "H", "H", "L", "", // 21-30（25,30=空欄）
];

// 5月（31日・28=空欄・CEO 補正 28-31）
export const MAY_HARADA_CODES: readonly string[] = [
  "H", "E", "N", "HREQ", "HREQ", "BD", "E-18", "H", "L", "N", // 1-10
  "H", "H", "E", "G", "L", "L", "E", "H", "H", "N", // 11-20
  "BD", "E-18", "L", "N", "H", "H", "E", "", "G", "L", // 21-30（28=空欄）
  "H", // 31
];

// 6月（30日・25=空欄・CEO 補正 25-30）
export const JUNE_HARADA_CODES: readonly string[] = [
  "N", "BD", "HREQ", "H", "E-18", "L", "N", "L", "G", "H", // 1-10
  "H", "L", "L", "E", "N", "BD", "H", "H", "E-18", "L", // 11-20
  "N", "L", "G", "H", "", "H", "L", "L", "E", "N", // 21-30（25=空欄）
];

export interface MonthGolden {
  name: string;
  month: number;
  daysInMonth: number;
  codes: readonly string[];
}

export const SHIFT_MONTH_GOLDENS: readonly MonthGolden[] = [
  { name: "march", month: 3, daysInMonth: 31, codes: MARCH_HARADA_CODES },
  { name: "april", month: 4, daysInMonth: 30, codes: APRIL_HARADA_CODES },
  { name: "may", month: 5, daysInMonth: 31, codes: MAY_HARADA_CODES },
  { name: "june", month: 6, daysInMonth: 30, codes: JUNE_HARADA_CODES },
  { name: "july", month: 7, daysInMonth: 31, codes: JULY_HARADA_CODES },
];
