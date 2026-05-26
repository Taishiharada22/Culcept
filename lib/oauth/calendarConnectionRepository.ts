/**
 * P3-A-1-1-d: calendar connection / subscriptions repository (= supabase wrapper)
 *
 * 設計書: docs/alter-plan-p3-a-1-1-oauth-scaffold-readiness.md §1.5 + §1.8
 * decision-log: 2026-05-26 D3 採用、 client mock で payload 厳密 assert
 *
 * 役割:
 *   - upsertConnection: user_calendar_connections への UPSERT (= ON CONFLICT user_id+provider)
 *   - bulkUpsertSubscriptions: user_calendar_subscriptions への bulk UPSERT (= 自動 is_enabled 判定)
 *
 * 不変原則 (= CEO 実装条件 3, 5, 6):
 *   1. client は引数で受け取る (= test では mock 注入)
 *   2. throw しない (= 戻り値で ok / reason)
 *   3. schema 不一致でも fail-safe (= error.message を detail に含めて返す、 throw しない)
 *   4. is_enabled 自動判定 ロジックは pure (= 親 Q2 採用案 c)
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CalendarListItem } from "./googleCalendarApi";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// upsertConnection
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type UpsertConnectionInput = {
  readonly userId: string;
  readonly provider: "google" | "microsoft";
  readonly refreshTokenEncrypted: Buffer;
  readonly accessTokenExpiresAt: Date;
  readonly scopes: ReadonlyArray<string>;
};

export type UpsertConnectionResult =
  | { readonly ok: true; readonly connectionId: string }
  | { readonly ok: false; readonly reason: "db_error"; readonly detail: string };

/**
 * user_calendar_connections への UPSERT。
 *
 * - UNIQUE (user_id, provider) 制約による ON CONFLICT 想定
 * - status は常に 'active' に reset (= 再連携時の状態復帰)
 * - last_synced_at は null reset (= 次回 sync で更新)
 */
export async function upsertConnection(
  client: SupabaseClient,
  input: UpsertConnectionInput,
): Promise<UpsertConnectionResult> {
  const payload = {
    user_id: input.userId,
    provider: input.provider,
    refresh_token_encrypted: input.refreshTokenEncrypted,
    access_token_expires_at: input.accessTokenExpiresAt.toISOString(),
    scopes: [...input.scopes],
    status: "active",
    last_synced_at: null,
  };

  try {
    const { data, error } = await client
      .from("user_calendar_connections")
      .upsert(payload, { onConflict: "user_id,provider" })
      .select("id")
      .single();

    if (error) {
      return { ok: false, reason: "db_error", detail: error.message };
    }
    if (!data || typeof (data as { id?: unknown }).id !== "string") {
      return { ok: false, reason: "db_error", detail: "no_row_returned" };
    }
    return { ok: true, connectionId: (data as { id: string }).id };
  } catch (e) {
    // schema 不一致等 (= unknown shape error) も fail-safe で reason='db_error'
    return {
      ok: false,
      reason: "db_error",
      detail: e instanceof Error ? e.message : "unknown_exception",
    };
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// bulkUpsertSubscriptions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type SubscriptionRow = {
  readonly user_id: string;
  readonly connection_id: string;
  readonly external_calendar_id: string;
  readonly display_name: string;
  readonly access_role: "owner" | "writer" | "reader";
  readonly is_primary: boolean;
  readonly is_enabled: boolean;
};

export type BulkUpsertSubscriptionsInput = {
  readonly userId: string;
  readonly connectionId: string;
  readonly calendars: ReadonlyArray<CalendarListItem>;
};

export type BulkUpsertSubscriptionsResult =
  | { readonly ok: true; readonly insertedCount: number }
  | { readonly ok: false; readonly reason: "db_error"; readonly detail: string };

/**
 * is_enabled 自動判定 (= 親 Q2 採用案 c、 pure helper)
 *   - primary: 必ず true
 *   - owner / writer: default ON
 *   - reader / freeBusyReader: default OFF (= user は設定画面で個別 ON 可)
 */
export function shouldEnableByDefault(cal: CalendarListItem): boolean {
  if (cal.primary) return true;
  if (cal.accessRole === "owner" || cal.accessRole === "writer") return true;
  return false;
}

/**
 * access_role を DB CHECK 制約 ('owner'|'writer'|'reader') に正規化
 * freeBusyReader → reader にマップ (= migration schema は freeBusyReader を持たない)
 */
export function normalizeAccessRole(
  role: CalendarListItem["accessRole"],
): SubscriptionRow["access_role"] {
  if (role === "freeBusyReader") return "reader";
  return role;
}

/**
 * CalendarListItem[] → SubscriptionRow[] 変換 (= pure helper)
 */
export function buildSubscriptionRows(
  input: BulkUpsertSubscriptionsInput,
): SubscriptionRow[] {
  return input.calendars.map((cal) => ({
    user_id: input.userId,
    connection_id: input.connectionId,
    external_calendar_id: cal.id,
    display_name: cal.summary,
    access_role: normalizeAccessRole(cal.accessRole),
    is_primary: cal.primary,
    is_enabled: shouldEnableByDefault(cal),
  }));
}

/**
 * user_calendar_subscriptions への bulk UPSERT。
 *
 * - UNIQUE (connection_id, external_calendar_id) 制約による ON CONFLICT
 * - 空配列は早期 return (= API call なし)
 */
export async function bulkUpsertSubscriptions(
  client: SupabaseClient,
  input: BulkUpsertSubscriptionsInput,
): Promise<BulkUpsertSubscriptionsResult> {
  const rows = buildSubscriptionRows(input);
  if (rows.length === 0) {
    return { ok: true, insertedCount: 0 };
  }

  try {
    const { error } = await client
      .from("user_calendar_subscriptions")
      .upsert(rows, { onConflict: "connection_id,external_calendar_id" });

    if (error) {
      return { ok: false, reason: "db_error", detail: error.message };
    }
    return { ok: true, insertedCount: rows.length };
  } catch (e) {
    return {
      ok: false,
      reason: "db_error",
      detail: e instanceof Error ? e.message : "unknown_exception",
    };
  }
}
