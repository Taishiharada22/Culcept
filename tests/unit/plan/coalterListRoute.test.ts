/**
 * CoAlter list (GET) handler test（mock supabase client・実 DB なし）
 *
 * 検証: flag OFF→404 / 無認証→401 / member は messages（row→view 写像）/ 形は {ok,messages}。
 * （非 member 空・RLS は psql smoke が担保。mock は RLS 再現しないため row 写像/分岐のみ検証。）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { createMockSupabaseClient } from "@/tests/fixtures/mockSupabaseClient";
import { handleCoAlterList } from "@/app/api/coalter/_lib/sendRouteHandler";

const MESSAGES = "plan_coalter_session_messages";

describe("CoAlter list (GET) handler", () => {
  beforeEach(() => vi.stubEnv("PLAN_COALTER_SEND_LOCAL", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("flag OFF → 404", async () => {
    vi.stubEnv("PLAN_COALTER_SEND_LOCAL", "false");
    const mock = createMockSupabaseClient();
    mock.setAuthUser({ id: "u-a" });
    const res = await handleCoAlterList("sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(404);
  });

  it("無認証 → 401", async () => {
    const mock = createMockSupabaseClient();
    const res = await handleCoAlterList("sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(401);
  });

  it("member → 200 + messages（row→CoAlterSessionMessage 写像）", async () => {
    const mock = createMockSupabaseClient();
    mock.setAuthUser({ id: "u-a" });
    await mock.from(MESSAGES).insert({
      id: "m-1", session_id: "sess-1", author_kind: "participant", author_user_id: "u-a",
      kind: "chat", visibility: "shared", body: "やあ", client_message_id: null, created_at: "2026-06-13T00:00:00Z",
    }).select("*").single();
    const res = await handleCoAlterList("sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.messages).toHaveLength(1);
    expect(json.messages[0].author).toEqual({ kind: "participant", userId: "u-a" });
    expect(json.messages[0].body).toBe("やあ");
    expect(json.messages[0].sessionId).toBe("sess-1");
  });

  it("messages 0 件でも 200 + 空配列（fail-closed 表現）", async () => {
    const mock = createMockSupabaseClient();
    mock.setAuthUser({ id: "u-a" });
    const res = await handleCoAlterList("sess-empty", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.messages).toEqual([]);
  });
});
