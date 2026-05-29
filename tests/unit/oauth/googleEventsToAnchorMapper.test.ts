/**
 * P3-A-1-2 C-α — googleEventsToAnchorMapper unit test (= pure transform)
 *
 * 検証範囲:
 *   - timed event → draft (= date + startTime + endTime / location)
 *   - all-day event (= start.date のみ) → date + startTime='00:00'
 *   - cancelled status → skip with reason='cancelled'
 *   - summary 空 / undefined → skip with reason='no_summary'
 *   - start 不在 → skip with reason='invalid_start'
 *   - dateTime malformed → skip
 *   - all-day date malformed → skip
 *   - iCalUID 優先、 fallback で event.id
 *   - sourceType: 'google_calendar' (= P3 Phase B β 恒久化)
 *   - rigidity: 'hard' default
 *   - anchorKind: 'one_off' (= MVP、 singleEvents=true 前提)
 *   - end.dateTime ない → endTime undefined
 *   - location: 空白 trim
 *   - 配列 round-trip 順序保持
 *   - 入力 mutate なし
 */

import { describe, expect, it } from "vitest";

import type { GoogleCalendarEventRaw } from "@/lib/oauth/googleCalendarEvents";
import {
  isCreateExternalAnchorInput,
  mapGoogleEventsToAnchorDrafts,
} from "@/lib/oauth/googleEventsToAnchorMapper";

function makeTimed(overrides: Partial<GoogleCalendarEventRaw> = {}): GoogleCalendarEventRaw {
  return {
    id: "ev-timed-1",
    summary: "Meeting",
    iCalUID: "uid-timed-1@google",
    start: { dateTime: "2026-06-15T10:00:00Z" },
    end: { dateTime: "2026-06-15T11:30:00Z" },
    location: "Office",
    status: "confirmed",
    ...overrides,
  };
}

function makeAllDay(overrides: Partial<GoogleCalendarEventRaw> = {}): GoogleCalendarEventRaw {
  return {
    id: "ev-allday-1",
    summary: "Holiday",
    iCalUID: "uid-allday-1@google",
    start: { date: "2026-12-25" },
    end: { date: "2026-12-26" },
    status: "confirmed",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mapGoogleEventsToAnchorDrafts — timed event", () => {
  it("通常 timed event → date + startTime + endTime + location", () => {
    const r = mapGoogleEventsToAnchorDrafts([makeTimed()]);
    expect(r.drafts).toHaveLength(1);
    const d = r.drafts[0]!;
    expect(d.anchorKind).toBe("one_off");
    expect(d.title).toBe("Meeting");
    expect(d.date).toBe("2026-06-15");
    expect(d.startTime).toBe("10:00");
    expect(d.endTime).toBe("11:30");
    expect(d.locationText).toBe("Office");
    expect(d.rigidity).toBe("hard");
    expect(d.sourceType).toBe("google_calendar");
    expect(d.externalUid).toBe("uid-timed-1@google");
    expect(r.skipped).toHaveLength(0);
  });

  it("iCalUID なし → fallback で event.id を externalUid に", () => {
    const ev = makeTimed();
    const { iCalUID: _u, ...rest } = ev;
    void _u;
    const r = mapGoogleEventsToAnchorDrafts([rest]);
    expect(r.drafts[0]?.externalUid).toBe("ev-timed-1");
  });

  it("end.dateTime ない → endTime undefined", () => {
    const ev = makeTimed({ end: undefined });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.drafts[0]?.endTime).toBeUndefined();
  });

  it("location 空白 trim", () => {
    const ev = makeTimed({ location: "   Cafe   " });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.drafts[0]?.locationText).toBe("Cafe");
  });

  it("location 空文字 → undefined", () => {
    const ev = makeTimed({ location: "" });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.drafts[0]?.locationText).toBeUndefined();
  });
});

describe("mapGoogleEventsToAnchorDrafts — all-day event", () => {
  it("start.date のみ → date + startTime='00:00'、 endTime なし", () => {
    const r = mapGoogleEventsToAnchorDrafts([makeAllDay()]);
    expect(r.drafts).toHaveLength(1);
    const d = r.drafts[0]!;
    expect(d.date).toBe("2026-12-25");
    expect(d.startTime).toBe("00:00");
    expect(d.endTime).toBeUndefined();
    expect(r.skipped).toHaveLength(0);
  });

  it("all-day date malformed → skip with reason='invalid_date_format'", () => {
    const ev = makeAllDay({ start: { date: "12-25-2026" } }); // invalid
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.drafts).toHaveLength(0);
    expect(r.skipped[0]?.reason).toBe("invalid_date_format");
  });
});

describe("mapGoogleEventsToAnchorDrafts — skip", () => {
  it("cancelled status → skip", () => {
    const ev = makeTimed({ status: "cancelled" });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.drafts).toHaveLength(0);
    expect(r.skipped[0]?.reason).toBe("cancelled");
    expect(r.skipped[0]?.eventId).toBe("ev-timed-1");
  });

  it("summary 空 → skip with no_summary", () => {
    const ev = makeTimed({ summary: "" });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.skipped[0]?.reason).toBe("no_summary");
  });

  it("summary 空白のみ → skip", () => {
    const ev = makeTimed({ summary: "   " });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.skipped[0]?.reason).toBe("no_summary");
  });

  it("summary undefined → skip", () => {
    const ev = makeTimed();
    const { summary: _s, ...rest } = ev;
    void _s;
    const r = mapGoogleEventsToAnchorDrafts([rest]);
    expect(r.skipped[0]?.reason).toBe("no_summary");
  });

  it("start 不在 → invalid_start", () => {
    const ev = makeTimed();
    const { start: _st, ...rest } = ev;
    void _st;
    const r = mapGoogleEventsToAnchorDrafts([rest]);
    expect(r.skipped[0]?.reason).toBe("invalid_start");
  });

  it("dateTime 空 → invalid_start", () => {
    const ev = makeTimed({ start: { dateTime: "" } });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.skipped[0]?.reason).toBe("invalid_start");
  });

  it("dateTime malformed (= T なし) → invalid_date_format", () => {
    const ev = makeTimed({ start: { dateTime: "no_T_separator" } });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    // ↑ T なし → datePart = "no_T_separator" は DATE_REGEX 不一致
    expect(r.skipped[0]?.reason).toBe("invalid_date_format");
  });

  it("dateTime malformed (= time 不正) → invalid_time_format", () => {
    const ev = makeTimed({ start: { dateTime: "2026-06-15TXX:XX:00Z" } });
    const r = mapGoogleEventsToAnchorDrafts([ev]);
    expect(r.skipped[0]?.reason).toBe("invalid_time_format");
  });
});

describe("mapGoogleEventsToAnchorDrafts — bulk + 順序", () => {
  it("複数 event、 順序保持 + skip と drafts 共存", () => {
    const events: GoogleCalendarEventRaw[] = [
      makeTimed({ id: "a", iCalUID: "ua" }),
      makeTimed({ id: "b", status: "cancelled", iCalUID: "ub" }),
      makeAllDay({ id: "c", iCalUID: "uc" }),
      makeTimed({ id: "d", summary: "" }),
    ];
    const r = mapGoogleEventsToAnchorDrafts(events);
    expect(r.drafts).toHaveLength(2);
    expect(r.drafts.map((d) => d.externalUid)).toEqual(["ua", "uc"]);
    expect(r.skipped).toHaveLength(2);
    expect(r.skipped.map((s) => s.eventId)).toEqual(["b", "d"]);
    expect(r.skipped[0]?.reason).toBe("cancelled");
    expect(r.skipped[1]?.reason).toBe("no_summary");
  });

  it("空配列 → drafts: [], skipped: []", () => {
    const r = mapGoogleEventsToAnchorDrafts([]);
    expect(r.drafts).toEqual([]);
    expect(r.skipped).toEqual([]);
  });

  it("入力 mutate なし (= 参照同一性保持)", () => {
    const events = [makeTimed()];
    const copy = JSON.parse(JSON.stringify(events));
    mapGoogleEventsToAnchorDrafts(events);
    expect(events).toEqual(copy);
  });
});

describe("isCreateExternalAnchorInput", () => {
  it("正常 draft → true", () => {
    const r = mapGoogleEventsToAnchorDrafts([makeTimed()]);
    expect(isCreateExternalAnchorInput(r.drafts[0]!)).toBe(true);
  });
});
