import { describe, it, expect } from "vitest";

import {
  type Weekday,
  type WeekdayTemplateInput,
  type WeekdayTemplateResult,
  buildCreateRecurringAnchorFromTemplate,
  buildWeekdayRRule,
  canonicalizeWeekdays,
  isWeekday,
  parseWeekdaysFromRRule,
} from "@/lib/plan/weekday-template";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeTemplate(
  overrides: Partial<WeekdayTemplateInput> = {}
): unknown {
  return {
    days: ["MO", "TU", "WE", "TH", "FR"] as Weekday[],
    title: "仕事",
    startTime: "09:00",
    endTime: "18:00",
    validFrom: "2026-04-01",
    rigidity: "hard",
    ...overrides,
  };
}

function expectValid(result: WeekdayTemplateResult) {
  expect(result.valid).toBe(true);
}

function expectInvalid(
  result: WeekdayTemplateResult,
  field: string,
  code?: string
) {
  expect(result.valid).toBe(false);
  if (!result.valid) {
    const err = result.errors.find((e) => e.field === field);
    expect(
      err,
      `expected error for field='${field}', got: ${JSON.stringify(result.errors)}`
    ).toBeDefined();
    if (code && err) {
      expect(err.code).toBe(code);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// isWeekday type guard
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isWeekday", () => {
  it.each(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])(
    "%s は Weekday",
    (v) => {
      expect(isWeekday(v)).toBe(true);
    }
  );

  it.each(["Mo", "mo", "MON", "M", "月", "0", "", null, undefined, 1, {}])(
    "%s は Weekday ではない",
    (v) => {
      expect(isWeekday(v)).toBe(false);
    }
  );
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// canonicalizeWeekdays
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("canonicalizeWeekdays", () => {
  it("月〜金 → そのまま canonical", () => {
    expect(canonicalizeWeekdays(["MO", "TU", "WE", "TH", "FR"])).toEqual([
      "MO",
      "TU",
      "WE",
      "TH",
      "FR",
    ]);
  });

  it("並び順がバラバラでも canonical（月曜始まり sort）", () => {
    expect(canonicalizeWeekdays(["FR", "MO", "WE"])).toEqual([
      "MO",
      "WE",
      "FR",
    ]);
  });

  it("重複曜日は除去", () => {
    expect(canonicalizeWeekdays(["MO", "MO", "TU"])).toEqual(["MO", "TU"]);
  });

  it("単一曜日", () => {
    expect(canonicalizeWeekdays(["MO"])).toEqual(["MO"]);
  });

  it("全曜日（SU 最後）", () => {
    expect(
      canonicalizeWeekdays(["SU", "SA", "FR", "TH", "WE", "TU", "MO"])
    ).toEqual(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
  });

  it("空配列は空配列", () => {
    expect(canonicalizeWeekdays([])).toEqual([]);
  });

  it("入力配列を mutate しない", () => {
    const input: Weekday[] = ["FR", "MO", "WE"];
    const snapshot = [...input];
    canonicalizeWeekdays(input);
    expect(input).toEqual(snapshot);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildWeekdayRRule
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildWeekdayRRule", () => {
  it("月〜金 → FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", () => {
    expect(buildWeekdayRRule(["MO", "TU", "WE", "TH", "FR"])).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
    );
  });

  it("単一曜日 → FREQ=WEEKLY;BYDAY=MO", () => {
    expect(buildWeekdayRRule(["MO"])).toBe("FREQ=WEEKLY;BYDAY=MO");
  });

  it("並び順 FR,MO,WE → FREQ=WEEKLY;BYDAY=MO,WE,FR", () => {
    expect(buildWeekdayRRule(["FR", "MO", "WE"])).toBe(
      "FREQ=WEEKLY;BYDAY=MO,WE,FR"
    );
  });

  it("重複曜日 MO,MO,TU → FREQ=WEEKLY;BYDAY=MO,TU", () => {
    expect(buildWeekdayRRule(["MO", "MO", "TU"])).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU"
    );
  });

  it("週末 → FREQ=WEEKLY;BYDAY=SA,SU", () => {
    expect(buildWeekdayRRule(["SU", "SA"])).toBe("FREQ=WEEKLY;BYDAY=SA,SU");
  });

  it("全曜日 → FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU", () => {
    expect(
      buildWeekdayRRule(["MO", "TU", "WE", "TH", "FR", "SA", "SU"])
    ).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU");
  });

  it("時刻 / UNTIL / COUNT / TZID は含めない", () => {
    const rrule = buildWeekdayRRule(["MO"]);
    expect(rrule).not.toContain("DTSTART");
    expect(rrule).not.toContain("UNTIL");
    expect(rrule).not.toContain("COUNT");
    expect(rrule).not.toContain("TZID");
    expect(rrule).not.toContain("INTERVAL");
    expect(rrule).not.toContain("BYHOUR");
    expect(rrule).not.toContain("BYMINUTE");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// parseWeekdaysFromRRule — RRULE 逆引き (W1-X2)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("parseWeekdaysFromRRule", () => {
  it("基本: FREQ=WEEKLY;BYDAY=MO,WE,FR → [MO, WE, FR]", () => {
    expect(parseWeekdaysFromRRule("FREQ=WEEKLY;BYDAY=MO,WE,FR")).toEqual([
      "MO",
      "WE",
      "FR",
    ]);
  });

  it("canonical sort: BYDAY=FR,MO,WE → [MO, WE, FR]", () => {
    expect(parseWeekdaysFromRRule("FREQ=WEEKLY;BYDAY=FR,MO,WE")).toEqual([
      "MO",
      "WE",
      "FR",
    ]);
  });

  it("単日: FREQ=WEEKLY;BYDAY=MO → [MO]", () => {
    expect(parseWeekdaysFromRRule("FREQ=WEEKLY;BYDAY=MO")).toEqual(["MO"]);
  });

  it("毎日: 7 曜日", () => {
    expect(
      parseWeekdaysFromRRule("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA,SU")
    ).toEqual(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
  });

  it("INTERVAL=1 は許可（既存仕様と整合）", () => {
    expect(parseWeekdaysFromRRule("FREQ=WEEKLY;BYDAY=MO;INTERVAL=1")).toEqual([
      "MO",
    ]);
  });

  it("INTERVAL=2 は範囲外 → null", () => {
    expect(parseWeekdaysFromRRule("FREQ=WEEKLY;BYDAY=MO;INTERVAL=2")).toBeNull();
  });

  it("FREQ=DAILY は範囲外 → null", () => {
    expect(parseWeekdaysFromRRule("FREQ=DAILY;BYDAY=MO")).toBeNull();
  });

  it("BYDAY 不在 → null", () => {
    expect(parseWeekdaysFromRRule("FREQ=WEEKLY")).toBeNull();
  });

  it("未知曜日コード → null", () => {
    expect(parseWeekdaysFromRRule("FREQ=WEEKLY;BYDAY=XX")).toBeNull();
  });

  it("COUNT/UNTIL/BYMONTHDAY 等の未対応 token → null", () => {
    expect(
      parseWeekdaysFromRRule("FREQ=WEEKLY;BYDAY=MO;COUNT=5")
    ).toBeNull();
  });

  it("空 string / 不正 format → null", () => {
    expect(parseWeekdaysFromRRule("")).toBeNull();
    expect(parseWeekdaysFromRRule("BYDAY=MO")).toBeNull(); // FREQ 不在
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildCreateRecurringAnchorFromTemplate — happy paths
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildCreateRecurringAnchorFromTemplate — happy paths", () => {
  it("月〜金 9:00-18:00 仕事 → recurring anchor", () => {
    const r = buildCreateRecurringAnchorFromTemplate(makeTemplate());
    expectValid(r);
    if (r.valid) {
      expect(r.input.anchorKind).toBe("recurring");
      expect(r.input.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR");
      expect(r.input.validFrom).toBe("2026-04-01");
      expect(r.input.startTime).toBe("09:00");
      expect(r.input.endTime).toBe("18:00");
      expect(r.input.rigidity).toBe("hard");
      expect(r.input.sourceType).toBe("template");
    }
  });

  it("並び順バラバラ FR,MO,WE → canonical な RRULE 出力", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ days: ["FR", "MO", "WE"] })
    );
    expectValid(r);
    if (r.valid) {
      expect(r.input.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,WE,FR");
    }
  });

  it("重複曜日 MO,MO,TU → 除去された RRULE", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ days: ["MO", "MO", "TU"] })
    );
    expectValid(r);
    if (r.valid) {
      expect(r.input.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO,TU");
    }
  });

  it("単一曜日（月曜のみ）", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ days: ["MO"] })
    );
    expectValid(r);
    if (r.valid) {
      expect(r.input.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO");
    }
  });

  it("翌日跨ぎ予定（22:00→02:00）は valid", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ startTime: "22:00", endTime: "02:00" })
    );
    expectValid(r);
  });

  it("validUntil あり", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ validUntil: "2026-09-30" })
    );
    expectValid(r);
    if (r.valid) {
      expect(r.input.validUntil).toBe("2026-09-30");
    }
  });

  it("exceptionDates あり", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ exceptionDates: ["2026-05-03", "2026-05-04"] })
    );
    expectValid(r);
    if (r.valid) {
      expect(r.input.exceptionDates).toEqual(["2026-05-03", "2026-05-04"]);
    }
  });

  it("location / sensitive オプション全部含む", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({
        locationText: "オフィス",
        locationCategory: "office",
        sensitiveCategory: "other",
      })
    );
    expectValid(r);
    if (r.valid) {
      expect(r.input.locationText).toBe("オフィス");
      expect(r.input.locationCategory).toBe("office");
      expect(r.input.sensitiveCategory).toBe("other");
    }
  });

  it("sourceType は内部で template 固定", () => {
    const r = buildCreateRecurringAnchorFromTemplate(makeTemplate());
    expectValid(r);
    if (r.valid) {
      expect(r.input.sourceType).toBe("template");
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// buildCreateRecurringAnchorFromTemplate — invalid cases
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("buildCreateRecurringAnchorFromTemplate — invalid cases", () => {
  it("days 空配列は required", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ days: [] })
    );
    expectInvalid(r, "days", "required");
  });

  it("days が array でない", () => {
    const r = buildCreateRecurringAnchorFromTemplate({
      ...(makeTemplate() as Record<string, unknown>),
      days: "MO,TU",
    });
    expectInvalid(r, "days", "invalid_format");
  });

  it("days に不正値（XX）", () => {
    const r = buildCreateRecurringAnchorFromTemplate({
      ...(makeTemplate() as Record<string, unknown>),
      days: ["MO", "XX", "WE"],
    });
    expectInvalid(r, "days[1]", "not_allowed_value");
  });

  it("days に小文字（mo）", () => {
    const r = buildCreateRecurringAnchorFromTemplate({
      ...(makeTemplate() as Record<string, unknown>),
      days: ["mo"],
    });
    expectInvalid(r, "days[0]", "not_allowed_value");
  });

  it("title 空", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ title: "" })
    );
    expectInvalid(r, "title", "required");
  });

  it("title 256 文字", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ title: "x".repeat(256) })
    );
    expectInvalid(r, "title", "too_long");
  });

  it("validFrom 不正 format", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ validFrom: "2026/04/01" })
    );
    expectInvalid(r, "validFrom", "required");
  });

  it("validFrom 欠落", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ validFrom: undefined as unknown as string })
    );
    expectInvalid(r, "validFrom", "required");
  });

  it("startTime 不正 format", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ startTime: "9:00" })
    );
    expectInvalid(r, "startTime", "invalid_format");
  });

  it("rigidity 不正", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ rigidity: "rigid" as unknown as "hard" })
    );
    expectInvalid(r, "rigidity", "not_allowed_value");
  });

  it("validUntil < validFrom は out_of_range", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({
        validFrom: "2026-09-01",
        validUntil: "2026-04-01",
      })
    );
    expectInvalid(r, "validUntil", "out_of_range");
  });

  it("exceptionDates に不正 format", () => {
    const r = buildCreateRecurringAnchorFromTemplate(
      makeTemplate({ exceptionDates: ["2026-05-03", "bad"] })
    );
    expectInvalid(r, "exceptionDates[1]", "invalid_format");
  });

  it("入力が null", () => {
    const r = buildCreateRecurringAnchorFromTemplate(null);
    expectInvalid(r, "(root)", "invalid_format");
  });

  it("入力が string", () => {
    const r = buildCreateRecurringAnchorFromTemplate("template-string");
    expectInvalid(r, "(root)", "invalid_format");
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 不変条件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("不変条件: throw しない / mutate しない / 純粋", () => {
  it("invalid 入力でも throw しない", () => {
    expect(() =>
      buildCreateRecurringAnchorFromTemplate({ junk: true })
    ).not.toThrow();
  });

  it("入力 object を mutate しない", () => {
    const input = makeTemplate();
    const snapshot = JSON.stringify(input);
    buildCreateRecurringAnchorFromTemplate(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });

  it("days 配列を mutate しない", () => {
    const days: Weekday[] = ["FR", "MO", "WE"];
    const snapshot = [...days];
    buildCreateRecurringAnchorFromTemplate(makeTemplate({ days }));
    expect(days).toEqual(snapshot);
  });

  it("同じ入力に対して同じ結果（純粋性）", () => {
    const input = makeTemplate();
    const r1 = buildCreateRecurringAnchorFromTemplate(input);
    const r2 = buildCreateRecurringAnchorFromTemplate(input);
    expect(r1).toEqual(r2);
  });
});
