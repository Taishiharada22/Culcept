/**
 * Plan Anchor Items API Route tests (W1-X2)
 *
 * PATCH /api/plan/anchor-items/[anchorId] の Route Handler を mock supabase で verify。
 *
 * 重点項目:
 *   1. auth gate (401)
 *   2. body parsing (400)
 *   3. validation error (422 + errors)
 *   4. happy path (200 + data.anchor)
 *   5. user 不一致 / anchor 不在 → 404 (情報漏洩防止のため両者を同一視)
 *   6. patch sanitization: id / userId / sourceId / anchorKind 改竄拒否
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  createMockSupabaseClient,
  type MockSupabaseClient,
} from "@/tests/fixtures/mockSupabaseClient";

let currentMockClient: MockSupabaseClient;

vi.mock("@/lib/supabase/server", () => ({
  supabaseServer: vi.fn(async () => currentMockClient.asSupabaseClient()),
}));

import { PATCH } from "@/app/api/plan/anchor-items/[anchorId]/route";
import { POST } from "@/app/api/plan/anchors/route";

const USER_A = "00000000-0000-0000-0000-00000000000a";
const USER_B = "00000000-0000-0000-0000-00000000000b";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeRequest(
  url: string,
  init?: { method?: string; body?: unknown }
): Request {
  return new Request(url, {
    method: init?.method ?? "PATCH",
    headers: { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

function validBundle() {
  return {
    source: { sourceType: "manual" },
    anchors: [
      {
        anchorKind: "one_off",
        title: "歯科予約",
        date: "2026-05-25",
        startTime: "14:30",
        rigidity: "hard",
        sourceType: "manual",
      },
    ],
  };
}

async function createOneAnchor(user: string): Promise<string> {
  currentMockClient.setAuthUser({ id: user });
  const req = makeRequest("http://localhost/api/plan/anchors", {
    method: "POST",
    body: validBundle(),
  });
  const res = await POST(req);
  const json = await res.json();
  return json.data.anchors[0].id as string;
}

beforeEach(() => {
  currentMockClient = createMockSupabaseClient({ idPrefix: "api" });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("PATCH /api/plan/anchor-items/[anchorId]", () => {
  it("無認証 → 401", async () => {
    const req = makeRequest("http://localhost/api/plan/anchor-items/abc", {
      body: { title: "X" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId: "abc" }),
    });
    expect(res.status).toBe(401);
  });

  it("空 anchorId → 400", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = makeRequest("http://localhost/api/plan/anchor-items/", {
      body: { title: "X" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId: "" }),
    });
    expect(res.status).toBe(400);
  });

  it("malformed JSON → 400", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = new Request("http://localhost/api/plan/anchor-items/abc", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("anchor 不在 → 404", async () => {
    currentMockClient.setAuthUser({ id: USER_A });
    const req = makeRequest("http://localhost/api/plan/anchor-items/nonexistent", {
      body: { title: "X" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId: "nonexistent" }),
    });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe("not_found");
  });

  it("他 user の anchor → 404 (情報漏洩防止)", async () => {
    const anchorIdA = await createOneAnchor(USER_A);
    // User B で PATCH 試行
    currentMockClient.setAuthUser({ id: USER_B });
    const req = makeRequest(`http://localhost/api/plan/anchor-items/${anchorIdA}`, {
      body: { title: "STOLEN" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId: anchorIdA }),
    });
    expect(res.status).toBe(404);
  });

  it("自分の anchor を update → 200 + data.anchor", async () => {
    const anchorId = await createOneAnchor(USER_A);
    const req = makeRequest(`http://localhost/api/plan/anchor-items/${anchorId}`, {
      body: { title: "歯科クリニック" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.anchor.title).toBe("歯科クリニック");
  });

  it("invalid patch (startTime format) → 422 + errors", async () => {
    const anchorId = await createOneAnchor(USER_A);
    const req = makeRequest(`http://localhost/api/plan/anchor-items/${anchorId}`, {
      body: { startTime: "25:99" },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId }),
    });
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toBe("validation_error");
    expect(Array.isArray(json.errors)).toBe(true);
    expect(
      json.errors.some(
        (e: { field: string }) => e.field === "startTime"
      )
    ).toBe(true);
  });

  it("id / userId / sourceId 改竄を patch に入れても無視（200 で正常更新、改竄値は反映されない）", async () => {
    const anchorId = await createOneAnchor(USER_A);
    const req = makeRequest(`http://localhost/api/plan/anchor-items/${anchorId}`, {
      body: {
        id: "ATTACK",
        userId: "EVIL",
        sourceId: "STOLEN",
        title: "modified",
      },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.anchor.id).toBe(anchorId); // 元の id 維持
    expect(json.data.anchor.userId).toBe(USER_A); // 元の userId 維持
    expect(json.data.anchor.title).toBe("modified"); // title は変更
  });

  it("anchorKind 変更 patch は無視される (kind 不変)", async () => {
    const anchorId = await createOneAnchor(USER_A);
    const req = makeRequest(`http://localhost/api/plan/anchor-items/${anchorId}`, {
      body: {
        anchorKind: "recurring",
        validFrom: "2026-06-01",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      },
    });
    const res = await PATCH(req, {
      params: Promise.resolve({ anchorId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.anchor.anchorKind).toBe("one_off");
  });
});
