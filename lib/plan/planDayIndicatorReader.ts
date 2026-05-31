/**
 * plan_day_indicators 読み取り（休み/希望休 の day-level 印）— SR #216 D1
 *
 * /plan が「休み」を表示するための **read path**。勤務は external_anchors（時間枠）、
 * 休みは plan_day_indicators（anchor でない）。本 module は後者を読むだけ（書き込みは shiftImport 側）。
 *
 * 設計（DI で graceful degrade を厳密 test 可能に）:
 *   - logic（listPlanDayIndicators）は注入 runQuery 越しに動く純関数 → fake query で全分岐検証。
 *   - 実 Supabase 配線は createSupabaseDayIndicatorQuery（薄い IO wrapper）。D2 の GET が結線。
 *
 * 不変原則（CEO/GPT 補正 2026-05-31）:
 *   - **graceful degrade は 42P01 undefined_table のみ**（production に table 未適用でも /plan を壊さない）。
 *   - **それ以外の DB error は握りつぶさない**（既存 listAnchors と同じく mapPostgrestError + throw）。
 *     本当の障害を [] で隠さない。
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { mapPostgrestError, isPostgrestErrorShape } from "./supabase-error-mapping";

/** plan_day_indicators の DB row（snake_case）。 */
interface PlanDayIndicatorRow {
  id: string;
  user_id: string;
  source_id: string | null;
  date: string;
  kind: string;
  label: string;
  counts_as_public_holiday: boolean;
  raw_code: string | null;
  semantic_type: string | null;
  source_type: string;
}

/** 休み/希望休 の day-level 印（domain・camelCase）。 */
export interface PlanDayIndicator {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** off = 確定した休み（公休 H / BD） / off_request = 希望休（HREQ） */
  kind: "off" | "off_request";
  /** 表示ラベル（「公休」「休み」「希望休」） */
  label: string;
  /** 公休カウント対象か（H のみ true）。off_request は常に false。 */
  countsAsPublicHoliday: boolean;
  /** 原稿表記（H / BD / HREQ。任意） */
  rawCode: string | null;
  /** 細かい意味（holiday / blank_day / holiday_request。任意） */
  semanticType: string | null;
  /** 由来（manual = 手動 / shift_image = 画像取り込み）。MVP 表示は同一、provenance 保持。 */
  sourceType: "manual" | "shift_image";
  /** 取り込み source（manual は null） */
  sourceId: string | null;
}

export const PLAN_DAY_INDICATORS_TABLE = "plan_day_indicators";
/** PostgreSQL undefined_table（table 不在）。これだけ graceful degrade する。 */
export const UNDEFINED_TABLE_CODE = "42P01";

/** runQuery の戻り（supabase select の {data, error} を正規化）。 */
export interface DayIndicatorQueryResult {
  data: unknown[] | null;
  error: unknown;
}

/** userId を受けて plan_day_indicators を引く IO（実装は supabase / test は fake）。 */
export type DayIndicatorQuery = (
  userId: string
) => Promise<DayIndicatorQueryResult>;

function rowToDayIndicator(row: PlanDayIndicatorRow): PlanDayIndicator {
  return {
    id: row.id,
    date: row.date,
    kind: row.kind === "off_request" ? "off_request" : "off",
    label: row.label,
    countsAsPublicHoliday: row.counts_as_public_holiday === true,
    rawCode: row.raw_code ?? null,
    semanticType: row.semantic_type ?? null,
    sourceType: row.source_type === "manual" ? "manual" : "shift_image",
    sourceId: row.source_id ?? null,
  };
}

/** error が 42P01 undefined_table か（table 不在のみ判定）。 */
function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === UNDEFINED_TABLE_CODE
  );
}

/**
 * user の plan_day_indicators を一覧（read-only）。
 *   - **42P01 undefined_table のみ** []（production に table 未適用でも /plan を壊さない）。
 *   - それ以外の DB error は mapPostgrestError + throw（既存 listAnchors と同方針。障害を隠さない）。
 */
export async function listPlanDayIndicators(
  runQuery: DayIndicatorQuery,
  userId: string
): Promise<PlanDayIndicator[]> {
  const { data, error } = await runQuery(userId);

  if (error) {
    if (isUndefinedTableError(error)) {
      // table がまだ無い環境（production 未適用）→ 休みは出ないが /plan は壊さない
      return [];
    }
    // 本当の障害は [] で隠さない（既存 repo と同じ throw 方針）
    const message = isPostgrestErrorShape(error)
      ? mapPostgrestError(error).message
      : "unknown db error";
    throw new Error(`listPlanDayIndicators failed: ${message}`);
  }

  return (data ?? []).map((r) => rowToDayIndicator(r as PlanDayIndicatorRow));
}

/**
 * 実 Supabase 用の DayIndicatorQuery を作る（薄い IO wrapper）。
 * D2 の GET /api/plan/anchors が `listPlanDayIndicators(createSupabaseDayIndicatorQuery(supabase), userId)` で結線。
 */
export function createSupabaseDayIndicatorQuery(
  client: SupabaseClient
): DayIndicatorQuery {
  return async (userId: string): Promise<DayIndicatorQueryResult> => {
    // supabase の select は thenable のため await で {data, error} に正規化（untyped client）
    const { data, error } = await client
      .from(PLAN_DAY_INDICATORS_TABLE)
      .select("*")
      .eq("user_id", userId);
    return { data: (data ?? null) as unknown[] | null, error };
  };
}
