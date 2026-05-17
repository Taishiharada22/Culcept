/**
 * In-Memory ExternalAnchorRepository (Wave 1 / W1-4pre-3)
 *
 * テスト / 開発時用の memory 実装。本番では Supabase 実装に差し替えるが、
 * interface は同じ（lib/plan/external-anchor-repository.ts）。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.1, §11.2
 *
 * 不変原則:
 *   1. memory store は **closure-scoped**（factory 呼び出しごと独立、global singleton 禁止）
 *   2. すべての method は userId で隔離（user 越境アクセス禁止）
 *   3. createSourceWithAnchors は **atomic**: 1 件でも invalid なら store に何も書かない
 *   4. deleteSource は cascade（DB の ON DELETE CASCADE と等価）
 *   5. 全 method async（Supabase 実装契約に合わせる）
 *
 * Wave 1 W1-4pre-3 範囲外:
 *   - Supabase 実装
 *   - API route / UI / Plan 接続 / Home 変更
 *   - DB / localStorage / 実 fetch / production env 参照
 */

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
  RecurringExternalAnchor,
} from "./external-anchor";
import type { ExternalAnchorSource } from "./external-anchor-source";
import type {
  AnchorInputValidationError,
  CreateExternalAnchorInput,
} from "./external-anchor-input";
import { validateCreateExternalAnchorInput } from "./external-anchor-input";
import type {
  BundleError,
  CreateExternalAnchorSourceInput,
  CreateSourceWithAnchorsInput,
  CreateSourceWithAnchorsResult,
  ExternalAnchorRepository,
  ExternalAnchorRepositoryDependencies,
} from "./external-anchor-repository";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Source の最小 validation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ALLOWED_SOURCE_TYPES = [
  "manual",
  "template",
  "pdf",
  "image",
  "chat",
] as const;

const ALLOWED_RAW_RETENTION = ["discarded", "stored"] as const;

/**
 * source 入力の最小検証。
 *   - sourceType の許可値
 *   - rawRetention の整合（discarded ↔ path/expires NULL）
 *
 * 詳細形式（ファイル名 / path / expires_at）の format チェックは API 層の責務。
 */
function validateSourceInput(
  source: CreateExternalAnchorSourceInput
): AnchorInputValidationError[] {
  const errors: AnchorInputValidationError[] = [];

  if (
    typeof source.sourceType !== "string" ||
    !(ALLOWED_SOURCE_TYPES as readonly string[]).includes(source.sourceType)
  ) {
    errors.push({
      field: "source.sourceType",
      code: "not_allowed_value",
      message: `sourceType must be one of: ${ALLOWED_SOURCE_TYPES.join(", ")}`,
    });
  }

  const retention = source.rawRetention ?? "discarded";
  if (
    typeof retention !== "string" ||
    !(ALLOWED_RAW_RETENTION as readonly string[]).includes(retention)
  ) {
    errors.push({
      field: "source.rawRetention",
      code: "not_allowed_value",
      message: `rawRetention must be one of: ${ALLOWED_RAW_RETENTION.join(", ")}`,
    });
    return errors;
  }

  if (retention === "discarded") {
    if (source.rawStoragePath !== undefined) {
      errors.push({
        field: "source.rawStoragePath",
        code: "logical_conflict",
        message:
          "rawStoragePath must not be set when rawRetention='discarded'",
      });
    }
    if (source.rawExpiresAt !== undefined) {
      errors.push({
        field: "source.rawExpiresAt",
        code: "logical_conflict",
        message: "rawExpiresAt must not be set when rawRetention='discarded'",
      });
    }
  } else if (retention === "stored") {
    if (
      typeof source.rawStoragePath !== "string" ||
      source.rawStoragePath.length === 0
    ) {
      errors.push({
        field: "source.rawStoragePath",
        code: "required",
        message: "rawStoragePath is required when rawRetention='stored'",
      });
    }
    if (
      typeof source.rawExpiresAt !== "string" ||
      source.rawExpiresAt.length === 0
    ) {
      errors.push({
        field: "source.rawExpiresAt",
        code: "required",
        message: "rawExpiresAt is required when rawRetention='stored'",
      });
    }
  }

  return errors;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Default deps
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function defaultIdFactory(): string {
  // vitest "node" 環境では globalThis.crypto.randomUUID() が使える
  return globalThis.crypto.randomUUID();
}

function defaultNow(): string {
  return new Date().toISOString();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Anchor 構築 helper（discriminated union を保つ）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildOneOffAnchor(args: {
  id: string;
  userId: string;
  sourceId: string;
  confirmedAt: string;
  input: CreateExternalAnchorInput;
}): OneOffExternalAnchor {
  const i = args.input as CreateExternalAnchorInput & { anchorKind: "one_off" };
  // optional 透過（exactOptionalPropertyTypes でも安全な書き方）
  const base: OneOffExternalAnchor = {
    id: args.id,
    userId: args.userId,
    sourceId: args.sourceId,
    confirmedAt: args.confirmedAt,
    anchorKind: "one_off",
    date: i.date,
    title: i.title,
    startTime: i.startTime,
    rigidity: i.rigidity,
  };
  if (i.endTime !== undefined) base.endTime = i.endTime;
  if (i.locationText !== undefined) base.locationText = i.locationText;
  if (i.locationCategory !== undefined) base.locationCategory = i.locationCategory;
  if (i.sensitiveCategory !== undefined) base.sensitiveCategory = i.sensitiveCategory;
  return base;
}

function buildRecurringAnchor(args: {
  id: string;
  userId: string;
  sourceId: string;
  confirmedAt: string;
  input: CreateExternalAnchorInput;
}): RecurringExternalAnchor {
  const i = args.input as CreateExternalAnchorInput & {
    anchorKind: "recurring";
  };
  const base: RecurringExternalAnchor = {
    id: args.id,
    userId: args.userId,
    sourceId: args.sourceId,
    confirmedAt: args.confirmedAt,
    anchorKind: "recurring",
    validFrom: i.validFrom,
    recurrenceRule: i.recurrenceRule,
    title: i.title,
    startTime: i.startTime,
    rigidity: i.rigidity,
  };
  if (i.validUntil !== undefined) base.validUntil = i.validUntil;
  if (i.exceptionDates !== undefined) base.exceptionDates = i.exceptionDates;
  if (i.endTime !== undefined) base.endTime = i.endTime;
  if (i.locationText !== undefined) base.locationText = i.locationText;
  if (i.locationCategory !== undefined) base.locationCategory = i.locationCategory;
  if (i.sensitiveCategory !== undefined) base.sensitiveCategory = i.sensitiveCategory;
  return base;
}

function buildSource(args: {
  id: string;
  userId: string;
  capturedAt: string;
  input: CreateExternalAnchorSourceInput;
}): ExternalAnchorSource {
  const base: ExternalAnchorSource = {
    id: args.id,
    userId: args.userId,
    sourceType: args.input.sourceType,
    capturedAt: args.capturedAt,
    rawRetention: args.input.rawRetention ?? "discarded",
  };
  if (args.input.originalFilename !== undefined)
    base.originalFilename = args.input.originalFilename;
  if (args.input.extractedAt !== undefined)
    base.extractedAt = args.input.extractedAt;
  if (args.input.rawStoragePath !== undefined)
    base.rawStoragePath = args.input.rawStoragePath;
  if (args.input.rawExpiresAt !== undefined)
    base.rawExpiresAt = args.input.rawExpiresAt;
  if (args.input.notes !== undefined) base.notes = args.input.notes;
  return base;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Memory 実装を生成する factory。
 *
 * Closure 内に Map<id, ...> を保持する instance を返す。
 * instance ごとに独立 — global singleton ではない（テスト間漏れ防止）。
 *
 * deps で idFactory / now を inject 可能（deterministic test 用）。
 */
export function createMemoryExternalAnchorRepository(
  deps: ExternalAnchorRepositoryDependencies = {}
): ExternalAnchorRepository {
  const idFactory = deps.idFactory ?? defaultIdFactory;
  const now = deps.now ?? defaultNow;

  // closure-scoped state
  const sources = new Map<string, ExternalAnchorSource>();
  const anchors = new Map<string, ExternalAnchor>();

  return {
    async createSourceWithAnchors(
      userId: string,
      input: CreateSourceWithAnchorsInput
    ): Promise<CreateSourceWithAnchorsResult> {
      const errors: BundleError[] = [];

      // 1. source 検証
      const sourceErrors = validateSourceInput(input.source);
      if (sourceErrors.length > 0) {
        errors.push({ kind: "source_invalid", errors: sourceErrors });
      }

      // 2. anchors 検証（W1-4pre-1 を再利用 — 単一 source of truth）
      const validatedAnchors: Array<CreateExternalAnchorInput | null> = [];
      input.anchors.forEach((a, i) => {
        const r = validateCreateExternalAnchorInput(a);
        if (!r.valid) {
          errors.push({
            kind: "anchor_invalid",
            index: i,
            errors: r.errors,
          });
          validatedAnchors.push(null);
        } else {
          validatedAnchors.push(r.input);
        }
      });

      // 3. 1 件でも invalid → 全体 reject（atomic）
      if (errors.length > 0) {
        return { ok: false, errors };
      }

      // 4. id / now 補完
      const sourceId = idFactory();
      const sourceCapturedAt = now();
      const source = buildSource({
        id: sourceId,
        userId,
        capturedAt: sourceCapturedAt,
        input: input.source,
      });

      // 5. anchors 構築（discriminated union を anchorKind ごとに分岐）
      const persistedAnchors: ExternalAnchor[] = validatedAnchors.map((v) => {
        // null は除外済み（errors.length > 0 で早期 return している）
        const valid = v as CreateExternalAnchorInput;
        const id = idFactory();
        const confirmedAt = now();
        if (valid.anchorKind === "one_off") {
          return buildOneOffAnchor({
            id,
            userId,
            sourceId,
            confirmedAt,
            input: valid,
          });
        }
        return buildRecurringAnchor({
          id,
          userId,
          sourceId,
          confirmedAt,
          input: valid,
        });
      });

      // 6. memory store に投入（atomic）
      sources.set(source.id, source);
      for (const a of persistedAnchors) {
        anchors.set(a.id, a);
      }

      return { ok: true, source, anchors: persistedAnchors };
    },

    async listSources(userId: string): Promise<ExternalAnchorSource[]> {
      return Array.from(sources.values()).filter((s) => s.userId === userId);
    },

    async listAnchors(userId: string): Promise<ExternalAnchor[]> {
      return Array.from(anchors.values()).filter((a) => a.userId === userId);
    },

    async deleteSource(
      userId: string,
      sourceId: string
    ): Promise<{ deleted: number }> {
      const source = sources.get(sourceId);
      // 不在 or 越境 → no-op
      if (!source || source.userId !== userId) {
        return { deleted: 0 };
      }

      let deleted = 0;
      for (const [id, a] of anchors.entries()) {
        if (a.sourceId === sourceId) {
          anchors.delete(id);
          deleted++;
        }
      }
      sources.delete(sourceId);
      return { deleted };
    },
  };
}
