/**
 * Plan tabs 共通 helpers の unit tests (W1-5 Commit 3)
 *
 * tab JSX 自体は testing-library 未導入のため不対象。
 * 表示の正しさは Vercel preview / staging で CEO が確認する。
 *
 * pure helpers の振る舞いだけを deterministic に固定する。
 */

import { describe, expect, it } from "vitest";

import type {
  ExternalAnchor,
  OneOffExternalAnchor,
  RecurringExternalAnchor,
} from "@/lib/plan/external-anchor";
import {
  addDays,
  anchorsForDay,
  categoryOf,
  countOccurrences,
  FLOW_GAP_MIN_MINUTES,
  formatGap,
  formatJpDate,
  formatTime,
  gapMinutes,
  getMondayOf,
  getWeekDays,
  groupAnchorsByLocation,
  isoDate,
  LOCATION_GROUP_ORDER,
  shouldShowGapAdd,
  suggestGapStartTime,
  minutesOf,
  utcMidnight,
  WEEKDAY_LABELS,
} from "@/app/(culcept)/plan/tabs/_helpers";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fixture builders
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function utc(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

const COMMON_REF = {
  userId: "user-a",
  sourceId: "src-1",
  confirmedAt: "2026-04-01T00:00:00.000Z",
};

function oneOff(
  overrides: Partial<OneOffExternalAnchor> = {}
): OneOffExternalAnchor {
  return {
    id: overrides.id ?? "one-off-1",
    ...COMMON_REF,
    title: "歯科予約",
    startTime: "14:30",
    rigidity: "hard",
    anchorKind: "one_off",
    date: "2026-04-08",
    ...overrides,
  } as OneOffExternalAnchor;
}

function recurring(
  overrides: Partial<RecurringExternalAnchor> = {}
): RecurringExternalAnchor {
  return {
    id: overrides.id ?? "rec-1",
    ...COMMON_REF,
    title: "週次ミーティング",
    startTime: "10:00",
    rigidity: "soft",
    anchorKind: "recurring",
    validFrom: "2026-04-01",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    ...overrides,
  } as RecurringExternalAnchor;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Date helpers", () => {
  it("utcMidnight strips time", () => {
    const d = new Date("2026-04-08T15:42:13.123Z");
    expect(utcMidnight(d).toISOString()).toBe("2026-04-08T00:00:00.000Z");
  });

  it("addDays positive", () => {
    expect(isoDate(addDays(utc("2026-04-30"), 1))).toBe("2026-05-01");
  });

  it("addDays negative", () => {
    expect(isoDate(addDays(utc("2026-04-01"), -1))).toBe("2026-03-31");
  });

  it("isoDate returns YYYY-MM-DD", () => {
    expect(isoDate(utc("2026-04-08"))).toBe("2026-04-08");
  });

  it.each([
    ["Monday", "2026-04-06", "2026-04-06"],
    ["Tuesday", "2026-04-07", "2026-04-06"],
    ["Wednesday", "2026-04-08", "2026-04-06"],
    ["Sunday", "2026-04-12", "2026-04-06"],
  ])("getMondayOf %s → %s", (_label, input, expected) => {
    expect(isoDate(getMondayOf(utc(input)))).toBe(expected);
  });

  it("getWeekDays returns 7 days starting Monday", () => {
    const days = getWeekDays(utc("2026-04-08")); // 水曜
    expect(days).toHaveLength(7);
    expect(isoDate(days[0]!)).toBe("2026-04-06"); // Mon
    expect(isoDate(days[6]!)).toBe("2026-04-12"); // Sun
  });

  it("WEEKDAY_LABELS aligned to JS getUTCDay()", () => {
    // Sun=0, Mon=1, ..., Sat=6
    expect(WEEKDAY_LABELS).toEqual(["日", "月", "火", "水", "木", "金", "土"]);
  });

  it("formatJpDate Japanese date", () => {
    expect(formatJpDate(utc("2026-04-08"))).toBe("4月8日(水)");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Time helpers", () => {
  it("formatTime strips seconds", () => {
    expect(formatTime("14:30:45")).toBe("14:30");
    expect(formatTime("14:30")).toBe("14:30");
  });

  it("minutesOf basic", () => {
    expect(minutesOf("00:00")).toBe(0);
    expect(minutesOf("01:00")).toBe(60);
    expect(minutesOf("14:30")).toBe(870);
    expect(minutesOf("14:30:45")).toBe(870); // 秒は無視
  });

  it("gapMinutes uses prev endTime when present", () => {
    const prev = oneOff({ startTime: "10:00", endTime: "11:00" });
    const next = oneOff({ startTime: "13:00" });
    expect(gapMinutes(prev, next)).toBe(120); // 11:00 → 13:00 = 2h
  });

  it("gapMinutes falls back to startTime when no endTime", () => {
    const prev = oneOff({ startTime: "10:00" });
    const next = oneOff({ startTime: "11:30" });
    expect(gapMinutes(prev, next)).toBe(90);
  });

  it.each([
    [0, "間隔なし"],
    [-10, "間隔なし"],
    [30, "30 分"],
    [60, "1 時間"],
    [90, "1 時間 30 分"],
    [180, "3 時間"],
    [195, "3 時間 15 分"],
  ])("formatGap %d → %s", (mins, expected) => {
    expect(formatGap(mins)).toBe(expected);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("anchorsForDay", () => {
  it("one_off matches exact date", () => {
    const a = oneOff({ date: "2026-04-08" });
    expect(anchorsForDay([a], utc("2026-04-08"))).toEqual([a]);
  });

  it("one_off different date → excluded", () => {
    const a = oneOff({ date: "2026-04-08" });
    expect(anchorsForDay([a], utc("2026-04-09"))).toEqual([]);
  });

  it("recurring MO matches Monday", () => {
    const a = recurring({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" });
    // 2026-04-06 is Monday
    expect(anchorsForDay([a], utc("2026-04-06"))).toEqual([a]);
  });

  it("recurring MO does not match Tuesday", () => {
    const a = recurring({ recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" });
    expect(anchorsForDay([a], utc("2026-04-07"))).toEqual([]);
  });

  it("sorts by startTime", () => {
    const a1 = oneOff({ id: "a-1300", date: "2026-04-08", startTime: "13:00" });
    const a2 = oneOff({ id: "a-0900", date: "2026-04-08", startTime: "09:00" });
    const a3 = oneOff({ id: "a-1700", date: "2026-04-08", startTime: "17:00" });
    const out = anchorsForDay([a1, a2, a3], utc("2026-04-08"));
    expect(out.map((a) => a.id)).toEqual(["a-0900", "a-1300", "a-1700"]);
  });

  it("excludes anchors outside validity window", () => {
    const a = recurring({
      validFrom: "2026-04-01",
      validUntil: "2026-04-07",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });
    expect(anchorsForDay([a], utc("2026-04-13"))).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("countOccurrences", () => {
  it("one_off in range → 1", () => {
    const a = oneOff({ date: "2026-04-08" });
    expect(countOccurrences(a, utc("2026-04-01"), utc("2026-04-30"))).toBe(1);
  });

  it("one_off out of range → 0", () => {
    const a = oneOff({ date: "2026-05-08" });
    expect(countOccurrences(a, utc("2026-04-01"), utc("2026-04-30"))).toBe(0);
  });

  it("recurring MO across 4 weeks → 4", () => {
    const a = recurring({
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    });
    expect(countOccurrences(a, utc("2026-04-01"), utc("2026-04-30"))).toBe(4);
  });

  it("recurring MO,WE,FR across 1 week → 3", () => {
    const a = recurring({
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    });
    expect(countOccurrences(a, utc("2026-04-06"), utc("2026-04-12"))).toBe(3);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("categoryOf", () => {
  it("locationCategory set → that", () => {
    expect(categoryOf(oneOff({ locationCategory: "office" }))).toBe("office");
    expect(categoryOf(oneOff({ locationCategory: "home" }))).toBe("home");
  });

  it("no category but has locationText → 'unknown'", () => {
    expect(categoryOf(oneOff({ locationText: "新宿駅" }))).toBe("unknown");
  });

  it("no category and no text → 'none'", () => {
    expect(categoryOf(oneOff())).toBe("none");
  });

  it("LOCATION_GROUP_ORDER full coverage", () => {
    expect(LOCATION_GROUP_ORDER).toEqual([
      "home",
      "office",
      "school",
      "cafe",
      "public",
      "outdoor",
      "transit",
      "unknown",
      "none",
    ]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("groupAnchorsByLocation", () => {
  it("empty input → empty array", () => {
    expect(
      groupAnchorsByLocation([], utc("2026-04-01"), utc("2026-04-30"))
    ).toEqual([]);
  });

  it("groups by category", () => {
    const items: ExternalAnchor[] = [
      oneOff({ id: "h1", date: "2026-04-10", locationCategory: "home" }),
      oneOff({ id: "o1", date: "2026-04-10", locationCategory: "office" }),
      oneOff({ id: "h2", date: "2026-04-11", locationCategory: "home" }),
    ];
    const out = groupAnchorsByLocation(
      items,
      utc("2026-04-01"),
      utc("2026-04-30")
    );
    expect(out.map((g) => g.category)).toEqual(["home", "office"]);
    expect(out[0]!.totalCount).toBe(2);
    expect(out[1]!.totalCount).toBe(1);
  });

  it("ordered by LOCATION_GROUP_ORDER", () => {
    const items: ExternalAnchor[] = [
      oneOff({ id: "x1", date: "2026-04-10", locationCategory: "transit" }),
      oneOff({ id: "x2", date: "2026-04-10", locationCategory: "home" }),
      oneOff({ id: "x3", date: "2026-04-10", locationCategory: "office" }),
    ];
    const out = groupAnchorsByLocation(
      items,
      utc("2026-04-01"),
      utc("2026-04-30")
    );
    expect(out.map((g) => g.category)).toEqual(["home", "office", "transit"]);
  });

  it("excludes 0-count groups (anchor outside range)", () => {
    const items: ExternalAnchor[] = [
      oneOff({ id: "z1", date: "2026-06-10", locationCategory: "home" }),
    ];
    const out = groupAnchorsByLocation(
      items,
      utc("2026-04-01"),
      utc("2026-04-30")
    );
    expect(out).toEqual([]);
  });

  it("within group: sorted by count desc, then title asc", () => {
    const items: ExternalAnchor[] = [
      // home category, 4 occurrences (recurring weekly MO over 4 weeks)
      recurring({
        id: "rec-home-mo",
        title: "ヨガ",
        validFrom: "2026-04-01",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
        locationCategory: "home",
      }),
      // home category, 1 occurrence (one_off)
      oneOff({
        id: "one-home",
        title: "ホームパーティ",
        date: "2026-04-10",
        locationCategory: "home",
      }),
      // home category, 1 occurrence — same count as the one_off, sorted by title asc
      oneOff({
        id: "one-home-2",
        title: "ガレージセール",
        date: "2026-04-11",
        locationCategory: "home",
      }),
    ];
    const out = groupAnchorsByLocation(
      items,
      utc("2026-04-01"),
      utc("2026-04-30")
    );
    const home = out.find((g) => g.category === "home");
    expect(home).toBeDefined();
    expect(home!.anchors.map((x) => x.anchor.title)).toEqual([
      "ヨガ", // count=4
      "ガレージセール", // count=1, アルファベット順
      "ホームパーティ", // count=1
    ]);
  });

  it("'none' / 'unknown' / category-set 3 種を区別", () => {
    const items: ExternalAnchor[] = [
      oneOff({ id: "none1", date: "2026-04-10" }), // no category, no text → none
      oneOff({
        id: "unk1",
        date: "2026-04-10",
        locationText: "謎の場所",
      }), // text only → unknown
      oneOff({
        id: "home1",
        date: "2026-04-10",
        locationCategory: "home",
      }), // home
    ];
    const out = groupAnchorsByLocation(
      items,
      utc("2026-04-01"),
      utc("2026-04-30")
    );
    expect(out.map((g) => g.category)).toEqual(["home", "unknown", "none"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("Flow gap add affordance helpers (W1-X3)", () => {
  describe("shouldShowGapAdd", () => {
    it("default threshold 30 分", () => {
      expect(FLOW_GAP_MIN_MINUTES).toBe(30);
    });

    it.each([
      [0, false],
      [10, false],
      [29, false],
      [30, true],
      [60, true],
      [120, true],
    ])("%d 分 → %s", (mins, expected) => {
      expect(shouldShowGapAdd(mins)).toBe(expected);
    });

    it("threshold を引数で上書き可能", () => {
      expect(shouldShowGapAdd(40, 60)).toBe(false);
      expect(shouldShowGapAdd(70, 60)).toBe(true);
    });
  });

  describe("suggestGapStartTime", () => {
    it("10:00 → 12:00 の中央 11:00 (15 分単位ピッタリ)", () => {
      expect(suggestGapStartTime("10:00", "12:00")).toBe("11:00");
    });

    it("10:00 → 10:50 の中央 10:25 → 15 分丸めで 10:15", () => {
      expect(suggestGapStartTime("10:00", "10:50")).toBe("10:15");
    });

    it("9:00 → 11:30 の中央 10:15 → 15 分丸めで 10:15", () => {
      expect(suggestGapStartTime("09:00", "11:30")).toBe("10:15");
    });

    it("13:00 → 13:40 の中央 13:20 → 15 分丸めで 13:15", () => {
      expect(suggestGapStartTime("13:00", "13:40")).toBe("13:15");
    });

    it("HH:MM:SS 形式も受け付ける (秒は無視)", () => {
      expect(suggestGapStartTime("10:00:30", "12:00:45")).toBe("11:00");
    });

    it("出力は常に HH:MM zero-padded", () => {
      expect(suggestGapStartTime("00:00", "00:30")).toBe("00:15");
      expect(suggestGapStartTime("23:00", "23:30")).toBe("23:15");
    });
  });
});
