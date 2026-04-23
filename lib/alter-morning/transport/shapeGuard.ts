/**
 * Transport v2 canary — W3-PR-10 O5 Shape Guard
 *
 * 位置づけ:
 *   O2 / O3 / O4 の emit 直前に metadata の **0-shape 完全性** を検査する
 *   pure validator。違反が見つかっても emit は止めず、caller 側が Sentry へ
 *   fire-and-forget で上げる構造に限定する。
 *
 * 監視対象（CEO 2026-04-23 承認範囲）:
 *   - required field 欠損
 *   - schema_version 不一致（"2026-04-24" 固定）
 *   - caller の想定外値
 *   - flag_source の想定外値（O4 canonical_present=false 時の null は許容）
 *   - fake_zero_travel_count > 0
 *   - sanity_violations 非空
 *   - bin_distribution の 8 key 欠損
 *   - O4 required field 欠損（session_id は null 許容、key 存在だけ見る）
 *
 * 非監視（CEO 明示除外）:
 *   - segment_count > 0 前提の検査
 *   - travel_rendered_count > 0 前提の検査
 *   - travel_items_before / after / delta の値期待（canonical edit は drop 仕様）
 *   - place_change の session_id null を異常扱いすること
 *
 * 設計契約:
 *   - **pure**: env / flag / Sentry / DB を一切読まない。import もしない
 *   - **throw しない**: 破損 metadata でも violations[] を返すだけ（analytics 側の
 *     fire-and-forget 契約を侵食しない）
 *   - **安定順序**: 同じ入力で同じ violations 並び
 *
 * 参照:
 *   - docs/alter-morning-pr10-scope-a-canary-plan.md §3-A / §3-B
 *   - lib/alter-morning/transport/telemetry.ts（field の一次ソース）
 *   - lib/stargazer/trackClient.ts（O4 payload の一次ソース）
 */

import type { TransportBinKey } from "./telemetry";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type TransportV2Event =
  | "transport_v2_segments_built"
  | "transport_v2_display_rendered"
  | "transport_v2_edit_regression";

export type ShapeViolationCode =
  | "required_field_missing"
  | "schema_version_mismatch"
  | "caller_unexpected"
  | "flag_source_unexpected"
  | "fake_zero_travel_non_zero"
  | "sanity_violations_non_empty"
  | "bin_distribution_key_missing";

export interface ShapeViolation {
  /** 違反カテゴリ。Sentry tag にそのまま入る */
  code: ShapeViolationCode;
  /** 短い説明（人間可読）。Sentry message body に畳み込む */
  detail: string;
  /** metadata 中のどの field が原因か。dot-path 許容（例: bin_distribution.le_1km） */
  field?: string;
  /** 実際に観測された値。高基数 PII になりうる値は caller 側で redact する責務 */
  actualValue?: unknown;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Constants
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** canary Phase 1 で固定。emit site の hard-code と揃える */
const EXPECTED_SCHEMA_VERSION = "2026-04-24";

/** 許容 caller。emit site は 3 つ（legacy_adapter / selection_route / client_regenerate） */
const ALLOWED_CALLERS: ReadonlySet<string> = new Set([
  "legacy_adapter",
  "selection_route",
  "client_regenerate",
]);

/**
 * 許容 flag_source。
 *
 * - O2 / O3 は emit 自体が `resolveTransportV2FlagSource(userId) != null` の
 *   guard 配下なので、payload に乗るのは "allowlist" | "global" の 2 値のみ。
 * - O4 は canonical_present=false 経路で `flag_source: null` を送る（trackClient.ts
 *   で推論）。null は O4 に限り違反ではない。
 */
const ALLOWED_FLAG_SOURCES_NON_NULL: ReadonlySet<string> = new Set([
  "allowlist",
  "global",
]);

/** 8 bin key 固定集合 — telemetry.ts:TransportBinKey と同期 */
const BIN_KEYS: readonly TransportBinKey[] = [
  "le_0_2km_null",
  "le_1km",
  "le_3km",
  "le_7km",
  "le_15km",
  "le_30km",
  "gt_30km",
  "invalid_null",
] as const;

/** 全 transport_v2_* event に共通する required field */
const COMMON_REQUIRED_FIELDS: readonly string[] = [
  "schema_version",
  "flag_source",
  "plan_date",
  "caller",
] as const;

/** O2 固有 required field */
const O2_REQUIRED_FIELDS: readonly string[] = [
  "event_count",
  "eligible_pair_count",
  "segment_count",
  "duration_non_null_count",
  "duration_null_count",
  "bin_distribution",
  "mode",
  "sanity_violations",
] as const;

/** O3 固有 required field */
const O3_REQUIRED_FIELDS: readonly string[] = [
  "segment_count",
  "travel_rendered_count",
  "skipped_null_count",
  "fake_zero_travel_count",
] as const;

/**
 * O4 固有 required field。
 *
 * session_id は null 許容（key の存在だけ要求）。その他は undefined を禁止。
 */
const O4_REQUIRED_FIELDS: readonly string[] = [
  "canonical_present",
  "transport_segments_count",
  "travel_items_before",
  "travel_items_after",
  "travel_items_delta",
  "edit_trigger",
  "session_id",
] as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Public API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * transport_v2 系 event の metadata が 0-shape 契約を満たすか検査する。
 *
 * 返値:
 *   - 空配列: 契約準拠
 *   - 非空配列: 違反ひとつ以上（caller は primary を tag, 全量を extra に載せる想定）
 *
 * 副作用: なし
 */
export function validateTransportV2Shape(
  event: TransportV2Event,
  metadata: unknown,
): ShapeViolation[] {
  const violations: ShapeViolation[] = [];

  if (!isPlainObject(metadata)) {
    violations.push({
      code: "required_field_missing",
      detail: "metadata is not an object",
      field: "metadata",
      actualValue: summarizeForAlert(metadata),
    });
    return violations;
  }

  // ── 共通 required ──
  for (const f of COMMON_REQUIRED_FIELDS) {
    if (!(f in metadata) || metadata[f] === undefined) {
      violations.push({
        code: "required_field_missing",
        detail: `common required field "${f}" is undefined`,
        field: f,
      });
    }
  }

  // ── schema_version ──
  if ("schema_version" in metadata && metadata.schema_version !== undefined) {
    if (metadata.schema_version !== EXPECTED_SCHEMA_VERSION) {
      violations.push({
        code: "schema_version_mismatch",
        detail: `schema_version !== "${EXPECTED_SCHEMA_VERSION}"`,
        field: "schema_version",
        actualValue: summarizeForAlert(metadata.schema_version),
      });
    }
  }

  // ── caller enum ──
  if ("caller" in metadata && metadata.caller !== undefined) {
    const callerStr = typeof metadata.caller === "string" ? metadata.caller : null;
    if (callerStr === null || !ALLOWED_CALLERS.has(callerStr)) {
      violations.push({
        code: "caller_unexpected",
        detail: "caller is not in {legacy_adapter, selection_route, client_regenerate}",
        field: "caller",
        actualValue: summarizeForAlert(metadata.caller),
      });
    }
  }

  // ── flag_source enum ──
  //   O4 は canonical_present=false で null 許容、O2/O3 は非 null 必須。
  if ("flag_source" in metadata && metadata.flag_source !== undefined) {
    const fs = metadata.flag_source;
    const isAllowedNonNull =
      typeof fs === "string" && ALLOWED_FLAG_SOURCES_NON_NULL.has(fs);
    const isNullAllowedHere = event === "transport_v2_edit_regression" && fs === null;
    if (!isAllowedNonNull && !isNullAllowedHere) {
      violations.push({
        code: "flag_source_unexpected",
        detail:
          event === "transport_v2_edit_regression"
            ? "flag_source is not {allowlist, global, null}"
            : "flag_source is not {allowlist, global}",
        field: "flag_source",
        actualValue: summarizeForAlert(fs),
      });
    }
  }

  // ── event-specific ──
  if (event === "transport_v2_segments_built") {
    validateO2Specific(metadata, violations);
  } else if (event === "transport_v2_display_rendered") {
    validateO3Specific(metadata, violations);
  } else if (event === "transport_v2_edit_regression") {
    validateO4Specific(metadata, violations);
  }

  return violations;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Event-specific validators
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function validateO2Specific(
  metadata: Record<string, unknown>,
  violations: ShapeViolation[],
): void {
  for (const f of O2_REQUIRED_FIELDS) {
    if (!(f in metadata) || metadata[f] === undefined) {
      violations.push({
        code: "required_field_missing",
        detail: `O2 required field "${f}" is undefined`,
        field: f,
      });
    }
  }

  // sanity_violations: 空配列のみ許容
  if ("sanity_violations" in metadata && metadata.sanity_violations !== undefined) {
    const sv = metadata.sanity_violations;
    if (Array.isArray(sv) && sv.length > 0) {
      violations.push({
        code: "sanity_violations_non_empty",
        detail: `sanity_violations: [${sv.map((x) => String(x)).join(",")}]`,
        field: "sanity_violations",
        actualValue: sv,
      });
    }
  }

  // bin_distribution: 8 key 全てが存在するか
  if ("bin_distribution" in metadata && metadata.bin_distribution !== undefined) {
    const bd = metadata.bin_distribution;
    if (isPlainObject(bd)) {
      for (const k of BIN_KEYS) {
        if (!(k in bd)) {
          violations.push({
            code: "bin_distribution_key_missing",
            detail: `bin_distribution.${k} is absent`,
            field: `bin_distribution.${k}`,
          });
        }
      }
    } else {
      // 型違反は required_field_missing で報告するのが自然（bin_distribution そのものが object でない）
      violations.push({
        code: "required_field_missing",
        detail: "bin_distribution is not an object",
        field: "bin_distribution",
        actualValue: summarizeForAlert(bd),
      });
    }
  }
}

function validateO3Specific(
  metadata: Record<string, unknown>,
  violations: ShapeViolation[],
): void {
  for (const f of O3_REQUIRED_FIELDS) {
    if (!(f in metadata) || metadata[f] === undefined) {
      violations.push({
        code: "required_field_missing",
        detail: `O3 required field "${f}" is undefined`,
        field: f,
      });
    }
  }

  // fake_zero_travel_count > 0 は regression の核（CEO 明示 in-scope）
  if (
    "fake_zero_travel_count" in metadata &&
    metadata.fake_zero_travel_count !== undefined
  ) {
    const fz = metadata.fake_zero_travel_count;
    if (typeof fz === "number" && Number.isFinite(fz) && fz > 0) {
      violations.push({
        code: "fake_zero_travel_non_zero",
        detail: `fake_zero_travel_count=${fz}`,
        field: "fake_zero_travel_count",
        actualValue: fz,
      });
    }
  }
}

function validateO4Specific(
  metadata: Record<string, unknown>,
  violations: ShapeViolation[],
): void {
  // session_id は null 許容なので key の存在だけ要求。他は undefined 禁止。
  for (const f of O4_REQUIRED_FIELDS) {
    const present = f in metadata;
    if (!present) {
      violations.push({
        code: "required_field_missing",
        detail: `O4 required field "${f}" is absent`,
        field: f,
      });
      continue;
    }
    if (f !== "session_id" && metadata[f] === undefined) {
      violations.push({
        code: "required_field_missing",
        detail: `O4 required field "${f}" is undefined`,
        field: f,
      });
    }
  }
  // NOTE（CEO 明示除外、2026-04-23）:
  //   - travel_items_before / after / delta の値期待はここで検査しない
  //     （canonical edit での drop は仕様であり anomaly ではない）
  //   - place_change の session_id null は異常扱いしない
  //   - transport_segments_count > 0 前提の検査はしない
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Sentry `extra` に載せる値を 低基数 & 短文字列 に縮める。
 * 違反原因の shape 特定だけが目的。PII 的 payload は入ってこない想定だが
 * 防御的に string は 80 chars で切る。
 */
function summarizeForAlert(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  const t = typeof v;
  if (t === "string") {
    const s = v as string;
    return s.length > 80 ? `${s.slice(0, 80)}…` : s;
  }
  if (t === "number" || t === "boolean") return v;
  if (Array.isArray(v)) return `[array len=${v.length}]`;
  if (t === "object") return `[object]`;
  return `[${t}]`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Test 同期 check で使う。public にはするが @internal。
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** @internal テストが enum/key の列挙を assert するために参照 */
export const __SHAPE_GUARD_FIXTURES = {
  EXPECTED_SCHEMA_VERSION,
  ALLOWED_CALLERS,
  ALLOWED_FLAG_SOURCES_NON_NULL,
  BIN_KEYS,
  COMMON_REQUIRED_FIELDS,
  O2_REQUIRED_FIELDS,
  O3_REQUIRED_FIELDS,
  O4_REQUIRED_FIELDS,
} as const;
