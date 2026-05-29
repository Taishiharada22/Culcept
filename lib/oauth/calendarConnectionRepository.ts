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
    // bytea カラムへは PostgreSQL hex 入力形式 (`\x` + hex) の文字列で渡す。
    // 生 Buffer を直接渡すと supabase-js が JSON 直列化時に Buffer.toJSON()
    // (= {"type":"Buffer","data":[...]}) へ化け、別バイト列として bytea に保存される
    // (= upsert 自体は成功する)。結果、読み戻し後の復号で auth-tag 検証が必ず失敗する。
    // 読み戻し側 (findConnection) は既に `\x`-hex を decode するので、書き⇄読みが対称になる。
    refresh_token_encrypted: `\\x${input.refreshTokenEncrypted.toString("hex")}`,
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// findConnection / deleteConnection (= P3-A-1-1-f status / disconnect 用)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ConnectionView = {
  readonly id: string;
  readonly status: "active" | "revoked" | "token_expired";
  readonly lastSyncedAt: string | null;
  readonly scopes: ReadonlyArray<string>;
  readonly refreshTokenEncrypted: Buffer;
};

export type FindConnectionResult =
  | { readonly ok: true; readonly connection: ConnectionView | null }
  | { readonly ok: false; readonly reason: "db_error"; readonly detail: string };

/**
 * user × provider で 1 件の connection を取得 (= 存在しない場合 null)。
 *
 * - status route で接続状態判定用
 * - disconnect route で revoke 用 refresh_token 取り出し用
 * - schema 不一致 / DB error は fail-safe で reason='db_error'
 */
export async function findConnection(
  client: SupabaseClient,
  userId: string,
  provider: "google" | "microsoft",
): Promise<FindConnectionResult> {
  try {
    const { data, error } = await client
      .from("user_calendar_connections")
      .select("id, status, last_synced_at, scopes, refresh_token_encrypted")
      .eq("user_id", userId)
      .eq("provider", provider)
      .maybeSingle();

    if (error) {
      return { ok: false, reason: "db_error", detail: error.message };
    }
    if (!data) {
      return { ok: true, connection: null };
    }

    const row = data as {
      id?: unknown;
      status?: unknown;
      last_synced_at?: unknown;
      scopes?: unknown;
      refresh_token_encrypted?: unknown;
    };

    if (typeof row.id !== "string") {
      return { ok: false, reason: "db_error", detail: "invalid_id" };
    }
    if (
      row.status !== "active" &&
      row.status !== "revoked" &&
      row.status !== "token_expired"
    ) {
      return { ok: false, reason: "db_error", detail: "invalid_status" };
    }

    // refresh_token_encrypted は Supabase 経由で base64 string (= bytea encoded) or Buffer
    let refreshTokenEncrypted: Buffer;
    if (Buffer.isBuffer(row.refresh_token_encrypted)) {
      refreshTokenEncrypted = row.refresh_token_encrypted;
    } else if (typeof row.refresh_token_encrypted === "string") {
      // Supabase は bytea を `\x` prefix の hex 16 進文字列で返す
      const s = row.refresh_token_encrypted;
      refreshTokenEncrypted = s.startsWith("\\x")
        ? Buffer.from(s.slice(2), "hex")
        : Buffer.from(s, "base64");
    } else {
      return { ok: false, reason: "db_error", detail: "invalid_refresh_token_format" };
    }

    return {
      ok: true,
      connection: {
        id: row.id,
        status: row.status,
        lastSyncedAt: typeof row.last_synced_at === "string" ? row.last_synced_at : null,
        scopes: Array.isArray(row.scopes) ? (row.scopes as string[]) : [],
        refreshTokenEncrypted,
      },
    };
  } catch (e) {
    return {
      ok: false,
      reason: "db_error",
      detail: e instanceof Error ? e.message : "unknown_exception",
    };
  }
}

export type DeleteConnectionResult =
  | { readonly ok: true; readonly deleted: boolean }
  | { readonly ok: false; readonly reason: "db_error"; readonly detail: string };

/**
 * user × provider で connection 削除 (= subscriptions は ON DELETE CASCADE で自動削除)。
 *
 * @returns deleted: true = 削除した、 false = もともと無かった
 */
export async function deleteConnection(
  client: SupabaseClient,
  userId: string,
  provider: "google" | "microsoft",
): Promise<DeleteConnectionResult> {
  try {
    const { data, error } = await client
      .from("user_calendar_connections")
      .delete()
      .eq("user_id", userId)
      .eq("provider", provider)
      .select("id");

    if (error) {
      return { ok: false, reason: "db_error", detail: error.message };
    }

    const rows = Array.isArray(data) ? data : [];
    return { ok: true, deleted: rows.length > 0 };
  } catch (e) {
    return {
      ok: false,
      reason: "db_error",
      detail: e instanceof Error ? e.message : "unknown_exception",
    };
  }
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

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// listEnabledCalendarIds (= P3 Phase B B-2: import 対象 calendar 取得)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type ListEnabledCalendarIdsResult =
  | { readonly ok: true; readonly calendarIds: ReadonlyArray<string> }
  | { readonly ok: false; readonly reason: "db_error"; readonly detail: string };

/**
 * connection の is_enabled=true subscription の external_calendar_id 一覧を取得。
 *
 * - importGoogleAnchors action が 「どの calendar から events を取るか」 の決定に使う
 * - connect 時 (= callback route) に bulkUpsertSubscriptions で自動判定・保存済の値を読む
 * - 二重防御: RLS + 明示 .eq('user_id', userId)（既存 repo 方針と一致）
 * - 空 (= 有効カレンダーなし) は ok:true + 空配列 (= caller が imported:0 で正常終了)
 * - schema 不一致 / DB error は fail-safe で reason='db_error'（throw しない）
 */
export async function listEnabledCalendarIds(
  client: SupabaseClient,
  userId: string,
  connectionId: string,
): Promise<ListEnabledCalendarIdsResult> {
  try {
    const { data, error } = await client
      .from("user_calendar_subscriptions")
      .select("external_calendar_id")
      .eq("user_id", userId)
      .eq("connection_id", connectionId)
      .eq("is_enabled", true);

    if (error) {
      return { ok: false, reason: "db_error", detail: error.message };
    }

    const rows = Array.isArray(data) ? data : [];
    const calendarIds: string[] = [];
    for (const r of rows) {
      const id = (r as { external_calendar_id?: unknown }).external_calendar_id;
      if (typeof id === "string" && id.length > 0) {
        calendarIds.push(id);
      }
    }
    return { ok: true, calendarIds };
  } catch (e) {
    return {
      ok: false,
      reason: "db_error",
      detail: e instanceof Error ? e.message : "unknown_exception",
    };
  }
}
