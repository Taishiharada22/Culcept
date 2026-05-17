/**
 * Weekday Template → RRULE Generator (Wave 1 / W1-4pre-2)
 *
 * 「平日 9:00-18:00 仕事」のような曜日テンプレート入力から、
 * iCal RRULE 文字列を含む CreateRecurringAnchorInput を生成する。
 *
 * これは weekday template 専用の thin generator であり、
 * 汎用 RRULE エンジンではない（範囲を意図的に狭く保つ）。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.1, §12.2
 *
 * 不変原則:
 *   1. RRULE は FREQ=WEEKLY;BYDAY=... のみ生成（他の RRULE 構文は扱わない）
 *   2. 曜日は ISO 8601 月曜始まり順（MO,TU,WE,TH,FR,SA,SU）で canonical 出力
 *   3. 重複曜日は自動除去
 *   4. RRULE 文字列に時刻 / DTSTART / UNTIL / COUNT / TZID を含めない
 *      時刻は startTime / endTime、validity は validFrom / validUntil で別 field 管理
 *   5. validation は W1-4pre-1 の validateCreateExternalAnchorInput を再利用
 *      （単一 source of truth）
 *
 * Wave 1 W1-4pre-2 範囲外（含めない）:
 *   - 汎用 RRULE parser
 *   - monthly / yearly recurrence
 *   - UNTIL / COUNT / INTERVAL / TZID
 *   - timezone 処理
 *   - holiday skip / 自動 exceptionDates 生成
 *   - 日本語曜日（"月" "火"）からの変換 — UI 層の責務
 *   - API route / Supabase / DB / UI / Plan 接続 / Home 変更
 */

import type { LocationCategory } from "./location-category";
import type {
  AnchorRigidity,
  AnchorSensitiveCategory,
} from "./external-anchor";
import {
  type AnchorInputValidationError,
  type CreateRecurringAnchorInput,
  validateCreateExternalAnchorInput,
} from "./external-anchor-input";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Weekday 型（iCal BYDAY 形式）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 曜日（iCal RFC 5545 BYDAY 形式）。
 * UI 層が日本語等から渡す場合は、事前に ISO 形式に変換すること。
 */
export type Weekday = "MO" | "TU" | "WE" | "TH" | "FR" | "SA" | "SU";

/** ISO 8601 月曜始まり順序（canonical order） */
const CANONICAL_ORDER: Record<Weekday, number> = {
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
  SU: 7,
};

const ALL_WEEKDAYS: ReadonlyArray<Weekday> = [
  "MO",
  "TU",
  "WE",
  "TH",
  "FR",
  "SA",
  "SU",
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input DTO + Result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Weekday template の入力。
 *
 * sourceType は内部で "template" 固定（明示的に渡す必要なし）。
 * RRULE 文字列は本関数が生成するため、ユーザーは指定しない。
 */
export interface WeekdayTemplateInput {
  /** 対象曜日（順不同、重複可。canonical 化される） */
  days: Weekday[];
  /** 1-255 文字 */
  title: string;
  /** HH:MM[:SS] */
  startTime: string;
  /** HH:MM[:SS]、翌日跨ぎは endTime < startTime で許容 */
  endTime?: string;
  /** YYYY-MM-DD 必須 */
  validFrom: string;
  /** YYYY-MM-DD（終了未定なら省略） */
  validUntil?: string;
  /** 例外日（祝日 / 休講 / シフト変更等）、YYYY-MM-DD[] */
  exceptionDates?: string[];

  rigidity: AnchorRigidity;

  locationText?: string;
  locationCategory?: LocationCategory;
  sensitiveCategory?: AnchorSensitiveCategory;
}

/**
 * Template → Anchor 変換結果。
 * W1-7 / W1-4pre-1 と同じ discriminated union パターン。
 */
export type WeekdayTemplateResult =
  | { valid: true; input: CreateRecurringAnchorInput }
  | { valid: false; errors: AnchorInputValidationError[] };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** unknown を Weekday に narrow する type guard */
export function isWeekday(value: unknown): value is Weekday {
  return (
    typeof value === "string" &&
    (ALL_WEEKDAYS as ReadonlyArray<string>).includes(value)
  );
}

/**
 * 曜日配列を canonical（重複除去 + 月曜始まり順 sort）に変換する。
 * 入力を mutate しない。
 *
 * @example
 * canonicalizeWeekdays(["FR", "MO", "WE", "MO"])
 *   → ["MO", "WE", "FR"]
 */
export function canonicalizeWeekdays(days: ReadonlyArray<Weekday>): Weekday[] {
  const unique = Array.from(new Set(days));
  return unique.sort(
    (a, b) => CANONICAL_ORDER[a] - CANONICAL_ORDER[b]
  );
}

/**
 * canonical 化した曜日配列から RRULE 文字列を生成する。
 *
 * 出力は `FREQ=WEEKLY;BYDAY=...` のみ。時刻 / UNTIL / COUNT / TZID は含めない。
 *
 * @example
 * buildWeekdayRRule(["MO", "TU", "WE", "TH", "FR"])
 *   → "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
 */
export function buildWeekdayRRule(days: ReadonlyArray<Weekday>): string {
  const canonical = canonicalizeWeekdays(days);
  return `FREQ=WEEKLY;BYDAY=${canonical.join(",")}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main builder
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * WeekdayTemplateInput を CreateRecurringAnchorInput に変換する pure 関数。
 *
 * 処理フロー:
 *   1. 入力 object の最低限の型検査
 *   2. days 配列の検証（非空、各要素 Weekday）
 *   3. canonical RRULE 生成
 *   4. CreateRecurringAnchorInput を組み立て
 *   5. W1-4pre-1 の validateCreateExternalAnchorInput を呼び出し二重検証
 *      （validFrom/validUntil/title/startTime 等の全制約が自動適用される）
 *
 * 不変原則:
 *   - throw しない
 *   - 入力を mutate しない
 *   - DB / IO / Supabase / API 一切接触しない
 *
 * @param input - unknown を受け付ける（API 層からの未検証データ想定）
 */
export function buildCreateRecurringAnchorFromTemplate(
  input: unknown
): WeekdayTemplateResult {
  // Top-level type check
  if (input === null || typeof input !== "object") {
    return {
      valid: false,
      errors: [
        {
          field: "(root)",
          code: "invalid_format",
          message: "input must be a non-null object",
        },
      ],
    };
  }

  const obj = input as Record<string, unknown>;
  const errors: AnchorInputValidationError[] = [];

  // ── days 検証（template 固有） ──
  if (!Array.isArray(obj.days)) {
    errors.push({
      field: "days",
      code: "invalid_format",
      message: "days must be an array of Weekday (MO/TU/WE/TH/FR/SA/SU)",
    });
  } else {
    if (obj.days.length === 0) {
      errors.push({
        field: "days",
        code: "required",
        message: "days must contain at least one weekday",
      });
    }
    obj.days.forEach((d, idx) => {
      if (!isWeekday(d)) {
        errors.push({
          field: `days[${idx}]`,
          code: "not_allowed_value",
          message:
            "each days element must be one of: MO, TU, WE, TH, FR, SA, SU",
        });
      }
    });
  }

  // template 固有検証で fail なら早期 return（RRULE 生成不可）
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // ここで days は Weekday[] と判定できる
  const days = obj.days as Weekday[];

  // ── RRULE 生成 ──
  const recurrenceRule = buildWeekdayRRule(days);

  // ── CreateRecurringAnchorInput 組み立て ──
  const candidate: Record<string, unknown> = {
    anchorKind: "recurring",
    sourceType: "template", // 固定
    title: obj.title,
    startTime: obj.startTime,
    validFrom: obj.validFrom,
    recurrenceRule,
    rigidity: obj.rigidity,
  };

  // optional 透過
  if (obj.endTime !== undefined) candidate.endTime = obj.endTime;
  if (obj.validUntil !== undefined) candidate.validUntil = obj.validUntil;
  if (obj.exceptionDates !== undefined)
    candidate.exceptionDates = obj.exceptionDates;
  if (obj.locationText !== undefined) candidate.locationText = obj.locationText;
  if (obj.locationCategory !== undefined)
    candidate.locationCategory = obj.locationCategory;
  if (obj.sensitiveCategory !== undefined)
    candidate.sensitiveCategory = obj.sensitiveCategory;

  // ── W1-4pre-1 の validation を再利用（二重検証 / 単一 source of truth） ──
  const result = validateCreateExternalAnchorInput(candidate);

  if (!result.valid) {
    return { valid: false, errors: result.errors };
  }

  // 型は discriminated union で recurring 側に narrow される
  // （anchorKind="recurring" を上で固定しているため）
  return {
    valid: true,
    input: result.input as CreateRecurringAnchorInput,
  };
}
