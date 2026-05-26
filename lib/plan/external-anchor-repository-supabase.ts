/**
 * Supabase ExternalAnchorRepository 実装 (A-2)
 *
 * Memory 実装と同一 interface (lib/plan/external-anchor-repository.ts) を
 * Supabase backend で実装する。
 *
 * 設計書: docs/alter-plan-foundation-design.md §2.1, §11.2
 * 計画書: docs/alter-plan-a2-atomicity-tradeoff.md
 *
 * 不変原則:
 *   1. 全 method は userId 引数を明示的に受け取り、auth context への暗黙依存を持たない
 *   2. createSourceWithAnchors は best-effort atomicity:
 *      - source INSERT 成功 → anchors INSERT 失敗時に source を compensating DELETE
 *      - compensating delete も失敗した場合は orphan_source として errors に明示
 *      - 完全 atomicity は W1-Y で Postgres RPC `create_external_anchor_bundle()` に置き換え予定
 *   3. RLS が二重防御。明示 .eq('user_id', userId) も常に付与（RLS + 明示の depth-in-depth）
 *   4. user 越境（user 不一致）と source 不在は戻り値で同一視（情報漏洩防止、interface 不変原則 4）
 *   5. logger は inject 可能（observability + deterministic test）
 *
 * A-2 範囲外:
 *   - Postgres RPC による完全 atomicity（W1-Y）
 *   - service_role の使用（A-2 では一切使わない、anon + RLS のみ）
 *   - migration 追加
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
  RecurringExternalAnchor,
} from "./external-anchor";
import type { ExternalAnchorSource } from "./external-anchor-source";
import type { CreateExternalAnchorInput } from "./external-anchor-input";
import { validateCreateExternalAnchorInput } from "./external-anchor-input";
import { collectSourceInputErrors } from "./external-anchor-source-input";
import type {
  BundleError,
  CreateSourceWithAnchorsInput,
  CreateSourceWithAnchorsResult,
  DeleteExternalAnchorSourceResult,
  ExternalAnchorRepository,
} from "./external-anchor-repository";
import {
  mapPostgrestError,
  shouldFallbackFromRpcError,
  type AppError,
} from "./supabase-error-mapping";
import { validateAnchorUpdate } from "./anchor-update-validation";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Options
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export interface SupabaseExternalAnchorRepositoryOptions {
  /**
   * 失敗観測用 logger。default は console.warn にフォールバック。
   * テストでは spy を inject する想定。
   */
  logger?: (event: SupabaseRepoLogEvent) => void;
}

export type SupabaseRepoLogEvent =
  | {
      kind: "orphan_source";
      sourceId: string;
      userId: string;
      reason: string;
      compensatingError?: AppError;
    }
  | {
      kind: "compensating_delete_attempted";
      sourceId: string;
      userId: string;
    }
  // W1-Y: RPC が function missing で fallback したことを観測する。
  // production migration 完了後は発火数 = 0 になるべき。
  //
  // reason は単一値 "function_missing"。fallback は「function 自体が存在しない」
  // ケースに限定するため (shouldFallbackFromRpcError 参照)、他の理由ラベルは持たない。
  // PGRST100 等の parse error は fallback せず実 error として伝播するため、
  // この log event の対象外。
  | {
      kind: "rpc_fallback";
      reason: "function_missing";
      rpcCode?: string;
      rpcMessage?: string;
      userId: string;
    };

function defaultLogger(event: SupabaseRepoLogEvent): void {
  // 本番では Sentry / 構造化ログに送る。A-2 では console で十分
  // eslint-disable-next-line no-console
  console.warn("[ExternalAnchor/Supabase]", event);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DB row 型（snake_case、Supabase 返却 shape）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface ExternalAnchorSourceRow {
  id: string;
  user_id: string;
  source_type: string;
  original_filename: string | null;
  extracted_at: string | null;
  captured_at: string;
  raw_retention: "discarded" | "stored";
  raw_storage_path: string | null;
  raw_expires_at: string | null;
  notes: string | null;
}

interface ExternalAnchorRow {
  id: string;
  user_id: string;
  source_id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location_text: string | null;
  location_category: string | null;
  rigidity: "hard" | "soft";
  confirmed_at: string;
  confidence: number | null;
  sensitive_category: string | null;
  anchor_kind: "one_off" | "recurring";
  date: string | null;
  valid_from: string | null;
  valid_until: string | null;
  recurrence_rule: string | null;
  exception_dates: string[] | null;
  /**
   * P3 W3 (= 2026-05-26): .ics VEVENT UID（NULL 許容）
   * source_type='ics' の anchor のみ持つ。
   */
  external_uid: string | null;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Row → Domain mappers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function rowToSource(row: ExternalAnchorSourceRow): ExternalAnchorSource {
  const base: ExternalAnchorSource = {
    id: row.id,
    userId: row.user_id,
    sourceType: row.source_type as ExternalAnchorSource["sourceType"],
    capturedAt: row.captured_at,
    rawRetention: row.raw_retention,
  };
  if (row.original_filename !== null) base.originalFilename = row.original_filename;
  if (row.extracted_at !== null) base.extractedAt = row.extracted_at;
  if (row.raw_storage_path !== null) base.rawStoragePath = row.raw_storage_path;
  if (row.raw_expires_at !== null) base.rawExpiresAt = row.raw_expires_at;
  if (row.notes !== null) base.notes = row.notes;
  return base;
}

function rowToAnchor(row: ExternalAnchorRow): ExternalAnchor {
  // 共通 base
  const commonBase = {
    id: row.id,
    userId: row.user_id,
    sourceId: row.source_id,
    title: row.title,
    startTime: row.start_time,
    rigidity: row.rigidity,
    confirmedAt: row.confirmed_at,
  } as const;

  if (row.anchor_kind === "one_off") {
    if (row.date === null) {
      // CHECK 制約で防がれるはず。来たら設計バグ
      throw new Error(`Inconsistent row: one_off with date=null (id=${row.id})`);
    }
    const oneOff: OneOffExternalAnchor = {
      ...commonBase,
      anchorKind: "one_off",
      date: row.date,
    };
    if (row.end_time !== null) oneOff.endTime = row.end_time;
    if (row.location_text !== null) oneOff.locationText = row.location_text;
    if (row.location_category !== null) {
      oneOff.locationCategory = row.location_category as OneOffExternalAnchor["locationCategory"];
    }
    if (row.confidence !== null) oneOff.confidence = row.confidence;
    if (row.sensitive_category !== null) {
      oneOff.sensitiveCategory = row.sensitive_category as OneOffExternalAnchor["sensitiveCategory"];
    }
    // P3 W3 (= 2026-05-26): externalUid mapping (= .ics VEVENT UID)
    if (row.external_uid !== null) oneOff.externalUid = row.external_uid;
    return oneOff;
  }

  // recurring
  if (row.valid_from === null || row.recurrence_rule === null) {
    throw new Error(
      `Inconsistent row: recurring missing valid_from / recurrence_rule (id=${row.id})`
    );
  }
  const recurring: RecurringExternalAnchor = {
    ...commonBase,
    anchorKind: "recurring",
    validFrom: row.valid_from,
    recurrenceRule: row.recurrence_rule,
  };
  if (row.valid_until !== null) recurring.validUntil = row.valid_until;
  if (row.exception_dates !== null) recurring.exceptionDates = row.exception_dates;
  if (row.end_time !== null) recurring.endTime = row.end_time;
  if (row.location_text !== null) recurring.locationText = row.location_text;
  if (row.location_category !== null) {
    recurring.locationCategory = row.location_category as RecurringExternalAnchor["locationCategory"];
  }
  if (row.confidence !== null) recurring.confidence = row.confidence;
  if (row.sensitive_category !== null) {
    recurring.sensitiveCategory = row.sensitive_category as RecurringExternalAnchor["sensitiveCategory"];
  }
  // P3 W3 (= 2026-05-26): externalUid mapping (= .ics VEVENT UID)
  if (row.external_uid !== null) recurring.externalUid = row.external_uid;
  return recurring;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Domain input → DB insert payload
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * source insert payload（snake_case、null 明示）。
 * id / captured_at は DB DEFAULT に委ねるため含めない。
 */
function sourceInsertPayload(
  userId: string,
  input: CreateSourceWithAnchorsInput["source"]
): Record<string, unknown> {
  return {
    user_id: userId,
    source_type: input.sourceType,
    original_filename: input.originalFilename ?? null,
    extracted_at: input.extractedAt ?? null,
    raw_retention: input.rawRetention ?? "discarded",
    raw_storage_path: input.rawStoragePath ?? null,
    raw_expires_at: input.rawExpiresAt ?? null,
    notes: input.notes ?? null,
  };
}

/**
 * anchor insert payload（snake_case、null 明示）。
 * id / confirmed_at は client 補完（confirmed_at は now、id は DB DEFAULT）。
 * 直交制約: one_off なら recurring 専用列を null、recurring なら date を null。
 */
function anchorInsertPayload(
  userId: string,
  sourceId: string,
  input: CreateExternalAnchorInput,
  nowIso: string
): Record<string, unknown> {
  const isOneOff = input.anchorKind === "one_off";
  return {
    user_id: userId,
    source_id: sourceId,
    title: input.title,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    location_text: input.locationText ?? null,
    location_category: input.locationCategory ?? null,
    rigidity: input.rigidity,
    confirmed_at: nowIso,
    confidence: null, // W1-4 範囲外
    sensitive_category: input.sensitiveCategory ?? null,
    anchor_kind: input.anchorKind,
    date: isOneOff ? input.date : null,
    valid_from: isOneOff ? null : input.validFrom,
    valid_until: isOneOff ? null : (input.validUntil ?? null),
    recurrence_rule: isOneOff ? null : input.recurrenceRule,
    exception_dates: isOneOff ? null : (input.exceptionDates ?? null),
    // P3 W3 (= 2026-05-26): .ics VEVENT UID (= sourceType='ics' のみ設定、 他は NULL)
    external_uid: input.externalUid ?? null,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RPC payload / result helpers (W1-Y)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * RPC `create_external_anchor_bundle` に渡す source 形 (snake_case)。
 *
 * - user_id は p_user_id で渡すため payload には含めない
 * - id / captured_at / created_at は DB DEFAULT で補完
 */
function sourceInsertPayloadForRpc(
  input: CreateSourceWithAnchorsInput["source"]
): Record<string, unknown> {
  return {
    source_type: input.sourceType,
    original_filename: input.originalFilename ?? null,
    extracted_at: input.extractedAt ?? null,
    raw_retention: input.rawRetention ?? "discarded",
    raw_storage_path: input.rawStoragePath ?? null,
    raw_expires_at: input.rawExpiresAt ?? null,
    notes: input.notes ?? null,
  };
}

/**
 * RPC に渡す anchor 形 (snake_case)。
 *
 * - user_id / source_id / confirmed_at は function 内で埋める
 *   (p_user_id / v_source.id / NOW())
 * - id / created_at / updated_at は DB DEFAULT
 */
function anchorInsertPayloadForRpc(
  input: CreateExternalAnchorInput
): Record<string, unknown> {
  const isOneOff = input.anchorKind === "one_off";
  return {
    title: input.title,
    start_time: input.startTime,
    end_time: input.endTime ?? null,
    location_text: input.locationText ?? null,
    location_category: input.locationCategory ?? null,
    rigidity: input.rigidity,
    confidence: null,
    sensitive_category: input.sensitiveCategory ?? null,
    anchor_kind: input.anchorKind,
    date: isOneOff ? input.date : null,
    valid_from: isOneOff ? null : input.validFrom,
    valid_until: isOneOff ? null : (input.validUntil ?? null),
    recurrence_rule: isOneOff ? null : input.recurrenceRule,
    exception_dates: isOneOff ? null : (input.exceptionDates ?? null),
    // P3 W3 (= 2026-05-26): .ics VEVENT UID (= sourceType='ics' のみ設定、 他は NULL)
    external_uid: input.externalUid ?? null,
  };
}

/**
 * RPC `create_external_anchor_bundle` の戻り値 (jsonb) を
 * CreateSourceWithAnchorsResult に変換する。
 *
 * 期待 shape: { source: ExternalAnchorSourceRow, anchors: ExternalAnchorRow[] }
 *
 * @returns 想定通りなら ok:true 結果、shape 違反なら null (呼び出し側で throw)
 */
function parseRpcBundleResult(
  rpcData: unknown
): CreateSourceWithAnchorsResult | null {
  if (!rpcData || typeof rpcData !== "object") return null;
  const obj = rpcData as { source?: unknown; anchors?: unknown };
  if (!obj.source || typeof obj.source !== "object") return null;
  if (!Array.isArray(obj.anchors)) return null;
  const source = rowToSource(obj.source as ExternalAnchorSourceRow);
  const anchors = (obj.anchors as ExternalAnchorRow[]).map(rowToAnchor);
  return { ok: true, source, anchors };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Factory
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Supabase ExternalAnchorRepository factory.
 *
 * 同一 instance 内で複数 user データを扱える（method-level userId）。
 * RLS が物理層の防御、明示 .eq('user_id', userId) が application 層の防御として
 * 二重に効く設計（depth-in-defense）。
 *
 * @param client RLS-aware Supabase client（@supabase/ssr の cookie-bound client を想定）
 * @param opts.logger 失敗観測用 logger（default は console.warn）
 */
export function createSupabaseExternalAnchorRepository(
  client: SupabaseClient,
  opts: SupabaseExternalAnchorRepositoryOptions = {}
): ExternalAnchorRepository {
  const logger = opts.logger ?? defaultLogger;

  return {
    async createSourceWithAnchors(
      userId: string,
      input: CreateSourceWithAnchorsInput
    ): Promise<CreateSourceWithAnchorsResult> {
      // ── 1. pure validation（memory と完全に同一の入力検証） ──
      const errors: BundleError[] = [];

      const sourceErrors = collectSourceInputErrors(input.source);
      if (sourceErrors.length > 0) {
        errors.push({ kind: "source_invalid", errors: sourceErrors });
      }

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

      if (errors.length > 0) {
        return { ok: false, errors };
      }

      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      // 2. RPC 試行 (W1-Y: atomic via create_external_anchor_bundle)
      //    - function が存在する staging では 1 transaction で完全 atomic
      //    - function 不在 production では fallback (既存 sequential path)
      //    - 実 error (auth / RLS / CHECK) は fallback せず伝播
      // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
      const validInputs = validatedAnchors as CreateExternalAnchorInput[];
      const rpcSourcePayload = sourceInsertPayloadForRpc(input.source);
      const rpcAnchorsPayload = validInputs.map((a) =>
        anchorInsertPayloadForRpc(a)
      );

      const { data: rpcData, error: rpcError } = await client.rpc(
        "create_external_anchor_bundle",
        {
          p_user_id: userId,
          p_source: rpcSourcePayload,
          p_anchors: rpcAnchorsPayload,
        }
      );

      if (!rpcError && rpcData) {
        // RPC 成功: function が { source, anchors } の JSONB を返す
        const parsed = parseRpcBundleResult(rpcData);
        if (parsed) return parsed;
        // 想定外 shape は internal error として伝播（fallback しない、bug の可能性）
        throw new Error("create_external_anchor_bundle returned unexpected shape");
      }

      if (rpcError) {
        if (shouldFallbackFromRpcError(rpcError)) {
          // function 不在 → fallback path へフォールスルー
          // 全 fallback 条件は「function が DB に存在しない」class に限定されるため、
          // reason は "function_missing" で固定。
          logger({
            kind: "rpc_fallback",
            reason: "function_missing",
            ...(rpcError.code ? { rpcCode: rpcError.code } : {}),
            ...(rpcError.message ? { rpcMessage: rpcError.message } : {}),
            userId,
          });
          // fall through to legacy sequential path below
        } else {
          // 実 error (42501 / 23xxx / network 等) はそのまま bundle error として整形
          const appErr = mapPostgrestError(rpcError);
          return {
            ok: false,
            errors: [
              {
                // どの kind か判定不能なので anchor_invalid に寄せる (validation_error は CHECK 違反の可能性)
                kind: "anchor_invalid",
                index: 0,
                errors: [
                  {
                    field: "(rpc)",
                    code:
                      appErr.kind === "validation_error"
                        ? "logical_conflict"
                        : "invalid_format",
                    message: `RPC rejected bundle: ${appErr.message}`,
                  },
                ],
              },
            ],
          };
        }
      }

      // ── 3. (Fallback) source INSERT（DB が id / captured_at を補完、RETURNING で取得） ──
      //      RPC が function missing で fallback したケースのみここに到達。
      const { data: sourceRow, error: sourceError } = await client
        .from("external_anchor_sources")
        .insert(sourceInsertPayload(userId, input.source))
        .select()
        .single();

      if (sourceError || !sourceRow) {
        // 通常は API 層 validation で先に弾けるが、DB CHECK で初めて発覚するケース
        const appErr = sourceError
          ? mapPostgrestError(sourceError)
          : { kind: "internal" as const, message: "no source row returned" };
        return {
          ok: false,
          errors: [
            {
              kind: "source_invalid",
              errors: [
                {
                  field: "source",
                  code: appErr.kind === "validation_error" ? "logical_conflict" : "invalid_format",
                  message: `DB rejected source insert: ${appErr.message}`,
                },
              ],
            },
          ],
        };
      }

      const source = rowToSource(sourceRow as ExternalAnchorSourceRow);

      // ── 3. anchors INSERT（batch、source.id を全件に注入） ──
      const nowIso = source.capturedAt; // DB が補完した時刻に合わせる
      const anchorPayloads = (validatedAnchors as CreateExternalAnchorInput[]).map((a) =>
        anchorInsertPayload(userId, source.id, a, nowIso)
      );

      // 0 件 INSERT は許容（PDF 抽出失敗時の source-only ログ等の将来用途、memory 仕様と一致）
      if (anchorPayloads.length === 0) {
        return { ok: true, source, anchors: [] };
      }

      const { data: anchorRows, error: anchorsError } = await client
        .from("external_anchors")
        .insert(anchorPayloads)
        .select();

      if (anchorsError || !anchorRows) {
        // ── 4. compensating delete（best-effort atomicity） ──
        logger({
          kind: "compensating_delete_attempted",
          sourceId: source.id,
          userId,
        });

        const { error: compError } = await client
          .from("external_anchor_sources")
          .delete()
          .eq("id", source.id)
          .eq("user_id", userId);

        const appErr = anchorsError
          ? mapPostgrestError(anchorsError)
          : { kind: "internal" as const, message: "no anchor rows returned" };

        const bundleErrors: BundleError[] = [
          {
            kind: "anchor_invalid",
            index: 0, // batch INSERT のためどの要素が原因か特定不能。0 を代表値として返す
            errors: [
              {
                field: "(batch)",
                code: appErr.kind === "validation_error" ? "logical_conflict" : "invalid_format",
                message: `DB rejected anchors batch insert: ${appErr.message}`,
              },
            ],
          },
        ];

        if (compError) {
          // ── 5. compensating delete も失敗 → orphan source 発生、構造化 log + 戻り値に明示 ──
          const compAppErr = mapPostgrestError(compError);
          logger({
            kind: "orphan_source",
            sourceId: source.id,
            userId,
            reason: "compensating delete failed after anchors INSERT failure",
            compensatingError: compAppErr,
          });
        }

        return { ok: false, errors: bundleErrors };
      }

      const anchors = (anchorRows as ExternalAnchorRow[]).map(rowToAnchor);

      return { ok: true, source, anchors };
    },

    async listSources(userId: string): Promise<ExternalAnchorSource[]> {
      const { data, error } = await client
        .from("external_anchor_sources")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        // 致命的 error。空配列フォールバックは情報の歪曲になるため throw
        const appErr = mapPostgrestError(error);
        throw new Error(`listSources failed: ${appErr.message}`);
      }
      return (data ?? []).map((r) => rowToSource(r as ExternalAnchorSourceRow));
    },

    async listAnchors(userId: string): Promise<ExternalAnchor[]> {
      const { data, error } = await client
        .from("external_anchors")
        .select("*")
        .eq("user_id", userId);

      if (error) {
        const appErr = mapPostgrestError(error);
        throw new Error(`listAnchors failed: ${appErr.message}`);
      }
      return (data ?? []).map((r) => rowToAnchor(r as ExternalAnchorRow));
    },

    async deleteSource(
      userId: string,
      sourceId: string
    ): Promise<DeleteExternalAnchorSourceResult> {
      // ── 1. cascade で消える anchors の数を事前に数える（RLS 適用済み） ──
      const { count: anchorCount, error: countError } = await client
        .from("external_anchors")
        .select("id", { count: "exact", head: true })
        .eq("source_id", sourceId)
        .eq("user_id", userId);

      if (countError) {
        const appErr = mapPostgrestError(countError);
        throw new Error(`deleteSource count failed: ${appErr.message}`);
      }

      // ── 2. source 削除（ON DELETE CASCADE で anchors も削除） ──
      // 二重防御: RLS + 明示 .eq('user_id', userId)
      // RLS が efficacious なら .eq は no-op、RLS bypass の万一に備えた application 層防御
      const { data: deletedRows, error: deleteError } = await client
        .from("external_anchor_sources")
        .delete()
        .eq("id", sourceId)
        .eq("user_id", userId)
        .select("id");

      if (deleteError) {
        const appErr = mapPostgrestError(deleteError);
        throw new Error(`deleteSource failed: ${appErr.message}`);
      }

      const deletedSource = (deletedRows ?? []).length > 0;

      // user 不一致 / source 不在 → どちらも { deletedSource: false, deletedAnchors: 0 }
      // 情報漏洩防止（interface 不変原則 4）
      if (!deletedSource) {
        return { deletedSource: false, deletedAnchors: 0 };
      }

      return {
        deletedSource: true,
        deletedAnchors: anchorCount ?? 0,
      };
    },

    async updateAnchor(userId, anchorId, patch) {
      // ── 1. 既存 anchor を fetch（user_id 二重防御） ──
      const { data: existingRow, error: selectError } = await client
        .from("external_anchors")
        .select("*")
        .eq("id", anchorId)
        .eq("user_id", userId)
        .maybeSingle();

      if (selectError) {
        const appErr = mapPostgrestError(selectError);
        // RLS による silent fail（PGRST116 等）も not_found 同視
        if (appErr.kind === "not_found") {
          return { ok: false, kind: "not_found" };
        }
        throw new Error(`updateAnchor select failed: ${appErr.message}`);
      }
      if (!existingRow) {
        // 情報漏洩防止: user 不一致 / 不在 / RLS 拒否 を同一視
        return { ok: false, kind: "not_found" };
      }

      const existing = rowToAnchor(existingRow as ExternalAnchorRow);

      // ── 2. existing + sanitized patch → validateAnchorUpdate ──
      const v = validateAnchorUpdate(existing, patch);
      if (!v.valid) {
        return { ok: false, kind: "invalid", errors: v.errors };
      }

      // ── 3. UPDATE payload を構築 ──
      // confirmedAt は既存維持（patch では変えない、anchor の「教え直し時刻」は別概念）
      // id / user_id / source_id は触らない（RLS + 明示 .eq で防御）
      const isOneOff = v.merged.anchorKind === "one_off";
      const updatePayload: Record<string, unknown> = {
        title: v.merged.title,
        start_time: v.merged.startTime,
        end_time: v.merged.endTime ?? null,
        location_text: v.merged.locationText ?? null,
        location_category: v.merged.locationCategory ?? null,
        rigidity: v.merged.rigidity,
        sensitive_category: v.merged.sensitiveCategory ?? null,
        // anchor_kind は不変として送らない（CHECK 制約衝突回避 + 不変原則）
        date: isOneOff ? v.merged.date : null,
        valid_from: isOneOff ? null : v.merged.validFrom,
        valid_until: isOneOff ? null : (v.merged.validUntil ?? null),
        recurrence_rule: isOneOff ? null : v.merged.recurrenceRule,
        exception_dates: isOneOff ? null : (v.merged.exceptionDates ?? null),
        updated_at: new Date().toISOString(),
      };

      // ── 4. UPDATE（RLS + 明示 .eq の二重防御） ──
      const { data: updatedRow, error: updateError } = await client
        .from("external_anchors")
        .update(updatePayload)
        .eq("id", anchorId)
        .eq("user_id", userId)
        .select()
        .single();

      if (updateError || !updatedRow) {
        const appErr = updateError
          ? mapPostgrestError(updateError)
          : { kind: "internal" as const, message: "no row returned" };
        if (appErr.kind === "not_found") {
          // 更新中に削除された等のレース
          return { ok: false, kind: "not_found" };
        }
        if (appErr.kind === "validation_error") {
          // DB CHECK 制約違反（通常 client validation で防げるが defensive）
          return {
            ok: false,
            kind: "invalid",
            errors: [
              {
                field: "(db)",
                code: "logical_conflict",
                message: `DB rejected update: ${appErr.message}`,
              },
            ],
          };
        }
        logger({
          kind: "compensating_delete_attempted",
          sourceId: existing.sourceId,
          userId,
        });
        throw new Error(`updateAnchor failed: ${appErr.message}`);
      }

      return {
        ok: true,
        anchor: rowToAnchor(updatedRow as ExternalAnchorRow),
      };
    },
  };
}
