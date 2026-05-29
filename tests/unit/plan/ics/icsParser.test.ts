/**
 * P3 W1 — icsParser.ts contract test (= pure module、 RFC 5545 各種 edge case)
 *
 * 検証範囲:
 *   - empty / 不正 string → safe degrade (= success=true で空、 or success=false)
 *   - 1 VEVENT (OneOff) → 1 event
 *   - 1 VEVENT (Recurring、 RRULE 含む) → recurrenceRuleRaw 設定
 *   - 複数 VEVENT 混在 → 全部抽出
 *   - 必須 field 欠落 (UID / SUMMARY / DTSTART) → skip + warning
 *   - 全日 event (DTSTART;VALUE=DATE) → isAllDay=true
 *   - TZID 付き event → tzid 保存
 *
 * 不変原則:
 *   - pure (= I/O なし、 deterministic)
 *   - 入力 mutate なし
 */

import { describe, expect, it } from "vitest";

import { parseIcsString } from "@/lib/plan/ics/icsParser";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Sample .ics fixtures (= 最小 valid RFC 5545)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const ICS_HEADER = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Aneurasync//Test//EN";
const ICS_FOOTER = "END:VCALENDAR";

function buildIcs(...vevents: string[]): string {
  return `${ICS_HEADER}\r\n${vevents.join("\r\n")}\r\n${ICS_FOOTER}\r\n`;
}

const ONE_OFF_VEVENT = [
  "BEGIN:VEVENT",
  "UID:event-one-off-001@example.com",
  "SUMMARY:Team Meeting",
  "DTSTART:20260601T090000Z",
  "DTEND:20260601T100000Z",
  "LOCATION:Office",
  "DESCRIPTION:Weekly sync",
  "END:VEVENT",
].join("\r\n");

const RECURRING_VEVENT = [
  "BEGIN:VEVENT",
  "UID:event-recurring-001@example.com",
  "SUMMARY:Daily Standup",
  "DTSTART:20260601T100000Z",
  "DTEND:20260601T101500Z",
  "RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
  "LOCATION:Online",
  "END:VEVENT",
].join("\r\n");

const ALL_DAY_VEVENT = [
  "BEGIN:VEVENT",
  "UID:event-allday-001@example.com",
  "SUMMARY:Holiday",
  "DTSTART;VALUE=DATE:20260615",
  "DTEND;VALUE=DATE:20260616",
  "END:VEVENT",
].join("\r\n");

const TZID_VEVENT = [
  "BEGIN:VEVENT",
  "UID:event-tzid-001@example.com",
  "SUMMARY:Tokyo Meeting",
  "DTSTART;TZID=Asia/Tokyo:20260601T140000",
  "DTEND;TZID=Asia/Tokyo:20260601T150000",
  "END:VEVENT",
].join("\r\n");

const MISSING_UID_VEVENT = [
  "BEGIN:VEVENT",
  "SUMMARY:No UID Event",
  "DTSTART:20260601T090000Z",
  "END:VEVENT",
].join("\r\n");

const MISSING_SUMMARY_VEVENT = [
  "BEGIN:VEVENT",
  "UID:event-no-summary-001@example.com",
  "DTSTART:20260601T090000Z",
  "END:VEVENT",
].join("\r\n");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString — basic
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIcsString: basic", () => {
  it("空文字 → success=true, events=[], warnings=[]", () => {
    const result = parseIcsString("");
    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("空白のみ → success=true, events=[]", () => {
    const result = parseIcsString("   \n\t  ");
    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
  });

  it("空 VCALENDAR (= VEVENT なし) → success=true, events=[]", () => {
    const result = parseIcsString(buildIcs());
    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
  });

  it("不正 .ics (= 構文 broken) → success=false + error", () => {
    const result = parseIcsString("not an ics file at all");
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.events).toEqual([]);
  });

  it("非文字列 (= number) → success=true, events=[] (= safe degrade)", () => {
    // @ts-expect-error 型違反を意図的に test
    const result = parseIcsString(123 as unknown);
    expect(result.success).toBe(true);
    expect(result.events).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString — OneOff event
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIcsString: OneOff event", () => {
  it("1 OneOff VEVENT → 1 event 抽出", () => {
    const result = parseIcsString(buildIcs(ONE_OFF_VEVENT));
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(1);
    const e = result.events[0]!;
    expect(e.uid).toBe("event-one-off-001@example.com");
    expect(e.summary).toBe("Team Meeting");
    // 2026-05-29 修正: Z (UTC) は app 表示 TZ (JST) の wall-clock に変換される。
    // 09:00Z = 18:00 JST / 10:00Z = 19:00 JST。
    expect(e.startDateIso).toContain("2026-06-01T18:00");
    expect(e.endDateIso).toContain("2026-06-01T19:00");
    expect(e.location).toBe("Office");
    expect(e.description).toBe("Weekly sync");
    expect(e.recurrenceRuleRaw).toBeUndefined();
    expect(e.isAllDay).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString — Recurring event
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIcsString: Recurring event", () => {
  it("RRULE 含む VEVENT → recurrenceRuleRaw 設定", () => {
    const result = parseIcsString(buildIcs(RECURRING_VEVENT));
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(1);
    const e = result.events[0]!;
    expect(e.uid).toBe("event-recurring-001@example.com");
    expect(e.summary).toBe("Daily Standup");
    expect(e.recurrenceRuleRaw).toBeDefined();
    expect(e.recurrenceRuleRaw).toContain("WEEKLY");
    expect(e.recurrenceRuleRaw).toContain("MO");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString — All-day event
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIcsString: All-day event", () => {
  it("DTSTART;VALUE=DATE → isAllDay=true", () => {
    const result = parseIcsString(buildIcs(ALL_DAY_VEVENT));
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(1);
    const e = result.events[0]!;
    expect(e.uid).toBe("event-allday-001@example.com");
    expect(e.summary).toBe("Holiday");
    expect(e.isAllDay).toBe(true);
    expect(e.startDateIso).toContain("2026-06-15");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString — TZID
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIcsString: TZID-aware event", () => {
  it("TZID=Asia/Tokyo → tzid 保存", () => {
    const result = parseIcsString(buildIcs(TZID_VEVENT));
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(1);
    const e = result.events[0]!;
    expect(e.tzid).toBe("Asia/Tokyo");
  });

  it("TZID の時刻は wall-clock を保持 (= 2026-05-29 UTC 変換 bug 回帰ガード)", () => {
    // DTSTART;TZID=Asia/Tokyo:20260601T140000 → 14:00 のまま保持し、
    // toJSDate 経由の UTC 変換 (= 05:00) にズラさない (= app は timezone-naive)。
    const result = parseIcsString(buildIcs(TZID_VEVENT));
    const e = result.events[0]!;
    expect(e.startDateIso).toContain("2026-06-01T14:00");
    expect(e.startDateIso).not.toContain("T05:00");
    expect(e.endDateIso).toContain("2026-06-01T15:00");
  });

  it("Z (UTC) は app 表示 TZ (JST) に変換 (= Google ICS が Z 出力でも JST 表示)", () => {
    // Google ICS フィードは時刻を Z (UTC) で出力することがある。
    // 12:00Z = 21:00 JST / 13:00Z = 22:00 JST。 12:00 のまま出さない。
    const zVevent = [
      "BEGIN:VEVENT",
      "UID:event-z-001@example.com",
      "SUMMARY:UTC event",
      "DTSTART:20260601T120000Z",
      "DTEND:20260601T130000Z",
      "END:VEVENT",
    ].join("\r\n");
    const result = parseIcsString(buildIcs(zVevent));
    const e = result.events[0]!;
    expect(e.startDateIso).toContain("2026-06-01T21:00");
    expect(e.endDateIso).toContain("2026-06-01T22:00");
    expect(e.startDateIso).not.toContain("T12:00");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString — multiple events
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIcsString: 複数 event 混在", () => {
  it("OneOff + Recurring + AllDay 各 1 件 → 3 event 抽出", () => {
    const result = parseIcsString(
      buildIcs(ONE_OFF_VEVENT, RECURRING_VEVENT, ALL_DAY_VEVENT),
    );
    expect(result.success).toBe(true);
    expect(result.events.length).toBe(3);
    const uids = result.events.map((e) => e.uid);
    expect(uids).toContain("event-one-off-001@example.com");
    expect(uids).toContain("event-recurring-001@example.com");
    expect(uids).toContain("event-allday-001@example.com");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString — 必須 field 欠落
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIcsString: 必須 field 欠落 → skip + warning", () => {
  it("UID 欠落 → skip、 warnings に missing_uid", () => {
    const result = parseIcsString(buildIcs(MISSING_UID_VEVENT));
    expect(result.success).toBe(true);
    // ical.js は UID 欠落で event を取り出せない可能性あり、 events 0 or 1 + warning
    expect(result.events.length).toBe(0);
  });

  it("SUMMARY 欠落 → skip", () => {
    const result = parseIcsString(buildIcs(MISSING_SUMMARY_VEVENT));
    expect(result.success).toBe(true);
    // SUMMARY 欠落は skip + warning
    expect(result.events.length).toBe(0);
    expect(result.warnings.some((w) => w.includes("missing_summary"))).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseIcsString — 不変 (= 入力 mutate なし、 deterministic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseIcsString: pure 性 (= 不変、 deterministic)", () => {
  it("入力 mutate なし", () => {
    const raw = buildIcs(ONE_OFF_VEVENT);
    const snapshot = raw;
    parseIcsString(raw);
    expect(raw).toBe(snapshot);
  });

  it("同入力 → 同出力 (= deterministic)", () => {
    const raw = buildIcs(ONE_OFF_VEVENT);
    const r1 = parseIcsString(raw);
    const r2 = parseIcsString(raw);
    expect(r1).toEqual(r2);
  });
});
