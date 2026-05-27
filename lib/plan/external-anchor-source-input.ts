/**
 * ExternalAnchorSource Input DTO + Validation (Wave 1 / W1-4 → A-2)
 *
 * Memory / Supabase 両 Repository が共有する、source 入力の pure validation 関数。
 * もともと `external-anchor-repository-memory.ts` 内 private だった `validateSourceInput`
 * を A-2 で extract（Supabase 実装と SoT を一本化するため）。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.1, §11
 *
 * 不変原則（W1-4pre-1 と同等）:
 *   1. throw しない（戻り値で valid / invalid を返す）
 *   2. 入力を mutate しない
 *   3. 副作用なし（DB / IO / random / 時刻参照なし）
 *
 * Anchor input (W1-4pre-1) との sourceType 制約の差:
 *   - Anchor input: "manual" | "template" のみ許可（W1-4-pre 範囲）
 *   - Source input: "manual" | "template" | "pdf" | "image" | "chat" 全 5 種許可
 *     （migration external_anchor_sources.source_type CHECK と一致）
 *   この差は意図的。Source は将来 Document Import で pdf/image/chat も使う。
 */

import type {
  AnchorInputValidationError,
} from "./external-anchor-input";
import type {
  ExternalAnchorSourceType,
  RawRetention,
} from "./external-anchor-source";
// 型の SoT は external-anchor-repository.ts に残し、ここからは re-export のみ
import type { CreateExternalAnchorSourceInput } from "./external-anchor-repository";

export type { CreateExternalAnchorSourceInput };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation Result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ExternalAnchorSourceInputValidationResult =
  | { valid: true; input: CreateExternalAnchorSourceInput }
  | { valid: false; errors: AnchorInputValidationError[] };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALLOWED_SOURCE_TYPES: readonly ExternalAnchorSourceType[] = [
  "manual",
  "template",
  "pdf",
  "image",
  "chat",
  "ics", // P3 W3 (= 2026-05-26): .ics / iCalendar 取り込み経路
];

const ALLOWED_RAW_RETENTION: readonly RawRetention[] = ["discarded", "stored"];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Validation (pure)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * source 入力の最小検証。
 *
 *   - sourceType の許可値
 *   - rawRetention の整合（discarded ↔ path/expires NULL）
 *
 * 詳細形式（ファイル名 / path / expires_at の format）は API 層の責務。
 */
export function validateCreateExternalAnchorSourceInput(
  input: unknown
): ExternalAnchorSourceInputValidationResult {
  if (input === null || typeof input !== "object") {
    return {
      valid: false,
      errors: [
        {
          field: "source",
          code: "invalid_format",
          message: "source must be a non-null object",
        },
      ],
    };
  }

  const obj = input as Record<string, unknown>;
  const errors: AnchorInputValidationError[] = [];

  // sourceType
  if (
    typeof obj.sourceType !== "string" ||
    !(ALLOWED_SOURCE_TYPES as readonly string[]).includes(obj.sourceType)
  ) {
    errors.push({
      field: "source.sourceType",
      code: "not_allowed_value",
      message: `sourceType must be one of: ${ALLOWED_SOURCE_TYPES.join(", ")}`,
    });
  }

  // rawRetention（default: discarded）
  const retention = (obj.rawRetention as RawRetention | undefined) ?? "discarded";
  if (
    typeof retention !== "string" ||
    !(ALLOWED_RAW_RETENTION as readonly string[]).includes(retention)
  ) {
    errors.push({
      field: "source.rawRetention",
      code: "not_allowed_value",
      message: `rawRetention must be one of: ${ALLOWED_RAW_RETENTION.join(", ")}`,
    });
    // retention 不明なら raw_*_payload の整合検査は skip
    return errors.length > 0 ? { valid: false, errors } : { valid: true, input: obj as unknown as CreateExternalAnchorSourceInput };
  }

  // raw retention 整合
  if (retention === "discarded") {
    if (obj.rawStoragePath !== undefined) {
      errors.push({
        field: "source.rawStoragePath",
        code: "logical_conflict",
        message: "rawStoragePath must not be set when rawRetention='discarded'",
      });
    }
    if (obj.rawExpiresAt !== undefined) {
      errors.push({
        field: "source.rawExpiresAt",
        code: "logical_conflict",
        message: "rawExpiresAt must not be set when rawRetention='discarded'",
      });
    }
  } else {
    // stored
    if (typeof obj.rawStoragePath !== "string" || obj.rawStoragePath.length === 0) {
      errors.push({
        field: "source.rawStoragePath",
        code: "required",
        message: "rawStoragePath is required when rawRetention='stored'",
      });
    }
    if (typeof obj.rawExpiresAt !== "string" || obj.rawExpiresAt.length === 0) {
      errors.push({
        field: "source.rawExpiresAt",
        code: "required",
        message: "rawExpiresAt is required when rawRetention='stored'",
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }
  return { valid: true, input: obj as unknown as CreateExternalAnchorSourceInput };
}

/**
 * 既存 memory 実装との互換 helper。
 *
 * memory 実装は `AnchorInputValidationError[]` を直接 push していたため、
 * 「errors 配列のみ返す」 thin wrapper を提供する。
 * 新規コードは `validateCreateExternalAnchorSourceInput` の result-shape を直接使うこと。
 */
export function collectSourceInputErrors(
  source: CreateExternalAnchorSourceInput
): AnchorInputValidationError[] {
  const r = validateCreateExternalAnchorSourceInput(source);
  return r.valid ? [] : r.errors;
}
