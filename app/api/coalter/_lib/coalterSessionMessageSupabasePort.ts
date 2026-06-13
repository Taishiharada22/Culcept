/**
 * coalterSessionMessageSupabasePort — `SessionMessageDbPort` の **user-RLS Supabase 実装**
 *
 * 正本: docs/coalter-send-route-preflight.md / docs/coalter-plan-session-message-schema-rls-design.md。
 * migration: supabase/migrations/20260613120000_plan_coalter_session_messages.sql（local apply 済・RLS smoke PASS）。
 *
 * 制約（CEO local-only bundle 2026-06-13）:
 *   - **injected user-RLS `SupabaseClient` のみ**（route が `supabaseServer()` を渡す）。
 *     **service_role を使わない**・raw SQL bypass なし・admin client なし。
 *   - DB RLS が最終ゲート（author=auth.uid() + participant membership）。本 port は薄い写像のみ。
 *   - thread/pair-state に依存しない。`/talk` を一切触らない。
 *   - **system/CoAlter insert メソッドを持たない**（`SessionMessageDbPort` 形により特権 write HOLD）。
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  NewParticipantMessageRow,
  SessionMessageDbPort,
  SessionMessageRow,
} from "@/app/(culcept)/plan/tabs/coalter/coalterSessionMessageStore";

const PARTICIPANTS_TABLE = "plan_coalter_session_participants";
const MESSAGES_TABLE = "plan_coalter_session_messages";
const MESSAGE_COLUMNS =
  "id, session_id, author_kind, author_user_id, kind, visibility, body, client_message_id, created_at";

/** unique violation（idempotency 衝突）。 */
const PG_UNIQUE_VIOLATION = "23505";

/**
 * user-RLS Supabase client から `SessionMessageDbPort` を生成する。
 * RLS により participants select は own-row（呼び出し本人の行のみ）になる＝membership 判定に十分。
 * session 不在と非 member は外形上 区別しない（privacy・both → 空配列）。
 */
export function createSupabaseSessionMessagePort(
  supabase: SupabaseClient,
): SessionMessageDbPort {
  return {
    async fetchParticipantUserIds(sessionId) {
      const { data, error } = await supabase
        .from(PARTICIPANTS_TABLE)
        .select("user_id")
        .eq("session_id", sessionId);
      if (error) {
        throw new Error(`fetchParticipantUserIds failed: ${error.message}`);
      }
      // own-row RLS: member なら [self]・非 member/不在なら []（null は返さない＝not_a_participant 写像）。
      return (data ?? []).map((r) => String((r as { user_id: string }).user_id));
    },

    async fetchSessionMessageRows(sessionId) {
      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .select(MESSAGE_COLUMNS)
        .eq("session_id", sessionId);
      if (error) {
        throw new Error(`fetchSessionMessageRows failed: ${error.message}`);
      }
      const rows = (data ?? []) as unknown as SessionMessageRow[];
      // created_at 昇順（tie は id）。DB .order を使わず JS sort（決定論・mock 互換）。
      return [...rows].sort((a, b) =>
        a.created_at === b.created_at
          ? a.id.localeCompare(b.id)
          : a.created_at.localeCompare(b.created_at),
      );
    },

    async insertParticipantMessageRow(row: NewParticipantMessageRow) {
      const { data, error } = await supabase
        .from(MESSAGES_TABLE)
        .insert({
          session_id: row.session_id,
          author_kind: "participant",
          author_user_id: row.author_user_id, // ★ server-stamped 値のみ（caller = auth.uid()）
          kind: row.kind,
          visibility: "shared",
          body: row.body,
          client_message_id: row.client_message_id,
        })
        .select(MESSAGE_COLUMNS)
        .single();

      if (!error && data) {
        return { row: data as unknown as SessionMessageRow, deduped: false };
      }

      // idempotency: unique 衝突なら既存行を返す（重複生成しない）。
      if (error && error.code === PG_UNIQUE_VIOLATION && row.client_message_id !== null) {
        const existing = await supabase
          .from(MESSAGES_TABLE)
          .select(MESSAGE_COLUMNS)
          .eq("session_id", row.session_id)
          .eq("author_user_id", row.author_user_id)
          .eq("client_message_id", row.client_message_id)
          .single();
        if (!existing.error && existing.data) {
          return { row: existing.data as unknown as SessionMessageRow, deduped: true };
        }
      }

      // RLS 拒否（42501）等はここに来る＝DB が最終ゲートで弾いた。throw して route が 5xx/403 に写像。
      throw new Error(
        `insertParticipantMessageRow failed: ${error?.message ?? "unknown"} (code=${error?.code ?? "?"})`,
      );
    },
  };
}
