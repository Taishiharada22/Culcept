import { describe, it, expect } from "vitest";

import {
  type AnchorInputValidationResult,
  type CreateOneOffAnchorInput,
  type CreateRecurringAnchorInput,
  isValidDateString,
  isValidTimeString,
  validateCreateExternalAnchorInput,
} from "@/lib/plan/external-anchor-input";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Helpers
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function makeOneOff(
  overrides: Partial<CreateOneOffAnchorInput> = {}
): unknown {
  return {
    anchorKind: "one_off",
    title: "歯科予約",
    date: "2026-05-10",
    startTime: "14:30",
    rigidity: "hard",
    sourceType: "manual",
    ...overrides,
  };
}

function makeRecurring(
  overrides: Partial<CreateRecurringAnchorInput> = {}
): unknown {
  return {
    anchorKind: "recurring",
    title: "週次ミーティング",
    validFrom: "2026-04-01",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
    startTime: "10:00",
    rigidity: "soft",
    sourceType: "template",
    ...overrides,
  };
}

function expectValid(result: AnchorInputValidationResult) {
  expect(result.valid).toBe(true);
}

function expectInvalid(
  result: AnchorInputValidationResult,
  field: string,
  code?: string
) {
  expect(result.valid).toBe(false);
  if (!result.valid) {
    const err = result.errors.find((e) => e.field === field);
    expect(err, `expected error for field='${field}', got: ${JSON.stringify(result.errors)}`).toBeDefined();
    if (code && err) {
      expect(err.code).toBe(code);
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Pure helper tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("isValidTimeString", () => {
  it.each(["00:00", "09:30", "23:59", "12:00:00", "12:00:59"])(
    "%s は valid",
    (s) => {
      expect(isValidTimeString(s)).toBe(true);
    }
  );

  it.each(["24:00", "9:30", "12:60", "12:00:60", "abc", "", "12:00:"])(
    "%s は invalid",
    (s) => {
      expect(isValidTimeString(s)).toBe(false);
    }
  );
});

describe("isValidDateString", () => {
  it.each(["2026-01-01", "2026-04-30", "2026-12-31", "2024-02-29"])(
    "%s は valid",
    (s) => {
      expect(isValidDateString(s)).toBe(true);
    }
  );

  it.each([
    "2026-02-30", // 存在しない日付
    "2026-13-01", // 不正月
    "2026-00-15", // 不正月
    "26-04-30", // 短縮形
    "2026/04/30", // slash
    "2026-04-31", // 4 月 31 日なし
    "abc",
    "",
  ])("%s は invalid", (s) => {
    expect(isValidDateString(s)).toBe(false);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Main validation tests
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("validateCreateExternalAnchorInput", () => {
  // ── Top-level type ──

  describe("top-level type", () => {
    it("null は invalid_format", () => {
      const r = validateCreateExternalAnchorInput(null);
      expectInvalid(r, "(root)", "invalid_format");
    });

    it("string は invalid_format", () => {
      const r = validateCreateExternalAnchorInput("foo");
      expectInvalid(r, "(root)", "invalid_format");
    });

    it("undefined は invalid_format", () => {
      const r = validateCreateExternalAnchorInput(undefined);
      expectInvalid(r, "(root)", "invalid_format");
    });
  });

  // ── anchorKind ──

  describe("anchorKind discriminator", () => {
    it("anchorKind 欠落は required", () => {
      const r = validateCreateExternalAnchorInput({ title: "x" });
      expectInvalid(r, "anchorKind", "required");
    });

    it("anchorKind が不正値は required", () => {
      const r = validateCreateExternalAnchorInput({ anchorKind: "invalid" });
      expectInvalid(r, "anchorKind", "required");
    });
  });

  // ── Happy paths ──

  describe("valid inputs", () => {
    it("one_off minimal は valid", () => {
      const r = validateCreateExternalAnchorInput(makeOneOff());
      expectValid(r);
    });

    it("one_off full は valid", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({
          endTime: "16:00",
          locationText: "甲府駅近く",
          locationCategory: "office",
          sensitiveCategory: "medical",
        })
      );
      expectValid(r);
    });

    it("recurring minimal は valid", () => {
      const r = validateCreateExternalAnchorInput(makeRecurring());
      expectValid(r);
    });

    it("recurring full は valid", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({
          validUntil: "2026-09-30",
          exceptionDates: ["2026-05-03", "2026-05-04"],
          endTime: "11:00",
          locationCategory: "school",
        })
      );
      expectValid(r);
    });

    it("翌日跨ぎ予定（endTime < startTime）も valid", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ startTime: "22:00", endTime: "02:00" })
      );
      expectValid(r);
    });
  });

  // ── Common field errors ──

  describe("common field errors", () => {
    it("title 空は required", () => {
      const r = validateCreateExternalAnchorInput(makeOneOff({ title: "" }));
      expectInvalid(r, "title", "required");
    });

    it("title 256 文字は too_long", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ title: "x".repeat(256) })
      );
      expectInvalid(r, "title", "too_long");
    });

    it("title 255 文字は valid", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ title: "x".repeat(255) })
      );
      expectValid(r);
    });

    it("rigidity 不正値は not_allowed_value", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ rigidity: "rigid" as unknown as "hard" })
      );
      expectInvalid(r, "rigidity", "not_allowed_value");
    });

    it("sourceType='pdf' は W1-4-pre 範囲外で not_allowed_value", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ sourceType: "pdf" as unknown as "manual" })
      );
      expectInvalid(r, "sourceType", "not_allowed_value");
    });

    it("startTime format 不正は invalid_format", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ startTime: "9:30" })
      );
      expectInvalid(r, "startTime", "invalid_format");
    });

    it("endTime format 不正は invalid_format", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ endTime: "25:00" })
      );
      expectInvalid(r, "endTime", "invalid_format");
    });

    it("locationCategory 不正値は not_allowed_value", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ locationCategory: "moon" as unknown as "home" })
      );
      expectInvalid(r, "locationCategory", "not_allowed_value");
    });

    it("sensitiveCategory 不正値は not_allowed_value", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ sensitiveCategory: "secret" as unknown as "medical" })
      );
      expectInvalid(r, "sensitiveCategory", "not_allowed_value");
    });
  });

  // ── one_off specific ──

  describe("one_off specific", () => {
    it("date 欠落は required", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ date: undefined as unknown as string })
      );
      expectInvalid(r, "date", "required");
    });

    it("date 不正 format は required (Date round-trip 失敗)", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ date: "2026/04/30" })
      );
      expectInvalid(r, "date", "required");
    });

    it("date が存在しない日付（2026-02-30）は required", () => {
      const r = validateCreateExternalAnchorInput(
        makeOneOff({ date: "2026-02-30" })
      );
      expectInvalid(r, "date", "required");
    });

    it("validFrom を含めると logical_conflict", () => {
      const r = validateCreateExternalAnchorInput({
        ...(makeOneOff() as Record<string, unknown>),
        validFrom: "2026-04-01",
      });
      expectInvalid(r, "validFrom", "logical_conflict");
    });

    it("recurrenceRule を含めると logical_conflict", () => {
      const r = validateCreateExternalAnchorInput({
        ...(makeOneOff() as Record<string, unknown>),
        recurrenceRule: "FREQ=WEEKLY;BYDAY=MO",
      });
      expectInvalid(r, "recurrenceRule", "logical_conflict");
    });

    it("exceptionDates を含めると logical_conflict", () => {
      const r = validateCreateExternalAnchorInput({
        ...(makeOneOff() as Record<string, unknown>),
        exceptionDates: ["2026-05-03"],
      });
      expectInvalid(r, "exceptionDates", "logical_conflict");
    });
  });

  // ── recurring specific ──

  describe("recurring specific", () => {
    it("validFrom 欠落は required", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({ validFrom: undefined as unknown as string })
      );
      expectInvalid(r, "validFrom", "required");
    });

    it("recurrenceRule 欠落は required", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({ recurrenceRule: undefined as unknown as string })
      );
      expectInvalid(r, "recurrenceRule", "required");
    });

    it("recurrenceRule 501 文字は too_long", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({
          recurrenceRule: "FREQ=WEEKLY;BYDAY=" + "X".repeat(490),
        })
      );
      expectInvalid(r, "recurrenceRule", "too_long");
    });

    it("date を含めると logical_conflict", () => {
      const r = validateCreateExternalAnchorInput({
        ...(makeRecurring() as Record<string, unknown>),
        date: "2026-04-30",
      });
      expectInvalid(r, "date", "logical_conflict");
    });

    it("validUntil 不正 format は invalid_format", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({ validUntil: "2026/09/30" })
      );
      expectInvalid(r, "validUntil", "invalid_format");
    });

    it("validUntil < validFrom は out_of_range", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({
          validFrom: "2026-09-01",
          validUntil: "2026-04-01",
        })
      );
      expectInvalid(r, "validUntil", "out_of_range");
    });

    it("validUntil === validFrom は valid", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({
          validFrom: "2026-04-01",
          validUntil: "2026-04-01",
        })
      );
      expectValid(r);
    });

    it("exceptionDates が array でないと invalid_format", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({
          exceptionDates: "2026-05-03" as unknown as string[],
        })
      );
      expectInvalid(r, "exceptionDates", "invalid_format");
    });

    it("exceptionDates の要素が不正 format は invalid_format", () => {
      const r = validateCreateExternalAnchorInput(
        makeRecurring({ exceptionDates: ["2026-05-03", "bad"] })
      );
      expectInvalid(r, "exceptionDates[1]", "invalid_format");
    });
  });

  // ── 不変条件 ──

  describe("不変条件: throw しない / mutate しない / 副作用なし", () => {
    it("invalid 入力でも throw しない", () => {
      expect(() =>
        validateCreateExternalAnchorInput({ junk: true })
      ).not.toThrow();
    });

    it("入力 object を mutate しない", () => {
      const input = makeOneOff();
      const snapshot = JSON.stringify(input);
      validateCreateExternalAnchorInput(input);
      expect(JSON.stringify(input)).toBe(snapshot);
    });

    it("同じ入力に対して同じ結果（純粋性）", () => {
      const input = makeOneOff();
      const r1 = validateCreateExternalAnchorInput(input);
      const r2 = validateCreateExternalAnchorInput(input);
      expect(r1).toEqual(r2);
    });
  });
});
