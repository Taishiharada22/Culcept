/**
 * W1-X1 anchor-fetch POST / DELETE wrapper tests
 *
 * globalThis.fetch を mock し、HTTP status / body / shape の各 branch を verify する。
 *
 * 検証項目:
 *   - createAnchorBundle: success / validation (422) / 401 / network error / malformed JSON / unexpected shape
 *   - deleteAnchorSource: success / 401 / network error / shape invalid
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createAnchorBundle,
  deleteAnchorSource,
} from "@/lib/plan/anchor-fetch";
import type { CreateSourceWithAnchorsInput } from "@/lib/plan/external-anchor-repository";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetch mock helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

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

const VALID_BUNDLE: CreateSourceWithAnchorsInput = {
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

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("createAnchorBundle", () => {
  it("200 + valid body → ok:true, data 取得", async () => {
    mockFetchOnce({
      status: 200,
      body: {
        ok: true,
        data: {
          source: { id: "src-1", userId: "u1" },
          anchors: [{ id: "a-1", userId: "u1" }],
        },
      },
    });
    const r = await createAnchorBundle(VALID_BUNDLE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.source.id).toBe("src-1");
    expect(r.data.anchors).toHaveLength(1);
  });

  it("422 validation error → ok:false, errors を伝搬", async () => {
    mockFetchOnce({
      status: 422,
      body: {
        ok: false,
        error: "validation_error",
        errors: [{ kind: "anchor_invalid", index: 0, errors: [] }],
      },
    });
    const r = await createAnchorBundle(VALID_BUNDLE);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.error).toBe("validation_error");
    expect(r.errors).toBeDefined();
    expect(r.errors).toHaveLength(1);
  });

  it("401 unauthorized → ok:false", async () => {
    mockFetchOnce({
      status: 401,
      body: { ok: false, error: "Unauthorized" },
    });
    const r = await createAnchorBundle(VALID_BUNDLE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(401);
      expect(r.error).toBe("Unauthorized");
    }
  });

  it("network error → ok:false, status=0", async () => {
    mockFetchReject(new Error("ECONNREFUSED"));
    const r = await createAnchorBundle(VALID_BUNDLE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(0);
      expect(r.error).toBe("ECONNREFUSED");
    }
  });

  it("malformed JSON response → ok:false", async () => {
    mockFetchOnce({ status: 200, throwOnText: true });
    const r = await createAnchorBundle(VALID_BUNDLE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toBe("invalid JSON response");
    }
  });

  it("response.data 不在 → ok:false", async () => {
    mockFetchOnce({ status: 200, body: { ok: true } });
    const r = await createAnchorBundle(VALID_BUNDLE);
    expect(r.ok).toBe(false);
  });

  it("data.source / anchors の型違反 → ok:false", async () => {
    mockFetchOnce({
      status: 200,
      body: { ok: true, data: { source: "not-object", anchors: "not-array" } },
    });
    const r = await createAnchorBundle(VALID_BUNDLE);
    expect(r.ok).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("deleteAnchorSource", () => {
  it("200 + valid body → ok:true", async () => {
    mockFetchOnce({
      status: 200,
      body: { ok: true, data: { deletedSource: true, deletedAnchors: 2 } },
    });
    const r = await deleteAnchorSource("src-1");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.deletedSource).toBe(true);
    expect(r.data.deletedAnchors).toBe(2);
  });

  it("user 不一致 / source 不在も 200 + deletedSource:false (情報漏洩防止)", async () => {
    mockFetchOnce({
      status: 200,
      body: { ok: true, data: { deletedSource: false, deletedAnchors: 0 } },
    });
    const r = await deleteAnchorSource("nonexistent");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.deletedSource).toBe(false);
    expect(r.data.deletedAnchors).toBe(0);
  });

  it("401 → ok:false", async () => {
    mockFetchOnce({
      status: 401,
      body: { ok: false, error: "Unauthorized" },
    });
    const r = await deleteAnchorSource("src-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(401);
  });

  it("network error → ok:false, status=0", async () => {
    mockFetchReject(new Error("disconnected"));
    const r = await deleteAnchorSource("src-1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.status).toBe(0);
  });

  it("sourceId を URL encoding", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { deletedSource: false, deletedAnchors: 0 } }),
    } as unknown as Response);

    await deleteAnchorSource("a b/c");
    expect(spy).toHaveBeenCalledWith(
      "/api/plan/anchors/a%20b%2Fc",
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("data shape 違反 → ok:false", async () => {
    mockFetchOnce({
      status: 200,
      body: { ok: true, data: { deletedSource: "not-bool", deletedAnchors: "x" } },
    });
    const r = await deleteAnchorSource("src-1");
    expect(r.ok).toBe(false);
  });
});
