/**
 * Supabase PostgrestError → AppError 変換 (A-2)
 *
 * Supabase JS client が返す `PostgrestError` を、上位層（Repository / API route）が
 * 型で安全に分岐できる discriminated union に変換する。
 *
 * 設計意図:
 *   - Repository 層は `AppError.kind` だけで分岐すればよい（PostgrestError の生 code を見ない）
 *   - API route 層は `AppError.kind` を HTTP status に 1:1 でマップできる
 *   - PostgrestError の異なる shape を 1 箇所で吸収する（DRY）
 *
 * Wave 1 / A-2 範囲:
 *   - 変換 pure 関数のみ
 *   - HTTP status マッピングは API route 層の責務（呼び出し側で kind → status を決める）
 *   - retry / circuit breaker は範囲外
 */

import type { PostgrestError } from "@supabase/supabase-js";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AppError discriminated union
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type AppErrorKind =
  | "validation_error"   // DB CHECK / NOT NULL 違反（通常は API 層 validation で先に弾く）
  | "not_found"          // row 不在（RLS による silent fail も含む）
  | "forbidden"          // 明示的 privilege 不足（rare、通常は 0 rows で表現）
  | "conflict"           // unique 制約違反
  | "internal";          // それ以外（network / 未分類 PostgrestError 含む）

export interface AppError {
  kind: AppErrorKind;
  /** 開発者向けメッセージ。UI 提示はローカライズ側で。 */
  message: string;
  /** デバッグ用に元 error の code（PostgreSQL SQLSTATE / Postgrest 独自 code）を保持 */
  code?: string;
  /** 失敗した DB の制約名（available なら） */
  constraint?: string;
  /** 元の PostgrestError を保持（log 用、API 層で外部に漏らさない） */
  original?: PostgrestError;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PostgrestError → AppError 変換
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * PostgreSQL SQLSTATE / Postgrest code を AppError.kind にマップする。
 *
 * 参考:
 *   - https://www.postgresql.org/docs/current/errcodes-appendix.html
 *   - PostgREST は独自 code (PGRST*) も返す
 */
export function mapPostgrestError(err: PostgrestError): AppError {
  const code = err.code ?? "";
  const message = err.message ?? "supabase error";

  // ── 23xxx: PostgreSQL Integrity Constraint Violation ──
  switch (code) {
    case "23502": // not_null_violation
    case "23514": // check_violation
      return {
        kind: "validation_error",
        message,
        code,
        ...(extractConstraint(err) ? { constraint: extractConstraint(err)! } : {}),
        original: err,
      };

    case "23505": // unique_violation
      return {
        kind: "conflict",
        message,
        code,
        ...(extractConstraint(err) ? { constraint: extractConstraint(err)! } : {}),
        original: err,
      };

    case "23503": // foreign_key_violation（source_id 不在等）
      return {
        kind: "validation_error",
        message,
        code,
        ...(extractConstraint(err) ? { constraint: extractConstraint(err)! } : {}),
        original: err,
      };
  }

  // ── 42xxx: PostgreSQL Syntax / Access Rule Violation ──
  if (code === "42501") {
    return {
      kind: "forbidden",
      message,
      code,
      original: err,
    };
  }

  // ── PGRST116: Postgrest "no rows returned" (single() 失敗) ──
  if (code === "PGRST116") {
    return {
      kind: "not_found",
      message,
      code,
      original: err,
    };
  }

  // ── デフォルト ──
  return {
    kind: "internal",
    message,
    code: code || undefined,
    original: err,
  };
}

/**
 * PostgrestError から制約名を抽出する（available なら）。
 *
 * PostgrestError の `details` field に "Failing row contains..." や
 * "violates check constraint \"foo\"" 等のメッセージが入る場合があるため、正規表現で拾う。
 */
function extractConstraint(err: PostgrestError): string | undefined {
  // details / message のどちらかに constraint 名が含まれる場合がある
  const haystack = `${err.details ?? ""} ${err.message ?? ""}`;
  const m = haystack.match(/constraint\s+"([^"]+)"/i);
  return m ? m[1] : undefined;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// AppError → HTTP status マップ（API route で使う）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * AppError を HTTP status code に 1:1 マップする。
 *
 * Route Handler から呼ぶこと。Repository 内では使わない。
 */
export function appErrorToHttpStatus(kind: AppErrorKind): number {
  switch (kind) {
    case "validation_error":
      return 422;
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "conflict":
      return 409;
    case "internal":
      return 500;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Predicate
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** PostgrestError っぽい value かを最小限 type guard */
export function isPostgrestErrorShape(value: unknown): value is PostgrestError {
  if (value === null || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return typeof o.message === "string" && (typeof o.code === "string" || o.code === undefined || o.code === null);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// W1-Y: RPC fallback 判定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * RPC 呼び出し error から「function 自体が存在しない」を判定する。
 *
 * production migration が未 apply な環境で、staging で着地した RPC 実装を
 * 安全に fallback させるための gate。
 *
 * **設計原則**: fallback は「RPC function が DB に存在しない」ケースに限定する。
 * function が存在するが authentic に拒否された error (auth / RLS / CHECK / parse) は
 * sequential path に流すと同じ拒否を別経路で再発させるか、RPC 実装バグを
 * client-side 経路で隠蔽することになり、観測性を破壊する。
 *
 * Fallback すべき条件（function 自体が存在しない）:
 *   - PGRST202: "Could not find the function ..." (PostgREST schema cache miss)
 *   - PostgreSQL 42883 (undefined_function)
 *   - message ベース安全網: "could not find the function" を含む（PostgREST が
 *     code を出さない縁ケースのみ。十分限定的）
 *
 * Fallback **してはならない** 条件（function はあるが authentic な error）:
 *   - PGRST100: PostgREST query string / request parse error
 *     → RPC 呼び出し側の payload 構築バグの可能性。fallback で隠さず伝播。
 *   - PGRST203: function name ambiguous (overload 衝突)
 *     → function は存在する。fallback は誤った経路。
 *   - 42501: insufficient_privilege (auth / RLS 拒否)
 *     → sequential path も同じ拒否を受ける。伝播。
 *   - 23502: not_null_violation
 *   - 23514: check_violation
 *   - 23505: unique_violation
 *   - 23503: foreign_key_violation
 *     → DB CHECK / NOT NULL / UNIQUE / FK 違反。fallback も同じ違反。伝播。
 *   - その他 PostgrestError (network / 5xx 等)
 *     → 伝播。
 *
 * 設計書: docs/alter-plan-w1y-rpc-atomicity-mini-design.md §3
 */
export function shouldFallbackFromRpcError(err: PostgrestError | null | undefined): boolean {
  if (!err) return false;
  const code = err.code ?? "";
  // PostgREST: function 不在（schema cache miss）
  if (code === "PGRST202") return true;
  // PostgreSQL: undefined_function
  if (code === "42883") return true;
  // message ベース安全網（PostgREST が code を出さない縁ケース。
  // 「function が見つからない」と明示しているメッセージのみ許容）
  const msg = (err.message ?? "").toLowerCase();
  if (msg.includes("could not find the function")) return true;
  return false;
}
