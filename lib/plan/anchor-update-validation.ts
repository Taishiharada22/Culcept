/**
 * Anchor Update Validation (W1-X2)
 *
 * 既存 anchor + patch から merged candidate を作り、既存 SoT validator
 * (validateCreateExternalAnchorInput) に通す pure 関数。
 *
 * 設計書: docs/alter-plan-w1x2-edit-anchor-mini-design.md §5
 *
 * 不変原則:
 *   1. patch から id / userId / sourceId / anchorKind / confirmedAt を **物理削除**
 *      （sanitization layer。route 層で既に sanitize 済みでも defensive に二重）
 *   2. anchorKind は existing の値で強制上書き（kind 変更禁止）
 *   3. SoT validator を再利用（重複 validation 作らない）
 *
 * 範囲外:
 *   - DB / IO / Supabase 接触
 *   - source 自体の編集
 *   - kind 変更
 */

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
  RecurringExternalAnchor,
} from "./external-anchor";
import type {
  AnchorInputValidationError,
  CreateExternalAnchorInput,
} from "./external-anchor-input";
import { validateCreateExternalAnchorInput } from "./external-anchor-input";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sanitization
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Patch から物理削除する key。
 *
 * - id / userId / sourceId: route 層で auth から取得した値が正、改竄拒否
 * - anchorKind: existing で強制（kind 変更禁止）
 * - confirmedAt: 過去 ts、変更不可
 * - capturedAt / createdAt / updatedAt: DB 管理、API 層で扱わない
 */
const SANITIZED_KEYS = new Set([
  "id",
  "userId",
  "sourceId",
  "anchorKind",
  "confirmedAt",
  "capturedAt",
  "createdAt",
  "updatedAt",
  // U1-minimal（2026-06-15）: startTime provenance は **server 決定**・client patch 不可（confirmedAt/sourceId と同格）
  "startTimeSource",
  "isAllDayPlaceholder",
  "timezoneOfRecord",
  "startTimeProvenanceRecordedAt",
]);

/**
 * patch input から禁止フィールドを物理削除する。
 * route 層と repository 層の二重防御として使う。
 */
export function sanitizeAnchorPatch(patch: unknown): Record<string, unknown> {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return {};
  const obj = patch as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (SANITIZED_KEYS.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// existing → CreateExternalAnchorInput candidate 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * 既存 anchor を CreateExternalAnchorInput 形に変換する。
 *
 * 注意:
 *   - external_anchors テーブルに sourceType column は無いが、validator は
 *     sourceType を必須要求する。ここでは "manual" を placeholder として補完。
 *     UPDATE 時には sourceType を DB payload から除外する（repository 層責務）。
 *   - confirmedAt / sourceId は元 anchor の値を持つが、CreateExternalAnchorInput
 *     型に含まれないので投入しない。
 */
function anchorToCandidateInput(a: ExternalAnchor): CreateExternalAnchorInput {
  const common = {
    title: a.title,
    startTime: a.startTime,
    rigidity: a.rigidity,
    // validator placeholder（W1-X2 では sourceType を anchor 単位で扱わない）
    sourceType: "manual" as const,
  };

  // optional fields は undefined のときは含めない（exactOptionalPropertyTypes 安全）
  if (a.anchorKind === "one_off") {
    const out: OneOffExternalAnchor & { sourceType: "manual" | "template" } = {
      ...(a as OneOffExternalAnchor),
      ...common,
    } as OneOffExternalAnchor & { sourceType: "manual" | "template" };
    const result: CreateExternalAnchorInput = {
      anchorKind: "one_off",
      date: out.date,
      title: common.title,
      startTime: common.startTime,
      rigidity: common.rigidity,
      sourceType: common.sourceType,
    };
    if (a.endTime !== undefined) result.endTime = a.endTime;
    if (a.locationText !== undefined) result.locationText = a.locationText;
    if (a.locationCategory !== undefined) result.locationCategory = a.locationCategory;
    if (a.sensitiveCategory !== undefined) result.sensitiveCategory = a.sensitiveCategory;
    return result;
  }

  const rec = a as RecurringExternalAnchor;
  const result: CreateExternalAnchorInput = {
    anchorKind: "recurring",
    validFrom: rec.validFrom,
    recurrenceRule: rec.recurrenceRule,
    title: common.title,
    startTime: common.startTime,
    rigidity: common.rigidity,
    sourceType: common.sourceType,
  };
  if (rec.validUntil !== undefined) result.validUntil = rec.validUntil;
  if (rec.exceptionDates !== undefined) result.exceptionDates = rec.exceptionDates;
  if (a.endTime !== undefined) result.endTime = a.endTime;
  if (a.locationText !== undefined) result.locationText = a.locationText;
  if (a.locationCategory !== undefined) result.locationCategory = a.locationCategory;
  if (a.sensitiveCategory !== undefined) result.sensitiveCategory = a.sensitiveCategory;
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// validateAnchorUpdate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AnchorUpdateValidationResult =
  | { valid: true; merged: CreateExternalAnchorInput }
  | { valid: false; errors: AnchorInputValidationError[] };

/**
 * existing + sanitized patch → merged candidate → validateCreateExternalAnchorInput.
 *
 * - anchorKind は existing で強制（kind 変更禁止）
 * - patch から禁止 key は事前に除外
 * - 最終結果は valid CreateExternalAnchorInput または errors[]
 */
export function validateAnchorUpdate(
  existing: ExternalAnchor,
  patch: Record<string, unknown> | unknown
): AnchorUpdateValidationResult {
  const sanitized = sanitizeAnchorPatch(patch);
  const baseInput = anchorToCandidateInput(existing);

  const merged: Record<string, unknown> = {
    ...(baseInput as unknown as Record<string, unknown>),
    ...sanitized,
    anchorKind: existing.anchorKind, // kind 強制
  };

  // 排他フィールドのクリア（kind 強制に伴って一貫性を保つ）
  if (existing.anchorKind === "one_off") {
    delete merged.validFrom;
    delete merged.validUntil;
    delete merged.recurrenceRule;
    delete merged.exceptionDates;
  } else {
    delete merged.date;
  }

  const r = validateCreateExternalAnchorInput(merged);
  if (r.valid) return { valid: true, merged: r.input };
  return { valid: false, errors: r.errors };
}
