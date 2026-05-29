/**
 * Track B TB-3 — microsoftCalendarEvents unit test
 *
 * 検証範囲:
 *   - fetchMicrosoftCalendarEventsPage: Prefer: outlook.timezone + Authorization 送信 / success / error 種別
 *   - fetchAllMicrosoftCalendarEvents: @odata.nextLink pagination / partial on error
 */

import { describe, expect, it, vi } from "vitest";

import {
  fetchAllMicrosoftCalendarEvents,
  fetchMicrosoftCalendarEventsPage,
} from "@/lib/oauth/microsoftCalendarEvents";

function makeRes(opts: { status?: number; json?: unknown; throwJson?: boolean }): Response {
  const status = opts.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (opts.throwJson) throw new Error("invalid json");
      return opts.json ?? {};
    },
  } as unknown as Response;
}

const INPUT = {
  accessToken: "at-1",
  startDateTime: "2026-05-01T00:00:00",
  endDateTime: "2026-08-01T00:00:00",
};

describe("fetchMicrosoftCalendarEventsPage", () => {
  it("成功 → events 返却 + Prefer outlook.timezone + Authorization 送信", async () => {
    let capturedInit: RequestInit | undefined;
    let capturedUrl = "";
    const fetchImpl = vi.fn(async (u: Parameters<typeof fetch>[0], init?: RequestInit) => {
      capturedUrl = String(u);
      capturedInit = init;
      return makeRes({ status: 200, json: { value: [{ id: "e1", subject: "A" }] } });
    });
    const r = await fetchMicrosoftCalendarEventsPage(INPUT, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.events).toHaveLength(1);
    expect(capturedUrl).toContain("graph.microsoft.com");
    expect(capturedUrl).toContain("calendarView");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer at-1");
    expect(headers.Prefer).toContain('outlook.timezone="Tokyo Standard Time"');
  });

  it("401 → unauthorized / 403 → forbidden / 429 → rate_limited", async () => {
    for (const [status, reason] of [
      [401, "unauthorized"],
      [403, "forbidden"],
      [429, "rate_limited"],
    ] as const) {
      const r = await fetchMicrosoftCalendarEventsPage(
        INPUT,
        vi.fn(async () => makeRes({ status })),
      );
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason).toBe(reason);
    }
  });

  it("network 例外 → network", async () => {
    const r = await fetchMicrosoftCalendarEventsPage(
      INPUT,
      vi.fn(async () => {
        throw new Error("ECONNRESET");
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("network");
  });

  it("value が配列でない → unknown", async () => {
    const r = await fetchMicrosoftCalendarEventsPage(
      INPUT,
      vi.fn(async () => makeRes({ json: { value: "nope" } })),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("unknown");
  });
});

describe("fetchAllMicrosoftCalendarEvents (= pagination)", () => {
  it("@odata.nextLink を辿って全 page 結合", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async (u: Parameters<typeof fetch>[0]) => {
      call += 1;
      if (call === 1) {
        return makeRes({
          json: {
            value: [{ id: "a", subject: "A" }],
            "@odata.nextLink": "https://graph.microsoft.com/v1.0/me/calendarView?$skiptoken=XYZ",
          },
        });
      }
      // 2 page目は nextLink URL がそのまま渡る
      expect(String(u)).toContain("skiptoken");
      return makeRes({ json: { value: [{ id: "b", subject: "B" }] } });
    });
    const r = await fetchAllMicrosoftCalendarEvents(INPUT, fetchImpl);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.events.map((e) => e.id)).toEqual(["a", "b"]);
      expect(r.pageCount).toBe(2);
    }
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("途中 error → partialEvents + reason", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 1) {
        return makeRes({
          json: { value: [{ id: "a" }], "@odata.nextLink": "https://graph.microsoft.com/x?$skiptoken=T" },
        });
      }
      return makeRes({ status: 401 });
    });
    const r = await fetchAllMicrosoftCalendarEvents(INPUT, fetchImpl);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("unauthorized");
      expect(r.partialEvents.map((e) => e.id)).toEqual(["a"]);
    }
  });
});
