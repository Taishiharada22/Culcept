import { describe, it, expect } from "vitest";

import {
  expandOneOff,
  expandRecurrence,
  type RecurringAnchorLike,
  type DateRange,
} from "@/lib/plan/recurrence-expander";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// fixtures
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function utc(s: string): Date {
  return new Date(`${s}T00:00:00Z`);
}

function range(start: string, end: string): DateRange {
  return { start: utc(start), end: utc(end) };
}

function dates(result: Date[]): string[] {
  return result.map((d) => d.toISOString().slice(0, 10));
}

const WEEKDAYS: RecurringAnchorLike = {
  validFrom: "2026-04-01",
  recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
};

const MO_ONLY: RecurringAnchorLike = {
  validFrom: "2026-04-01",
  recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
};

const WEEKEND: RecurringAnchorLike = {
  validFrom: "2026-04-01",
  recurrenceRule: "FREQ=WEEKLY;BYDAY=SA,SU",
};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandRecurrence — WEEKLY happy paths", () => {
  it("MO-FR を 1 週間 → 平日 5 件", () => {
    // 2026-04-06 (Mon) - 2026-04-12 (Sun)
    const out = expandRecurrence(WEEKDAYS, range("2026-04-06", "2026-04-12"));
    expect(dates(out)).toEqual([
      "2026-04-06",
      "2026-04-07",
      "2026-04-08",
      "2026-04-09",
      "2026-04-10",
    ]);
  });

  it("MO のみ を 1 ヶ月 → 月曜だけ", () => {
    const out = expandRecurrence(MO_ONLY, range("2026-04-01", "2026-04-30"));
    expect(dates(out)).toEqual([
      "2026-04-06",
      "2026-04-13",
      "2026-04-20",
      "2026-04-27",
    ]);
  });

  it("SA,SU を 1 週間 → 週末 2 件", () => {
    const out = expandRecurrence(WEEKEND, range("2026-04-06", "2026-04-12"));
    expect(dates(out)).toEqual(["2026-04-11", "2026-04-12"]);
  });

  it("BYDAY=MO,TU,WE,TH,FR,SA,SU → 毎日", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU",
    };
    const out = expandRecurrence(anchor, range("2026-04-06", "2026-04-08"));
    expect(out).toHaveLength(3);
  });

  it("ascending sort で返る", () => {
    const out = expandRecurrence(WEEKDAYS, range("2026-04-06", "2026-04-30"));
    const sorted = [...dates(out)].sort();
    expect(dates(out)).toEqual(sorted);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandRecurrence — validity window", () => {
  it("validFrom より前は除外", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-04-15", // この日以降
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    };
    const out = expandRecurrence(anchor, range("2026-04-01", "2026-04-30"));
    // 月曜は 4/6, 4/13, 4/20, 4/27。4/15 以降は 4/20, 4/27
    expect(dates(out)).toEqual(["2026-04-20", "2026-04-27"]);
  });

  it("validUntil 以降は除外", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-04-01",
      validUntil: "2026-04-15",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    };
    const out = expandRecurrence(anchor, range("2026-04-01", "2026-04-30"));
    expect(dates(out)).toEqual(["2026-04-06", "2026-04-13"]);
  });

  it("validUntil 省略 = 終了未定（range.end まで返る）", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    };
    const out = expandRecurrence(anchor, range("2026-04-01", "2026-05-04"));
    expect(out.length).toBeGreaterThanOrEqual(4);
  });

  it("range と validity の交差が空 → 空配列", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-05-01",
      validUntil: "2026-05-31",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    };
    const out = expandRecurrence(anchor, range("2026-04-01", "2026-04-30"));
    expect(out).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandRecurrence — exceptionDates", () => {
  it("該当日は除外される", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      exceptionDates: ["2026-04-13"], // 月曜
    };
    const out = expandRecurrence(anchor, range("2026-04-01", "2026-04-30"));
    expect(dates(out)).toEqual(["2026-04-06", "2026-04-20", "2026-04-27"]);
  });

  it("複数 exception", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
      exceptionDates: ["2026-04-06", "2026-04-08"],
    };
    const out = expandRecurrence(anchor, range("2026-04-06", "2026-04-10"));
    expect(dates(out)).toEqual(["2026-04-07", "2026-04-09", "2026-04-10"]);
  });

  it("無効な日付 string は無視（exception として効かない）", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      exceptionDates: ["bad-date"],
    };
    const out = expandRecurrence(anchor, range("2026-04-06", "2026-04-06"));
    expect(dates(out)).toEqual(["2026-04-06"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandRecurrence — invalid input → empty array (no throw)", () => {
  it("invalid RRULE format → []", () => {
    const out = expandRecurrence(
      { validFrom: "2026-04-01", recurrenceRule: "garbage" },
      range("2026-04-01", "2026-04-07")
    );
    expect(out).toEqual([]);
  });

  it("FREQ=DAILY は範囲外 → []", () => {
    const out = expandRecurrence(
      { validFrom: "2026-04-01", recurrenceRule: "FREQ=DAILY;BYDAY=MO" },
      range("2026-04-01", "2026-04-07")
    );
    expect(out).toEqual([]);
  });

  it("BYDAY 不在 → []", () => {
    const out = expandRecurrence(
      { validFrom: "2026-04-01", recurrenceRule: "FREQ=WEEKLY" },
      range("2026-04-01", "2026-04-07")
    );
    expect(out).toEqual([]);
  });

  it("BYDAY に未知コード → []", () => {
    const out = expandRecurrence(
      { validFrom: "2026-04-01", recurrenceRule: "FREQ=WEEKLY;BYDAY=XX" },
      range("2026-04-01", "2026-04-07")
    );
    expect(out).toEqual([]);
  });

  it("INTERVAL=2 は範囲外 → []", () => {
    const out = expandRecurrence(
      {
        validFrom: "2026-04-01",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;INTERVAL=2",
      },
      range("2026-04-01", "2026-04-30")
    );
    expect(out).toEqual([]);
  });

  it("COUNT は範囲外 → []", () => {
    const out = expandRecurrence(
      {
        validFrom: "2026-04-01",
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO;COUNT=5",
      },
      range("2026-04-01", "2026-04-30")
    );
    expect(out).toEqual([]);
  });

  it("invalid validFrom → []", () => {
    const out = expandRecurrence(
      { validFrom: "bad", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" },
      range("2026-04-01", "2026-04-30")
    );
    expect(out).toEqual([]);
  });

  it("invalid validUntil → []", () => {
    const out = expandRecurrence(
      {
        validFrom: "2026-04-01",
        validUntil: "2026-02-30", // 物理的に無効
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      },
      range("2026-04-01", "2026-04-30")
    );
    expect(out).toEqual([]);
  });

  it("range.start > range.end → []", () => {
    const out = expandRecurrence(WEEKDAYS, range("2026-04-30", "2026-04-01"));
    expect(out).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandOneOff", () => {
  it("範囲内 → 該当 date 1 件", () => {
    const out = expandOneOff({ date: "2026-05-10" }, range("2026-05-01", "2026-05-31"));
    expect(dates(out)).toEqual(["2026-05-10"]);
  });

  it("範囲外 → []", () => {
    const out = expandOneOff({ date: "2026-06-10" }, range("2026-05-01", "2026-05-31"));
    expect(out).toEqual([]);
  });

  it("invalid date → []", () => {
    const out = expandOneOff({ date: "bad" }, range("2026-05-01", "2026-05-31"));
    expect(out).toEqual([]);
  });

  it("範囲の端（start, end）は inclusive", () => {
    const out1 = expandOneOff({ date: "2026-05-01" }, range("2026-05-01", "2026-05-31"));
    expect(dates(out1)).toEqual(["2026-05-01"]);
    const out2 = expandOneOff({ date: "2026-05-31" }, range("2026-05-01", "2026-05-31"));
    expect(dates(out2)).toEqual(["2026-05-31"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("expandRecurrence — purity / determinism", () => {
  it("呼び出し 2 回で同じ結果", () => {
    const out1 = expandRecurrence(WEEKDAYS, range("2026-04-06", "2026-04-12"));
    const out2 = expandRecurrence(WEEKDAYS, range("2026-04-06", "2026-04-12"));
    expect(dates(out1)).toEqual(dates(out2));
  });

  it("入力を mutate しない", () => {
    const anchor: RecurringAnchorLike = {
      validFrom: "2026-04-01",
      recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      exceptionDates: ["2026-04-13"],
    };
    const snapshot = JSON.parse(JSON.stringify(anchor));
    expandRecurrence(anchor, range("2026-04-01", "2026-04-30"));
    expect(anchor).toEqual(snapshot);
  });
});
