/**
 * ExternalAnchor Input DTO + Validation (Wave 1 / W1-4pre-1)
 *
 * 保存前の入力（CreateExternalAnchorInput）と純関数 validation。
 * DB / Supabase / API route / UI / Plan 接続 / Home 変更は一切含めない。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.0, §2.1, §12
 *
 * 不変原則の入力層強制:
 *   1. anchorKind による discriminated union（型レベルで one_off / recurring 分離）
 *   2. 必須 field の物理強制（runtime + 型）
 *   3. format validation（HH:MM[:SS] / YYYY-MM-DD）
 *   4. valid_until >= valid_from（recurring）
 *   5. sourceType は W1-4-pre 範囲では manual / template のみ
 *      （pdf / image / chat は Document Import / Wave 2 で扱う）
 *
 * Wave 1 W1-4pre-1 範囲外:
 *   - RRULE generator（W1-4pre-2）
 *   - repository implementation（W1-4pre-3）
 *   - integration-style flow tests（W1-4pre-4）
 *   - API route / Supabase client / DB insert
 *   - UI / Plan 画面接続 / Home 変更
 *   - .env.local 編集 / アプリ起動
 */

import type {
  AnchorRigidity,
  AnchorSensitiveCategory,
} from "./external-anchor";
import type { LocationCategory } from "./location-category";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Input DTO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** anchor の入力に共通する base */
interface CreateExternalAnchorInputBase {
  /** 必須、TITLE_MAX_LENGTH 文字以内 */
  title: string;
  /** HH:MM or HH:MM:SS 形式（24h） */
  startTime: string;
  /**
   * HH:MM or HH:MM:SS 形式（24h、任意）。
   * 翌日跨ぎ（endTime < startTime）は valid。
   * 跨ぎ判定は API 層の責務（W1-3 で確定済み）。
   */
  endTime?: string;
  locationText?: string;
  locationCategory?: LocationCategory;
  rigidity: AnchorRigidity;
  sensitiveCategory?: AnchorSensitiveCategory;
  /**
   * W1-4-pre 範囲では "manual" / "template" のみ許可。
   * "pdf" / "image" / "chat" は Document Import（Wave 2）の責務。
   */
  sourceType: "manual" | "template";
}

/** 単発予定の入力 */
export interface CreateOneOffAnchorInput extends CreateExternalAnchorInputBase {
  anchorKind: "one_off";
  /** YYYY-MM-DD 必須 */
  date: string;
  /** recurring 専用 field は型レベル禁止 */
  validFrom?: never;
  validUntil?: never;
  recurrenceRule?: never;
  exceptionDates?: never;
}

/** 繰り返し予定の入力 */
export interface CreateRecurringAnchorInput
  extends CreateExternalAnchorInputBase {
  anchorKind: "recurring";
  /** YYYY-MM-DD 必須（開始日） */
  validFrom: string;
  /** YYYY-MM-DD（終了未定なら省略可。永続を意味しない） */
  validUntil?: string;
  /** iCal RRULE 必須（W1-4pre-2 の generator で生成） */
  recurrenceRule: string;
  /** YYYY-MM-DD[] 例外日 */
  exceptionDates?: string[];
  /** one_off 専用 field は型レベル禁止 */
  date?: never;
}

export type CreateExternalAnchorInput =
  | CreateOneOffAnchorInput
  | CreateRecurringAnchorInput;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation Result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AnchorInputErrorCode =
  | "required"
  | "invalid_format"
  | "out_of_range"
  | "logical_conflict"
  | "too_long"
  | "not_allowed_value";

export interface AnchorInputValidationError {
  /** どの field のエラーか */
  field: string;
  code: AnchorInputErrorCode;
  /** 開発者向けメッセージ（UI 提示はローカライズ側） */
  message: string;
}

/**
 * Validation 結果。throw しない。
 *
 * W1-7 の AlterConfirmation State Machine と同じ
 * discriminated union パターン。
 */
export type AnchorInputValidationResult =
  | { valid: true; input: CreateExternalAnchorInput }
  | { valid: false; errors: AnchorInputValidationError[] };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants（許可値 + 制約）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TITLE_MAX_LENGTH = 255;
const RRULE_MAX_LENGTH = 500;

const ALLOWED_RIGIDITY: readonly AnchorRigidity[] = ["hard", "soft"];
const ALLOWED_SENSITIVE: readonly AnchorSensitiveCategory[] = [
  "medical",
  "legal",
  "exam",
  "other",
];
const ALLOWED_LOCATION: readonly LocationCategory[] = [
  "home",
  "office",
  "school",
  "cafe",
  "outdoor",
  "public",
  "transit",
  "unknown",
];
const ALLOWED_SOURCE_TYPES = ["manual", "template"] as const;

/** HH:MM or HH:MM:SS（24h、秒は任意） */
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

/** YYYY-MM-DD（簡易、月日の範囲は別途 Date 化で round-trip 検査） */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** HH:MM[:SS] 形式チェック */
export function isValidTimeString(value: string): boolean {
  return TIME_REGEX.test(value);
}

/**
 * YYYY-MM-DD 形式チェック。
 * round-trip 検査で 2026-02-30 のような無効日付を弾く。
 */
export function isValidDateString(value: string): boolean {
  if (!DATE_REGEX.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  return d.toISOString().slice(0, 10) === value;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main Validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * CreateExternalAnchorInput を validate する pure 関数。
 *
 * 不変原則:
 *   - throw しない（戻り値で valid / invalid を返す）
 *   - 入力を mutate しない
 *   - 副作用なし（DB / IO / random / 時刻参照なし）
 *
 * @param input - unknown を受け付ける（API 層から渡される未検証データを想定）
 * @returns valid なら型付き input、invalid なら errors 配列
 */
export function validateCreateExternalAnchorInput(
  input: unknown
): AnchorInputValidationResult {
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

  // ── anchorKind（discriminator）──
  const anchorKind = obj.anchorKind;
  if (anchorKind !== "one_off" && anchorKind !== "recurring") {
    return {
      valid: false,
      errors: [
        {
          field: "anchorKind",
          code: "required",
          message: "anchorKind must be 'one_off' or 'recurring'",
        },
      ],
    };
  }

  // ── 共通 field ──

  // title
  if (typeof obj.title !== "string" || obj.title.length === 0) {
    errors.push({
      field: "title",
      code: "required",
      message: "title is required and must be a non-empty string",
    });
  } else if (obj.title.length > TITLE_MAX_LENGTH) {
    errors.push({
      field: "title",
      code: "too_long",
      message: `title must be ${TITLE_MAX_LENGTH} characters or less`,
    });
  }

  // rigidity
  if (
    typeof obj.rigidity !== "string" ||
    !ALLOWED_RIGIDITY.includes(obj.rigidity as AnchorRigidity)
  ) {
    errors.push({
      field: "rigidity",
      code: "not_allowed_value",
      message: `rigidity must be one of: ${ALLOWED_RIGIDITY.join(", ")}`,
    });
  }

  // sourceType（W1-4-pre 範囲では manual / template のみ）
  if (
    typeof obj.sourceType !== "string" ||
    !(ALLOWED_SOURCE_TYPES as readonly string[]).includes(obj.sourceType)
  ) {
    errors.push({
      field: "sourceType",
      code: "not_allowed_value",
      message: `sourceType must be one of: ${ALLOWED_SOURCE_TYPES.join(", ")} (W1-4-pre scope)`,
    });
  }

  // startTime（必須）
  if (typeof obj.startTime !== "string" || !isValidTimeString(obj.startTime)) {
    errors.push({
      field: "startTime",
      code: "invalid_format",
      message: "startTime must be HH:MM or HH:MM:SS (24h)",
    });
  }

  // endTime（optional）
  if (obj.endTime !== undefined) {
    if (typeof obj.endTime !== "string" || !isValidTimeString(obj.endTime)) {
      errors.push({
        field: "endTime",
        code: "invalid_format",
        message: "endTime must be HH:MM or HH:MM:SS (24h)",
      });
    }
  }

  // locationCategory（optional）
  if (obj.locationCategory !== undefined) {
    if (
      typeof obj.locationCategory !== "string" ||
      !ALLOWED_LOCATION.includes(obj.locationCategory as LocationCategory)
    ) {
      errors.push({
        field: "locationCategory",
        code: "not_allowed_value",
        message: `locationCategory must be one of: ${ALLOWED_LOCATION.join(", ")}`,
      });
    }
  }

  // sensitiveCategory（optional）
  if (obj.sensitiveCategory !== undefined) {
    if (
      typeof obj.sensitiveCategory !== "string" ||
      !ALLOWED_SENSITIVE.includes(
        obj.sensitiveCategory as AnchorSensitiveCategory
      )
    ) {
      errors.push({
        field: "sensitiveCategory",
        code: "not_allowed_value",
        message: `sensitiveCategory must be one of: ${ALLOWED_SENSITIVE.join(", ")}`,
      });
    }
  }

  // ── anchorKind 別 field ──

  if (anchorKind === "one_off") {
    // date 必須
    if (typeof obj.date !== "string" || !isValidDateString(obj.date)) {
      errors.push({
        field: "date",
        code: "required",
        message: "date is required for one_off (YYYY-MM-DD)",
      });
    }

    // recurring 専用 field の混入禁止
    for (const forbidden of [
      "validFrom",
      "validUntil",
      "recurrenceRule",
      "exceptionDates",
    ] as const) {
      if (obj[forbidden] !== undefined) {
        errors.push({
          field: forbidden,
          code: "logical_conflict",
          message: `${forbidden} must not be set when anchorKind='one_off'`,
        });
      }
    }
  } else {
    // recurring

    // validFrom 必須
    if (
      typeof obj.validFrom !== "string" ||
      !isValidDateString(obj.validFrom)
    ) {
      errors.push({
        field: "validFrom",
        code: "required",
        message: "validFrom is required for recurring (YYYY-MM-DD)",
      });
    }

    // recurrenceRule 必須
    if (
      typeof obj.recurrenceRule !== "string" ||
      obj.recurrenceRule.length === 0
    ) {
      errors.push({
        field: "recurrenceRule",
        code: "required",
        message: "recurrenceRule is required for recurring (iCal RRULE)",
      });
    } else if (obj.recurrenceRule.length > RRULE_MAX_LENGTH) {
      errors.push({
        field: "recurrenceRule",
        code: "too_long",
        message: `recurrenceRule must be ${RRULE_MAX_LENGTH} characters or less`,
      });
    }

    // one_off 専用 field の混入禁止
    if (obj.date !== undefined) {
      errors.push({
        field: "date",
        code: "logical_conflict",
        message: "date must not be set when anchorKind='recurring'",
      });
    }

    // validUntil（optional）の format + 範囲
    if (obj.validUntil !== undefined) {
      if (
        typeof obj.validUntil !== "string" ||
        !isValidDateString(obj.validUntil)
      ) {
        errors.push({
          field: "validUntil",
          code: "invalid_format",
          message: "validUntil must be YYYY-MM-DD",
        });
      } else if (
        typeof obj.validFrom === "string" &&
        isValidDateString(obj.validFrom) &&
        obj.validUntil < obj.validFrom
      ) {
        errors.push({
          field: "validUntil",
          code: "out_of_range",
          message: "validUntil must be >= validFrom",
        });
      }
    }

    // exceptionDates（optional）
    if (obj.exceptionDates !== undefined) {
      if (!Array.isArray(obj.exceptionDates)) {
        errors.push({
          field: "exceptionDates",
          code: "invalid_format",
          message: "exceptionDates must be an array of YYYY-MM-DD",
        });
      } else {
        obj.exceptionDates.forEach((d, idx) => {
          if (typeof d !== "string" || !isValidDateString(d)) {
            errors.push({
              field: `exceptionDates[${idx}]`,
              code: "invalid_format",
              message: "each exceptionDates element must be YYYY-MM-DD",
            });
          }
        });
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, input: obj as unknown as CreateExternalAnchorInput };
}
