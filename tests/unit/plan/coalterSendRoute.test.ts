/**
 * CoAlter local-only send — handler test（**mock supabase client 注入**・実 DB/route fetch なし）
 *
 * 検証（CEO bundle §6）:
 *   - flag OFF → 404（local-only gate）
 *   - 無認証 → 401
 *   - body に author/userId/source → 400（client は authority を出せない）
 *   - body text 欠落 → 400 / 空 body → 422
 *   - participant → 201・author は server stamp（user.id）
 *   - 非 participant → 403
 *   - idempotent: 同一 clientMessageId は既存 message を返す（重複なし）
 *   - system/CoAlter 送信経路なし / `/talk` mutation なし（handler は `/talk` を触らない）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createMockSupabaseClient } from "@/tests/fixtures/mockSupabaseClient";
import { handleCoAlterSend } from "@/app/api/coalter/_lib/sendRouteHandler";

const PARTICIPANTS = "plan_coalter_session_participants";
const MESSAGES = "plan_coalter_session_messages";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/coalter/sessions/sess-1/messages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function newMock() {
  return createMockSupabaseClient();
}

async function seedParticipant(mock: ReturnType<typeof newMock>, userId: string, sessionId = "sess-1") {
  await mock.from(PARTICIPANTS).insert({ session_id: sessionId, user_id: userId, source_kind: "plan_session" }).select("*").single();
}

describe("CoAlter local-only send handler", () => {
  beforeEach(() => {
    vi.stubEnv("PLAN_COALTER_SEND_LOCAL", "true");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("flag OFF → 404（local-only gate）", async () => {
    vi.stubEnv("PLAN_COALTER_SEND_LOCAL", "false");
    const mock = newMock();
    mock.setAuthUser({ id: "u-a" });
    const res = await handleCoAlterSend(makeReq({ body: "hi" }), "sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(404);
  });

  it("UX-5a-1: read ON / send OFF → POST は 404（read flag では write が開かない）", async () => {
    vi.stubEnv("PLAN_COALTER_SEND_LOCAL", "false");
    vi.stubEnv("PLAN_COALTER_READ_LOCAL", "true"); // read だけ ON
    const mock = newMock();
    mock.setAuthUser({ id: "u-a" });
    const res = await handleCoAlterSend(makeReq({ body: "hi" }), "sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(404); // send gate のみが POST を開く
  });

  it("無認証 → 401", async () => {
    const mock = newMock(); // setAuthUser しない＝user null
    const res = await handleCoAlterSend(makeReq({ body: "hi" }), "sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(401);
  });

  it("body に author を含む → 400（client は authority を出せない）", async () => {
    const mock = newMock();
    mock.setAuthUser({ id: "u-a" });
    await seedParticipant(mock, "u-a");
    const res = await handleCoAlterSend(
      makeReq({ body: "hi", author: { kind: "participant", userId: "u-b" } }),
      "sess-1",
      { supabase: mock.asSupabaseClient() },
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("author_not_allowed");
    // insert は走っていない
    expect(mock.inspect(MESSAGES)).toHaveLength(0);
  });

  it("user_id/source を含む → 400", async () => {
    const mock = newMock();
    mock.setAuthUser({ id: "u-a" });
    for (const bad of [{ body: "x", user_id: "u-b" }, { body: "x", source: { kind: "self" } }]) {
      const res = await handleCoAlterSend(makeReq(bad), "sess-1", { supabase: mock.asSupabaseClient() });
      expect(res.status).toBe(400);
    }
  });

  it("body text 欠落 → 400 / 空 body → 422", async () => {
    const mock = newMock();
    mock.setAuthUser({ id: "u-a" });
    await seedParticipant(mock, "u-a");
    const noBody = await handleCoAlterSend(makeReq({ clientMessageId: "x" }), "sess-1", { supabase: mock.asSupabaseClient() });
    expect(noBody.status).toBe(400);
    const empty = await handleCoAlterSend(makeReq({ body: "   " }), "sess-1", { supabase: mock.asSupabaseClient() });
    expect(empty.status).toBe(422);
  });

  it("participant → 201・author は server stamp（user.id・body の値ではない）", async () => {
    const mock = newMock();
    mock.setAuthUser({ id: "u-a" });
    await seedParticipant(mock, "u-a");
    const res = await handleCoAlterSend(makeReq({ body: "こんにちは" }), "sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.message.author).toEqual({ kind: "participant", userId: "u-a" });
    expect(json.message.body).toBe("こんにちは");
    expect(json.message.visibility).toBe("shared");
    // 永続化された行の author_user_id は u-a（server stamp）
    const stored = mock.inspect(MESSAGES);
    expect(stored).toHaveLength(1);
    expect(stored[0].author_user_id).toBe("u-a");
  });

  it("非 participant → 403", async () => {
    const mock = newMock();
    mock.setAuthUser({ id: "u-a" });
    await seedParticipant(mock, "u-other"); // u-a は member でない
    const res = await handleCoAlterSend(makeReq({ body: "侵入" }), "sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(403);
    expect(mock.inspect(MESSAGES)).toHaveLength(0);
  });

  it("idempotent: 同一 clientMessageId は既存 message を返す（重複なし）", async () => {
    const mock = newMock();
    mock.setAuthUser({ id: "u-a" });
    await seedParticipant(mock, "u-a");
    // 既存 message を seed
    await mock.from(MESSAGES).insert({
      id: "existing-1", session_id: "sess-1", author_kind: "participant", author_user_id: "u-a",
      kind: "chat", visibility: "shared", body: "最初の一回", client_message_id: "idem-1", created_at: "2026-06-13T00:00:00Z",
    }).select("*").single();
    // 次の insert を unique 衝突に
    mock.failNext("insert", MESSAGES, { code: "23505", message: "duplicate key" });
    const res = await handleCoAlterSend(makeReq({ body: "二回目", clientMessageId: "idem-1" }), "sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.message.id).toBe("existing-1");
    expect(json.message.body).toBe("最初の一回");
  });

  it("handler/route は `/talk` を一切触らない（fs guard）", () => {
    for (const f of [
      "app/api/coalter/_lib/sendRouteHandler.ts",
      "app/api/coalter/sessions/[sessionId]/messages/route.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), f), "utf8");
      expect(/["'`]\/api\/talk/.test(src), `${f}: no /api/talk`).toBe(false);
      expect(src.includes("read_at"), `${f}: no read_at`).toBe(false);
      expect(src.includes("SUPABASE_SERVICE_ROLE_KEY"), `${f}: no service_role`).toBe(false);
      expect(src.includes("appendSystemMessage"), `${f}: no system send`).toBe(false);
    }
  });
});
