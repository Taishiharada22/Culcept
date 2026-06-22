/**
 * C5-E: CoAlter 非永続 preview — handler + runtime + source-contract tests
 *
 * 設計正本: docs/coalter-c5-implementation-preflight.md（§5 E）。
 * 検証: gate / auth / read→brain→preview（保存なし）/ insufficient / DB write なし / client から body 渡せない。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createMockSupabaseClient } from "@/tests/fixtures/mockSupabaseClient";
import { handleCoAlterPreview } from "@/app/api/coalter/_lib/coalterPreviewHandler";
import { fetchCoAlterPreviewOnce } from "@/app/(culcept)/plan/coalter-runtime/coalterPreviewClient";

const strip = (raw: string) =>
  raw.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
const HANDLER_SRC = strip(readFileSync(resolve(process.cwd(), "app/api/coalter/_lib/coalterPreviewHandler.ts"), "utf8"));
const ROUTE_SRC = strip(readFileSync(resolve(process.cwd(), "app/(culcept)/plan/coalter-runtime/coalterPreviewClient.ts"), "utf8"));
const ROUTE_API_SRC = strip(readFileSync(resolve(process.cwd(), "app/api/coalter/sessions/[sessionId]/preview/route.ts"), "utf8"));

const MESSAGES = "plan_coalter_session_messages";
const seedMsg = async (mock: ReturnType<typeof createMockSupabaseClient>, over: Record<string, unknown>) =>
  mock.from(MESSAGES).insert({
    id: "m-1", session_id: "sess-1", author_kind: "participant", author_user_id: "u-a",
    kind: "chat", visibility: "shared", body: "温泉旅行に行きたい", client_message_id: null,
    created_at: "2026-07-01T00:00:00Z", ...over,
  }).select("*").single();

describe("1. handler: gate / auth / read→brain→preview（保存なし）", () => {
  beforeEach(() => vi.stubEnv("PLAN_COALTER_BRAIN_PREVIEW", "true"));
  afterEach(() => vi.unstubAllEnvs());

  it("flag OFF → 404", async () => {
    vi.stubEnv("PLAN_COALTER_BRAIN_PREVIEW", "false");
    const mock = createMockSupabaseClient(); mock.setAuthUser({ id: "u-a" });
    const res = await handleCoAlterPreview("sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(404);
  });
  it("未認証 → 401", async () => {
    const mock = createMockSupabaseClient();
    const res = await handleCoAlterPreview("sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(401);
  });
  it("member + 旅行会話 → 200 + status=preview + theme=travel（server 生成）", async () => {
    const mock = createMockSupabaseClient(); mock.setAuthUser({ id: "u-a" });
    await seedMsg(mock, {});
    const res = await handleCoAlterPreview("sess-1", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.status).toBe("preview");
    expect(json.preview.theme).toBe("travel");
    expect(typeof json.preview.previewText).toBe("string");
  });
  it("participant message なし（非 member 相当の空 read）→ insufficient", async () => {
    const mock = createMockSupabaseClient(); mock.setAuthUser({ id: "u-a" });
    const res = await handleCoAlterPreview("sess-empty", { supabase: mock.asSupabaseClient() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("insufficient");
  });
});

describe("2. runtime fetch: GET のみ・client は body を渡さない・保存しない", () => {
  const okPreview = { ok: true, status: "preview", preview: { kind: "brain_preview", theme: "travel", hasStalemate: false, constraintReadiness: "low", turnsAnalyzed: 1, previewText: "x" } };
  it("ready: GET method・body undefined（CoAlter body を client が渡せない）", async () => {
    let init: RequestInit | undefined;
    const fakeFetch = (async (_url: string, i?: RequestInit) => { init = i; return new Response(JSON.stringify(okPreview), { status: 200 }); }) as unknown as typeof fetch;
    const r = await fetchCoAlterPreviewOnce("sess-1", fakeFetch);
    expect(r.state).toBe("ready");
    expect(r.preview?.theme).toBe("travel");
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
  });
  it("404 → unavailable", async () => {
    const fakeFetch = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    expect((await fetchCoAlterPreviewOnce("s", fakeFetch)).state).toBe("unavailable");
  });
  it("insufficient → insufficient", async () => {
    const fakeFetch = (async () => new Response(JSON.stringify({ ok: true, status: "insufficient" }), { status: 200 })) as unknown as typeof fetch;
    expect((await fetchCoAlterPreviewOnce("s", fakeFetch)).state).toBe("insufficient");
  });
  it("sessionId 空 → unavailable（fetch しない）", async () => {
    let called = false;
    const fakeFetch = (async () => { called = true; return new Response("", { status: 200 }); }) as unknown as typeof fetch;
    expect((await fetchCoAlterPreviewOnce("", fakeFetch)).state).toBe("unavailable");
    expect(called).toBe(false);
  });
});

describe("3. source-contract: DB write なし・coalter insert なし・persistence なし", () => {
  it("handler は insert/update/delete/upsert/rpc を呼ばない・coalter 行を書かない", () => {
    for (const f of [".insert(", ".update(", ".delete(", ".upsert(", ".rpc(", "author_kind: \"coalter\"", "author_kind:'coalter'", "appendParticipantMessage", "appendCoAlterMessage"]) {
      expect(HANDLER_SRC).not.toContain(f);
    }
    expect(HANDLER_SRC).not.toMatch(/service_role|serviceRole|SECURITY DEFINER/);
    // 使うのは read（listSessionMessages）+ server 生成 brain のみ
    expect(HANDLER_SRC).toContain("listSessionMessages");
    expect(HANDLER_SRC).toContain("buildCoAlterBrainPreview");
  });
  it("client は GET のみ（POST/PUT/insert なし）・body を送らない", () => {
    expect(ROUTE_SRC).toContain('method: "GET"');
    for (const f of ['method: "POST"', 'method: "PUT"', "body:"]) expect(ROUTE_SRC).not.toContain(f);
  });
  it("API route は GET のみ（POST export なし＝write 経路なし）", () => {
    expect(ROUTE_API_SRC).toContain("export async function GET");
    expect(ROUTE_API_SRC).not.toContain("export async function POST");
    expect(ROUTE_API_SRC).toContain("handleCoAlterPreview");
  });
});
