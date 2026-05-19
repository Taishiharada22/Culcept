/**
 * domainToFormState — ExternalAnchor → AnchorFormState 変換テスト (W1-X2)
 *
 * EditAnchorModal が既存 anchor から form を初期化する pure 関数。
 */

import { describe, it, expect } from "vitest";

import type {
  OneOffExternalAnchor,
  RecurringExternalAnchor,
} from "@/lib/plan/external-anchor";
import { domainToFormState } from "@/lib/plan/domain-to-form-state";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function oneOff(
  overrides: Partial<OneOffExternalAnchor> = {}
): OneOffExternalAnchor {
  return {
    id: "a1",
    userId: "user-a",
    sourceId: "src-1",
    confirmedAt: "2026-05-18T00:00:00.000Z",
    title: "歯科予約",
    startTime: "14:30",
    rigidity: "hard",
    anchorKind: "one_off",
    date: "2026-05-25",
    ...overrides,
  };
}

function recurring(
  overrides: Partial<RecurringExternalAnchor> = {}
): RecurringExternalAnchor {
  return {
    id: "rec-1",
    userId: "user-a",
    sourceId: "src-2",
    confirmedAt: "2026-05-18T00:00:00.000Z",
    title: "週次ミーティング",
    startTime: "10:00",
    rigidity: "soft",
    anchorKind: "recurring",
    validFrom: "2026-05-18",
    recurrenceRule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
    ...overrides,
  };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("domainToFormState — one_off", () => {
  it("最小 anchor → form", () => {
    const f = domainToFormState(oneOff());
    expect(f.kind).toBe("one_off");
    expect(f.title).toBe("歯科予約");
    expect(f.startTime).toBe("14:30");
    expect(f.rigidity).toBe("hard");
    expect(f.date).toBe("2026-05-25");
    expect(f.endTime).toBe("");
    expect(f.locationCategory).toBe("");
    expect(f.locationText).toBe("");
    expect(f.sensitiveCategory).toBe("");
    expect(f.sourceType).toBe("manual"); // placeholder
  });

  it("optional field を含む anchor → form", () => {
    const f = domainToFormState(
      oneOff({
        endTime: "15:30",
        locationCategory: "public",
        locationText: "渋谷",
        sensitiveCategory: "medical",
      })
    );
    expect(f.endTime).toBe("15:30");
    expect(f.locationCategory).toBe("public");
    expect(f.locationText).toBe("渋谷");
    expect(f.sensitiveCategory).toBe("medical");
  });

  it("validFrom / selectedWeekdays は空（one_off）", () => {
    const f = domainToFormState(oneOff());
    expect(f.validFrom).toBe("");
    expect(f.validUntil).toBe("");
    expect(f.selectedWeekdays).toEqual([]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("domainToFormState — recurring", () => {
  it("BYDAY=MO,WE,FR → selectedWeekdays に逆引き", () => {
    const f = domainToFormState(recurring());
    expect(f.kind).toBe("recurring");
    expect(f.validFrom).toBe("2026-05-18");
    expect(f.selectedWeekdays).toEqual(["MO", "WE", "FR"]);
  });

  it("validUntil を含む anchor", () => {
    const f = domainToFormState(
      recurring({ validUntil: "2026-12-31" })
    );
    expect(f.validUntil).toBe("2026-12-31");
  });

  it("BYDAY 範囲外 RRULE → selectedWeekdays 空配列フォールバック", () => {
    const f = domainToFormState(
      recurring({ recurrenceRule: "FREQ=MONTHLY" })
    );
    expect(f.selectedWeekdays).toEqual([]);
  });

  it("date は空（recurring）", () => {
    const f = domainToFormState(recurring());
    expect(f.date).toBe("");
  });

  it("canonical sort: BYDAY=FR,MO,WE → MO,WE,FR", () => {
    const f = domainToFormState(
      recurring({ recurrenceRule: "FREQ=WEEKLY;BYDAY=FR,MO,WE" })
    );
    expect(f.selectedWeekdays).toEqual(["MO", "WE", "FR"]);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("domainToFormState — purity", () => {
  it("入力 anchor を mutate しない", () => {
    const a = oneOff();
    const snap = JSON.stringify(a);
    domainToFormState(a);
    expect(JSON.stringify(a)).toBe(snap);
  });

  it("同じ anchor で 2 回呼ぶと等価な結果", () => {
    const a = recurring();
    expect(domainToFormState(a)).toEqual(domainToFormState(a));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe("domainToFormState — exceptionDates (W1-X4)", () => {
  it("recurring + exceptionDates 既存 → form に反映", () => {
    const a = recurring({
      exceptionDates: ["2026-05-03", "2026-07-17"],
    });
    const f = domainToFormState(a);
    expect(f.exceptionDates).toEqual(["2026-05-03", "2026-07-17"]);
  });

  it("recurring + exceptionDates 未指定 → 空配列", () => {
    const a = recurring();
    const f = domainToFormState(a);
    expect(f.exceptionDates).toEqual([]);
  });

  it("canonical sort 維持: 順不同 input → ascending", () => {
    const a = recurring({
      exceptionDates: ["2026-07-17", "2026-05-03"],
    });
    const f = domainToFormState(a);
    expect(f.exceptionDates).toEqual(["2026-05-03", "2026-07-17"]);
  });

  it("one_off → exceptionDates は空（recurring 専用）", () => {
    const f = domainToFormState(oneOff());
    expect(f.exceptionDates).toEqual([]);
  });

  it("anchor.exceptionDates を mutate しない", () => {
    const dates = ["2026-07-17", "2026-05-03"];
    const a = recurring({ exceptionDates: dates });
    const snap = JSON.stringify(dates);
    domainToFormState(a);
    expect(JSON.stringify(dates)).toBe(snap); // 元 array 不変
  });
});
