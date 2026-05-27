/**
 * P3 W1 — icsToAnchorMapper.ts contract test (= ParsedIcsEvent → IcsAnchorDraft 変換)
 *
 * 検証範囲:
 *   - OneOff event (= RRULE なし) → anchorKind="one_off"、 date 設定
 *   - Recurring event (= RRULE あり) → anchorKind="recurring"、 validFrom + recurrenceRule
 *   - 終日 event (= isAllDay) → startTime="00:00"
 *   - title 空 → skip + reason="empty_title"
 *   - location あり / なし
 *   - endTime あり / なし
 *   - 複数 event → drafts[] / skipped[] 分離
 *
 * 不変原則:
 *   - pure (= I/O なし、 deterministic)
 *   - 入力 mutate なし
 */

import { describe, expect, it } from "vitest";

import { mapIcsEventsToDrafts } from "@/lib/plan/ics/icsToAnchorMapper";
import type { ParsedIcsEvent } from "@/lib/plan/ics/icsParser";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeEvent(overrides: Partial<ParsedIcsEvent>): ParsedIcsEvent {
  return {
    uid: "test-uid-001",
    summary: "Test Event",
    startDateIso: "2026-06-01T09:00:00.000Z",
    isAllDay: false,
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// OneOff event
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mapIcsEventsToDrafts: OneOff event (= RRULE なし)", () => {
  it("基本 OneOff → anchorKind=one_off、 date / startTime 抽出", () => {
    const events = [
      makeEvent({
        uid: "ev1",
        summary: "Team Meeting",
        startDateIso: "2026-06-01T09:00:00.000Z",
        endDateIso: "2026-06-01T10:30:00.000Z",
        location: "Office",
      }),
    ];
    const { drafts, skipped } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(1);
    expect(skipped.length).toBe(0);
    const d = drafts[0]!;
    expect(d.anchorKind).toBe("one_off");
    expect(d.title).toBe("Team Meeting");
    expect(d.date).toBe("2026-06-01");
    expect(d.startTime).toBe("09:00");
    expect(d.endTime).toBe("10:30");
    expect(d.locationText).toBe("Office");
    expect(d.rigidity).toBe("hard");
    expect(d.sourceUid).toBe("ev1");
    expect(d.recurrenceRule).toBeUndefined();
    expect(d.validFrom).toBeUndefined();
  });

  it("location 空 → locationText undefined", () => {
    const events = [makeEvent({ location: undefined })];
    const { drafts } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(1);
    expect(drafts[0]!.locationText).toBeUndefined();
  });

  it("endDate 不在 → endTime undefined", () => {
    const events = [makeEvent({ endDateIso: undefined })];
    const { drafts } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(1);
    expect(drafts[0]!.endTime).toBeUndefined();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Recurring event
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mapIcsEventsToDrafts: Recurring event (= RRULE あり)", () => {
  it("RRULE あり → anchorKind=recurring、 validFrom + recurrenceRule", () => {
    const events = [
      makeEvent({
        uid: "ev2",
        summary: "Daily Standup",
        startDateIso: "2026-06-01T10:00:00.000Z",
        endDateIso: "2026-06-01T10:15:00.000Z",
        recurrenceRuleRaw: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      }),
    ];
    const { drafts, skipped } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(1);
    expect(skipped.length).toBe(0);
    const d = drafts[0]!;
    expect(d.anchorKind).toBe("recurring");
    expect(d.title).toBe("Daily Standup");
    expect(d.validFrom).toBe("2026-06-01");
    expect(d.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
    expect(d.startTime).toBe("10:00");
    expect(d.endTime).toBe("10:15");
    expect(d.rigidity).toBe("hard");
    expect(d.sourceUid).toBe("ev2");
    expect(d.date).toBeUndefined();
  });

  it("recurrenceRuleRaw 空文字 → OneOff として扱う (= 空 RRULE は recurring 不成立)", () => {
    const events = [makeEvent({ recurrenceRuleRaw: "" })];
    const { drafts } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(1);
    expect(drafts[0]!.anchorKind).toBe("one_off");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// All-day event
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mapIcsEventsToDrafts: 終日 event (= isAllDay)", () => {
  it("isAllDay=true → startTime='00:00'、 endTime undefined", () => {
    const events = [
      makeEvent({
        uid: "ev3",
        summary: "Holiday",
        startDateIso: "2026-06-15T00:00:00.000Z",
        endDateIso: "2026-06-16T00:00:00.000Z",
        isAllDay: true,
      }),
    ];
    const { drafts } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(1);
    const d = drafts[0]!;
    expect(d.startTime).toBe("00:00");
    expect(d.endTime).toBeUndefined(); // 終日 event の endTime は不要
    expect(d.date).toBe("2026-06-15");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Skip / error cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mapIcsEventsToDrafts: skip / error", () => {
  it("title 空 → skip + reason=empty_title", () => {
    const events = [makeEvent({ summary: "" })];
    const { drafts, skipped } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(0);
    expect(skipped.length).toBe(1);
    expect(skipped[0]!.reason).toBe("empty_title");
  });

  it("title 空白のみ → skip", () => {
    const events = [makeEvent({ summary: "   " })];
    const { drafts, skipped } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(0);
    expect(skipped.length).toBe(1);
    expect(skipped[0]!.reason).toBe("empty_title");
  });

  it("不正 startDateIso → skip + reason=invalid_start_date", () => {
    const events = [makeEvent({ startDateIso: "not-a-date" })];
    const { drafts, skipped } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(0);
    expect(skipped.length).toBe(1);
    expect(skipped[0]!.reason).toBe("invalid_start_date");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Multi-event
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mapIcsEventsToDrafts: 複数 event", () => {
  it("成功 + skip 混在 → drafts / skipped 適切分離", () => {
    const events = [
      makeEvent({ uid: "ok1", summary: "Meeting 1" }),
      makeEvent({ uid: "skip1", summary: "" }), // empty title → skip
      makeEvent({
        uid: "ok2",
        summary: "Meeting 2",
        recurrenceRuleRaw: "FREQ=WEEKLY",
      }),
    ];
    const { drafts, skipped } = mapIcsEventsToDrafts(events);
    expect(drafts.length).toBe(2);
    expect(skipped.length).toBe(1);
    expect(drafts.map((d) => d.sourceUid)).toContain("ok1");
    expect(drafts.map((d) => d.sourceUid)).toContain("ok2");
    expect(skipped[0]!.sourceUid).toBe("skip1");
  });

  it("空配列 → drafts=[] / skipped=[]", () => {
    const { drafts, skipped } = mapIcsEventsToDrafts([]);
    expect(drafts).toEqual([]);
    expect(skipped).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure 性 (= 不変、 deterministic)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("mapIcsEventsToDrafts: pure 性", () => {
  it("入力 mutate なし", () => {
    const events = [makeEvent({})];
    const snapshot = JSON.stringify(events);
    mapIcsEventsToDrafts(events);
    expect(JSON.stringify(events)).toBe(snapshot);
  });

  it("同入力 → 同出力 (= deterministic)", () => {
    const events = [
      makeEvent({ uid: "ev1" }),
      makeEvent({ uid: "ev2", recurrenceRuleRaw: "FREQ=DAILY" }),
    ];
    const r1 = mapIcsEventsToDrafts(events);
    const r2 = mapIcsEventsToDrafts(events);
    expect(r1).toEqual(r2);
  });

  it("source field に original ParsedIcsEvent を保持", () => {
    const original = makeEvent({ uid: "ev1", summary: "Test" });
    const { drafts } = mapIcsEventsToDrafts([original]);
    expect(drafts[0]!.source).toBe(original); // same reference
  });
});
