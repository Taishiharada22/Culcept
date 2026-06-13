/**
 * coalterSessionMessageSupabasePort — user-RLS Supabase port test（**mock client のみ**・実 DB なし）
 *
 * 検証: row 写像 / participant id 取得 / insert / idempotency（unique 衝突→既存返し）/ no service_role。
 * （RLS そのものは mock では再現しない＝local SQL smoke が担保。ここは port の写像/分岐を検証。）
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createMockSupabaseClient } from "@/tests/fixtures/mockSupabaseClient";
import { createSupabaseSessionMessagePort } from "@/app/api/coalter/_lib/coalterSessionMessageSupabasePort";

const PARTICIPANTS = "plan_coalter_session_participants";
const MESSAGES = "plan_coalter_session_messages";

function seedMessageRow(mock: ReturnType<typeof createMockSupabaseClient>, row: Record<string, unknown>) {
  // mock.from(table).insert(row).select().single() で store に直接 seed
  return mock.from(MESSAGES).insert(row).select("*").single();
}

describe("coalterSessionMessageSupabasePort (user-RLS port, mock client)", () => {
  it("fetchParticipantUserIds は session の participant user_id を返す", async () => {
    const mock = createMockSupabaseClient();
    await mock.from(PARTICIPANTS).insert({ session_id: "sess-1", user_id: "u-a", source_kind: "plan_session" }).select("*").single();
    await mock.from(PARTICIPANTS).insert({ session_id: "sess-1", user_id: "u-b", source_kind: "plan_session" }).select("*").single();
    await mock.from(PARTICIPANTS).insert({ session_id: "sess-2", user_id: "u-c", source_kind: "plan_session" }).select("*").single();
    const port = createSupabaseSessionMessagePort(mock.asSupabaseClient());
    const ids = await port.fetchParticipantUserIds("sess-1");
    expect([...(ids ?? [])].sort()).toEqual(["u-a", "u-b"]);
    expect(await port.fetchParticipantUserIds("sess-none")).toEqual([]);
  });

  it("fetchSessionMessageRows は created_at 昇順で返す（JS sort・mock 互換）", async () => {
    const mock = createMockSupabaseClient();
    await seedMessageRow(mock, { id: "m-2", session_id: "sess-1", author_kind: "participant", author_user_id: "u-a", kind: "chat", visibility: "shared", body: "二番目", client_message_id: null, created_at: "2026-06-13T00:00:02Z" });
    await seedMessageRow(mock, { id: "m-1", session_id: "sess-1", author_kind: "coalter", author_user_id: null, kind: "system_event", visibility: "shared", body: "一番目", client_message_id: null, created_at: "2026-06-13T00:00:01Z" });
    const port = createSupabaseSessionMessagePort(mock.asSupabaseClient());
    const rows = await port.fetchSessionMessageRows("sess-1");
    expect(rows.map((r) => r.body)).toEqual(["一番目", "二番目"]);
  });

  it("insertParticipantMessageRow は participant 行を insert して返す（deduped=false）", async () => {
    const mock = createMockSupabaseClient();
    const port = createSupabaseSessionMessagePort(mock.asSupabaseClient());
    const res = await port.insertParticipantMessageRow({
      session_id: "sess-1",
      author_kind: "participant",
      author_user_id: "u-a",
      kind: "chat",
      visibility: "shared",
      body: "こんにちは",
      client_message_id: "idem-1",
    });
    expect(res.deduped).toBe(false);
    expect(res.row.author_user_id).toBe("u-a");
    expect(res.row.author_kind).toBe("participant");
    expect(res.row.body).toBe("こんにちは");
  });

  it("idempotency: unique 衝突(23505)時は既存行を返す（deduped=true）", async () => {
    const mock = createMockSupabaseClient();
    // 既存行を seed
    await seedMessageRow(mock, { id: "existing-1", session_id: "sess-1", author_kind: "participant", author_user_id: "u-a", kind: "chat", visibility: "shared", body: "最初の一回", client_message_id: "idem-1", created_at: "2026-06-13T00:00:00Z" });
    // 次の insert を unique violation にする
    mock.failNext("insert", MESSAGES, { code: "23505", message: "duplicate key" });
    const port = createSupabaseSessionMessagePort(mock.asSupabaseClient());
    const res = await port.insertParticipantMessageRow({
      session_id: "sess-1",
      author_kind: "participant",
      author_user_id: "u-a",
      kind: "chat",
      visibility: "shared",
      body: "二回目（無視される）",
      client_message_id: "idem-1",
    });
    expect(res.deduped).toBe(true);
    expect(res.row.id).toBe("existing-1");
    expect(res.row.body).toBe("最初の一回"); // 既存を返す（上書きしない）
  });

  it("port は service_role を wiring しない・client は inject のみ（fs guard）", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/coalter/_lib/coalterSessionMessageSupabasePort.ts"),
      "utf8",
    );
    expect(src.includes("SUPABASE_SERVICE_ROLE_KEY"), "no service_role env").toBe(false);
    expect(/createClient\s*\(/.test(src), "no createClient (inject only)").toBe(false);
    expect(src.includes("supabaseAdmin"), "no admin client").toBe(false);
    expect(/["'`]\/api\/talk/.test(src), "no /api/talk").toBe(false);
    // client は引数注入のみ（型 import 以外で @supabase/supabase-js から値を import しない）
    expect(/import\s+\{[^}]*\}\s+from\s+["']@supabase\/supabase-js["']/.test(src), "no value import from supabase-js").toBe(false);
  });
});
