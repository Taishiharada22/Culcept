/**
 * シフトコード辞書（ユーザー別ルール）
 *
 * 設計書: docs/alter-plan-shift-code-dictionary-design.md
 *
 * 「このユーザーはこういうルール、別のユーザーは別のルール」を表現する正本。
 * 各 rawCode（H/N/E-18 等）に対し、意味・勤務/休み・公休カウント・時刻・
 * /plan での見せ方（projectMode）を持つ。
 *
 * 不変原則:
 *   - 本モジュールは pure（IO なし、LLM なし、副作用なし）
 *   - 「休み(isOff)」と「公休(countsAsPublicHoliday)」は別の 2 軸（CEO 訂正 2026-05-30）
 *   - projectMode（層3・可変 UI）も辞書に持つが、これは default。ユーザー上書き可
 */

/** 粗いカテゴリー（収集 UI の選択肢） */
export type ShiftCodeCategory =
  | "work" // 勤務
  | "off" // 休み（公休/有給/blank 含む）
  | "off_request" // 希望休
  | "note" // 注記欄の予定
  | "undetermined"; // 未確定

/** /plan へどう出すか（層3・projection policy） */
export type ShiftProjectMode =
  | "timed_event" // タイムラインに時間付きイベント（work）
  | "day_indicator" // 時間枠を作らず「休み」日レベル表示（off）
  | "candidate" // 候補表示（希望休など、控えめ）
  | "none"; // 出さない（unknown 等、要ユーザー確認）

/** 1 コードの定義 */
export interface ShiftCodeEntry {
  /** 層1: 表記そのまま（"N" / "E-18" / "HREQ"） */
  rawCode: string;
  /** 人間可読ラベル（"夜勤" / "希望休"） */
  displayLabel: string;
  /** 層2: 粗いカテゴリー */
  category: ShiftCodeCategory;
  /** 層2: 細かい意味（"night_shift" / "holiday" / "blank_day"） */
  semanticType: string;
  /** 層2: 補助タグ（["work","overnight"] 等） */
  roleTags: string[];
  /** 層2: 休みか（H/HREQ/BD/AL = true） */
  isOff: boolean;
  /** 層2: 公休カウント対象か（★ H のみ true）。checksum に使う */
  countsAsPublicHoliday: boolean;
  /** 層2: 開始時刻 "HH:MM"（work のみ。off は null） */
  startTime: string | null;
  /** 層2: 終了時刻 "HH:MM"（任意。off は null） */
  endTime: string | null;
  /** 層2: 日跨ぎか（N 夜勤 = true） */
  endsNextDay: boolean;
  /** 層3: /plan での見せ方（default、ユーザー上書き可） */
  projectMode: ShiftProjectMode;
}

/** ユーザー別 / テンプレート別の辞書 */
export interface ShiftCodeDictionary {
  /** 辞書 ID（per ユーザー / per テンプレート） */
  dictionaryId: string;
  /** 所有者ラベル（表示用のみ） */
  ownerLabel: string;
  /** テンプレ名 */
  templateName: string;
  /** rawCode（normalize 済み）をキーにした定義 */
  codes: Record<string, ShiftCodeEntry>;
}

/**
 * rawCode の正規化（前後空白除去 + 大文字化）。
 * 辞書登録時・検索時の双方で同じ正規化を通すことで揺れを吸収する。
 */
export function normalizeRawCode(raw: string): string {
  return raw.trim().toUpperCase();
}

/**
 * 辞書から rawCode を引く。未登録なら null（= 呼び出し側が unresolved 扱い）。
 */
export function lookupCode(
  dictionary: ShiftCodeDictionary,
  rawCode: string
): ShiftCodeEntry | null {
  const key = normalizeRawCode(rawCode);
  return dictionary.codes[key] ?? null;
}

/**
 * エントリ配列から辞書 codes を作る（normalize キーで index 化）。
 */
export function buildCodeIndex(
  entries: ShiftCodeEntry[]
): Record<string, ShiftCodeEntry> {
  const index: Record<string, ShiftCodeEntry> = {};
  for (const entry of entries) {
    index[normalizeRawCode(entry.rawCode)] = entry;
  }
  return index;
}

// ─────────────────────────────────────────────────────────────
// Bootstrap seed: 原田大志 SPRIX 連続デスクシフト表（8 コード）
//
// CEO 提供画像（GPT 生成・bootstrap ground truth）の凡例 + CEO 意味確定。
// 将来は DB / ユーザー設定へ移すが、開発・内部評価用の seed として保持。
// ※ 実データで精度証明済みではない（bootstrap 扱い）。
// ─────────────────────────────────────────────────────────────

const HARADA_SPRIX_ENTRIES: ShiftCodeEntry[] = [
  {
    rawCode: "H",
    displayLabel: "休（公休）",
    category: "off",
    semanticType: "holiday",
    roleTags: ["off", "public_holiday"],
    isOff: true,
    countsAsPublicHoliday: true, // ★ 公休にカウントされるのは H のみ
    startTime: null,
    endTime: null,
    endsNextDay: false,
    projectMode: "day_indicator",
  },
  {
    rawCode: "HREQ",
    displayLabel: "希望休",
    category: "off_request",
    semanticType: "holiday_request",
    roleTags: ["off", "pending"],
    isOff: true,
    countsAsPublicHoliday: false,
    startTime: null,
    endTime: null,
    endsNextDay: false,
    projectMode: "candidate",
  },
  {
    rawCode: "BD",
    displayLabel: "休み",
    category: "off",
    semanticType: "blank_day",
    roleTags: ["off", "non_public_holiday"],
    isOff: true,
    countsAsPublicHoliday: false,
    startTime: null,
    endTime: null,
    endsNextDay: false,
    projectMode: "day_indicator",
  },
  {
    rawCode: "E",
    displayLabel: "早番",
    category: "work",
    semanticType: "early_work",
    roleTags: ["work"],
    isOff: false,
    countsAsPublicHoliday: false,
    startTime: "06:00",
    endTime: "14:00",
    endsNextDay: false,
    projectMode: "timed_event",
  },
  {
    rawCode: "E-18",
    displayLabel: "早番ロング",
    category: "work",
    semanticType: "early_long",
    roleTags: ["work"],
    isOff: false,
    countsAsPublicHoliday: false,
    startTime: "06:00",
    endTime: "18:00",
    endsNextDay: false,
    projectMode: "timed_event",
  },
  {
    rawCode: "N",
    displayLabel: "夜勤",
    category: "work",
    semanticType: "night_shift",
    roleTags: ["work", "overnight"],
    isOff: false,
    countsAsPublicHoliday: false,
    startTime: "18:00",
    endTime: "06:45",
    endsNextDay: true, // ★ 日跨ぎ
    projectMode: "timed_event",
  },
  {
    rawCode: "L",
    displayLabel: "遅番",
    category: "work",
    semanticType: "late_work",
    roleTags: ["work"],
    isOff: false,
    countsAsPublicHoliday: false,
    startTime: "14:00",
    endTime: "22:45",
    endsNextDay: false,
    projectMode: "timed_event",
  },
  {
    rawCode: "G",
    displayLabel: "日勤",
    category: "work",
    semanticType: "day_work",
    roleTags: ["work"],
    isOff: false,
    countsAsPublicHoliday: false,
    startTime: "09:00",
    endTime: "17:45",
    endsNextDay: false,
    projectMode: "timed_event",
  },
];

/** 原田大志 SPRIX 表の bootstrap 辞書 */
export const HARADA_SPRIX_DICTIONARY: ShiftCodeDictionary = {
  dictionaryId: "seed-harada-sprix-v1",
  ownerLabel: "原田 大志",
  templateName: "SPRIX 連続デスクシフト表",
  codes: buildCodeIndex(HARADA_SPRIX_ENTRIES),
};
