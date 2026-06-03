/**
 * Month grid cell chip — UI 中立の表示単位（Plan 月ビュー M3-b polish）
 *
 * label = 原稿照合用の短いコード（"E" / "N" / "L" / "G" / "E-18" / "H" / "BD" / "HREQ"
 *         または非シフト anchor の短縮 title / "予定"）。
 * tone  = 表示色カテゴリ（勤務 / 公休 / 希望休 / 休み / 既定）。
 *
 * **shift dictionary には依存しない**（中立型）。勤務コードの逆引きは shift 側の
 * resolver（shiftAnchorChip）が dictionary を使って生成し、MonthGridView へ props で注入する。
 * これにより MonthGridView は汎用カレンダー部品のまま、辞書と密結合しない。
 */

export type MonthGridChipTone =
  | "work"
  | "public_holiday"
  | "requested_off"
  | "off"
  | "default";

export interface MonthGridChip {
  /** 表示コード/ラベル */
  label: string;
  /** 表示色カテゴリ */
  tone: MonthGridChipTone;
}
