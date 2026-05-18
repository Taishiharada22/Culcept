/**
 * fetchAnchors (GET /api/plan/anchors) wrapper tests (W1-X1 Commit 3)
 *
 * W1-5 で fetchAnchors が実装されたが unit test は未整備だったため、
 * POST/DELETE と同等のカバレッジに揃える。
 *
 * 検証項目:
 *   - success / 401 / 5xx / network error / malformed JSON / unexpected shape
 *   - data.sources / anchors の型違反検出
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fetchAnchors } from "@/lib/plan/anchor-fetch";

function mockFetchOnce(opts: {
  status: number;
  ok?: boolean;
  body?: unknown;
  throwOnText?: boolean;
}) {
  const ok = opts.ok ?? (opts.status >= 200 && opts.status < 300);
  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok,
    status: opts.status,
    json: async () => {
      if (opts.throwOnText) throw new Error("invalid json");
      return opts.body ?? {};
    },
  } as unknown as Response);
}

function mockFetchReject(error: Error) {
  vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(error);
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchAnchors", () => {
  it("200 + valid body → ok:true", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        ok: true,
        data: {
          sources: [{ id: "s1", userId: "u1" }],
          anchors: [{ id: "a1" }, { id: "a2" }],
        },
      },
    });
    const r = await fetchAnchors();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sources).toHaveLength(1);
    expect(r.data.anchors).toHaveLength(2);
  });

  it("200 + 空配列 → ok:true, 空配列", async () => {
    mockFetchOnce({
      status: 200,
      body: { ok: true, data: { sources: [], anchors: [] } },
    });
    const r = await fetchAnchors();
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.sources).toEqual([]);
    expect(r.data.anchors).toEqual([]);
  });

  it("401 → ok:false", async () => {
    mockFetchOnce({
      status: 401,
      body: { ok: false, error: "Unauthorized" },
    });
    const r = await fetchAnchors();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.error).toBe("Unauthorized");
    }
  });

  it("500 + error message → ok:false", async () => {
    mockFetchOnce({
      status: 500,
      body: { ok: false, error: "Internal error" },
    });
    const r = await fetchAnchors();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(500);
      expect(r.error).toBe("Internal error");
    }
  });

  it("network error → ok:false, status=0", async () => {
    mockFetchReject(new Error("ECONNREFUSED"));
    const r = await fetchAnchors();
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(0);
      expect(r.error).toBe("ECONNREFUSED");
    }
  });

  it("malformed JSON → ok:false", async () => {
    mockFetchOnce({ status: 200, throwOnText: true });
    const r = await fetchAnchors();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("invalid JSON response");
  });

  it("response.data 不在 → ok:false", async () => {
    mockFetchOnce({ status: 200, body: { ok: true } });
    const r = await fetchAnchors();
    expect(r.ok).toBe(false);
  });

  it("sources / anchors が array でない → ok:false", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        ok: true,
        data: { sources: "not-array", anchors: "not-array" },
      },
    });
    const r = await fetchAnchors();
    expect(r.ok).toBe(false);
  });

  it("4xx + body に error field 不在 → fallback `request failed: <status>`", async () => {
    mockFetchOnce({
      status: 400,
      body: { ok: false }, // error field 不在
    });
    const r = await fetchAnchors();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("400");
  });
});
