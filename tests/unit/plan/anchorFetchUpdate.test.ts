/**
 * updateAnchor fetch wrapper tests (W1-X2)
 *
 * - success / 401 / 404 / 422 / network error / malformed JSON / shape invalid
 * - URL encoding of anchorId
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { updateAnchor } from "@/lib/plan/anchor-fetch";

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

describe("updateAnchor fetch wrapper", () => {
  it("200 + valid body → ok:true", async () => {
    mockFetchOnce({
      status: 200,
      body: { ok: true, data: { anchor: { id: "a1", title: "X" } } },
    });
    const r = await updateAnchor("a1", { title: "X" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.anchor.id).toBe("a1");
  });

  it("404 not_found → ok:false", async () => {
    mockFetchOnce({
      status: 404,
      body: { ok: false, error: "not_found" },
    });
    const r = await updateAnchor("a1", { title: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(404);
      expect(r.error).toBe("not_found");
    }
  });

  it("422 validation error → ok:false + errors", async () => {
    mockFetchOnce({
      status: 422,
      body: {
        ok: false,
        error: "validation_error",
        errors: [
          { field: "startTime", code: "invalid_format", message: "bad" },
        ],
      },
    });
    const r = await updateAnchor("a1", { startTime: "25:99" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.errors).toBeDefined();
      expect(r.errors).toHaveLength(1);
    }
  });

  it("401 unauthorized → ok:false", async () => {
    mockFetchOnce({
      status: 401,
      body: { ok: false, error: "Unauthorized" },
    });
    const r = await updateAnchor("a1", { title: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("network error → ok:false, status=0", async () => {
    mockFetchReject(new Error("ECONNREFUSED"));
    const r = await updateAnchor("a1", { title: "X" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(0);
  });

  it("malformed JSON → ok:false", async () => {
    mockFetchOnce({ status: 200, throwOnText: true });
    const r = await updateAnchor("a1", { title: "X" });
    expect(r.ok).toBe(false);
  });

  it("data.anchor 不在 → ok:false", async () => {
    mockFetchOnce({ status: 200, body: { ok: true, data: {} } });
    const r = await updateAnchor("a1", { title: "X" });
    expect(r.ok).toBe(false);
  });

  it("anchorId は URL encoding される", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { anchor: { id: "a b/c" } } }),
    } as unknown as Response);
    await updateAnchor("a b/c", { title: "X" });
    expect(spy).toHaveBeenCalledWith(
      "/api/plan/anchor-items/a%20b%2Fc",
      expect.objectContaining({ method: "PATCH" })
    );
  });

  it("body は JSON serialized", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { anchor: { id: "a1" } } }),
    } as unknown as Response);
    await updateAnchor("a1", { title: "教え直し", endTime: "16:00" });
    expect(spy).toHaveBeenCalled();
    const call = spy.mock.calls[0]!;
    const init = call[1] as RequestInit;
    expect(init.method).toBe("PATCH");
    expect(typeof init.body).toBe("string");
    const parsed = JSON.parse(init.body as string);
    expect(parsed.title).toBe("教え直し");
  });
});
