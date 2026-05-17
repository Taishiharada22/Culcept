/**
 * Plan Anchors API Route Handler tests (A-2 Commit 2)
 *
 * 重点項目:
 *   1. auth gate (401)
 *   2. body parsing (400 malformed)
 *   3. validation error (422)
 *   4. happy path (200 with data)
 *   5. userId 詐称防御: request body / param に他人の userId を含めても無視
 *   6. DELETE の information leak prevention (200 + deletedSource:false)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockSupabaseClient, type MockSupabaseClient } from "@/tests/fixtures/mockSupabaseClient";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// supabaseServer mock
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// test scope の mock を共有する
let currentMockClient: MockSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => currentMockClient.asSupabaseClient()),
}));

// Route handler を import（mock 後）
import { POST, GET } from "@/app/api/plan/anchors/route";
import { DELETE } from "@/app/api/plan/anchors/[sourceId]/route";

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeRequest(
  url: string,
  init?: { method?: string; body?: unknown }
): Request {
  return new Request(url, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function makeValidBundle(overrides: Partial<{ title: string }> = {}) {
  return {
    source: { sourceType: "manual" },
    anchors: [
      {
        anchorKind: "one_off",
        title: overrides.title ?? "歯科予約",
        date: "2026-05-10",
        startTime: "14:30",
        rigidity: "hard",
        sourceType: "manual",
      },
    ],
  };
}

beforeEach(() => {
  currentMockClient = createMockSupabaseClient({ idPrefix: "api-row" });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("POST /api/plan/anchors", () => {
  it("無認証 → 401", async () => {
    const req = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: makeValidBundle(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("Unauthorized");
    // store には何も書き込まれない
    expect(currentMockClient.inspect("external_anchor_sources")).toHaveLength(0);
  });

  it("malformed JSON → 400", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = new Request("http://localhost/api/plan/anchors", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("body が source/anchors を欠く → 400", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: { foo: "bar" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("anchors が array でない → 400", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: { source: { sourceType: "manual" }, anchors: "not-array" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("validation 違反（anchor 不正）→ 422 + errors", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: {
        source: { sourceType: "manual" },
        anchors: [
          {
            anchorKind: "one_off",
            // date 欠落
            title: "broken",
            startTime: "14:00",
            rigidity: "hard",
            sourceType: "manual",
          },
        ],
      },
    });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toBe("validation_error");
    expect(json.errors).toBeDefined();
    expect(Array.isArray(json.errors)).toBe(true);
    // 副作用なし
    expect(currentMockClient.inspect("external_anchor_sources")).toHaveLength(0);
  });

  it("正常系 → 200 + data { source, anchors }", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: makeValidBundle(),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.source.userId).toBe(USER_A);
    expect(json.data.anchors).toHaveLength(1);
    expect(json.data.anchors[0].userId).toBe(USER_A);
    // store に書き込まれている
    expect(currentMockClient.inspect("external_anchor_sources")).toHaveLength(1);
  });

  it("userId 詐称防御: body に userId を入れても auth.userId が使われる", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const bundle = makeValidBundle();
    // 攻撃: body に他人の userId を混ぜる
    const malicious = { ...bundle, userId: USER_B };
    const req = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: malicious,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    // 保存された source は USER_A のもの。USER_B にはなっていない
    expect(json.data.source.userId).toBe(USER_A);
    expect(json.data.anchors[0].userId).toBe(USER_A);
  });

  it("auth.getUser が error → 401", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    currentMockClient.failAuthNext({ message: "jwt expired" });
    const req = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: makeValidBundle(),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("GET /api/plan/anchors", () => {
  it("無認証 → 401", async () => {
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("正常系 → 200 + data { sources, anchors }", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    // 事前に 1 件 INSERT
    const postReq = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: makeValidBundle(),
    });
    await POST(postReq);

    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.sources).toHaveLength(1);
    expect(json.data.anchors).toHaveLength(1);
    expect(json.data.sources[0].userId).toBe(USER_A);
  });

  it("0 件 → 200 + 空配列", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const res = await GET();
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.sources).toEqual([]);
    expect(json.data.anchors).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("DELETE /api/plan/anchors/[sourceId]", () => {
  it("無認証 → 401", async () => {
    const req = makeRequest("http://localhost/api/plan/anchors/x", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ sourceId: "x" }) });
    expect(res.status).toBe(401);
  });

  it("空 sourceId → 400", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = makeRequest("http://localhost/api/plan/anchors/", {
      method: "DELETE",
    });
    const res = await DELETE(req, { params: Promise.resolve({ sourceId: "" }) });
    expect(res.status).toBe(400);
  });

  it("自分の source を削除 → 200 + { deletedSource:true, deletedAnchors: N }", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const postReq = makeRequest("http://localhost/api/plan/anchors", {
      method: "POST",
      body: makeValidBundle(),
    });
    const postRes = await POST(postReq);
    const postJson = await postRes.json();
    const sourceId = postJson.data.source.id as string;

    const delReq = makeRequest(`http://localhost/api/plan/anchors/${sourceId}`, {
      method: "DELETE",
    });
    const res = await DELETE(delReq, {
      params: Promise.resolve({ sourceId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.deletedSource).toBe(true);
    expect(json.data.deletedAnchors).toBe(1);
  });

  it("source 不在 / 他人の source → 200 + { deletedSource:false, deletedAnchors:0 } (情報漏洩防止)", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = makeRequest("http://localhost/api/plan/anchors/nonexistent", {
      method: "DELETE",
    });
    const res = await DELETE(req, {
      params: Promise.resolve({ sourceId: "nonexistent" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ deletedSource: false, deletedAnchors: 0 });
  });
});
