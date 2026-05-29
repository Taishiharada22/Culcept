/**
 * Track B TB-3 — microsoftEventsToAnchorMapper unit test
 *
 * GPT 補正条件 2: TZ / all-day / recurring を最初から unit test で固定。
 *   - JST naive timed (= Prefer=Tokyo の結果)
 *   - UTC (Z) → JST 変換
 *   - offset 付き → JST 変換
 *   - all-day
 *   - recurring occurrence shape
 *   - cancelled / seriesMaster / no subject の skip
 */

import { describe, expect, it } from "vitest";

import {
  mapMicrosoftEventsToAnchorDrafts,
  microsoftDateTimeToJst,
} from "@/lib/oauth/microsoftEventsToAnchorMapper";
import type { MicrosoftCalendarEventRaw } from "@/lib/oauth/microsoftCalendarEvents";

function ev(partial: Partial<MicrosoftCalendarEventRaw>): MicrosoftCalendarEventRaw {
  return { id: "ev-default", ...partial };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// microsoftDateTimeToJst (= TZ 変換規則を直接固定)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("microsoftDateTimeToJst (= TZ 変換規則)", () => {
  it("naive (Prefer=Tokyo の結果) → 書かれた値を JST として保持", () => {
    expect(microsoftDateTimeToJst("2026-05-29T21:00:00.0000000")).toEqual({
      date: "2026-05-29",
      time: "21:00",
    });
  });

  it("UTC (Z) → JST に +9h 変換", () => {
    // 12:00Z = 21:00 JST
    expect(microsoftDateTimeToJst("2026-05-29T12:00:00Z")).toEqual({
      date: "2026-05-29",
      time: "21:00",
    });
  });

  it("offset +09:00 → JST (= 同値)", () => {
    expect(microsoftDateTimeToJst("2026-05-29T21:00:00+09:00")).toEqual({
      date: "2026-05-29",
      time: "21:00",
    });
  });

  it("offset +00:00 → JST に変換 (= 21:00)", () => {
    expect(microsoftDateTimeToJst("2026-05-29T12:00:00+00:00")).toEqual({
      date: "2026-05-29",
      time: "21:00",
    });
  });

  it("日跨ぎ (UTC 深夜 → JST 翌日) も date が追従", () => {
    // 2026-05-29T16:00:00Z = 2026-05-30T01:00 JST
    expect(microsoftDateTimeToJst("2026-05-29T16:00:00Z")).toEqual({
      date: "2026-05-30",
      time: "01:00",
    });
  });

  it("不正 → null", () => {
    expect(microsoftDateTimeToJst("nope")).toBeNull();
    expect(microsoftDateTimeToJst("2026-05-29T99:99:99Z")).toBeNull();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// mapMicrosoftEventsToAnchorDrafts
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mapMicrosoftEventsToAnchorDrafts", () => {
  it("JST naive timed → one_off draft (sourceType=microsoft_calendar)", () => {
    const r = mapMicrosoftEventsToAnchorDrafts([
      ev({
        id: "e1",
        iCalUId: "uid-1",
        subject: "Standup",
        type: "singleInstance",
        start: { dateTime: "2026-05-29T21:00:00.0000000", timeZone: "Tokyo Standard Time" },
        end: { dateTime: "2026-05-29T22:00:00.0000000", timeZone: "Tokyo Standard Time" },
        location: { displayName: "Teams" },
      }),
    ]);
    expect(r.drafts).toHaveLength(1);
    const d = r.drafts[0]!;
    expect(d.anchorKind).toBe("one_off");
    expect(d.title).toBe("Standup");
    expect(d.date).toBe("2026-05-29");
    expect(d.startTime).toBe("21:00");
    expect(d.endTime).toBe("22:00");
    expect(d.locationText).toBe("Teams");
    expect(d.sourceType).toBe("microsoft_calendar");
    expect(d.externalUid).toBe("uid-1");
  });

  it("UTC (Z) timed → JST 変換して draft", () => {
    const r = mapMicrosoftEventsToAnchorDrafts([
      ev({
        id: "e2",
        subject: "UTC mtg",
        start: { dateTime: "2026-05-29T12:00:00Z", timeZone: "UTC" },
        end: { dateTime: "2026-05-29T13:00:00Z", timeZone: "UTC" },
      }),
    ]);
    expect(r.drafts[0]!.startTime).toBe("21:00"); // 12:00Z → 21:00 JST
    expect(r.drafts[0]!.endTime).toBe("22:00");
    expect(r.drafts[0]!.externalUid).toBe("e2"); // iCalUId なし → id fallback
  });

  it("all-day → date のみ、 startTime 00:00", () => {
    const r = mapMicrosoftEventsToAnchorDrafts([
      ev({
        id: "e3",
        subject: "Holiday",
        isAllDay: true,
        start: { dateTime: "2026-06-15T00:00:00.0000000", timeZone: "Tokyo Standard Time" },
        end: { dateTime: "2026-06-16T00:00:00.0000000", timeZone: "Tokyo Standard Time" },
      }),
    ]);
    expect(r.drafts[0]!.date).toBe("2026-06-15");
    expect(r.drafts[0]!.startTime).toBe("00:00");
  });

  it("recurring occurrence (type=occurrence) → one_off として採用", () => {
    const r = mapMicrosoftEventsToAnchorDrafts([
      ev({
        id: "occ-1",
        subject: "Weekly sync",
        type: "occurrence",
        start: { dateTime: "2026-05-29T10:00:00.0000000" },
        end: { dateTime: "2026-05-29T10:30:00.0000000" },
      }),
    ]);
    expect(r.drafts).toHaveLength(1);
    expect(r.drafts[0]!.anchorKind).toBe("one_off");
    expect(r.drafts[0]!.startTime).toBe("10:00");
  });

  it("seriesMaster → skip (= occurrence のみ採用)", () => {
    const r = mapMicrosoftEventsToAnchorDrafts([
      ev({ id: "sm-1", subject: "Master", type: "seriesMaster", start: { dateTime: "2026-05-29T09:00:00" } }),
    ]);
    expect(r.drafts).toHaveLength(0);
    expect(r.skipped[0]).toEqual({ eventId: "sm-1", reason: "series_master" });
  });

  it("cancelled → skip", () => {
    const r = mapMicrosoftEventsToAnchorDrafts([
      ev({ id: "c-1", subject: "Canceled", isCancelled: true, start: { dateTime: "2026-05-29T09:00:00" } }),
    ]);
    expect(r.drafts).toHaveLength(0);
    expect(r.skipped[0]!.reason).toBe("cancelled");
  });

  it("subject 空 → skip (no_summary)", () => {
    const r = mapMicrosoftEventsToAnchorDrafts([
      ev({ id: "ns-1", subject: "  ", start: { dateTime: "2026-05-29T09:00:00" } }),
    ]);
    expect(r.skipped[0]!.reason).toBe("no_summary");
  });

  it("複数混在 → drafts と skipped を分離", () => {
    const r = mapMicrosoftEventsToAnchorDrafts([
      ev({ id: "ok", subject: "OK", start: { dateTime: "2026-05-29T09:00:00" } }),
      ev({ id: "cx", subject: "X", isCancelled: true, start: { dateTime: "2026-05-29T09:00:00" } }),
    ]);
    expect(r.drafts).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
  });
});
