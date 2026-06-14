/**
 * resolveTodayRecurring（RD1b 当日 recurring 解決・既存 expandRecurrence consume）
 * 正本: docs/reality-recurring-expansion-coverage-rd1b-0.md
 *
 * 核: 当日 occur する recurring を AS-IS で返す（materialize しない）。exceptionDates/validFrom/validUntil/不正 RRULE は
 *   既存 expandRecurrence に委譲。不正/展開不能は当日に入れない（過少 > 捏造）。2026-06-12 = Saturday(SA)。
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ExternalAnchor } from "@/lib/plan/external-anchor";
import { resolveTodayRecurring } from "@/lib/plan/recurringDayResolver";

const SUBJ = "2026-06-12"; // Friday (FR, getUTCDay()=5)

function rec(over: Partial<ExternalAnchor> & { id: string; recurrenceRule: string }): ExternalAnchor {
  return { anchorKind: "recurring", userId: "op", sourceId: "src", title: "定例", startTime: "10:00", endTime: "11:00", rigidity: "hard", validFrom: "2026-01-01", confirmedAt: "2026-06-01T00:00:00.000Z", ...over } as unknown as ExternalAnchor;
}

describe("RD1b resolver #1 当日 occur（BYDAY=FR）→ included（AS-IS・materialize しない）", () => {
  it("金曜の rule → 当日 included・anchorKind recurring のまま", () => {
    const r = resolveTodayRecurring([rec({ id: "r1", recurrenceRule: "FREQ=WEEKLY;BYDAY=FR" })], SUBJ);
    expect(r.included.map((a) => a.id)).toEqual(["r1"]);
    expect(r.included[0].anchorKind).toBe("recurring"); // materialize しない
    expect(r.excludedCount).toBe(0);
    expect(r.invalidCount).toBe(0);
  });
});

describe("RD1b resolver #2 当日でない valid（BYDAY=MO）→ excluded", () => {
  it("月曜の rule → 当日 occur せず・probe 窓に occur → excluded", () => {
    const r = resolveTodayRecurring([rec({ id: "r1", recurrenceRule: "FREQ=WEEKLY;BYDAY=MO" })], SUBJ);
    expect(r.included).toEqual([]);
    expect(r.excludedCount).toBe(1);
    expect(r.invalidCount).toBe(0);
  });
});

describe("RD1b resolver #3 不正/非WEEKLY RRULE → invalid（当日に入れない・捏造しない）", () => {
  it("非 WEEKLY（MONTHLY）→ invalid", () => {
    const r = resolveTodayRecurring([rec({ id: "r1", recurrenceRule: "FREQ=MONTHLY;BYMONTHDAY=12" })], SUBJ);
    expect(r.included).toEqual([]);
    expect(r.invalidCount).toBe(1);
  });
  it("garbage RRULE → invalid", () => {
    const r = resolveTodayRecurring([rec({ id: "r1", recurrenceRule: "NOT_A_RULE" })], SUBJ);
    expect(r.included).toEqual([]);
    expect(r.invalidCount).toBe(1);
  });
});

describe("RD1b resolver #4 exceptionDates 当日 → 当日に入れない", () => {
  it("BYDAY=FR,SA + exception 当日(金) → included でない（翌日 SA が窓に occur → excluded）", () => {
    const r = resolveTodayRecurring([rec({ id: "r1", recurrenceRule: "FREQ=WEEKLY;BYDAY=FR,SA", exceptionDates: [SUBJ] })], SUBJ);
    expect(r.included).toEqual([]); // 当日(金)は exception で除外
    expect(r.excludedCount).toBe(1); // 翌日 SA(06-13) に occur
  });
});

describe("RD1b resolver #5 validFrom 未来 → 当日に入れない", () => {
  it("validFrom 2030 → 当日 occur せず", () => {
    const r = resolveTodayRecurring([rec({ id: "r1", recurrenceRule: "FREQ=WEEKLY;BYDAY=FR", validFrom: "2030-01-01" })], SUBJ);
    expect(r.included).toEqual([]);
  });
});

describe("RD1b resolver #6 不正 subjectiveDate → 全 invalid（過少安全）", () => {
  it("subjectiveDate が不正 → included 空・全 invalid", () => {
    const r = resolveTodayRecurring([rec({ id: "r1", recurrenceRule: "FREQ=WEEKLY;BYDAY=SA" })], "2026-13-99");
    expect(r.included).toEqual([]);
    expect(r.invalidCount).toBe(1);
  });
});

describe("RD1b resolver #7 IO 不接触（source-scan・new Date(constant) は date util ゆえ許容）", () => {
  it("recurringDayResolver.ts に Date.now/Math.random/fetch/supabase/localStorage/.from(/geolocation なし", () => {
    const src = readFileSync(join(process.cwd(), "lib/plan/recurringDayResolver.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const bad of ["Date.now", "Math.random", "fetch(", "supabase", "localStorage", ".from(", "geolocation"]) {
      expect(code.includes(bad)).toBe(false);
    }
  });
});
