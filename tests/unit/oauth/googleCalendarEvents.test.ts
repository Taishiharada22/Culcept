/**
 * P3-A-1-2 C-α — googleCalendarEvents unit test (= fetch mock 網羅)
 *
 * 検証範囲:
 *   - fetchCalendarEvents:
 *     - 200 + items 正常 → ok with events
 *     - 200 + nextPageToken → 含む
 *     - 200 + nextSyncToken (= 最終 page) → 含む
 *     - 不正 shape item は skip (= id 欠落)
 *     - 401 → unauthorized
 *     - 404 → not_found
 *     - 429 → rate_limited
 *     - 500 → unknown
 *     - network throw → network
 *     - 200 but items 非配列 → unknown
 *     - URL に必須 query (= timeMin/Max/singleEvents/orderBy)
 *     - pageToken 渡せば URL に含まれる
 *
 *   - fetchAllCalendarEvents:
 *     - 1 page → events 全て
 *     - 多 page (= pageToken loop) → events 結合
 *     - syncToken は最終 page にのみ反映
 *     - 中間 page 失敗 → partialEvents + reason
 *     - hard limit (= 100 page+) で打ち切り、 hitHardLimit: true
 */

import { describe, expect, it, vi } from "vitest";

import {
  __test__,
  fetchAllCalendarEvents,
  fetchCalendarEvents,
} from "@/lib/oauth/googleCalendarEvents";

function makeJsonRes(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeTextRes(status: number, text: string): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain" } });
}

const BASE_INPUT = {
  calendarId: "primary",
  accessToken: "ya29.access",
  timeMin: "2026-05-26T00:00:00Z",
  timeMax: "2026-08-26T00:00:00Z",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchCalendarEvents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchCalendarEvents — success", () => {
  it("200 + items 正常 → ok with events + URL に必須 query", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, {
        items: [
          { id: "e1", summary: "Test", start: { dateTime: "2026-06-01T10:00:00Z" } },
          { id: "e2", summary: "Test 2", start: { date: "2026-06-02" } },
        ],
      }),
    );
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events).toHaveLength(2);
      expect(r.events[0]?.id).toBe("e1");
      expect(r.events[1]?.start?.date).toBe("2026-06-02");
    }

    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    const url = new URL(call[0]);
    expect(url.pathname).toContain(`/${encodeURIComponent("primary")}/events`);
    expect(url.searchParams.get("timeMin")).toBe(BASE_INPUT.timeMin);
    expect(url.searchParams.get("timeMax")).toBe(BASE_INPUT.timeMax);
    expect(url.searchParams.get("singleEvents")).toBe("true");
    expect(url.searchParams.get("orderBy")).toBe("startTime");
    expect(url.searchParams.get("maxResults")).toBe(String(__test__.DEFAULT_MAX_RESULTS));

    // Bearer header
    expect((call[1].headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer ya29.access",
    );
  });

  it("nextPageToken → 含む", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, { items: [], nextPageToken: "pt-abc" }),
    );
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nextPageToken).toBe("pt-abc");
  });

  it("nextSyncToken (= 最終 page) → 含む", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, { items: [], nextSyncToken: "st-xyz" }),
    );
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.nextSyncToken).toBe("st-xyz");
  });

  it("不正 shape item (= id 欠落) は skip", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, {
        items: [
          { id: "good", summary: "OK" },
          { summary: "bad — no id" }, // skip
          { id: "", summary: "empty id" }, // skip
        ],
      }),
    );
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events).toHaveLength(1);
      expect(r.events[0]?.id).toBe("good");
    }
  });

  it("pageToken 渡せば URL に含まれる", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(200, { items: [] }));
    await fetchCalendarEvents({ ...BASE_INPUT, pageToken: "tok-1" }, mockFetch);
    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(call[0]).searchParams.get("pageToken")).toBe("tok-1");
  });

  it("maxResults 指定可能", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(200, { items: [] }));
    await fetchCalendarEvents({ ...BASE_INPUT, maxResults: 50 }, mockFetch);
    const call = mockFetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(new URL(call[0]).searchParams.get("maxResults")).toBe("50");
  });
});

describe("fetchCalendarEvents — error mapping", () => {
  it("401 → unauthorized", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(401, {}));
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unauthorized");
  });

  it("404 → not_found", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(404, {}));
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("not_found");
  });

  it("429 → rate_limited", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(429, {}));
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("rate_limited");
  });

  it("500 → unknown", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(500, {}));
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unknown");
      expect(r.detail).toBe("http_500");
    }
  });

  it("fetch throw → network", async () => {
    const mockFetch = vi.fn(async () => {
      throw new Error("ENOTFOUND");
    });
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("network");
      expect(r.detail).toContain("ENOTFOUND");
    }
  });

  it("200 but items 非配列 → unknown", async () => {
    const mockFetch = vi.fn(async () => makeJsonRes(200, { items: "nope" }));
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("items_not_array");
  });

  it("200 but malformed JSON → unknown", async () => {
    const mockFetch = vi.fn(async () => makeTextRes(200, "not json"));
    const r = await fetchCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toBe("invalid_json");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fetchAllCalendarEvents
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("fetchAllCalendarEvents — pagination", () => {
  it("1 page (= nextPageToken なし) → events + pageCount=1", async () => {
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, { items: [{ id: "a" }, { id: "b" }] }),
    );
    const r = await fetchAllCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events).toHaveLength(2);
      expect(r.pageCount).toBe(1);
      expect(r.hitHardLimit).toBe(false);
    }
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("多 page loop → events 結合 + syncToken は最終 page のみ", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return makeJsonRes(200, {
          items: [{ id: "p1-a" }, { id: "p1-b" }],
          nextPageToken: "pt-2",
        });
      }
      if (callCount === 2) {
        return makeJsonRes(200, {
          items: [{ id: "p2-a" }],
          nextPageToken: "pt-3",
        });
      }
      return makeJsonRes(200, {
        items: [{ id: "p3-a" }, { id: "p3-b" }],
        nextSyncToken: "st-final",
      });
    });

    const r = await fetchAllCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events).toHaveLength(5);
      expect(r.events.map((e) => e.id)).toEqual([
        "p1-a",
        "p1-b",
        "p2-a",
        "p3-a",
        "p3-b",
      ]);
      expect(r.pageCount).toBe(3);
      expect(r.syncToken).toBe("st-final");
    }
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // 2 番目以降の call で pageToken が URL に含まれる
    const call2 = mockFetch.mock.calls[1] as unknown as [string, RequestInit];
    expect(new URL(call2[0]).searchParams.get("pageToken")).toBe("pt-2");
    const call3 = mockFetch.mock.calls[2] as unknown as [string, RequestInit];
    expect(new URL(call3[0]).searchParams.get("pageToken")).toBe("pt-3");
  });

  it("中間 page 失敗 → partialEvents + reason", async () => {
    let callCount = 0;
    const mockFetch = vi.fn(async () => {
      callCount += 1;
      if (callCount === 1) {
        return makeJsonRes(200, {
          items: [{ id: "a" }, { id: "b" }],
          nextPageToken: "pt-2",
        });
      }
      return makeJsonRes(429, {});
    });

    const r = await fetchAllCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("rate_limited");
      expect(r.partialEvents).toHaveLength(2);
      expect(r.pageCount).toBe(2);
    }
  });

  it("hard limit (= 101 page+) で打ち切り、 hitHardLimit: true", async () => {
    // 常に nextPageToken を返す → loop が 100 page で止まる
    const mockFetch = vi.fn(async () =>
      makeJsonRes(200, {
        items: [{ id: "ever" }],
        nextPageToken: "pt-forever",
      }),
    );
    const r = await fetchAllCalendarEvents(BASE_INPUT, mockFetch);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hitHardLimit).toBe(true);
      expect(r.pageCount).toBe(__test__.PAGINATION_HARD_LIMIT);
      expect(r.events.length).toBe(__test__.PAGINATION_HARD_LIMIT);
    }
    expect(mockFetch).toHaveBeenCalledTimes(__test__.PAGINATION_HARD_LIMIT);
  });
});
